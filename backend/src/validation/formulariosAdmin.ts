import { FormStatus, FormularioPublico } from "../types/formularios";
import {
  FormularioValidationError,
  normalizarFormularioPublico,
  normalizarIdentificadorPublico,
} from "./formularios";

const ADMIN_STATUSES = new Set<FormStatus>(["draft", "published", "closed"]);
const DOCUMENT_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const DEFAULT_RESPONSES_PAGE_LIMIT = 50;
const MAX_RESPONSES_PAGE_LIMIT = 200;
const MAX_RESPONSES_CURSOR_LENGTH = 768;
const MIN_FIRESTORE_TIMESTAMP_SECONDS = -62_135_596_800;
const MAX_FIRESTORE_TIMESTAMP_SECONDS = 253_402_300_799;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export type FormularioRespostasCursor = {
  formId: string;
  responseId: string;
  seconds: number;
  nanoseconds: number;
};

const throwInvalidResponsesCursor = (): never => {
  throw new FormularioValidationError(
    "INVALID_RESPONSES_CURSOR",
    "O cursor de paginacao das respostas e invalido.",
    400,
  );
};

const isValidDocumentId = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length >= 1 &&
  value.length <= 128 &&
  DOCUMENT_ID_PATTERN.test(value);

const validateCursorPosition = (
  value: unknown,
  expectedFormId: string,
): FormularioRespostasCursor => {
  if (!isRecord(value)) return throwInvalidResponsesCursor();
  const keys = Object.keys(value).sort();
  if (keys.join(",") !== "f,i,n,s,v" || value.v !== 1) {
    return throwInvalidResponsesCursor();
  }
  if (
    !isValidDocumentId(value.f) ||
    value.f !== expectedFormId ||
    !isValidDocumentId(value.i) ||
    typeof value.s !== "number" ||
    !Number.isSafeInteger(value.s) ||
    value.s < MIN_FIRESTORE_TIMESTAMP_SECONDS ||
    value.s > MAX_FIRESTORE_TIMESTAMP_SECONDS ||
    typeof value.n !== "number" ||
    !Number.isInteger(value.n) ||
    value.n < 0 ||
    value.n > 999_999_999
  ) {
    return throwInvalidResponsesCursor();
  }
  return {
    formId: value.f,
    responseId: value.i,
    seconds: value.s,
    nanoseconds: value.n,
  };
};

export const normalizarLimitePaginaRespostas = (value: unknown) => {
  if (value === undefined || value === null) return DEFAULT_RESPONSES_PAGE_LIMIT;
  const normalized = typeof value === "string" ? value.trim() : value;
  const parsed =
    typeof normalized === "number"
      ? normalized
      : typeof normalized === "string" && /^[0-9]+$/.test(normalized)
        ? Number(normalized)
        : Number.NaN;
  if (
    !Number.isInteger(parsed) ||
    parsed < 1 ||
    parsed > MAX_RESPONSES_PAGE_LIMIT
  ) {
    throw new FormularioValidationError(
      "INVALID_RESPONSES_LIMIT",
      `O limite deve ser um inteiro entre 1 e ${MAX_RESPONSES_PAGE_LIMIT}.`,
      400,
    );
  }
  return parsed;
};

export const codificarCursorRespostas = (
  position: FormularioRespostasCursor,
) => {
  const validated = validateCursorPosition(
    {
      v: 1,
      f: position.formId,
      i: position.responseId,
      s: position.seconds,
      n: position.nanoseconds,
    },
    position.formId,
  );
  return Buffer.from(
    JSON.stringify({
      v: 1,
      f: validated.formId,
      i: validated.responseId,
      s: validated.seconds,
      n: validated.nanoseconds,
    }),
    "utf8",
  ).toString("base64url");
};

export const normalizarCursorRespostas = (
  value: unknown,
  expectedFormId: string,
): FormularioRespostasCursor | undefined => {
  if (value === undefined || value === null) return undefined;
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > MAX_RESPONSES_CURSOR_LENGTH ||
    !/^[A-Za-z0-9_-]+$/.test(value)
  ) {
    return throwInvalidResponsesCursor();
  }

  try {
    const decoded = Buffer.from(value, "base64url");
    if (decoded.length < 1 || decoded.toString("base64url") !== value) {
      return throwInvalidResponsesCursor();
    }
    const text = decoded.toString("utf8");
    if (Buffer.from(text, "utf8").toString("base64url") !== value) {
      return throwInvalidResponsesCursor();
    }
    const validated = validateCursorPosition(JSON.parse(text), expectedFormId);
    if (codificarCursorRespostas(validated) !== value) {
      return throwInvalidResponsesCursor();
    }
    return validated;
  } catch (error) {
    if (error instanceof FormularioValidationError) throw error;
    return throwInvalidResponsesCursor();
  }
};

export const normalizarIdDocumentoFormulario = (value: unknown) => {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 128 ||
    !DOCUMENT_ID_PATTERN.test(value)
  ) {
    throw new FormularioValidationError(
      "FORM_NOT_FOUND",
      "Formulario nao encontrado.",
      404,
    );
  }
  return value;
};

export const normalizarStatusFormulario = (value: unknown): FormStatus => {
  if (typeof value !== "string" || !ADMIN_STATUSES.has(value as FormStatus)) {
    throw new FormularioValidationError(
      "INVALID_FORM_STATUS",
      "Use status draft, published ou closed.",
      422,
    );
  }
  return value as FormStatus;
};

export const normalizarPublicIdAdministravel = (value: unknown) => {
  try {
    return normalizarIdentificadorPublico(value);
  } catch {
    throw new FormularioValidationError(
      "INVALID_PUBLIC_ID",
      "O identificador publico do formulario e invalido.",
      422,
    );
  }
};

export const garantirPublicIdImutavel = (payload: unknown, currentPublicId: string) => {
  if (!isRecord(payload) || !Object.prototype.hasOwnProperty.call(payload, "publicId")) {
    return;
  }
  if (payload.publicId !== currentPublicId) {
    throw new FormularioValidationError(
      "IMMUTABLE_PUBLIC_ID",
      "O publicId de um formulario existente nao pode ser alterado.",
      409,
    );
  }
};

export const normalizarFormularioAdminPayload = (
  payload: unknown,
  publicId: string,
): FormularioPublico => {
  if (!isRecord(payload)) {
    throw new FormularioValidationError(
      "INVALID_PAYLOAD",
      "Envie os dados completos do formulario.",
      400,
    );
  }

  const status = normalizarStatusFormulario(payload.status);
  try {
    // schemaVersion e revision sao controlados exclusivamente pelo servidor.
    return normalizarFormularioPublico(
      { ...payload, publicId, status, schemaVersion: 1 },
      publicId,
    );
  } catch (error) {
    if (
      error instanceof FormularioValidationError &&
      error.code === "FORM_CONFIGURATION_INVALID"
    ) {
      throw new FormularioValidationError(
        "INVALID_FORM_SCHEMA",
        error.message,
        422,
        error.details,
      );
    }
    throw error;
  }
};

const parseRevision = (value: unknown) => {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return Number.NaN;
  const normalized = value.trim().replace(/^W\//i, "").replace(/^"|"$/g, "");
  return Number(normalized);
};

export const normalizarExpectedRevision = (
  headerValue: unknown,
  bodyValue: unknown,
) => {
  if (
    (headerValue === undefined || headerValue === null || headerValue === "") &&
    (bodyValue === undefined || bodyValue === null || bodyValue === "")
  ) {
    throw new FormularioValidationError(
      "FORM_REVISION_REQUIRED",
      "Informe a revisao atual no header If-Match ou em expectedRevision.",
      428,
    );
  }

  const headerRevision =
    headerValue === undefined || headerValue === null || headerValue === ""
      ? undefined
      : parseRevision(headerValue);
  const bodyRevision =
    bodyValue === undefined || bodyValue === null || bodyValue === ""
      ? undefined
      : parseRevision(bodyValue);

  for (const revision of [headerRevision, bodyRevision]) {
    if (
      revision !== undefined &&
      (!Number.isInteger(revision) || revision < 1 || revision > Number.MAX_SAFE_INTEGER)
    ) {
      throw new FormularioValidationError(
        "INVALID_FORM_REVISION",
        "A revisao informada e invalida.",
        422,
      );
    }
  }

  if (
    headerRevision !== undefined &&
    bodyRevision !== undefined &&
    headerRevision !== bodyRevision
  ) {
    throw new FormularioValidationError(
      "FORM_REVISION_MISMATCH",
      "As revisoes informadas no header e no corpo sao diferentes.",
      400,
    );
  }

  return (headerRevision ?? bodyRevision) as number;
};
