export const FORM_FIELD_TYPES = [
  "short_text",
  "long_text",
  "email",
  "phone",
  "number",
  "date",
  "single_choice",
  "multiple_choice",
  "consent",
] as const;

export type FormFieldType = (typeof FORM_FIELD_TYPES)[number];

export type FormStatus = "draft" | "published" | "closed";

export type FormAnswerValue = string | number | boolean | string[];

export type FormField = {
  id: string;
  type: FormFieldType;
  label: string;
  description?: string;
  placeholder?: string;
  required: boolean;
  options?: string[];
  min?: number;
  max?: number;
  maxLength?: number;
};

export type FormularioPublico = {
  publicId: string;
  schemaVersion: number;
  title: string;
  description: string;
  status: FormStatus;
  fields: FormField[];
  confirmationTitle: string;
  confirmationMessage: string;
  privacyMessage: string;
  submitButtonLabel: string;
};

export type FormResponseAnswer = {
  fieldId: string;
  label: string;
  type: FormFieldType;
  value: FormAnswerValue;
};

export type RespostasNormalizadas = {
  answers: Record<string, FormAnswerValue>;
  answerSnapshot: FormResponseAnswer[];
};

export type FormularioValidationIssue = {
  fieldId?: string;
  code: string;
  message: string;
};
