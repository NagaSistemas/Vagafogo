import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  FaArrowLeft,
  FaCheck,
  FaCheckCircle,
  FaExclamationTriangle,
  FaLeaf,
  FaLock,
  FaPaperPlane,
  FaRedo,
  FaShieldAlt,
  FaSyncAlt,
} from 'react-icons/fa';

import logo from '../assets/logo.jpg';
import {
  clearPendingRequest,
  createRequestFingerprint,
  createRequestIdempotencyKey,
  readPendingRequest,
  writePendingRequest,
} from '../features/forms/idempotency';
import { FORM_FIELD_TYPES } from '../features/forms/types';
import type { FormAnswerValue, FormField, PublicForm } from '../features/forms/types';

const API_BASE = (
  (import.meta.env.VITE_API_BASE as string | undefined)?.trim()
  || 'https://vagafogo-production.up.railway.app'
).replace(/\/$/, '');

type PageState = 'loading' | 'ready' | 'closed' | 'error' | 'success';

type FieldCardProps = {
  field: FormField;
  index: number;
  value: FormAnswerValue | undefined;
  error?: string;
  onChange: (value: FormAnswerValue) => void;
  onBlur: () => void;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const parseResponseBody = async (response: Response): Promise<unknown> => {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
};

const getApiMessage = (payload: unknown, fallback: string) => {
  if (!isRecord(payload)) return fallback;
  const message = payload.message ?? payload.error;
  return typeof message === 'string' && message.trim() ? message.trim() : fallback;
};

const getApiCode = (payload: unknown) =>
  isRecord(payload) && typeof payload.code === 'string' ? payload.code : '';

const getApiFieldErrors = (payload: unknown, form: PublicForm) => {
  if (!isRecord(payload) || !Array.isArray(payload.details)) return {};
  const allowedFieldIds = new Set(form.fields.map((field) => field.id));
  const entries: Array<[string, string]> = [];
  payload.details.forEach((detail) => {
    if (!isRecord(detail) || typeof detail.fieldId !== 'string' || !allowedFieldIds.has(detail.fieldId)) return;
    if (entries.some(([fieldId]) => fieldId === detail.fieldId)) return;
    const message = typeof detail.message === 'string' && detail.message.trim()
      ? detail.message.trim()
      : 'Revise este campo.';
    entries.push([detail.fieldId, message]);
  });
  return Object.fromEntries(entries) as Record<string, string>;
};

const unwrapPublicForm = (payload: unknown): Record<string, unknown> | null => {
  let current: unknown = payload;

  for (let depth = 0; depth < 4; depth += 1) {
    if (!isRecord(current)) return null;
    if ('fields' in current || 'publicId' in current || 'title' in current) return current;
    current = current.formulario ?? current.form ?? current.data;
  }

  return null;
};

const normalizeNumber = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const normalizePositiveInteger = (value: unknown, fallback = 1) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const normalizeField = (value: unknown, index: number): FormField | null => {
  if (!isRecord(value)) return null;

  const rawType = String(value.type ?? '');
  if (!FORM_FIELD_TYPES.some((type) => type === rawType)) return null;

  const options = Array.isArray(value.options)
    ? value.options.map((option) => String(option).trim()).filter(Boolean)
    : undefined;

  return {
    id: String(value.id ?? `campo-${index + 1}`),
    type: rawType as FormField['type'],
    label: String(value.label ?? `Pergunta ${index + 1}`).trim() || `Pergunta ${index + 1}`,
    description: typeof value.description === 'string' ? value.description : undefined,
    placeholder: typeof value.placeholder === 'string' ? value.placeholder : undefined,
    required: value.required === true,
    options,
    min: normalizeNumber(value.min),
    max: normalizeNumber(value.max),
    maxLength: normalizeNumber(value.maxLength),
  };
};

const normalizePublicForm = (payload: unknown, fallbackPublicId: string): PublicForm | null => {
  const value = unwrapPublicForm(payload);
  if (!value) return null;

  const fields = (Array.isArray(value.fields) ? value.fields : [])
    .map(normalizeField)
    .filter((field): field is FormField => field !== null);

  const status = value.status === 'published' || value.status === 'closed'
    ? value.status
    : 'draft';

  return {
    publicId: String(value.publicId ?? fallbackPublicId),
    schemaVersion: normalizePositiveInteger(value.schemaVersion),
    title: String(value.title ?? 'Formulário').trim() || 'Formulário',
    description: typeof value.description === 'string' ? value.description : '',
    status,
    fields,
    confirmationTitle:
      typeof value.confirmationTitle === 'string' && value.confirmationTitle.trim()
        ? value.confirmationTitle
        : 'Resposta enviada!',
    confirmationMessage:
      typeof value.confirmationMessage === 'string' && value.confirmationMessage.trim()
        ? value.confirmationMessage
        : 'Recebemos suas informações com sucesso. Obrigado por responder.',
    privacyMessage:
      typeof value.privacyMessage === 'string' ? value.privacyMessage : '',
    submitButtonLabel:
      typeof value.submitButtonLabel === 'string' && value.submitButtonLabel.trim()
        ? value.submitButtonLabel
        : 'Enviar resposta',
  };
};

const getInitialAnswers = (form: PublicForm) => {
  const initial: Record<string, FormAnswerValue> = {};

  form.fields.forEach((field) => {
    if (field.type === 'multiple_choice') {
      initial[field.id] = [];
    } else if (field.type === 'consent') {
      initial[field.id] = false;
    } else {
      initial[field.id] = '';
    }
  });

  return initial;
};

const recoverCompatibleAnswers = (
  nextForm: PublicForm,
  previousForm: PublicForm,
  previousAnswers: Record<string, FormAnswerValue>,
) => {
  const recovered = getInitialAnswers(nextForm);
  const previousFields = new Map(previousForm.fields.map((field) => [field.id, field]));

  nextForm.fields.forEach((field) => {
    const previousField = previousFields.get(field.id);
    const previousValue = previousAnswers[field.id];
    if (!previousField || previousField.type !== field.type || previousValue === undefined) return;

    if (field.type === 'single_choice') {
      if (typeof previousValue === 'string' && field.options?.includes(previousValue)) {
        recovered[field.id] = previousValue;
      }
      return;
    }
    if (field.type === 'multiple_choice') {
      if (Array.isArray(previousValue)) {
        recovered[field.id] = previousValue.filter((option) => field.options?.includes(option));
      }
      return;
    }
    if (field.type === 'consent') {
      if (typeof previousValue === 'boolean') recovered[field.id] = previousValue;
      return;
    }
    if (typeof previousValue === 'string' || typeof previousValue === 'number') {
      recovered[field.id] = previousValue;
    }
  });

  return recovered;
};

const isAnswered = (value: FormAnswerValue | undefined) => {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value);
  return typeof value === 'string' && value.trim().length > 0;
};

const getFieldDomId = (fieldId: string, fieldIndex: number) => {
  const encodedFieldId = Array.from(fieldId)
    .map((character) => character.codePointAt(0)?.toString(16).padStart(2, '0') ?? '00')
    .join('-');
  return `form-field-${fieldIndex}-${encodedFieldId || 'empty'}`;
};

const isValidIsoDate = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
};

const asInputValue = (value: FormAnswerValue | undefined) =>
  typeof value === 'string' || typeof value === 'number' ? String(value) : '';

const defaultMaxLengthFor = (type: FormField['type']) => {
  if (type === 'long_text') return 4000;
  if (type === 'email') return 254;
  if (type === 'phone') return 30;
  return 500;
};

function FieldCard({ field, index, value, error, onChange, onBlur }: FieldCardProps) {
  const inputId = getFieldDomId(field.id, index);
  const descriptionId = `${inputId}-description`;
  const errorId = `${inputId}-error`;
  const describedBy = [field.description ? descriptionId : '', error ? errorId : '']
    .filter(Boolean)
    .join(' ') || undefined;
  const maxLength = field.maxLength ?? defaultMaxLengthFor(field.type);
  const inputClassName = `mt-3 w-full rounded-xl border bg-white px-4 py-3 text-base text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 focus:ring-4 ${
    error
      ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-100'
      : 'border-slate-200 hover:border-slate-300 focus:border-[#8B4F23] focus:ring-[#8B4F23]/10'
  }`;

  const label = (
    <>
      <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#8B4F23]/70">
        Pergunta {index + 1}
      </span>
      <span className="mt-1 block text-base font-semibold leading-6 text-[#2D1E0F] sm:text-lg">
        {field.label}
        {field.required ? (
          <span className="ml-1 text-rose-500" aria-label="obrigatória">*</span>
        ) : (
          <span className="ml-2 text-xs font-normal text-slate-400">Opcional</span>
        )}
      </span>
    </>
  );

  const errorText = error ? (
    <p id={errorId} className="mt-2 flex items-start gap-2 text-sm font-medium text-rose-600" role="alert">
      <FaExclamationTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{error}</span>
    </p>
  ) : null;

  if (field.type === 'single_choice' || field.type === 'multiple_choice') {
    const selectedOptions = Array.isArray(value) ? value : [];
    const options = field.options ?? [];

    return (
      <fieldset
        className={`rounded-2xl border bg-[#FCFBF8] p-4 transition sm:p-5 ${error ? 'border-rose-300' : 'border-slate-200'}`}
        aria-describedby={describedBy}
        aria-invalid={Boolean(error)}
      >
        <legend className="w-full px-0">{label}</legend>
        {field.description ? (
          <p id={descriptionId} className="mt-1.5 whitespace-pre-line text-sm leading-6 text-slate-500">
            {field.description}
          </p>
        ) : null}

        {options.length > 0 ? (
          <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
            {options.map((option, optionIndex) => {
              const checked = field.type === 'multiple_choice'
                ? selectedOptions.includes(option)
                : value === option;
              const optionId = `${inputId}-option-${optionIndex}`;

              return (
                <label
                  key={`${option}-${optionIndex}`}
                  htmlFor={optionId}
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border-2 px-3.5 py-3 text-sm transition focus-within:ring-4 focus-within:ring-[#8B4F23]/10 ${
                    checked
                      ? 'border-[#8B4F23] bg-[#8B4F23]/5 text-[#2D1E0F] shadow-sm'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-[#8B4F23]/35 hover:bg-[#8B4F23]/[0.025]'
                  }`}
                >
                  <input
                    id={optionId}
                    type={field.type === 'multiple_choice' ? 'checkbox' : 'radio'}
                    name={field.type === 'single_choice' ? inputId : undefined}
                    value={option}
                    checked={checked}
                    onBlur={onBlur}
                    onChange={() => {
                      if (field.type === 'single_choice') {
                        onChange(option);
                        return;
                      }

                      onChange(
                        checked
                          ? selectedOptions.filter((selected) => selected !== option)
                          : [...selectedOptions, option],
                      );
                    }}
                    className="sr-only"
                  />
                  <span
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center border-2 ${
                      field.type === 'single_choice' ? 'rounded-full' : 'rounded-md'
                    } ${checked ? 'border-[#8B4F23] bg-[#8B4F23] text-white' : 'border-slate-300 bg-white'}`}
                    aria-hidden="true"
                  >
                    {checked ? <FaCheck className="h-2.5 w-2.5" /> : null}
                  </span>
                  <span className="min-w-0 leading-5">{option}</span>
                </label>
              );
            })}
          </div>
        ) : (
          <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
            Esta pergunta ainda não possui opções disponíveis.
          </p>
        )}

        {error ? (
          <p id={errorId} className="mt-3 flex items-start gap-2 text-sm font-medium text-rose-600" role="alert">
            <FaExclamationTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </p>
        ) : null}
      </fieldset>
    );
  }

  if (field.type === 'consent') {
    return (
      <fieldset
        className={`rounded-2xl border bg-[#FCFBF8] p-4 transition sm:p-5 ${error ? 'border-rose-300' : 'border-slate-200'}`}
        aria-describedby={describedBy}
        aria-invalid={Boolean(error)}
      >
        <legend className="w-full px-0">{label}</legend>
        {field.description ? (
          <p id={descriptionId} className="mt-1.5 whitespace-pre-line text-sm leading-6 text-slate-500">
            {field.description}
          </p>
        ) : null}
        <label
          htmlFor={inputId}
          className={`mt-4 flex cursor-pointer items-start gap-3 rounded-xl border-2 bg-white px-4 py-3.5 text-sm leading-6 transition focus-within:ring-4 focus-within:ring-emerald-100 ${
            value === true
              ? 'border-emerald-500 bg-emerald-50/60 text-emerald-950'
              : 'border-slate-200 text-slate-700 hover:border-emerald-300'
          }`}
        >
          <input
            id={inputId}
            type="checkbox"
            checked={value === true}
            onChange={(event) => onChange(event.target.checked)}
            onBlur={onBlur}
            className="sr-only"
          />
          <span
            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 ${
              value === true ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300 bg-white'
            }`}
            aria-hidden="true"
          >
            {value === true ? <FaCheck className="h-2.5 w-2.5" /> : null}
          </span>
          <span>Li e concordo.</span>
        </label>
        {error ? (
          <p id={errorId} className="mt-3 flex items-start gap-2 text-sm font-medium text-rose-600" role="alert">
            <FaExclamationTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </p>
        ) : null}
      </fieldset>
    );
  }

  if (field.type === 'long_text') {
    return (
      <div className={`rounded-2xl border bg-[#FCFBF8] p-4 transition sm:p-5 ${error ? 'border-rose-300' : 'border-slate-200'}`}>
        <label htmlFor={inputId}>{label}</label>
        {field.description ? (
          <p id={descriptionId} className="mt-1.5 whitespace-pre-line text-sm leading-6 text-slate-500">
            {field.description}
          </p>
        ) : null}
        <textarea
          id={inputId}
          value={asInputValue(value)}
          rows={5}
          maxLength={maxLength}
          placeholder={field.placeholder}
          required={field.required}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
          className={`${inputClassName} min-h-32 resize-y`}
        />
        <div className="mt-1.5 flex justify-end text-[11px] tabular-nums text-slate-400" aria-hidden="true">
          {asInputValue(value).length}/{maxLength}
        </div>
        {errorText}
      </div>
    );
  }

  const inputType = field.type === 'email'
    ? 'email'
    : field.type === 'phone'
      ? 'tel'
      : field.type === 'number'
        ? 'number'
        : field.type === 'date'
          ? 'date'
          : 'text';

  return (
    <div className={`rounded-2xl border bg-[#FCFBF8] p-4 transition sm:p-5 ${error ? 'border-rose-300' : 'border-slate-200'}`}>
      <label htmlFor={inputId}>{label}</label>
      {field.description ? (
        <p id={descriptionId} className="mt-1.5 whitespace-pre-line text-sm leading-6 text-slate-500">
          {field.description}
        </p>
      ) : null}
      <input
        id={inputId}
        type={inputType}
        value={asInputValue(value)}
        min={field.type === 'number' ? field.min : undefined}
        max={field.type === 'number' ? field.max : undefined}
        maxLength={field.type === 'number' || field.type === 'date' ? undefined : maxLength}
        inputMode={field.type === 'phone' ? 'tel' : field.type === 'number' ? 'decimal' : undefined}
        autoComplete={field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : undefined}
        placeholder={field.placeholder}
        required={field.required}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        className={inputClassName}
      />
      {errorText}
    </div>
  );
}

export function FormularioPublico() {
  const { publicId = '' } = useParams<{ publicId: string }>();
  const [pageState, setPageState] = useState<PageState>('loading');
  const [form, setForm] = useState<PublicForm | null>(null);
  const [answers, setAnswers] = useState<Record<string, FormAnswerValue>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loadError, setLoadError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [website, setWebsite] = useState('');
  const [confirmationCopy, setConfirmationCopy] = useState<{ title: string; message: string } | null>(null);
  const [schemaNotice, setSchemaNotice] = useState('');
  const schemaRecoveryRef = useRef<{
    form: PublicForm;
    answers: Record<string, FormAnswerValue>;
  } | null>(null);
  const successRef = useRef<HTMLDivElement>(null);

  const endpoint = useMemo(
    () => `${API_BASE}/api/formularios/publico/${encodeURIComponent(publicId)}`,
    [publicId],
  );
  const pendingSubmissionStorageKey = useMemo(
    () => `vagafogo:forms:public-submit:v1:${encodeURIComponent(publicId)}`,
    [publicId],
  );

  useEffect(() => {
    schemaRecoveryRef.current = null;
    setSchemaNotice('');
    setConfirmationCopy(null);
  }, [publicId]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timeoutId = window.setTimeout(() => controller.abort(), 15_000);

    const loadForm = async () => {
      if (!publicId.trim()) {
        setLoadError('O endereço deste formulário é inválido. Confira o link ou QR Code e tente novamente.');
        setPageState('error');
        return;
      }

      setPageState('loading');
      setLoadError('');
      setSubmitError('');

      try {
        const response = await fetch(endpoint, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        });
        const payload = await parseResponseBody(response);
        if (!active) return;

        if (
          response.status === 403
          || response.status === 410
          || response.status === 423
          || (response.status === 409 && getApiCode(payload) === 'FORM_CLOSED')
        ) {
          setForm(normalizePublicForm(payload, publicId));
          setPageState('closed');
          return;
        }

        if (!response.ok) {
          throw new Error(
            getApiMessage(
              payload,
              response.status === 404
                ? 'Este formulário não foi encontrado. Confira se o link está correto.'
                : 'Não foi possível carregar o formulário agora.',
            ),
          );
        }

        const loadedForm = normalizePublicForm(payload, publicId);
        if (!loadedForm) throw new Error('O formulário recebido é inválido.');

        setForm(loadedForm);
        if (loadedForm.status !== 'published') {
          schemaRecoveryRef.current = null;
          setPageState('closed');
          return;
        }

        const recovery = schemaRecoveryRef.current;
        setAnswers(
          recovery
            ? recoverCompatibleAnswers(loadedForm, recovery.form, recovery.answers)
            : getInitialAnswers(loadedForm),
        );
        schemaRecoveryRef.current = null;
        setErrors({});
        setPageState('ready');
      } catch (error) {
        if (!active) return;
        const isAbort = error instanceof DOMException && error.name === 'AbortError';
        setLoadError(
          isAbort
            ? 'O carregamento demorou mais que o esperado. Verifique sua conexão e tente novamente.'
            : error instanceof Error
              ? error.message
              : 'Não foi possível carregar o formulário agora.',
        );
        setPageState('error');
      } finally {
        window.clearTimeout(timeoutId);
      }
    };

    void loadForm();

    return () => {
      active = false;
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [endpoint, loadAttempt, publicId]);

  const answeredCount = useMemo(
    () => form?.fields.filter((field) => isAnswered(answers[field.id])).length ?? 0,
    [answers, form],
  );
  const progress = form && form.fields.length > 0
    ? Math.round((answeredCount / form.fields.length) * 100)
    : 0;

  const validateField = (field: FormField, value = answers[field.id]) => {
    if (field.required && !isAnswered(value)) {
      return field.type === 'consent'
        ? 'Você precisa concordar para continuar.'
        : 'Este campo é obrigatório.';
    }

    if (!isAnswered(value)) return '';

    if (field.type === 'email' && typeof value === 'string') {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) {
        return 'Informe um e-mail válido.';
      }
    }

    if (field.type === 'phone' && typeof value === 'string') {
      const normalized = value.trim();
      const digits = normalized.replace(/\D/g, '');
      if (
        normalized.length > 30
        || digits.length < 7
        || digits.length > 15
        || !/^[0-9+().\s-]+$/u.test(normalized)
      ) {
        return 'Informe um telefone válido.';
      }
    }

    if (field.type === 'number') {
      const numberValue = typeof value === 'number' ? value : Number(value);
      if (!Number.isFinite(numberValue)) return 'Informe um número válido.';
      if (field.min !== undefined && numberValue < field.min) {
        return `O valor mínimo é ${field.min}.`;
      }
      if (field.max !== undefined && numberValue > field.max) {
        return `O valor máximo é ${field.max}.`;
      }
    }

    if (field.type === 'date' && typeof value === 'string') {
      if (!isValidIsoDate(value.trim())) return 'Informe uma data válida.';
    }

    if (typeof value === 'string' && field.maxLength && value.length > field.maxLength) {
      return `Use no máximo ${field.maxLength} caracteres.`;
    }

    return '';
  };

  const updateAnswer = (field: FormField, value: FormAnswerValue) => {
    setAnswers((current) => ({ ...current, [field.id]: value }));
    setErrors((current) => {
      if (!current[field.id]) return current;
      const next = { ...current };
      delete next[field.id];
      return next;
    });
    setSubmitError('');
  };

  const validateOnBlur = (field: FormField) => {
    const message = validateField(field);
    setErrors((current) => {
      const next = { ...current };
      if (message) next[field.id] = message;
      else delete next[field.id];
      return next;
    });
  };

  const focusFirstInvalidField = (field: FormField, index: number) => {
    const baseId = getFieldDomId(field.id, index);
    const targetId = field.type === 'single_choice' || field.type === 'multiple_choice'
      ? `${baseId}-option-0`
      : baseId;
    window.requestAnimationFrame(() => document.getElementById(targetId)?.focus());
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form || submitting) return;

    const nextErrors: Record<string, string> = {};
    form.fields.forEach((field) => {
      const message = validateField(field);
      if (message) nextErrors[field.id] = message;
    });

    setErrors(nextErrors);
    setSubmitError('');
    const firstInvalidIndex = form.fields.findIndex((field) => Boolean(nextErrors[field.id]));
    if (firstInvalidIndex >= 0) {
      setSubmitError('Revise os campos destacados antes de enviar.');
      focusFirstInvalidField(form.fields[firstInvalidIndex], firstInvalidIndex);
      return;
    }

    const normalizedAnswers: Record<string, FormAnswerValue> = {};
    form.fields.forEach((field) => {
      const value = answers[field.id];
      normalizedAnswers[field.id] = field.type === 'number' && typeof value === 'string' && value.trim()
        ? Number(value)
        : value ?? '';
    });

    const controller = new AbortController();
    let timeoutId: number | undefined;

    setSubmitting(true);

    try {
      const submissionFingerprint = await createRequestFingerprint({
        schemaVersion: form.schemaVersion,
        answers: normalizedAnswers,
        _website: website,
      });
      const storedRequest = readPendingRequest(pendingSubmissionStorageKey);
      const pendingRequest = storedRequest?.fingerprint === submissionFingerprint
        ? storedRequest
        : { key: createRequestIdempotencyKey(), fingerprint: submissionFingerprint };
      writePendingRequest(pendingSubmissionStorageKey, pendingRequest);
      timeoutId = window.setTimeout(() => controller.abort(), 20_000);

      const response = await fetch(`${endpoint}/respostas`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'Idempotency-Key': pendingRequest.key,
        },
        signal: controller.signal,
        body: JSON.stringify({
          schemaVersion: form.schemaVersion,
          answers: normalizedAnswers,
          idempotencyKey: pendingRequest.key,
          _website: website,
        }),
      });
      const payload = await parseResponseBody(response);
      const apiCode = getApiCode(payload);

      if (
        (response.status === 409 && apiCode === 'FORM_SCHEMA_CHANGED')
        || apiCode === 'UNKNOWN_FIELDS'
      ) {
        const currentSchemaVersion = isRecord(payload)
          ? normalizePositiveInteger(payload.currentSchemaVersion, 0)
          : 0;
        schemaRecoveryRef.current = { form, answers: normalizedAnswers };
        setErrors({});
        setSchemaNotice(
          currentSchemaVersion > 0
            ? `Este formulário foi atualizado para a versão ${currentSchemaVersion} enquanto você preenchia. Recarregamos as perguntas e mantivemos as respostas compatíveis; revise tudo antes de enviar novamente.`
            : 'Este formulário foi atualizado enquanto você preenchia. Recarregamos as perguntas e mantivemos as respostas compatíveis; revise tudo antes de enviar novamente.',
        );
        setPageState('loading');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        setLoadAttempt((attempt) => attempt + 1);
        return;
      }

      if (
        response.status === 403
        || response.status === 404
        || response.status === 410
        || response.status === 423
        || (response.status === 409 && apiCode === 'FORM_CLOSED')
      ) {
        setPageState('closed');
        return;
      }

      if (response.status === 422) {
        const serverErrors = getApiFieldErrors(payload, form);
        const firstServerErrorIndex = form.fields.findIndex((field) => Boolean(serverErrors[field.id]));
        if (firstServerErrorIndex >= 0) {
          setErrors(serverErrors);
          setSubmitError(getApiMessage(payload, 'Revise os campos destacados e tente novamente.'));
          focusFirstInvalidField(form.fields[firstServerErrorIndex], firstServerErrorIndex);
          return;
        }
      }

      if (!response.ok) {
        const fallback = response.status === 429
          ? 'Muitas tentativas em pouco tempo. Aguarde alguns instantes e tente novamente.'
          : 'Não foi possível enviar sua resposta. Tente novamente.';
        throw new Error(getApiMessage(payload, fallback));
      }

      const responseData = isRecord(payload) ? payload : {};
      clearPendingRequest(pendingSubmissionStorageKey);
      setConfirmationCopy({
        title:
          typeof responseData.confirmationTitle === 'string' && responseData.confirmationTitle.trim()
            ? responseData.confirmationTitle
            : form.confirmationTitle,
        message:
          typeof responseData.confirmationMessage === 'string' && responseData.confirmationMessage.trim()
            ? responseData.confirmationMessage
            : form.confirmationMessage,
      });
      setPageState('success');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      window.requestAnimationFrame(() => successRef.current?.focus());
    } catch (error) {
      setSubmitError(
        error instanceof DOMException && error.name === 'AbortError'
          ? 'O envio demorou mais que o esperado. Tente novamente; sua resposta não será duplicada.'
          : error instanceof Error
          ? error.message
          : 'Não foi possível enviar sua resposta. Verifique sua conexão e tente novamente.',
      );
    } finally {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      setSubmitting(false);
    }
  };

  const renderStateContent = () => {
    if (pageState === 'loading') {
      return (
        <div className="rounded-[28px] border border-white/80 bg-white/90 p-6 shadow-xl shadow-[#8B4F23]/10 backdrop-blur sm:p-9" role="status" aria-live="polite">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#8B4F23]/10 text-[#8B4F23]">
            <FaLeaf className="h-6 w-6 animate-pulse" aria-hidden="true" />
          </div>
          <p className="mt-5 text-center text-sm font-semibold text-[#2D1E0F]">Carregando formulário...</p>
          <div className="mt-7 space-y-3" aria-hidden="true">
            <div className="h-24 animate-pulse rounded-2xl bg-slate-100" />
            <div className="h-24 animate-pulse rounded-2xl bg-slate-100" />
            <div className="h-12 animate-pulse rounded-xl bg-slate-100" />
          </div>
        </div>
      );
    }

    if (pageState === 'closed') {
      return (
        <div className="overflow-hidden rounded-[28px] border border-amber-200 bg-white shadow-xl shadow-[#8B4F23]/10">
          <div className="h-1.5 bg-gradient-to-r from-[#8B4F23] via-[#E0B13C] to-[#8B4F23]" />
          <div className="p-7 text-center sm:p-10">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
              <FaLock className="h-6 w-6" aria-hidden="true" />
            </div>
            <p className="mt-5 text-xs font-bold uppercase tracking-[0.24em] text-amber-700">Formulário indisponível</p>
            <h1 className="mt-2 font-display text-2xl font-bold text-[#2D1E0F] sm:text-3xl">
              {form?.title || 'Este formulário está fechado'}
            </h1>
            <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-slate-600">
              Este formulário não está recebendo respostas no momento. Se precisar de ajuda, entre em contato com a equipe Vagafogo.
            </p>
            <Link to="/" className="mt-7 inline-flex items-center justify-center gap-2 rounded-full bg-[#8B4F23] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#70401c]">
              <FaArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              Voltar ao site
            </Link>
          </div>
        </div>
      );
    }

    if (pageState === 'error') {
      return (
        <div className="overflow-hidden rounded-[28px] border border-rose-200 bg-white shadow-xl shadow-[#8B4F23]/10" role="alert">
          <div className="h-1.5 bg-gradient-to-r from-rose-500 via-amber-400 to-rose-500" />
          <div className="p-7 text-center sm:p-10">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-100 text-rose-600">
              <FaExclamationTriangle className="h-6 w-6" aria-hidden="true" />
            </div>
            <p className="mt-5 text-xs font-bold uppercase tracking-[0.24em] text-rose-600">Não foi possível abrir</p>
            <h1 className="mt-2 font-display text-2xl font-bold text-[#2D1E0F] sm:text-3xl">Formulário não disponível</h1>
            <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-slate-600">{loadError}</p>
            <div className="mt-7 flex flex-col justify-center gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => setLoadAttempt((attempt) => attempt + 1)}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-[#8B4F23] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#70401c]"
              >
                <FaRedo className="h-3.5 w-3.5" aria-hidden="true" />
                Tentar novamente
              </button>
              <Link to="/" className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">
                Voltar ao site
              </Link>
            </div>
          </div>
        </div>
      );
    }

    if (pageState === 'success' && form) {
      return (
        <div
          ref={successRef}
          tabIndex={-1}
          className="overflow-hidden rounded-[28px] border border-emerald-200 bg-white shadow-xl shadow-emerald-900/10 outline-none"
          role="status"
          aria-live="polite"
        >
          <div className="h-1.5 bg-gradient-to-r from-emerald-700 via-[#E0B13C] to-emerald-700" />
          <div className="p-7 text-center sm:p-11">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 ring-8 ring-emerald-50">
              <FaCheckCircle className="h-9 w-9" aria-hidden="true" />
            </div>
            <p className="mt-7 text-xs font-bold uppercase tracking-[0.24em] text-emerald-700">Envio concluído</p>
            <h1 className="mt-2 font-display text-3xl font-bold text-[#2D1E0F] sm:text-4xl">{confirmationCopy?.title || form.confirmationTitle}</h1>
            <p className="mx-auto mt-4 max-w-xl whitespace-pre-line text-base leading-7 text-slate-600">{confirmationCopy?.message || form.confirmationMessage}</p>
            <div className="mx-auto mt-7 flex max-w-md items-start gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/70 px-4 py-3 text-left text-sm leading-6 text-emerald-900">
              <FaShieldAlt className="mt-1 h-4 w-4 shrink-0 text-emerald-700" aria-hidden="true" />
              <p>Sua resposta foi registrada com segurança. Você já pode fechar esta página.</p>
            </div>
            <Link to="/" className="mt-7 inline-flex items-center justify-center gap-2 rounded-full bg-[#8B4F23] px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#70401c]">
              Conhecer o Vagafogo
            </Link>
          </div>
        </div>
      );
    }

    if (!form) return null;

    return (
      <article className="overflow-hidden rounded-[28px] border border-white/80 bg-white/95 shadow-2xl shadow-[#8B4F23]/10 backdrop-blur">
        <div className="h-1.5 bg-gradient-to-r from-[#8B4F23] via-[#E0B13C] to-[#8B4F23]" />
        <div className="border-b border-slate-100 px-5 py-6 sm:px-8 sm:py-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-700">
              <FaShieldAlt className="h-3 w-3" aria-hidden="true" />
              Formulário oficial
            </span>
            <span className="text-xs font-medium text-slate-400">
              {form.fields.length} {form.fields.length === 1 ? 'pergunta' : 'perguntas'}
            </span>
          </div>
          <h1 className="mt-5 font-display text-3xl font-bold leading-tight text-[#2D1E0F] sm:text-4xl">{form.title}</h1>
          {form.description ? (
            <p className="mt-3 max-w-2xl whitespace-pre-line text-sm leading-7 text-slate-600 sm:text-base">{form.description}</p>
          ) : null}

          <div
            className="mt-6"
            role="progressbar"
            aria-label="Progresso do formulário"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
          >
            <div className="flex items-center justify-between gap-3 text-xs font-medium text-slate-500">
              <span>Seu progresso</span>
              <span className="tabular-nums">{answeredCount} de {form.fields.length} respondidas</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#8B4F23] to-[#E0B13C] transition-[width] duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} noValidate className="px-4 py-5 sm:px-8 sm:py-8">
          <div className="pointer-events-none absolute -left-[10000px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
            <label htmlFor="company-website">Não preencha este campo</label>
            <input
              id="company-website"
              name="website"
              type="text"
              value={website}
              onChange={(event) => setWebsite(event.target.value)}
              tabIndex={-1}
              autoComplete="off"
            />
          </div>

          {schemaNotice ? (
            <div className="mb-5 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900" role="status" aria-live="polite">
              <FaSyncAlt className="mt-1 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
              <span>{schemaNotice}</span>
            </div>
          ) : null}

          {submitError ? (
            <div className="mb-5 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-700" role="alert">
              <FaExclamationTriangle className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{submitError}</span>
            </div>
          ) : null}

          <div className="space-y-4">
            {form.fields.map((field, index) => (
              <FieldCard
                key={field.id}
                field={field}
                index={index}
                value={answers[field.id]}
                error={errors[field.id]}
                onChange={(value) => updateAnswer(field, value)}
                onBlur={() => validateOnBlur(field)}
              />
            ))}
          </div>

          <div className="mt-7 rounded-2xl border border-[#8B4F23]/10 bg-[#8B4F23]/[0.035] p-4 sm:p-5">
            {form.privacyMessage ? (
              <div className="flex items-start gap-3 text-sm leading-6 text-slate-600">
                <FaLock className="mt-1 h-3.5 w-3.5 shrink-0 text-[#8B4F23]" aria-hidden="true" />
                <p className="whitespace-pre-line">{form.privacyMessage}</p>
              </div>
            ) : (
              <div className="flex items-start gap-3 text-sm leading-6 text-slate-600">
                <FaLock className="mt-1 h-3.5 w-3.5 shrink-0 text-[#8B4F23]" aria-hidden="true" />
                <p>As informações enviadas serão usadas apenas pela equipe Vagafogo para a finalidade deste formulário.</p>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#8B4F23] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-[#8B4F23]/15 transition hover:-translate-y-0.5 hover:bg-[#70401c] hover:shadow-xl disabled:cursor-wait disabled:translate-y-0 disabled:bg-slate-400 sm:w-auto sm:min-w-52"
            >
              {submitting ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" />
                  Enviando...
                </>
              ) : (
                <>
                  <FaPaperPlane className="h-3.5 w-3.5" aria-hidden="true" />
                  {form.submitButtonLabel}
                </>
              )}
            </button>
          </div>
        </form>
      </article>
    );
  };

  return (
    <div
      className="relative min-h-screen overflow-hidden bg-[#F7FAEF]"
      style={{ background: 'linear-gradient(155deg, #F7FAEF 0%, #f2eee5 48%, #eef5e9 100%)' }}
    >
      <div className="pointer-events-none absolute -left-32 top-24 h-80 w-80 rounded-full bg-[#E0B13C]/10 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute -right-40 top-1/3 h-96 w-96 rounded-full bg-emerald-600/10 blur-3xl" aria-hidden="true" />

      <header className="relative z-10 mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-5 sm:px-6 sm:py-7">
        <Link
          to="/"
          className="inline-flex items-center gap-2 rounded-full border border-[#8B4F23]/15 bg-white/80 px-3.5 py-2 text-xs font-semibold text-[#8B4F23] shadow-sm backdrop-blur transition hover:bg-white hover:shadow-md sm:text-sm"
        >
          <FaArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Voltar</span>
        </Link>

        <Link to="/" className="flex items-center gap-2.5 text-right">
          <div>
            <p className="text-sm font-bold tracking-[0.16em] text-[#2D1E0F]">VAGAFOGO</p>
            <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-[#8B4F23]/70">Santuário Natural</p>
          </div>
          <img src={logo} alt="Vagafogo" className="h-11 w-11 rounded-full border-2 border-[#8B4F23]/15 object-cover shadow-sm" />
        </Link>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-3xl px-4 pb-12 pt-2 sm:px-6 sm:pb-16 sm:pt-4">
        {renderStateContent()}
      </main>

      <footer className="relative z-10 border-t border-[#8B4F23]/10 bg-white/30 px-4 py-5 text-center backdrop-blur-sm">
        <div className="flex flex-col items-center justify-center gap-1 text-xs text-slate-500 sm:flex-row sm:gap-2">
          <span className="inline-flex items-center gap-1.5 font-medium text-[#8B4F23]">
            <FaLeaf className="h-3 w-3" aria-hidden="true" />
            Santuário Vagafogo
          </span>
          <span className="hidden text-slate-300 sm:inline" aria-hidden="true">•</span>
          <span>Pirenópolis, Goiás</span>
        </div>
      </footer>
    </div>
  );
}
