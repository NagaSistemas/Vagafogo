import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  FaArrowDown,
  FaArrowUp,
  FaCheck,
  FaClipboardCheck,
  FaClipboardList,
  FaClone,
  FaCopy,
  FaDownload,
  FaEdit,
  FaExternalLinkAlt,
  FaEye,
  FaFileCsv,
  FaInbox,
  FaLink,
  FaPause,
  FaPlay,
  FaPlus,
  FaQrcode,
  FaSearch,
  FaSyncAlt,
  FaTimes,
  FaTrash,
} from 'react-icons/fa';
import {
  cloneFormAsDraft,
  createEmptyField,
  createEmptyForm,
  downloadResponsesCsv,
  FORM_FIELD_LABELS,
  formatFormDate,
  getPublicFormUrl,
  getQrCodeUrl,
  getResponseHistoricalAnswers,
} from './formUtils';
import {
  deleteFormResponse,
  deleteFormWithResponses,
  listFormResponses,
  listForms,
  saveForm,
  setFormStatus,
  isFormsApiError,
} from './formsService';
import type {
  FormDraft,
  FormField,
  FormFieldType,
  FormResponse,
  FormStatus,
  ManagedForm,
} from './types';
import './AdminForms.css';

type Notice = { type: 'success' | 'error'; message: string } | null;

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message.trim() ? error.message : fallback;

const STATUS_CONFIG: Record<FormStatus, { label: string; className: string }> = {
  draft: { label: 'Rascunho', className: 'border-slate-200 bg-slate-100 text-slate-600' },
  published: { label: 'Recebendo respostas', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  closed: { label: 'Pausado', className: 'border-amber-200 bg-amber-50 text-amber-700' },
};

const CONTROL_CLASS =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 shadow-sm transition focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200';

const modalStack: symbol[] = [];

function Modal({ children, onClose, label, wide = false, nested = false }: { children: ReactNode; onClose: () => void; label: string; wide?: boolean; nested?: boolean }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const stackIdRef = useRef(Symbol('admin-forms-modal'));

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const stackId = stackIdRef.current;
    modalStack.push(stackId);
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (modalStack[modalStack.length - 1] !== stackId) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => !element.hasAttribute('aria-hidden'));
      if (focusable.length === 0) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      const stackIndex = modalStack.lastIndexOf(stackId);
      if (stackIndex >= 0) modalStack.splice(stackIndex, 1);
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, []);

  return (
    <div
      className={`fixed inset-0 ${nested ? 'z-[90]' : 'z-[80]'} flex items-start justify-center overflow-y-auto bg-slate-950/65 px-3 py-5 backdrop-blur-sm sm:px-6 sm:py-8`}
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
      role="presentation"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={`w-full ${wide ? 'max-w-7xl' : 'max-w-3xl'} rounded-3xl border border-white/20 bg-slate-50 shadow-2xl outline-none`}
      >
        {children}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: FormStatus }) {
  const config = STATUS_CONFIG[status];
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${config.className}`}>
      {config.label}
    </span>
  );
}

function FormFieldPreview({ field }: { field: FormField }) {
  const label = field.label.trim() || 'Pergunta sem título';
  const shared = 'mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-400';
  return (
    <div>
      <p className="text-sm font-semibold text-slate-800">
        {label} {field.required ? <span className="text-rose-500">*</span> : null}
      </p>
      {field.description ? <p className="mt-1 text-xs leading-5 text-slate-500">{field.description}</p> : null}
      {field.type === 'long_text' ? (
        <div className={`${shared} min-h-[80px]`}>{field.placeholder || 'Resposta longa'}</div>
      ) : field.type === 'single_choice' || field.type === 'multiple_choice' ? (
        <div className="mt-2 space-y-2">
          {(field.options ?? []).filter(Boolean).map((option, index) => (
            <div key={`${option}-${index}`} className="flex items-center gap-2 text-sm text-slate-600">
              <span className={`h-4 w-4 border border-slate-300 ${field.type === 'single_choice' ? 'rounded-full' : 'rounded'}`} />
              {option}
            </div>
          ))}
        </div>
      ) : field.type === 'consent' ? (
        <div className="mt-2 flex items-start gap-2 text-sm text-slate-600">
          <span className="mt-0.5 h-4 w-4 shrink-0 rounded border border-slate-300" />
          <span>{label}</span>
        </div>
      ) : (
        <div className={shared}>{field.placeholder || FORM_FIELD_LABELS[field.type]}</div>
      )}
    </div>
  );
}

function FormPreview({ draft }: { draft: FormDraft }) {
  return (
    <div className="forms-public-preview overflow-hidden rounded-2xl border border-slate-200 bg-[#f7f5ef] shadow-sm">
      <div className="border-b border-amber-900/10 bg-gradient-to-br from-[#382414] to-[#75451f] px-5 py-6 text-white">
        <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-amber-200">Pré-visualização</p>
        <h3 className="mt-2 text-xl font-semibold">{draft.title || 'Formulário sem título'}</h3>
        {draft.description ? <p className="mt-2 text-sm leading-6 text-white/75">{draft.description}</p> : null}
      </div>
      <div className="space-y-5 p-5">
        {draft.fields.length > 0 ? (
          draft.fields.map((field) => <FormFieldPreview key={field.id} field={field} />)
        ) : (
          <p className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
            Adicione a primeira pergunta.
          </p>
        )}
        <button type="button" disabled className="w-full rounded-xl bg-[#8B4F23] px-4 py-3 text-sm font-semibold text-white opacity-90">
          {draft.submitButtonLabel || 'Enviar resposta'}
        </button>
        {draft.privacyMessage ? <p className="text-center text-[11px] leading-5 text-slate-500">{draft.privacyMessage}</p> : null}
      </div>
    </div>
  );
}

function FieldEditor({
  field,
  index,
  total,
  onChange,
  onMove,
  onDuplicate,
  onRemove,
}: {
  field: FormField;
  index: number;
  total: number;
  onChange: (next: FormField) => void;
  onMove: (direction: -1 | 1) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const hasOptions = field.type === 'single_choice' || field.type === 'multiple_choice';
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-xs font-bold text-emerald-700">{index + 1}</span>
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">{FORM_FIELD_LABELS[field.type]}</span>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => onMove(-1)} disabled={index === 0} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-25" aria-label="Mover pergunta para cima">
            <FaArrowUp className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={() => onMove(1)} disabled={index === total - 1} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-25" aria-label="Mover pergunta para baixo">
            <FaArrowDown className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={onDuplicate} disabled={total >= 50} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-25" aria-label="Duplicar pergunta">
            <FaCopy className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={onRemove} className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label="Excluir pergunta">
            <FaTrash className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="sm:col-span-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Pergunta
          <input value={field.label} onChange={(event) => onChange({ ...field, label: event.target.value })} className={`${CONTROL_CLASS} mt-1.5`} maxLength={180} placeholder="Digite a pergunta" />
        </label>
        <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Tipo de resposta
          <select
            value={field.type}
            onChange={(event) => {
              const type = event.target.value as FormFieldType;
              onChange({
                ...field,
                type,
                options: type === 'single_choice' || type === 'multiple_choice' ? field.options ?? ['Opção 1', 'Opção 2'] : undefined,
                required: type === 'consent' ? true : field.required,
              });
            }}
            className={`${CONTROL_CLASS} mt-1.5`}
          >
            {Object.entries(FORM_FIELD_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Texto de apoio
          <input value={field.description ?? ''} onChange={(event) => onChange({ ...field, description: event.target.value })} className={`${CONTROL_CLASS} mt-1.5`} maxLength={300} placeholder="Opcional" />
        </label>
        {!hasOptions && field.type !== 'consent' ? (
          <label className="sm:col-span-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Placeholder
            <input value={field.placeholder ?? ''} onChange={(event) => onChange({ ...field, placeholder: event.target.value })} className={`${CONTROL_CLASS} mt-1.5`} maxLength={160} placeholder="Exemplo mostrado dentro do campo" />
          </label>
        ) : null}
      </div>

      {hasOptions ? (
        <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Opções</p>
            <button type="button" onClick={() => onChange({ ...field, options: [...(field.options ?? []), `Opção ${(field.options?.length ?? 0) + 1}`] })} disabled={(field.options?.length ?? 0) >= 100} className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-800 disabled:cursor-not-allowed disabled:opacity-40">
              <FaPlus className="h-3 w-3" /> Adicionar
            </button>
          </div>
          <div className="mt-3 space-y-2">
            {(field.options ?? []).map((option, optionIndex) => (
              <div key={optionIndex} className="flex items-center gap-2">
                <input
                  value={option}
                  onChange={(event) => onChange({ ...field, options: (field.options ?? []).map((item, indexItem) => indexItem === optionIndex ? event.target.value : item) })}
                  className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                  maxLength={120}
                  aria-label={`Opção ${optionIndex + 1} da pergunta ${field.label || index + 1}`}
                />
                <button type="button" onClick={() => onChange({ ...field, options: (field.options ?? []).filter((_, indexItem) => indexItem !== optionIndex) })} className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label="Remover opção">
                  <FaTimes className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-5 border-t border-slate-100 pt-4">
        <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-600">
          <input type="checkbox" checked={field.required} onChange={(event) => onChange({ ...field, required: event.target.checked })} disabled={field.type === 'consent'} className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />
          Resposta obrigatória
        </label>
        {(field.type === 'short_text' || field.type === 'long_text') ? (
          <label className="flex items-center gap-2 text-sm text-slate-600">
            Limite
            <input type="number" min={20} max={5000} value={field.maxLength ?? (field.type === 'long_text' ? 2000 : 300)} onChange={(event) => onChange({ ...field, maxLength: Number(event.target.value) })} className="w-24 rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
            caracteres
          </label>
        ) : null}
        {field.type === 'number' ? (
          <>
            <label className="flex items-center gap-2 text-sm text-slate-600">Mín. <input type="number" value={field.min ?? ''} onChange={(event) => onChange({ ...field, min: event.target.value === '' ? undefined : Number(event.target.value) })} className="w-24 rounded-lg border border-slate-200 px-2 py-1.5 text-sm" /></label>
            <label className="flex items-center gap-2 text-sm text-slate-600">Máx. <input type="number" value={field.max ?? ''} onChange={(event) => onChange({ ...field, max: event.target.value === '' ? undefined : Number(event.target.value) })} className="w-24 rounded-lg border border-slate-200 px-2 py-1.5 text-sm" /></label>
          </>
        ) : null}
      </div>
    </article>
  );
}

function validateDraft(draft: FormDraft, publishing: boolean) {
  if (!draft.title.trim()) return 'Informe um título para o formulário.';
  if (draft.title.trim().length > 160) return 'O título deve ter no máximo 160 caracteres.';
  if (publishing && draft.fields.length === 0) return 'Adicione pelo menos uma pergunta antes de publicar.';
  if (draft.fields.length > 50) return 'O formulário pode ter no máximo 50 perguntas.';
  const invalidField = draft.fields.find((field) => !field.label.trim());
  if (invalidField) return 'Todas as perguntas precisam de um título.';
  const invalidOptions = draft.fields.find(
    (field) => (field.type === 'single_choice' || field.type === 'multiple_choice')
      && (field.options ?? []).filter((option) => option.trim()).length < 2,
  );
  if (invalidOptions) return `A pergunta “${invalidOptions.label}” precisa de pelo menos duas opções.`;
  const tooManyOptions = draft.fields.find((field) => (field.options?.length ?? 0) > 100);
  if (tooManyOptions) return `A pergunta “${tooManyOptions.label}” pode ter no máximo 100 opções.`;
  const repeatedOptions = draft.fields.find((field) => {
    const options = (field.options ?? []).map((option) => option.trim().toLocaleLowerCase('pt-BR')).filter(Boolean);
    return new Set(options).size !== options.length;
  });
  if (repeatedOptions) return `A pergunta “${repeatedOptions.label}” possui opções repetidas.`;
  const invalidTextLimit = draft.fields.find(
    (field) => (field.type === 'short_text' || field.type === 'long_text')
      && field.maxLength !== undefined
      && (!Number.isInteger(field.maxLength) || field.maxLength < 1 || field.maxLength > 5000),
  );
  if (invalidTextLimit) return `O limite de caracteres de “${invalidTextLimit.label}” deve ficar entre 1 e 5.000.`;
  const invalidRange = draft.fields.find(
    (field) => field.type === 'number' && field.min !== undefined && field.max !== undefined && field.min > field.max,
  );
  if (invalidRange) return `O valor mínimo de “${invalidRange.label}” não pode ser maior que o máximo.`;
  return null;
}

function FormEditor({ initial, busy, onClose, onReload, onSave }: { initial: FormDraft; busy: boolean; onClose: () => void; onReload: () => void; onSave: (draft: FormDraft, status: FormStatus) => Promise<void> }) {
  const [draft, setDraft] = useState<FormDraft>(() => ({ ...initial, fields: initial.fields.map((field) => ({ ...field, options: field.options ? [...field.options] : undefined })) }));
  const [error, setError] = useState('');
  const [hasConflict, setHasConflict] = useState(false);

  const updateField = (index: number, next: FormField) => setDraft((current) => ({ ...current, fields: current.fields.map((field, fieldIndex) => fieldIndex === index ? next : field) }));
  const moveField = (index: number, direction: -1 | 1) => setDraft((current) => {
    const target = index + direction;
    if (target < 0 || target >= current.fields.length) return current;
    const fields = [...current.fields];
    [fields[index], fields[target]] = [fields[target], fields[index]];
    return { ...current, fields };
  });

  const submit = async (status: FormStatus) => {
    const validation = validateDraft(draft, status === 'published');
    if (validation) {
      setError(validation);
      return;
    }
    setError('');
    setHasConflict(false);
    try {
      await onSave(draft, status);
    } catch (saveError) {
      if (isFormsApiError(saveError, 'FORM_EDIT_CONFLICT')) {
        setHasConflict(true);
        setError(
          saveError.currentRevision
            ? `Este formulário já está na revisão ${saveError.currentRevision} porque foi alterado em outra sessão. Suas mudanças locais não foram salvas.`
            : 'Este formulário foi alterado em outra sessão. Suas mudanças locais não foram salvas.',
        );
        return;
      }
      setError(getErrorMessage(saveError, 'Não foi possível salvar o formulário.'));
    }
  };

  const reloadCurrentVersion = () => {
    if (!window.confirm('Descartar suas alterações locais e carregar a versão mais recente do formulário?')) return;
    onReload();
  };

  const requestClose = () => {
    const changed = JSON.stringify(draft) !== JSON.stringify(initial);
    if (changed && !window.confirm('Descartar as alterações não salvas deste formulário?')) return;
    onClose();
  };

  return (
    <Modal onClose={requestClose} label={initial.id ? `Editar ${initial.title}` : 'Criar formulário'} wide>
      <div className="sticky top-0 z-10 flex flex-col gap-4 border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:px-7">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-700">Construtor de formulário</p>
          <h2 className="mt-1 text-xl font-semibold text-slate-900">{initial.id ? 'Editar formulário' : 'Criar formulário'}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={requestClose} disabled={busy} className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancelar</button>
          {initial.status !== 'published' ? (
            <button type="button" onClick={() => submit(initial.status)} disabled={busy} className="rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50">
              {initial.status === 'closed' ? 'Salvar sem reabrir' : 'Salvar rascunho'}
            </button>
          ) : null}
          <button type="button" onClick={() => submit('published')} disabled={busy} className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50">
            <FaCheck className="h-3.5 w-3.5" /> {busy ? 'Salvando...' : initial.status === 'published' ? 'Salvar alterações' : 'Salvar e publicar'}
          </button>
          <button type="button" onClick={requestClose} className="ml-1 rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Fechar editor"><FaTimes /></button>
        </div>
      </div>

      <div className="grid gap-6 p-5 sm:p-7 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.75fr)]">
        <div className="space-y-5">
          {error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700" role="alert">
              <p>{error}</p>
              {hasConflict ? (
                <button type="button" onClick={reloadCurrentVersion} className="mt-3 rounded-full border border-rose-300 bg-white px-4 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100">
                  Descartar alterações e carregar versão atual
                </button>
              ) : null}
            </div>
          ) : null}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4">
              <h3 className="text-base font-semibold text-slate-900">Informações principais</h3>
              <p className="mt-1 text-sm text-slate-500">Apresente o objetivo do formulário de forma clara para o visitante.</p>
            </div>
            <div className="space-y-4">
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Título <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} className={`${CONTROL_CLASS} mt-1.5`} maxLength={160} /></label>
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Descrição <textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} className={`${CONTROL_CLASS} mt-1.5 min-h-[96px] resize-y`} maxLength={1500} placeholder="Explique por que estas informações estão sendo coletadas." /></label>
            </div>
          </section>

          <section>
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <div><h3 className="text-base font-semibold text-slate-900">Perguntas</h3><p className="mt-1 text-sm text-slate-500">{draft.fields.length} de 50 campos utilizados</p></div>
              <button type="button" onClick={() => setDraft({ ...draft, fields: [...draft.fields, createEmptyField()] })} disabled={draft.fields.length >= 50} className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-40"><FaPlus className="h-3.5 w-3.5" /> Nova pergunta</button>
            </div>
            <div className="space-y-3">
              {draft.fields.map((field, index) => (
                <FieldEditor
                  key={field.id}
                  field={field}
                  index={index}
                  total={draft.fields.length}
                  onChange={(next) => updateField(index, next)}
                  onMove={(direction) => moveField(index, direction)}
                  onDuplicate={() => setDraft((current) => ({ ...current, fields: [...current.fields.slice(0, index + 1), { ...field, id: createEmptyField(field.type).id, label: `${field.label} (cópia)`, options: field.options ? [...field.options] : undefined }, ...current.fields.slice(index + 1)] }))}
                  onRemove={() => setDraft((current) => ({ ...current, fields: current.fields.filter((_, fieldIndex) => fieldIndex !== index) }))}
                />
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-base font-semibold text-slate-900">Depois do envio</h3>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Título de confirmação <input value={draft.confirmationTitle} onChange={(event) => setDraft({ ...draft, confirmationTitle: event.target.value })} className={`${CONTROL_CLASS} mt-1.5`} maxLength={160} /></label>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Texto do botão <input value={draft.submitButtonLabel} onChange={(event) => setDraft({ ...draft, submitButtonLabel: event.target.value })} className={`${CONTROL_CLASS} mt-1.5`} maxLength={60} /></label>
              <label className="sm:col-span-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Mensagem de confirmação <textarea value={draft.confirmationMessage} onChange={(event) => setDraft({ ...draft, confirmationMessage: event.target.value })} className={`${CONTROL_CLASS} mt-1.5 min-h-[80px]`} maxLength={600} /></label>
              <label className="sm:col-span-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Aviso de privacidade <textarea value={draft.privacyMessage} onChange={(event) => setDraft({ ...draft, privacyMessage: event.target.value })} className={`${CONTROL_CLASS} mt-1.5 min-h-[80px]`} maxLength={1000} /></label>
            </div>
          </section>
        </div>

        <aside className="xl:sticky xl:top-24 xl:self-start">
          <FormPreview draft={draft} />
          <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs leading-5 text-emerald-800">
            O endereço público e o QR Code não mudam quando você edita este formulário.
          </div>
        </aside>
      </div>
    </Modal>
  );
}

function QrDialog({ form, onClose, onNotice }: { form: ManagedForm; onClose: () => void; onNotice: (notice: Notice) => void }) {
  const publicUrl = getPublicFormUrl(form.publicId);
  const [qrState, setQrState] = useState<'loading' | 'ready' | 'error'>('loading');
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      onNotice({ type: 'success', message: 'Link copiado para a área de transferência.' });
    } catch {
      onNotice({ type: 'error', message: 'Não foi possível copiar o link.' });
    }
  };
  return (
    <Modal onClose={onClose} label={`QR Code de ${form.title}`}>
      <div className="flex items-start justify-between border-b border-slate-200 bg-white px-6 py-5">
        <div><p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-700">Acesso permanente</p><h2 className="mt-1 text-xl font-semibold text-slate-900">QR Code do formulário</h2></div>
        <button type="button" onClick={onClose} className="rounded-full p-2 text-slate-400 hover:bg-slate-100" aria-label="Fechar"><FaTimes /></button>
      </div>
      <div className="grid gap-6 p-6 md:grid-cols-[260px_1fr]">
        <div className="relative flex aspect-square items-center justify-center rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          {qrState === 'loading' ? <div className="absolute inset-4 animate-pulse rounded-xl bg-slate-100" role="status" aria-label="Carregando QR Code" /> : null}
          {qrState === 'error' ? <div className="absolute inset-4 flex flex-col items-center justify-center rounded-xl border border-rose-200 bg-rose-50 p-4 text-center text-sm text-rose-700"><FaQrcode className="mb-2 h-7 w-7" /><span>Não foi possível gerar o QR. Confira as URLs configuradas no frontend e no backend.</span></div> : null}
          <img
            src={getQrCodeUrl(form.publicId)}
            alt={`QR Code para ${form.title}`}
            onLoad={() => setQrState('ready')}
            onError={() => setQrState('error')}
            className={`aspect-square w-full rounded-xl transition-opacity ${qrState === 'ready' ? 'opacity-100' : 'opacity-0'}`}
          />
        </div>
        <div className="flex flex-col justify-center">
          <StatusBadge status={form.status} />
          <h3 className="mt-3 text-xl font-semibold text-slate-900">{form.title}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-500">Este QR usa um identificador imutável. Você pode editar, pausar e reabrir o formulário sem precisar imprimir outro código.</p>
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-2 pl-3">
            <FaLink className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <input readOnly value={publicUrl} className="min-w-0 flex-1 bg-transparent text-xs text-slate-600 outline-none" aria-label="Link público" />
            <button type="button" onClick={copyLink} className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200">Copiar</button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <a href={getQrCodeUrl(form.publicId, true)} className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"><FaDownload className="h-3.5 w-3.5" /> Baixar PNG</a>
            <a href={getQrCodeUrl(form.publicId, true, 'svg')} className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100"><FaDownload className="h-3.5 w-3.5" /> Baixar SVG</a>
            <a href={publicUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"><FaExternalLinkAlt className="h-3.5 w-3.5" /> Abrir formulário</a>
          </div>
          {form.status !== 'published' ? <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-800">O QR já pode ser impresso, mas o formulário só aceitará respostas quando estiver publicado.</p> : null}
        </div>
      </div>
    </Modal>
  );
}

const renderAnswer = (value: unknown) => {
  if (Array.isArray(value)) return value.join(', ') || '—';
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  if (value === undefined || value === null || value === '') return '—';
  return String(value);
};

const RESPONSE_PAGE_SIZE = 50;
// Respostas podem ser grandes; lotes menores evitam picos de memoria antes
// de o limite cumulativo da exportacao ser verificado no navegador.
const RESPONSE_EXPORT_PAGE_SIZE = 20;
const MAX_RESPONSE_EXPORT_PAGES = 1_000;
const MAX_RESPONSE_EXPORT_ITEMS = 100_000;
const MAX_RESPONSE_EXPORT_BYTES = 128 * 1024 * 1024;

const mergeResponsesById = (current: FormResponse[], incoming: FormResponse[]) => {
  const responsesById = new Map(current.map((response) => [response.id, response]));
  incoming.forEach((response) => responsesById.set(response.id, response));
  return Array.from(responsesById.values());
};

function ResponsesDialog({ form, onClose, onNotice, onCountChanged }: { form: ManagedForm; onClose: () => void; onNotice: (notice: Notice) => void; onCountChanged: () => void }) {
  const [responses, setResponses] = useState<FormResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState({ pages: 0, responses: 0 });
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<FormResponse | null>(null);
  const requestedCursorsRef = useRef(new Set<string>());
  const exportAbortRef = useRef<AbortController | null>(null);
  const exportCancelledByUserRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      exportAbortRef.current?.abort();
    };
  }, []);

  const loadFirstPage = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    setLoadMoreError(null);
    requestedCursorsRef.current.clear();
    try {
      const page = await listFormResponses(form.id, { limit: RESPONSE_PAGE_SIZE });
      setResponses(page.items);
      setNextCursor(page.nextCursor);
      setSelected((current) => {
        if (!current) return null;
        return page.items.find((response) => response.id === current.id) ?? current;
      });
    } catch (error) {
      console.error(error);
      const message = getErrorMessage(error, 'Não foi possível carregar as respostas.');
      setLoadError(message);
      onNotice({ type: 'error', message });
    } finally {
      setLoading(false);
    }
  }, [form.id, onNotice]);

  useEffect(() => { void loadFirstPage(); }, [loadFirstPage]);

  const loadMore = async () => {
    const cursor = nextCursor;
    if (!cursor || loading || loadingMore || exporting) return;
    if (requestedCursorsRef.current.has(cursor)) {
      setNextCursor(null);
      setLoadMoreError('A paginação retornou um cursor repetido. Atualize as respostas para tentar novamente.');
      return;
    }

    requestedCursorsRef.current.add(cursor);
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      const page = await listFormResponses(form.id, { limit: RESPONSE_PAGE_SIZE, cursor });
      setResponses((current) => mergeResponsesById(current, page.items));

      if (page.nextCursor && (page.nextCursor === cursor || requestedCursorsRef.current.has(page.nextCursor))) {
        setNextCursor(null);
        setLoadMoreError('A paginação foi interrompida porque o servidor retornou um cursor repetido.');
      } else {
        setNextCursor(page.nextCursor);
      }
    } catch (error) {
      console.error(error);
      requestedCursorsRef.current.delete(cursor);
      const message = getErrorMessage(error, 'Não foi possível carregar mais respostas.');
      setLoadMoreError(message);
      onNotice({ type: 'error', message });
    } finally {
      setLoadingMore(false);
    }
  };

  const exportAllResponses = async () => {
    if (exporting) return;
    const controller = new AbortController();
    exportAbortRef.current = controller;
    exportCancelledByUserRef.current = false;
    setExporting(true);
    setExportProgress({ pages: 0, responses: 0 });

    try {
      const responsesById = new Map<string, FormResponse>();
      const seenCursors = new Set<string>();
      let estimatedBytes = 0;
      let cursor: string | undefined;
      let completed = false;

      for (let pageIndex = 0; pageIndex < MAX_RESPONSE_EXPORT_PAGES; pageIndex += 1) {
        if (cursor) {
          if (seenCursors.has(cursor)) {
            throw new Error('A exportação foi interrompida porque a paginação retornou um cursor repetido.');
          }
          seenCursors.add(cursor);
        }

        const page = await listFormResponses(form.id, {
          limit: RESPONSE_EXPORT_PAGE_SIZE,
          ...(cursor ? { cursor } : {}),
          signal: controller.signal,
        });
        page.items.forEach((response) => {
          if (responsesById.has(response.id)) return;
          estimatedBytes += JSON.stringify(response).length * 2;
          if (estimatedBytes > MAX_RESPONSE_EXPORT_BYTES) {
            throw new Error(`A exportação excedeu o limite de segurança de ${MAX_RESPONSE_EXPORT_BYTES / (1024 * 1024)} MB.`);
          }
          responsesById.set(response.id, response);
        });

        if (responsesById.size > MAX_RESPONSE_EXPORT_ITEMS) {
          throw new Error(`A exportação excedeu o limite de segurança de ${MAX_RESPONSE_EXPORT_ITEMS.toLocaleString('pt-BR')} respostas.`);
        }
        setExportProgress({ pages: pageIndex + 1, responses: responsesById.size });

        if (!page.nextCursor) {
          completed = true;
          break;
        }
        if (page.nextCursor === cursor || seenCursors.has(page.nextCursor)) {
          throw new Error('A exportação foi interrompida porque a paginação retornou um cursor repetido.');
        }
        cursor = page.nextCursor;
      }

      if (!completed) {
        throw new Error(`A exportação excedeu o limite de segurança de ${MAX_RESPONSE_EXPORT_PAGES.toLocaleString('pt-BR')} páginas.`);
      }
      if (responsesById.size === 0) {
        throw new Error('Não há respostas para exportar.');
      }

      downloadResponsesCsv(form, Array.from(responsesById.values()));
      onNotice({
        type: 'success',
        message: `CSV gerado com ${responsesById.size.toLocaleString('pt-BR')} ${responsesById.size === 1 ? 'resposta' : 'respostas'}.`,
      });
    } catch (error) {
      const wasAborted = controller.signal.aborted && error instanceof Error && error.name === 'AbortError';
      if (!wasAborted) console.error(error);
      if (mountedRef.current) {
        onNotice({
          type: 'error',
          message: exportCancelledByUserRef.current && wasAborted
            ? 'Exportação cancelada. Nenhum arquivo parcial foi gerado.'
            : `${getErrorMessage(error, 'Não foi possível exportar as respostas.')} Nenhum arquivo parcial foi gerado.`,
        });
      }
    } finally {
      if (exportAbortRef.current === controller) exportAbortRef.current = null;
      exportCancelledByUserRef.current = false;
      if (mountedRef.current) setExporting(false);
    }
  };

  const cancelExport = () => {
    exportCancelledByUserRef.current = true;
    exportAbortRef.current?.abort();
  };

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt-BR');
    if (!term) return responses;
    return responses.filter((response) => getResponseHistoricalAnswers(response, form).some((answer) => `${answer.label} ${renderAnswer(answer.value)}`.toLocaleLowerCase('pt-BR').includes(term)));
  }, [form, responses, search]);

  const removeResponse = async (response: FormResponse) => {
    if (!window.confirm('Excluir esta resposta permanentemente? Esta ação não pode ser desfeita.')) return;
    try {
      await deleteFormResponse(form.id, response.id);
      setResponses((current) => current.filter((item) => item.id !== response.id));
      setSelected(null);
      onCountChanged();
      onNotice({ type: 'success', message: 'Resposta excluída.' });
    } catch (error) {
      console.error(error);
      onNotice({ type: 'error', message: getErrorMessage(error, 'Não foi possível excluir a resposta.') });
    }
  };

  return (
    <Modal onClose={onClose} label={`Respostas de ${form.title}`} wide>
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur sm:px-7">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div><p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-700">Respostas coletadas</p><h2 className="mt-1 text-xl font-semibold text-slate-900">{form.title}</h2><p className="mt-1 text-sm text-slate-500">{responses.length.toLocaleString('pt-BR')} {responses.length === 1 ? 'resposta carregada' : 'respostas carregadas'}{nextCursor ? ' · há mais disponíveis' : ''}</p></div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => exporting ? cancelExport() : void exportAllResponses()} disabled={!exporting && (loading || loadingMore || (responses.length === 0 && form.responseCount === 0))} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40" aria-busy={exporting} title={exporting ? 'Cancelar a exportação sem gerar arquivo parcial' : 'Exportar todas as páginas a partir do início desta operação'}>{exporting ? <FaTimes /> : <FaFileCsv />} {exporting ? 'Cancelar exportação' : 'Exportar todas em CSV'}</button>
            <button type="button" onClick={() => void loadFirstPage()} disabled={loading || loadingMore || exporting} className="rounded-full border border-slate-200 p-2.5 text-slate-500 hover:bg-slate-50 disabled:opacity-40" aria-label="Atualizar respostas"><FaSyncAlt className={loading ? 'animate-spin' : ''} /></button>
            <button type="button" onClick={onClose} className="rounded-full p-2.5 text-slate-400 hover:bg-slate-100" aria-label="Fechar"><FaTimes /></button>
          </div>
        </div>
        {exporting ? <p className="mt-3 text-xs font-medium text-emerald-700" role="status" aria-live="polite">Páginas lidas: {exportProgress.pages.toLocaleString('pt-BR')} · {exportProgress.responses.toLocaleString('pt-BR')} respostas únicas reunidas</p> : null}
        <div className="mt-4 max-w-lg">
          <div className="relative">
            <FaSearch className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} className={`${CONTROL_CLASS} pl-9`} placeholder="Buscar nas respostas carregadas" aria-label="Buscar nas respostas carregadas" aria-describedby="loaded-responses-search-hint" />
          </div>
          <p id="loaded-responses-search-hint" className="mt-1.5 text-xs text-slate-500">A busca considera somente as {responses.length.toLocaleString('pt-BR')} respostas já carregadas.{nextCursor ? ' Carregue mais para ampliar os resultados.' : ''}</p>
        </div>
      </div>
      <div className="p-5 sm:p-7">
        {loading ? (
          <div className="flex min-h-[280px] items-center justify-center text-sm text-slate-500"><FaSyncAlt className="mr-2 animate-spin" /> Carregando respostas...</div>
        ) : loadError && responses.length === 0 ? (
          <div className="flex min-h-[280px] flex-col items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 px-5 text-center" role="alert"><FaInbox className="h-8 w-8 text-rose-300" /><h3 className="mt-3 font-semibold text-rose-800">Não foi possível carregar as respostas</h3><p className="mt-1 max-w-md text-sm text-rose-700">{loadError}</p><button type="button" onClick={() => void loadFirstPage()} className="mt-4 rounded-full bg-rose-700 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-800">Tentar novamente</button></div>
        ) : filtered.length === 0 ? (
          <div className="flex min-h-[280px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-5 text-center"><FaInbox className="h-8 w-8 text-slate-300" /><h3 className="mt-3 font-semibold text-slate-700">{search ? 'Nenhuma resposta encontrada' : 'Ainda não há respostas'}</h3><p className="mt-1 max-w-sm text-sm text-slate-500">{search ? `Tente outro termo${nextCursor ? ' ou carregue mais respostas' : ''}.` : 'Compartilhe o QR Code ou o link público para começar a coleta.'}</p></div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] divide-y divide-slate-100 text-sm">
                <thead className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th scope="col" className="px-4 py-3">Enviada em</th>
                    <th scope="col" className="px-4 py-3">Versão</th>
                    <th scope="col" className="px-4 py-3">Respostas registradas na época</th>
                    <th scope="col" className="px-4 py-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((response) => {
                    const historicalAnswers = getResponseHistoricalAnswers(response, form);
                    return (
                      <tr key={response.id} className="hover:bg-slate-50/80">
                        <td className="whitespace-nowrap px-4 py-3 text-slate-500">{formatFormDate(response.submittedAt)}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-xs font-semibold text-slate-500">
                          {response.schemaVersion ? `v${response.schemaVersion}` : 'Legada'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="space-y-1.5">
                            {historicalAnswers.slice(0, 3).map((answer, index) => (
                              <p key={`${answer.fieldId}-${index}`} className="max-w-xl truncate text-xs text-slate-600">
                                <span className="font-semibold text-slate-700">{answer.label}:</span>{' '}
                                {renderAnswer(answer.value)}
                              </p>
                            ))}
                            {historicalAnswers.length > 3 ? (
                              <p className="text-[11px] font-semibold text-slate-400">+ {historicalAnswers.length - 3} resposta(s)</p>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button type="button" onClick={() => setSelected(response)} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"><FaEye className="h-3 w-3" /> Ver detalhes</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {!loading && loadError && responses.length > 0 ? <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">{loadError} Os dados exibidos são da última carga concluída.</p> : null}
        {!loading && nextCursor ? (
          <div className="mt-5 flex flex-col items-center gap-2">
            <button type="button" onClick={() => void loadMore()} disabled={loadingMore || exporting} className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-5 py-2.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50" aria-busy={loadingMore}>{loadingMore ? <FaSyncAlt className="animate-spin" /> : <FaArrowDown />} {loadingMore ? 'Carregando mais...' : 'Carregar mais'}</button>
            {loadMoreError ? <p className="max-w-lg text-center text-xs text-rose-700" role="alert">{loadMoreError}</p> : null}
          </div>
        ) : !loading && responses.length > 0 && !loadError && !loadMoreError ? (
          <p className="mt-5 text-center text-xs text-slate-400">Todas as respostas disponíveis foram carregadas.</p>
        ) : null}
        {!loading && !nextCursor && loadMoreError ? <p className="mt-4 text-center text-xs text-rose-700" role="alert">{loadMoreError}</p> : null}
      </div>

      {selected ? (
        <Modal onClose={() => setSelected(null)} label="Detalhes da resposta" nested>
          <div className="max-h-[85vh] overflow-y-auto rounded-3xl bg-white">
            <div className="sticky top-0 flex items-start justify-between border-b border-slate-100 bg-white px-5 py-4"><div><h3 className="font-semibold text-slate-900">Resposta completa</h3><p className="mt-1 text-xs text-slate-500">Enviada em {formatFormDate(selected.submittedAt)} · {selected.schemaVersion ? `versão ${selected.schemaVersion}` : 'versão legada'}</p></div><button type="button" onClick={() => setSelected(null)} className="rounded-full p-2 text-slate-400 hover:bg-slate-100" aria-label="Fechar detalhes da resposta"><FaTimes /></button></div>
            <div className="space-y-4 p-5">{getResponseHistoricalAnswers(selected, form).map((answer, index) => <div key={`${answer.fieldId}-${index}`} className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3"><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{answer.label}</p><p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-800">{renderAnswer(answer.value)}</p></div>)}</div>
            <div className="flex justify-between border-t border-slate-100 px-5 py-4"><button type="button" onClick={() => void removeResponse(selected)} className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100"><FaTrash className="h-3.5 w-3.5" /> Excluir resposta</button><button type="button" onClick={() => setSelected(null)} className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Fechar</button></div>
          </div>
        </Modal>
      ) : null}
    </Modal>
  );
}

export function AdminForms() {
  const [forms, setForms] = useState<ManagedForm[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | FormStatus>('all');
  const [editor, setEditor] = useState<FormDraft | null>(null);
  const [qrForm, setQrForm] = useState<ManagedForm | null>(null);
  const [responsesForm, setResponsesForm] = useState<ManagedForm | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setForms(await listForms());
    } catch (error) {
      console.error(error);
      setNotice({ type: 'error', message: getErrorMessage(error, 'Não foi possível carregar os formulários.') });
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const metrics = useMemo(() => ({
    total: forms.length,
    published: forms.filter((form) => form.status === 'published').length,
    responses: forms.reduce((total, form) => total + form.responseCount, 0),
    closed: forms.filter((form) => form.status === 'closed').length,
  }), [forms]);
  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt-BR');
    return forms.filter((form) => (statusFilter === 'all' || form.status === statusFilter) && (!term || `${form.title} ${form.description}`.toLocaleLowerCase('pt-BR').includes(term)));
  }, [forms, search, statusFilter]);

  const persist = async (draft: FormDraft, status: FormStatus) => {
    setSaving(true);
    try {
      await saveForm(draft, status);
      setEditor(null);
      await load();
      setNotice({ type: 'success', message: status === 'published' ? 'Formulário salvo e publicado.' : 'Rascunho salvo.' });
    } catch (error) {
      console.error(error);
      setNotice({
        type: 'error',
        message: isFormsApiError(error, 'FORM_EDIT_CONFLICT')
          ? 'Outra sessão alterou este formulário. Suas mudanças locais não foram salvas.'
          : getErrorMessage(error, 'Não foi possível salvar o formulário.'),
      });
      throw error;
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (form: ManagedForm, status: FormStatus) => {
    if (busyAction) return;
    if (status === 'published') {
      const validation = validateDraft(form, true);
      if (validation) {
        setNotice({ type: 'error', message: `${validation} Abra o editor para corrigir.` });
        return;
      }
    }
    setBusyAction(`status:${form.id}`);
    try {
      await setFormStatus(form.id, status, form.revision);
      await load();
      setNotice({ type: 'success', message: status === 'published' ? 'Formulário publicado e recebendo respostas.' : 'Coleta de respostas pausada.' });
    } catch (error) {
      console.error(error);
      if (isFormsApiError(error, 'FORM_EDIT_CONFLICT')) {
        await load();
        setNotice({ type: 'error', message: 'O formulário foi alterado em outra sessão. A lista foi atualizada; confirme o status e tente novamente.' });
      } else {
        setNotice({ type: 'error', message: getErrorMessage(error, 'Não foi possível alterar o status.') });
      }
    } finally {
      setBusyAction(null);
    }
  };

  const duplicate = async (form: ManagedForm) => {
    if (busyAction) return;
    setBusyAction(`duplicate:${form.id}`);
    try {
      await saveForm(cloneFormAsDraft(form), 'draft');
      await load();
      setNotice({ type: 'success', message: 'Cópia criada como rascunho com um novo QR Code.' });
    } catch (error) {
      console.error(error);
      setNotice({ type: 'error', message: getErrorMessage(error, 'Não foi possível duplicar o formulário.') });
    } finally {
      setBusyAction(null);
    }
  };

  const remove = async (form: ManagedForm) => {
    if (busyAction) return;
    const warning = form.responseCount > 0
      ? `“${form.title}” possui ${form.responseCount} resposta(s). Excluir apagará também todas elas permanentemente. Deseja continuar?`
      : `Excluir “${form.title}” permanentemente?`;
    if (!window.confirm(warning)) return;
    setBusyAction(`delete:${form.id}`);
    try {
      await deleteFormWithResponses(form.id, form.revision);
      await load();
      setNotice({ type: 'success', message: 'Formulário excluído.' });
    } catch (error) {
      console.error(error);
      if (isFormsApiError(error, 'FORM_EDIT_CONFLICT')) {
        await load();
        setNotice({ type: 'error', message: 'O formulário mudou antes da exclusão. A lista foi atualizada; revise os dados e confirme novamente.' });
      } else {
        setNotice({ type: 'error', message: getErrorMessage(error, 'Não foi possível excluir o formulário.') });
      }
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <section className="admin-tab-content space-y-6">
      {notice ? <div role={notice.type === 'error' ? 'alert' : 'status'} aria-live="polite" className={`fixed right-5 top-5 z-[100] max-w-[calc(100vw-2.5rem)] rounded-2xl px-4 py-2 text-sm font-semibold text-white shadow-lg ${notice.type === 'success' ? 'bg-emerald-600' : 'bg-rose-600'}`}>{notice.message}</div> : null}

      <div className="admin-tab-hero-card">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="flex items-start gap-4">
              <div className="admin-tab-hero__icon"><FaClipboardList className="h-6 w-6" /></div>
              <div><h2 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Formulários</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500 sm:text-[15px]">Crie formulários personalizados, compartilhe um QR Code permanente e acompanhe todas as respostas em um só lugar.</p></div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => void load()} disabled={loading} className="admin-tab-action admin-tab-action--secondary"><FaSyncAlt className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /><span>Atualizar</span></button>
              <button type="button" onClick={() => setEditor(createEmptyForm())} className="admin-tab-action admin-tab-action--primary"><FaPlus className="h-4 w-4" /><span>Novo formulário</span></button>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: 'Formulários', value: metrics.total, hint: 'Total criado', icon: FaClipboardList, tone: 'bg-slate-500/15 text-slate-600' },
              { label: 'Ativos', value: metrics.published, hint: 'Recebendo respostas', icon: FaPlay, tone: 'bg-emerald-500/15 text-emerald-600' },
              { label: 'Respostas', value: metrics.responses, hint: 'Coletadas no total', icon: FaClipboardCheck, tone: 'bg-sky-500/15 text-sky-600' },
              { label: 'Pausados', value: metrics.closed, hint: 'QR preservado', icon: FaPause, tone: 'bg-amber-500/15 text-amber-600' },
            ].map(({ label, value, hint, icon: Icon, tone }) => <div key={label} className="admin-tab-stat-card"><div className="admin-tab-stat-card__body flex items-start justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">{label}</p><p className="mt-3 text-2xl font-semibold text-slate-900">{value.toLocaleString('pt-BR')}</p><p className="mt-1 text-xs text-slate-500">{hint}</p></div><span className={`admin-tab-stat-card__icon ${tone}`}><Icon className="h-4 w-4" /></span></div></div>)}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="relative flex-1"><FaSearch className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} className={`${CONTROL_CLASS} pl-10`} placeholder="Buscar por título ou descrição" aria-label="Buscar formulários por título ou descrição" /></div>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'all' | FormStatus)} className={`${CONTROL_CLASS} md:w-56`} aria-label="Filtrar formulários por status"><option value="all">Todos os status</option><option value="published">Recebendo respostas</option><option value="draft">Rascunhos</option><option value="closed">Pausados</option></select>
        </div>
      </div>

      {loading ? (
        <div className="flex min-h-[320px] items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white text-sm text-slate-500"><FaSyncAlt className="mr-2 animate-spin" /> Carregando formulários...</div>
      ) : filtered.length === 0 ? (
        <div className="flex min-h-[340px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-5 text-center"><span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600"><FaClipboardList className="h-6 w-6" /></span><h3 className="mt-4 text-lg font-semibold text-slate-800">{forms.length === 0 ? 'Crie seu primeiro formulário' : 'Nenhum formulário encontrado'}</h3><p className="mt-2 max-w-md text-sm leading-6 text-slate-500">{forms.length === 0 ? 'Monte as perguntas, publique e compartilhe o QR Code com seus clientes.' : 'Ajuste os filtros ou tente outro termo de busca.'}</p>{forms.length === 0 ? <button type="button" onClick={() => setEditor(createEmptyForm())} className="mt-5 inline-flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"><FaPlus /> Novo formulário</button> : null}</div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {filtered.map((form) => (
            <article key={form.id} className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><StatusBadge status={form.status} /><span className="text-[11px] font-medium text-slate-400">Atualizado {formatFormDate(form.updatedAt)}</span></div><h3 className="mt-3 truncate text-lg font-semibold text-slate-900">{form.title}</h3><p className="mt-1 line-clamp-2 min-h-[40px] text-sm leading-5 text-slate-500">{form.description || 'Sem descrição.'}</p></div>
                <button type="button" onClick={() => setQrForm(form)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-emerald-100 bg-emerald-50 text-emerald-700 transition hover:bg-emerald-100" aria-label="Abrir QR Code"><FaQrcode className="h-5 w-5" /></button>
              </div>
              <div className="mt-5 grid grid-cols-3 divide-x divide-slate-100 rounded-xl border border-slate-100 bg-slate-50 py-3 text-center"><div><p className="text-lg font-semibold text-slate-800">{form.fields.length}</p><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Perguntas</p></div><div><p className="text-lg font-semibold text-slate-800">{form.responseCount}</p><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Respostas</p></div><div><p className="truncate px-1 text-sm font-semibold text-slate-700">{form.lastResponseAt ? formatFormDate(form.lastResponseAt).split(' ')[0] : '—'}</p><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Última</p></div></div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => setEditor({ ...form, fields: form.fields.map((field) => ({ ...field, options: field.options ? [...field.options] : undefined })) })} className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800"><FaEdit className="h-3.5 w-3.5" /> Editar</button>
                <button type="button" onClick={() => setResponsesForm(form)} className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"><FaInbox className="h-3.5 w-3.5" /> Respostas</button>
                <button type="button" onClick={() => void changeStatus(form, form.status === 'published' ? 'closed' : 'published')} disabled={busyAction !== null} className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-semibold disabled:cursor-wait disabled:opacity-50 ${form.status === 'published' ? 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100' : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}>{busyAction === `status:${form.id}` ? <FaSyncAlt className="animate-spin" /> : form.status === 'published' ? <FaPause /> : <FaPlay />} {form.status === 'published' ? 'Pausar' : 'Publicar'}</button>
                <button type="button" onClick={() => void duplicate(form)} disabled={busyAction !== null} className="ml-auto rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:cursor-wait disabled:opacity-40" aria-label="Duplicar formulário" title="Duplicar">{busyAction === `duplicate:${form.id}` ? <FaSyncAlt className="h-3.5 w-3.5 animate-spin" /> : <FaClone className="h-3.5 w-3.5" />}</button>
                <button type="button" onClick={() => void remove(form)} disabled={busyAction !== null} className="rounded-full p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:cursor-wait disabled:opacity-40" aria-label="Excluir formulário" title="Excluir">{busyAction === `delete:${form.id}` ? <FaSyncAlt className="h-3.5 w-3.5 animate-spin" /> : <FaTrash className="h-3.5 w-3.5" />}</button>
              </div>
            </article>
          ))}
        </div>
      )}

      {editor ? <FormEditor initial={editor} busy={saving} onClose={() => { if (!saving) setEditor(null); }} onReload={() => { setEditor(null); void load(); }} onSave={persist} /> : null}
      {qrForm ? <QrDialog form={qrForm} onClose={() => setQrForm(null)} onNotice={setNotice} /> : null}
      {responsesForm ? <ResponsesDialog form={responsesForm} onClose={() => setResponsesForm(null)} onNotice={setNotice} onCountChanged={() => void load()} /> : null}
    </section>
  );
}
