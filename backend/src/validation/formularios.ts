import {
  FORM_FIELD_TYPES,
  FormAnswerValue,
  FormField,
  FormFieldType,
  FormStatus,
  FormularioPublico,
  FormularioValidationIssue,
  RespostasNormalizadas,
} from "../types/formularios";

const MAX_FIELDS = 50;
const MAX_OPTIONS = 100;
const MAX_OPTION_LENGTH = 120;
const MAX_FIELD_ID_LENGTH = 128;
const MAX_PUBLIC_ID_LENGTH = 128;
// Firestore limita cada documento a 1 MiB. A margem acomoda metadados, nomes de
// propriedades e a duplicacao necessaria no snapshot historico das respostas.
const MAX_SERIALIZED_FORM_BYTES = 750_000;
const MAX_SERIALIZED_ANSWERS_BYTES = 700_000;
const FIELD_ID_PATTERN = /^[A-Za-z0-9._:-]+$/;
const PUBLIC_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const RESERVED_FIELD_IDS = new Set(["__proto__", "constructor", "prototype"]);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const PHONE_PATTERN = /^[0-9+().\s-]+$/u;

const FORM_STATUS = new Set<FormStatus>(["draft", "published", "closed"]);
const FIELD_TYPES = new Set<FormFieldType>(FORM_FIELD_TYPES);

export class FormularioValidationError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: FormularioValidationIssue[];

  constructor(
    code: string,
    message: string,
    status = 400,
    details?: FormularioValidationIssue[],
  ) {
    super(message);
    this.name = "FormularioValidationError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const serializedByteLength = (value: unknown) =>
  Buffer.byteLength(JSON.stringify(value), "utf8");

export const normalizarVersaoSchemaArmazenada = (value: unknown) => {
  if (value === undefined || value === null) return 1;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new FormularioValidationError(
      "FORM_CONFIGURATION_INVALID",
      "A versao do schema do formulario e invalida.",
      500,
    );
  }
  return value;
};

export const normalizarSchemaVersionSubmissao = (payload: unknown) => {
  if (!isRecord(payload)) {
    throw new FormularioValidationError(
      "INVALID_PAYLOAD",
      "Envie os dados da resposta em um objeto JSON.",
      400,
    );
  }
  const value = payload.schemaVersion;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new FormularioValidationError(
      "SCHEMA_VERSION_REQUIRED",
      "Informe a schemaVersion recebida ao carregar o formulario.",
      400,
    );
  }
  return value;
};

const readString = (
  value: unknown,
  name: string,
  maxLength: number,
  options: { required?: boolean; fallback?: string } = {},
) => {
  if (value === undefined || value === null) {
    if (options.required) {
      throw new FormularioValidationError(
        "FORM_CONFIGURATION_INVALID",
        `O campo ${name} e obrigatorio.`,
        500,
      );
    }
    return options.fallback ?? "";
  }

  if (typeof value !== "string") {
    throw new FormularioValidationError(
      "FORM_CONFIGURATION_INVALID",
      `O campo ${name} deve ser um texto.`,
      500,
    );
  }

  const normalized = value.trim();
  if (options.required && !normalized) {
    throw new FormularioValidationError(
      "FORM_CONFIGURATION_INVALID",
      `O campo ${name} e obrigatorio.`,
      500,
    );
  }
  if (normalized.length > maxLength) {
    throw new FormularioValidationError(
      "FORM_CONFIGURATION_INVALID",
      `O campo ${name} excede o limite permitido.`,
      500,
    );
  }
  return normalized;
};

const readOptionalFiniteNumber = (value: unknown, name: string) => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new FormularioValidationError(
      "FORM_CONFIGURATION_INVALID",
      `O campo ${name} deve ser um numero finito.`,
      500,
    );
  }
  return value;
};

const normalizeOptions = (value: unknown, fieldId: string) => {
  if (!Array.isArray(value) || value.length < 2 || value.length > MAX_OPTIONS) {
    throw new FormularioValidationError(
      "FORM_CONFIGURATION_INVALID",
      `O campo ${fieldId} deve possuir entre 2 e ${MAX_OPTIONS} opcoes.`,
      500,
    );
  }

  const options = value.map((option) => {
    if (typeof option !== "string") {
      throw new FormularioValidationError(
        "FORM_CONFIGURATION_INVALID",
        `As opcoes do campo ${fieldId} devem ser textos.`,
        500,
      );
    }
    const normalized = option.trim();
    if (!normalized || normalized.length > MAX_OPTION_LENGTH) {
      throw new FormularioValidationError(
        "FORM_CONFIGURATION_INVALID",
        `Uma opcao do campo ${fieldId} e vazia ou muito longa.`,
        500,
      );
    }
    return normalized;
  });

  const unique = new Set(options.map((option) => option.toLocaleLowerCase("pt-BR")));
  if (unique.size !== options.length) {
    throw new FormularioValidationError(
      "FORM_CONFIGURATION_INVALID",
      `O campo ${fieldId} possui opcoes repetidas.`,
      500,
    );
  }

  return options;
};

const normalizeField = (value: unknown, index: number): FormField => {
  if (!isRecord(value)) {
    throw new FormularioValidationError(
      "FORM_CONFIGURATION_INVALID",
      `O campo na posicao ${index + 1} e invalido.`,
      500,
    );
  }

  const id = readString(value.id, `fields[${index}].id`, MAX_FIELD_ID_LENGTH, {
    required: true,
  });
  if (!FIELD_ID_PATTERN.test(id) || RESERVED_FIELD_IDS.has(id.toLocaleLowerCase("en-US"))) {
    throw new FormularioValidationError(
      "FORM_CONFIGURATION_INVALID",
      `O identificador do campo ${id} e invalido.`,
      500,
    );
  }

  if (typeof value.type !== "string" || !FIELD_TYPES.has(value.type as FormFieldType)) {
    throw new FormularioValidationError(
      "FORM_CONFIGURATION_INVALID",
      `O tipo do campo ${id} nao e suportado.`,
      500,
    );
  }
  const type = value.type as FormFieldType;

  if (value.required !== undefined && typeof value.required !== "boolean") {
    throw new FormularioValidationError(
      "FORM_CONFIGURATION_INVALID",
      `A propriedade required do campo ${id} e invalida.`,
      500,
    );
  }

  const field: FormField = {
    id,
    type,
    label: readString(value.label, `fields[${index}].label`, 180, { required: true }),
    required: type === "consent" ? true : value.required === true,
  };

  const description = readString(value.description, `fields[${index}].description`, 300);
  const placeholder = readString(value.placeholder, `fields[${index}].placeholder`, 160);
  if (description) field.description = description;
  if (placeholder && type !== "consent") field.placeholder = placeholder;

  if (type === "single_choice" || type === "multiple_choice") {
    field.options = normalizeOptions(value.options, id);
  }

  if (type === "short_text" || type === "long_text") {
    const defaultMaxLength = type === "long_text" ? 2000 : 300;
    const maxLength = value.maxLength === undefined ? defaultMaxLength : value.maxLength;
    if (
      typeof maxLength !== "number" ||
      !Number.isInteger(maxLength) ||
      maxLength < 1 ||
      maxLength > 5000
    ) {
      throw new FormularioValidationError(
        "FORM_CONFIGURATION_INVALID",
        `O limite de caracteres do campo ${id} e invalido.`,
        500,
      );
    }
    field.maxLength = maxLength;
  }

  if (type === "number") {
    const min = readOptionalFiniteNumber(value.min, `fields[${index}].min`);
    const max = readOptionalFiniteNumber(value.max, `fields[${index}].max`);
    if (min !== undefined) field.min = min;
    if (max !== undefined) field.max = max;
    if (min !== undefined && max !== undefined && min > max) {
      throw new FormularioValidationError(
        "FORM_CONFIGURATION_INVALID",
        `O intervalo numerico do campo ${id} e invalido.`,
        500,
      );
    }
  }

  return field;
};

export const normalizarIdentificadorPublico = (value: unknown) => {
  if (typeof value !== "string") {
    throw new FormularioValidationError(
      "FORM_NOT_FOUND",
      "Formulario nao encontrado.",
      404,
    );
  }
  const publicId = value.trim();
  if (
    publicId.length < 8 ||
    publicId.length > MAX_PUBLIC_ID_LENGTH ||
    !PUBLIC_ID_PATTERN.test(publicId)
  ) {
    throw new FormularioValidationError(
      "FORM_NOT_FOUND",
      "Formulario nao encontrado.",
      404,
    );
  }
  return publicId;
};

export const normalizarFormularioPublico = (
  data: unknown,
  publicIdEsperado: string,
): FormularioPublico => {
  if (!isRecord(data)) {
    throw new FormularioValidationError(
      "FORM_CONFIGURATION_INVALID",
      "A configuracao do formulario e invalida.",
      500,
    );
  }

  const publicId = normalizarIdentificadorPublico(data.publicId);
  if (publicId !== publicIdEsperado) {
    throw new FormularioValidationError(
      "FORM_CONFIGURATION_INVALID",
      "O identificador publico do formulario e inconsistente.",
      500,
    );
  }

  if (typeof data.status !== "string" || !FORM_STATUS.has(data.status as FormStatus)) {
    throw new FormularioValidationError(
      "FORM_CONFIGURATION_INVALID",
      "O status do formulario e invalido.",
      500,
    );
  }
  const status = data.status as FormStatus;

  if (!Array.isArray(data.fields) || data.fields.length > MAX_FIELDS) {
    throw new FormularioValidationError(
      "FORM_CONFIGURATION_INVALID",
      `O formulario deve possuir no maximo ${MAX_FIELDS} campos.`,
      500,
    );
  }
  if (status === "published" && data.fields.length === 0) {
    throw new FormularioValidationError(
      "FORM_CONFIGURATION_INVALID",
      "Um formulario publicado precisa possuir ao menos um campo.",
      500,
    );
  }

  const fields = data.fields.map(normalizeField);
  if (new Set(fields.map((field) => field.id)).size !== fields.length) {
    throw new FormularioValidationError(
      "FORM_CONFIGURATION_INVALID",
      "O formulario possui identificadores de campo repetidos.",
      500,
    );
  }

  const formulario: FormularioPublico = {
    publicId,
    schemaVersion: normalizarVersaoSchemaArmazenada(
      data.schemaVersion ?? data.formVersion,
    ),
    title: readString(data.title, "title", 160, { required: true }),
    description: readString(data.description, "description", 1500),
    status,
    fields,
    confirmationTitle: readString(data.confirmationTitle, "confirmationTitle", 160, {
      fallback: "Resposta enviada!",
    }),
    confirmationMessage: readString(
      data.confirmationMessage,
      "confirmationMessage",
      600,
      { fallback: "Obrigado por responder." },
    ),
    privacyMessage: readString(data.privacyMessage, "privacyMessage", 1000),
    submitButtonLabel: readString(data.submitButtonLabel, "submitButtonLabel", 60, {
      fallback: "Enviar resposta",
    }),
  };

  if (serializedByteLength(formulario) > MAX_SERIALIZED_FORM_BYTES) {
    throw new FormularioValidationError(
      "FORM_CONFIGURATION_INVALID",
      "O formulario excede o tamanho maximo permitido.",
      500,
    );
  }

  return formulario;
};

const isBlankAnswer = (value: unknown) =>
  value === undefined ||
  value === null ||
  (typeof value === "string" && value.trim() === "") ||
  (Array.isArray(value) && value.length === 0);

const isValidIsoDate = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
};

const answerIssue = (field: FormField, code: string, message: string) => ({
  fieldId: field.id,
  code,
  message,
});

const normalizeAnswer = (
  field: FormField,
  value: unknown,
): { value?: FormAnswerValue; issue?: FormularioValidationIssue } => {
  if (isBlankAnswer(value)) {
    if (field.required) {
      return {
        issue: answerIssue(field, "REQUIRED", `O campo \"${field.label}\" e obrigatorio.`),
      };
    }
    return {};
  }

  switch (field.type) {
    case "short_text":
    case "long_text": {
      if (typeof value !== "string") {
        return { issue: answerIssue(field, "INVALID_TYPE", "Informe um texto valido.") };
      }
      const normalized = value.trim();
      const maxLength = field.maxLength ?? (field.type === "long_text" ? 2000 : 300);
      if (normalized.length > maxLength) {
        return {
          issue: answerIssue(
            field,
            "MAX_LENGTH",
            `A resposta deve ter no maximo ${maxLength} caracteres.`,
          ),
        };
      }
      return { value: normalized };
    }
    case "email": {
      if (typeof value !== "string") {
        return { issue: answerIssue(field, "INVALID_TYPE", "Informe um e-mail valido.") };
      }
      const normalized = value.trim().toLocaleLowerCase("pt-BR");
      if (normalized.length > 254 || !EMAIL_PATTERN.test(normalized)) {
        return { issue: answerIssue(field, "INVALID_EMAIL", "Informe um e-mail valido.") };
      }
      return { value: normalized };
    }
    case "phone": {
      if (typeof value !== "string") {
        return { issue: answerIssue(field, "INVALID_TYPE", "Informe um telefone valido.") };
      }
      const normalized = value.trim();
      const digitCount = normalized.replace(/\D/g, "").length;
      if (
        normalized.length > 30 ||
        digitCount < 7 ||
        digitCount > 15 ||
        !PHONE_PATTERN.test(normalized)
      ) {
        return { issue: answerIssue(field, "INVALID_PHONE", "Informe um telefone valido.") };
      }
      return { value: normalized };
    }
    case "number": {
      const normalized =
        typeof value === "number"
          ? value
          : typeof value === "string" && value.trim() !== ""
            ? Number(value.trim().replace(",", "."))
            : Number.NaN;
      if (!Number.isFinite(normalized) || Math.abs(normalized) > Number.MAX_SAFE_INTEGER) {
        return { issue: answerIssue(field, "INVALID_NUMBER", "Informe um numero valido.") };
      }
      if (field.min !== undefined && normalized < field.min) {
        return {
          issue: answerIssue(field, "MIN_VALUE", `O valor minimo permitido e ${field.min}.`),
        };
      }
      if (field.max !== undefined && normalized > field.max) {
        return {
          issue: answerIssue(field, "MAX_VALUE", `O valor maximo permitido e ${field.max}.`),
        };
      }
      return { value: normalized };
    }
    case "date": {
      if (typeof value !== "string" || !isValidIsoDate(value.trim())) {
        return {
          issue: answerIssue(field, "INVALID_DATE", "Informe uma data valida no formato AAAA-MM-DD."),
        };
      }
      return { value: value.trim() };
    }
    case "single_choice": {
      if (typeof value !== "string") {
        return { issue: answerIssue(field, "INVALID_TYPE", "Selecione uma opcao valida.") };
      }
      const normalized = value.trim();
      if (!field.options?.includes(normalized)) {
        return { issue: answerIssue(field, "INVALID_OPTION", "Selecione uma opcao valida.") };
      }
      return { value: normalized };
    }
    case "multiple_choice": {
      if (!Array.isArray(value) || value.length === 0 || value.length > (field.options?.length ?? 0)) {
        return { issue: answerIssue(field, "INVALID_OPTIONS", "Selecione opcoes validas.") };
      }
      if (value.some((item) => typeof item !== "string")) {
        return { issue: answerIssue(field, "INVALID_TYPE", "Selecione opcoes validas.") };
      }
      const normalized = value.map((item) => item.trim());
      if (
        new Set(normalized).size !== normalized.length ||
        normalized.some((item) => !field.options?.includes(item))
      ) {
        return { issue: answerIssue(field, "INVALID_OPTIONS", "Selecione opcoes validas.") };
      }
      return { value: normalized };
    }
    case "consent": {
      if (typeof value !== "boolean") {
        return { issue: answerIssue(field, "INVALID_TYPE", "Confirme o aceite para continuar.") };
      }
      if (field.required && value !== true) {
        return { issue: answerIssue(field, "CONSENT_REQUIRED", "Confirme o aceite para continuar.") };
      }
      return { value };
    }
  }
};

export const validarENormalizarRespostas = (
  formulario: FormularioPublico,
  payload: unknown,
): RespostasNormalizadas => {
  if (!isRecord(payload) || !isRecord(payload.answers)) {
    throw new FormularioValidationError(
      "INVALID_PAYLOAD",
      "Envie as respostas no campo answers.",
      400,
    );
  }

  const answerKeys = Object.keys(payload.answers);
  if (answerKeys.length > MAX_FIELDS) {
    throw new FormularioValidationError(
      "TOO_MANY_ANSWERS",
      `Sao permitidas no maximo ${MAX_FIELDS} respostas.`,
      400,
    );
  }

  const fieldsById = new Map(formulario.fields.map((field) => [field.id, field]));
  const unknownFields = answerKeys.filter((fieldId) => !fieldsById.has(fieldId));
  if (unknownFields.length > 0) {
    throw new FormularioValidationError(
      "UNKNOWN_FIELDS",
      "A requisicao possui campos que nao pertencem ao formulario.",
      400,
      unknownFields.map((fieldId) => ({
        fieldId,
        code: "UNKNOWN_FIELD",
        message: "Campo desconhecido.",
      })),
    );
  }

  const normalized: RespostasNormalizadas = { answers: {}, answerSnapshot: [] };
  const issues: FormularioValidationIssue[] = [];

  for (const field of formulario.fields) {
    const result = normalizeAnswer(field, payload.answers[field.id]);
    if (result.issue) {
      issues.push(result.issue);
      continue;
    }
    if (result.value === undefined) continue;
    normalized.answers[field.id] = result.value;
    normalized.answerSnapshot.push({
      fieldId: field.id,
      label: field.label,
      type: field.type,
      value: result.value,
    });
  }

  if (issues.length > 0) {
    throw new FormularioValidationError(
      "INVALID_ANSWERS",
      "Revise os campos destacados e tente novamente.",
      422,
      issues,
    );
  }

  if (serializedByteLength(normalized) > MAX_SERIALIZED_ANSWERS_BYTES) {
    throw new FormularioValidationError(
      "ANSWERS_TOO_LARGE",
      "O conjunto de respostas excede o tamanho maximo permitido.",
      413,
    );
  }

  return normalized;
};

export const normalizarChaveIdempotencia = (value: unknown) => {
  if (typeof value !== "string" || !value.trim()) {
    throw new FormularioValidationError(
      "IDEMPOTENCY_KEY_REQUIRED",
      "Informe o header Idempotency-Key para concluir a operacao.",
      400,
    );
  }

  const key = value.trim();
  if (key.length < 8 || key.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(key)) {
    throw new FormularioValidationError(
      "INVALID_IDEMPOTENCY_KEY",
      "O header Idempotency-Key e invalido.",
      400,
    );
  }
  return key;
};

export const stringifyCanonico = (value: unknown): string => {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new FormularioValidationError(
        "INVALID_PAYLOAD",
        "A requisicao contem um numero invalido.",
        400,
      );
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stringifyCanonico(item)).join(",")}]`;
  }
  if (isRecord(value)) {
    const entries = Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stringifyCanonico(value[key])}`);
    return `{${entries.join(",")}}`;
  }
  throw new FormularioValidationError(
    "INVALID_PAYLOAD",
    "A requisicao possui um valor nao suportado.",
    400,
  );
};
