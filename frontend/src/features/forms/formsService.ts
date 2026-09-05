import { auth } from '../../../firebase';
import {
  clearPendingRequest,
  createRequestFingerprint,
  createRequestIdempotencyKey,
  readPendingRequest,
  writePendingRequest,
} from './idempotency';
import type { FormDraft, FormResponse, FormResponsesPage, ManagedForm } from './types';

const API_BASE = (
  (import.meta.env.VITE_API_BASE as string | undefined)?.trim()
  || 'https://vagafogo-production.up.railway.app'
).replace(/\/$/, '');

const ADMIN_FORMS_PATH = '/api/formularios/admin';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const positiveInteger = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

export class FormsApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;
  readonly currentRevision?: number;
  readonly currentSchemaVersion?: number;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = 'FormsApiError';
    this.status = status;
    this.code = isRecord(payload) && typeof payload.code === 'string' ? payload.code : '';
    this.details = isRecord(payload) ? payload.details : undefined;
    if (isRecord(payload)) {
      const revision = Number(payload.currentRevision);
      const schemaVersion = Number(payload.currentSchemaVersion);
      if (Number.isInteger(revision) && revision > 0) this.currentRevision = revision;
      if (Number.isInteger(schemaVersion) && schemaVersion > 0) {
        this.currentSchemaVersion = schemaVersion;
      }
    }
  }
}

export const isFormsApiError = (error: unknown, code?: string): error is FormsApiError =>
  error instanceof FormsApiError && (code === undefined || error.code === code);

const readErrorMessage = (payload: unknown, fallback: string) => {
  if (!isRecord(payload)) return fallback;
  const message = payload.error ?? payload.message;
  return typeof message === 'string' && message.trim() ? message : fallback;
};

const parseJson = async (response: Response): Promise<unknown> => {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
};

const authorizedRequest = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  const user = auth.currentUser;
  if (!user) throw new Error('Sua sessão expirou. Entre novamente no painel.');

  const execute = async (forceRefresh: boolean) => {
    const token = await user.getIdToken(forceRefresh);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 20_000);
    const callerSignal = init.signal;
    const abortFromCaller = () => controller.abort();
    if (callerSignal?.aborted) controller.abort();
    else callerSignal?.addEventListener('abort', abortFromCaller, { once: true });
    const headers = new Headers(init.headers);
    headers.set('Accept', 'application/json');
    headers.set('Authorization', `Bearer ${token}`);
    if (init.body) headers.set('Content-Type', 'application/json');

    try {
      const response = await fetch(`${API_BASE}${ADMIN_FORMS_PATH}${path}`, {
        ...init,
        headers,
        signal: controller.signal,
      });
      const payload = await parseJson(response);
      return { response, payload };
    } finally {
      window.clearTimeout(timeout);
      callerSignal?.removeEventListener('abort', abortFromCaller);
    }
  };

  let result = await execute(false);
  if (result.response.status === 401) result = await execute(true);
  if (!result.response.ok) {
    throw new FormsApiError(
      readErrorMessage(result.payload, 'Não foi possível concluir a operação.'),
      result.response.status,
      result.payload,
    );
  }
  return result.payload as T;
};

const normalizeForm = (value: unknown): ManagedForm => {
  if (!isRecord(value)) throw new Error('O servidor retornou um formulário inválido.');
  const rawResponseCount = Number(value.responseCount ?? 0);
  return {
    id: String(value.id ?? ''),
    publicId: String(value.publicId ?? ''),
    revision: positiveInteger(value.revision, 1),
    schemaVersion: positiveInteger(value.schemaVersion, 1),
    title: String(value.title ?? 'Formulário sem título'),
    description: String(value.description ?? ''),
    status: value.status === 'published' || value.status === 'closed' ? value.status : 'draft',
    fields: Array.isArray(value.fields) ? (value.fields as ManagedForm['fields']) : [],
    confirmationTitle: String(value.confirmationTitle ?? 'Resposta enviada!'),
    confirmationMessage: String(value.confirmationMessage ?? 'Obrigado por responder.'),
    privacyMessage: String(value.privacyMessage ?? ''),
    submitButtonLabel: String(value.submitButtonLabel ?? 'Enviar resposta'),
    responseCount: Number.isFinite(rawResponseCount) && rawResponseCount > 0
      ? Math.floor(rawResponseCount)
      : 0,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    publishedAt: value.publishedAt,
    lastResponseAt: value.lastResponseAt,
  };
};

const serializeField = (field: FormDraft['fields'][number]) => ({
  id: field.id,
  type: field.type,
  label: field.label.trim(),
  description: field.description?.trim() ?? '',
  placeholder: field.placeholder?.trim() ?? '',
  required: field.required,
  ...(field.options ? { options: field.options.map((option) => option.trim()).filter(Boolean) } : {}),
  ...(typeof field.min === 'number' && Number.isFinite(field.min) ? { min: field.min } : {}),
  ...(typeof field.max === 'number' && Number.isFinite(field.max) ? { max: field.max } : {}),
  ...(typeof field.maxLength === 'number' && Number.isFinite(field.maxLength)
    ? { maxLength: Math.max(1, Math.floor(field.maxLength)) }
    : {}),
});

const serializeDraft = (draft: FormDraft, status: ManagedForm['status']) => ({
  publicId: draft.publicId,
  schemaVersion: positiveInteger(draft.schemaVersion, 1),
  title: draft.title.trim(),
  description: draft.description.trim(),
  status,
  fields: draft.fields.map(serializeField),
  confirmationTitle: draft.confirmationTitle.trim() || 'Resposta enviada!',
  confirmationMessage: draft.confirmationMessage.trim() || 'Obrigado por responder.',
  privacyMessage: draft.privacyMessage.trim(),
  submitButtonLabel: draft.submitButtonLabel.trim() || 'Enviar resposta',
});

export const listForms = async () => {
  const payload = await authorizedRequest<unknown>('/');
  if (!Array.isArray(payload)) throw new Error('O servidor retornou uma lista inválida.');
  return payload.map(normalizeForm);
};

export const saveForm = async (draft: FormDraft, nextStatus: ManagedForm['status']) => {
  const payload = serializeDraft(draft, nextStatus);
  if (draft.id) {
    const expectedRevision = positiveInteger(draft.revision, 0);
    if (expectedRevision === 0) {
      throw new Error('A revisão deste formulário é inválida. Atualize a lista e tente novamente.');
    }
    const saved = await authorizedRequest<unknown>(`/${encodeURIComponent(draft.id)}`, {
      method: 'PUT',
      headers: { 'If-Match': String(expectedRevision) },
      body: JSON.stringify({ ...payload, expectedRevision }),
    });
    return normalizeForm(saved).id;
  }

  const storageKey = `vagafogo:forms:admin-create:v1:${draft.publicId}`;
  const fingerprint = await createRequestFingerprint({ operation: 'create-form', payload });
  const storedRequest = readPendingRequest(storageKey);
  const pendingRequest = storedRequest?.fingerprint === fingerprint
    ? storedRequest
    : { key: createRequestIdempotencyKey(), fingerprint };
  writePendingRequest(storageKey, pendingRequest);

  const saved = await authorizedRequest<unknown>('/', {
    method: 'POST',
    headers: { 'Idempotency-Key': pendingRequest.key },
    body: JSON.stringify(payload),
  });
  const normalized = normalizeForm(saved);
  clearPendingRequest(storageKey);
  return normalized.id;
};

export const setFormStatus = async (
  formId: string,
  status: ManagedForm['status'],
  expectedRevision: number,
) => {
  const revision = positiveInteger(expectedRevision, 0);
  if (revision === 0) {
    throw new Error('A revisão deste formulário é inválida. Atualize a lista e tente novamente.');
  }
  const saved = await authorizedRequest<unknown>(`/${encodeURIComponent(formId)}/status`, {
    method: 'PATCH',
    headers: { 'If-Match': String(revision) },
    body: JSON.stringify({ status, expectedRevision: revision }),
  });
  return normalizeForm(saved);
};

const normalizeResponse = (value: unknown, formId: string): FormResponse => {
  if (!isRecord(value)) throw new Error('O servidor retornou uma resposta inválida.');
  const id = String(value.id ?? '').trim();
  if (!id) throw new Error('O servidor retornou uma resposta sem identificador.');
  const rawSchemaVersion = Number(value.schemaVersion ?? value.formVersion);
  return {
    id,
    formId: String(value.formId ?? formId),
    formPublicId: typeof value.formPublicId === 'string' ? value.formPublicId : undefined,
    formTitle: typeof value.formTitle === 'string' ? value.formTitle : undefined,
    answers: isRecord(value.answers) ? value.answers as FormResponse['answers'] : {},
    answerSnapshot: Array.isArray(value.answerSnapshot) ? value.answerSnapshot as FormResponse['answerSnapshot'] : [],
    schemaVersion: Number.isInteger(rawSchemaVersion) && rawSchemaVersion > 0
      ? rawSchemaVersion
      : undefined,
    submittedAt: value.submittedAt,
  };
};

export const listFormResponses = async (
  formId: string,
  options: { limit?: number; cursor?: string; signal?: AbortSignal } = {},
): Promise<FormResponsesPage> => {
  const requestedLimit = Number(options.limit ?? 50);
  const limit = Number.isInteger(requestedLimit)
    ? Math.min(200, Math.max(1, requestedLimit))
    : 50;
  const query = new URLSearchParams({ limit: String(limit) });
  if (options.cursor) query.set('cursor', options.cursor);

  const payload = await authorizedRequest<unknown>(
    `/${encodeURIComponent(formId)}/respostas?${query.toString()}`,
    { signal: options.signal },
  );

  if (!isRecord(payload) || !Array.isArray(payload.items)) {
    throw new Error('O servidor retornou uma página de respostas inválida.');
  }
  let nextCursor: string | null;
  if (payload.nextCursor === null) {
    nextCursor = null;
  } else if (typeof payload.nextCursor === 'string' && payload.nextCursor.trim()) {
    nextCursor = payload.nextCursor;
  } else {
    throw new Error('O servidor retornou um cursor de respostas inválido.');
  }
  return {
    items: payload.items.map((value) => normalizeResponse(value, formId)),
    nextCursor,
  };
};

export const deleteFormResponse = async (formId: string, responseId: string) => {
  await authorizedRequest(`/${encodeURIComponent(formId)}/respostas/${encodeURIComponent(responseId)}`, {
    method: 'DELETE',
  });
};

export const deleteFormWithResponses = async (formId: string, expectedRevision: number) => {
  const revision = positiveInteger(expectedRevision, 0);
  if (revision === 0) {
    throw new Error('A revisão deste formulário é inválida. Atualize a lista e tente novamente.');
  }
  await authorizedRequest(`/${encodeURIComponent(formId)}`, {
    method: 'DELETE',
    headers: { 'If-Match': String(revision) },
  });
};
