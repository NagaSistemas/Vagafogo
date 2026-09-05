import { Response, Router } from "express";
import {
  exigirAdminFormulario,
  obterIdentidadeAdminFormulario,
} from "../middleware/formulariosAdminAuth";
import {
  FormularioAdminServiceError,
  atualizarFormularioAdmin,
  atualizarStatusFormularioAdmin,
  criarFormularioAdmin,
  excluirFormularioAdmin,
  excluirRespostaFormularioAdmin,
  listarFormulariosAdmin,
  listarRespostasFormularioAdmin,
} from "../services/formulariosAdmin";
import { FormularioValidationError } from "../validation/formularios";
import {
  normalizarExpectedRevision,
} from "../validation/formulariosAdmin";
import { normalizarChaveIdempotencia } from "../validation/formularios";

const router = Router();

const sendError = (res: Response, error: unknown) => {
  if (
    error instanceof FormularioValidationError ||
    error instanceof FormularioAdminServiceError
  ) {
    if (error.status >= 500) {
      console.error(`[formularios-admin] ${error.code}:`, error.message);
    }
    res.status(error.status).json({
      error: error.message,
      code: error.code,
      ...(error instanceof FormularioValidationError &&
      error.details &&
      error.status < 500
        ? { details: error.details }
        : {}),
      ...(error instanceof FormularioAdminServiceError && error.extra
        ? error.extra
        : {}),
    });
    return;
  }

  console.error("[formularios-admin] Erro inesperado:", error);
  res.status(500).json({
    error: "Nao foi possivel processar a solicitacao.",
    code: "INTERNAL_ERROR",
  });
};

const bodyRecord = (body: unknown): Record<string, unknown> =>
  typeof body === "object" && body !== null && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : {};

const sendForm = (res: Response, form: Record<string, unknown>, status = 200) => {
  if (typeof form.revision === "number") {
    res.setHeader("ETag", `"${form.revision}"`);
  }
  res.setHeader("Cache-Control", "no-store");
  res.status(status).json(form);
};

router.use(exigirAdminFormulario);

router.get("/", async (_req, res) => {
  try {
    const forms = await listarFormulariosAdmin();
    res.setHeader("Cache-Control", "no-store");
    res.json(forms);
  } catch (error) {
    sendError(res, error);
  }
});

router.post("/", async (req, res) => {
  try {
    const identity = obterIdentidadeAdminFormulario(res);
    const idempotencyKey = normalizarChaveIdempotencia(req.get("Idempotency-Key"));
    const result = await criarFormularioAdmin(req.body, identity, idempotencyKey);
    if (result.duplicate) res.setHeader("Idempotent-Replayed", "true");
    sendForm(res, result.form, result.duplicate ? 200 : 201);
  } catch (error) {
    sendError(res, error);
  }
});

router.put("/:id", async (req, res) => {
  try {
    const identity = obterIdentidadeAdminFormulario(res);
    const expectedRevision = normalizarExpectedRevision(
      req.get("If-Match"),
      bodyRecord(req.body).expectedRevision,
    );
    const form = await atualizarFormularioAdmin(
      req.params.id,
      req.body,
      identity,
      expectedRevision,
    );
    sendForm(res, form);
  } catch (error) {
    sendError(res, error);
  }
});

router.patch("/:id/status", async (req, res) => {
  try {
    const identity = obterIdentidadeAdminFormulario(res);
    const body = bodyRecord(req.body);
    const expectedRevision = normalizarExpectedRevision(
      req.get("If-Match"),
      body.expectedRevision,
    );
    const form = await atualizarStatusFormularioAdmin(
      req.params.id,
      body.status,
      identity,
      expectedRevision,
    );
    sendForm(res, form);
  } catch (error) {
    sendError(res, error);
  }
});

router.get("/:id/respostas", async (req, res) => {
  try {
    const responses = await listarRespostasFormularioAdmin(
      req.params.id,
      req.query.limit,
      req.query.cursor,
    );
    res.setHeader("Cache-Control", "no-store");
    res.json(responses);
  } catch (error) {
    sendError(res, error);
  }
});

router.delete("/:id/respostas/:responseId", async (req, res) => {
  try {
    const result = await excluirRespostaFormularioAdmin(
      req.params.id,
      req.params.responseId,
    );
    res.json(result);
  } catch (error) {
    sendError(res, error);
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const identity = obterIdentidadeAdminFormulario(res);
    const expectedRevision = normalizarExpectedRevision(
      req.get("If-Match"),
      req.query.expectedRevision,
    );
    const result = await excluirFormularioAdmin(
      req.params.id,
      expectedRevision,
      identity,
    );
    res.json(result);
  } catch (error) {
    sendError(res, error);
  }
});

export default router;
