import { NextFunction, Request, Response } from "express";
import { obterAuthAdmin } from "../services/firebaseAdmin";

export type FormularioAdminIdentity = {
  uid: string;
  email?: string;
};

const getAllowedEmails = (rawValue = process.env.FORMULARIOS_ADMIN_EMAILS ?? "") =>
  new Set(
    rawValue
      .split(",")
      .map((email) => email.trim().toLocaleLowerCase("en-US"))
      .filter(Boolean),
  );

const isExplicitAnyAuthenticatedEnabled = (value: string | undefined) =>
  value?.trim().toLocaleLowerCase("en-US") === "true";

const isDevelopmentOrTest = (nodeEnv: string | undefined) =>
  nodeEnv === "development" || nodeEnv === "test";

export const politicaAdminFormularioConfigurada = (
  rawAllowedEmails = process.env.FORMULARIOS_ADMIN_EMAILS ?? "",
  options: { nodeEnv?: string; allowAnyAuthenticated?: string } = {
    nodeEnv: process.env.NODE_ENV,
    allowAnyAuthenticated: process.env.FORMULARIOS_ALLOW_ANY_AUTHENTICATED_ADMIN,
  },
) =>
  getAllowedEmails(rawAllowedEmails).size > 0 ||
  (isDevelopmentOrTest(options.nodeEnv) &&
    isExplicitAnyAuthenticatedEnabled(options.allowAnyAuthenticated));

export const usuarioPodeAdministrarFormulario = (
  claims: { admin?: unknown; email?: unknown; email_verified?: unknown },
  rawAllowedEmails = process.env.FORMULARIOS_ADMIN_EMAILS ?? "",
  options: { nodeEnv?: string; allowAnyAuthenticated?: string } = {
    nodeEnv: process.env.NODE_ENV,
    allowAnyAuthenticated: process.env.FORMULARIOS_ALLOW_ANY_AUTHENTICATED_ADMIN,
  },
) => {
  const email = typeof claims.email === "string" ? claims.email.trim() : "";
  const normalizedEmail = email.toLocaleLowerCase("en-US");
  const allowedEmails = getAllowedEmails(rawAllowedEmails);
  const compatibilityMode =
    allowedEmails.size === 0 &&
    isDevelopmentOrTest(options.nodeEnv) &&
    isExplicitAnyAuthenticatedEnabled(options.allowAnyAuthenticated);
  return (
    claims.admin === true ||
    compatibilityMode ||
    (claims.email_verified === true &&
      normalizedEmail !== "" &&
      allowedEmails.has(normalizedEmail))
  );
};

const bearerTokenFrom = (req: Request) => {
  const authorization = req.get("Authorization")?.trim() ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  return match?.[1]?.trim() ?? "";
};

export const exigirAdminFormulario = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const auth = obterAuthAdmin();
  if (!auth) {
    res.status(503).json({
      error: "O servico administrativo de formularios esta temporariamente indisponivel.",
      code: "FIREBASE_ADMIN_UNAVAILABLE",
    });
    return;
  }

  const token = bearerTokenFrom(req);
  if (!token) {
    res.status(401).json({
      error: "Autenticacao necessaria.",
      code: "AUTH_REQUIRED",
    });
    return;
  }

  try {
    const decoded = await auth.verifyIdToken(token);
    const email = typeof decoded.email === "string" ? decoded.email.trim() : "";

    if (!politicaAdminFormularioConfigurada() && decoded.admin !== true) {
      res.status(503).json({
        error: "A politica de acesso administrativo nao esta configurada.",
        code: "ADMIN_AUTH_POLICY_NOT_CONFIGURED",
      });
      return;
    }

    const allowed = usuarioPodeAdministrarFormulario(decoded);

    if (!allowed) {
      res.status(403).json({
        error: "Usuario sem permissao para gerenciar formularios.",
        code: "ADMIN_PERMISSION_REQUIRED",
      });
      return;
    }

    res.locals.formularioAdmin = {
      uid: decoded.uid,
      ...(email ? { email } : {}),
    } satisfies FormularioAdminIdentity;
    next();
  } catch {
    res.status(401).json({
      error: "Sessao invalida ou expirada.",
      code: "INVALID_AUTH_TOKEN",
    });
  }
};

export const obterIdentidadeAdminFormulario = (res: Response): FormularioAdminIdentity => {
  const identity = res.locals.formularioAdmin as FormularioAdminIdentity | undefined;
  if (!identity?.uid) {
    throw new Error("Identidade administrativa ausente apos autenticacao.");
  }
  return identity;
};
