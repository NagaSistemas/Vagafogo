export const FORM_FIELD_TYPES = [
  'short_text',
  'long_text',
  'email',
  'phone',
  'number',
  'date',
  'single_choice',
  'multiple_choice',
  'consent',
] as const;

export type FormFieldType = (typeof FORM_FIELD_TYPES)[number];

export type FormStatus = 'draft' | 'published' | 'closed';

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

export type ManagedForm = {
  id: string;
  publicId: string;
  revision: number;
  schemaVersion: number;
  title: string;
  description: string;
  status: FormStatus;
  fields: FormField[];
  confirmationTitle: string;
  confirmationMessage: string;
  privacyMessage: string;
  submitButtonLabel: string;
  responseCount: number;
  createdAt?: unknown;
  updatedAt?: unknown;
  publishedAt?: unknown;
  lastResponseAt?: unknown;
};

export type FormDraft = Omit<
  ManagedForm,
  | 'id'
  | 'revision'
  | 'responseCount'
  | 'createdAt'
  | 'updatedAt'
  | 'publishedAt'
  | 'lastResponseAt'
> & {
  id?: string;
  revision?: number;
  responseCount?: number;
};

export type FormAnswerValue = string | number | boolean | string[];

export type FormResponseAnswer = {
  fieldId: string;
  label: string;
  type: FormFieldType;
  value: FormAnswerValue;
};

export type FormResponse = {
  id: string;
  formId: string;
  formPublicId?: string;
  formTitle?: string;
  answers: Record<string, FormAnswerValue>;
  answerSnapshot: FormResponseAnswer[];
  schemaVersion?: number;
  submittedAt?: unknown;
};

export type FormResponsesPage = {
  items: FormResponse[];
  nextCursor: string | null;
};

export type PublicForm = Pick<
  ManagedForm,
  | 'publicId'
  | 'schemaVersion'
  | 'title'
  | 'description'
  | 'status'
  | 'fields'
  | 'confirmationTitle'
  | 'confirmationMessage'
  | 'privacyMessage'
  | 'submitButtonLabel'
>;
