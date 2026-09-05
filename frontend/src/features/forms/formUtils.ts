import type {
  FormDraft,
  FormField,
  FormFieldType,
  FormResponse,
  FormResponseAnswer,
  ManagedForm,
} from './types';

export const FORM_FIELD_LABELS: Record<FormFieldType, string> = {
  short_text: 'Texto curto',
  long_text: 'Texto longo',
  email: 'E-mail',
  phone: 'Telefone',
  number: 'Número',
  date: 'Data',
  single_choice: 'Escolha única',
  multiple_choice: 'Múltipla escolha',
  consent: 'Aceite / confirmação',
};

export const createStableId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
};

export const createEmptyField = (type: FormFieldType = 'short_text'): FormField => ({
  id: createStableId(),
  type,
  label: type === 'consent' ? 'Li e concordo com as informações acima' : '',
  description: '',
  placeholder: '',
  required: type === 'consent',
  options: type === 'single_choice' || type === 'multiple_choice' ? ['Opção 1', 'Opção 2'] : undefined,
});

export const createEmptyForm = (): FormDraft => ({
  publicId: createStableId(),
  schemaVersion: 1,
  title: 'Novo formulário',
  description: '',
  status: 'draft',
  fields: [
    {
      ...createEmptyField('short_text'),
      label: 'Nome completo',
      placeholder: 'Digite seu nome',
      required: true,
    },
    {
      ...createEmptyField('email'),
      label: 'E-mail',
      placeholder: 'voce@exemplo.com',
      required: true,
    },
  ],
  confirmationTitle: 'Resposta enviada!',
  confirmationMessage: 'Recebemos suas informações. Obrigado por responder.',
  privacyMessage:
    'Seus dados serão utilizados apenas para a finalidade informada neste formulário e tratados com segurança.',
  submitButtonLabel: 'Enviar resposta',
  responseCount: 0,
});

export const cloneFormAsDraft = (form: ManagedForm): FormDraft => ({
  publicId: createStableId(),
  schemaVersion: 1,
  title: `${form.title} (cópia)`,
  description: form.description,
  status: 'draft',
  fields: form.fields.map((field) => ({ ...field, id: createStableId(), options: field.options ? [...field.options] : undefined })),
  confirmationTitle: form.confirmationTitle,
  confirmationMessage: form.confirmationMessage,
  privacyMessage: form.privacyMessage,
  submitButtonLabel: form.submitButtonLabel,
  responseCount: 0,
});

export const formatFormDate = (value: unknown) => {
  if (!value) return '—';
  let date: Date | null = null;
  if (value instanceof Date) date = value;
  if (typeof value === 'string' || typeof value === 'number') date = new Date(value);
  if (typeof value === 'object' && value !== null && 'toDate' in value) {
    const toDate = (value as { toDate?: () => Date }).toDate;
    if (typeof toDate === 'function') date = toDate.call(value);
  }
  if (!date || Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
};

const escapeCsvCell = (value: unknown) => {
  const normalized = Array.isArray(value) ? value.join('; ') : String(value ?? '');
  const formulaSafe = /^(?:\s*[=+\-@]|[\t\r])/.test(normalized) ? `'${normalized}` : normalized;
  return `"${formulaSafe.replace(/"/g, '""')}"`;
};

export const getResponseHistoricalAnswers = (
  response: FormResponse,
  form: ManagedForm,
): FormResponseAnswer[] => {
  if (response.answerSnapshot.length > 0) return response.answerSnapshot;

  return form.fields
    .filter((field) => Object.prototype.hasOwnProperty.call(response.answers, field.id))
    .map((field) => ({
      fieldId: field.id,
      label: field.label,
      type: field.type,
      value: response.answers[field.id] ?? '',
    }));
};

const historicalColumnKey = (
  answer: FormResponseAnswer,
  schemaVersion: number | undefined,
) => [
  schemaVersion ?? 'legacy',
  answer.fieldId,
  answer.type,
  answer.label,
].join('\u0000');

export const downloadResponsesCsv = (form: ManagedForm, responses: FormResponse[]) => {
  const responseSnapshots = responses.map((response) => ({
    response,
    answers: getResponseHistoricalAnswers(response, form),
  }));
  const columns = Array.from(new Map(
    responseSnapshots.flatMap(({ response, answers }) => answers.map((answer) => {
      const key = historicalColumnKey(answer, response.schemaVersion);
      return [key, {
        key,
        label: answer.label,
        fieldId: answer.fieldId,
        schemaVersion: response.schemaVersion,
      }] as const;
    })),
  ).values());
  const header = [
    'Data de envio',
    'Versão do formulário',
    ...columns.map((column) => `${column.label} [campo ${column.fieldId}; versão ${column.schemaVersion ?? 'legada'}]`),
  ];
  const rows = responseSnapshots.map(({ response, answers }) => {
    const values = new Map(
      answers.map((answer) => [historicalColumnKey(answer, response.schemaVersion), answer.value]),
    );
    return [
      formatFormDate(response.submittedAt),
      response.schemaVersion ?? 'Legada',
      ...columns.map((column) => values.get(column.key) ?? ''),
    ];
  });
  const csv = `\uFEFF${[header, ...rows].map((row) => row.map(escapeCsvCell).join(',')).join('\r\n')}`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${form.title.toLowerCase().replace(/[^a-z0-9]+/gi, '-').replace(/(^-|-$)/g, '') || 'formulario'}-respostas.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const getPublicFormUrl = (publicId: string) => {
  const configuredBase = (import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined)?.trim();
  const base = configuredBase || (typeof window !== 'undefined' ? window.location.origin : '');
  return `${base.replace(/\/$/, '')}/formulario/${encodeURIComponent(publicId)}`;
};

export const getQrCodeUrl = (publicId: string, download = false, format: 'png' | 'svg' = 'png') => {
  const apiBase = (import.meta.env.VITE_API_BASE as string | undefined)?.trim()
    || 'https://vagafogo-production.up.railway.app';
  const params = new URLSearchParams({ url: getPublicFormUrl(publicId), format });
  if (download) params.set('download', '1');
  return `${apiBase.replace(/\/$/, '')}/api/formularios/publico/${encodeURIComponent(publicId)}/qrcode?${params.toString()}`;
};
