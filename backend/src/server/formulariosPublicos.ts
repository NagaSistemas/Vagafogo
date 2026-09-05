import { Request, Response, Router } from "express";
import qrcode from "qrcode";
import {
  limitarGeracaoQrFormulario,
  limitarSubmissoesFormulario,
} from "../middleware/formulariosRateLimit";
import {
  FormularioPublicoServiceError,
  garantirFormularioExisteParaQr,
  obterFormularioPublico,
  registrarRespostaFormulario,
} from "../services/formulariosPublicos";
import {
  FormularioValidationError,
  normalizarChaveIdempotencia,
} from "../validation/formularios";

const router = Router();

type KnownError = FormularioValidationError | FormularioPublicoServiceError;

const isKnownError = (error: unknown): error is KnownError =>
  error instanceof FormularioValidationError ||
  error instanceof FormularioPublicoServiceError;

const sendError = (res: Response, error: unknown) => {
  if (isKnownError(error)) {
    if (error.status >= 500) {
      console.error(`[formularios] ${error.code}:`, error.message);
    }
    res.status(error.status).json({
      error: error.message,
      code: error.code,
      ...(error instanceof FormularioPublicoServiceError && error.extra
        ? error.extra
        : {}),
      ...(error instanceof FormularioValidationError &&
      error.details &&
      error.status < 500
        ? { details: error.details }
        : {}),
    });
    return;
  }

  console.error("[formularios] Erro inesperado:", error);
  res.status(500).json({
    error: "Nao foi possivel processar a solicitacao.",
    code: "INTERNAL_ERROR",
  });
};

const parseUrl = (value: string, errorStatus = 400) => {
  try {
    const parsed = new URL(value);
    if (
      !["http:", "https:"].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password ||
      parsed.hash
    ) {
      throw new Error("invalid public URL");
    }
    return parsed;
  } catch {
    throw new FormularioValidationError(
      errorStatus === 503 ? "PUBLIC_FORM_BASE_URL_INVALID" : "INVALID_QR_URL",
      errorStatus === 503
        ? "A URL publica dos formularios nao esta configurada corretamente."
        : "A URL informada para o QR Code e invalida.",
      errorStatus,
    );
  }
};

const assertFormularioPath = (url: URL, publicId: string) => {
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(url.pathname).replace(/\/+$/, "");
  } catch {
    decodedPath = "";
  }
  const expectedPath = `/formulario/${publicId}`;
  if (decodedPath !== expectedPath || url.search) {
    throw new FormularioValidationError(
      "INVALID_QR_URL",
      "A URL do QR Code nao corresponde a este formulario.",
      400,
    );
  }
};

const isDevelopmentOrTest = (nodeEnv: string | undefined) =>
  nodeEnv?.trim().toLocaleLowerCase("en-US") === "development" ||
  nodeEnv?.trim().toLocaleLowerCase("en-US") === "test";

const isLoopbackHostname = (hostname: string) => {
  const normalized = hostname.toLocaleLowerCase("en-US").replace(/^\[|\]$/g, "");
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
};

export const resolverDestinoQr = (
  rawRequestedUrl: unknown,
  publicId: string,
  options: { configuredBase?: string; nodeEnv?: string } = {
    configuredBase: process.env.PUBLIC_FORM_BASE_URL,
    nodeEnv: process.env.NODE_ENV,
  },
) => {
  const configuredBase = options.configuredBase?.trim();
  const developmentOrTest = isDevelopmentOrTest(options.nodeEnv);
  if (rawRequestedUrl !== undefined && typeof rawRequestedUrl !== "string") {
    throw new FormularioValidationError(
      "INVALID_QR_URL",
      "A URL informada para o QR Code e invalida.",
      400,
    );
  }
  const requestedUrl = rawRequestedUrl?.trim() ?? "";

  if (configuredBase) {
    const configured = parseUrl(configuredBase, 503);
    if (
      configured.search ||
      configured.pathname.replace(/\/+$/, "") !== "" ||
      (configured.protocol !== "https:" && !developmentOrTest) ||
      (!developmentOrTest && isLoopbackHostname(configured.hostname))
    ) {
      throw new FormularioValidationError(
        configured.protocol !== "https:" && !developmentOrTest
          ? "PUBLIC_FORM_BASE_URL_HTTPS_REQUIRED"
          : "PUBLIC_FORM_BASE_URL_INVALID",
        configured.protocol !== "https:" && !developmentOrTest
          ? "PUBLIC_FORM_BASE_URL deve usar HTTPS neste ambiente."
          : "A URL publica dos formularios nao esta configurada corretamente.",
        503,
      );
    }
    if (requestedUrl) {
      if (requestedUrl.length > 2048) {
        throw new FormularioValidationError(
          "INVALID_QR_URL",
          "A URL informada para o QR Code e invalida.",
          400,
        );
      }
      const requested = parseUrl(requestedUrl);
      assertFormularioPath(requested, publicId);
      if (requested.origin !== configured.origin) {
        throw new FormularioValidationError(
          "QR_ORIGIN_MISMATCH",
          "A URL do QR Code deve usar a origem publica configurada.",
          400,
        );
      }
      return requested.toString();
    }

    configured.pathname = `/formulario/${encodeURIComponent(publicId)}`;
    configured.search = "";
    configured.hash = "";
    return configured.toString();
  }

  if (!developmentOrTest) {
    throw new FormularioValidationError(
      "PUBLIC_FORM_BASE_URL_REQUIRED",
      "PUBLIC_FORM_BASE_URL HTTPS deve ser configurada para gerar QR Codes.",
      503,
    );
  }

  if (!requestedUrl || requestedUrl.length > 2048) {
    throw new FormularioValidationError(
      "PUBLIC_FORM_URL_REQUIRED",
      "Informe a URL publica do formulario para gerar o QR Code.",
      400,
    );
  }

  const target = parseUrl(requestedUrl);
  assertFormularioPath(target, publicId);
  if (!isLoopbackHostname(target.hostname)) {
    throw new FormularioValidationError(
      "QR_ORIGIN_NOT_ALLOWED",
      "Sem PUBLIC_FORM_BASE_URL, o QR Code so pode apontar para localhost em desenvolvimento.",
      400,
    );
  }
  return target.toString();
};

const resolveQrTarget = (req: Request, publicId: string) =>
  resolverDestinoQr(req.query.url, publicId);

const wantsDownload = (req: Request) =>
  req.query.download === "1" || req.query.download === "true";

router.get("/:publicId/qrcode", limitarGeracaoQrFormulario, async (req, res) => {
  try {
    const publicId = await garantirFormularioExisteParaQr(req.params.publicId);
    const target = resolveQrTarget(req, publicId);
    const format = typeof req.query.format === "string" ? req.query.format.toLowerCase() : "png";

    if (format !== "png" && format !== "svg") {
      throw new FormularioValidationError(
        "INVALID_QR_FORMAT",
        "Use format=png ou format=svg.",
        400,
      );
    }

    const extension = format;
    const disposition = wantsDownload(req) ? "attachment" : "inline";
    res.setHeader(
      "Content-Disposition",
      `${disposition}; filename="formulario-${publicId}.${extension}"`,
    );
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader("X-Content-Type-Options", "nosniff");

    if (format === "svg") {
      const svg = await qrcode.toString(target, {
        type: "svg",
        errorCorrectionLevel: "M",
        margin: 4,
        width: 1024,
        color: { dark: "#15261d", light: "#ffffff" },
      });
      res.type("image/svg+xml").send(svg);
      return;
    }

    const png = await qrcode.toBuffer(target, {
      type: "png",
      errorCorrectionLevel: "M",
      margin: 4,
      width: 1024,
      color: { dark: "#15261d", light: "#ffffff" },
    });
    res.type("image/png").send(png);
  } catch (error) {
    sendError(res, error);
  }
});

router.get("/:publicId", async (req, res) => {
  try {
    const formulario = await obterFormularioPublico(req.params.publicId);
    res.setHeader("Cache-Control", "no-store");
    res.json(formulario);
  } catch (error) {
    sendError(res, error);
  }
});

router.post("/:publicId/respostas", limitarSubmissoesFormulario, async (req, res) => {
  try {
    const body =
      typeof req.body === "object" && req.body !== null && !Array.isArray(req.body)
        ? (req.body as Record<string, unknown>)
        : {};

    // Campo invisivel no formulario publico. Bots genericos costumam preenche-lo.
    if (typeof body._website === "string" && body._website.trim()) {
      await garantirFormularioExisteParaQr(req.params.publicId);
      res.status(202).json({
        success: true,
        responseId: null,
        duplicate: false,
        confirmationTitle: "Resposta enviada!",
        confirmationMessage: "Obrigado por responder.",
      });
      return;
    }

    const headerKey = req.get("Idempotency-Key");
    const idempotencyKey = normalizarChaveIdempotencia(headerKey ?? body.idempotencyKey);
    const result = await registrarRespostaFormulario(
      req.params.publicId,
      body,
      idempotencyKey,
    );

    res.status(result.duplicate ? 200 : 201).json({
      success: true,
      ...result,
    });
  } catch (error) {
    sendError(res, error);
  }
});

export default router;
