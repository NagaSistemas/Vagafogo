import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import React from 'react';

import { collection, query, where, getDocs, doc, deleteDoc, updateDoc, addDoc, getDoc, getDocFromServer, setDoc, onSnapshot, writeBatch, deleteField, Timestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import {
  normalizarStatusReserva as normalizarStatus,
  reservaContaParaOcupacao,
  reservaEhAguardandoPagamento,
  reservaEhAtivaNoPainel,
  reservaEhPreReserva as reservaTemStatusPreReserva,
  reservaEstaConfirmada,
} from '../utils/reservaStatus';
import {
  compararHorariosComIndefinidosNoFim,
  compararTextoNumericamente,
  montarChaveVagasExtrasDia,
  montarChaveVagasExtrasDiaGeral,
  montarChaveVagasExtrasHorario,
  montarChaveVagasExtrasHorarioGeral,
  normalizarBloqueiosDisponibilidade,
  normalizarVagasExtrasDisponibilidade,
  obterVagasExtrasDisponibilidade,
} from '../utils/disponibilidade';

import dayjs from 'dayjs';

import 'dayjs/locale/pt-br';

import { FaChevronLeft, FaChevronRight, FaChevronDown, FaChevronUp, FaTrash, FaEdit, FaPlus, FaSearch, FaCalendarAlt, FaUsers, FaLayerGroup, FaQuestionCircle, FaCheck, FaCreditCard, FaChair, FaEllipsisV, FaChartBar, FaFilePdf, FaEye, FaEyeSlash, FaSun, FaMoon, FaColumns, FaGripLines, FaUserCircle, FaUser, FaGraduationCap, FaPhoneAlt, FaIdCard, FaPaw, FaMoneyBillWave, FaClock, FaClipboardList, FaListUl, FaEnvelope, FaPaperPlane, FaWhatsapp, FaQrcode, FaSyncAlt, FaSignOutAlt, FaCog } from 'react-icons/fa';
import logo from '../assets/logo.jpg';
import './AdminDashboardTheme.css';



import localizedFormat from 'dayjs/plugin/localizedFormat';

dayjs.extend(localizedFormat);

dayjs.locale('pt-br');

const moedaFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const formatCurrency = (valor: number) => moedaFormatter.format(Number.isFinite(valor) ? valor : 0);

const parseCurrencyInput = (valor: string) => {
  const texto = String(valor ?? '').trim();
  if (!texto) return 0;

  const apenasNumero = texto.replace(/[^\d,.-]/g, '');
  if (!apenasNumero) return 0;

  if (!/[,.]/.test(apenasNumero)) {
    const inteiro = Number(apenasNumero.replace(/[^\d-]/g, ''));
    return Number.isFinite(inteiro) ? inteiro : 0;
  }

  const normalizado = apenasNumero.replace(/\./g, '').replace(',', '.');
  const numero = Number(normalizado);
  return Number.isFinite(numero) ? numero : 0;
};

const formatCurrencyForEditing = (valor: number) => {
  if (!Number.isFinite(valor) || valor <= 0) return '';
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: Number.isInteger(valor) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(valor);
};

const criarEmailUsoEscopo = (enviados = 0, limite = 0): EmailUsoEscopo => {
  const enviadosNormalizados = Number.isFinite(enviados) ? Math.max(Math.floor(enviados), 0) : 0;
  const limiteNormalizado = Number.isFinite(limite) ? Math.max(Math.floor(limite), 0) : 0;
  return {
    enviados: enviadosNormalizados,
    limite: limiteNormalizado,
    restantes: Math.max(limiteNormalizado - enviadosNormalizados, 0),
    percentual: limiteNormalizado > 0
      ? Math.min(Math.round((enviadosNormalizados / limiteNormalizado) * 100), 100)
      : 0,
  };
};

const API_BASE = import.meta.env.VITE_API_BASE ?? 'https://vagafogo-production.up.railway.app';

const emailTemplateConfirmacaoPadrao =
  'Olá {nome}!\n\nSeu pagamento foi confirmado e sua reserva está garantida.\n\nAtividade: {atividade}\nData: {datareserva}\nHorário: {horario}\nParticipantes: {participantes}\nValor: {valor}\n\nAguardamos você no Vagafogo.';

const whatsappTemplateMensagemManualPadrao =
  'Olá {nome}!\n\nAqui é o Vagafogo. Estamos entrando em contato sobre sua reserva para {datareserva} {horario}.\n\nAtividade: {atividade}\nParticipantes: {participantes}';

const whatsappTemplateBoasVindasPadrao =
  'Olá {nome}! 🌿 Seja muito bem-vindo(a) ao Santuário Vagafogo. É um prazer receber você hoje! Tenha uma experiência incrível.';

const emailAssuntoConfirmacaoPadrao = 'Confirmação de reserva - Vagafogo';

const whatsappPlaceholders = [
  '{nome}',
  '{datareserva}',
  '{data}',
  '{horario}',
  '{atividade}',
  '{participantes}',
  '{telefone}',
  '{valor}',
  '{status}',
];

const opcoesAjusteRapidoVagas = [1, 5, 10];

const normalizarDataReserva = (data?: unknown) => {
  if (!data) return '';
  if (typeof data === 'string') {
    const valor = data.trim();
    const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(valor);
    if (isoMatch) {
      return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
    }
    const brMatch = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(valor);
    if (brMatch) {
      return `${brMatch[3]}-${brMatch[2]}-${brMatch[1]}`;
    }
    const parsed = dayjs(valor);
    return parsed.isValid() ? parsed.format('YYYY-MM-DD') : '';
  }
  if (data instanceof Date) {
    return dayjs(data).format('YYYY-MM-DD');
  }
  const maybeDate = (data as { toDate?: () => Date }).toDate?.();
  if (maybeDate instanceof Date) {
    return dayjs(maybeDate).format('YYYY-MM-DD');
  }
  return '';
};

const formatarDataReserva = (data?: unknown) => {
  const normalizada = normalizarDataReserva(data);
  if (!normalizada) {
    return typeof data === 'string' ? data : '';
  }
  return dayjs(normalizada).format('DD/MM/YYYY');
};

const formatarCpfExibicao = (cpf?: unknown) => {
  if (cpf === undefined || cpf === null) return '---';
  const valor = String(cpf).trim();
  if (!valor) return '---';

  const digitos = valor.replace(/\D/g, '');
  if (digitos.length === 11) {
    return digitos.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  }

  return valor;
};

const parseHorarioParaMinutos = (valor?: string | null) => {
  if (!valor) return null;
  const match = /(\d{1,2})(?:[:hH](\d{2}))?/.exec(valor.trim());
  if (!match) return null;
  const horas = Number(match[1]);
  const minutos = match[2] ? Number(match[2]) : 0;
  if (!Number.isFinite(horas) || !Number.isFinite(minutos)) return null;
  if (horas < 0 || horas > 23 || minutos < 0 || minutos > 59) return null;
  return horas * 60 + minutos;
};

const montarMensagemWhatsApp = (template: string, dados: Record<string, string>) =>
  template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, chave) => {
    const valor = dados[chave];
    return valor !== undefined ? valor : match;
  });

const normalizarTelefoneWhatsapp = (telefone?: string) => {
  const digits = (telefone ?? '').replace(/\D/g, '');
  if (!digits || digits.length < 10) return '';
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    return digits;
  }
  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }
  return digits;
};

interface PerguntaPersonalizadaResposta {

  pacoteId: string;

  pacoteNome: string;

  perguntaId: string;

  pergunta: string;

  tipo: 'sim_nao' | 'texto';

  obrigatoria: boolean;

  resposta: string;

  emojiSim?: string;

  emojiNao?: string;

  perguntaCondicional?: {

    pergunta: string;

    tipo: 'sim_nao' | 'texto';

    obrigatoria: boolean;

    resposta: string;

    emojiSim?: string;

    emojiNao?: string;

  };

}



interface PerguntaPersonalizada {

  id: string;

  pergunta: string;

  tipo: 'sim_nao' | 'texto';

  obrigatoria: boolean;

  /** Emoji exibido no resumo quando a resposta for "sim" (apenas tipo sim_nao). */
  emojiSim?: string;

  /** Emoji exibido no resumo quando a resposta for "nao" (apenas tipo sim_nao). */
  emojiNao?: string;

  perguntaCondicional?: {

    condicao: 'sim' | 'nao';

    pergunta: string;

    tipo: 'sim_nao' | 'texto';

    obrigatoria: boolean;

    emojiSim?: string;

    emojiNao?: string;

  };

}



interface Pacote {

  id?: string;

  nome: string;

  tipo: string;

  emoji?: string;

  precoAdulto: number;

  precoCrianca: number;

  precoBariatrica: number;

  precosPorTipo?: Record<string, number>;

  horarios: string[];

  dias: number[];

  limite: number;

  datasBloqueadas?: string[];

  modoHorario?: 'lista' | 'intervalo';

  horarioInicio?: string;

  horarioFim?: string;

  aceitaPet: boolean;

  perguntasPersonalizadas?: PerguntaPersonalizada[];

  aviso?: string;

}



interface Combo {

  id?: string;

  nome: string;

  pacoteIds: string[];

  preco?: number;

  precoAdulto: number;

  precoCrianca: number;

  precoBariatrica: number;

  precosPorTipo?: Record<string, number>;

  ativo: boolean;

}



interface Mesa {

  id: string;

  nome: string;

  capacidade: number;

  area: string;

  ativa?: boolean;

}



interface MesaSelecionada {

  id: string;

  nome: string;

  capacidade: number;

  area: string;

}

type WhatsappModeloMensagem = {
  id: string;
  titulo: string;
  mensagem: string;
};

type AdminAba =
  | 'dashboard'
  | 'reservas'
  | 'pacotes'
  | 'pesquisa'
  | 'tipos_clientes'
  | 'email'
  | 'whatsapp'
  | 'configuracoes';

type WhatsappConnectionStatus = 'idle' | 'initializing' | 'qr' | 'ready' | 'auth_failure' | 'disconnected';

type WhatsappStatusPayload = {
  status: WhatsappConnectionStatus;
  qr?: string | null;
  lastError?: string | null;
  lastQrAt?: string | null;
  authStrategy?: 'remote' | 'local';
  info?: {
    wid?: string;
    pushname?: string;
  };
};

interface WhatsappConfig {
  ativo: boolean;
  assuntoConfirmacaoEmail: string;
  mensagemConfirmacaoAutomatica: string;
  mensagemConfirmacaoManual: string;
  mensagemBoasVindas: string;
  modelosMensagemManual?: WhatsappModeloMensagem[];

  /** Liga/desliga o disparo de WhatsApp quando reserva e paga. */
  whatsappConfirmacaoAtiva?: boolean;
  /** Template do WhatsApp enviado automaticamente quando a reserva e paga. */
  whatsappMensagemConfirmacao?: string;

}

interface TipoCliente {

  id?: string;

  nome: string;

  descricao?: string;

}

interface Reserva {

  id?: string;

  nome: string;

  cpf: string;

  email?: string;

  telefone: string;

  adultos?: number;

  criancas?: number;

  naoPagante?: number;

  bariatrica?: number;

  participantesPorTipo?: Record<string, number>;

  data: string;

  horario: string;

  atividade: string;

  pacoteIds?: string[];

  valor?: number;

  status?: string;

  origem?: string;

  temPet?: boolean;

  educativo?: boolean;

  naoConsomeDisponibilidade?: boolean;

  confirmada?: boolean;

  linkPagamento?: string;

  perguntasPersonalizadas?: PerguntaPersonalizadaResposta[];

  areaMesa?: string;

  mesaPrincipalId?: string | null;

  mesaSecundariaId?: string | null;

  mesasSelecionadas?: MesaSelecionada[];

  capacidadeMesas?: number;

  chegou?: boolean;

}

type OrigemReservaFiltro = 'todas' | 'manual' | 'checkout';

type NotificacaoNovaReserva = {
  id: string;
  nome: string;
  horario: string;
  atividade: string;
  participantes: number;
};

type WhatsappEnvioModal = {
  reserva: Reserva;
  telefoneDestino: string;
  dadosMensagem: Record<string, string>;
  participantes: number;
  pacoteDescricao: string;
};

type EmailFilaItem = {
  id: string;
  statusEmail: 'enviado' | 'pendente' | 'erro';
  nome: string;
  email: string;
  telefone?: string;
  atividade?: string;
  data?: string;
  horario?: string;
  valor?: number;
  emailErro?: string;
  dataEmailErro?: string;
  dataEmailEnviado?: string;
  criadoEm?: string;
};

type EmailUsoEscopo = {
  enviados: number;
  limite: number;
  restantes: number;
  percentual: number;
};

type EmailFilaResumo = {
  emailHabilitado: boolean;
  totalReservasPagas: number;
  enviados: number;
  pendentes: number;
  erros: number;
  semEmail: number;
  uso: {
    diario: EmailUsoEscopo;
    mensal: EmailUsoEscopo;
    referencia?: {
      hoje?: string;
      mes?: string;
      timezone?: string;
    };
  };
  itens: EmailFilaItem[];
};

type ParticipantStepperCardProps = {
  label: string;
  value: number;
  description?: string;
  onDecrease: () => void;
  onIncrease: () => void;
  disableIncrease?: boolean;
  emphasis?: 'default' | 'muted';
};

function ParticipantStepperCard({
  label,
  value,
  description,
  onDecrease,
  onIncrease,
  disableIncrease = false,
  emphasis = 'default',
}: ParticipantStepperCardProps) {
  const containerClass =
    emphasis === 'muted'
      ? 'border-slate-200 bg-slate-50'
      : 'border-slate-200 bg-white shadow-sm';

  return (
    <div className={`rounded-2xl border p-4 ${containerClass}`}>
      <div>
        <div>
          <p className="text-sm font-semibold text-slate-900">{label}</p>
          {description && <p className="mt-1 text-xs text-slate-500">{description}</p>}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onDecrease}
          disabled={value <= 0}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-lg font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label={`Diminuir ${label}`}
        >
          -
        </button>

        <div className="min-w-[56px] text-center text-2xl font-semibold text-slate-900">{value}</div>

        <button
          type="button"
          onClick={onIncrease}
          disabled={disableIncrease}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-blue-200 bg-blue-600 text-lg font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-200 disabled:text-slate-500"
          aria-label={`Aumentar ${label}`}
        >
          +
        </button>
      </div>
    </div>
  );
}

type PetStatusIndicatorProps = {
  hasPet: boolean;
  compact?: boolean;
};

function PetStatusIndicator({ hasPet, compact = false }: PetStatusIndicatorProps) {
  const label = hasPet ? 'Com pet' : 'Sem pet';

  return (
    <span
      className={`admin-pet-indicator ${hasPet ? 'is-active' : 'is-inactive'} ${compact ? 'is-compact' : ''}`}
      aria-label={label}
      title={label}
    >
      <span className="admin-pet-indicator__icon-wrap" aria-hidden="true">
        <FaPaw className="admin-pet-indicator__icon" />
        {!hasPet && <span className="admin-pet-indicator__slash" />}
      </span>
      {!compact && <span className="admin-pet-indicator__label">{label}</span>}
    </span>
  );
}

function ReservaParticipantesResumo({
  itens,
  compact = false,
}: {
  itens: Array<{ key: string; label: string; quantidade: number }>;
  compact?: boolean;
}) {
  if (itens.length === 0) {
    return (
      <span className={`admin-reservas-breakdown-empty ${compact ? 'is-compact' : ''}`}>
        Sem participantes
      </span>
    );
  }

  return (
    <div className={`admin-reservas-breakdown ${compact ? 'is-compact' : ''}`}>
      {itens.map((item) => (
        <div key={item.key} className="admin-reservas-breakdown__item">
          <span className="admin-reservas-breakdown__label">{item.label}</span>
          <strong className="admin-reservas-breakdown__value">{item.quantidade}</strong>
        </div>
      ))}
    </div>
  );
}

function ReservaPerguntasResumo({
  perguntas,
  compact = false,
}: {
  perguntas: PerguntaPersonalizadaResposta[];
  compact?: boolean;
}) {
  if (perguntas.length === 0) {
    return (
      <span className={`admin-reservas-answer-empty ${compact ? 'is-compact' : ''}`}>
        Sem respostas personalizadas
      </span>
    );
  }

  // Coleta todas as respostas (principal + condicional) num array plano
  const respostas: string[] = [];
  perguntas.forEach((p) => {
    if (p.resposta) respostas.push(p.resposta);
    if (p.perguntaCondicional?.resposta) respostas.push(p.perguntaCondicional.resposta);
  });

  return (
    <div className="admin-reservas-answers-inline">
      {respostas.map((r, i) => (
        <span key={i} className="admin-reservas-answer-chip">{r}</span>
      ))}
    </div>
  );
}

function ReservaHorarioResumo({
  participantes,
  reservas,
  chegadas,
}: {
  participantes: number;
  reservas: number;
  chegadas: number;
}) {
  const itens = [
    {
      key: 'participantes',
      label: 'Participantes',
      value: String(participantes),
      icon: <FaUsers className="h-3.5 w-3.5" />,
    },
    {
      key: 'reservas',
      label: 'Reservas',
      value: String(reservas),
      icon: <FaLayerGroup className="h-3.5 w-3.5" />,
    },
    {
      key: 'chegadas',
      label: 'Chegadas',
      value: String(chegadas),
      icon: <FaCheck className="h-3.5 w-3.5" />,
    },
  ];

  return (
    <div className="admin-reservas-group__stats" role="list" aria-label="Resumo do horario">
      {itens.map((item) => (
        <div key={item.key} className="admin-reservas-group__stat" role="listitem">
          <span className="admin-reservas-group__stat-head">
            <span className="admin-reservas-group__stat-icon" aria-hidden="true">
              {item.icon}
            </span>
            <span className="admin-reservas-group__stat-label">{item.label}</span>
          </span>
          <strong className="admin-reservas-group__stat-value">{item.value}</strong>
        </div>
      ))}
    </div>
  );
}

type AdminTabActionConfig = {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
};

type AdminTabMetricConfig = {
  metricKey?: string;
  label: string;
  value: string | number;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: 'sky' | 'emerald' | 'amber' | 'indigo' | 'slate';
  cardClassName?: string;
  renderContent?: (params: {
    label: string;
    value: string | number;
    hint?: string;
    icon: React.ComponentType<{ className?: string }>;
    toneClassName: string;
    centered: boolean;
  }) => React.ReactNode;
};

const ADMIN_TAB_TONE_CLASSES: Record<NonNullable<AdminTabMetricConfig['tone']>, string> = {
  sky: 'bg-emerald-500/15 text-emerald-600 ring-1 ring-inset ring-emerald-500/15',
  emerald: 'bg-emerald-500/15 text-emerald-600 ring-1 ring-inset ring-emerald-500/15',
  amber: 'bg-amber-500/15 text-amber-600 ring-1 ring-inset ring-amber-500/15',
  indigo: 'bg-green-500/15 text-green-600 ring-1 ring-inset ring-green-500/15',
  slate: 'bg-slate-500/15 text-slate-600 ring-1 ring-inset ring-slate-500/15',
};

function AdminTabHeader({
  title,
  description,
  icon: Icon,
  actions = [],
  metrics = [],
  toolbar,
  toolbarAfterMetrics = false,
  metricsClassName = '',
  metricsContainerClassName = '',
  metricsTitle,
  metricsSubtitle,
  centerMetrics = false,
  collapsibleMetrics = false,
  metricsStorageKey,
  defaultMetricsCollapsed = false,
}: {
  title: string;
  description?: string;
  icon: React.ComponentType<{ className?: string }>;
  actions?: AdminTabActionConfig[];
  metrics?: AdminTabMetricConfig[];
  toolbar?: React.ReactNode;
  toolbarAfterMetrics?: boolean;
  metricsClassName?: string;
  metricsContainerClassName?: string;
  metricsTitle?: string;
  metricsSubtitle?: string;
  centerMetrics?: boolean;
  collapsibleMetrics?: boolean;
  metricsStorageKey?: string;
  defaultMetricsCollapsed?: boolean;
}) {
  const resolvedMetricsClassName = metricsClassName || 'xl:grid-cols-4';

  const storageKey = metricsStorageKey ? `admin-metrics-collapsed:${metricsStorageKey}` : null;
  const [metricsCollapsed, setMetricsCollapsed] = useState<boolean>(() => {
    if (!collapsibleMetrics) return false;
    if (storageKey && typeof window !== 'undefined') {
      const stored = window.localStorage.getItem(storageKey);
      if (stored === 'true') return true;
      if (stored === 'false') return false;
    }
    return defaultMetricsCollapsed;
  });

  const toggleMetricsCollapsed = () => {
    setMetricsCollapsed((prev) => {
      const next = !prev;
      if (storageKey && typeof window !== 'undefined') {
        window.localStorage.setItem(storageKey, String(next));
      }
      return next;
    });
  };

  return (
    <div className="admin-tab-hero-card">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex items-start gap-4">
            <div className="admin-tab-hero__icon">
              <Icon className="h-6 w-6" />
            </div>

            <div className="min-w-0">
              <h2 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">{title}</h2>
              {description ? <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500 sm:text-[15px]">{description}</p> : null}
            </div>
          </div>

          {actions.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {actions.map(({ label, icon: ActionIcon, onClick, variant = 'secondary', disabled = false }) => (
                <button
                  key={label}
                  type="button"
                  onClick={onClick}
                  disabled={disabled}
                  className={`admin-tab-action admin-tab-action--${variant}`}
                >
                  <ActionIcon className="h-4 w-4" />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {!toolbarAfterMetrics && toolbar ? <div className="admin-tab-hero__toolbar">{toolbar}</div> : null}

        {metrics.length > 0 && (
          <div className={metricsContainerClassName}>
            {(metricsTitle || metricsSubtitle || collapsibleMetrics) ? (
              <div className="admin-tab-hero__section-head flex items-start justify-between gap-3">
                <div className="min-w-0">
                  {metricsTitle ? <p className="admin-tab-hero__section-label">{metricsTitle}</p> : null}
                  {metricsSubtitle ? <p className="admin-tab-hero__section-caption">{metricsSubtitle}</p> : null}
                </div>
                {collapsibleMetrics ? (
                  <button
                    type="button"
                    onClick={toggleMetricsCollapsed}
                    className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition hover:bg-slate-50"
                    aria-expanded={!metricsCollapsed}
                    title={metricsCollapsed ? 'Mostrar painel' : 'Recolher painel'}
                  >
                    {metricsCollapsed ? (
                      <>
                        <FaChevronDown className="h-3 w-3" />
                        <span>Mostrar</span>
                      </>
                    ) : (
                      <>
                        <FaChevronUp className="h-3 w-3" />
                        <span>Recolher</span>
                      </>
                    )}
                  </button>
                ) : null}
              </div>
            ) : null}

            {!metricsCollapsed && (
            <div className={`grid gap-3 sm:grid-cols-2 ${resolvedMetricsClassName}`.trim()}>
              {metrics.map(({ metricKey, label, value, hint, icon: MetricIcon, tone = 'sky', cardClassName = '', renderContent }) => {
                const toneClassName = ADMIN_TAB_TONE_CLASSES[tone];

                return (
                  <div key={metricKey ?? label} className={`admin-tab-stat-card ${cardClassName}`.trim()}>
                    {renderContent ? renderContent({
                      label,
                      value,
                      hint,
                      icon: MetricIcon,
                      toneClassName,
                      centered: centerMetrics,
                    }) : centerMetrics ? (
                      <div className="flex min-h-[104px] flex-col items-center justify-center gap-4 text-center">
                        <span className={`admin-tab-stat-card__icon ${toneClassName}`}>
                          <MetricIcon className="h-4 w-4" />
                        </span>

                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">{label}</p>
                          <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">{value}</p>
                          {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
                        </div>
                      </div>
                    ) : (
                      <div className="admin-tab-stat-card__body flex items-start justify-between gap-3">
                        <div className="admin-tab-stat-card__text min-w-0">
                          <p className="admin-tab-stat-card__label text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">{label}</p>
                          <p className="admin-tab-stat-card__value mt-3 text-2xl font-semibold tracking-tight text-slate-900">{value}</p>
                          {hint ? <p className="admin-tab-stat-card__hint mt-1 text-xs text-slate-500">{hint}</p> : null}
                        </div>

                        <span className={`admin-tab-stat-card__icon ${toneClassName}`}>
                          <MetricIcon className="h-4 w-4" />
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            )}
          </div>
        )}

        {toolbarAfterMetrics && toolbar ? <div className="admin-tab-hero__toolbar">{toolbar}</div> : null}
      </div>
    </div>
  );
}





const gerarIdModeloMensagem = (indice: number) =>

  `modelo-${Date.now().toString(36)}-${indice.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const normalizarModelosMensagemManual = (valor: unknown): WhatsappModeloMensagem[] => {

  if (!Array.isArray(valor)) return [];

  const idsUsados = new Set<string>();

  const modelos: WhatsappModeloMensagem[] = [];

  valor.forEach((item: any, indice: number) => {

    const titulo = typeof item?.titulo === 'string' ? item.titulo.trim() : '';

    const mensagem = typeof item?.mensagem === 'string' ? item.mensagem.trim() : '';

    if (!titulo || !mensagem) return;

    let id = typeof item?.id === 'string' ? item.id.trim() : '';

    if (!id) {

      id = gerarIdModeloMensagem(indice);

    }

    while (idsUsados.has(id)) {

      id = gerarIdModeloMensagem(indice + modelos.length + 1);

    }

    idsUsados.add(id);

    modelos.push({ id, titulo, mensagem });

  });

  return modelos;

};

const diasDaSemana = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

const diasDaSemanaCurto = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];

const horariosDisponiveis = [

  '08:00', '09:00', '10:00', '11:00', '12:00',

  '13:00', '14:00', '15:00', '16:00', '18:00'

];




const criarTipoClienteVazio = (): TipoCliente => ({

  nome: '',

  descricao: '',

});

const normalizarTexto = (valor: string) =>

  valor

    .toString()

    .trim()

    .toLowerCase()

    .normalize('NFD')

    .replace(/[\u0300-\u036f]/g, '');

const obterChaveTipo = (tipo: TipoCliente) => tipo.id ?? normalizarTexto(tipo.nome);

const obterValorMapa = (

  mapa: Record<string, number> | undefined,

  tipo: TipoCliente

) => {

  if (!mapa) return undefined;

  if (tipo.id && tipo.id in mapa) return Number(mapa[tipo.id]);

  if (tipo.nome in mapa) return Number(mapa[tipo.nome]);

  const nomeNormalizado = normalizarTexto(tipo.nome);

  for (const [chave, valor] of Object.entries(mapa)) {

    if (normalizarTexto(chave) === nomeNormalizado) {

      return Number(valor);

    }

  }

  return undefined;

};

const obterValorPorTipoNome = (

  mapa: Record<string, number> | undefined,

  tipos: TipoCliente[],

  termo: string

) => {

  const tipo = tipos.find((item) => normalizarTexto(item.nome).includes(termo));

  if (!tipo) return undefined;

  const valor = obterValorMapa(mapa, tipo);

  return Number.isFinite(valor) ? Number(valor) : undefined;

};

const obterPrecoLegado = (

  tipo: TipoCliente,

  legado?: { precoAdulto?: number; precoCrianca?: number; precoBariatrica?: number }

) => {

  if (!legado) return 0;

  const nome = normalizarTexto(tipo.nome);

  if (nome.includes('adult')) return Number(legado.precoAdulto ?? 0);

  if (nome.includes('crian')) return Number(legado.precoCrianca ?? 0);

  if (nome.includes('bariat')) return Number(legado.precoBariatrica ?? 0);

  return 0;

};

const obterQuantidadeLegada = (

  tipo: TipoCliente,

  reserva: Pick<Reserva, 'adultos' | 'criancas' | 'bariatrica'>

) => {

  const nome = normalizarTexto(tipo.nome);

  if (nome.includes('adult')) return Number(reserva.adultos ?? 0);

  if (nome.includes('crian')) return Number(reserva.criancas ?? 0);

  if (nome.includes('bariat')) return Number(reserva.bariatrica ?? 0);

  return 0;

};

const montarPrecosPorTipo = (

  tipos: TipoCliente[],

  mapaAtual: Record<string, number> | undefined,

  legado?: { precoAdulto?: number; precoCrianca?: number; precoBariatrica?: number }

) => {

  const resultado: Record<string, number> = { ...(mapaAtual ?? {}) };

  tipos.forEach((tipo) => {

    const chave = obterChaveTipo(tipo);

    const existente = obterValorMapa(mapaAtual, tipo);

    const legadoValor = obterPrecoLegado(tipo, legado);

    const valor = Number.isFinite(existente) ? Number(existente) : legadoValor;

    resultado[chave] = Number.isFinite(valor) ? Number(valor) : 0;

  });

  return resultado;

};

const obterPrecoPorTipo = (

  mapa: Record<string, number> | undefined,

  tipo: TipoCliente,

  legado?: { precoAdulto?: number; precoCrianca?: number; precoBariatrica?: number }

) => {

  const valor = obterValorMapa(mapa, tipo);

  if (Number.isFinite(valor)) return Number(valor);

  return obterPrecoLegado(tipo, legado);

};

const montarParticipantesPorTipo = (

  tipos: TipoCliente[],

  reserva: Pick<Reserva, 'participantesPorTipo' | 'adultos' | 'criancas' | 'bariatrica'>

) => {

  const mapaAtual = reserva.participantesPorTipo ?? {};

  const resultado: Record<string, number> = { ...mapaAtual };

  tipos.forEach((tipo) => {

    const chave = obterChaveTipo(tipo);

    const existente = obterValorMapa(mapaAtual, tipo);

    const legado = obterQuantidadeLegada(tipo, reserva);

    const valor = Number.isFinite(existente) ? Number(existente) : legado;

    resultado[chave] = Number.isFinite(valor) ? Number(valor) : 0;

  });

  return resultado;

};

const somarMapa = (mapa?: Record<string, number>) => {

  if (!mapa) return 0;

  return Object.values(mapa).reduce((total, valor) => total + (Number(valor) || 0), 0);

};

const calcularValorPacotesSelecionados = (
  pacotesSelecionados: Pacote[],
  tipos: TipoCliente[],
  participantesPorTipo?: Record<string, number>
) =>
  pacotesSelecionados.reduce((totalPacotes, pacote) => {
    const subtotalPacote = tipos.reduce((subtotalTipo, tipo) => {
      const quantidade = Number(obterValorMapa(participantesPorTipo, tipo) ?? 0);
      const quantidadeValida = Number.isFinite(quantidade) ? Math.max(0, quantidade) : 0;
      if (quantidadeValida <= 0) return subtotalTipo;

      const preco = obterPrecoPorTipo(pacote.precosPorTipo, tipo, pacote);
      return subtotalTipo + quantidadeValida * preco;
    }, 0);

    return totalPacotes + subtotalPacote;
  }, 0);

const ordenarHorarios = (lista: string[]) => [...lista].sort(compararTextoNumericamente);



const statusEhPreReserva = (reserva?: Pick<Reserva, 'status'>) =>
  reservaTemStatusPreReserva(reserva);



const statusEhConfirmado = (reserva?: Pick<Reserva, 'status' | 'confirmada'>) => {
  return reservaEstaConfirmada(reserva);

};



const reservaEhManual = (reserva?: Pick<Reserva, 'origem'>) => reserva?.origem === 'manual';

const reservaEhPagaNoCheckout = (
  reserva?: Pick<Reserva, 'origem' | 'status' | 'confirmada'>
) => !reservaEhManual(reserva) && statusEhConfirmado(reserva);

const reservaAtendeFiltroOrigem = (reserva: Reserva, filtro: OrigemReservaFiltro) => {
  if (filtro === 'todas') return true;
  if (filtro === 'manual') return reservaEhManual(reserva);
  return reservaEhPagaNoCheckout(reserva);
};

const obterRotuloFiltroOrigemReserva = (filtro: OrigemReservaFiltro) => {
  if (filtro === 'manual') return 'Reservas manuais';
  if (filtro === 'checkout') return 'Pagas pelo checkout';
  return 'Todas as reservas';
};

const obterBadgeStatus = (reserva: Reserva) => {

  const statusNormalizado = normalizarStatus(reserva.status);

  if (reservaEhAguardandoPagamento(reserva)) {

    return {

      label: ['processing', 'processando'].includes(statusNormalizado)
        ? 'Processando pagamento'
        : 'Aguardando pagamento',

      classes: 'border-amber-200 bg-amber-50 text-amber-700',

    };

  }

  if (statusEhPreReserva(reserva)) {

    return {

      label: 'Pré-reserva',

      classes: 'border-amber-200 bg-amber-50 text-amber-700',

    };

  }

  if (statusNormalizado === 'pago') {

    return {

      label: 'Pago',

      classes: 'border-blue-200 bg-blue-50 text-blue-700',

    };

  }

  if (statusEhConfirmado(reserva)) {

    return {

      label: 'Confirmado',

      classes: 'border-emerald-200 bg-emerald-50 text-emerald-700',

    };

  }

  return {

    label: 'Sem status',

    classes: 'border-slate-200 bg-slate-50 text-slate-600',

  };

};

const obterApresentacaoReserva = (reserva: Reserva, participantes: number) => {
  if (reservaEhManual(reserva)) {
    return {
      Icon: FaClipboardList,
      label: reserva.educativo ? 'Reserva manual educativa' : 'Reserva manual',
    };
  }

  if (reserva.educativo) {
    return {
      Icon: FaGraduationCap,
      label: 'Reserva educativa',
    };
  }

  if (participantes <= 1) {
    return {
      Icon: FaUser,
      label: 'Reserva individual',
    };
  }

  return {
    Icon: FaUsers,
    label: 'Reserva em grupo',
  };
};



export default function AdminDashboard() {

  const [aba, setAba] = useState<AdminAba>('reservas');

  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [temaPainel, setTemaPainel] = useState<'dark' | 'light'>(() => {
    if (typeof window === 'undefined') return 'dark';
    const temaSalvo = window.localStorage.getItem('vagafogo-admin-theme');
    return temaSalvo === 'light' ? 'light' : 'dark';
  });

  const [layoutHeaderPainel, setLayoutHeaderPainel] = useState<'sidebar' | 'top'>(() => {
    if (typeof window === 'undefined') return 'sidebar';
    const layoutSalvo = window.localStorage.getItem('vagafogo-admin-layout');
    return layoutSalvo === 'top' ? 'top' : 'sidebar';
  });

  const abaAtualRef = useRef(aba);

  useEffect(() => {
    abaAtualRef.current = aba;
  }, [aba]);

  // Pré-carrega o áudio e desbloqueia o autoplay na primeira interação do usuário
  useEffect(() => {
    const audio = new Audio('/notificacao.mp3');
    audio.preload = 'auto';
    audio.loop = false;
    audio.volume = 1;
    notificacaoAudioRef.current = audio;

    const unlock = () => {
      audio.play().then(() => {
        audio.pause();
        audio.currentTime = 0;
      }).catch(() => {});
      document.removeEventListener('click', unlock, true);
      document.removeEventListener('keydown', unlock, true);
      document.removeEventListener('touchstart', unlock, true);
    };

    document.addEventListener('click', unlock, true);
    document.addEventListener('keydown', unlock, true);
    document.addEventListener('touchstart', unlock, true);

    return () => {
      document.removeEventListener('click', unlock, true);
      document.removeEventListener('keydown', unlock, true);
      document.removeEventListener('touchstart', unlock, true);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('vagafogo-admin-theme', temaPainel);
  }, [temaPainel]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('vagafogo-admin-layout', layoutHeaderPainel);
  }, [layoutHeaderPainel]);



  // Reservas

  const [selectedDate, setSelectedDate] = useState(new Date());

  const [mostrarCalendario, setMostrarCalendario] = useState(false);

  const [reservas, setReservas] = useState<Record<string, Reserva[]>>({});

  const [indicadoresReservasCalendario, setIndicadoresReservasCalendario] = useState<
    Record<string, number>
  >({});

  const [reservasDataEmEdicao, setReservasDataEmEdicao] = useState<Reserva[]>([]);
  const [vagasExtrasDisponibilidadeEmEdicao, setVagasExtrasDisponibilidadeEmEdicao] =
    useState<Record<string, number>>({});

  const [mesas, setMesas] = useState<Mesa[]>([]);

  const [carregandoMesas, setCarregandoMesas] = useState(false);

  const [editReserva, setEditReserva] = useState<Reserva | null>(null);

  const [reservaOriginalEmEdicao, setReservaOriginalEmEdicao] = useState<{
    data: string;
    horario: string;
  } | null>(null);

  const [modalReserva, setModalReserva] = useState(false);
  const [modalResumoDia, setModalResumoDia] = useState(false);

  const [isEditingReserva, setIsEditingReserva] = useState(false);

  const [valorManualReservaInput, setValorManualReservaInput] = useState('');

  const [filtroAtividade, setFiltroAtividade] = useState<string>('');

  const [filtroChegada, setFiltroChegada] = useState<'todos' | 'chegou' | 'nao'>('todos');

  const [filtroStatusReserva, setFiltroStatusReserva] = useState<'todos' | 'confirmadas' | 'pre_reservas'>('todos');

  const [filtroOrigemReserva, setFiltroOrigemReserva] = useState<OrigemReservaFiltro>('todas');

  const [filtroPerfilReserva, setFiltroPerfilReserva] = useState<'todos' | 'educativo' | 'padrao'>('todos');

  const [feedback, setFeedback] = useState<{ type: 'success' | 'error', message: string } | null>(null);

  const [reservaDetalhesAberta, setReservaDetalhesAberta] = useState<string | null>(null);

  const [menuReservaAberto, setMenuReservaAberto] = useState<string | null>(null);

  const [whatsappEnvioModal, setWhatsappEnvioModal] = useState<WhatsappEnvioModal | null>(null);

  const [whatsappEnvioModeloId, setWhatsappEnvioModeloId] = useState<string>('padrao');

  const [whatsappEnvioMensagem, setWhatsappEnvioMensagem] = useState('');

  const [whatsappModeloAbertoId, setWhatsappModeloAbertoId] = useState<string | null>(null);

  const [whatsappStatus, setWhatsappStatus] = useState<WhatsappStatusPayload>({
    status: 'idle',
    qr: null,
  });

  const [whatsappStatusCarregando, setWhatsappStatusCarregando] = useState(false);

  const [whatsappAcaoCarregando, setWhatsappAcaoCarregando] = useState<'start' | 'logout' | null>(null);

   const [notificacaoNovaReserva, setNotificacaoNovaReserva] = useState<NotificacaoNovaReserva | null>(null);

   const notificacaoAudioRef = useRef<HTMLAudioElement | null>(null);

   const notificacaoAudioTokenRef = useRef(0);

  useEffect(() => {
    if (!modalReserva) return;

    const overflowBodyAnterior = document.body.style.overflow;
    const overflowHtmlAnterior = document.documentElement.style.overflow;

    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = overflowBodyAnterior;
      document.documentElement.style.overflow = overflowHtmlAnterior;
    };
  }, [modalReserva]);

  useEffect(() => {
    if (!modalReserva || !editReserva) {
      setValorManualReservaInput('');
      return;
    }

    if (editReserva.educativo === true) {
      const valorManual = Number(editReserva.valor ?? 0);
      setValorManualReservaInput(formatCurrencyForEditing(valorManual));
      return;
    }

    setValorManualReservaInput('');
  }, [editReserva?.educativo, editReserva?.id, modalReserva]);

   const pararSomNotificacao = useCallback(() => {

     notificacaoAudioTokenRef.current += 1;

     const audio = notificacaoAudioRef.current;

     if (!audio) return;

     audio.onended = null;
     audio.loop = false;

     try {

       audio.pause();

       audio.currentTime = 0;

     } catch {

       // noop

     }

   }, []);

   const tocarSomNotificacao = useCallback(async () => {

     notificacaoAudioTokenRef.current += 1;

     if (!notificacaoAudioRef.current) {

       notificacaoAudioRef.current = new Audio('/notificacao.mp3');

     }

     const audio = notificacaoAudioRef.current;

     audio.onended = null;
     audio.loop = true;
     audio.volume = 1;

     try {

       audio.pause();

       audio.currentTime = 0;

     } catch {

       // noop

     }

     try {

       await audio.play();

     } catch (error) {

       console.warn('Som de notificação bloqueado pelo navegador:', error);

       return;

     }

   }, []);

  const fecharNotificacaoNovaReserva = useCallback(() => {

     setNotificacaoNovaReserva(null);

     pararSomNotificacao();

   }, [pararSomNotificacao]);

   useEffect(() => {
     return () => {
       pararSomNotificacao();
     };
   }, [pararSomNotificacao]);

   const exibirNotificacaoNovaReserva = useCallback(

     (reserva: Reserva) => {

       const id = reserva.id ?? `${reserva.nome}-${reserva.cpf}-${reserva.horario}-${normalizarDataReserva(reserva.data)}`;

       setNotificacaoNovaReserva({

         id,

         nome: reserva.nome || 'Cliente',

         horario: reserva.horario || '---',

         atividade: reserva.atividade || 'Atividade',

         participantes: calcularParticipantes(reserva),

       });

       void tocarSomNotificacao();

     },

     [tocarSomNotificacao]

   );



  // Pacotes

  const [pacotes, setPacotes] = useState<Pacote[]>([]);

  const [modalPacote, setModalPacote] = useState(false);

  const [editPacote, setEditPacote] = useState<Pacote | null>(null);

  const [isEditingPacote, setIsEditingPacote] = useState(false);

  const [novaDataBloqueada, setNovaDataBloqueada] = useState('');

  const [novaPergunta, setNovaPergunta] = useState<{
    pergunta: string;
    tipo: 'sim_nao' | 'texto';
    obrigatoria: boolean;
    emojiSim: string;
    emojiNao: string;
  }>({ pergunta: '', tipo: 'sim_nao', obrigatoria: false, emojiSim: '✅', emojiNao: '❌' });

  const [modalDisponibilidade, setModalDisponibilidade] = useState(false);

  const [combos, setCombos] = useState<Combo[]>([]);

  const [modalCombo, setModalCombo] = useState(false);

  const [editCombo, setEditCombo] = useState<Combo | null>(null);

  const [isEditingCombo, setIsEditingCombo] = useState(false);

  const [salvandoCombo, setSalvandoCombo] = useState(false);

  const [disponibilidadeData, setDisponibilidadeData] = useState<Record<string, boolean>>({});
  const [vagasExtrasDisponibilidade, setVagasExtrasDisponibilidade] = useState<Record<string, number>>({});

  const [carregandoDisponibilidade, setCarregandoDisponibilidade] = useState(false);

  const [salvandoDisponibilidade, setSalvandoDisponibilidade] = useState(false);

  const [diaFechado, setDiaFechado] = useState(false);

  const [fechamentoInicio, setFechamentoInicio] = useState('');

  const [fechamentoFim, setFechamentoFim] = useState('');

  const [acaoFechamentoPeriodo, setAcaoFechamentoPeriodo] = useState<'fechar' | 'abrir'>('fechar');


  const [processandoFechamentoPeriodo, setProcessandoFechamentoPeriodo] = useState(false);


  const [pacotesDisponibilidadeAbertos, setPacotesDisponibilidadeAbertos] = useState<Record<string, boolean>>({});

  const atualizarVagasExtrasDisponibilidade = useCallback((chave: string, valor: string) => {
    if (!chave) return;

    setVagasExtrasDisponibilidade((prev) => {
      const proximo = { ...prev };
      const valorLimpo = valor.trim();
      const quantidade = Number(valorLimpo);

      if (!valorLimpo || !Number.isFinite(quantidade) || quantidade <= 0) {
        delete proximo[chave];
        return proximo;
      }

      proximo[chave] = Math.max(Math.trunc(quantidade), 0);
      return proximo;
    });
  }, []);

  const somarVagasExtrasDisponibilidade = useCallback((chave: string, incremento: number) => {
    if (!chave || !Number.isFinite(incremento) || incremento === 0) return;

    setVagasExtrasDisponibilidade((prev) => {
      const atual = Number(prev[chave] ?? 0);
      const proximoValor = Math.max(Math.trunc(atual + incremento), 0);
      if (proximoValor <= 0) {
        const proximo = { ...prev };
        delete proximo[chave];
        return proximo;
      }
      return {
        ...prev,
        [chave]: proximoValor,
      };
    });
  }, []);

  const horariosDisponibilidadeGerais = useMemo(
    () =>
      ordenarHorarios(
        Array.from(
          new Set(
            pacotes.flatMap((pacote) =>
              Array.isArray(pacote.horarios)
                ? pacote.horarios
                    .map((horario) => horario?.toString().trim())
                    .filter((horario): horario is string => Boolean(horario))
                : []
            )
          )
        )
      ),
    [pacotes]
  );

  // Tipos de clientes

  const [tiposClientes, setTiposClientes] = useState<TipoCliente[]>([]);

  const [editTipoCliente, setEditTipoCliente] = useState<TipoCliente>(criarTipoClienteVazio);

  const [isEditingTipoCliente, setIsEditingTipoCliente] = useState(false);

  const [carregandoTiposClientes, setCarregandoTiposClientes] = useState(false);

  const [salvandoTipoCliente, setSalvandoTipoCliente] = useState(false);

  // Configurações do site
  const [siteConfig, setSiteConfig] = useState<{ textoFuncionamento: string }>({ textoFuncionamento: '' });
  const [siteConfigSalvando, setSiteConfigSalvando] = useState(false);

  // Email e mensagens

  const [whatsappConfig, setWhatsappConfig] = useState<WhatsappConfig>({

    ativo: true,

    assuntoConfirmacaoEmail: emailAssuntoConfirmacaoPadrao,
    mensagemConfirmacaoAutomatica: emailTemplateConfirmacaoPadrao,
    mensagemConfirmacaoManual: whatsappTemplateMensagemManualPadrao,
    mensagemBoasVindas: whatsappTemplateBoasVindasPadrao,
    modelosMensagemManual: [],

  });

  const [whatsappSalvando, setWhatsappSalvando] = useState(false);

  const [emailFila, setEmailFila] = useState<EmailFilaResumo>({
    emailHabilitado: false,
    totalReservasPagas: 0,
    enviados: 0,
    pendentes: 0,
    erros: 0,
    semEmail: 0,
    uso: {
      diario: criarEmailUsoEscopo(0, 100),
      mensal: criarEmailUsoEscopo(0, 3000),
    },
    itens: [],
  });

  const [emailFilaCarregando, setEmailFilaCarregando] = useState(false);

  const [emailAcaoCarregando, setEmailAcaoCarregando] = useState<{
    id: string;
    acao: 'retry' | 'excluir';
  } | null>(null);

  const [emailRegistroFiltro, setEmailRegistroFiltro] = useState<'todos' | 'erro' | 'pendente' | 'enviado'>('todos');

  // Disparar fila: data minima a partir da qual emails serao enviados
  const [emailDataMinima, setEmailDataMinima] = useState<string>(() => dayjs().format('YYYY-MM-DD'));
  const [processandoFila, setProcessandoFila] = useState(false);

  // Busca textual na fila
  const [emailBuscaTexto, setEmailBuscaTexto] = useState('');

  // Filtro por data da reserva (range)
  const [emailFiltroDataDe, setEmailFiltroDataDe] = useState('');
  const [emailFiltroDataAte, setEmailFiltroDataAte] = useState('');

  // Selecao em massa
  const [emailSelecionados, setEmailSelecionados] = useState<Set<string>>(new Set());
  const [excluindoEmMassa, setExcluindoEmMassa] = useState(false);

  // Dashboard
  const [dashboardInicio, setDashboardInicio] = useState(() => dayjs().subtract(30, 'day').format('YYYY-MM-DD'));

  const [dashboardFim, setDashboardFim] = useState(() => dayjs().format('YYYY-MM-DD'));

  const [dashboardReservas, setDashboardReservas] = useState<Reserva[]>([]);

  const [dashboardCarregando, setDashboardCarregando] = useState(false);

  const [dashboardErro, setDashboardErro] = useState<string | null>(null);
  const [dashboardFiltroOrigem, setDashboardFiltroOrigem] = useState<OrigemReservaFiltro>('todas');
  const [dashboardCensurar, setDashboardCensurar] = useState(false);
  const [dashboardAtividadeFiltro, setDashboardAtividadeFiltro] = useState('');
  const [dashboardClienteFiltro, setDashboardClienteFiltro] = useState('');
  const [dashboardAtividadeMetrica, setDashboardAtividadeMetrica] = useState<
    'faturamento' | 'confirmadas' | 'pre_reservas' | 'participantes'
  >('faturamento');
  const [dashboardClienteMetrica, setDashboardClienteMetrica] = useState<
    'faturamento' | 'confirmadas' | 'pre_reservas' | 'participantes'
  >('faturamento');
  const [dashboardMostrarTodosClientes, setDashboardMostrarTodosClientes] = useState(false);

  useEffect(() => {
    if (!dashboardCensurar) return;
    setDashboardAtividadeMetrica((prev) => (prev === 'faturamento' ? 'confirmadas' : prev));
    setDashboardClienteMetrica((prev) => (prev === 'faturamento' ? 'confirmadas' : prev));
    setDashboardClienteFiltro('');
  }, [dashboardCensurar]);


  const faixaHorarioDescricao = editPacote?.modoHorario === 'intervalo'

    && (editPacote.horarioInicio ?? '')

    && (editPacote.horarioFim ?? '')

    ? `Disponível das ${editPacote.horarioInicio} às ${editPacote.horarioFim}. O cliente verá apenas a faixa.`

    : 'bg-white border-slate-200';



  







  const mesasPorArea = useMemo(() => {



    const agrupadas = mesas.reduce<Record<string, Mesa[]>>((acc, mesa) => {



      const area = mesa.area || 'Sem área';



      if (!acc[area]) {



        acc[area] = [];



      }



      acc[area].push(mesa);



      return acc;



    }, {});







    Object.keys(agrupadas).forEach((area) => {



      agrupadas[area] = agrupadas[area].sort((a, b) =>



        a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true, sensitivity: 'base' })



      );



    });







    return agrupadas;



  }, [mesas]);







  const areasDisponiveis = useMemo(() => {



    return Object.keys(mesasPorArea).sort((a, b) =>



      a.localeCompare(b, 'pt-BR', { sensitivity: 'base' })



    );



  }, [mesasPorArea]);





  const participantesEmEdicao = useMemo(() => {

    return editReserva ? calcularParticipantes(editReserva) : 0;

  }, [editReserva]);



  const mesaPrincipalEmEdicao = useMemo(() => {

    if (!editReserva?.mesaPrincipalId) return undefined;

    return mesas.find((mesa) => mesa.id === editReserva.mesaPrincipalId);

  }, [editReserva?.mesaPrincipalId, mesas]);



  const mesaSecundariaEmEdicao = useMemo(() => {

    if (!editReserva?.mesaSecundariaId) return undefined;

    return mesas.find((mesa) => mesa.id === editReserva.mesaSecundariaId);

  }, [editReserva?.mesaSecundariaId, mesas]);



  const capacidadeTotalMesasEmEdicao =

    (mesaPrincipalEmEdicao?.capacidade ?? 0) +

    (mesaSecundariaEmEdicao?.capacidade ?? 0);



  const precisaMesaComplementarEmEdicao =

    !!mesaPrincipalEmEdicao &&

    participantesEmEdicao > (mesaPrincipalEmEdicao?.capacidade ?? 0);



  const capacidadeInsuficienteEmEdicao =

    !!mesaPrincipalEmEdicao &&

    participantesEmEdicao > capacidadeTotalMesasEmEdicao;



  const mesasDisponiveisNaAreaEmEdicao = useMemo(() => {

    if (!editReserva?.areaMesa) return [];

    return mesasPorArea[editReserva.areaMesa] ?? [];

  }, [editReserva?.areaMesa, mesasPorArea]);

  const inferirPacoteIdsReserva = useCallback(
    (reserva: Reserva) => {
      const idsExistentes = Array.isArray(reserva.pacoteIds)
        ? reserva.pacoteIds.map((id) => id?.toString()).filter(Boolean)
        : [];

      if (idsExistentes.length > 0) {
        return Array.from(new Set(idsExistentes));
      }

      const atividadeBase = (reserva.atividade ?? '').replace(/\([^)]*\)/g, ' ');
      const atividadeNormalizada = normalizarTexto(atividadeBase);
      const fragmentos = atividadeBase
        .split('+')
        .map((parte) => normalizarTexto(parte))
        .filter(Boolean);

      return Array.from(
        new Set(
          pacotes
            .filter((pacote) => {
              const nomeNormalizado = normalizarTexto(pacote.nome ?? '');
              if (!nomeNormalizado) return false;

              return (
                atividadeNormalizada.includes(nomeNormalizado) ||
                fragmentos.some(
                  (fragmento) =>
                    fragmento.includes(nomeNormalizado) || nomeNormalizado.includes(fragmento)
                )
              );
            })
            .map((pacote) => pacote.id)
            .filter((id): id is string => Boolean(id))
        )
      );
    },
    [pacotes]
  );

  const pacotesSelecionadosEmEdicao = useMemo(() => {
    if (!editReserva) return [];
    const idsSelecionados = new Set(
      Array.isArray(editReserva.pacoteIds)
        ? editReserva.pacoteIds.map((id) => id?.toString()).filter(Boolean)
        : []
    );

    return pacotes.filter((pacote) => pacote.id && idsSelecionados.has(pacote.id));
  }, [editReserva, pacotes]);

  const pacotesComHorarioEspecificoEmEdicao = useMemo(
    () =>
      pacotesSelecionadosEmEdicao.filter(
        (pacote) =>
          (pacote.modoHorario ?? 'lista') !== 'intervalo' &&
          Array.isArray(pacote.horarios) &&
          pacote.horarios.length > 0
      ),
    [pacotesSelecionadosEmEdicao]
  );

  const horariosCompativeisPacotesEmEdicao = useMemo(() => {
    if (pacotesComHorarioEspecificoEmEdicao.length === 0) return [];

    return ordenarHorarios(
      pacotesComHorarioEspecificoEmEdicao.reduce<string[]>((horariosBase, pacote, index) => {
        const horariosPacote = Array.isArray(pacote.horarios) ? pacote.horarios : [];
        if (index === 0) return [...horariosPacote];
        return horariosBase.filter((horario) => horariosPacote.includes(horario));
      }, [])
    );
  }, [pacotesComHorarioEspecificoEmEdicao]);

  const reservasOcupandoVagasEmEdicao = useMemo(() => {
    const dataReserva = normalizarDataReserva(editReserva?.data);
    if (!dataReserva) return [];

    return reservasDataEmEdicao.filter((reserva) => {
      if (!reservaContaParaOcupacao(reserva)) return false;
      if (isEditingReserva && editReserva?.id && reserva.id === editReserva.id) return false;
      return normalizarDataReserva(reserva.data) === dataReserva;
    });
  }, [editReserva?.data, editReserva?.id, isEditingReserva, reservasDataEmEdicao]);

  const reservasPorPacoteHorarioEmEdicao = useMemo(() => {
    const mapa: Record<string, number> = {};

    reservasOcupandoVagasEmEdicao.forEach((reserva) => {
      const participantes = calcularParticipantes(reserva);
      if (participantes <= 0 || !reserva.horario) return;

      const pacoteIds = inferirPacoteIdsReserva(reserva);
      if (pacoteIds.length === 0) return;

      Array.from(new Set(pacoteIds)).forEach((pacoteId) => {
        const chave = `${pacoteId}__${reserva.horario}`;
        mapa[chave] = (mapa[chave] ?? 0) + participantes;
      });
    });

    return mapa;
  }, [inferirPacoteIdsReserva, reservasOcupandoVagasEmEdicao]);

  const reservasPorPacoteDiaEmEdicao = useMemo(() => {
    const mapa: Record<string, number> = {};

    reservasOcupandoVagasEmEdicao.forEach((reserva) => {
      const participantes = calcularParticipantes(reserva);
      if (participantes <= 0) return;

      const pacoteIds = inferirPacoteIdsReserva(reserva);
      if (pacoteIds.length === 0) return;

      Array.from(new Set(pacoteIds)).forEach((pacoteId) => {
        mapa[pacoteId] = (mapa[pacoteId] ?? 0) + participantes;
      });
    });

    return mapa;
  }, [inferirPacoteIdsReserva, reservasOcupandoVagasEmEdicao]);

  const horariosDisponiveisPacotesEmEdicao = useMemo(() => {
    if (horariosCompativeisPacotesEmEdicao.length === 0) return [];
    return ordenarHorarios([...horariosCompativeisPacotesEmEdicao]);
  }, [horariosCompativeisPacotesEmEdicao]);

  const vagasRestantesPorHorarioEmEdicao = useMemo(() => {
    const mapa: Record<string, number | null> = {};
    if (pacotesSelecionadosEmEdicao.length === 0) return mapa;
    const dataStr = normalizarDataReserva(editReserva?.data);

    horariosDisponiveisPacotesEmEdicao.forEach((horarioLista) => {
      let restante: number | null = null;

      pacotesSelecionadosEmEdicao.forEach((pacote) => {
        if (!pacote.id) return;

        const limite = Number(pacote.limite ?? 0);
        if (!Number.isFinite(limite) || limite <= 0) return;

        const ehFaixa =
          (pacote.modoHorario ?? 'lista') === 'intervalo' || (pacote.horarios?.length ?? 0) === 0;
        const reservados = ehFaixa
          ? reservasPorPacoteDiaEmEdicao[pacote.id] ?? 0
          : reservasPorPacoteHorarioEmEdicao[`${pacote.id}__${horarioLista}`] ?? 0;
        const vagasExtras = obterVagasExtrasDisponibilidade({
          dataStr,
          pacoteId: pacote.id,
          horario: ehFaixa ? undefined : horarioLista,
          vagasExtras: vagasExtrasDisponibilidadeEmEdicao,
        });
        const pacoteRestante = limite + vagasExtras - reservados;

        restante = restante === null ? pacoteRestante : Math.min(restante, pacoteRestante);
      });

      mapa[horarioLista] = restante;
    });

    return mapa;
  }, [
    editReserva?.data,
    horariosDisponiveisPacotesEmEdicao,
    pacotesSelecionadosEmEdicao,
    reservasPorPacoteDiaEmEdicao,
    reservasPorPacoteHorarioEmEdicao,
    vagasExtrasDisponibilidadeEmEdicao,
  ]);

  const vagasRestantesFaixaDiaEmEdicao = useMemo(() => {
    let restante: number | null = null;
    const dataStr = normalizarDataReserva(editReserva?.data);

    pacotesSelecionadosEmEdicao.forEach((pacote) => {
      if (!pacote.id) return;

      const ehFaixa =
        (pacote.modoHorario ?? 'lista') === 'intervalo' || (pacote.horarios?.length ?? 0) === 0;
      if (!ehFaixa) return;

      const limite = Number(pacote.limite ?? 0);
      if (!Number.isFinite(limite) || limite <= 0) return;

      const reservados = reservasPorPacoteDiaEmEdicao[pacote.id] ?? 0;
      const vagasExtras = obterVagasExtrasDisponibilidade({
        dataStr,
        pacoteId: pacote.id,
        vagasExtras: vagasExtrasDisponibilidadeEmEdicao,
      });
      const pacoteRestante = limite + vagasExtras - reservados;

      restante = restante === null ? pacoteRestante : Math.min(restante, pacoteRestante);
    });

    return restante;
  }, [
    editReserva?.data,
    pacotesSelecionadosEmEdicao,
    reservasPorPacoteDiaEmEdicao,
    vagasExtrasDisponibilidadeEmEdicao,
  ]);

  const requerHorarioEspecificoEmEdicao = pacotesComHorarioEspecificoEmEdicao.length > 0;
  const conflitoHorarioPacotesEmEdicao =
    requerHorarioEspecificoEmEdicao && horariosCompativeisPacotesEmEdicao.length === 0;
  const semHorarioValidoNaDataEmEdicao =
    requerHorarioEspecificoEmEdicao &&
    horariosCompativeisPacotesEmEdicao.length > 0 &&
    horariosDisponiveisPacotesEmEdicao.length === 0;

  const participantesPorTipoEmEdicao = useMemo(
    () => (editReserva ? montarParticipantesPorTipo(tiposClientes, editReserva) : {}),
    [editReserva, tiposClientes]
  );

  const quantidadePagantesEmEdicao = useMemo(
    () => somarMapa(participantesPorTipoEmEdicao),
    [participantesPorTipoEmEdicao]
  );

  const limiteHorarioSelecionadoEmEdicao = useMemo(() => {
    if (!editReserva?.horario) return null;
    const restante = vagasRestantesPorHorarioEmEdicao[editReserva.horario];
    return typeof restante === 'number' ? restante : null;
  }, [editReserva?.horario, vagasRestantesPorHorarioEmEdicao]);

  const limiteParticipantesManualEmEdicao = useMemo(() => {
    let limite: number | null = null;

    if (typeof vagasRestantesFaixaDiaEmEdicao === 'number') {
      limite = vagasRestantesFaixaDiaEmEdicao;
    }

    if (typeof limiteHorarioSelecionadoEmEdicao === 'number') {
      limite =
        limite === null
          ? limiteHorarioSelecionadoEmEdicao
          : Math.min(limite, limiteHorarioSelecionadoEmEdicao);
    }

    return limite;
  }, [limiteHorarioSelecionadoEmEdicao, vagasRestantesFaixaDiaEmEdicao]);

  const excedeuLimiteParticipantesManualEmEdicao =
    typeof limiteParticipantesManualEmEdicao === 'number' &&
    participantesEmEdicao > Math.max(limiteParticipantesManualEmEdicao, 0);

  const horariosSelecionaveisEmEdicao = useMemo(
    () => horariosDisponiveisPacotesEmEdicao,
    [horariosDisponiveisPacotesEmEdicao]
  );

  const valorTotalReservaEmEdicao = useMemo(
    () =>
      calcularValorPacotesSelecionados(
        pacotesSelecionadosEmEdicao,
        tiposClientes,
        participantesPorTipoEmEdicao
      ),
    [pacotesSelecionadosEmEdicao, participantesPorTipoEmEdicao, tiposClientes]
  );

  const valorTotalExibicaoEmEdicao = useMemo(() => {
    if (!editReserva) return '';
    if (editReserva.educativo === true) {
      return valorManualReservaInput;
    }
    return formatCurrency(valorTotalReservaEmEdicao);
  }, [editReserva, valorManualReservaInput, valorTotalReservaEmEdicao]);

  const atualizarEditReserva = useCallback((atualizacao: (prev: Reserva) => Reserva) => {
    setEditReserva((prev) => (prev ? atualizacao(prev) : prev));
  }, []);

  const ajustarParticipanteTipoEmEdicao = useCallback(
    (tipo: TipoCliente, delta: number) => {
      atualizarEditReserva((prev) => {
        const chave = obterChaveTipo(tipo);
        const atual = Number(obterValorMapa(prev.participantesPorTipo, tipo) ?? 0);
        const proximoValor = Math.max(0, atual + delta);

        return {
          ...prev,
          participantesPorTipo: {
            ...(prev.participantesPorTipo ?? {}),
            [chave]: proximoValor,
          },
        };
      });
    },
    [atualizarEditReserva]
  );

  const ajustarNaoPaganteEmEdicao = useCallback(
    (delta: number) => {
      atualizarEditReserva((prev) => ({
        ...prev,
        naoPagante: Math.max(0, Number(prev.naoPagante ?? 0) + delta),
      }));
    },
    [atualizarEditReserva]
  );

  const alternarPacoteEmEdicao = useCallback(
    (pacoteId: string) => {
      atualizarEditReserva((prev) => {
        const idsAtuais = new Set(
          Array.isArray(prev.pacoteIds) ? prev.pacoteIds.map((id) => id?.toString()).filter(Boolean) : []
        );

        if (idsAtuais.has(pacoteId)) {
          idsAtuais.delete(pacoteId);
        } else {
          idsAtuais.add(pacoteId);
        }

        return {
          ...prev,
          pacoteIds: Array.from(idsAtuais),
        };
      });
    },
    [atualizarEditReserva]
  );

  useEffect(() => {
    if (!modalReserva || pacotes.length === 0) return;

    setEditReserva((prev) => {
      if (!prev) return prev;
      if ((prev.pacoteIds?.length ?? 0) > 0) return prev;

      const pacoteIdsInferidos = inferirPacoteIdsReserva(prev);
      if (pacoteIdsInferidos.length === 0) return prev;

      return { ...prev, pacoteIds: pacoteIdsInferidos };
    });
  }, [inferirPacoteIdsReserva, modalReserva, pacotes.length]);

  useEffect(() => {
    if (!requerHorarioEspecificoEmEdicao) return;

    setEditReserva((prev) => {
      if (!prev) return prev;

      let novoHorario = prev.horario;

      if (horariosSelecionaveisEmEdicao.length === 0) {
        novoHorario = '';
      } else if (!horariosSelecionaveisEmEdicao.includes(prev.horario)) {
        const dataReserva = normalizarDataReserva(prev.data);
        const hoje = dayjs().format('YYYY-MM-DD');
        const minutosAgora = dayjs().hour() * 60 + dayjs().minute();
        const primeiroHorarioAtualOuFuturo =
          dataReserva === hoje
            ? horariosSelecionaveisEmEdicao.find((horario) => {
                const minutos = parseHorarioParaMinutos(horario);
                if (minutos === null) return true;
                return minutos >= minutosAgora;
              })
            : null;
        novoHorario = primeiroHorarioAtualOuFuturo ?? horariosSelecionaveisEmEdicao[0] ?? '';
      }

      // Retorna prev sem mudança se o horário não alterou — evita loop infinito
      if (novoHorario === prev.horario) return prev;
      return { ...prev, horario: novoHorario };
    });
  }, [
    horariosSelecionaveisEmEdicao,
    requerHorarioEspecificoEmEdicao,
  ]);



const totalReservasConfirmadas = useMemo(() => {



    return Object.values(reservas).reduce(



      (acc, lista) => acc + lista.filter((reserva) => statusEhConfirmado(reserva)).length,



      0



    );



  }, [reservas]);







const totalParticipantesDoDia = useMemo(() => {
    return Object.values(reservas).reduce(
      (acc, lista) =>
        acc +
        lista.reduce((subtotal, item) => subtotal + calcularParticipantes(item), 0),
      0
    );
  }, [reservas]);


  const totalReservasDoDia = useMemo(() => {
    return Object.values(reservas).reduce((acc, lista) => acc + lista.length, 0);
  }, [reservas]);


  const totalChegadasDoDia = useMemo(() => {
    return Object.values(reservas).reduce(
      (acc, lista) => acc + lista.filter((reserva) => reserva.chegou === true).length,
      0
    );
  }, [reservas]);

  const totalNaoChegadasDoDia = useMemo(() => {
    return Object.values(reservas).reduce(
      (acc, lista) => acc + lista.filter((reserva) => reserva.chegou !== true).length,
      0
    );
  }, [reservas]);

  const reservasResumoMetricas = useMemo<AdminTabMetricConfig[]>(
    () => [
      {
        metricKey: 'participantes-dia',
        label: 'Participantes',
        value: totalParticipantesDoDia.toLocaleString('pt-BR'),
        hint: 'Total previsto para o dia',
        icon: FaUsers,
        tone: 'indigo',
        cardClassName: 'admin-tab-stat-card--compact',
      },
      {
        metricKey: 'reservas-dia',
        label: 'Reservas',
        value: totalReservasDoDia.toLocaleString('pt-BR'),
        hint: 'Itens visiveis na agenda',
        icon: FaCalendarAlt,
        tone: 'sky',
        cardClassName: 'admin-tab-stat-card--compact',
      },
      {
        metricKey: 'chegadas-dia',
        label: 'Chegadas',
        value: totalChegadasDoDia.toLocaleString('pt-BR'),
        hint: 'Recepcao ja marcada',
        icon: FaCheck,
        tone: 'emerald',
        cardClassName: 'admin-tab-stat-card--compact',
      },
      {
        metricKey: 'pendentes-dia',
        label: 'Pendentes',
        value: totalNaoChegadasDoDia.toLocaleString('pt-BR'),
        hint: 'Ainda aguardando chegada',
        icon: FaClock,
        tone: 'amber',
        cardClassName: 'admin-tab-stat-card--compact',
      },
    ],
    [
      totalChegadasDoDia,
      totalNaoChegadasDoDia,
      totalParticipantesDoDia,
      totalReservasDoDia,
    ]
  );














  const pacotesQueNaoAceitamPet = useMemo(() => {

    return pacotes.filter(p => p.aceitaPet === false).length;

  }, [pacotes]);

  const totalTiposComDescricao = useMemo(() => {
    return tiposClientes.filter((tipo) => (tipo.descricao ?? '').trim().length > 0).length;
  }, [tiposClientes]);

  const totalPacotesAtivos = pacotes.length;

  const totalCombosAtivos = combos.filter((combo) => combo.ativo !== false).length;

  const dashboardReservasFiltradasPorOrigem = useMemo(
    () =>
      dashboardReservas.filter((reserva) =>
        reservaAtendeFiltroOrigem(reserva, dashboardFiltroOrigem)
      ),
    [dashboardReservas, dashboardFiltroOrigem]
  );

  const dashboardMetricas = useMemo(() => {
    const inicio = dayjs(dashboardInicio);
    const fim = dayjs(dashboardFim);

    if (!inicio.isValid() || !fim.isValid() || inicio.isAfter(fim)) {
      return {
        periodo: { inicio: dashboardInicio, fim: dashboardFim },
        resumo: {
          confirmadas: 0,
          preReservas: 0,
          faturamento: 0,
          ticketMedio: 0,
          participantes: 0,
        },
        porDia: [] as Array<{
          data: string;
          valor: number;
          reservas: number;
          preReservas: number;
          participantes: number;
          participantesPreReservas: number;
        }>,
        porPacote: [] as Array<{
          nome: string;
          reservas: number;
          preReservas: number;
          participantes: number;
          participantesPreReservas: number;
          valor: number;
        }>,
        porCliente: [] as Array<{
          chave: string;
          nome: string;
          cpf: string;
          telefone: string;
          reservas: number;
          preReservas: number;
          participantes: number;
          participantesPreReservas: number;
          valor: number;
        }>,
      };
    }

    const inicioStr = inicio.format('YYYY-MM-DD');
    const fimStr = fim.format('YYYY-MM-DD');

    const dentroDoPeriodo = dashboardReservasFiltradasPorOrigem.filter((reserva) => {
      const data = normalizarDataReserva(reserva.data);
      if (!data) return false;
      return data >= inicioStr && data <= fimStr;
    });

    const confirmadas = dentroDoPeriodo.filter((reserva) => statusEhConfirmado(reserva));
    const preReservas = dentroDoPeriodo.filter((reserva) => statusEhPreReserva(reserva));

    const faturamento = confirmadas.reduce((total, reserva) => total + (Number(reserva.valor) || 0), 0);
    const ticketMedio = confirmadas.length > 0 ? faturamento / confirmadas.length : 0;
    const participantes = confirmadas.reduce((total, reserva) => total + calcularParticipantes(reserva), 0);

    const dias: string[] = [];
    let cursor = inicio.startOf('day');
    const end = fim.startOf('day');
    while (cursor.isBefore(end) || cursor.isSame(end)) {
      dias.push(cursor.format('YYYY-MM-DD'));
      cursor = cursor.add(1, 'day');
    }

    const porDiaMapa = new Map<
      string,
      {
        valor: number;
        reservas: number;
        preReservas: number;
        participantes: number;
        participantesPreReservas: number;
      }
    >();
    dias.forEach((dia) =>
      porDiaMapa.set(dia, {
        valor: 0,
        reservas: 0,
        preReservas: 0,
        participantes: 0,
        participantesPreReservas: 0,
      })
    );

    confirmadas.forEach((reserva) => {
      const data = normalizarDataReserva(reserva.data);
      if (!data) return;
      const entrada = porDiaMapa.get(data);
      if (!entrada) return;
      entrada.valor += Number(reserva.valor) || 0;
      entrada.reservas += 1;
      entrada.participantes += calcularParticipantes(reserva);
    });

    preReservas.forEach((reserva) => {
      const data = normalizarDataReserva(reserva.data);
      if (!data) return;
      const entrada = porDiaMapa.get(data);
      if (!entrada) return;
      entrada.preReservas += 1;
      entrada.participantesPreReservas += calcularParticipantes(reserva);
    });

    const porDia = dias.map((dia) => {
      const entrada =
        porDiaMapa.get(dia) ?? {
          valor: 0,
          reservas: 0,
          preReservas: 0,
          participantes: 0,
          participantesPreReservas: 0,
        };
      return { data: dia, ...entrada };
    });

    const porPacoteMapa = new Map<
      string,
      {
        reservas: number;
        preReservas: number;
        participantes: number;
        participantesPreReservas: number;
        valor: number;
      }
    >();
    confirmadas.forEach((reserva) => {
      const nome = (reserva.atividade || 'Sem pacote').toString().trim() || 'Sem pacote';
      const entrada =
        porPacoteMapa.get(nome) ?? {
          reservas: 0,
          preReservas: 0,
          participantes: 0,
          participantesPreReservas: 0,
          valor: 0,
        };
      entrada.reservas += 1;
      entrada.participantes += calcularParticipantes(reserva);
      entrada.valor += Number(reserva.valor) || 0;
      porPacoteMapa.set(nome, entrada);
    });

    preReservas.forEach((reserva) => {
      const nome = (reserva.atividade || 'Sem pacote').toString().trim() || 'Sem pacote';
      const entrada =
        porPacoteMapa.get(nome) ?? {
          reservas: 0,
          preReservas: 0,
          participantes: 0,
          participantesPreReservas: 0,
          valor: 0,
        };
      entrada.preReservas += 1;
      entrada.participantesPreReservas += calcularParticipantes(reserva);
      porPacoteMapa.set(nome, entrada);
    });

    const porPacote = Array.from(porPacoteMapa.entries())
      .map(([nome, valores]) => ({ nome, ...valores }))
      .sort((a, b) => b.valor - a.valor);

    const porClienteMapa = new Map<
      string,
      {
        chave: string;
        nome: string;
        cpf: string;
        telefone: string;
        reservas: number;
        preReservas: number;
        participantes: number;
        participantesPreReservas: number;
        valor: number;
      }
    >();
    confirmadas.forEach((reserva) => {
      const cpf = (reserva.cpf || '').toString().trim();
      const telefone = (reserva.telefone || '').toString().trim();
      const nome = (reserva.nome || '').toString().trim();
      const chave = cpf || telefone || nome || 'cliente';

      const entrada = porClienteMapa.get(chave) ?? {
        chave,
        nome: nome || '---',
        cpf,
        telefone,
        reservas: 0,
        preReservas: 0,
        participantes: 0,
        participantesPreReservas: 0,
        valor: 0,
      };

      entrada.reservas += 1;
      entrada.valor += Number(reserva.valor) || 0;
      entrada.participantes += calcularParticipantes(reserva);
      if (!entrada.nome && nome) entrada.nome = nome;

      porClienteMapa.set(chave, entrada);
    });

    preReservas.forEach((reserva) => {
      const cpf = (reserva.cpf || '').toString().trim();
      const telefone = (reserva.telefone || '').toString().trim();
      const nome = (reserva.nome || '').toString().trim();
      const chave = cpf || telefone || nome || 'cliente';

      const entrada = porClienteMapa.get(chave) ?? {
        chave,
        nome: nome || '---',
        cpf,
        telefone,
        reservas: 0,
        preReservas: 0,
        participantes: 0,
        participantesPreReservas: 0,
        valor: 0,
      };

      entrada.preReservas += 1;
      entrada.participantesPreReservas += calcularParticipantes(reserva);
      if (!entrada.nome && nome) entrada.nome = nome;

      porClienteMapa.set(chave, entrada);
    });

    const porCliente = Array.from(porClienteMapa.values()).sort((a, b) => b.valor - a.valor);

    return {
      periodo: { inicio: inicioStr, fim: fimStr },
      resumo: {
        confirmadas: confirmadas.length,
        preReservas: preReservas.length,
        faturamento,
        ticketMedio,
        participantes,
      },
      porDia,
      porPacote,
      porCliente,
    };
  }, [dashboardReservasFiltradasPorOrigem, dashboardInicio, dashboardFim]);

  const obterValorMetricaDashboard = useCallback(
    (
      metrica: 'faturamento' | 'confirmadas' | 'pre_reservas' | 'participantes',
      item: {
        valor: number;
        reservas: number;
        preReservas: number;
        participantes: number;
        participantesPreReservas: number;
      }
    ) => {
      switch (metrica) {
        case 'faturamento':
          return item.valor;
        case 'confirmadas':
          return item.reservas;
        case 'pre_reservas':
          return item.preReservas;
        case 'participantes':
          return (item.participantes ?? 0) + (item.participantesPreReservas ?? 0);
        default:
          return item.valor;
      }
    },
    []
  );

  const dashboardAtividadesFiltradas = useMemo(() => {
    const filtroNormalizado = dashboardAtividadeFiltro.trim().toLowerCase();
    if (!filtroNormalizado) return dashboardMetricas.porPacote;
    return dashboardMetricas.porPacote.filter((item) =>
      item.nome.toLowerCase().includes(filtroNormalizado)
    );
  }, [dashboardAtividadeFiltro, dashboardMetricas.porPacote]);

  const dashboardAtividadesOrdenadas = useMemo(() => {
    const lista = [...dashboardAtividadesFiltradas];
    lista.sort(
      (a, b) =>
        obterValorMetricaDashboard(dashboardAtividadeMetrica, b) -
        obterValorMetricaDashboard(dashboardAtividadeMetrica, a)
    );
    return lista;
  }, [dashboardAtividadeMetrica, dashboardAtividadesFiltradas, obterValorMetricaDashboard]);

  const dashboardClientesFiltrados = useMemo(() => {
    const filtroNormalizado = dashboardClienteFiltro.trim().toLowerCase();
    if (!filtroNormalizado) return dashboardMetricas.porCliente;
    return dashboardMetricas.porCliente.filter((item) => {
      const nome = (item.nome ?? '').toLowerCase();
      const cpf = (item.cpf ?? '').toLowerCase();
      const telefone = (item.telefone ?? '').toLowerCase();
      return (
        nome.includes(filtroNormalizado) ||
        cpf.includes(filtroNormalizado) ||
        telefone.includes(filtroNormalizado)
      );
    });
  }, [dashboardClienteFiltro, dashboardMetricas.porCliente]);

  const dashboardFiltroOrigemRotulo = useMemo(
    () => obterRotuloFiltroOrigemReserva(dashboardFiltroOrigem),
    [dashboardFiltroOrigem]
  );

  const dashboardClientesOrdenados = useMemo(() => {
    const lista = [...dashboardClientesFiltrados];
    lista.sort(
      (a, b) =>
        obterValorMetricaDashboard(dashboardClienteMetrica, b) -
        obterValorMetricaDashboard(dashboardClienteMetrica, a)
    );
    return lista;
  }, [dashboardClienteMetrica, dashboardClientesFiltrados, obterValorMetricaDashboard]);

  const dashboardClientesParaGrafico = useMemo(() => {
    const filtroAtivo = dashboardClienteFiltro.trim().length > 0;
    if (dashboardMostrarTodosClientes || filtroAtivo) return dashboardClientesOrdenados;
    return dashboardClientesOrdenados.slice(0, 30);
  }, [dashboardClienteFiltro, dashboardClientesOrdenados, dashboardMostrarTodosClientes]);

  const pacotesPorId = useMemo(() => {

    const mapa = new Map<string, Pacote>();

    pacotes.forEach((pacote) => {

      if (pacote.id) {

        mapa.set(pacote.id, pacote);

      }

    });

    return mapa;

  }, [pacotes]);

  const opcoesFiltroAtividade = useMemo(() => {

    const nomes = new Set<string>();

    pacotes.forEach((pacote) => {

      if (typeof pacote.nome === 'string' && pacote.nome.trim().length > 0) {

        nomes.add(pacote.nome);

      }

    });

    combos.forEach((combo) => {

      if (typeof combo.nome === 'string' && combo.nome.trim().length > 0) {

        nomes.add(combo.nome);

      }

    });

    Object.values(reservas).forEach((lista) => {

      lista.forEach((reserva) => {

        const atividade = (reserva.atividade ?? '').split('(')[0]?.trim();

        if (atividade) {

          nomes.add(atividade);

        }

      });

    });

    return Array.from(nomes).filter(Boolean).sort((a, b) => a.localeCompare(b, 'pt-BR'));

  }, [pacotes, combos, reservas]);

  const filtroAtividadeNormalizado = filtroAtividade.trim().toLowerCase();
  const totalFiltrosAtivosReservas = useMemo(
    () =>
      [
        filtroAtividade.trim().length > 0,
        filtroChegada !== 'todos',
        filtroStatusReserva !== 'todos',
        filtroOrigemReserva !== 'todas',
        filtroPerfilReserva !== 'todos',
      ].filter(Boolean).length,
    [
      filtroAtividade,
      filtroChegada,
      filtroStatusReserva,
      filtroOrigemReserva,
      filtroPerfilReserva,
    ]
  );

  const limparFiltrosReservas = useCallback(() => {
    setFiltroAtividade('');
    setFiltroChegada('todos');
    setFiltroStatusReserva('todos');
    setFiltroOrigemReserva('todas');
    setFiltroPerfilReserva('todos');
  }, []);

  const reservaAtendeFiltrosAgenda = (reserva: Reserva) => {
    const atividadeTexto = formatarPacote(reserva).toLowerCase();

    const correspondeAtividade = filtroAtividadeNormalizado
      ? atividadeTexto.includes(filtroAtividadeNormalizado)
      : true;

    const correspondeChegada =
      filtroChegada === 'todos'
        ? true
        : filtroChegada === 'chegou'
          ? reserva.chegou === true
          : reserva.chegou !== true;

    const correspondeStatus =
      filtroStatusReserva === 'todos'
        ? true
        : filtroStatusReserva === 'confirmadas'
          ? statusEhConfirmado(reserva)
          : statusEhPreReserva(reserva);

    const correspondeOrigem = reservaAtendeFiltroOrigem(reserva, filtroOrigemReserva);

    const correspondePerfil =
      filtroPerfilReserva === 'todos'
        ? true
        : filtroPerfilReserva === 'educativo'
          ? reserva.educativo === true
          : reserva.educativo !== true;

    return (
      correspondeAtividade &&
      correspondeChegada &&
      correspondeStatus &&
      correspondeOrigem &&
      correspondePerfil
    );
  };

  const proximaDataBloqueada = useMemo(() => {

    const hoje = dayjs().startOf('day');

    const datasOrdenadas = pacotes

      .flatMap(p => p.datasBloqueadas ?? [])

      .map(data => dayjs(data))

      .filter(data => data.isValid() && (data.isSame(hoje) || data.isAfter(hoje)))

      .sort((a, b) => a.valueOf() - b.valueOf());

    return datasOrdenadas.length > 0 ? datasOrdenadas[0] : null;

  }, [pacotes]);


  const tiposClientesAtivos = useMemo(() => tiposClientes, [tiposClientes]);


  const abasDisponiveis: Array<{ id: AdminAba; label: string; description: string; icon: React.ComponentType<{ className?: string }> }> = [

    { id: 'reservas', label: 'Reservas', description: 'Agenda do dia', icon: FaCalendarAlt },

    { id: 'dashboard', label: 'Dashboard', description: 'Relatórios e indicadores', icon: FaChartBar },

    { id: 'pacotes', label: 'Pacotes', description: 'Coleção de atividades', icon: FaLayerGroup },

    { id: 'tipos_clientes', label: 'Clientes', description: 'Tipos de clientes', icon: FaUsers },

    { id: 'email', label: 'Email', description: 'Confirmações automáticas', icon: FaEnvelope },

    { id: 'whatsapp', label: 'WhatsApp', description: 'QR e disparador', icon: FaWhatsapp },

    { id: 'pesquisa', label: 'Pesquisa', description: 'Histórico de reservas', icon: FaSearch },

    { id: 'configuracoes', label: 'Site', description: 'Informações do site', icon: FaCog },

  ];

  const renderThemeToggle = () => (
    <button
      type="button"
      onClick={() => setTemaPainel((temaAtual) => (temaAtual === 'dark' ? 'light' : 'dark'))}
      className={`admin-theme-toggle ${temaPainel === 'dark' ? 'is-dark' : 'is-light'}`}
      aria-label={`Alternar para tema ${temaPainel === 'dark' ? 'claro' : 'escuro'}`}
      title={`Tema ${temaPainel === 'dark' ? 'escuro' : 'claro'}`}
    >
      <span className={`admin-theme-toggle__icon ${temaPainel === 'light' ? 'is-active' : ''}`}>
        <FaSun className="h-4 w-4" />
      </span>
      <span className={`admin-theme-toggle__icon ${temaPainel === 'dark' ? 'is-active' : ''}`}>
        <FaMoon className="h-4 w-4" />
      </span>
      <span className="admin-theme-toggle__thumb" />
    </button>
  );

  const renderHeaderLayoutToggle = () => (
    <div className="admin-layout-toggle" role="group" aria-label="Posicao da navegacao">
      <button
        type="button"
        onClick={() => setLayoutHeaderPainel('sidebar')}
        className={`admin-layout-toggle__option ${layoutHeaderPainel === 'sidebar' ? 'is-active' : ''}`}
        aria-pressed={layoutHeaderPainel === 'sidebar'}
        title="Header lateral"
      >
        <FaColumns className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => setLayoutHeaderPainel('top')}
        className={`admin-layout-toggle__option ${layoutHeaderPainel === 'top' ? 'is-active' : ''}`}
        aria-pressed={layoutHeaderPainel === 'top'}
        title="Header superior"
      >
        <FaGripLines className="h-4 w-4" />
      </button>
    </div>
  );

  const renderDesktopPreferences = () => (
    <div className="admin-dashboard-preferences">
      {renderHeaderLayoutToggle()}
      {renderThemeToggle()}
    </div>
  );

  const renderDesktopToolbarItems = () => (
    <>
      {abasDisponiveis.map(({ id, label, icon: Icon }) => {
        const ativo = aba === id;
        const whatsappClassName = id === 'whatsapp' ? 'admin-dashboard-toolbar__item--whatsapp' : '';

        return (
          <button
            key={id}
            type="button"
            onClick={() => setAba(id)}
            className={`admin-dashboard-toolbar__item ${whatsappClassName} ${ativo ? 'is-active' : ''}`.trim()}
          >
            <span className="admin-dashboard-toolbar__item-icon">
              <Icon className="h-4 w-4" />
            </span>

            <span className="admin-dashboard-toolbar__item-content">
              <span className="admin-dashboard-toolbar__item-label">{label}</span>
            </span>
          </button>
        );
      })}
    </>
  );

  const dadosExemploWhatsapp = useMemo(() => {
    const dataExemplo = dayjs().add(1, 'day').format('YYYY-MM-DD');

    return {
      nome: 'Cliente',
      datareserva: formatarDataReserva(dataExemplo),
      data: formatarDataReserva(dataExemplo),
      horario: '10:00',
      atividade: 'Atividade',
      participantes: '2',
      telefone: '(00) 00000-0000',
      valor: formatCurrency(120),
      status: 'confirmado',
    };
  }, []);

  const emailPreviewConfirmacao = useMemo(() => {
    const template =
      whatsappConfig.mensagemConfirmacaoAutomatica || emailTemplateConfirmacaoPadrao;
    return montarMensagemWhatsApp(template, dadosExemploWhatsapp);
  }, [dadosExemploWhatsapp, whatsappConfig.mensagemConfirmacaoAutomatica]);

  const mensagemPreviewWhatsappManual = useMemo(() => {
    const template = whatsappConfig.mensagemConfirmacaoManual || whatsappTemplateMensagemManualPadrao;
    return montarMensagemWhatsApp(template, dadosExemploWhatsapp);
  }, [dadosExemploWhatsapp, whatsappConfig.mensagemConfirmacaoManual]);

  const mensagemPreviewDisparadorAgradecimento = useMemo(() => {
    const template = whatsappConfig.mensagemBoasVindas || whatsappTemplateBoasVindasPadrao;
    return montarMensagemWhatsApp(template, dadosExemploWhatsapp);
  }, [dadosExemploWhatsapp, whatsappConfig.mensagemBoasVindas]);

  const modelosPreviewWhatsappManual = useMemo(() => {
    const modelosCustomizados = (whatsappConfig.modelosMensagemManual ?? []).map((modelo) => {
      const mensagem = modelo.mensagem?.trim() || '';

      return {
        id: modelo.id,
        titulo: modelo.titulo?.trim() || 'Sem título',
        tipo: 'Personalizado',
        pronto: Boolean(modelo.titulo?.trim() && mensagem),
        preview: mensagem ? montarMensagemWhatsApp(mensagem, dadosExemploWhatsapp) : 'Complete o título e a mensagem para salvar este modelo.',
      };
    });

    return [
      {
        id: 'padrao',
        titulo: 'Padrão',
        tipo: 'Mensagem inicial',
        pronto: Boolean(whatsappConfig.mensagemConfirmacaoManual.trim()),
        preview: mensagemPreviewWhatsappManual || '-',
      },
      ...modelosCustomizados,
    ];
  }, [
    dadosExemploWhatsapp,
    mensagemPreviewWhatsappManual,
    whatsappConfig.mensagemConfirmacaoManual,
    whatsappConfig.modelosMensagemManual,
  ]);

  const whatsappModeloAberto = useMemo(() => {
    if (!whatsappModeloAbertoId) return null;

    if (whatsappModeloAbertoId === 'padrao') {
      return {
        id: 'padrao',
        titulo: 'Padrão',
        tipo: 'Mensagem inicial',
        mensagem: whatsappConfig.mensagemConfirmacaoManual,
        preview: mensagemPreviewWhatsappManual || '-',
        pronto: Boolean(whatsappConfig.mensagemConfirmacaoManual.trim()),
        padrao: true,
      };
    }

    const modelo = (whatsappConfig.modelosMensagemManual ?? []).find((item) => item.id === whatsappModeloAbertoId);
    if (!modelo) return null;

    const mensagem = modelo.mensagem?.trim() || '';

    return {
      id: modelo.id,
      titulo: modelo.titulo?.trim() || 'Sem título',
      tipo: 'Personalizado',
      mensagem: modelo.mensagem ?? '',
      preview: mensagem ? montarMensagemWhatsApp(mensagem, dadosExemploWhatsapp) : 'Complete a mensagem para ver o preview.',
      pronto: Boolean(modelo.titulo?.trim() && mensagem),
      padrao: false,
    };
  }, [
    dadosExemploWhatsapp,
    mensagemPreviewWhatsappManual,
    whatsappConfig.mensagemConfirmacaoManual,
    whatsappConfig.modelosMensagemManual,
    whatsappModeloAbertoId,
  ]);

  const whatsappStatusInfo = useMemo(() => {
    switch (whatsappStatus.status) {
      case 'ready':
        return {
          label: 'Conectado',
          hint: whatsappStatus.info?.pushname || whatsappStatus.info?.wid || 'Sessao pronta para disparar',
          tone: 'emerald' as const,
        };
      case 'qr':
        return {
          label: 'Aguardando QR',
          hint: 'Leia o QR Code no WhatsApp do celular',
          tone: 'amber' as const,
        };
      case 'initializing':
        return {
          label: 'Iniciando',
          hint: 'Preparando a sessao do WhatsApp',
          tone: 'sky' as const,
        };
      case 'auth_failure':
        return {
          label: 'Falha na conexao',
          hint: whatsappStatus.lastError || 'Gere um novo QR Code',
          tone: 'amber' as const,
        };
      case 'disconnected':
        return {
          label: 'Desconectado',
          hint: whatsappStatus.lastError || 'Conecte para ativar o disparador',
          tone: 'slate' as const,
        };
      default:
        if (whatsappStatus.lastError === 'desligado_por_inatividade') {
          return {
            label: 'Em espera',
            hint: 'Desligado automaticamente para economizar Railway; religa no proximo disparo',
            tone: 'slate' as const,
          };
        }
        return {
          label: 'Nao iniciado',
          hint: 'Aguardando inicializacao do servidor ou clique para conectar',
          tone: 'slate' as const,
        };
    }
  }, [whatsappStatus]);

  const emailRegistroItensFiltrados = useMemo(() => {
    let itens = emailFila.itens;

    if (emailRegistroFiltro !== 'todos') {
      itens = itens.filter((item) => item.statusEmail === emailRegistroFiltro);
    }

    const termo = emailBuscaTexto.trim().toLowerCase();
    if (termo) {
      itens = itens.filter((item) => {
        const alvo = `${item.nome ?? ''} ${item.email ?? ''} ${item.telefone ?? ''} ${item.atividade ?? ''}`.toLowerCase();
        return alvo.includes(termo);
      });
    }

    if (emailFiltroDataDe) {
      itens = itens.filter((item) => {
        const dataItem = (item.data ?? '').slice(0, 10);
        return dataItem && dataItem >= emailFiltroDataDe;
      });
    }
    if (emailFiltroDataAte) {
      itens = itens.filter((item) => {
        const dataItem = (item.data ?? '').slice(0, 10);
        return dataItem && dataItem <= emailFiltroDataAte;
      });
    }

    return itens;
  }, [emailFila.itens, emailRegistroFiltro, emailBuscaTexto, emailFiltroDataDe, emailFiltroDataAte]);

  const todosFiltradosSelecionados = useMemo(() => {
    if (emailRegistroItensFiltrados.length === 0) return false;
    return emailRegistroItensFiltrados.every((item) => emailSelecionados.has(item.id));
  }, [emailRegistroItensFiltrados, emailSelecionados]);

  const toggleSelecionarTodosFiltrados = () => {
    setEmailSelecionados((prev) => {
      if (todosFiltradosSelecionados) {
        const proximo = new Set(prev);
        emailRegistroItensFiltrados.forEach((item) => proximo.delete(item.id));
        return proximo;
      }
      const proximo = new Set(prev);
      emailRegistroItensFiltrados.forEach((item) => {
        if (item.statusEmail !== 'enviado') proximo.add(item.id);
      });
      return proximo;
    });
  };

  // Pesquisa Clientes

  const [termoPesquisa, setTermoPesquisa] = useState('');

  const [resultadosPesquisa, setResultadosPesquisa] = useState<Reserva[]>([]);

  const [carregandoPesquisa, setCarregandoPesquisa] = useState(false);



  // Reservas Logic

  useEffect(() => {

    const formatted = dayjs(selectedDate).format('YYYY-MM-DD');
    const nextDay = dayjs(selectedDate).add(1, 'day').format('YYYY-MM-DD');
    const dayStart = dayjs(selectedDate).startOf('day');
    const dayEnd = dayjs(selectedDate).add(1, 'day').startOf('day');
    const hoje = dayjs().format('YYYY-MM-DD');
    const diaEhHoje = formatted === hoje;

    console.log('🔍 Observando reservas para:', formatted);

    const baseRef = collection(db, 'reservas');
    const qString = query(baseRef, where('data', '>=', formatted), where('data', '<', nextDay));
    const qTimestamp = query(
      baseRef,
      where('data', '>=', Timestamp.fromDate(dayStart.toDate())),
      where('data', '<', Timestamp.fromDate(dayEnd.toDate()))
    );

    let reservasString: Reserva[] = [];
    let reservasTimestamp: Reserva[] = [];
    let primeiraLeituraString = true;
    let primeiraLeituraTimestamp = true;

    const notificarSeNovaReservaHoje = (novasReservas: Reserva[]) => {
      if (!diaEhHoje) return;

      const novasVisiveis = novasReservas.filter((reserva) => {
        return reservaEstaConfirmada(reserva);
      });

      if (novasVisiveis.length === 0) return;

      exibirNotificacaoNovaReserva(novasVisiveis[0]);
    };

    const atualizarReservas = () => {
      const mapa = new Map<string, Reserva>();
      [...reservasString, ...reservasTimestamp].forEach((reserva) => {
        const id = reserva.id ?? `${reserva.nome}-${reserva.cpf}-${reserva.horario}-${normalizarDataReserva(reserva.data)}`;
        mapa.set(id, reserva);
      });

      const combinadas = Array.from(mapa.values());
      const reservasFiltradas = combinadas.filter((reserva) => {
        if (normalizarDataReserva(reserva.data) !== formatted) {
          return false;
        }
        return reservaEhAtivaNoPainel(reserva);
      });

      const preReservas = reservasFiltradas.filter((reserva) => statusEhPreReserva(reserva)).length;
      console.log('✅ Reservas visíveis:', reservasFiltradas.length, '| Pré-reservas:', preReservas);

      const reservasPorHorario = reservasFiltradas.reduce((acc, reserva) => {
        const horario = reserva.horario || 'Não especificado';
        if (!acc[horario]) acc[horario] = [];
        acc[horario].push(reserva);
        return acc;
      }, {} as Record<string, Reserva[]>);

      setReservas(reservasPorHorario);
    };

    const unsubscribeString = onSnapshot(
      qString,
      (snapshot) => {
        if (!primeiraLeituraString) {
          const adicionadas = snapshot
            .docChanges()
            .filter((change) => change.type === 'added' && change.doc.metadata.hasPendingWrites === false)
            .map((change) => {
              const data = change.doc.data() as Reserva;
              return {
                id: change.doc.id,
                ...data,
                chegou: data.chegou === true,
              };
            });
          notificarSeNovaReservaHoje(adicionadas);
        }
        primeiraLeituraString = false;

        reservasString = snapshot.docs.map((docSnap) => {
          const data = docSnap.data() as Reserva;
          return {
            id: docSnap.id,
            ...data,
            chegou: data.chegou === true,
          };
        });
        atualizarReservas();
      },
      (error) => {
        console.error('Erro ao escutar reservas (string):', error);
        reservasString = [];
        atualizarReservas();
      }
    );

    const unsubscribeTimestamp = onSnapshot(
      qTimestamp,
      (snapshot) => {
        if (!primeiraLeituraTimestamp) {
          const adicionadas = snapshot
            .docChanges()
            .filter((change) => change.type === 'added' && change.doc.metadata.hasPendingWrites === false)
            .map((change) => {
              const data = change.doc.data() as Reserva;
              return {
                id: change.doc.id,
                ...data,
                chegou: data.chegou === true,
              };
            });
          notificarSeNovaReservaHoje(adicionadas);
        }
        primeiraLeituraTimestamp = false;

        reservasTimestamp = snapshot.docs.map((docSnap) => {
          const data = docSnap.data() as Reserva;
          return {
            id: docSnap.id,
            ...data,
            chegou: data.chegou === true,
          };
        });
        atualizarReservas();
      },
      (error) => {
        console.error('Erro ao escutar reservas (timestamp):', error);
        reservasTimestamp = [];
        atualizarReservas();
      }
    );

    return () => {
      unsubscribeString();
      unsubscribeTimestamp();
    };

  }, [selectedDate, exibirNotificacaoNovaReserva]);

  useEffect(() => {
    if (!modalReserva || !editReserva?.data) {
      setReservasDataEmEdicao([]);
      return;
    }

    const dataStr = normalizarDataReserva(editReserva.data);
    if (!dataStr) {
      setReservasDataEmEdicao([]);
      return;
    }

    const nextDay = dayjs(dataStr).add(1, 'day').format('YYYY-MM-DD');
    const dayStart = dayjs(dataStr).startOf('day');
    const dayEnd = dayjs(dataStr).add(1, 'day').startOf('day');
    const baseRef = collection(db, 'reservas');
    const qString = query(baseRef, where('data', '>=', dataStr), where('data', '<', nextDay));
    const qTimestamp = query(
      baseRef,
      where('data', '>=', Timestamp.fromDate(dayStart.toDate())),
      where('data', '<', Timestamp.fromDate(dayEnd.toDate()))
    );

    let reservasString: Reserva[] = [];
    let reservasTimestamp: Reserva[] = [];

    const atualizarReservasDataEmEdicao = () => {
      const mapa = new Map<string, Reserva>();
      [...reservasString, ...reservasTimestamp].forEach((reserva) => {
        if (normalizarDataReserva(reserva.data) !== dataStr) return;
        const id =
          reserva.id ?? `${reserva.nome}-${reserva.cpf}-${reserva.horario}-${normalizarDataReserva(reserva.data)}`;
        mapa.set(id, reserva);
      });
      setReservasDataEmEdicao(Array.from(mapa.values()));
    };

    const unsubscribeString = onSnapshot(
      qString,
      (snapshot) => {
        reservasString = snapshot.docs.map((docSnap) => {
          const data = docSnap.data() as Reserva;
          return {
            id: docSnap.id,
            ...data,
            chegou: data.chegou === true,
          };
        });
        atualizarReservasDataEmEdicao();
      },
      (error) => {
        console.error('Erro ao escutar reservas da data em edicao (string):', error);
        reservasString = [];
        atualizarReservasDataEmEdicao();
      }
    );

    const unsubscribeTimestamp = onSnapshot(
      qTimestamp,
      (snapshot) => {
        reservasTimestamp = snapshot.docs.map((docSnap) => {
          const data = docSnap.data() as Reserva;
          return {
            id: docSnap.id,
            ...data,
            chegou: data.chegou === true,
          };
        });
        atualizarReservasDataEmEdicao();
      },
      (error) => {
        console.error('Erro ao escutar reservas da data em edicao (timestamp):', error);
        reservasTimestamp = [];
        atualizarReservasDataEmEdicao();
      }
    );

    return () => {
      unsubscribeString();
      unsubscribeTimestamp();
    };
  }, [editReserva?.data, modalReserva]);

  useEffect(() => {
    if (!modalReserva || !editReserva?.data) {
      setVagasExtrasDisponibilidadeEmEdicao({});
      return;
    }

    const dataStr = normalizarDataReserva(editReserva.data);
    if (!dataStr) {
      setVagasExtrasDisponibilidadeEmEdicao({});
      return;
    }

    let ativo = true;

    const carregarDisponibilidadeEmEdicao = async () => {
      try {
        const snap = await getDoc(doc(db, 'disponibilidade', dataStr));
        if (!ativo) return;

        const dados = snap.exists() ? snap.data() : null;
        setVagasExtrasDisponibilidadeEmEdicao(
          normalizarVagasExtrasDisponibilidade(
            dados?.vagasExtras as Record<string, unknown> | null
          )
        );
      } catch (error) {
        console.error('Erro ao carregar vagas extras da data em edicao:', error);
        if (ativo) {
          setVagasExtrasDisponibilidadeEmEdicao({});
        }
      }
    };

    void carregarDisponibilidadeEmEdicao();

    return () => {
      ativo = false;
    };
  }, [editReserva?.data, modalReserva]);

  useEffect(() => {
    if (aba !== 'dashboard') return;

    const inicio = dayjs(dashboardInicio);
    const fim = dayjs(dashboardFim);

    if (!inicio.isValid() || !fim.isValid() || inicio.isAfter(fim)) {
      setDashboardErro('Informe um período válido.');
      setDashboardReservas([]);
      setDashboardCarregando(false);
      return;
    }

    const inicioStr = inicio.format('YYYY-MM-DD');
    const fimStr = fim.format('YYYY-MM-DD');
    const fimExclusivoStr = fim.add(1, 'day').format('YYYY-MM-DD');

    const rangeStart = inicio.startOf('day');
    const rangeEndExclusive = fim.add(1, 'day').startOf('day');

    setDashboardCarregando(true);
    setDashboardErro(null);

    const baseRef = collection(db, 'reservas');
    const qString = query(
      baseRef,
      where('data', '>=', inicioStr),
      where('data', '<', fimExclusivoStr)
    );
    const qTimestamp = query(
      baseRef,
      where('data', '>=', Timestamp.fromDate(rangeStart.toDate())),
      where('data', '<', Timestamp.fromDate(rangeEndExclusive.toDate()))
    );

    let reservasString: Reserva[] = [];
    let reservasTimestamp: Reserva[] = [];

    const atualizarDashboard = () => {
      const mapa = new Map<string, Reserva>();
      [...reservasString, ...reservasTimestamp].forEach((reserva) => {
        const id = reserva.id ?? `${reserva.nome}-${reserva.cpf}-${reserva.horario}-${normalizarDataReserva(reserva.data)}`;
        mapa.set(id, reserva);
      });

      const combinadas = Array.from(mapa.values());
      const filtradas = combinadas.filter((reserva) => {
        const data = normalizarDataReserva(reserva.data);
        if (!data) return false;
        return data >= inicioStr && data <= fimStr;
      });

      setDashboardReservas(filtradas);
      setDashboardCarregando(false);
    };

    const unsubscribeString = onSnapshot(
      qString,
      (snapshot) => {
        reservasString = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as Reserva) }));
        atualizarDashboard();
      },
      (error) => {
        console.error('Erro ao carregar dashboard (string):', error);
        reservasString = [];
        atualizarDashboard();
      }
    );

    const unsubscribeTimestamp = onSnapshot(
      qTimestamp,
      (snapshot) => {
        reservasTimestamp = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as Reserva) }));
        atualizarDashboard();
      },
      (error) => {
        console.error('Erro ao carregar dashboard (timestamp):', error);
        reservasTimestamp = [];
        atualizarDashboard();
      }
    );

    return () => {
      unsubscribeString();
      unsubscribeTimestamp();
    };
  }, [aba, dashboardInicio, dashboardFim]);



  useEffect(() => {

    setReservaDetalhesAberta(null);

  }, [
    selectedDate,
    filtroAtividade,
    filtroChegada,
    filtroStatusReserva,
    filtroOrigemReserva,
    filtroPerfilReserva,
  ]);



  useEffect(() => {

    if (feedback) {

      const timer = setTimeout(() => setFeedback(null), 3000);

      return () => clearTimeout(timer);

    }

  }, [feedback]);



  const daysInMonth = (month: number, year: number) => new Date(year, month + 1, 0).getDate();

  const today = new Date();

  const [currentMonth, setCurrentMonth] = useState(today.getMonth());

  const [currentYear, setCurrentYear] = useState(today.getFullYear());

  const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay();

  const totalDays = daysInMonth(currentMonth, currentYear);

  const days: (number | null)[] = Array(firstDayOfMonth).fill(null).concat([...Array(totalDays).keys()].map(i => i + 1));

  const changeMonth = (offset: number) => {

    const newDate = new Date(currentYear, currentMonth + offset);

    setCurrentMonth(newDate.getMonth());

    setCurrentYear(newDate.getFullYear());

  };

  useEffect(() => {
    if (aba !== 'reservas') return;

    const inicioMes = dayjs(new Date(currentYear, currentMonth, 1)).startOf('day');
    const fimMesExclusivo = inicioMes.add(1, 'month');
    const inicioStr = inicioMes.format('YYYY-MM-DD');
    const fimStr = fimMesExclusivo.format('YYYY-MM-DD');
    const baseRef = collection(db, 'reservas');
    const qString = query(baseRef, where('data', '>=', inicioStr), where('data', '<', fimStr));
    const qTimestamp = query(
      baseRef,
      where('data', '>=', Timestamp.fromDate(inicioMes.toDate())),
      where('data', '<', Timestamp.fromDate(fimMesExclusivo.toDate()))
    );

    let reservasString: Reserva[] = [];
    let reservasTimestamp: Reserva[] = [];

    const atualizarIndicadoresCalendario = () => {
      const mapaReservas = new Map<string, Reserva>();

      [...reservasString, ...reservasTimestamp].forEach((reserva) => {
        const data = normalizarDataReserva(reserva.data);
        if (!data || data < inicioStr || data >= fimStr) return;

        const id = reserva.id ?? `${reserva.nome}-${reserva.cpf}-${reserva.horario}-${data}`;
        mapaReservas.set(id, reserva);
      });

      const indicadores = Array.from(mapaReservas.values())
        .filter((reserva) => reservaEhAtivaNoPainel(reserva))
        .reduce((acc, reserva) => {
          const data = normalizarDataReserva(reserva.data);
          if (!data) return acc;
          acc[data] = (acc[data] ?? 0) + 1;
          return acc;
        }, {} as Record<string, number>);

      setIndicadoresReservasCalendario(indicadores);
    };

    const unsubscribeString = onSnapshot(
      qString,
      (snapshot) => {
        reservasString = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as Reserva) }));
        atualizarIndicadoresCalendario();
      },
      (error) => {
        console.error('Erro ao carregar indicadores do calendario (string):', error);
        reservasString = [];
        atualizarIndicadoresCalendario();
      }
    );

    const unsubscribeTimestamp = onSnapshot(
      qTimestamp,
      (snapshot) => {
        reservasTimestamp = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as Reserva) }));
        atualizarIndicadoresCalendario();
      },
      (error) => {
        console.error('Erro ao carregar indicadores do calendario (timestamp):', error);
        reservasTimestamp = [];
        atualizarIndicadoresCalendario();
      }
    );

    return () => {
      unsubscribeString();
      unsubscribeTimestamp();
    };
  }, [aba, currentMonth, currentYear]);



  const excluirReserva = async (id: string) => {

    if (confirm("Tem certeza que deseja excluir esta reserva?")) {

      try {

        await deleteDoc(doc(db, "reservas", id));

      } catch (error) {

        console.error('Erro ao excluir reserva:', error);

      }

    }

  };



  const handleEditReserva = (reserva: Reserva) => {

    const mesasRegistradas = Array.isArray(reserva.mesasSelecionadas) ? reserva.mesasSelecionadas : [];

    const mesaPrincipalId = reserva.mesaPrincipalId ?? mesasRegistradas[0]?.id ?? null;

    const mesaSecundariaId = reserva.mesaSecundariaId ?? mesasRegistradas[1]?.id ?? null;

    const areaMesa = reserva.areaMesa ?? mesasRegistradas[0]?.area ?? '';

    const capacidadeMesas =

      reserva.capacidadeMesas ??

      mesasRegistradas.reduce((acc, mesa) => acc + (Number(mesa?.capacidade) || 0), 0);

    const participantesPorTipo = montarParticipantesPorTipo(tiposClientesAtivos, reserva);



    setEditReserva({

      ...reserva,

      status: reserva.status ?? (reserva.confirmada ? 'confirmado' : 'pre_reserva'),
      pacoteIds: inferirPacoteIdsReserva(reserva),

      participantesPorTipo,

      mesasSelecionadas: mesasRegistradas,

      mesaPrincipalId,

      mesaSecundariaId,

      areaMesa,

      capacidadeMesas,

      educativo: reserva.educativo === true,

      naoConsomeDisponibilidade: reserva.naoConsomeDisponibilidade === true,

    });

    setReservaOriginalEmEdicao({
      data: normalizarDataReserva(reserva.data),
      horario: (reserva.horario ?? '').toString(),
    });

    setIsEditingReserva(true);

    setModalReserva(true);

  };



  const handleAddReserva = () => {
    const hoje = dayjs().startOf('day');
    const dataSelecionada = dayjs(selectedDate).startOf('day');
    const dataInicialReserva = dataSelecionada.isBefore(hoje)
      ? hoje.format('YYYY-MM-DD')
      : dataSelecionada.format('YYYY-MM-DD');

    const participantesPorTipo = montarParticipantesPorTipo(tiposClientesAtivos, {

      participantesPorTipo: {},

      adultos: 0,

      criancas: 0,

      bariatrica: 0,

    });

    setEditReserva({

      nome: '',

      cpf: '',

      telefone: '',

      adultos: 0,

      criancas: 0,

      naoPagante: 0,

      bariatrica: 0,

      participantesPorTipo,

      data: dataInicialReserva,

      horario: '',

      atividade: '',

      pacoteIds: [],

      valor: 0,

      temPet: false,

      educativo: false,

      naoConsomeDisponibilidade: false,

      confirmada: true,

      status: 'confirmado',

      origem: 'manual',

      areaMesa: '',

      mesaPrincipalId: null,

      mesaSecundariaId: null,

      mesasSelecionadas: [],

      capacidadeMesas: 0

    });

    setReservaOriginalEmEdicao(null);

    setIsEditingReserva(false);

    setModalReserva(true);

  };



  const toggleChegadaReserva = async (reserva: Reserva) => {

    if (!reserva.id) return;

    const chegou = reserva.chegou === true;

    try {

      await updateDoc(doc(db, 'reservas', reserva.id), { chegou: !chegou });

      setFeedback({

        type: 'success',

        message: chegou ? 'Marcação de chegada removida.' : 'Reserva marcada como chegada!',

      });

      // Quando MARCA chegada, dispara mensagem de boas-vindas no WhatsApp do cliente
      if (!chegou) {
        try {
          const resp = await fetch(`${API_BASE}/whatsapp/boas-vindas/${reserva.id}`, {
            method: 'POST',
          });
          const data = await resp.json().catch(() => ({}));
          if (data?.enviado) {
            setFeedback({ type: 'success', message: 'Chegada marcada e mensagem de boas-vindas enviada via WhatsApp.' });
          } else if (data?.motivo === 'ja_enviado') {
            // silencioso — boas-vindas já tinha sido enviado antes
          } else if (data?.motivo) {
            console.warn('[whatsapp] boas-vindas nao enviado:', data.motivo);
          }
        } catch (whatsErr) {
          console.warn('Falha ao enviar boas-vindas WhatsApp:', whatsErr);
        }
      }

    } catch (error) {

      console.error('Erro ao atualizar chegada:', error);

      setFeedback({ type: 'error', message: 'Não foi possível atualizar a chegada da reserva.' });

    }

  };



  const obterPerguntasComResposta = (reserva: Reserva) => {

    return (reserva.perguntasPersonalizadas ?? []).filter((pergunta) => {

      const perguntaValida = typeof pergunta?.pergunta === 'string' && pergunta.pergunta.trim().length > 0;

      const respostaValida = typeof pergunta?.resposta === 'string' && pergunta.resposta.trim().length > 0;

      return perguntaValida && respostaValida;

    });

  };



  const desejaJuntarMesa = (reserva: Reserva) => {

    return (reserva.perguntasPersonalizadas ?? []).some((pergunta) => {

      const perguntaNormalizada = normalizarTexto(pergunta.pergunta ?? '');

      if (!perguntaNormalizada.includes('juntar mesa')) return false;

      const respostaNormalizada = normalizarTexto(pergunta.resposta ?? '');

      return respostaNormalizada.startsWith('sim') || respostaNormalizada === 's';

    });

  };



  const toggleDetalhesReserva = (reservaId: string) => {

    setReservaDetalhesAberta((prev) => (prev === reservaId ? null : reservaId));

  };



  const renderRespostaSimNao = (resposta: string, emojiSim?: string, emojiNao?: string) => {

    const r = (resposta || '').toLowerCase();

    if (r === 'sim' && emojiSim) {

      return (

        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-emerald-800 font-semibold">

          <span className="text-base leading-none">{emojiSim}</span>

          <span className="text-xs">Sim</span>

        </span>

      );

    }

    if (r === 'nao' && emojiNao) {

      return (

        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 border border-rose-200 px-2.5 py-1 text-rose-800 font-semibold">

          <span className="text-base leading-none">{emojiNao}</span>

          <span className="text-xs">Não</span>

        </span>

      );

    }

    // Fallback sem emoji
    return (

      <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
        r === 'sim' ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' :
        r === 'nao' ? 'bg-rose-50 border border-rose-200 text-rose-700' :
        'bg-slate-100 text-slate-600'
      }`}>

        {r === 'sim' ? 'Sim' : r === 'nao' ? 'Não' : (resposta || '---')}

      </span>

    );

  };

  const RespostaTextoCard = ({ pergunta, texto }: { pergunta: string; texto: string }) => {

    const [aberto, setAberto] = React.useState(false);

    if (!texto.trim()) return <span className="text-xs text-slate-400">Sem resposta</span>;

    return (

      <div className="inline-block w-full">

        <button

          type="button"

          onClick={() => setAberto((v) => !v)}

          className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 border border-sky-200 px-2.5 py-1 text-xs font-semibold text-sky-800 hover:bg-sky-100 transition"

          title={aberto ? 'Ocultar texto' : 'Ver resposta completa'}

        >

          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">

            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h7" />

          </svg>

          {aberto ? 'Ocultar' : 'Ver resposta'}

        </button>

        {aberto && (

          <div className="mt-2 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-sm text-slate-700 whitespace-pre-wrap">

            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">{pergunta}</p>

            {texto}

          </div>

        )}

      </div>

    );

  };

  const renderPerguntasPersonalizadas = (perguntas: PerguntaPersonalizadaResposta[]) => {

    if (perguntas.length === 0) {

      return <p className="text-sm text-slate-500">Nenhuma resposta personalizada.</p>;

    }



    return (

      <dl className="divide-y divide-slate-100 text-sm">

        {perguntas.map((pergunta) => (

          <div key={`${pergunta.perguntaId}-${pergunta.pergunta}`} className="py-2.5 first:pt-0 last:pb-0">

            <dt className="text-xs font-semibold uppercase text-slate-500 mb-1.5">{pergunta.pergunta}</dt>

            <dd>

              {pergunta.tipo === 'sim_nao' ? (

                renderRespostaSimNao(pergunta.resposta, pergunta.emojiSim, pergunta.emojiNao)

              ) : (

                <RespostaTextoCard pergunta={pergunta.pergunta} texto={pergunta.resposta || ''} />

              )}

            </dd>

            {pergunta.perguntaCondicional?.pergunta && (

              <div className="mt-2 pl-3 border-l-2 border-slate-200">

                <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-1">

                  ↳ {pergunta.perguntaCondicional.pergunta}

                </p>

                <div>

                  {pergunta.perguntaCondicional.tipo === 'sim_nao' ? (

                    renderRespostaSimNao(

                      pergunta.perguntaCondicional.resposta,

                      pergunta.perguntaCondicional.emojiSim,

                      pergunta.perguntaCondicional.emojiNao,

                    )

                  ) : (

                    <RespostaTextoCard

                      pergunta={pergunta.perguntaCondicional.pergunta}

                      texto={pergunta.perguntaCondicional.resposta || ''}

                    />

                  )}

                </div>

              </div>

            )}

          </div>

        ))}

      </dl>

    );

  };



  function calcularParticipantes(reserva: Reserva) {

    const mapa = reserva.participantesPorTipo ?? {};

    const totalMapa = somarMapa(mapa);

    if (totalMapa > 0) {

      return totalMapa + (Number(reserva.naoPagante ?? 0) || 0);

    }

    return (

      (reserva.adultos ?? 0) +

      (reserva.criancas ?? 0) +

      (reserva.naoPagante ?? 0) +

      (reserva.bariatrica ?? 0)

    );

  }

  const montarResumoParticipantes = useCallback(

    (reserva: Reserva) => {

      const mapa = reserva.participantesPorTipo ?? {};

      const listaBase = tiposClientesAtivos.map((tipo) => {

        const quantidade =

          obterValorMapa(mapa, tipo) ?? obterQuantidadeLegada(tipo, reserva);

        return {

          key: obterChaveTipo(tipo),

          label: tipo.nome,

          quantidade: Number(quantidade) || 0,

        };

      });

      const extras = Object.entries(mapa)

        .filter(([chave]) =>

          !tiposClientesAtivos.some(

            (tipo) =>

              tipo.id === chave ||

              normalizarTexto(tipo.nome) === normalizarTexto(chave)

          )

        )

        .map(([chave, quantidade]) => ({

          key: chave,

          label: chave,

          quantidade: Number(quantidade) || 0,

        }));

      const naoPagante = Number(reserva.naoPagante ?? 0);

      if (naoPagante > 0) {

        extras.push({

          key: 'nao-pagante',

          label: 'Não pagante',

          quantidade: naoPagante,

        });

      }

      return [...listaBase, ...extras]
        .filter((item) => item.quantidade > 0)
        .sort((a, b) => compararTextoNumericamente(a.label, b.label));

    },

    [tiposClientesAtivos]

  );



  const formatarValor = (valor?: number | string) => {

    if (valor === undefined || valor === null) return '---';

    const numero = Number(valor);

    if (Number.isNaN(numero)) return '---';

    return `R$ ${numero.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  };



  const obterPacoteNomes = (reserva: Reserva) => {

    const info = reserva as Record<string, any>;

    const nomes: string[] = [];



    if (Array.isArray(info.pacoteNomes)) {

      nomes.push(...info.pacoteNomes.filter(Boolean));

    } else if (Array.isArray(info.pacotes)) {

      info.pacotes.forEach((item: any) => {

        if (typeof item === 'string') {

          nomes.push(item);

        } else if (item?.nome) {

          nomes.push(item.nome);

        }

      });

    } else if (Array.isArray(info.pacoteIds)) {

      info.pacoteIds.forEach((id: string) => {

        const pacoteRelacionado = pacotes.find(p => p.id === id);

        if (pacoteRelacionado?.nome) {

          nomes.push(pacoteRelacionado.nome);

        }

      });

    } else if (typeof info.pacote === 'string') {

      nomes.push(info.pacote);

    } else if (typeof info.pacoteNome === 'string') {

      nomes.push(info.pacoteNome);

    } else if (reserva.atividade) {

      nomes.push(reserva.atividade);

    }



    return Array.from(new Set(nomes.filter(Boolean))).sort((a, b) =>
      compararTextoNumericamente(a, b)
    );

  };



  const formatarPacote = (reserva: Reserva) => {

    const atividade = reserva.atividade ?? '';

    const comboMatch = atividade.match(/\(Combo:\s*([^)]+)\)/i);

    if (comboMatch && comboMatch[1]) {

      const textoCombo = comboMatch[1].trim();

      const nomeCombo = textoCombo.split(' - ')[0].trim();

      return `Combo: ${nomeCombo || textoCombo}`;

    }

    const nomes = obterPacoteNomes(reserva);

    if (nomes.length === 0) return '---';

    if (nomes.length === 1) return nomes[0];

    return nomes.join(' + ');

  };

  const quebrarPacoteEmEtiquetas = (descricao: string) => {
    if (!descricao || descricao === '---') return [];
    return descricao
      .split('+')
      .map((item) => item.trim())
      .filter(Boolean);
  };

  const reservasAgendaResumo = useMemo(() => {
    const grupos = Object.keys(reservas)
      .sort((a, b) => {
        const aIndefinido = a.toLowerCase().includes('especificado');
        const bIndefinido = b.toLowerCase().includes('especificado');
        if (aIndefinido && !bIndefinido) return 1;
        if (!aIndefinido && bIndefinido) return -1;
        return compararHorariosComIndefinidosNoFim(a, b);
      })
      .map((horario) => {
        const filtradas = (reservas[horario] ?? []).filter(reservaAtendeFiltrosAgenda);
        if (filtradas.length === 0) return null;

        const totalPessoas = filtradas.reduce(
          (acc, reserva) => acc + calcularParticipantes(reserva),
          0
        );
        const totalChegadasHorario = filtradas.filter(
          (reserva) => reserva.chegou === true
        ).length;
        const faturamentoHorario = filtradas.reduce((acc, reserva) => {
          const valor = Number(reserva.valor ?? 0);
          return acc + (Number.isFinite(valor) ? valor : 0);
        }, 0);
        const tituloHorario = horario.toLowerCase().includes('especificado')
          ? 'Sem horario definido'
          : horario;

        return {
          horario,
          tituloHorario,
          reservas: filtradas,
          totalPessoas,
          totalReservasHorario: filtradas.length,
          totalChegadasHorario,
          faturamentoHorario,
        };
      })
      .filter(
        (grupo): grupo is {
          horario: string;
          tituloHorario: string;
          reservas: Reserva[];
          totalPessoas: number;
          totalReservasHorario: number;
          totalChegadasHorario: number;
          faturamentoHorario: number;
        } => Boolean(grupo)
      );

    const reservasFiltradas = grupos.flatMap((grupo) => grupo.reservas);
    const totalReservas = reservasFiltradas.length;
    const totalParticipantes = grupos.reduce((acc, grupo) => acc + grupo.totalPessoas, 0);
    const totalChegadas = grupos.reduce((acc, grupo) => acc + grupo.totalChegadasHorario, 0);
    const faturamento = grupos.reduce((acc, grupo) => acc + grupo.faturamentoHorario, 0);

    return {
      grupos,
      totalReservas,
      totalParticipantes,
      totalChegadas,
      totalPendentes: Math.max(totalReservas - totalChegadas, 0),
      totalPreReservas: reservasFiltradas.filter((reserva) => statusEhPreReserva(reserva)).length,
      totalPets: reservasFiltradas.filter((reserva) => reserva.temPet === true).length,
      totalManuais: reservasFiltradas.filter((reserva) => reserva.origem === 'manual').length,
      totalCheckout: reservasFiltradas.filter((reserva) => reserva.origem !== 'manual').length,
      faturamento,
      gruposTotal: grupos.length,
      primeiroHorario: grupos[0]?.tituloHorario ?? 'Sem horario',
    };
  }, [
    reservas,
    filtroAtividadeNormalizado,
    filtroChegada,
    filtroStatusReserva,
    filtroOrigemReserva,
    filtroPerfilReserva,
    pacotes,
  ]);







  const handleSaveReserva = async () => {

    if (!editReserva) return;

    if (!editReserva.data) {
      setFeedback({ type: 'error', message: 'Por favor, selecione a data da reserva.' });
      return;
    }

    try {
      const pacoteIdsSelecionados = Array.from(
        new Set(
          Array.isArray(editReserva.pacoteIds)
            ? editReserva.pacoteIds.map((id) => id?.toString()).filter(Boolean)
            : []
        )
      );

      const pacotesSelecionados = pacotes.filter(
        (pacote) => pacote.id && pacoteIdsSelecionados.includes(pacote.id)
      );

      if (pacoteIdsSelecionados.length === 0 || pacotesSelecionados.length === 0) {
        setFeedback({ type: 'error', message: 'Selecione pelo menos um pacote para a reserva.' });
        return;
      }

      const pacotesComHorarioEspecifico = pacotesSelecionados.filter(
        (pacote) =>
          (pacote.modoHorario ?? 'lista') !== 'intervalo' &&
          Array.isArray(pacote.horarios) &&
          pacote.horarios.length > 0
      );

      const horariosCompativeis = pacotesComHorarioEspecifico.reduce<string[]>((horariosComuns, pacote, index) => {
        const horariosPacote = Array.isArray(pacote.horarios) ? pacote.horarios : [];
        if (index === 0) return [...horariosPacote];
        return horariosComuns.filter((horario) => horariosPacote.includes(horario));
      }, []);

      const requerHorarioEspecifico = pacotesComHorarioEspecifico.length > 0;
      if (requerHorarioEspecifico && horariosCompativeis.length === 0) {
        setFeedback({
          type: 'error',
          message: 'Os pacotes selecionados nao possuem horario especifico em comum.',
        });
        return;
      }

      if (requerHorarioEspecifico && horariosDisponiveisPacotesEmEdicao.length === 0) {
        setFeedback({
          type: 'error',
          message: 'Nao ha horarios validos restantes para a data escolhida.',
        });
        return;
      }

      if (requerHorarioEspecifico && !editReserva.horario) {
        setFeedback({
          type: 'error',
          message: 'Selecione um horario para os pacotes escolhidos.',
        });
        return;
      }

      if (requerHorarioEspecifico && !horariosCompativeis.includes(editReserva.horario)) {
        setFeedback({
          type: 'error',
          message: 'O horario selecionado nao atende todos os pacotes marcados.',
        });
        return;
      }

      const dataReservaNormalizada = normalizarDataReserva(editReserva.data);
      const dataReservaSelecionada = dayjs(dataReservaNormalizada);
      const hoje = dayjs().startOf('day');
      const dataOriginalNormalizada = normalizarDataReserva(reservaOriginalEmEdicao?.data);
      const horarioOriginalNormalizado = (reservaOriginalEmEdicao?.horario ?? '').toString();
      const mantendoMesmaDataPassada =
        isEditingReserva &&
        Boolean(dataOriginalNormalizada) &&
        dataOriginalNormalizada === dataReservaNormalizada &&
        dataReservaSelecionada.isBefore(hoje, 'day');

      if (!dataReservaNormalizada || !dataReservaSelecionada.isValid()) {
        setFeedback({ type: 'error', message: 'Informe uma data valida para a reserva.' });
        return;
      }

      if (dataReservaSelecionada.isBefore(hoje, 'day') && !mantendoMesmaDataPassada) {
        setFeedback({
          type: 'error',
          message: 'Nao e permitido salvar reserva manual em uma data passada.',
        });
        return;
      }

      if (requerHorarioEspecifico && dataReservaSelecionada.isSame(hoje, 'day')) {
        const minutosHorario = parseHorarioParaMinutos(editReserva.horario);
        const minutosAgora = dayjs().hour() * 60 + dayjs().minute();
        const mantendoMesmoHorarioPassadoHoje =
          isEditingReserva &&
          dataOriginalNormalizada === dataReservaNormalizada &&
          horarioOriginalNormalizado === editReserva.horario;

        const horarioJaPassouHoje =
          minutosHorario !== null && minutosHorario < minutosAgora && !mantendoMesmoHorarioPassadoHoje;

        if (horarioJaPassouHoje) {
          const desejaContinuarMesmoAssim = window.confirm(
            `O horario ${editReserva.horario} ja passou hoje. Deseja continuar com o cadastro manual mesmo assim?`
          );

          if (!desejaContinuarMesmoAssim) {
            return;
          }
        }
      }

      const atividade = pacotesSelecionados.map((pacote) => pacote.nome).join(' + ').trim();

      if (!atividade) {
        setFeedback({ type: 'error', message: 'Nao foi possivel montar a atividade da reserva.' });
        return;
      }

      const participantesPorTipo = montarParticipantesPorTipo(tiposClientesAtivos, editReserva);
      const participantes = calcularParticipantes(editReserva);

      if (participantes <= 0) {
        setFeedback({
          type: 'error',
          message: 'Adicione pelo menos 1 participante para salvar a reserva manual.',
        });
        return;
      }

      const valorTotalReservaCalculado = calcularValorPacotesSelecionados(
        pacotesSelecionados,
        tiposClientesAtivos,
        participantesPorTipo
      );
      const valorTotalReservaManual = parseCurrencyInput(valorManualReservaInput);
      const valorTotalReserva =
        editReserva.educativo === true
          ? valorTotalReservaManual
          : valorTotalReservaCalculado;

      if (editReserva.educativo === true && valorTotalReserva <= 0) {
        setFeedback({
          type: 'error',
          message: 'Informe manualmente o valor total das reservas educativas.',
        });
        return;
      }

      let bloquearDiaPorExcedenteEducativo = false;
      let reservaEducativaSemConsumirDisponibilidade = false;

      if (typeof limiteParticipantesManualEmEdicao === 'number') {
        const limiteAtual = Math.max(limiteParticipantesManualEmEdicao, 0);

        if (participantes > limiteAtual) {
          const dataReservaFormatada = dayjs(dataReservaNormalizada).format('DD/MM/YYYY');
          const detalhesLimite = [
            requerHorarioEspecifico &&
            editReserva.horario &&
            typeof limiteHorarioSelecionadoEmEdicao === 'number'
              ? `Horario ${editReserva.horario}: referencia atual de ${Math.max(limiteHorarioSelecionadoEmEdicao, 0)} vaga(s).`
              : null,
            typeof vagasRestantesFaixaDiaEmEdicao === 'number'
              ? `Data ${dataReservaFormatada}: referencia atual de ${Math.max(vagasRestantesFaixaDiaEmEdicao, 0)} vaga(s).`
              : null,
          ].filter(Boolean);

          const desejaContinuarMesmoAssim = window.confirm(
            [
              'Esta reserva manual ultrapassa o limite regular de vagas.',
              `Participantes informados: ${participantes}.`,
              `Referencia disponivel agora: ${limiteAtual} vaga(s).`,
              detalhesLimite.join('\n'),
              'Deseja continuar mesmo assim?',
            ]
              .filter(Boolean)
              .join('\n\n')
          );

          if (!desejaContinuarMesmoAssim) {
            return;
          }

          if (editReserva.educativo === true) {
            const desejaBloquearDia = window.confirm(
              `A reserva educativa sera salva acima do limite regular para ${dataReservaFormatada}. Deseja fechar os agendamentos deste dia antes de concluir o cadastro?\n\nOK = cadastrar e bloquear o dia\nCancelar = cadastrar sem descontar das vagas e manter o dia aberto`
            );
            bloquearDiaPorExcedenteEducativo = desejaBloquearDia;
            reservaEducativaSemConsumirDisponibilidade = !desejaBloquearDia;
          }
        }
      }

      const mesaPrincipalEmEdicao = mesas.find((mesa) => mesa.id === editReserva.mesaPrincipalId);
      const mesaSecundariaEmEdicao = mesas.find((mesa) => mesa.id === editReserva.mesaSecundariaId);

      if (mesaPrincipalEmEdicao) {
        const excedeuCapacidadePrincipal = participantes > mesaPrincipalEmEdicao.capacidade;

        if (excedeuCapacidadePrincipal) {
          if (!mesaSecundariaEmEdicao) {
            setFeedback({
              type: 'error',
              message: 'Quantidade de pessoas excede a mesa escolhida. Selecione uma mesa complementar da mesma area.',
            });
            return;
          }

          if (mesaSecundariaEmEdicao.area !== mesaPrincipalEmEdicao.area) {
            setFeedback({
              type: 'error',
              message: 'A mesa complementar precisa ser da mesma area da mesa principal.',
            });
            return;
          }

          if (mesaSecundariaEmEdicao.id === mesaPrincipalEmEdicao.id) {
            setFeedback({
              type: 'error',
              message: 'Escolha mesas diferentes para somar capacidade.',
            });
            return;
          }
        }

        const capacidadeTotal =
          mesaPrincipalEmEdicao.capacidade + (mesaSecundariaEmEdicao?.capacidade ?? 0);

        if (participantes > capacidadeTotal) {
          setFeedback({
            type: 'error',
            message: 'A capacidade combinada das mesas selecionadas e inferior ao total de participantes.',
          });
          return;
        }
      }

      const mesasSelecionadas: MesaSelecionada[] = [];

      if (mesaPrincipalEmEdicao) {
        mesasSelecionadas.push({
          id: mesaPrincipalEmEdicao.id,
          nome: mesaPrincipalEmEdicao.nome,
          capacidade: mesaPrincipalEmEdicao.capacidade,
          area: mesaPrincipalEmEdicao.area,
        });
      }

      if (
        mesaSecundariaEmEdicao &&
        (!mesaPrincipalEmEdicao || mesaSecundariaEmEdicao.id !== mesaPrincipalEmEdicao.id)
      ) {
        mesasSelecionadas.push({
          id: mesaSecundariaEmEdicao.id,
          nome: mesaSecundariaEmEdicao.nome,
          capacidade: mesaSecundariaEmEdicao.capacidade,
          area: mesaSecundariaEmEdicao.area,
        });
      }

      const capacidadeMesas = mesasSelecionadas.reduce(
        (acc, mesa) => acc + (mesa.capacidade ?? 0),
        0
      );

      const areaMesa = editReserva.areaMesa || mesaPrincipalEmEdicao?.area || '';

      const statusAtual = isEditingReserva ? editReserva.status ?? 'pre_reserva' : 'confirmado';
      const statusAtualNormalizado = normalizarStatus(statusAtual);

      const adultos =
        obterValorPorTipoNome(participantesPorTipo, tiposClientesAtivos, 'adult') ?? 0;
      const criancas =
        obterValorPorTipoNome(participantesPorTipo, tiposClientesAtivos, 'crian') ?? 0;
      const bariatrica =
        obterValorPorTipoNome(participantesPorTipo, tiposClientesAtivos, 'bariat') ?? 0;

      const { id, ...restante } = editReserva;

      const payload = {
        ...restante,
        atividade,
        pacoteIds: pacoteIdsSelecionados,
        adultos,
        criancas,
        bariatrica,
        participantesPorTipo,
        participantes,
        valor: valorTotalReserva,
        status: statusAtual,
        naoConsomeDisponibilidade: reservaEducativaSemConsumirDisponibilidade,
        confirmada: reservaEstaConfirmada({
          status: statusAtual,
          confirmada: editReserva.confirmada,
        }),
        areaMesa,
        mesaPrincipalId: mesaPrincipalEmEdicao?.id ?? null,
        mesaSecundariaId: mesaSecundariaEmEdicao?.id ?? null,
        mesasSelecionadas,
        capacidadeMesas,
      };

      const reservaRef =
        isEditingReserva && editReserva.id
          ? doc(db, 'reservas', editReserva.id)
          : doc(collection(db, 'reservas'));
      const batch = writeBatch(db);

      batch.set(reservaRef, payload, { merge: isEditingReserva });

      if (bloquearDiaPorExcedenteEducativo) {
        const refDisponibilidade = doc(db, 'disponibilidade', editReserva.data);
        batch.set(refDisponibilidade, { data: editReserva.data, fechado: true }, { merge: true });
      }

      await batch.commit();

      if (bloquearDiaPorExcedenteEducativo) {
        if (dayjs(selectedDate).format('YYYY-MM-DD') === editReserva.data) {
          setDiaFechado(true);
        }
        setFeedback({
          type: 'success',
          message: `Reserva educativa ${isEditingReserva ? 'atualizada' : 'cadastrada'} e dia ${dayjs(editReserva.data).format('DD/MM/YYYY')} bloqueado com sucesso!`,
        });
      } else if (reservaEducativaSemConsumirDisponibilidade) {
        setFeedback({
          type: 'success',
          message: `Reserva educativa ${isEditingReserva ? 'atualizada' : 'cadastrada'} sem descontar das vagas do dia.`,
        });
      } else if (isEditingReserva) {
        setFeedback({
          type: 'success',
          message: statusEhPreReserva(payload) ? 'Pré-reserva atualizada!' : 'Reserva atualizada com sucesso!',
        });
      } else {
        setFeedback({
          type: 'success',
          message: statusEhPreReserva(payload)
            ? 'Pré-reserva cadastrada com sucesso!'
            : 'Reserva manual cadastrada com sucesso!',
        });
      }

      setModalReserva(false);
      setEditReserva(null);
      setReservaOriginalEmEdicao(null);
    } catch (error) {
      console.error('Erro ao salvar reserva:', error);
      setFeedback({ type: 'error', message: 'Erro ao salvar reserva.' });
    }
  };
  // Pacotes Logic

  const fetchPacotes = useCallback(async () => {

    const snap = await getDocs(collection(db, 'pacotes'));

    const lista = snap.docs.map(docSnap => {

      const data = docSnap.data() as Partial<Pacote>;

      const modoHorario = data.modoHorario === 'intervalo' ? 'intervalo' : 'lista';

      const precosPorTipo =

        data.precosPorTipo && typeof data.precosPorTipo === 'object'

          ? Object.fromEntries(

              Object.entries(data.precosPorTipo).map(([chave, valor]) => [chave, Number(valor) || 0])

            )

          : undefined;

      return {

        id: docSnap.id,

        nome: data.nome ?? '',

        tipo: data.tipo ?? '',

        precoAdulto: Number(data.precoAdulto ?? 0),

        precoCrianca: Number(data.precoCrianca ?? 0),

        precoBariatrica: Number(data.precoBariatrica ?? 0),

        precosPorTipo,

        limite: Number(data.limite ?? 0),

        dias: Array.isArray(data.dias) ? data.dias.map(Number).sort((a, b) => a - b) : [],

        horarios: Array.isArray(data.horarios) ? ordenarHorarios(data.horarios) : [],

        datasBloqueadas: Array.isArray(data.datasBloqueadas) ? [...data.datasBloqueadas].sort() : [],

        modoHorario,

        horarioInicio: data.horarioInicio ?? '',

        horarioFim: data.horarioFim ?? '',

        aceitaPet: data.aceitaPet === false ? false : true,

        perguntasPersonalizadas: Array.isArray(data.perguntasPersonalizadas) ? data.perguntasPersonalizadas : [],

      } as Pacote;

    });

    setPacotes(lista);

  }, []);

  const fetchTiposClientes = useCallback(async () => {

    setCarregandoTiposClientes(true);

    try {

      const snap = await getDocs(collection(db, 'tipos_clientes'));

      const lista = snap.docs

        .map((docSnap) => {

          const data = docSnap.data() as Partial<TipoCliente>;

          return {

            id: docSnap.id,

            nome: data.nome ?? '',

            descricao: data.descricao ?? '',

          } as TipoCliente;

        })

        .filter((tipo) => tipo.nome.trim().length > 0)

        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }));

      setTiposClientes(lista);


    } catch (error) {

      console.error('Erro ao carregar tipos de clientes:', error);

      setTiposClientes([]);

    } finally {

      setCarregandoTiposClientes(false);

    }

  }, []);

  const fetchWhatsappConfig = useCallback(async () => {

    try {

      const emailRef = doc(db, 'configuracoes', 'email');
      const mensagensRef = doc(db, 'configuracoes', 'mensagens');
      const legadoRef = doc(db, 'configuracoes', 'whatsapp');

      const [emailSnap, mensagensSnap, legadoSnap] = await Promise.all([
        getDocFromServer(emailRef).catch(async () => getDoc(emailRef)),
        getDocFromServer(mensagensRef).catch(async () => getDoc(mensagensRef)),
        getDocFromServer(legadoRef).catch(async () => getDoc(legadoRef)),
      ]);

      const rawEmail = emailSnap.exists() ? (emailSnap.data() as Record<string, any>) : {};
      const rawMensagens = mensagensSnap.exists() ? (mensagensSnap.data() as Record<string, any>) : {};
      const rawLegado = legadoSnap.exists() ? (legadoSnap.data() as Record<string, any>) : {};

        const mensagemConfirmacaoAutomatica =
          typeof rawMensagens.mensagemConfirmacaoEmail === 'string' &&
          rawMensagens.mensagemConfirmacaoEmail.trim()
            ? rawMensagens.mensagemConfirmacaoEmail
            : emailTemplateConfirmacaoPadrao;

        const mensagemConfirmacaoManual =
          typeof rawMensagens.mensagemManualPadrao === 'string' && rawMensagens.mensagemManualPadrao.trim()
            ? rawMensagens.mensagemManualPadrao
            : typeof rawLegado.mensagemConfirmacaoManual === 'string' && rawLegado.mensagemConfirmacaoManual.trim()
              ? rawLegado.mensagemConfirmacaoManual
            : whatsappTemplateMensagemManualPadrao;

        const modelosMensagemManual = normalizarModelosMensagemManual(
          rawMensagens.modelosMensagemManual ?? rawLegado.modelosMensagemManual
        );

        const mensagemBoasVindas =
          typeof rawLegado.mensagemBoasVindas === 'string' && rawLegado.mensagemBoasVindas.trim()
            ? rawLegado.mensagemBoasVindas
            : whatsappTemplateBoasVindasPadrao;

        const assuntoConfirmacaoEmail =
          typeof rawMensagens.assuntoConfirmacaoEmail === 'string' &&
          rawMensagens.assuntoConfirmacaoEmail.trim()
            ? rawMensagens.assuntoConfirmacaoEmail
            : emailAssuntoConfirmacaoPadrao;

        const whatsappConfirmacaoAtiva = rawLegado.confirmacaoAutomaticaAtiva === true;
        const whatsappMensagemConfirmacao =
          typeof rawLegado.mensagemConfirmacaoAutomatica === 'string'
            ? rawLegado.mensagemConfirmacaoAutomatica
            : '';

        setWhatsappConfig({
          ativo: rawEmail.ativo !== false,
          assuntoConfirmacaoEmail,
          mensagemConfirmacaoAutomatica,
          mensagemConfirmacaoManual,
          mensagemBoasVindas,
          modelosMensagemManual,
          whatsappConfirmacaoAtiva,
          whatsappMensagemConfirmacao,
        });

    } catch (error) {

      console.error('Erro ao carregar configuracoes de email:', error);

      setWhatsappConfig({
        ativo: true,
        assuntoConfirmacaoEmail: emailAssuntoConfirmacaoPadrao,
        mensagemConfirmacaoAutomatica: emailTemplateConfirmacaoPadrao,
        mensagemConfirmacaoManual: whatsappTemplateMensagemManualPadrao,
        mensagemBoasVindas: whatsappTemplateBoasVindasPadrao,
        modelosMensagemManual: [],
      });

    }

  }, []);

  const fetchSiteConfig = useCallback(async () => {
    try {
      const snap = await getDoc(doc(db, 'configuracoes', 'site'));
      const data = snap.exists() ? (snap.data() as Record<string, any>) : {};
      setSiteConfig({ textoFuncionamento: data.textoFuncionamento ?? '' });
    } catch (error) {
      console.error('Erro ao carregar configuracoes do site:', error);
    }
  }, []);

  const salvarSiteConfig = useCallback(async () => {
    setSiteConfigSalvando(true);
    try {
      await setDoc(doc(db, 'configuracoes', 'site'), { textoFuncionamento: siteConfig.textoFuncionamento.trim() }, { merge: true });
    } catch (error) {
      console.error('Erro ao salvar configuracoes do site:', error);
    } finally {
      setSiteConfigSalvando(false);
    }
  }, [siteConfig]);

  const obterModelosWhatsappNormalizados = () => {
    const modelosComAlgumValor = (whatsappConfig.modelosMensagemManual ?? []).filter((item) => {
      const titulo = item.titulo?.trim() ?? '';
      const mensagem = item.mensagem?.trim() ?? '';
      return titulo || mensagem;
    });

    const modelos = normalizarModelosMensagemManual(modelosComAlgumValor);

    return {
      modelos,
      modelosIgnorados: modelosComAlgumValor.length - modelos.length,
    };
  };

  const salvarEmailConfig = async () => {

    const mensagemAutomatica = whatsappConfig.mensagemConfirmacaoAutomatica.trim();
    const assuntoEmail = (whatsappConfig.assuntoConfirmacaoEmail ?? '').trim();

    if (!mensagemAutomatica) {
      setFeedback({ type: 'error', message: 'Informe o corpo do email.' });
      return;
    }

    if (!assuntoEmail) {
      setFeedback({ type: 'error', message: 'Informe o assunto do email.' });
      return;
    }

    setWhatsappSalvando(true);

    try {

      const emailPayload = {
        ativo: whatsappConfig.ativo,
        atualizadoEm: new Date(),
      };

      const mensagensPayload = {
        mensagemConfirmacaoAutomatica: mensagemAutomatica,
        mensagemConfirmacaoEmail: mensagemAutomatica,
        assuntoConfirmacaoEmail: assuntoEmail,
        atualizadoEm: new Date(),
      };

      await Promise.all([
        setDoc(doc(db, 'configuracoes', 'email'), emailPayload, { merge: true }),
        setDoc(doc(db, 'configuracoes', 'mensagens'), mensagensPayload, { merge: true }),
      ]);

      setWhatsappConfig((prev) => ({
        ...prev,
        assuntoConfirmacaoEmail: assuntoEmail,
        mensagemConfirmacaoAutomatica: mensagemAutomatica,
      }));

      setFeedback({
        type: 'success',
        message: 'Configurações de email salvas.',
      });

    } catch (error) {

      console.error('Erro ao salvar configuracoes de email:', error);

      setFeedback({ type: 'error', message: 'Erro ao salvar configurações.' });

    } finally {

      setWhatsappSalvando(false);

    }

  };

  const salvarMensagensWhatsapp = async () => {
    const mensagemManual = whatsappConfig.mensagemConfirmacaoManual.trim();
    const mensagemBoasVindas = (whatsappConfig.mensagemBoasVindas ?? '').trim();

    if (!mensagemManual) {
      setFeedback({ type: 'error', message: 'Informe a mensagem padrão do WhatsApp.' });
      return;
    }

    if (!mensagemBoasVindas) {
      setFeedback({ type: 'error', message: 'Informe a mensagem do Disparador Agradecimento.' });
      return;
    }

    const { modelos, modelosIgnorados } = obterModelosWhatsappNormalizados();

    setWhatsappSalvando(true);

    try {
      await Promise.all([
        setDoc(
          doc(db, 'configuracoes', 'mensagens'),
          {
            mensagemConfirmacaoManual: mensagemManual,
            mensagemManualPadrao: mensagemManual,
            modelosMensagemManual: modelos,
            atualizadoEm: new Date(),
          },
          { merge: true }
        ),
        setDoc(
          doc(db, 'configuracoes', 'whatsapp'),
          {
            mensagemBoasVindas,
            // Disparo automatico de WhatsApp quando reserva e paga
            confirmacaoAutomaticaAtiva: whatsappConfig.whatsappConfirmacaoAtiva ?? false,
            mensagemConfirmacaoAutomatica: (whatsappConfig.whatsappMensagemConfirmacao ?? '').trim(),
            atualizadoEm: new Date(),
          },
          { merge: true }
        ),
      ]);

      setWhatsappConfig((prev) => ({
        ...prev,
        mensagemConfirmacaoManual: mensagemManual,
        mensagemBoasVindas,
        modelosMensagemManual: modelos,
      }));

      setFeedback({
        type: 'success',
        message:
          modelosIgnorados > 0
            ? 'Mensagens do WhatsApp salvas. Modelos incompletos foram ignorados.'
            : 'Mensagens do WhatsApp salvas.',
      });
    } catch (error) {
      console.error('Erro ao salvar mensagens do WhatsApp:', error);
      setFeedback({ type: 'error', message: 'Erro ao salvar mensagens do WhatsApp.' });
    } finally {
      setWhatsappSalvando(false);
    }
  };

  const carregarFilaEmails = useCallback(async () => {
    try {
      setEmailFilaCarregando(true);
      const response = await fetch(`${API_BASE}/emails/fila?limit=500`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || `Status ${response.status}`);
      }

      setEmailFila({
        emailHabilitado: data?.emailHabilitado === true,
        totalReservasPagas: Number(data?.totalReservasPagas ?? 0),
        enviados: Number(data?.enviados ?? 0),
        pendentes: Number(data?.pendentes ?? 0),
        erros: Number(data?.erros ?? 0),
        semEmail: Number(data?.semEmail ?? 0),
        uso: {
          diario: criarEmailUsoEscopo(
            Number(data?.uso?.diario?.enviados ?? 0),
            Number(data?.uso?.diario?.limite ?? 100),
          ),
          mensal: criarEmailUsoEscopo(
            Number(data?.uso?.mensal?.enviados ?? 0),
            Number(data?.uso?.mensal?.limite ?? 3000),
          ),
          referencia: data?.uso?.referencia,
        },
        itens: Array.isArray(data?.itens) ? data.itens : [],
      });
    } catch (error: any) {
      console.error('Erro ao carregar fila de emails:', error);
      setFeedback({ type: 'error', message: error?.message || 'Erro ao carregar fila de emails.' });
    } finally {
      setEmailFilaCarregando(false);
    }
  }, []);

  const emailTemLimiteDisponivel =
    emailFila.uso.diario.restantes > 0 && emailFila.uso.mensal.restantes > 0;

  const tentarReenviarEmail = async (item: EmailFilaItem) => {
    try {
      setEmailAcaoCarregando({ id: item.id, acao: 'retry' });
      const response = await fetch(`${API_BASE}/emails/${item.id}/retry`, { method: 'POST' });
      const data = await response.json().catch(() => ({}));

      if (!response.ok || data?.success === false) {
        const motivo = data?.motivo;
        const mensagem =
          motivo === 'LIMITE_ATINGIDO'
            ? 'Limite de envio atingido. Aguarde liberar cota antes de tentar novamente.'
            : motivo === 'EMAIL_AUSENTE'
              ? 'Esta reserva nao possui email cadastrado.'
              : motivo === 'JA_ENVIADO'
                ? 'Este email ja foi enviado.'
                : data?.error || `Status ${response.status}`;
        throw new Error(mensagem);
      }

      setFeedback({ type: 'success', message: 'Email reenviado com sucesso.' });
      await carregarFilaEmails();
    } catch (error: any) {
      console.error('Erro ao reenviar email:', error);
      setFeedback({ type: 'error', message: error?.message || 'Erro ao reenviar email.' });
      await carregarFilaEmails();
    } finally {
      setEmailAcaoCarregando(null);
    }
  };

  const excluirEmailDaFila = async (item: EmailFilaItem) => {
    const confirmar = window.confirm(`Excluir ${item.nome || 'cliente'} da fila de email?`);
    if (!confirmar) return;

    try {
      setEmailAcaoCarregando({ id: item.id, acao: 'excluir' });
      const response = await fetch(`${API_BASE}/emails/${item.id}/excluir`, { method: 'POST' });
      const data = await response.json().catch(() => ({}));

      if (!response.ok || data?.success === false) {
        throw new Error(data?.error || data?.motivo || `Status ${response.status}`);
      }

      setFeedback({ type: 'success', message: 'Email removido da fila.' });
      await carregarFilaEmails();
    } catch (error: any) {
      console.error('Erro ao excluir email da fila:', error);
      setFeedback({ type: 'error', message: error?.message || 'Erro ao excluir email da fila.' });
    } finally {
      setEmailAcaoCarregando(null);
    }
  };

  const processarFilaEmails = async () => {
    const dataMinima = emailDataMinima || dayjs().format('YYYY-MM-DD');
    const confirmar = window.confirm(
      `Disparar a fila de emails apenas para reservas a partir de ${dayjs(dataMinima).format('DD/MM/YYYY')}?\n\n` +
      `Reservas anteriores a esta data serao IGNORADAS.`
    );
    if (!confirmar) return;

    try {
      setProcessandoFila(true);
      const url = `${API_BASE}/process-emails?data_minima=${encodeURIComponent(dataMinima)}`;
      const response = await fetch(url, { method: 'POST' });
      const data = await response.json().catch(() => ({}));

      if (!response.ok || data?.success === false) {
        throw new Error(data?.error || `Status ${response.status}`);
      }

      const enviados = Number(data?.emailsEnviados ?? 0);
      const ignorados = Number(data?.ignoradosPorData ?? 0);
      const falhas = Number(data?.falhas ?? 0);
      setFeedback({
        type: enviados > 0 || falhas === 0 ? 'success' : 'error',
        message: `Disparo concluido: ${enviados} enviado(s), ${falhas} falha(s), ${ignorados} ignorado(s) por data.`,
      });
      await carregarFilaEmails();
    } catch (error: any) {
      console.error('Erro ao processar fila de emails:', error);
      setFeedback({ type: 'error', message: error?.message || 'Erro ao processar fila.' });
    } finally {
      setProcessandoFila(false);
    }
  };

  const excluirEmailsSelecionadosEmMassa = async () => {
    const ids = Array.from(emailSelecionados);
    if (ids.length === 0) return;

    const confirmar = window.confirm(
      `Excluir ${ids.length} email(s) selecionado(s) da fila? Esta acao nao pode ser desfeita.`
    );
    if (!confirmar) return;

    try {
      setExcluindoEmMassa(true);
      const response = await fetch(`${API_BASE}/emails/excluir-em-massa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reservaIds: ids }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok || data?.success === false) {
        throw new Error(data?.error || `Status ${response.status}`);
      }

      setFeedback({
        type: 'success',
        message: `${data?.excluidos ?? 0} email(s) removido(s) da fila.`,
      });
      setEmailSelecionados(new Set());
      await carregarFilaEmails();
    } catch (error: any) {
      console.error('Erro ao excluir emails em massa:', error);
      setFeedback({ type: 'error', message: error?.message || 'Erro ao excluir em massa.' });
    } finally {
      setExcluindoEmMassa(false);
    }
  };

  const toggleSelecaoEmail = (id: string) => {
    setEmailSelecionados((prev) => {
      const proximo = new Set(prev);
      if (proximo.has(id)) proximo.delete(id);
      else proximo.add(id);
      return proximo;
    });
  };

  const carregarStatusWhatsapp = useCallback(async () => {
    try {
      setWhatsappStatusCarregando(true);
      const response = await fetch(`${API_BASE}/whatsapp/status`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || `Status ${response.status}`);
      }
      setWhatsappStatus({
        status: data?.status ?? 'idle',
        qr: data?.qr ?? null,
        lastError: data?.lastError ?? null,
        lastQrAt: data?.lastQrAt ?? null,
        authStrategy: data?.authStrategy === 'remote' ? 'remote' : data?.authStrategy === 'local' ? 'local' : undefined,
        info: data?.info,
      });
    } catch (error: any) {
      console.error('Erro ao carregar status do WhatsApp:', error);
      setFeedback({ type: 'error', message: error?.message || 'Erro ao carregar status do WhatsApp.' });
    } finally {
      setWhatsappStatusCarregando(false);
    }
  }, []);

  const iniciarConexaoWhatsapp = async () => {
    try {
      setWhatsappAcaoCarregando('start');
      const response = await fetch(`${API_BASE}/whatsapp/start`, { method: 'POST' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || `Status ${response.status}`);
      }
      setWhatsappStatus({
        status: data?.status ?? 'initializing',
        qr: data?.qr ?? null,
        lastError: data?.lastError ?? null,
        lastQrAt: data?.lastQrAt ?? null,
        authStrategy: data?.authStrategy === 'remote' ? 'remote' : data?.authStrategy === 'local' ? 'local' : undefined,
        info: data?.info,
      });
      setFeedback({ type: 'success', message: 'Conexao do Disparador Agradecimento iniciada.' });
    } catch (error: any) {
      console.error('Erro ao iniciar WhatsApp:', error);
      setFeedback({ type: 'error', message: error?.message || 'Erro ao iniciar WhatsApp.' });
    } finally {
      setWhatsappAcaoCarregando(null);
    }
  };

  const desconectarConexaoWhatsapp = async () => {
    try {
      setWhatsappAcaoCarregando('logout');
      const response = await fetch(`${API_BASE}/whatsapp/logout`, { method: 'POST' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || `Status ${response.status}`);
      }
      setWhatsappStatus({
        status: data?.status ?? 'disconnected',
        qr: data?.qr ?? null,
        lastError: data?.lastError ?? null,
        lastQrAt: data?.lastQrAt ?? null,
        authStrategy: data?.authStrategy === 'remote' ? 'remote' : data?.authStrategy === 'local' ? 'local' : undefined,
        info: data?.info,
      });
      setFeedback({ type: 'success', message: 'Disparador Agradecimento desconectado.' });
    } catch (error: any) {
      console.error('Erro ao desconectar WhatsApp:', error);
      setFeedback({ type: 'error', message: error?.message || 'Erro ao desconectar WhatsApp.' });
    } finally {
      setWhatsappAcaoCarregando(null);
    }
  };

  type WhatsappMensagemKey =
    | 'mensagemConfirmacaoAutomatica'
    | 'mensagemConfirmacaoManual'
    | 'mensagemBoasVindas';

  const inserirPlaceholderWhatsapp = (campo: WhatsappMensagemKey, placeholder: string) => {
    setWhatsappConfig((prev) => {
      const atual = prev[campo] ?? '';
      const separador = atual && !atual.endsWith(' ') ? ' ' : '';

      return {
        ...prev,
        [campo]: `${atual}${separador}${placeholder}`,
      } as WhatsappConfig;
    });
  };

  const gerarIdModeloWhatsapp = () =>
    `modelo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  const adicionarModeloMensagemManual = () => {
    const novoId = gerarIdModeloWhatsapp();

    setWhatsappConfig((prev) => ({
      ...prev,
      modelosMensagemManual: [
        ...(prev.modelosMensagemManual ?? []),
        {
          id: novoId,
          titulo: `Modelo ${(prev.modelosMensagemManual?.length ?? 0) + 1}`,
          mensagem: '',
        },
      ],
    }));

    setWhatsappModeloAbertoId(novoId);
  };

  const atualizarModeloMensagemManual = (modeloId: string, patch: Partial<WhatsappModeloMensagem>) => {
    setWhatsappConfig((prev) => ({
      ...prev,
      modelosMensagemManual: (prev.modelosMensagemManual ?? []).map((modelo) =>
        modelo.id === modeloId ? { ...modelo, ...patch } : modelo
      ),
    }));
  };

  const removerModeloMensagemManual = (modeloId: string) => {
    setWhatsappConfig((prev) => ({
      ...prev,
      modelosMensagemManual: (prev.modelosMensagemManual ?? []).filter((modelo) => modelo.id !== modeloId),
    }));
  };

  const inserirPlaceholderModeloMensagemManual = (modeloId: string, placeholder: string) => {
    setWhatsappConfig((prev) => ({
      ...prev,
      modelosMensagemManual: (prev.modelosMensagemManual ?? []).map((modelo) => {
        if (modelo.id !== modeloId) return modelo;
        const atual = modelo.mensagem ?? '';
        const separador = atual && !atual.endsWith(' ') ? ' ' : '';
        return { ...modelo, mensagem: `${atual}${separador}${placeholder}` };
      }),
    }));
  };

  const fecharEnvioWhatsapp = useCallback(() => {
    setWhatsappEnvioModal(null);
    setWhatsappEnvioModeloId('padrao');
    setWhatsappEnvioMensagem('');
  }, []);

  const obterTemplateEnvioWhatsapp = useCallback(
    (modeloId: string) => {
      if (modeloId === 'padrao') {
        return whatsappConfig.mensagemConfirmacaoManual || whatsappTemplateMensagemManualPadrao;
      }

      const modelo = (whatsappConfig.modelosMensagemManual ?? []).find((item) => item.id === modeloId);
      if (modelo?.mensagem?.trim()) {
        return modelo.mensagem;
      }

      return whatsappConfig.mensagemConfirmacaoManual || whatsappTemplateMensagemManualPadrao;
    },
    [whatsappConfig.mensagemConfirmacaoManual, whatsappConfig.modelosMensagemManual]
  );

  const abrirEnvioWhatsapp = useCallback(
    (reserva: Reserva, participantes: number, pacoteDescricao: string, valorFormatado: string) => {
      const telefoneDestino = normalizarTelefoneWhatsapp(reserva.telefone);

      if (!telefoneDestino) {
        setFeedback({ type: 'error', message: 'Telefone/WhatsApp do cliente não informado.' });
        return;
      }

      const dadosMensagem = {
        nome: reserva.nome ?? '',
        datareserva: formatarDataReserva(reserva.data),
        data: formatarDataReserva(reserva.data),
        horario: reserva.horario ?? '',
        atividade: pacoteDescricao,
        participantes: String(participantes),
        telefone: reserva.telefone ?? '',
        valor: valorFormatado,
        status: reserva.status ?? '',
      };

      const template = obterTemplateEnvioWhatsapp('padrao');
      const mensagem = montarMensagemWhatsApp(template, dadosMensagem);

      setWhatsappEnvioModeloId('padrao');
      setWhatsappEnvioMensagem(mensagem);
      setWhatsappEnvioModal({
        reserva,
        telefoneDestino,
        dadosMensagem,
        participantes,
        pacoteDescricao,
      });
    },
    [obterTemplateEnvioWhatsapp]
  );

  const abrirWhatsapp = useCallback(() => {
    if (!whatsappEnvioModal) return;

    const texto = whatsappEnvioMensagem.trim();
    if (!texto) {
      setFeedback({ type: 'error', message: 'Digite a mensagem antes de enviar.' });
      return;
    }

    const link = `https://wa.me/${whatsappEnvioModal.telefoneDestino}?text=${encodeURIComponent(texto)}`;
    const janela = window.open(link, '_blank');
    if (!janela) {
      setFeedback({ type: 'error', message: 'Não foi possível abrir o WhatsApp. Verifique o bloqueador de pop-ups.' });
      return;
    }
    janela.opener = null;
    setFeedback({ type: 'success', message: 'WhatsApp aberto com a mensagem pronta para envio.' });
    fecharEnvioWhatsapp();
  }, [fecharEnvioWhatsapp, whatsappEnvioMensagem, whatsappEnvioModal]);



  const fetchCombos = useCallback(async () => {

    try {

      const snap = await getDocs(collection(db, 'combos'));

      const lista = snap.docs.map(docSnap => {

        const data = docSnap.data() as Partial<Combo> & {

          precoAdulto?: number;

          precoCrianca?: number;

          precoBariatrica?: number;

          precosPorTipo?: Record<string, number>;

        };

        const precosPorTipo =

          data.precosPorTipo && typeof data.precosPorTipo === 'object'

            ? Object.fromEntries(

                Object.entries(data.precosPorTipo).map(([chave, valor]) => [chave, Number(valor) || 0])

              )

            : undefined;

        return {

          id: docSnap.id,

          nome: data.nome ?? '',

          pacoteIds: Array.isArray(data.pacoteIds) ? data.pacoteIds.map((id) => id?.toString()).filter(Boolean) : [],

          preco: Number(data.preco ?? 0),

          precoAdulto: Number(data.precoAdulto ?? data.preco ?? 0),

          precoCrianca: Number(data.precoCrianca ?? data.preco ?? 0),

          precoBariatrica: Number(data.precoBariatrica ?? data.preco ?? 0),

          precosPorTipo,

          ativo: data.ativo !== false,

        } as Combo;

      });

      setCombos(lista);

    } catch (error) {

      console.error('Erro ao carregar combos:', error);

    }

  }, []);







  useEffect(() => {

    fetchPacotes();

    fetchCombos();

    fetchTiposClientes();

  }, [fetchPacotes, fetchCombos, fetchTiposClientes]);



  useEffect(() => {

    const fetchMesas = async () => {

      setCarregandoMesas(true);

      try {

        const snapshot = await getDocs(collection(db, 'mesas'));

        const lista = snapshot.docs

          .map((docSnap) => {

            const data = docSnap.data() as Partial<Mesa>;

            return {

              id: docSnap.id,

              nome: data.nome ?? docSnap.id,

              capacidade: Number(data.capacidade ?? 0),

              area: data.area ?? 'Sem área',

              ativa: data.ativa !== false,

            } as Mesa;

          })

          .filter((mesa) => mesa.capacidade > 0 && mesa.ativa !== false)

          .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true, sensitivity: 'base' }));

        setMesas(lista);

      } catch (error) {

        console.error('Erro ao carregar mesas:', error);

      } finally {

        setCarregandoMesas(false);

      }

    };



    void fetchMesas();

  }, []);



  useEffect(() => {

    if (aba === 'pacotes') {

      fetchPacotes();

      fetchCombos();

    }

  }, [aba, fetchPacotes, fetchCombos]);

  useEffect(() => {

    if (!editReserva) return;

    setEditReserva((prev) => {

      if (!prev) return prev;

      return {

        ...prev,

        participantesPorTipo: montarParticipantesPorTipo(tiposClientesAtivos, prev),

      };

    });

  }, [tiposClientesAtivos]);

  useEffect(() => {

    if (aba === 'tipos_clientes') {

      fetchTiposClientes();

    }

  }, [aba, fetchTiposClientes]);

  useEffect(() => {
    void fetchWhatsappConfig();
  }, [fetchWhatsappConfig]);

  useEffect(() => {
    void fetchSiteConfig();
  }, [fetchSiteConfig]);

  useEffect(() => {
    if (aba !== 'whatsapp') return;

    void carregarStatusWhatsapp();
    // 5s quando esperando QR/conexao, 30s quando estavel — reduz egress
    const isTransitioning = whatsappStatus.status === 'initializing' || whatsappStatus.status === 'qr';
    const intervalo = isTransitioning ? 5000 : 30000;
    const intervalId = window.setInterval(() => {
      void carregarStatusWhatsapp();
    }, intervalo);

    return () => window.clearInterval(intervalId);
  }, [aba, carregarStatusWhatsapp, whatsappStatus.status]);

  useEffect(() => {
    if (aba !== 'email') return;

    void carregarFilaEmails();
  }, [aba, carregarFilaEmails]);

  const iniciarNovoTipoCliente = () => {

    setEditTipoCliente(criarTipoClienteVazio());

    setIsEditingTipoCliente(false);

  };

  const handleEditTipoCliente = (tipo: TipoCliente) => {

    setEditTipoCliente({

      id: tipo.id,

      nome: tipo.nome ?? '',

      descricao: tipo.descricao ?? '',

    });

    setIsEditingTipoCliente(true);

  };

  const handleSalvarTipoCliente = async () => {

    const nome = editTipoCliente.nome.trim();

    if (!nome) {

      setFeedback({ type: 'error', message: 'Informe o nome do tipo.' });

      return;

    }

    const nomeNormalizado = nome.toLowerCase();

    const existeDuplicado = tiposClientes.some(

      (tipo) => tipo.nome.trim().toLowerCase() === nomeNormalizado && tipo.id !== editTipoCliente.id

    );

    if (existeDuplicado) {

      setFeedback({ type: 'error', message: 'Já existe um tipo com esse nome.' });

      return;

    }

    const descricao = (editTipoCliente.descricao ?? '').trim();

    const payload = {

      nome,

      ...(descricao ? { descricao } : {}),

    };

    setSalvandoTipoCliente(true);

    try {

      if (isEditingTipoCliente && editTipoCliente.id) {

        await updateDoc(doc(db, 'tipos_clientes', editTipoCliente.id), payload);

        setFeedback({ type: 'success', message: 'Tipo atualizado com sucesso!' });

      } else {

        await addDoc(collection(db, 'tipos_clientes'), payload);

        setFeedback({ type: 'success', message: 'Tipo cadastrado com sucesso!' });

      }

      iniciarNovoTipoCliente();

      await fetchTiposClientes();

    } catch (error) {

      console.error('Erro ao salvar tipo de cliente:', error);

      setFeedback({ type: 'error', message: 'Erro ao salvar tipo de cliente.' });

    } finally {

      setSalvandoTipoCliente(false);

    }

  };

  const handleExcluirTipoCliente = async (tipo: TipoCliente) => {

    if (!tipo.id) return;

    if (!confirm(`Tem certeza que deseja excluir o tipo "${tipo.nome}"?`)) return;

    setSalvandoTipoCliente(true);

    try {

      await deleteDoc(doc(db, 'tipos_clientes', tipo.id));

      if (editTipoCliente.id === tipo.id) {

        iniciarNovoTipoCliente();

      }

      setFeedback({ type: 'success', message: 'Tipo removido.' });

      await fetchTiposClientes();

    } catch (error) {

      console.error('Erro ao excluir tipo de cliente:', error);

      setFeedback({ type: 'error', message: 'Erro ao excluir tipo de cliente.' });

    } finally {

      setSalvandoTipoCliente(false);

    }

  };


        const handleEditPacote = (pacote: Pacote) => {

    setEditPacote({

      ...pacote,

      dias: Array.isArray(pacote.dias) ? pacote.dias : [],

      horarios: Array.isArray(pacote.horarios) ? ordenarHorarios(pacote.horarios) : [],

      datasBloqueadas: Array.isArray(pacote.datasBloqueadas) ? [...pacote.datasBloqueadas] : [],

      modoHorario: pacote.modoHorario ?? 'lista',

      horarioInicio: pacote.horarioInicio ?? '',

      horarioFim: pacote.horarioFim ?? '',

      aceitaPet: pacote.aceitaPet ?? true,

      precosPorTipo: montarPrecosPorTipo(tiposClientesAtivos, pacote.precosPorTipo, pacote),

      perguntasPersonalizadas: pacote.perguntasPersonalizadas ?? [],

    });

    setNovaDataBloqueada('');

    setNovaPergunta({ pergunta: '', tipo: 'sim_nao', obrigatoria: false, emojiSim: '✅', emojiNao: '❌' });

    setIsEditingPacote(true);

    setModalPacote(true);

  };



  const handleAddPacote = () => {

    setEditPacote({

      nome: '',

      tipo: '',

      precoAdulto: 0,

      precoCrianca: 0,

      precoBariatrica: 0,

      precosPorTipo: montarPrecosPorTipo(tiposClientesAtivos, undefined, {

        precoAdulto: 0,

        precoCrianca: 0,

        precoBariatrica: 0,

      }),

      horarios: [],

      dias: [],

      limite: 0,

      datasBloqueadas: [],

      modoHorario: 'lista',

      horarioInicio: '',

      horarioFim: '',

      aceitaPet: true,

      perguntasPersonalizadas: [],

    });

    setNovaDataBloqueada('');

    setNovaPergunta({ pergunta: '', tipo: 'sim_nao', obrigatoria: false, emojiSim: '✅', emojiNao: '❌' });

    setIsEditingPacote(false);

    setModalPacote(true);

  };



  const handleSavePacote = async () => {

    if (!editPacote) return;

    if (!editPacote.nome) {

      setFeedback({ type: 'error', message: 'Nome obrigatório!' });

      return;

    }



    const modoHorario = editPacote.modoHorario ?? 'lista';

    const dias = Array.from(new Set(editPacote.dias ?? [])).sort((a, b) => a - b);

    const datasBloqueadas = Array.from(new Set(editPacote.datasBloqueadas ?? [])).sort();

    const limite = Number(editPacote.limite) || 0;



    const horarioInicio = editPacote.horarioInicio ?? '';

    const horarioFim = editPacote.horarioFim ?? '';

    let horariosCalculados: string[] = [];



    if (modoHorario === 'intervalo') {

      if (!horarioInicio || !horarioFim) {

        setFeedback({ type: 'error', message: 'Informe horário inicial e final.' });

        return;

      }

      horariosCalculados = [];

    } else {

      const listaHorarios = Array.isArray(editPacote.horarios) ? editPacote.horarios : [];

      horariosCalculados = ordenarHorarios(Array.from(new Set(listaHorarios)));

    }

    const precosPorTipo = montarPrecosPorTipo(tiposClientesAtivos, editPacote.precosPorTipo, editPacote);

    const precoAdulto = obterValorPorTipoNome(precosPorTipo, tiposClientesAtivos, 'adult') ?? 0;

    const precoCrianca = obterValorPorTipoNome(precosPorTipo, tiposClientesAtivos, 'crian') ?? 0;

    const precoBariatrica = obterValorPorTipoNome(precosPorTipo, tiposClientesAtivos, 'bariat') ?? 0;



    const pacoteNormalizado: Pacote = {

      ...editPacote,

      precoAdulto,

      precoCrianca,

      precoBariatrica,

      precosPorTipo,

      modoHorario,

      dias,

      datasBloqueadas,

      limite,

      horarioInicio: modoHorario === 'intervalo' ? horarioInicio : '',

      horarioFim: modoHorario === 'intervalo' ? horarioFim : '',

      horarios: horariosCalculados,

      aceitaPet: editPacote.aceitaPet ?? true,

      aviso: (editPacote.aviso ?? '').trim(),

    };



    const { id, ...dadosPacote } = pacoteNormalizado;



    try {

      if (isEditingPacote && id) {

        await updateDoc(doc(db, 'pacotes', id), dadosPacote);

        setFeedback({ type: 'success', message: 'Pacote atualizado com sucesso!' });

      } else {

        await addDoc(collection(db, 'pacotes'), dadosPacote);

        setFeedback({ type: 'success', message: 'Pacote cadastrado com sucesso!' });

      }

      setModalPacote(false);

      setEditPacote(null);

      setNovaDataBloqueada('');

      fetchPacotes();

    } catch {

      setFeedback({ type: 'error', message: 'Erro ao salvar pacote.' });

    }

  };



  const excluirPacote = async (id: string) => {

    if (window.confirm('Excluir pacote?')) {

      await deleteDoc(doc(db, 'pacotes', id));

      fetchPacotes();

    }

  };



  const adicionarDataBloqueada = () => {

    if (!novaDataBloqueada) return;

    setEditPacote(prev => {

      if (!prev) return prev;

      const existentes = new Set(prev.datasBloqueadas ?? []);

      existentes.add(novaDataBloqueada);

      return {

        ...prev,

        datasBloqueadas: Array.from(existentes).sort(),

      };

    });

    setNovaDataBloqueada('');

  };



  const removerDataBloqueada = (data: string) => {

    setEditPacote(prev => {

      if (!prev) return prev;

      return {

        ...prev,

        datasBloqueadas: (prev.datasBloqueadas ?? []).filter(item => item !== data),

      };

    });

  };



  const adicionarPergunta = () => {

    if (!novaPergunta.pergunta.trim()) return;

    setEditPacote(prev => {

      if (!prev) return prev;

      const novaP: PerguntaPersonalizada = {

        id: Date.now().toString(),

        pergunta: novaPergunta.pergunta,

        tipo: novaPergunta.tipo,

        obrigatoria: novaPergunta.obrigatoria,

        ...(novaPergunta.tipo === 'sim_nao' && novaPergunta.emojiSim.trim() ? { emojiSim: novaPergunta.emojiSim.trim() } : {}),

        ...(novaPergunta.tipo === 'sim_nao' && novaPergunta.emojiNao.trim() ? { emojiNao: novaPergunta.emojiNao.trim() } : {}),

      };

      return {

        ...prev,

        perguntasPersonalizadas: [...(prev.perguntasPersonalizadas ?? []), novaP]

      };

    });

    setNovaPergunta({ pergunta: '', tipo: 'sim_nao', obrigatoria: false, emojiSim: '✅', emojiNao: '❌' });

  };



  const removerPergunta = (id: string) => {

    setEditPacote(prev => {

      if (!prev) return prev;

      return {

        ...prev,

        perguntasPersonalizadas: (prev.perguntasPersonalizadas ?? []).filter(p => p.id !== id)

      };

    });

  };



  const handleAddCombo = () => {

    setEditCombo({

      nome: '',

      pacoteIds: [],

      preco: 0,

      precoAdulto: 0,

      precoCrianca: 0,

      precoBariatrica: 0,

      precosPorTipo: montarPrecosPorTipo(tiposClientesAtivos, undefined, {

        precoAdulto: 0,

        precoCrianca: 0,

        precoBariatrica: 0,

      }),

      ativo: true,

    });

    setIsEditingCombo(false);

    setModalCombo(true);

  };



  const handleEditCombo = (combo: Combo) => {

    setEditCombo({

      ...combo,

      pacoteIds: Array.isArray(combo.pacoteIds) ? combo.pacoteIds : [],

      preco: Number(combo.preco ?? 0),

      precoAdulto: Number(combo.precoAdulto ?? combo.preco ?? 0),

      precoCrianca: Number(combo.precoCrianca ?? combo.preco ?? 0),

      precoBariatrica: Number(combo.precoBariatrica ?? combo.preco ?? 0),

      precosPorTipo: montarPrecosPorTipo(tiposClientesAtivos, combo.precosPorTipo, combo),

      ativo: combo.ativo !== false,

    });

    setIsEditingCombo(true);

    setModalCombo(true);

  };



  const handleToggleComboAtivo = async (combo: Combo) => {

    if (!combo.id) return;

    try {

      const proximoValor = !combo.ativo;

      await updateDoc(doc(db, 'combos', combo.id), { ativo: proximoValor });

      setCombos((prev) =>

        prev.map((item) => (item.id === combo.id ? { ...item, ativo: proximoValor } : item))

      );

      setFeedback({

        type: 'success',

        message: proximoValor ? 'Combo ativado!' : 'Combo desativado.',

      });

    } catch (error) {

      console.error('Erro ao atualizar combo:', error);

      setFeedback({ type: 'error', message: 'Erro ao atualizar combo.' });

    }

  };



  const handleDeleteCombo = async (comboId?: string) => {

    if (!comboId) return;

    if (!window.confirm('Deseja realmente excluir este combo?')) return;

    try {

      await deleteDoc(doc(db, 'combos', comboId));

      setFeedback({ type: 'success', message: 'Combo removido.' });

      fetchCombos();

    } catch (error) {

      console.error('Erro ao excluir combo:', error);

      setFeedback({ type: 'error', message: 'Erro ao excluir combo.' });

    }

  };



  const handleSaveCombo = async () => {

    if (!editCombo) return;

    const nome = editCombo.nome.trim();

    if (!nome) {

      setFeedback({ type: 'error', message: 'Informe o nome do combo.' });

      return;

    }

    if ((editCombo.pacoteIds ?? []).length === 0) {

      setFeedback({ type: 'error', message: 'Selecione ao menos um pacote para o combo.' });

      return;

    }

    const precoTotal = Number(editCombo.preco ?? 0);

    const precosPorTipo = montarPrecosPorTipo(tiposClientesAtivos, editCombo.precosPorTipo, editCombo);

    const precoAdulto = obterValorPorTipoNome(precosPorTipo, tiposClientesAtivos, 'adult') ?? 0;

    const precoCrianca = obterValorPorTipoNome(precosPorTipo, tiposClientesAtivos, 'crian') ?? 0;

    const precoBariatrica = obterValorPorTipoNome(precosPorTipo, tiposClientesAtivos, 'bariat') ?? 0;

    const possuiValoresPersonalizados = Object.values(precosPorTipo).some(

      (valor) => Number.isFinite(valor) && valor > 0

    );

    if (!possuiValoresPersonalizados) {

      setFeedback({ type: 'error', message: 'Informe os valores personalizados por tipo de participante.' });

      return;

    }

    setSalvandoCombo(true);

    try {

      const payload = {

        nome,

        pacoteIds: Array.from(new Set(editCombo.pacoteIds)),

        preco: precoTotal,

        precoAdulto: precoAdulto > 0 ? precoAdulto : 0,

        precoCrianca: precoCrianca > 0 ? precoCrianca : 0,

        precoBariatrica: precoBariatrica > 0 ? precoBariatrica : 0,

        precosPorTipo,

        ativo: editCombo.ativo !== false,

      };

      if (isEditingCombo && editCombo.id) {

        await updateDoc(doc(db, 'combos', editCombo.id), payload);

        setFeedback({ type: 'success', message: 'Combo atualizado com sucesso!' });

      } else {

        await addDoc(collection(db, 'combos'), payload);

        setFeedback({ type: 'success', message: 'Combo criado com sucesso!' });

      }

      setModalCombo(false);

      setEditCombo(null);

      fetchCombos();

    } catch (error) {

      console.error('Erro ao salvar combo:', error);

      setFeedback({ type: 'error', message: 'Erro ao salvar combo.' });

    } finally {

      setSalvandoCombo(false);

    }

  };

  const carregarDisponibilidade = useCallback(async () => {



    const dataStr = dayjs(selectedDate).format('YYYY-MM-DD');



    setCarregandoDisponibilidade(true);



    try {



      const ref = doc(db, 'disponibilidade', dataStr);



      const snap = await getDoc(ref);



      if (snap.exists()) {



        const dados = snap.data();



        setDiaFechado(Boolean(dados?.fechado));



        setDisponibilidadeData(
          normalizarBloqueiosDisponibilidade(dados?.horarios as Record<string, unknown> | null)
        );
        setVagasExtrasDisponibilidade(
          normalizarVagasExtrasDisponibilidade(
            dados?.vagasExtras as Record<string, unknown> | null
          )
        );



      } else {



        setDisponibilidadeData({});
        setVagasExtrasDisponibilidade({});



        setDiaFechado(false);



      }



    } catch (error) {



      console.error('Erro ao carregar disponibilidade:', error);



      setDisponibilidadeData({});
      setVagasExtrasDisponibilidade({});



      setDiaFechado(false);



    } finally {



      setCarregandoDisponibilidade(false);



    }



  }, [selectedDate]);



  const salvarDisponibilidade = async () => {

    const dataStr = dayjs(selectedDate).format('YYYY-MM-DD');

    setSalvandoDisponibilidade(true);

    try {

      const ref = doc(db, 'disponibilidade', dataStr);

      const temBloqueiosPorHorario = Object.keys(disponibilidadeData).length > 0;
      const temVagasExtras = Object.keys(vagasExtrasDisponibilidade).length > 0;

      const precisaManterRegistro = temBloqueiosPorHorario || temVagasExtras || diaFechado;

      if (precisaManterRegistro) {

        const payload: Record<string, any> = { data: dataStr };

        if (temBloqueiosPorHorario) {

          payload.horarios = disponibilidadeData;

        } else {

          payload.horarios = deleteField();

        }

        if (temVagasExtras) {

          payload.vagasExtras = vagasExtrasDisponibilidade;

        } else {

          payload.vagasExtras = deleteField();

        }

        payload.fechado = diaFechado ? true : deleteField();

        await setDoc(ref, payload, { merge: true });

      } else {

        await deleteDoc(ref);

      }

      setFeedback({ type: 'success', message: 'Disponibilidade atualizada!' });

      setModalDisponibilidade(false);

    } catch (error) {

      console.error('Erro ao salvar disponibilidade:', error);

      setFeedback({ type: 'error', message: 'Erro ao salvar disponibilidade.' });

    } finally {

      setSalvandoDisponibilidade(false);

    }

  };






  const aplicarFechamentoPeriodo = async () => {

    if (!fechamentoInicio || !fechamentoFim) {

      setFeedback({ type: 'error', message: 'Informe o período que deseja atualizar.' });

      return;

    }

    const inicio = dayjs(fechamentoInicio);

    const fim = dayjs(fechamentoFim);

    if (!inicio.isValid() || !fim.isValid()) {

      setFeedback({ type: 'error', message: 'Datas inválidas para o período informado.' });

      return;

    }

    if (inicio.isAfter(fim)) {

      setFeedback({ type: 'error', message: 'A data inicial deve ser menor ou igual à data final.' });

      return;

    }

    setProcessandoFechamentoPeriodo(true);

    try {

      const batch = writeBatch(db);

      const datasAfetadas: string[] = [];

      let cursor = inicio.startOf('day');

      const limite = fim.startOf('day');

      while (cursor.diff(limite, 'day') <= 0) {

        const dataStr = cursor.format('YYYY-MM-DD');

        datasAfetadas.push(dataStr);

        const ref = doc(db, 'disponibilidade', dataStr);

        if (acaoFechamentoPeriodo === 'fechar') {

          batch.set(ref, { data: dataStr, fechado: true }, { merge: true });

        } else {

          batch.set(ref, { data: dataStr, fechado: deleteField() }, { merge: true });

        }

        cursor = cursor.add(1, 'day');

      }

      await batch.commit();

      if (datasAfetadas.includes(dayjs(selectedDate).format('YYYY-MM-DD'))) {

        setDiaFechado(acaoFechamentoPeriodo === 'fechar');

      }

      setFeedback({

        type: 'success',

        message: acaoFechamentoPeriodo === 'fechar'

          ? 'Período bloqueado para todos os pacotes.'

          : 'Período reaberto nos agendamentos.',

      });

    } catch (error) {

      console.error('Erro ao aplicar fechamento em período:', error);

      setFeedback({ type: 'error', message: 'Não foi possível atualizar o período selecionado.' });

    } finally {

      setProcessandoFechamentoPeriodo(false);

    }

  };



  useEffect(() => {

    if (modalDisponibilidade) {

      const dataStr = dayjs(selectedDate).format('YYYY-MM-DD');

      setFechamentoInicio(dataStr);

      setFechamentoFim(dataStr);


      setVagasExtrasDisponibilidade({});

      setPacotesDisponibilidadeAbertos({});

      carregarDisponibilidade();

    }

  }, [modalDisponibilidade, carregarDisponibilidade, selectedDate]);

  const exportarDashboardPdf = async () => {
    if (dashboardCensurar) {
      setFeedback({ type: 'error', message: 'Desative a censura para exportar o relatório.' });
      return;
    }
    try {
      const { jsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');

      const doc = new jsPDF({ unit: 'pt', format: 'a4' });

      const inicioFmt = dayjs(dashboardMetricas.periodo.inicio).isValid()
        ? dayjs(dashboardMetricas.periodo.inicio).format('DD/MM/YYYY')
        : dashboardMetricas.periodo.inicio;
      const fimFmt = dayjs(dashboardMetricas.periodo.fim).isValid()
        ? dayjs(dashboardMetricas.periodo.fim).format('DD/MM/YYYY')
        : dashboardMetricas.periodo.fim;

      let y = 44;
      doc.setFontSize(18);
      doc.text('Vaga Fogo - Relatório (Dashboard)', 40, y);
      y += 20;

      doc.setFontSize(10);
      doc.text(`Período: ${inicioFmt} a ${fimFmt}`, 40, y);
      y += 14;
      doc.text(`Filtro: ${dashboardFiltroOrigemRotulo}`, 40, y);
      y += 14;
      doc.text(`Gerado em: ${dayjs().format('DD/MM/YYYY HH:mm')}`, 40, y);
      y += 22;

      doc.setFontSize(12);
      doc.text(`Reservas confirmadas: ${dashboardMetricas.resumo.confirmadas}`, 40, y);
      y += 14;
      doc.text(`Pré-reservas: ${dashboardMetricas.resumo.preReservas}`, 40, y);
      y += 14;
      doc.text(`Participantes (confirmadas): ${dashboardMetricas.resumo.participantes}`, 40, y);
      y += 14;
      doc.text(`Faturamento (confirmadas): ${formatCurrency(dashboardMetricas.resumo.faturamento)}`, 40, y);
      y += 14;
      doc.text(`Ticket médio: ${formatCurrency(dashboardMetricas.resumo.ticketMedio)}`, 40, y);
      y += 18;

      const pacotesRows = dashboardMetricas.porPacote.slice(0, 40).map((item) => [
        item.nome,
        String(item.reservas),
        String(item.participantes),
        formatCurrency(item.valor),
      ]);

      autoTable(doc, {
        head: [['Pacote', 'Reservas', 'Participantes', 'Faturamento']],
        body: pacotesRows.length > 0 ? pacotesRows : [['—', '0', '0', formatCurrency(0)]],
        startY: y,
        styles: { fontSize: 9 },
        headStyles: { fillColor: [37, 99, 235] },
      });

      const afterPacotesY =
        (doc as any).lastAutoTable?.finalY ? Number((doc as any).lastAutoTable.finalY) + 24 : y + 24;

      const clientesRows = dashboardMetricas.porCliente.slice(0, 40).map((item) => [
        item.nome || '---',
        item.cpf || item.telefone || '---',
        String(item.reservas),
        formatCurrency(item.valor),
      ]);

      autoTable(doc, {
        head: [['Cliente', 'CPF/Telefone', 'Reservas', 'Faturamento']],
        body: clientesRows.length > 0 ? clientesRows : [['—', '—', '0', formatCurrency(0)]],
        startY: afterPacotesY,
        styles: { fontSize: 9 },
        headStyles: { fillColor: [5, 150, 105] },
      });

      doc.save(
        `relatorio-dashboard-${dashboardMetricas.periodo.inicio}-${dashboardMetricas.periodo.fim}-${dashboardFiltroOrigem}.pdf`
      );
      setFeedback({ type: 'success', message: 'Relatório PDF gerado.' });
    } catch (error) {
      console.error('Erro ao gerar PDF:', error);
      setFeedback({ type: 'error', message: 'Erro ao gerar PDF.' });
    }
  };











  // Pesquisa Clientes

  const pesquisarClientes = async () => {

    if (!termoPesquisa.trim()) return;

    setCarregandoPesquisa(true);

    try {

      const q = query(collection(db, 'reservas'));

      const snapshot = await getDocs(q);

      const matches = snapshot.docs

        .map(doc => ({ id: doc.id, ...doc.data() } as Reserva))

        .filter(

          (r: Reserva) =>

            (r.nome && r.nome.toLowerCase().includes(termoPesquisa.toLowerCase())) ||

            (r.cpf && r.cpf.includes(termoPesquisa)) ||

            (r.telefone && r.telefone.includes(termoPesquisa))

        );

      setResultadosPesquisa(matches);

    } catch (e) {

      console.error('Erro na pesquisa de clientes:', e);

      setResultadosPesquisa([]);

    }

    setCarregandoPesquisa(false);

  };



  // Render

  return (

    <main
      className={`admin-dashboard-theme ${
        temaPainel === 'dark' ? 'admin-dashboard-theme--dark' : 'admin-dashboard-theme--light'
      } min-h-screen bg-slate-100 py-8`}
    >

      {feedback && (

        <div

          className={`fixed top-6 right-6 z-50 flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium shadow-lg ${

            feedback.type === 'success' ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'

          }`}

        >

          {feedback.message}

        </div>

      )}

      {notificacaoNovaReserva && (
        <div
          className="fixed bottom-6 right-6 z-50 w-[360px] max-w-[calc(100vw-3rem)]"
          role="alert"
          aria-live="assertive"
        >
          <div
            className="relative overflow-hidden rounded-2xl border border-emerald-200 bg-white p-4 text-left shadow-lg transition hover:shadow-xl before:pointer-events-none before:absolute before:inset-0 before:rounded-2xl before:border-2 before:border-emerald-500 before:opacity-90 before:animate-pulse"
          >
            <div className="relative flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-emerald-700">
                  Nova reserva recebida
                </p>
                <p className="mt-2 truncate text-base font-semibold text-slate-900">
                  {notificacaoNovaReserva.nome}
                </p>
                <p className="mt-1 text-sm font-medium text-slate-700">
                  {notificacaoNovaReserva.horario} · {notificacaoNovaReserva.participantes}{' '}
                  {notificacaoNovaReserva.participantes === 1 ? 'participante' : 'participantes'}
                </p>
                <p className="mt-1 truncate text-sm text-slate-500">{notificacaoNovaReserva.atividade}</p>
              </div>

              <button
                type="button"
                onClick={fecharNotificacaoNovaReserva}
                className="shrink-0 rounded-full bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-300"
                aria-label="Confirmar notificacao de nova reserva"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {whatsappEnvioModal && (
        <div
          className="fixed inset-0 z-[60] flex items-start justify-center bg-slate-900/60 px-2 py-4 overflow-y-auto"
          onClick={fecharEnvioWhatsapp}
        >
          <div
            className="w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-4 sm:px-6 py-4">
              <h4 className="text-lg font-semibold text-slate-900">Mensagem por WhatsApp</h4>
              <button
                type="button"
                onClick={fecharEnvioWhatsapp}
                className="rounded-full border border-slate-200 p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                aria-label="Fechar"
              >
                x
              </button>
            </div>

            <div className="space-y-4 px-4 sm:px-6 py-5">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-sm font-semibold text-slate-900">{whatsappEnvioModal.reserva.nome || 'Cliente'}</p>
                <p className="mt-1 text-sm text-slate-600">
                  {formatarDataReserva(whatsappEnvioModal.reserva.data)}{' '}
                  {whatsappEnvioModal.reserva.horario || '---'} · {whatsappEnvioModal.participantes}{' '}
                  {whatsappEnvioModal.participantes === 1 ? 'participante' : 'participantes'}
                </p>
                <p className="mt-1 text-sm text-slate-500">{whatsappEnvioModal.pacoteDescricao}</p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <label className="flex-1 text-xs font-semibold uppercase text-slate-500">
                  Modelo
                  <select
                    value={whatsappEnvioModeloId}
                    onChange={(e) => {
                      const novoModelo = e.target.value;
                      setWhatsappEnvioModeloId(novoModelo);
                      if (!whatsappEnvioModal) return;
                      const template = obterTemplateEnvioWhatsapp(novoModelo);
                      setWhatsappEnvioMensagem(montarMensagemWhatsApp(template, whatsappEnvioModal.dadosMensagem));
                    }}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                  >
                    <option value="padrao">Padrão (manual)</option>
                    {(whatsappConfig.modelosMensagemManual ?? []).map((modelo) => (
                      <option key={modelo.id} value={modelo.id}>
                        {modelo.titulo || 'Sem título'}
                      </option>
                    ))}
                  </select>
                </label>

                <button
                  type="button"
                  onClick={() => {
                    setAba('whatsapp');
                    fecharEnvioWhatsapp();
                  }}
                  className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50"
                >
                  Gerenciar modelos
                </button>
              </div>

              <label className="text-xs font-semibold uppercase text-slate-500">
                Mensagem
                <textarea
                  value={whatsappEnvioMensagem}
                  onChange={(e) => setWhatsappEnvioMensagem(e.target.value)}
                  rows={7}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                />
              </label>

              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={fecharEnvioWhatsapp}
                  className="inline-flex items-center justify-center rounded-full border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={abrirWhatsapp}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  <FaWhatsapp className="h-4 w-4" />
                  Abrir WhatsApp
                </button>
              </div>
            </div>
          </div>
        </div>
      )}


      {whatsappModeloAberto && (
        <div
          className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-900/60 px-2 py-4"
          onClick={() => setWhatsappModeloAbertoId(null)}
        >
          <div
            className="w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-4 py-4 sm:px-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">
                  Modelo de WhatsApp
                </p>
                <h4 className="mt-1 text-lg font-semibold text-slate-900">{whatsappModeloAberto.titulo}</h4>
                <p className="mt-1 text-sm text-slate-500">{whatsappModeloAberto.tipo}</p>
              </div>
              <button
                type="button"
                onClick={() => setWhatsappModeloAbertoId(null)}
                className="rounded-full border border-slate-200 p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                aria-label="Fechar"
              >
                x
              </button>
            </div>

            <div className="grid gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)]">
              <div className="space-y-4">
                {!whatsappModeloAberto.padrao ? (
                  <label className="block text-xs font-semibold uppercase text-slate-500">
                    Titulo
                    <input
                      value={
                        (whatsappConfig.modelosMensagemManual ?? []).find((modelo) => modelo.id === whatsappModeloAberto.id)
                          ?.titulo ?? ''
                      }
                      onChange={(e) => atualizarModeloMensagemManual(whatsappModeloAberto.id, { titulo: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                      placeholder="Ex: Confirmar detalhes"
                    />
                  </label>
                ) : null}

                <label className="block text-xs font-semibold uppercase text-slate-500">
                  Mensagem
                  <textarea
                    value={whatsappModeloAberto.mensagem}
                    onChange={(e) => {
                      if (whatsappModeloAberto.padrao) {
                        setWhatsappConfig((prev) => ({
                          ...prev,
                          mensagemConfirmacaoManual: e.target.value,
                        }));
                        return;
                      }

                      atualizarModeloMensagemManual(whatsappModeloAberto.id, { mensagem: e.target.value });
                    }}
                    rows={10}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                    placeholder={whatsappTemplateMensagemManualPadrao}
                  />
                </label>

                <div className="flex flex-wrap gap-2">
                  {whatsappPlaceholders.map((placeholder) => (
                    <button
                      key={`modelo-modal-${whatsappModeloAberto.id}-${placeholder}`}
                      type="button"
                      onClick={() => {
                        if (whatsappModeloAberto.padrao) {
                          inserirPlaceholderWhatsapp('mensagemConfirmacaoManual', placeholder);
                          return;
                        }

                        inserirPlaceholderModeloMensagemManual(whatsappModeloAberto.id, placeholder);
                      }}
                      className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-emerald-300 hover:text-emerald-600"
                    >
                      {placeholder}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold uppercase text-slate-500">Preview completo</p>
                  <span
                    className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                      whatsappModeloAberto.pronto
                        ? 'border-emerald-200 bg-white text-emerald-700'
                        : 'border-amber-200 bg-white text-amber-700'
                    }`}
                  >
                    {whatsappModeloAberto.pronto ? 'Pronto' : 'Incompleto'}
                  </span>
                </div>
                <div className="mt-3 rounded-2xl rounded-tl-md bg-white px-3 py-2 text-sm leading-relaxed text-slate-800 shadow-sm whitespace-pre-wrap">
                  {whatsappModeloAberto.preview}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2 border-t border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div>
                {!whatsappModeloAberto.padrao ? (
                  <button
                    type="button"
                    onClick={() => {
                      removerModeloMensagemManual(whatsappModeloAberto.id);
                      setWhatsappModeloAbertoId(null);
                    }}
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
                  >
                    <FaTrash className="h-3.5 w-3.5" />
                    Excluir
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      setWhatsappConfig((prev) => ({
                        ...prev,
                        mensagemConfirmacaoManual: whatsappTemplateMensagemManualPadrao,
                      }))
                    }
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-800"
                  >
                    Restaurar padrao
                  </button>
                )}
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => setWhatsappModeloAbertoId(null)}
                  className="inline-flex items-center justify-center rounded-full border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
                >
                  Fechar
                </button>
                <button
                  type="button"
                  onClick={salvarMensagensWhatsapp}
                  disabled={whatsappSalvando}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  <FaCheck className="h-4 w-4" />
                  {whatsappSalvando ? 'Salvando...' : 'Salvar modelos'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}



      <div className="admin-dashboard-shell mx-auto w-full max-w-[1760px] space-y-8 px-4 sm:px-6 xl:px-8 2xl:px-10">

        <header className="admin-hero admin-dashboard-mobile-hero lg:hidden">
          <div className="admin-dashboard-mobile-hero__top">
            <div className="admin-dashboard-mobile-hero__brand">
              <img
                src={logo}
                alt="Logo Vagafogo"
                className="h-14 w-14 rounded-3xl border border-amber-100 object-cover shadow-sm"
                loading="lazy"
              />

              <div className="min-w-0">
                <p className="admin-dashboard-mobile-hero__eyebrow">Painel administrativo</p>
                <p className="admin-dashboard-mobile-hero__title">Vagafogo</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="admin-dashboard-mobile-menu-btn"
              aria-label="Abrir menu"
              title="Menu"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>

          <div className="admin-dashboard-mobile-hero__preferences">
            {renderDesktopPreferences()}
          </div>
        </header>



        {/* Cards de estatísticas - apenas na aba reservas */}

        {false && aba === 'reservas' && (

          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">

            <article className="group relative overflow-hidden rounded-2xl border border-slate-100 bg-white p-5 shadow-sm transition duration-200 hover:-translate-y-1 hover:shadow-lg">

              <div className="flex items-start justify-between">

                <div>

                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Reservas do dia</p>

                  <p className="mt-3 text-3xl font-semibold text-slate-900">{totalReservasConfirmadas}</p>

                  <span className="text-xs text-slate-400">{Object.keys(reservas).length} horários ativos</span>

                </div>

                <span className="rounded-full bg-blue-50 p-3 text-blue-600">

                  <FaCalendarAlt className="h-5 w-5" />

                </span>

              </div>

            </article>



            <article className="group relative overflow-hidden rounded-2xl border border-slate-100 bg-white p-5 shadow-sm transition duration-200 hover:-translate-y-1 hover:shadow-lg">

              <div className="flex items-start justify-between">

                <div>

                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Participantes</p>

                  <p className="mt-3 text-3xl font-semibold text-slate-900">{totalParticipantesDoDia}</p>

                  <span className="text-xs text-slate-400">Confirmados hoje</span>

                </div>

                <span className="rounded-full bg-emerald-50 p-3 text-emerald-600">

                  <FaUsers className="h-5 w-5" />

                </span>

              </div>

            </article>



            <article className="group relative overflow-hidden rounded-2xl border border-slate-100 bg-white p-5 shadow-sm transition duration-200 hover:-translate-y-1 hover:shadow-lg">

              <div className="flex items-start justify-between">

                <div>

                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Próximo bloqueio</p>

                  <p className="mt-3 text-2xl font-semibold text-slate-900">

                    {proximaDataBloqueada ? proximaDataBloqueada.format('DD/MM/YYYY') : 'Sem bloqueios'}

                  </p>

                  <span className="text-xs text-slate-400">

                    {pacotes.reduce((acc, item) => acc + (item.datasBloqueadas?.length ?? 0), 0)} datas bloqueadas no total

                  </span>

                </div>

                <span className="rounded-full bg-amber-50 p-3 text-amber-500">

                  <FaChevronRight className="h-5 w-5" />

                </span>

              </div>

            </article>



            <article className="group relative overflow-hidden rounded-2xl border border-slate-100 bg-white p-5 shadow-sm transition duration-200 hover:-translate-y-1 hover:shadow-lg">

              <div className="flex items-start justify-between">

                <div>

                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Pacotes ativos</p>

                  <p className="mt-3 text-3xl font-semibold text-slate-900">{totalPacotesAtivos}</p>

                  <span className="text-xs text-slate-400">{pacotesQueNaoAceitamPet} sem pet</span>

                </div>

                <span className="rounded-full bg-purple-50 p-3 text-purple-600">

                  <FaLayerGroup className="h-5 w-5" />

                </span>

              </div>

            </article>

          </section>

        )}



        <div className={`admin-dashboard-layout ${layoutHeaderPainel === 'top' ? 'admin-dashboard-layout--top' : ''}`}>

        {layoutHeaderPainel === 'top' && (
          <header className="admin-dashboard-topbar hidden lg:flex">
            <div className="admin-dashboard-toolbar admin-dashboard-toolbar--top">
              <div className="admin-dashboard-toolbar__list admin-dashboard-toolbar__list--top">
                <div className="admin-dashboard-toolbar__brand-chip">
                  <img
                    src={logo}
                    alt="Logo Vagafogo"
                    className="h-14 w-14 rounded-3xl border border-amber-100 object-cover shadow-sm"
                    loading="lazy"
                  />
                </div>

                <div className="admin-dashboard-toolbar__nav-track">
                  {renderDesktopToolbarItems()}
                </div>

                <div className="admin-dashboard-toolbar__preferences-slot">
                  {renderDesktopPreferences()}
                </div>
              </div>
            </div>
          </header>
        )}

        {/* Desktop Navigation */}

        {layoutHeaderPainel === 'sidebar' && (
        <nav className="admin-dashboard-toolbar admin-dashboard-toolbar--sidebar hidden lg:flex">
          <div className="admin-dashboard-sidebar__brand">
            <div className="admin-dashboard-sidebar__brand-mark">
              <img
                src={logo}
                alt="Logo Vagafogo"
                className="h-14 w-14 rounded-3xl border border-amber-100 object-cover shadow-sm"
                loading="lazy"
              />
            </div>

            <div className="min-w-0">
              <p className="admin-dashboard-sidebar__eyebrow">Painel administrativo</p>
            </div>
          </div>

          <div className="admin-dashboard-sidebar__nav">
            {renderDesktopToolbarItems()}
            {false && (
            <>
            {abasDisponiveis.map(({ id, label, description, icon: Icon }) => {

              const ativo = aba === id;

              return (

                <button

                  key={id}

                  type="button"

                  onClick={() => setAba(id)}

                  className={`admin-dashboard-toolbar__item ${ativo ? 'is-active' : ''}`}

                >

                  <span className="admin-dashboard-toolbar__item-icon">
                    <Icon className="h-4 w-4" />
                  </span>

                  <span className="admin-dashboard-toolbar__item-content">
                    <span className="admin-dashboard-toolbar__item-label">{label}</span>
                    <span className="admin-dashboard-toolbar__item-description">{description}</span>
                  </span>

                </button>

              );

            })}

            {[
            {
              key: 'disponibilidade',
              visible: false,
              label: 'Disponibilidade',
              description: 'Editar agenda do dia',
              icon: FaEdit,
              className: '',
              onClick: () => {
                setAba('reservas');
                setModalDisponibilidade(true);
              },
            },
            {
              key: 'relatorios',
              visible: false,
              label: 'Relatórios',
              description: 'Resumo financeiro e metricas',
              icon: FaChartBar,
              className: '',
              onClick: () => setAba('dashboard'),
            },
            ]
              .filter((item) => item.visible !== false)
              .map(({ key, label, description, icon: Icon, onClick, className }) => (
              <button
                key={key}
                type="button"
                onClick={onClick}
                className={`admin-dashboard-toolbar__item ${className}`.trim()}
              >
                <span className="admin-dashboard-toolbar__item-icon">
                  <Icon className="h-4 w-4" />
                </span>

                <span className="admin-dashboard-toolbar__item-content">
                  <span className="admin-dashboard-toolbar__item-label">{label}</span>
                  <span className="admin-dashboard-toolbar__item-description">{description}</span>
                </span>
              </button>
            ))}
            </>
            )}
          </div>

          <div className="admin-dashboard-sidebar__footer">
            {renderDesktopPreferences()}
            {false && (
            <button
              type="button"
              onClick={() => setTemaPainel((temaAtual) => (temaAtual === 'dark' ? 'light' : 'dark'))}
              className={`admin-theme-toggle ${temaPainel === 'dark' ? 'is-dark' : 'is-light'}`}
              aria-label={`Alternar para tema ${temaPainel === 'dark' ? 'claro' : 'escuro'}`}
              title={`Tema ${temaPainel === 'dark' ? 'escuro' : 'claro'}`}
            >
              <span className={`admin-theme-toggle__icon ${temaPainel === 'light' ? 'is-active' : ''}`}>
                <FaSun className="h-4 w-4" />
              </span>
              <span className={`admin-theme-toggle__icon ${temaPainel === 'dark' ? 'is-active' : ''}`}>
                <FaMoon className="h-4 w-4" />
              </span>
              <span className="admin-theme-toggle__thumb" />
            </button>
            )}
          </div>

        </nav>
        )}

        <div className="admin-dashboard-main">

        

        {/* Mobile Sidebar */}

        {sidebarOpen && (

          <>

            <div
              className="admin-dashboard-mobile-sheet__backdrop lg:hidden"
              onClick={() => setSidebarOpen(false)}
            />

            <div className="admin-dashboard-mobile-sheet lg:hidden">
              <div className="admin-dashboard-mobile-sheet__panel">
                <div className="admin-dashboard-mobile-sheet__header">
                  <div className="admin-dashboard-mobile-sheet__brand">
                    <img
                      src={logo}
                      alt="Logo Vagafogo"
                      className="h-12 w-12 rounded-3xl border border-amber-100 object-cover shadow-sm"
                      loading="lazy"
                    />

                    <div className="min-w-0">
                      <p className="admin-dashboard-mobile-sheet__eyebrow">Painel administrativo</p>
                      <p className="admin-dashboard-mobile-sheet__title">Menu principal</p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setSidebarOpen(false)}
                    className="admin-dashboard-mobile-sheet__close"
                    aria-label="Fechar menu"
                    title="Fechar"
                  >
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <div className="admin-dashboard-mobile-sheet__nav">
                  {abasDisponiveis.map(({ id, label, icon: Icon }) => {
                    const ativo = aba === id;
                    const whatsappClassName = id === 'whatsapp' ? 'admin-dashboard-toolbar__item--whatsapp' : '';

                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => {
                          setAba(id);
                          setSidebarOpen(false);
                        }}
                        className={`admin-dashboard-toolbar__item ${whatsappClassName} ${ativo ? 'is-active' : ''}`.trim()}
                      >
                        <span className="admin-dashboard-toolbar__item-icon">
                          <Icon className="h-4 w-4" />
                        </span>

                        <span className="admin-dashboard-toolbar__item-content">
                          <span className="admin-dashboard-toolbar__item-label">{label}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

          </>

        )}



      {/* ========== Dashboard ========== */}

      {aba === 'dashboard' && (

        <section className="admin-tab-content space-y-6">

          <AdminTabHeader
            title="Dashboard"
            description={'Acompanhe faturamento, ocupacao e comportamento das reservas confirmadas e pre-reservas no periodo selecionado.'}
            icon={FaChartBar}
            actions={[
              {
                label: dashboardCensurar ? 'Mostrar dados' : 'Censurar dados',
                icon: dashboardCensurar ? FaEye : FaEyeSlash,
                onClick: () => setDashboardCensurar((prev) => !prev),
              },
              {
                label: 'Exportar PDF',
                icon: FaFilePdf,
                onClick: exportarDashboardPdf,
                variant: 'primary',
                disabled: dashboardCarregando || Boolean(dashboardErro) || dashboardCensurar,
              },
            ]}
            metrics={[
              {
                label: 'Periodo',
                value: `${formatarDataReserva(dashboardInicio)} - ${formatarDataReserva(dashboardFim)}`,
                hint: 'Janela atual do relatorio',
                icon: FaCalendarAlt,
                tone: 'sky',
              },
              {
                label: 'Confirmadas',
                value: dashboardMetricas.resumo.confirmadas.toLocaleString('pt-BR'),
                hint: 'Reservas confirmadas no recorte',
                icon: FaCheck,
                tone: 'emerald',
              },
              {
                label: 'Participantes',
                value: dashboardMetricas.resumo.participantes.toLocaleString('pt-BR'),
                hint: 'Publico confirmado no recorte',
                icon: FaUsers,
                tone: 'indigo',
              },
              {
                label: 'Faturamento',
                value: dashboardCensurar ? '••••' : formatCurrency(dashboardMetricas.resumo.faturamento),
                hint: 'Receita confirmada no recorte',
                icon: FaCreditCard,
                tone: 'amber',
              },
            ]}
            toolbar={
              <div className="admin-tab-hero__toolbar-grid">
                <div className="admin-tab-hero__toolbar-fields">
                  <label className="admin-tab-hero__field">
                    <span className="admin-tab-hero__field-label">Inicio</span>
                    <input
                      type="date"
                      value={dashboardInicio}
                      onChange={(e) => setDashboardInicio(e.target.value)}
                      className="admin-tab-hero__field-input"
                    />
                  </label>

                  <label className="admin-tab-hero__field">
                    <span className="admin-tab-hero__field-label">Fim</span>
                    <input
                      type="date"
                      value={dashboardFim}
                      onChange={(e) => setDashboardFim(e.target.value)}
                      className="admin-tab-hero__field-input"
                    />
                  </label>

                  <label className="admin-tab-hero__field">
                    <span className="admin-tab-hero__field-label">Origem</span>
                    <select
                      value={dashboardFiltroOrigem}
                      onChange={(e) => setDashboardFiltroOrigem(e.target.value as OrigemReservaFiltro)}
                      className="admin-tab-hero__field-input"
                    >
                      <option value="todas">Todas as reservas</option>
                      <option value="manual">Reservas manuais</option>
                      <option value="checkout">Pagas pelo checkout</option>
                    </select>
                  </label>
                </div>

                <div className="admin-tab-hero__toolbar-meta">
                  {dashboardCarregando ? (
                    <span className="admin-tab-hero__status-pill">
                      <span className="admin-tab-hero__status-dot admin-tab-hero__status-dot--amber" />
                      Carregando periodo
                    </span>
                  ) : null}
                  {!dashboardCarregando ? (
                    <span className="admin-tab-hero__status-pill">
                      <span className="admin-tab-hero__status-dot" />
                      {dashboardFiltroOrigemRotulo}
                    </span>
                  ) : null}
                </div>

                {dashboardErro ? <div className="admin-tab-hero__alert">{dashboardErro}</div> : null}
              </div>
            }
          />

          {false && <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">

            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">

              <div>

                <h2 className="text-xl font-semibold text-slate-900">Dashboard</h2>

                <p className="text-sm text-slate-500">Relatórios do período selecionado (confirmadas e pré-reservas).</p>

              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">

                <div className="grid grid-cols-2 gap-3">

                  <label className="text-xs font-semibold uppercase text-slate-500">

                    Início

                    <input

                      type="date"

                      value={dashboardInicio}

                      onChange={(e) => setDashboardInicio(e.target.value)}

                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"

                    />

                  </label>

                  <label className="text-xs font-semibold uppercase text-slate-500">

                    Fim

                    <input

                      type="date"

                      value={dashboardFim}

                      onChange={(e) => setDashboardFim(e.target.value)}

                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"

                    />

                  </label>

                </div>

                <button
                  type="button"
                  onClick={() => setDashboardCensurar((prev) => !prev)}
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50"
                  aria-label={dashboardCensurar ? 'Mostrar dados sensíveis' : 'Censurar dados sensíveis'}
                  title={dashboardCensurar ? 'Mostrar dados sensíveis' : 'Censurar dados sensíveis'}
                  aria-pressed={dashboardCensurar}
                >
                  {dashboardCensurar ? <FaEye className="h-4 w-4" /> : <FaEyeSlash className="h-4 w-4" />}
                  {dashboardCensurar ? 'Mostrar' : 'Censurar'}
                </button>

                <button

                  type="button"

                  onClick={exportarDashboardPdf}

                  disabled={dashboardCarregando || Boolean(dashboardErro) || dashboardCensurar}

                  className={`inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition ${

                    dashboardCarregando || dashboardErro || dashboardCensurar

                      ? 'bg-slate-300 cursor-not-allowed'

                      : 'bg-rose-600 hover:bg-rose-700'

                  }`}

                >

                  <FaFilePdf className="h-4 w-4" />

                  Exportar PDF

                </button>

              </div>

            </div>

            {dashboardErro && (

              <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">

                {dashboardErro}

              </div>

            )}

            {dashboardCarregando && (

              <p className="mt-4 text-sm text-slate-500">Carregando dados do período...</p>

            )}

          </article>}



          {false && <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">

            <article className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">

              <div className="flex items-start justify-between">

                <div>

                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Faturamento</p>

                  <p className="mt-3 text-2xl font-semibold text-slate-900">{dashboardCensurar ? '••••' : formatCurrency(dashboardMetricas.resumo.faturamento)}</p>

                  <span className="text-xs text-slate-400">Somente confirmadas</span>

                </div>

                <span className="rounded-full bg-blue-50 p-3 text-blue-600">

                  <FaCreditCard className="h-5 w-5" />

                </span>

              </div>

            </article>

            <article className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">

              <div className="flex items-start justify-between">

                <div>

                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Ticket médio</p>

                  <p className="mt-3 text-2xl font-semibold text-slate-900">{dashboardCensurar ? '••••' : formatCurrency(dashboardMetricas.resumo.ticketMedio)}</p>

                  <span className="text-xs text-slate-400">Confirmadas</span>

                </div>

                <span className="rounded-full bg-slate-100 p-3 text-slate-600">

                  <FaChartBar className="h-5 w-5" />

                </span>

              </div>

            </article>

            <article className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">

              <div className="flex items-start justify-between">

                <div>

                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Participantes</p>

                  <p className="mt-3 text-3xl font-semibold text-slate-900">{dashboardMetricas.resumo.participantes}</p>

                  <span className="text-xs text-slate-400">Confirmadas</span>

                </div>

                <span className="rounded-full bg-indigo-50 p-3 text-indigo-600">

                  <FaUsers className="h-5 w-5" />

                </span>

              </div>

            </article>

          </section>}



          <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">

            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">

              <div>

                <h3 className="text-lg font-semibold text-slate-900">Faturamento por dia</h3>

                <p className="text-sm text-slate-500">Confirmadas no período.</p>

              </div>

              <p className="text-sm font-semibold text-slate-700">

                Total: {dashboardCensurar ? '••••' : formatCurrency(dashboardMetricas.resumo.faturamento)}

              </p>

            </div>

            <div className="mt-4 overflow-x-auto">

              {dashboardCensurar ? (
                <div className="flex min-h-[180px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                  Valores censurados. Clique no ícone de olho para exibir.
                </div>
              ) : (
                (() => {
                const chartHeight = 140;
                const maxValor = Math.max(0, ...dashboardMetricas.porDia.map((item) => item.valor));

                if (dashboardMetricas.porDia.length === 0) {
                  return <p className="text-sm text-slate-500">Nenhum dado no período.</p>;
                }

                return (
                  <div className="relative min-w-max pb-2">
                    <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
                      {Array.from({ length: 5 }).map((_, idx) => (
                        <div key={idx} className="border-t border-slate-100" />
                      ))}
                    </div>

                    <div className="relative flex items-end gap-2 min-w-max">
                      {dashboardMetricas.porDia.map((item) => {
                        const altura = maxValor > 0 ? Math.round((item.valor / maxValor) * chartHeight) : 0;
                        const temValor = item.valor > 0;
                        const ticketDia = item.reservas > 0 ? item.valor / item.reservas : 0;
                        const participantesTotal = item.participantes + item.participantesPreReservas;

                        return (
                          <div key={item.data} className="group relative flex flex-col items-center">
                            <div style={{ height: `${chartHeight}px` }} className="flex items-end">
                              {temValor ? (
                                <div
                                  className="w-7 rounded-t bg-blue-600"
                                  style={{ height: `${Math.max(2, altura)}px` }}
                                />
                              ) : (
                                <div className="w-7 rounded-t bg-slate-200" style={{ height: '2px' }} />
                              )}
                            </div>

                            <div className="pointer-events-none absolute -top-2 left-1/2 z-10 w-56 -translate-x-1/2 -translate-y-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 opacity-0 shadow-lg transition group-hover:opacity-100">
                              <p className="font-semibold text-slate-900">{dayjs(item.data).format('DD/MM/YYYY')}</p>
                              <div className="mt-1 space-y-0.5">
                                <p className="flex items-center justify-between gap-3">
                                  <span className="text-slate-500">Faturamento</span>
                                  <span className="font-semibold">{formatCurrency(item.valor)}</span>
                                </p>
                                <p className="flex items-center justify-between gap-3">
                                  <span className="text-slate-500">Confirmadas</span>
                                  <span className="font-semibold">{item.reservas.toLocaleString('pt-BR')}</span>
                                </p>
                                <p className="flex items-center justify-between gap-3">
                                  <span className="text-slate-500">Pré-reservas</span>
                                  <span className="font-semibold">{item.preReservas.toLocaleString('pt-BR')}</span>
                                </p>
                                <p className="flex items-center justify-between gap-3 border-t border-slate-100 pt-1">
                                  <span className="text-slate-500">Ticket médio</span>
                                  <span className="font-semibold">{formatCurrency(ticketDia)}</span>
                                </p>
                                <p className="flex items-center justify-between gap-3">
                                  <span className="text-slate-500">Participantes</span>
                                  <span className="font-semibold">{participantesTotal.toLocaleString('pt-BR')}</span>
                                </p>
                              </div>
                            </div>

                            <span className="mt-1 text-[10px] font-medium text-slate-500">
                              {dayjs(item.data).format('DD')}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()
              )}

            </div>

          </article>



          <div className="grid gap-6 lg:grid-cols-2">
            <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">Reservas por dia</h3>
                  <p className="text-sm text-slate-500">Confirmadas e pré-reservas no período.</p>
                </div>
                <p className="text-sm font-semibold text-slate-700">
                  Total: {(dashboardMetricas.resumo.confirmadas + dashboardMetricas.resumo.preReservas).toLocaleString('pt-BR')}
                </p>
              </div>

              <div className="mt-4 overflow-x-auto">
                {(() => {
                  const chartHeight = 140;
                  const maxTotal = Math.max(
                    0,
                    ...dashboardMetricas.porDia.map((item) => item.reservas + item.preReservas)
                  );

                  if (dashboardMetricas.porDia.length === 0) {
                    return <p className="text-sm text-slate-500">Nenhum dado no período.</p>;
                  }

                  return (
                    <div className="relative min-w-max pb-2">
                      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
                        {Array.from({ length: 5 }).map((_, idx) => (
                          <div key={idx} className="border-t border-slate-100" />
                        ))}
                      </div>

                      <div className="relative flex items-end gap-2 min-w-max">
                        {dashboardMetricas.porDia.map((item) => {
                          const total = item.reservas + item.preReservas;
                          const alturaConfirmadas =
                            maxTotal > 0 ? Math.round((item.reservas / maxTotal) * chartHeight) : 0;
                          const alturaPre =
                            maxTotal > 0 ? Math.round((item.preReservas / maxTotal) * chartHeight) : 0;
                          const participantesTotal = item.participantes + item.participantesPreReservas;

                          return (
                            <div key={item.data} className="group relative flex flex-col items-center">
                              <div
                                className="flex w-7 flex-col justify-end"
                                style={{ height: `${chartHeight}px` }}
                              >
                                {alturaPre > 0 && (
                                  <div
                                    className={`w-7 bg-amber-400 ${alturaConfirmadas === 0 ? 'rounded-t' : ''}`}
                                    style={{ height: `${Math.max(2, alturaPre)}px` }}
                                  />
                                )}
                                {alturaConfirmadas > 0 && (
                                  <div
                                    className={`w-7 bg-blue-600 ${alturaPre === 0 ? 'rounded-t' : ''}`}
                                    style={{ height: `${Math.max(2, alturaConfirmadas)}px` }}
                                  />
                                )}
                                {total === 0 && (
                                  <div className="w-7 rounded-t bg-slate-200" style={{ height: '2px' }} />
                                )}
                              </div>

                              <div className="pointer-events-none absolute -top-2 left-1/2 z-10 w-52 -translate-x-1/2 -translate-y-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 opacity-0 shadow-lg transition group-hover:opacity-100">
                                <p className="font-semibold text-slate-900">{dayjs(item.data).format('DD/MM/YYYY')}</p>
                                <div className="mt-1 space-y-0.5">
                                  <p className="flex items-center justify-between gap-3">
                                    <span className="inline-flex items-center gap-2 text-slate-600">
                                      <span className="h-2.5 w-2.5 rounded-full bg-blue-600" />
                                      Confirmadas
                                    </span>
                                    <span className="font-semibold">{item.reservas.toLocaleString('pt-BR')}</span>
                                  </p>
                                  <p className="flex items-center justify-between gap-3">
                                    <span className="inline-flex items-center gap-2 text-slate-600">
                                      <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                                      Pré-reservas
                                    </span>
                                    <span className="font-semibold">{item.preReservas.toLocaleString('pt-BR')}</span>
                                  </p>
                                  <p className="flex items-center justify-between gap-3 border-t border-slate-100 pt-1">
                                    <span className="text-slate-500">Total</span>
                                    <span className="font-semibold">{total.toLocaleString('pt-BR')}</span>
                                  </p>
                                  <p className="flex items-center justify-between gap-3">
                                    <span className="text-slate-500">Participantes</span>
                                    <span className="font-semibold">{participantesTotal.toLocaleString('pt-BR')}</span>
                                  </p>
                                </div>
                              </div>

                              <span className="mt-1 text-[10px] font-medium text-slate-500">
                                {dayjs(item.data).format('DD')}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3 text-xs font-semibold text-slate-500">
                <span className="inline-flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-blue-600" />
                  Confirmadas
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                  Pré-reservas
                </span>
              </div>
            </article>

            <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">Dados por atividade</h3>
                  <p className="text-sm text-slate-500">Dados completos por atividade no período.</p>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <select
                    value={dashboardAtividadeMetrica}
                    onChange={(e) =>
                      setDashboardAtividadeMetrica(
                        e.target.value as 'faturamento' | 'confirmadas' | 'pre_reservas' | 'participantes'
                      )
                    }
                    className="rounded-full border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  >
                    <option value="faturamento" disabled={dashboardCensurar}>Faturamento</option>
                    <option value="confirmadas">Confirmadas</option>
                    <option value="pre_reservas">Pré-reservas</option>
                    <option value="participantes">Participantes (total)</option>
                  </select>

                  <input
                    value={dashboardAtividadeFiltro}
                    onChange={(e) => setDashboardAtividadeFiltro(e.target.value)}
                    placeholder="Filtrar atividade..."
                    className="rounded-full border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                </div>
              </div>

              <p className="mt-3 text-xs font-semibold uppercase text-slate-400">
                Exibindo {dashboardAtividadesFiltradas.length.toLocaleString('pt-BR')} de{' '}
                {dashboardMetricas.porPacote.length.toLocaleString('pt-BR')} atividades
              </p>

              <div className="mt-4 overflow-x-auto">
                {(() => {
                  const chartHeight = 140;
                  const cor =
                    dashboardAtividadeMetrica === 'faturamento'
                      ? 'bg-blue-600'
                      : dashboardAtividadeMetrica === 'confirmadas'
                        ? 'bg-emerald-600'
                        : dashboardAtividadeMetrica === 'pre_reservas'
                          ? 'bg-amber-500'
                          : 'bg-indigo-600';

                  const valores = dashboardAtividadesOrdenadas.map((item) =>
                    obterValorMetricaDashboard(dashboardAtividadeMetrica, item)
                  );
                  const maxValor = Math.max(0, ...valores);

                  if (dashboardAtividadesOrdenadas.length === 0) {
                    return <p className="text-sm text-slate-500">Nenhuma atividade encontrada.</p>;
                  }

                  return (
                    <div className="relative min-w-max pb-2">
                      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
                        {Array.from({ length: 5 }).map((_, idx) => (
                          <div key={idx} className="border-t border-slate-100" />
                        ))}
                      </div>

                      <div className="relative flex items-end gap-3 min-w-max">
                        {dashboardAtividadesOrdenadas.map((item) => {
                          const valor = obterValorMetricaDashboard(dashboardAtividadeMetrica, item);
                          const altura = maxValor > 0 ? Math.round((valor / maxValor) * chartHeight) : 0;
                          const participantesTotal = item.participantes + item.participantesPreReservas;
                          const ticket = item.reservas > 0 ? item.valor / item.reservas : 0;

                          return (
                            <div key={item.nome} className="group relative flex w-20 flex-col items-center">
                              <div style={{ height: `${chartHeight}px` }} className="flex items-end">
                                {valor > 0 ? (
                                  <div
                                    className={`w-12 rounded-t ${cor}`}
                                    style={{ height: `${Math.max(2, altura)}px` }}
                                  />
                                ) : (
                                  <div className="w-12 rounded-t bg-slate-200" style={{ height: '2px' }} />
                                )}
                              </div>

                              <div className="pointer-events-none absolute -top-2 left-1/2 z-10 w-64 -translate-x-1/2 -translate-y-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 opacity-0 shadow-lg transition group-hover:opacity-100">
                                <p className="font-semibold text-slate-900">{item.nome}</p>
                                <div className="mt-1 space-y-0.5">
                                  <p className="flex items-center justify-between gap-3">
                                    <span className="text-slate-500">Faturamento</span>
                                    <span className="font-semibold">{dashboardCensurar ? '••••' : formatCurrency(item.valor)}</span>
                                  </p>
                                  <p className="flex items-center justify-between gap-3">
                                    <span className="text-slate-500">Confirmadas</span>
                                    <span className="font-semibold">{item.reservas.toLocaleString('pt-BR')}</span>
                                  </p>
                                  <p className="flex items-center justify-between gap-3">
                                    <span className="text-slate-500">Pré-reservas</span>
                                    <span className="font-semibold">{item.preReservas.toLocaleString('pt-BR')}</span>
                                  </p>
                                  <p className="flex items-center justify-between gap-3">
                                    <span className="text-slate-500">Participantes</span>
                                    <span className="font-semibold">{participantesTotal.toLocaleString('pt-BR')}</span>
                                  </p>
                                  <p className="flex items-center justify-between gap-3 border-t border-slate-100 pt-1">
                                    <span className="text-slate-500">Ticket médio</span>
                                    <span className="font-semibold">{dashboardCensurar ? '••••' : formatCurrency(ticket)}</span>
                                  </p>
                                </div>
                              </div>

                              <span
                                title={item.nome}
                                className="mt-2 w-20 truncate text-center text-[10px] font-medium text-slate-500"
                              >
                                {item.nome}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </article>

            <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2">
              {dashboardCensurar ? (
                <>
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900">Dados por cliente</h3>
                      <p className="text-sm text-slate-500">Clientes e valores censurados.</p>
                    </div>
                  </div>

                  <div className="mt-4 flex min-h-[180px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                    Informações de clientes ocultas. Clique no ícone de olho para exibir.
                  </div>
                </>
              ) : (
                <>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900">Dados por cliente</h3>
                      <p className="text-sm text-slate-500">Dados completos por cliente no período.</p>
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <select
                        value={dashboardClienteMetrica}
                        onChange={(e) =>
                          setDashboardClienteMetrica(
                            e.target.value as 'faturamento' | 'confirmadas' | 'pre_reservas' | 'participantes'
                          )
                        }
                        className="rounded-full border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                      >
                        <option value="faturamento" disabled={dashboardCensurar}>Faturamento</option>
                        <option value="confirmadas">Confirmadas</option>
                        <option value="pre_reservas">Pré-reservas</option>
                        <option value="participantes">Participantes (total)</option>
                      </select>

                      <input
                        value={dashboardClienteFiltro}
                        onChange={(e) => setDashboardClienteFiltro(e.target.value)}
                        placeholder="Filtrar cliente, CPF ou telefone..."
                        className="rounded-full border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                      />
                    </div>
                  </div>

                  <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs font-semibold uppercase text-slate-400">
                      Exibindo {dashboardClientesParaGrafico.length.toLocaleString('pt-BR')} de{' '}
                      {dashboardClientesOrdenados.length.toLocaleString('pt-BR')} clientes
                      {!dashboardMostrarTodosClientes && dashboardClienteFiltro.trim().length === 0 ? ' (top 30)' : ''}
                    </p>

                    <button
                      type="button"
                      onClick={() => setDashboardMostrarTodosClientes((prev) => !prev)}
                      className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50"
                    >
                      {dashboardMostrarTodosClientes ? 'Mostrar top 30' : 'Mostrar todos'}
                    </button>
                  </div>

                  <div className="mt-4 overflow-x-auto">
                    {(() => {
                      const chartHeight = 140;
                      const cor =
                        dashboardClienteMetrica === 'faturamento'
                          ? 'bg-blue-600'
                          : dashboardClienteMetrica === 'confirmadas'
                            ? 'bg-emerald-600'
                            : dashboardClienteMetrica === 'pre_reservas'
                              ? 'bg-amber-500'
                              : 'bg-indigo-600';

                      const valores = dashboardClientesParaGrafico.map((item) =>
                        obterValorMetricaDashboard(dashboardClienteMetrica, item)
                      );
                      const maxValor = Math.max(0, ...valores);

                      if (dashboardClientesParaGrafico.length === 0) {
                        return <p className="text-sm text-slate-500">Nenhum cliente encontrado.</p>;
                      }

                      return (
                        <div className="relative min-w-max pb-2">
                          <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
                            {Array.from({ length: 5 }).map((_, idx) => (
                              <div key={idx} className="border-t border-slate-100" />
                            ))}
                          </div>

                          <div className="relative flex items-end gap-3 min-w-max">
                            {dashboardClientesParaGrafico.map((item) => {
                              const valor = obterValorMetricaDashboard(dashboardClienteMetrica, item);
                              const altura = maxValor > 0 ? Math.round((valor / maxValor) * chartHeight) : 0;
                              const participantesTotal = item.participantes + item.participantesPreReservas;
                              const ticket = item.reservas > 0 ? item.valor / item.reservas : 0;
                              const identificador = item.cpf || item.telefone || item.chave;
                              const label = (item.nome || identificador || '---').split(' ')[0];

                              return (
                                <div key={identificador} className="group relative flex w-16 flex-col items-center">
                                  <div style={{ height: `${chartHeight}px` }} className="flex items-end">
                                    {valor > 0 ? (
                                      <div
                                        className={`w-10 rounded-t ${cor}`}
                                        style={{ height: `${Math.max(2, altura)}px` }}
                                      />
                                    ) : (
                                      <div className="w-10 rounded-t bg-slate-200" style={{ height: '2px' }} />
                                    )}
                                  </div>

                                  <div className="pointer-events-none absolute -top-2 left-1/2 z-10 w-72 -translate-x-1/2 -translate-y-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 opacity-0 shadow-lg transition group-hover:opacity-100">
                                    <p className="font-semibold text-slate-900">{item.nome || '---'}</p>
                                    <p className="mt-0.5 text-[11px] text-slate-500">{item.cpf || item.telefone || '---'}</p>
                                    <div className="mt-1 space-y-0.5">
                                      <p className="flex items-center justify-between gap-3">
                                        <span className="text-slate-500">Faturamento</span>
                                        <span className="font-semibold">{formatCurrency(item.valor)}</span>
                                      </p>
                                      <p className="flex items-center justify-between gap-3">
                                        <span className="text-slate-500">Confirmadas</span>
                                        <span className="font-semibold">{item.reservas.toLocaleString('pt-BR')}</span>
                                      </p>
                                      <p className="flex items-center justify-between gap-3">
                                        <span className="text-slate-500">Pré-reservas</span>
                                        <span className="font-semibold">{item.preReservas.toLocaleString('pt-BR')}</span>
                                      </p>
                                      <p className="flex items-center justify-between gap-3">
                                        <span className="text-slate-500">Participantes</span>
                                        <span className="font-semibold">{participantesTotal.toLocaleString('pt-BR')}</span>
                                      </p>
                                      <p className="flex items-center justify-between gap-3 border-t border-slate-100 pt-1">
                                        <span className="text-slate-500">Ticket médio</span>
                                        <span className="font-semibold">{formatCurrency(ticket)}</span>
                                      </p>
                                    </div>
                                  </div>

                                  <span
                                    title={item.nome || identificador}
                                    className="mt-2 w-16 truncate text-center text-[10px] font-medium text-slate-500"
                                  >
                                    {label}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </>
              )}
            </article>
          </div>

        </section>

      )}



      {/* ========== Reservas ========== */}

      {aba === 'reservas' && (

        <section className="admin-tab-content space-y-6">

          <AdminTabHeader
            title={`Reservas de ${dayjs(selectedDate).format('DD/MM/YYYY')}`}
            description="Resumo em tempo real das reservas do dia."
            icon={FaCalendarAlt}
            metrics={reservasResumoMetricas}
            metricsTitle="Painel do dia"
            metricsContainerClassName="admin-tab-hero__section-shell admin-tab-hero__section-shell--soft"
            metricsClassName="xl:grid-cols-4"
            collapsibleMetrics
            metricsStorageKey="reservas-painel-do-dia"
            toolbar={false && (
              <div className="admin-tab-hero__section-shell admin-tab-hero__section-shell--soft xl:mx-auto xl:w-full xl:max-w-5xl">
                <div className="admin-tab-hero__section-head">
                  <p className="admin-tab-hero__section-label">Filtros e acoes</p>
                  <p className="admin-tab-hero__section-caption">
                    Ajuste a visualizacao do dia e abra uma reserva manual sem sair desta agenda.
                  </p>
                </div>

                <div className="admin-tab-hero__controls-grid admin-tab-hero__controls-grid--reservas">
                  <button
                    type="button"
                    onClick={() => setMostrarCalendario((prev) => !prev)}
                    className="hidden admin-tab-action admin-tab-action--secondary admin-tab-hero__control-button"
                  >
                    <FaCalendarAlt className="h-4 w-4" />
                    <span>{mostrarCalendario ? 'Recolher calendário' : 'Mostrar calendário'}</span>
                  </button>

                  <label className="admin-tab-hero__field">
                    <select
                      value={filtroAtividade}
                      onChange={(e) => setFiltroAtividade(e.target.value)}
                      className="admin-tab-hero__field-input"
                    >
                      <option value="">Todas as atividades</option>
                      {opcoesFiltroAtividade.map((atividade) => (
                        <option key={atividade} value={atividade}>
                          {atividade}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="admin-tab-hero__field">
                    <select
                      value={filtroChegada}
                      onChange={(e) => setFiltroChegada(e.target.value as 'todos' | 'chegou' | 'nao')}
                      className="admin-tab-hero__field-input"
                    >
                      <option value="todos">Todos</option>
                      <option value="chegou">Chegou</option>
                      <option value="nao">Não chegou</option>
                    </select>
                  </label>

                  <button
                    type="button"
                    onClick={handleAddReserva}
                    className="admin-tab-action admin-tab-action--primary admin-tab-hero__control-button"
                  >
                    <FaPlus className="h-4 w-4" />
                    <span>Reserva manual</span>
                  </button>
                </div>
              </div>
            )}
            toolbarAfterMetrics
          />

          <div className="admin-reservas-controls-card admin-tab-hero__section-shell admin-tab-hero__section-shell--soft">
            {totalFiltrosAtivosReservas > 0 && (
              <div className="admin-reservas-controls-head">
                <button
                  type="button"
                  onClick={limparFiltrosReservas}
                  className="admin-reservas-controls-clear"
                >
                  Limpar filtros
                </button>
              </div>
            )}

            <div className="admin-reservas-controls-grid">
              <button
                type="button"
                onClick={() => setMostrarCalendario((prev) => !prev)}
                className="admin-tab-action admin-tab-action--secondary admin-tab-hero__control-button"
              >
                <FaCalendarAlt className="h-4 w-4" />
                <span>{mostrarCalendario ? 'Recolher calendario' : 'Mostrar calendario'}</span>
              </button>

              <label className="admin-tab-hero__field">
                <select
                  aria-label="Filtrar por atividade"
                  value={filtroAtividade}
                  onChange={(e) => setFiltroAtividade(e.target.value)}
                  className="admin-tab-hero__field-input"
                >
                  <option value="">Todas as atividades</option>
                  {opcoesFiltroAtividade.map((atividade) => (
                    <option key={atividade} value={atividade}>
                      {atividade}
                    </option>
                  ))}
                </select>
              </label>

              <label className="admin-tab-hero__field">
                <select
                  aria-label="Filtrar por chegada"
                  value={filtroChegada}
                  onChange={(e) => setFiltroChegada(e.target.value as 'todos' | 'chegou' | 'nao')}
                  className="admin-tab-hero__field-input"
                >
                  <option value="todos">Todos</option>
                  <option value="chegou">Chegou</option>
                  <option value="nao">Nao chegou</option>
                </select>
              </label>

              <label className="admin-tab-hero__field">
                <select
                  aria-label="Filtrar por status"
                  value={filtroStatusReserva}
                  onChange={(e) => setFiltroStatusReserva(e.target.value as 'todos' | 'confirmadas' | 'pre_reservas')}
                  className="admin-tab-hero__field-input"
                >
                  <option value="todos">Todos os status</option>
                  <option value="confirmadas">Confirmadas</option>
                  <option value="pre_reservas">Pre-reservas</option>
                </select>
              </label>

              <label className="admin-tab-hero__field">
                <select
                  aria-label="Filtrar por origem"
                  value={filtroOrigemReserva}
                  onChange={(e) => setFiltroOrigemReserva(e.target.value as OrigemReservaFiltro)}
                  className="admin-tab-hero__field-input"
                >
                  <option value="todas">Todas as reservas</option>
                  <option value="manual">Reservas manuais</option>
                  <option value="checkout">Pagas pelo checkout</option>
                </select>
              </label>

              <label className="admin-tab-hero__field">
                <select
                  aria-label="Filtrar por perfil da reserva"
                  value={filtroPerfilReserva}
                  onChange={(e) => setFiltroPerfilReserva(e.target.value as 'todos' | 'educativo' | 'padrao')}
                  className="admin-tab-hero__field-input"
                >
                  <option value="todos">Perfil: todos</option>
                  <option value="educativo">Educativo</option>
                  <option value="padrao">Padrao</option>
                </select>
              </label>

              <button
                type="button"
                onClick={handleAddReserva}
                className="admin-tab-action admin-tab-action--primary admin-tab-hero__control-button admin-reservas-controls-grid__primary"
              >
                <FaPlus className="h-4 w-4" />
                <span>Reserva manual</span>
              </button>

              <button
                type="button"
                onClick={() => setModalResumoDia(true)}
                className="admin-tab-action admin-tab-hero__control-button"
              >
                <FaListUl className="h-4 w-4" />
                <span>Ver resumo</span>
              </button>
            </div>
          </div>

          <div className="admin-reservas-overview admin-tab-hero__section-shell admin-tab-hero__section-shell--soft">
            <div className="admin-reservas-overview__headline">
              <div className="admin-reservas-overview__headline-icon">
                <FaClipboardList className="h-5 w-5" />
              </div>
              <div className="admin-reservas-overview__headline-copy">
                <span className="admin-reservas-overview__eyebrow">Resumo filtrado</span>
                <strong>{reservasAgendaResumo.totalReservas.toLocaleString('pt-BR')} reserva{reservasAgendaResumo.totalReservas !== 1 ? 's' : ''}</strong>
                <p>
                  {reservasAgendaResumo.gruposTotal.toLocaleString('pt-BR')} horario{reservasAgendaResumo.gruposTotal !== 1 ? 's' : ''} · {reservasAgendaResumo.totalParticipantes.toLocaleString('pt-BR')} participante{reservasAgendaResumo.totalParticipantes !== 1 ? 's' : ''}
                </p>
              </div>
            </div>

            <div className="admin-reservas-overview__metrics">
              <div className="admin-reservas-overview__metric">
                <span><FaClock className="h-3.5 w-3.5" />Primeiro horario</span>
                <strong>{reservasAgendaResumo.primeiroHorario}</strong>
              </div>
              <div className="admin-reservas-overview__metric">
                <span><FaCheck className="h-3.5 w-3.5" />Chegadas</span>
                <strong>{reservasAgendaResumo.totalChegadas.toLocaleString('pt-BR')}</strong>
              </div>
              <div className="admin-reservas-overview__metric">
                <span><FaClock className="h-3.5 w-3.5" />Pendentes</span>
                <strong>{reservasAgendaResumo.totalPendentes.toLocaleString('pt-BR')}</strong>
              </div>
              <div className="admin-reservas-overview__metric">
                <span><FaQrcode className="h-3.5 w-3.5" />Checkout</span>
                <strong>{reservasAgendaResumo.totalCheckout.toLocaleString('pt-BR')}</strong>
              </div>
              <div className="admin-reservas-overview__metric">
                <span><FaClipboardList className="h-3.5 w-3.5" />Manual</span>
                <strong>{reservasAgendaResumo.totalManuais.toLocaleString('pt-BR')}</strong>
              </div>
            </div>
          </div>

          <div className={`grid gap-6 ${mostrarCalendario ? 'lg:grid-cols-[320px_minmax(0,1fr)]' : 'lg:grid-cols-1'}`}>

            {mostrarCalendario && (
              <div className="relative lg:min-w-0">
                <button
                  type="button"
                  onClick={() => setMostrarCalendario(false)}
                  className="hidden"
                >
                  <FaCalendarAlt className="h-4 w-4" />
                  <span>Recolher calendario</span>
                </button>

                <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">

                <div className="flex items-center justify-between">

                  <button

                    type="button"

                    onClick={() => changeMonth(-1)}

                    className="rounded-full border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"

                  >

                    <FaChevronLeft className="h-4 w-4" />

                  </button>

                  <h2 className="text-sm font-semibold text-slate-700">

                    {dayjs(new Date(currentYear, currentMonth)).format('MMMM [de] YYYY')}

                  </h2>

                  <button

                    type="button"

                    onClick={() => changeMonth(1)}

                    className="rounded-full border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"

                  >

                    <FaChevronRight className="h-4 w-4" />

                  </button>

                </div>

                <div className="mt-4 grid grid-cols-7 gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">

                  {diasDaSemanaCurto.map((dia) => (

                    <span key={dia} className="text-center">{dia}</span>

                  ))}

                </div>

                <div className="mt-2 grid grid-cols-7 gap-2 text-sm">

                  {days.map((day, idx) => {
                    const dataCalendario = day
                      ? dayjs(new Date(currentYear, currentMonth, day)).format('YYYY-MM-DD')
                      : '';
                    const totalReservasNoDia = dataCalendario
                      ? indicadoresReservasCalendario[dataCalendario] ?? 0
                      : 0;
                    const temReservasNoDia = totalReservasNoDia > 0;

                    const isSelected =

                      !!day &&

                      selectedDate.getDate() === day &&

                      selectedDate.getMonth() === currentMonth &&

                      selectedDate.getFullYear() === currentYear;

                    const buttonClass = !day
                      ? 'cursor-default text-slate-300'
                      : isSelected
                        ? temReservasNoDia
                          ? 'bg-emerald-600 text-white shadow-sm ring-4 ring-emerald-100'
                          : 'bg-rose-500 text-white shadow-sm ring-4 ring-rose-100'
                        : temReservasNoDia
                          ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                          : 'bg-rose-50 text-rose-600 hover:bg-rose-100';

                    return (

                      <button

                        key={idx}

                        type="button"

                        disabled={!day}

                        className={`flex h-10 items-center justify-center rounded-full text-xs font-medium transition ${buttonClass}`}

                        title={
                          !day
                            ? undefined
                            : temReservasNoDia
                              ? `${totalReservasNoDia} reserva(s) neste dia`
                              : 'Nenhuma reserva neste dia'
                        }

                        onClick={() => day && setSelectedDate(new Date(currentYear, currentMonth, day))}

                      >

                        {day || ''}

                      </button>

                    );

                  })}

                </div>

                <p className="mt-4 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">

                  Dia selecionado: <span className="font-semibold text-slate-700">{dayjs(selectedDate).format('DD/MM/YYYY')}</span>

                </p>

                <button

                  onClick={() => setModalDisponibilidade(true)}

                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-3 py-2 text-sm font-medium text-orange-700 transition hover:bg-orange-100"

                >

                  <FaEdit className="h-4 w-4" />

                  Editar disponibilidade

                </button>

                  </article>
                  <button
                    type="button"
                    onClick={() => setMostrarCalendario(false)}
                    className="hidden"
                    aria-label="Recolher calendário"
                    title="Recolher calendário"
                  >
                    <FaChevronLeft className="h-4 w-4" />
                  </button>
              </div>
            )}



            <div className="relative min-w-0">
              {!mostrarCalendario && (
                <button
                  type="button"
                  onClick={() => setMostrarCalendario(true)}
                  className="hidden"
                  aria-label="Mostrar calendário"
                  title="Mostrar calendário"
                >
                  <FaChevronRight className="h-4 w-4" />
                </button>
              )}

              {!mostrarCalendario && (
                <div className="hidden">
                  <button
                    type="button"
                    onClick={() => setMostrarCalendario(true)}
                    className="admin-tab-action admin-tab-action--secondary"
                    aria-label="Mostrar calendario"
                    title="Mostrar calendario"
                  >
                    <FaCalendarAlt className="h-4 w-4" />
                    <span>Mostrar calendario</span>
                  </button>
                </div>
              )}

              <article className="admin-reservas-panel overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">

              {false && <div className="flex flex-col gap-4 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">

                <div>

                  <h3 className="text-lg font-semibold text-slate-900">

                    Reservas de {dayjs(selectedDate).format('DD/MM/YYYY')}

                  </h3>

                  <p className="text-sm text-slate-500">Resumo em tempo real das reservas do dia.</p>

                </div>

                <div className="flex flex-wrap items-start gap-3 sm:items-center sm:gap-4">

                  <button
                    type="button"
                    onClick={() => setMostrarCalendario((prev) => !prev)}
                    className="inline-flex items-center gap-2 self-start rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50 whitespace-nowrap sm:self-auto"
                  >
                    <FaCalendarAlt className="h-4 w-4" />
                    {mostrarCalendario ? 'Recolher calendário' : 'Mostrar calendário'}
                  </button>

                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2">

                    <select

                      value={filtroAtividade}

                      onChange={(e) => setFiltroAtividade(e.target.value)}

                      className="flex-1 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"

                    >

                      <option value="">Todas as atividades</option>

                      {opcoesFiltroAtividade.map((atividade) => (

                        <option key={atividade} value={atividade}>{atividade}</option>

                      ))}

                    </select>

                    <select

                      value={filtroChegada}

                      onChange={(e) => setFiltroChegada(e.target.value as 'todos' | 'chegou' | 'nao')}

                      className="flex-1 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"

                    >

                      <option value="todos">Chegada: todos</option>

                      <option value="chegou">Chegou</option>

                      <option value="nao">Não chegou</option>

                    </select>

                  </div>

                  <button

                    onClick={handleAddReserva}

                    className="flex items-center gap-2 self-start rounded-full bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 whitespace-nowrap sm:self-auto sm:ml-2"

                  >

                    <FaPlus className="h-4 w-4" />

                    Reserva manual

                  </button>

                </div>

              </div>}

              <div className="hidden">

                <div className="admin-reservas-board overflow-x-auto">

                  <table className="admin-reservas-table w-full text-sm">

                    <thead className="admin-reservas-table__head text-xs font-semibold uppercase tracking-wide text-slate-500">

                      <tr>
                        <th className="px-5 py-4 text-left w-[30%]"><span className="inline-flex items-center gap-2"><FaUserCircle className="h-3.5 w-3.5" />Reserva</span></th>
                        <th className="px-5 py-4 text-left w-[19%]"><span className="inline-flex items-center gap-2"><FaUsers className="h-3.5 w-3.5" />Participantes</span></th>
                        <th className="px-5 py-4 text-left w-[7%]"><span className="inline-flex items-center gap-2"><FaPaw className="h-3.5 w-3.5" />Pet</span></th>
                        <th className="px-5 py-4 text-left w-[12%]"><span className="inline-flex items-center gap-2"><FaQuestionCircle className="h-3.5 w-3.5" />Respostas</span></th>
                        <th className="px-5 py-4 text-left w-[15%]"><span className="inline-flex items-center gap-2"><FaLayerGroup className="h-3.5 w-3.5" />Pacote</span></th>
                        <th className="px-5 py-4 text-left w-[9%]"><span className="inline-flex items-center gap-2"><FaMoneyBillWave className="h-3.5 w-3.5" />Valor</span></th>
                        <th className="px-5 py-4 text-left w-[8%]"><span className="inline-flex items-center gap-2"><FaEllipsisV className="h-3.5 w-3.5" />Acoes</span></th>
                      </tr>

                    </thead>

                    <tbody className="admin-reservas-table__body">

                      {Object.keys(reservas).length === 0 ? (

                        <tr>
                          <td colSpan={7} className="px-6 py-12 text-center text-sm text-slate-500">
                            Nenhuma reserva encontrada para esta data.
                          </td>
                        </tr>

                      ) : (

                        Object.keys(reservas)
                          .sort((a, b) => {
                            const aIndefinido = a.toLowerCase().includes('especificado');
                            const bIndefinido = b.toLowerCase().includes('especificado');
                            if (aIndefinido && !bIndefinido) return 1;
                            if (!aIndefinido && bIndefinido) return -1;
                            return compararHorariosComIndefinidosNoFim(a, b);
                          })
                          .map((horario) => {
                            const reservasPorHorario = reservas[horario];
                            const filtradas = reservasPorHorario.filter(reservaAtendeFiltrosAgenda);

                            if (filtradas.length === 0) return null;

                            const totalPessoas = filtradas.reduce(
                              (acc, reserva) => acc + calcularParticipantes(reserva),
                              0
                            );
                            const totalReservasHorario = filtradas.length;
                            const totalChegadasHorario = filtradas.filter(
                              (reserva) => reserva.chegou === true
                            ).length;

                            const tituloHorario = horario.toLowerCase().includes('especificado')
                              ? 'Sem horario definido'
                              : horario;

                            return (
                              <React.Fragment key={`premium-desktop-${horario}`}>
                                <tr className="admin-reservas-table__group-row">
                                  <td colSpan={7} className="px-6 py-4">
                                    <div className="admin-reservas-group">
                                      <div className="admin-reservas-group__title">
                                        <span className="admin-reservas-group__icon">
                                          <FaClock className="h-4 w-4" />
                                        </span>
                                        <div className="admin-reservas-group__title-copy">
                                          <span className="admin-reservas-group__eyebrow">Horario</span>
                                          <p className="admin-reservas-group__time">{tituloHorario}</p>
                                        </div>
                                      </div>

                                      <div className="admin-reservas-group__meta">
                                        <ReservaHorarioResumo
                                          participantes={totalPessoas}
                                          reservas={totalReservasHorario}
                                          chegadas={totalChegadasHorario}
                                        />
                                      </div>
                                    </div>
                                  </td>
                                </tr>

                                {filtradas.map((reserva) => {
                                  const participantes = calcularParticipantes(reserva);
                                  const resumoParticipantes = montarResumoParticipantes(reserva);
                                  const confirmada = statusEhConfirmado(reserva);
                                  const mesasDaReserva = Array.isArray(reserva.mesasSelecionadas) ? reserva.mesasSelecionadas : [];
                                  const chegou = reserva.chegou === true;
                                  const reservaToneClass = chegou
                                    ? 'admin-reservas-tone--arrived'
                                    : confirmada
                                      ? 'admin-reservas-tone--confirmed'
                                      : statusEhPreReserva(reserva)
                                        ? 'admin-reservas-tone--pre'
                                        : 'admin-reservas-tone--default';
                                  const pacoteDescricao = formatarPacote(reserva);
                                  const pacotesEtiquetas = quebrarPacoteEmEtiquetas(pacoteDescricao);
                                  const valorFormatado = formatarValor(reserva.valor);
                                  const telefoneExibicao = reserva.telefone?.trim() || 'Sem telefone';
                                  const podeEnviarWhatsapp = Boolean(normalizarTelefoneWhatsapp(reserva.telefone));
                                  const reservaManual = reserva.origem === 'manual';
                                  const reservaKey = reserva.id ?? `${reserva.nome || 'reserva'}-${reserva.cpf || 'cpf'}-${reserva.horario}-${normalizarDataReserva(reserva.data)}`;
                                  const perguntasRespondidas = obterPerguntasComResposta(reserva);
                                  const apresentacaoReserva = obterApresentacaoReserva(reserva, participantes);
                                  const IconeReserva = apresentacaoReserva.Icon;

                                  return (
                                    <React.Fragment key={`premium-desktop-${reservaKey}`}>
                                      <tr className={`admin-reservas-table__row ${reservaToneClass}`}>
                                        <td className="admin-reservas-table__cell px-5 py-5">
                                          <div className="admin-reservas-identity">
                                            <span className="admin-reservas-avatar" title={apresentacaoReserva.label}>
                                              <IconeReserva className="h-5 w-5" />
                                            </span>

                                            <div className="min-w-0 flex-1">
                                              <div className="admin-reservas-identity-card">
                                                <div className="admin-reservas-identity-card__title-row">
                                                  <p className="admin-reservas-identity-card__title">{reserva.nome || '---'}</p>
                                                  {reservaManual && (
                                                    <span className="admin-reservas-origin-badge">
                                                      <FaClipboardList className="h-3 w-3" />
                                                      <span>Manual</span>
                                                    </span>
                                                  )}
                                                </div>

                                                <div className="admin-reservas-identity-card__meta">
                                                  <span className="admin-reservas-identity-card__item">
                                                    <FaPhoneAlt className="h-3 w-3" />
                                                    <span>{telefoneExibicao}</span>
                                                  </span>
                                                  <span className="admin-reservas-identity-card__item">
                                                    <FaClock className="h-3 w-3" />
                                                    <span>{tituloHorario}</span>
                                                  </span>
                                                  <span className="admin-reservas-identity-card__item">
                                                    <FaIdCard className="h-3 w-3" />
                                                    <span>CPF: {formatarCpfExibicao(reserva.cpf)}</span>
                                                  </span>
                                                </div>
                                              </div>

                                              {mesasDaReserva.length > 0 && (
                                                <div className="admin-reservas-chip-list mt-3">
                                                  {mesasDaReserva.map((mesa) => (
                                                    <span key={`${reservaKey}-${mesa.id}`} className="admin-reservas-chip admin-reservas-chip--soft">
                                                      <FaChair className="h-3 w-3" />
                                                      {mesa.area} - {mesa.nome} ({mesa.capacidade})
                                                    </span>
                                                  ))}
                                                </div>
                                              )}
                                            </div>
                                          </div>
                                        </td>

                                        <td className="admin-reservas-table__cell px-5 py-5">
                                          <div className="admin-reservas-box admin-reservas-box--participants">
                                            <div className="admin-reservas-box__stack admin-reservas-box__stack--participants">
                                              <div className="admin-reservas-box__header">
                                                <span className="admin-reservas-box__icon"><FaUsers className="h-4 w-4" /></span>
                                                <div className="admin-reservas-participants-total">
                                                  <strong>{participantes}</strong>
                                                  <span>pessoas</span>
                                                </div>
                                              </div>

                                              <ReservaParticipantesResumo itens={resumoParticipantes} />
                                            </div>
                                          </div>
                                        </td>

                                        <td className="admin-reservas-table__cell px-5 py-5">
                                          <div className={`admin-reservas-box admin-reservas-box--pet ${reserva.temPet ? 'is-active' : 'is-inactive'}`}>
                                            <div className="admin-reservas-box__stack admin-reservas-box__stack--pet">
                                              <PetStatusIndicator hasPet={reserva.temPet === true} compact />
                                            </div>
                                          </div>
                                        </td>

                                        <td className="admin-reservas-table__cell px-5 py-5">
                                          <div className="admin-reservas-box admin-reservas-box--answers">
                                            <div className="admin-reservas-box__stack admin-reservas-box__stack--answers">
                                              <span className="admin-reservas-box__icon"><FaQuestionCircle className="h-4 w-4" /></span>
                                              <ReservaPerguntasResumo perguntas={perguntasRespondidas} />
                                            </div>
                                          </div>
                                        </td>

                                        <td className="admin-reservas-table__cell px-5 py-5">
                                          <div className="admin-reservas-box admin-reservas-box--package">
                                            <div className="admin-reservas-box__stack admin-reservas-box__stack--package">
                                              <span className="admin-reservas-box__icon"><FaLayerGroup className="h-4 w-4" /></span>
                                              {pacotesEtiquetas.length > 0 ? (
                                                <div className="admin-reservas-package-pills admin-reservas-package-pills--stacked">
                                                  {pacotesEtiquetas.map((item) => (
                                                    <span key={`${reservaKey}-${item}`} className="admin-reservas-package-pill">
                                                      {item}
                                                    </span>
                                                  ))}
                                                </div>
                                              ) : (
                                                <p className="admin-reservas-box__value">---</p>
                                              )}
                                            </div>
                                          </div>
                                        </td>

                                        <td className="admin-reservas-table__cell px-5 py-5">
                                          <div className="admin-reservas-box admin-reservas-box--value">
                                            <div className="admin-reservas-box__stack admin-reservas-box__stack--compact">
                                              <span className="admin-reservas-box__icon"><FaMoneyBillWave className="h-4 w-4" /></span>
                                              <p className="admin-reservas-box__value admin-reservas-box__value--amount admin-reservas-box__value--centered">
                                                {valorFormatado}
                                              </p>
                                            </div>
                                          </div>
                                        </td>

                                        <td className="admin-reservas-table__cell px-5 py-5">
                                          <div className="admin-reservas-actions admin-reservas-actions--rail">
                                            <button
                                              type="button"
                                              onClick={() => toggleChegadaReserva(reserva)}
                                              className={`admin-reservas-action-btn admin-reservas-action-btn--icon ${chegou ? 'admin-reservas-action-btn--success' : ''}`}
                                              aria-label={chegou ? 'Marcar como nao chegou' : 'Marcar como chegou'}
                                              title={chegou ? 'Marcar como nao chegou' : 'Marcar como chegou'}
                                            >
                                              <FaCheck className="h-3.5 w-3.5" />
                                            </button>

                                            <button
                                              type="button"
                                              onClick={() => abrirEnvioWhatsapp(reserva, participantes, pacoteDescricao, valorFormatado)}
                                              disabled={!podeEnviarWhatsapp}
                                              className="admin-reservas-action-btn admin-reservas-action-btn--icon admin-reservas-action-btn--whatsapp"
                                              aria-label="Abrir WhatsApp"
                                              title="WhatsApp"
                                            >
                                              <FaWhatsapp className="h-3.5 w-3.5" />
                                            </button>

                                            {reserva.linkPagamento && (
                                              <button
                                                type="button"
                                                onClick={() => window.open(reserva.linkPagamento, '_blank')}
                                                className="admin-reservas-action-btn admin-reservas-action-btn--icon admin-reservas-action-btn--payment"
                                                aria-label="Concluir pagamento"
                                                title="Concluir pagamento"
                                              >
                                                <FaCreditCard className="h-3.5 w-3.5" />
                                              </button>
                                            )}

                                            <button
                                              type="button"
                                              onClick={() => handleEditReserva(reserva)}
                                              className="admin-reservas-action-btn admin-reservas-action-btn--icon admin-reservas-action-btn--neutral"
                                              aria-label="Editar reserva"
                                              title="Editar"
                                            >
                                              <FaEdit className="h-3.5 w-3.5" />
                                            </button>

                                            <button
                                              type="button"
                                              onClick={() => reserva.id && excluirReserva(reserva.id)}
                                              className="admin-reservas-action-btn admin-reservas-action-btn--icon admin-reservas-action-btn--danger"
                                              aria-label="Excluir reserva"
                                              title="Excluir"
                                            >
                                              <FaTrash className="h-3.5 w-3.5" />
                                            </button>
                                          </div>
                                        </td>
                                      </tr>
                                    </React.Fragment>
                                  );
                                })}
                              </React.Fragment>
                            );
                          })

                      )}

                    </tbody>

                  </table>

                </div>

              </div>

              {/* Desktop Table */}

              {false && (<div className="admin-reservas-board hidden lg:block overflow-x-auto">

                <table className="admin-reservas-table w-full text-sm">

                  <thead className="admin-reservas-table__head text-xs font-semibold uppercase tracking-wide text-slate-500">

                    <tr>

                      <th className="px-5 py-4 text-left w-[34%]"><span className="inline-flex items-center gap-2"><FaUserCircle className="h-3.5 w-3.5" />Reserva</span></th>

                      <th className="px-4 py-3 text-left">Nº Participantes</th>

                      <th className="px-5 py-4 text-left w-[8%]"><span className="inline-flex items-center gap-2"><FaPaw className="h-3.5 w-3.5" />Pet</span></th>

                      <th className="px-5 py-4 text-left w-[12%]"><span className="inline-flex items-center gap-2"><FaIdCard className="h-3.5 w-3.5" />Documento</span></th>

                      <th className="px-5 py-4 text-left w-[15%]"><span className="inline-flex items-center gap-2"><FaLayerGroup className="h-3.5 w-3.5" />Pacote</span></th>

                      <th className="px-5 py-4 text-left w-[10%]"><span className="inline-flex items-center gap-2"><FaMoneyBillWave className="h-3.5 w-3.5" />Valor</span></th>

                      <th className="px-4 py-3 text-right">Ações</th>

                    </tr>

                  </thead>

                  <tbody className="admin-reservas-table__body">

                    {Object.keys(reservas).length === 0 ? (

                      <tr>

                        <td colSpan={7} className="px-6 py-10 text-center text-sm text-slate-500">

                          Nenhuma reserva encontrada para esta data.

                        </td>

                      </tr>

                    ) : (

                      Object.keys(reservas)

                        .sort((a, b) => {

                          const aIndefinido = a.toLowerCase().includes('especificado');

                          const bIndefinido = b.toLowerCase().includes('especificado');

                          if (aIndefinido && !bIndefinido) return 1;

                          if (!aIndefinido && bIndefinido) return -1;

                          return compararHorariosComIndefinidosNoFim(a, b);

                        })

                        .map((horario) => {

                          const reservasPorHorario = reservas[horario];

                          const filtradas = reservasPorHorario.filter(reservaAtendeFiltrosAgenda);

                          if (filtradas.length === 0) return null;

                          const totalPessoas = filtradas.reduce(

                            (acc, reserva) => acc + calcularParticipantes(reserva),

                            0

                          );
                          const totalReservasHorario = filtradas.length;
                          const totalChegadasHorario = filtradas.filter(
                            (reserva) => reserva.chegou === true
                          ).length;

                          const tituloHorario = horario.toLowerCase().includes('especificado')

                            ? 'Sem horário definido'

                            : horario;

                          return (

                            <React.Fragment key={horario}>

                              <tr className="bg-slate-50/70">

                                <td colSpan={7} className="px-6 py-3 text-sm font-semibold text-slate-700">

                                  <div className="admin-reservas-group">

                                    <div className="admin-reservas-group__title">

                                      <span className="admin-reservas-group__icon">

                                        <FaClock className="h-4 w-4" />

                                      </span>

                                      <div className="admin-reservas-group__title-copy">

                                        <span className="admin-reservas-group__eyebrow">Horario</span>

                                        <p className="admin-reservas-group__time">{tituloHorario}</p>

                                      </div>

                                    </div>

                                    <div className="admin-reservas-group__meta">

                                      <ReservaHorarioResumo
                                        participantes={totalPessoas}
                                        reservas={totalReservasHorario}
                                        chegadas={totalChegadasHorario}
                                      />

                                    </div>

                                  </div>

                                </td>

                              </tr>

                              {filtradas.map((reserva) => {

                                const participantes = calcularParticipantes(reserva);

                                const resumoParticipantes = montarResumoParticipantes(reserva);

                                const confirmada = statusEhConfirmado(reserva);

                                const statusBadge = obterBadgeStatus(reserva);

                                const mesasDaReserva = Array.isArray(reserva.mesasSelecionadas) ? reserva.mesasSelecionadas : [];

                                const chegou = reserva.chegou === true;

                                const rowHighlightClass = chegou

                                  ? 'bg-emerald-100/70 border-emerald-300'

                                  : confirmada

                                    ? 'bg-emerald-50/50 border-emerald-200'

                                    : statusEhPreReserva(reserva)

                                      ? 'bg-amber-50/30 border-amber-200'

                                      : 'bg-white border-slate-200';

                            const pacoteDescricao = formatarPacote(reserva);
                            const pacotesEtiquetas = quebrarPacoteEmEtiquetas(pacoteDescricao);

                                const valorFormatado = formatarValor(reserva.valor);

                                const podeEnviarWhatsapp = Boolean(normalizarTelefoneWhatsapp(reserva.telefone));

                                const reservaKey = reserva.id ?? `${reserva.nome || 'reserva'}-${reserva.cpf || 'cpf'}-${reserva.horario}-${normalizarDataReserva(reserva.data)}`;

                                const perguntasRespondidas = obterPerguntasComResposta(reserva);

                                const possuiPerguntas = perguntasRespondidas.length > 0;

                                const destaquePerguntas = desejaJuntarMesa(reserva);

                                const detalhesAbertos = reservaDetalhesAberta === reservaKey;



                                return (

                                  <React.Fragment key={reservaKey}>

                                                                        <tr className={`transition hover:bg-slate-50/70 ${rowHighlightClass}`}>
                                      <td className="px-4 py-4">

                                        <div className="flex items-center gap-2">

                                          <span className="font-medium text-slate-900">{reserva.nome || '---'}</span>

                                          <span

                                            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusBadge.classes}`}

                                          >

                                            {statusBadge.label}

                                          </span>

                                          {possuiPerguntas && (

                                            <button

                                              type="button"

                                              onClick={() => toggleDetalhesReserva(reservaKey)}

                                              className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[11px] font-semibold transition ${

                                                detalhesAbertos

                                                  ? 'border-amber-400 bg-amber-50 text-amber-700'

                                                  : destaquePerguntas

                                                    ? 'border-amber-200 text-amber-600 hover:bg-amber-50'

                                                    : 'border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700'

                                              }`}

                                              aria-label="Ver respostas personalizadas"

                                              aria-pressed={detalhesAbertos}

                                            >

                                              <FaQuestionCircle className="h-3.5 w-3.5" />

                                              <span className="hidden sm:inline">

                                                {detalhesAbertos ? 'Fechar' : 'Respostas'}

                                              </span>

                                            </button>

                                          )}

                                        </div>

                                        {mesasDaReserva.length > 0 && (

                                          <div className="mt-2 flex flex-wrap gap-1">

                                            {mesasDaReserva.map((mesa) => (

                                              <span

                                                key={`${reservaKey}-${mesa.id}`}

                                                className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600"

                                              >

                                                <FaChair className="h-3 w-3 text-slate-400" />

                                                {mesa.area} - {mesa.nome} ({mesa.capacidade})

                                              </span>

                                            ))}

                                          </div>

                                        )}

                                      </td>

                                      <td className="px-4 py-4">

                                        <div className="text-xs space-y-0.5">

                                          {resumoParticipantes.length > 0 ? (

                                            resumoParticipantes.map((item) => (

                                              <div key={item.key}>

                                                {item.label}: <span className="font-medium">{item.quantidade}</span>

                                              </div>

                                            ))

                                          ) : (

                                            <div className="text-slate-400">Sem participantes.</div>

                                          )}

                                          <div className="border-t pt-0.5 mt-1 font-semibold text-slate-900">Total: {participantes}</div>

                                        </div>

                                      </td>

                                      <td className="px-4 py-4 text-center">

                                        <span className="text-xl">

                                          {reserva.temPet ? '🐕' : '❌'}

                                        </span>

                                      </td>

                                      <td className="px-4 py-4 text-slate-600 whitespace-nowrap">

                                        {reserva.cpf || '---'}

                                      </td>

                                      <td className="px-4 py-4">

                                        {pacoteDescricao === '---' ? (

                                          <span className="text-slate-500">---</span>

                                        ) : (

                                          <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-600">

                                            {pacoteDescricao}

                                          </span>

                                        )}

                                      </td>

                                      <td className="px-4 py-4 text-right font-medium text-slate-900">

                                        {valorFormatado}

                                      </td>

                                      <td className="px-4 py-4 text-right align-top">

                                        <div className="relative inline-block text-left">
                                          <button
                                            onClick={() =>
                                              setMenuReservaAberto((prev) => (prev === reservaKey ? null : reservaKey))
                                            }
                                            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-600 shadow-sm transition hover:bg-slate-50"
                                            aria-label="Abrir ações da reserva"
                                            aria-haspopup="true"
                                            aria-expanded={menuReservaAberto === reservaKey}
                                          >
                                            <FaEllipsisV className="h-4 w-4" />
                                          </button>
                                        </div>

                                        {menuReservaAberto === reservaKey && (
                                          <div
                                            className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 px-4 py-8 backdrop-blur-sm"
                                            onClick={() => setMenuReservaAberto(null)}
                                          >
                                            <div
                                              className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white shadow-2xl"
                                              onClick={(e) => e.stopPropagation()}
                                            >
                                              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                                                <p className="text-sm font-semibold text-slate-800">Ações da reserva</p>
                                                <button
                                                  onClick={() => setMenuReservaAberto(null)}
                                                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50"
                                                  aria-label="Fechar"
                                                >
                                                  ×
                                                </button>
                                              </div>

                                              <div className="divide-y divide-slate-100">
                                                <button
                                                  onClick={() => {
                                                    toggleChegadaReserva(reserva);
                                                    setMenuReservaAberto(null);
                                                  }}
                                                  className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-slate-800 transition hover:bg-slate-50"
                                                >
                                                  <FaCheck className="h-4 w-4 text-emerald-600" />
                                                  <span>{chegou ? 'Marcar como não chegou' : 'Marcar como chegou'}</span>
                                                </button>

                                                {reserva.linkPagamento && (
                                                  <button
                                                    onClick={() => {
                                                      window.open(reserva.linkPagamento, '_blank');
                                                      setMenuReservaAberto(null);
                                                    }}
                                                    className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-slate-800 transition hover:bg-slate-50"
                                                  >
                                                    <FaCreditCard className="h-4 w-4 text-orange-500" />
                                                    <span>Concluir pagamento</span>
                                                  </button>
                                                )}

                                                <button
                                                  onClick={() => {
                                                    abrirEnvioWhatsapp(reserva, participantes, pacoteDescricao, valorFormatado);
                                                    setMenuReservaAberto(null);
                                                  }}
                                                  disabled={!podeEnviarWhatsapp}
                                                  className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                                                >
                                                  <FaWhatsapp className="h-4 w-4 text-emerald-600" />
                                                  <span>WhatsApp</span>
                                                </button>

                                                <button
                                                  onClick={() => {
                                                    handleEditReserva(reserva);
                                                    setMenuReservaAberto(null);
                                                  }}
                                                  className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-slate-800 transition hover:bg-slate-50"
                                                >
                                                  <FaEdit className="h-4 w-4 text-blue-600" />
                                                  <span>Editar</span>
                                                </button>

                                                <button
                                                  onClick={() => {
                                                    if (reserva.id) {
                                                      excluirReserva(reserva.id);
                                                    }
                                                    setMenuReservaAberto(null);
                                                  }}
                                                  className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-rose-700 transition hover:bg-rose-50"
                                                >
                                                  <FaTrash className="h-4 w-4" />
                                                  <span>Excluir</span>
                                                </button>
                                              </div>
                                            </div>
                                          </div>
                                        )}

                                      </td>

                                    </tr>

                                    {detalhesAbertos && perguntasRespondidas.length > 0 && (

                                      <tr className="bg-amber-50/60">

                                        <td colSpan={7} className="px-6 pb-4">

                                          <div className="rounded-2xl border border-amber-200 bg-white p-4 shadow-sm">

                                            <div className="flex items-center justify-between gap-3">

                                              <p className="text-sm font-semibold text-slate-800">Respostas do cliente</p>

                                              <button

                                                type="button"

                                                onClick={() => toggleDetalhesReserva(reservaKey)}

                                                className="text-xs font-semibold text-amber-700 transition hover:text-amber-900"

                                              >

                                                Fechar

                                              </button>

                                            </div>

                                            <div className="mt-3">

                                              {renderPerguntasPersonalizadas(perguntasRespondidas)}

                                            </div>

                                          </div>

                                        </td>

                                      </tr>

                                    )}

                                  </React.Fragment>

                                );

                              })}

                            </React.Fragment>

                          );

                        })

                    )}

                  </tbody>

                </table>

              </div>)}

              

              {false && (<div className="lg:hidden space-y-4">

                {Object.keys(reservas).length === 0 ? (

                  <div className="rounded-[28px] border border-dashed border-slate-300 bg-white/80 px-6 py-10 text-center text-sm text-slate-500 shadow-sm">
                    Nenhuma reserva encontrada para esta data.
                  </div>

                ) : (

                  Object.keys(reservas)
                    .sort((a, b) => {
                      const aIndefinido = a.toLowerCase().includes('especificado');
                      const bIndefinido = b.toLowerCase().includes('especificado');
                      if (aIndefinido && !bIndefinido) return 1;
                      if (!aIndefinido && bIndefinido) return -1;
                      return compararHorariosComIndefinidosNoFim(a, b);
                    })
                    .map((horario) => {
                      const reservasPorHorario = reservas[horario];
                      const filtradas = reservasPorHorario.filter(reservaAtendeFiltrosAgenda);

                      if (filtradas.length === 0) return null;

                      const totalPessoas = filtradas.reduce(
                        (acc, reserva) => acc + calcularParticipantes(reserva),
                        0
                      );
                      const totalReservasHorario = filtradas.length;
                      const totalChegadasHorario = filtradas.filter(
                        (reserva) => reserva.chegou === true
                      ).length;

                      const tituloHorario = horario.toLowerCase().includes('especificado')
                        ? 'Sem horario definido'
                        : horario;

                      return (
                        <div key={`premium-mobile-${horario}`} className="space-y-3">

                          <div className="admin-reservas-mobile-group">
                            <div className="admin-reservas-group__title">
                              <span className="admin-reservas-group__icon">
                                <FaClock className="h-4 w-4" />
                              </span>
                              <div className="admin-reservas-group__title-copy">
                                <span className="admin-reservas-group__eyebrow">Horario</span>
                                <p className="admin-reservas-group__time">{tituloHorario}</p>
                              </div>
                            </div>

                            <div className="admin-reservas-group__meta">
                              <ReservaHorarioResumo
                                participantes={totalPessoas}
                                reservas={totalReservasHorario}
                                chegadas={totalChegadasHorario}
                              />
                            </div>
                          </div>

                          {filtradas.map((reserva) => {
                            const participantes = calcularParticipantes(reserva);
                            const resumoParticipantes = montarResumoParticipantes(reserva);
                            const confirmada = statusEhConfirmado(reserva);
                            const statusBadge = obterBadgeStatus(reserva);
                            const mesasDaReserva = Array.isArray(reserva.mesasSelecionadas) ? reserva.mesasSelecionadas : [];
                            const chegou = reserva.chegou === true;
                            const reservaToneClass = chegou
                              ? 'admin-reservas-tone--arrived'
                              : confirmada
                                ? 'admin-reservas-tone--confirmed'
                                : statusEhPreReserva(reserva)
                                  ? 'admin-reservas-tone--pre'
                                  : 'admin-reservas-tone--default';
                            const pacoteDescricao = formatarPacote(reserva);
                            const pacotesEtiquetas = quebrarPacoteEmEtiquetas(pacoteDescricao);
                            const valorFormatado = formatarValor(reserva.valor);
                            const podeEnviarWhatsapp = Boolean(normalizarTelefoneWhatsapp(reserva.telefone));
                            const reservaManual = reserva.origem === 'manual';
                            const reservaKey = reserva.id ?? `${reserva.nome || 'reserva'}-${reserva.cpf || 'cpf'}-${reserva.horario}-${normalizarDataReserva(reserva.data)}`;
                            const perguntasRespondidas = obterPerguntasComResposta(reserva);
                            const apresentacaoReserva = obterApresentacaoReserva(reserva, participantes);
                            const IconeReserva = apresentacaoReserva.Icon;

                            return (
                              <div key={`premium-mobile-${reservaKey}`} className={`admin-reserva-card ${reservaToneClass} overflow-hidden rounded-[32px] border p-5 shadow-sm`}>

                                <div className="admin-reserva-card__header">
                                  <div className="admin-reservas-identity">
                                    <span className="admin-reservas-avatar" title={apresentacaoReserva.label}><IconeReserva className="h-5 w-5" /></span>

                                    <div className="min-w-0 flex-1">
                                      <div className="admin-reservas-identity-card">
                                        <div className="admin-reservas-identity-card__title-row">
                                          <p className="admin-reservas-identity-card__title">{reserva.nome || '---'}</p>
                                          {reservaManual && (
                                            <span className="admin-reservas-origin-badge">
                                              <FaClipboardList className="h-3 w-3" />
                                              <span>Manual</span>
                                            </span>
                                          )}
                                        </div>

                                        <div className="admin-reservas-identity-card__meta">
                                          <span className="admin-reservas-identity-card__item">
                                            <FaPhoneAlt className="h-3 w-3" />
                                            <span>{reserva.telefone?.trim() || 'Sem telefone'}</span>
                                          </span>
                                          <span className="admin-reservas-identity-card__item">
                                            <FaClock className="h-3 w-3" />
                                            <span>{tituloHorario}</span>
                                          </span>
                                          <span className="admin-reservas-identity-card__item">
                                            <FaIdCard className="h-3 w-3" />
                                            <span>CPF: {formatarCpfExibicao(reserva.cpf)}</span>
                                          </span>
                                        </div>
                                      </div>
                                    </div>
                                  </div>

                                  <div className="admin-reservas-badges mt-4">
                                    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusBadge.classes}`}>
                                      {statusBadge.label}
                                    </span>
                                  </div>
                                </div>

                                <div className="admin-reserva-card__summary-grid mt-5">
                                  <div className="admin-reservas-box admin-reservas-box--participants">
                                    <div className="admin-reservas-box__stack admin-reservas-box__stack--participants">
                                      <div className="admin-reservas-box__header">
                                        <span className="admin-reservas-box__icon"><FaUsers className="h-4 w-4" /></span>
                                        <div className="admin-reservas-participants-total">
                                          <strong>{participantes}</strong>
                                          <span>pessoas</span>
                                        </div>
                                      </div>

                                      <ReservaParticipantesResumo itens={resumoParticipantes} compact />
                                    </div>
                                  </div>

                                  <div className="admin-reservas-box admin-reservas-box--value">
                                    <div className="admin-reservas-box__stack admin-reservas-box__stack--compact">
                                      <span className="admin-reservas-box__icon"><FaMoneyBillWave className="h-4 w-4" /></span>
                                      <p className="admin-reservas-box__value admin-reservas-box__value--amount admin-reservas-box__value--centered">{valorFormatado}</p>
                                    </div>
                                  </div>

                                  <div className={`admin-reservas-box admin-reservas-box--pet ${reserva.temPet ? 'is-active' : ''}`}>
                                    <div className="admin-reservas-box__stack admin-reservas-box__stack--pet">
                                      <PetStatusIndicator hasPet={reserva.temPet === true} compact />
                                    </div>
                                  </div>
                                </div>

                                <div className="admin-reserva-card__meta-grid mt-4">
                                  <div className="admin-reservas-box admin-reservas-box--answers admin-reserva-card__meta-grid-full">
                                    <div className="admin-reservas-box__stack admin-reservas-box__stack--answers">
                                      <span className="admin-reservas-box__icon"><FaQuestionCircle className="h-4 w-4" /></span>
                                      <ReservaPerguntasResumo perguntas={perguntasRespondidas} compact />
                                    </div>
                                  </div>

                                  <div className="admin-reservas-box admin-reservas-box--package admin-reserva-card__meta-grid-full">
                                    <div className="admin-reservas-box__stack admin-reservas-box__stack--package">
                                      <span className="admin-reservas-box__icon"><FaLayerGroup className="h-4 w-4" /></span>
                                      {pacotesEtiquetas.length > 0 ? (
                                        <div className="admin-reservas-package-pills admin-reservas-package-pills--stacked">
                                          {pacotesEtiquetas.map((item) => (
                                            <span key={`${reservaKey}-mobile-${item}`} className="admin-reservas-package-pill">
                                              {item}
                                            </span>
                                          ))}
                                        </div>
                                      ) : (
                                        <p className="admin-reservas-box__value">---</p>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                {mesasDaReserva.length > 0 && (
                                  <div className="admin-reservas-chip-list mt-4">
                                    {mesasDaReserva.map((mesa) => (
                                      <span key={`${reservaKey}-${mesa.id}-mobile`} className="admin-reservas-chip admin-reservas-chip--soft">
                                        <FaChair className="h-3 w-3" />
                                        {mesa.area} - {mesa.nome} ({mesa.capacidade})
                                      </span>
                                    ))}
                                  </div>
                                )}

                                <div className="admin-reserva-card__actions mt-5 border-t border-slate-200/80 pt-4">
                                  <div className="admin-reserva-card__actions-grid">
                                    <button type="button" onClick={() => toggleChegadaReserva(reserva)} className={`admin-reservas-action-btn ${chegou ? 'admin-reservas-action-btn--success' : ''}`}>
                                      <FaCheck className="h-3.5 w-3.5" />
                                      <span>{chegou ? 'Reverter chegada' : 'Marcar chegada'}</span>
                                    </button>

                                    <button type="button" onClick={() => abrirEnvioWhatsapp(reserva, participantes, pacoteDescricao, valorFormatado)} disabled={!podeEnviarWhatsapp} className="admin-reservas-action-btn admin-reservas-action-btn--whatsapp">
                                      <FaWhatsapp className="h-3.5 w-3.5" />
                                      <span>WhatsApp</span>
                                    </button>

                                    {reserva.linkPagamento && (
                                      <button type="button" onClick={() => window.open(reserva.linkPagamento, '_blank')} className="admin-reservas-action-btn admin-reservas-action-btn--payment">
                                        <FaCreditCard className="h-3.5 w-3.5" />
                                        <span>Pagamento</span>
                                      </button>
                                    )}

                                    <button type="button" onClick={() => handleEditReserva(reserva)} className="admin-reservas-action-btn admin-reservas-action-btn--neutral">
                                      <FaEdit className="h-3.5 w-3.5" />
                                      <span>Editar</span>
                                    </button>

                                    <button type="button" onClick={() => reserva.id && excluirReserva(reserva.id)} className="admin-reservas-action-btn admin-reservas-action-btn--danger">
                                      <FaTrash className="h-3.5 w-3.5" />
                                      <span>Excluir</span>
                                    </button>
                                  </div>
                                </div>

                              </div>
                            );
                          })}

                        </div>
                      );
                    })

                )}

              </div>)}

              {/* Reservation Cards */}

              <div className="admin-reservas-card-board space-y-5">

                {reservasAgendaResumo.totalReservas === 0 ? (

                  <div className="admin-reservas-empty-state">

                    Nenhuma reserva encontrada para esta data e filtros.

                  </div>

                ) : (

                  Object.keys(reservas)

                    .sort((a, b) => {

                      const aIndefinido = a.toLowerCase().includes('especificado');

                      const bIndefinido = b.toLowerCase().includes('especificado');

                      if (aIndefinido && !bIndefinido) return 1;

                      if (!aIndefinido && bIndefinido) return -1;

                      return compararHorariosComIndefinidosNoFim(a, b);

                    })

                    .map((horario) => {

                      const reservasPorHorario = reservas[horario];

                      const filtradas = reservasPorHorario.filter(reservaAtendeFiltrosAgenda);

                      if (filtradas.length === 0) return null;

                      const totalPessoas = filtradas.reduce(

                        (acc, reserva) => acc + calcularParticipantes(reserva),

                        0

                      );
                      const totalReservasHorario = filtradas.length;
                      const totalChegadasHorario = filtradas.filter(
                        (reserva) => reserva.chegou === true
                      ).length;

                      const tituloHorario = horario.toLowerCase().includes('especificado')

                        ? 'Sem horário definido'

                        : horario;

                      return (

                        <div key={horario} className="admin-reserva-slot">

                          <div className="admin-reserva-slot__header">
                            <div className="admin-reserva-slot__time">
                              <span className="admin-reserva-slot__icon">
                                <FaClock className="h-4 w-4" />
                              </span>
                              <div>
                                <span>Horario</span>
                                <strong>{tituloHorario}</strong>
                              </div>
                            </div>

                            <div className="admin-reserva-slot__totals" aria-label="Resumo do horario">
                              <span><strong>{totalPessoas}</strong> pessoas</span>
                              <span><strong>{totalReservasHorario}</strong> reservas</span>
                              <span><strong>{totalChegadasHorario}</strong> chegadas</span>
                            </div>
                          </div>

                          <div className="admin-reservas-cards-grid">
                          {filtradas.map((reserva) => {

                            const participantes = calcularParticipantes(reserva);

                            const resumoParticipantes = montarResumoParticipantes(reserva);

                            const confirmada = statusEhConfirmado(reserva);
                            const statusBadge = obterBadgeStatus(reserva);

                            const mesasDaReserva = Array.isArray(reserva.mesasSelecionadas) ? reserva.mesasSelecionadas : [];

                            const chegou = reserva.chegou === true;

                            const reservaToneClass = chegou
                              ? 'admin-reservas-tone--arrived'
                              : confirmada
                                ? 'admin-reservas-tone--confirmed'
                                : statusEhPreReserva(reserva)
                                  ? 'admin-reservas-tone--pre'
                                  : 'admin-reservas-tone--default';

                            const pacoteDescricao = formatarPacote(reserva);
                            const pacotesEtiquetas = quebrarPacoteEmEtiquetas(pacoteDescricao);

                            const valorFormatado = formatarValor(reserva.valor);

                            const podeEnviarWhatsapp = Boolean(normalizarTelefoneWhatsapp(reserva.telefone));

                            const reservaManual = reserva.origem === 'manual';
                            const reservaKey = reserva.id ?? `${reserva.nome || 'reserva'}-${reserva.cpf || 'cpf'}-${reserva.horario}-${normalizarDataReserva(reserva.data)}`;

                            const perguntasRespondidas = obterPerguntasComResposta(reserva);
                            const telefoneExibicao = reserva.telefone?.trim() || 'Sem telefone';
                            const apresentacaoReserva = obterApresentacaoReserva(reserva, participantes);
                            const IconeReserva = apresentacaoReserva.Icon;



                            return (

                              <div key={reservaKey} className={`admin-reserva-card admin-reserva-card--mobile overflow-hidden rounded-[30px] border p-4 shadow-sm ${reservaToneClass}`}>

                                <div className="admin-reserva-card__mobile-shell">
                                  <div className="admin-reserva-card__mobile-top">
                                    <div className="admin-reservas-identity">
                                      <span className="admin-reservas-avatar" title={apresentacaoReserva.label}>
                                        <IconeReserva className="h-5 w-5" />
                                      </span>

                                      <div className="min-w-0 flex-1">
                                        <div className="admin-reservas-identity-card">
                                          <div className="admin-reservas-identity-card__title-row">
                                            <p className="admin-reservas-identity-card__title">{reserva.nome || '---'}</p>
                                            <div className="admin-reservas-identity-card__badges">
                                              {reservaManual && (
                                                <span className="admin-reservas-origin-badge">
                                                  <FaClipboardList className="h-3 w-3" />
                                                  <span>Manual</span>
                                                </span>
                                              )}
                                              <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusBadge.classes}`}>
                                                {statusBadge.label}
                                              </span>
                                            </div>
                                          </div>

                                          <div className="admin-reservas-identity-card__meta admin-reservas-identity-card__meta--mobile">
                                            <span className="admin-reservas-identity-card__item">
                                              <FaPhoneAlt className="h-3 w-3" />
                                              <span>{telefoneExibicao}</span>
                                            </span>
                                            <span className="admin-reservas-identity-card__item">
                                              <FaClock className="h-3 w-3" />
                                              <span>{tituloHorario}</span>
                                            </span>
                                            <span className="admin-reservas-identity-card__item admin-reservas-identity-card__item--wide">
                                              <FaIdCard className="h-3 w-3" />
                                              <span>CPF: {formatarCpfExibicao(reserva.cpf)}</span>
                                            </span>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  </div>

                                  <div className="admin-reserva-card__mobile-grid">
                                    <div className="admin-reservas-box admin-reservas-box--participants admin-reserva-card__mobile-grid-wide">
                                      <div className="admin-reservas-box__stack admin-reservas-box__stack--participants">
                                        <div className="admin-reservas-box__header">
                                          <span className="admin-reservas-box__icon"><FaUsers className="h-4 w-4" /></span>
                                          <div className="admin-reservas-participants-total">
                                            <strong>{participantes}</strong>
                                            <span>pessoas</span>
                                          </div>
                                        </div>

                                        <ReservaParticipantesResumo itens={resumoParticipantes} compact />
                                      </div>
                                    </div>

                                    <div className="admin-reservas-box admin-reservas-box--value">
                                      <div className="admin-reservas-box__stack admin-reservas-box__stack--compact">
                                        <span className="admin-reservas-box__icon"><FaMoneyBillWave className="h-4 w-4" /></span>
                                        <p className="admin-reservas-box__value admin-reservas-box__value--amount admin-reservas-box__value--centered">{valorFormatado}</p>
                                      </div>
                                    </div>

                                    <div className={`admin-reservas-box admin-reservas-box--pet ${reserva.temPet ? 'is-active' : ''}`}>
                                      <div className="admin-reservas-box__stack admin-reservas-box__stack--pet">
                                        <PetStatusIndicator hasPet={reserva.temPet === true} />
                                      </div>
                                    </div>

                                    <div className="admin-reservas-box admin-reservas-box--package admin-reserva-card__mobile-grid-wide">
                                      <div className="admin-reservas-box__stack admin-reservas-box__stack--package">
                                        <span className="admin-reservas-box__icon"><FaLayerGroup className="h-4 w-4" /></span>
                                        {pacotesEtiquetas.length > 0 ? (
                                          <div className="admin-reservas-package-pills admin-reservas-package-pills--stacked">
                                            {pacotesEtiquetas.map((item) => (
                                              <span key={`${reservaKey}-mobile-${item}`} className="admin-reservas-package-pill">
                                                {item}
                                              </span>
                                            ))}
                                          </div>
                                        ) : (
                                          <p className="admin-reservas-box__value">---</p>
                                        )}
                                      </div>
                                    </div>

                                    <div className="admin-reservas-box admin-reservas-box--answers admin-reserva-card__mobile-grid-wide">
                                      <div className="admin-reservas-box__stack admin-reservas-box__stack--answers">
                                        <span className="admin-reservas-box__icon"><FaQuestionCircle className="h-4 w-4" /></span>
                                        <ReservaPerguntasResumo perguntas={perguntasRespondidas} compact />
                                      </div>
                                    </div>
                                  </div>

                                  {mesasDaReserva.length > 0 && (
                                    <div className="admin-reservas-chip-list">
                                      {mesasDaReserva.map((mesa) => (
                                        <span
                                          key={`${reservaKey}-${mesa.id}-mobile`}
                                          className="admin-reservas-chip admin-reservas-chip--soft"
                                        >
                                          <FaChair className="h-3 w-3" />
                                          {mesa.area} - {mesa.nome} ({mesa.capacidade})
                                        </span>
                                      ))}
                                    </div>
                                  )}

                                  <div className="admin-reserva-card__mobile-actions">

                                    <button

                                      onClick={() => toggleChegadaReserva(reserva)}

                                      className={`admin-reservas-action-btn ${

                                        chegou

                                          ? 'border-emerald-500 bg-emerald-100 text-emerald-700 hover:bg-emerald-200'

                                          : 'border-slate-200 bg-white/90 text-slate-600 hover:border-emerald-300 hover:text-emerald-600'

                                      }`}

                                      aria-label={chegou ? 'Marcar como não chegou' : 'Marcar como chegou'}

                                      title={chegou ? 'Marcar como não chegou' : 'Marcar como chegou'}

                                    >

                                      <FaCheck className="h-4 w-4" />
                                      <span>{chegou ? 'Desfazer' : 'Chegada'}</span>

                                    </button>

                                    {reserva.linkPagamento && (

                                      <button

                                        onClick={() => window.open(reserva.linkPagamento, '_blank')}

                                        className="admin-reservas-action-btn admin-reservas-action-btn--payment"

                                        aria-label="Concluir pagamento"

                                        title="Concluir pagamento"

                                      >

                                        <FaCreditCard className="h-4 w-4" />
                                        <span>Pagamento</span>

                                      </button>

                                    )}

                                    <button

                                      onClick={() =>
                                        abrirEnvioWhatsapp(reserva, participantes, pacoteDescricao, valorFormatado)
                                      }

                                      disabled={!podeEnviarWhatsapp}

                                      className="admin-reservas-action-btn admin-reservas-action-btn--whatsapp"

                                      aria-label="Abrir WhatsApp"

                                      title="WhatsApp"

                                    >

                                      <FaWhatsapp className="h-4 w-4" />
                                      <span>WhatsApp</span>

                                    </button>

                                    <button

                                      onClick={() => handleEditReserva(reserva)}

                                      className="admin-reservas-action-btn admin-reservas-action-btn--neutral"

                                      aria-label="Editar reserva"

                                      title="Editar"

                                    >

                                      <FaEdit className="h-4 w-4" />
                                      <span>Editar</span>

                                    </button>

                                    <button

                                      onClick={() => reserva.id && excluirReserva(reserva.id)}

                                      className="admin-reservas-action-btn admin-reservas-action-btn--danger"

                                      aria-label="Excluir reserva"

                                      title="Excluir"

                                    >

                                      <FaTrash className="h-4 w-4" />
                                      <span>Excluir</span>

                                    </button>

                                  </div>
                                </div>
                              </div>

                            );

                          })}
                          </div>

                        </div>

                      );

                    })

                )}

              </div>

              </article>
            </div>

          </div>



          {modalResumoDia && (() => {
            const horariosOrdenados = Object.keys(reservas).sort((a, b) => {
              const aIndef = a.toLowerCase().includes('especificado');
              const bIndef = b.toLowerCase().includes('especificado');
              if (aIndef && !bIndef) return 1;
              if (!aIndef && bIndef) return -1;
              return compararHorariosComIndefinidosNoFim(a, b);
            });
            const totalReservas = Object.values(reservas).reduce((s, l) => s + l.length, 0);
            const totalPax = Object.values(reservas).reduce((s, l) => s + l.reduce((ss, r) => ss + calcularParticipantes(r), 0), 0);
            const dataExibicao = dayjs(selectedDate).format('DD/MM/YYYY');
            return (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-3 py-4 sm:px-6">
                <div className="flex w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" style={{ maxHeight: 'calc(100vh - 2rem)' }}>

                  {/* Header */}
                  <div className="flex flex-shrink-0 items-center justify-between border-b border-slate-200 px-5 py-4">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#8B4F23]/10 text-[#8B4F23]">
                        <FaListUl className="h-3.5 w-3.5" />
                      </span>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Resumo do dia</p>
                        <p className="text-sm font-bold text-slate-900">{dataExibicao}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setModalResumoDia(false)}
                      className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                      aria-label="Fechar resumo"
                    >
                      ×
                    </button>
                  </div>

                  {/* Colunas por horário */}
                  <div className="min-h-0 flex-1 overflow-auto">
                    {horariosOrdenados.length === 0 ? (
                      <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
                        <FaCalendarAlt className="h-8 w-8 text-slate-200" />
                        <p className="text-sm text-slate-400">Nenhuma reserva neste dia.</p>
                      </div>
                    ) : (
                      <div className="flex h-full gap-0 divide-x divide-slate-100">
                        {horariosOrdenados.map((horario) => {
                          const lista = [...(reservas[horario] ?? [])].sort((a, b) => {
                            const diferencaParticipantes =
                              calcularParticipantes(b) - calcularParticipantes(a);
                            if (diferencaParticipantes !== 0) {
                              return diferencaParticipantes;
                            }

                            return compararTextoNumericamente(
                              (a.nome ?? '').toString(),
                              (b.nome ?? '').toString()
                            );
                          });
                          const paxHorario = lista.reduce((s, r) => s + calcularParticipantes(r), 0);
                          return (
                            <div key={horario} className="flex min-w-[10rem] flex-1 flex-col">
                              {/* Cabeçalho da coluna */}
                              <div className="flex flex-shrink-0 flex-col gap-0.5 border-b border-slate-100 bg-slate-50 px-3 py-3">
                                <span className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
                                  <FaClock className="h-3 w-3 text-[#8B4F23]" />
                                  {horario}
                                </span>
                                <span className="text-xs text-slate-400">{lista.length} reserva{lista.length !== 1 ? 's' : ''} · {paxHorario} pax</span>
                              </div>
                              {/* Reservas da coluna */}
                              <ul className="flex-1 divide-y divide-slate-50 overflow-y-auto">
                                {lista.map((r, idx) => {
                                  const key = r.id ?? `resumo-${horario}-${idx}`;
                                  const mapa = r.participantesPorTipo ?? {};
                                  const tipos = Object.entries(mapa)
                                    .filter(([, v]) => Number(v) > 0)
                                    .map(([chave, v]) => {
                                      const tipoEncontrado = tiposClientesAtivos.find(
                                        (t) => obterChaveTipo(t) === chave
                                      );
                                      const inicial = tipoEncontrado
                                        ? tipoEncontrado.nome.charAt(0).toUpperCase()
                                        : chave.charAt(0).toUpperCase();
                                      return `${inicial}:${v}`;
                                    });
                                  if (tipos.length === 0) {
                                    if (Number(r.adultos) > 0) tipos.push(`A:${r.adultos}`);
                                    if (Number(r.criancas) > 0) tipos.push(`C:${r.criancas}`);
                                    if (Number(r.naoPagante) > 0) tipos.push(`N:${r.naoPagante}`);
                                    if (Number(r.bariatrica) > 0) tipos.push(`B:${r.bariatrica}`);
                                  }
                                  const chegou = r.chegou === true;
                                  const perguntasResumo = obterPerguntasComResposta(r);
                                  const totalRespostasResumo = perguntasResumo.reduce(
                                    (total, pergunta) =>
                                      total +
                                      1 +
                                      (pergunta.perguntaCondicional?.resposta?.trim() ? 1 : 0),
                                    0
                                  );
                                  return (
                                    <li
                                      key={key}
                                      className={`admin-resumo-reserva-item px-3 py-2 transition-colors ${
                                        chegou ? 'bg-emerald-50' : 'bg-rose-50/60'
                                      }`}
                                    >
                                      <div className="flex items-center gap-2">
                                        {/* Avatar */}
                                        <span className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                                          chegou ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-500'
                                        }`}>
                                          {(r.nome || '?').charAt(0).toUpperCase()}
                                        </span>

                                        {/* Info */}
                                        <div className="min-w-0 flex-1">
                                          <p className="truncate text-xs font-semibold text-slate-800">{r.nome || '---'}</p>
                                          {tipos.length > 0 && (
                                            <p className="mt-0.5 text-[10px] font-medium text-slate-400">{tipos.join(' · ')}</p>
                                          )}
                                        </div>

                                        {/* Botão chegada */}
                                        <button
                                          type="button"
                                          onClick={() => toggleChegadaReserva(r)}
                                          title={chegou ? 'Desfazer chegada' : 'Marcar chegada'}
                                          className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border transition-colors ${
                                            chegou
                                              ? 'border-emerald-400 bg-emerald-500 text-white hover:bg-emerald-600'
                                              : 'border-slate-300 bg-white text-slate-300 hover:border-emerald-400 hover:text-emerald-500'
                                          }`}
                                        >
                                          <FaCheck className="h-2.5 w-2.5" />
                                        </button>
                                      </div>

                                      {perguntasResumo.length > 0 && (
                                        <details className="admin-resumo-respostas">
                                          <summary>
                                            <span>
                                              <FaQuestionCircle className="h-3 w-3" />
                                              Ver respostas ({totalRespostasResumo})
                                            </span>
                                            <FaChevronDown className="admin-resumo-respostas__chevron h-3 w-3" />
                                          </summary>

                                          <div className="admin-resumo-respostas__content">
                                            {perguntasResumo.map((pergunta) => (
                                              <div
                                                key={`${key}-${pergunta.perguntaId}-${pergunta.pergunta}`}
                                                className="admin-resumo-respostas__item"
                                              >
                                                <p className="admin-resumo-respostas__question">{pergunta.pergunta}</p>
                                                <p className="admin-resumo-respostas__answer">{pergunta.resposta}</p>

                                                {pergunta.perguntaCondicional?.pergunta &&
                                                  pergunta.perguntaCondicional.resposta?.trim() && (
                                                    <div className="admin-resumo-respostas__conditional">
                                                      <p className="admin-resumo-respostas__question">
                                                        {pergunta.perguntaCondicional.pergunta}
                                                      </p>
                                                      <p className="admin-resumo-respostas__answer">
                                                        {pergunta.perguntaCondicional.resposta}
                                                      </p>
                                                    </div>
                                                  )}
                                              </div>
                                            ))}
                                          </div>
                                        </details>
                                      )}
                                    </li>
                                  );
                                })}
                              </ul>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Footer */}
                  {totalReservas > 0 && (
                    <div className="flex flex-shrink-0 items-center justify-between border-t border-slate-100 bg-slate-50 px-5 py-3">
                      <span className="text-xs text-slate-400">{horariosOrdenados.length} horário{horariosOrdenados.length !== 1 ? 's' : ''} · {totalReservas} reserva{totalReservas !== 1 ? 's' : ''}</span>
                      <span className="text-xs font-semibold text-slate-600">{totalPax} participantes no total</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {modalReserva && editReserva && (

            <div className="admin-modal-reserva fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-slate-900/60 px-2 py-2 sm:px-4 sm:py-4">

              <div className="admin-modal-reserva__dialog flex h-[calc(100vh-1rem)] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl sm:h-[calc(100vh-2rem)]">

                <div className="admin-modal-reserva__header flex items-center justify-between border-b border-slate-200 px-4 sm:px-6 py-4">

                  <h4 className="admin-modal-reserva__title text-lg font-semibold text-slate-900">

                    {isEditingReserva ? 'Editar reserva' : 'Nova reserva manual'}

                  </h4>

                  <button

                    onClick={() => {
                      setModalReserva(false);
                      setEditReserva(null);
                      setReservaOriginalEmEdicao(null);
                    }}

                    className="rounded-full border border-slate-200 p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"

                  >

                    x

                  </button>

                </div>

                <div className="grid min-h-0 flex-1 content-start gap-5 overflow-y-auto bg-slate-50/40 px-4 py-5 sm:px-6">

                  <div className="grid gap-5 md:grid-cols-2">

                  <label className="text-xs font-semibold uppercase text-slate-500">

                    Nome

                    <input

                      type="text"

                      value={editReserva.nome}

                      onChange={(e) => setEditReserva({ ...editReserva, nome: e.target.value })}

                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"

                    />

                  </label>

                  <label className="text-xs font-semibold uppercase text-slate-500">

                    CPF

                    <input

                      type="text"

                      value={editReserva.cpf}

                      onChange={(e) => setEditReserva({ ...editReserva, cpf: e.target.value })}

                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"

                    />

                  </label>

                  <label className="text-xs font-semibold uppercase text-slate-500">

                    Telefone

                    <input

                      type="text"

                      value={editReserva.telefone}

                      onChange={(e) => setEditReserva({ ...editReserva, telefone: e.target.value })}

                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"

                    />

                  </label>

                  <label className="text-xs font-semibold uppercase text-slate-500">

                    Data

                    <input

                      type="date"

                      value={editReserva.data}

                      min={isEditingReserva ? undefined : dayjs().format('YYYY-MM-DD')}

                      onChange={(e) => setEditReserva({ ...editReserva, data: e.target.value })}

                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"

                    />

                  </label>

                  </div>

                  <div className="admin-manual-section admin-manual-section--packages md:col-span-2 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">

                    <div className="admin-manual-section__header">
                      <div className="admin-manual-section__heading">
                        <span className="admin-manual-section__icon">
                          <FaLayerGroup className="h-4 w-4" />
                        </span>
                        <div>
                          <p className="admin-manual-section__eyebrow">Pacotes</p>
                          <h5 className="admin-manual-section__title">Selecione os pacotes da reserva</h5>
                        </div>
                      </div>
                      {pacotesSelecionadosEmEdicao.length > 0 ? (
                        <span className="admin-manual-section__badge">
                          {pacotesSelecionadosEmEdicao.length} selecionado(s)
                        </span>
                      ) : null}
                    </div>

                    {pacotes.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                        Nenhum pacote cadastrado.
                      </div>
                    ) : (
                      <div className="admin-manual-package-grid">
                        {pacotes.map((pacote) => {
                          const selecionado = Boolean(
                            pacote.id && Array.isArray(editReserva.pacoteIds) && editReserva.pacoteIds.includes(pacote.id)
                          );
                          const ehFaixa =
                            (pacote.modoHorario ?? 'lista') === 'intervalo' ||
                            (pacote.horarios?.length ?? 0) === 0;
                          const resumoHorario = ehFaixa
                            ? pacote.horarioInicio && pacote.horarioFim
                              ? `${pacote.horarioInicio} - ${pacote.horarioFim}`
                              : 'Faixa livre'
                            : pacote.horarios.join(', ');

                          return (
                            <label
                              key={`pacote-manual-${pacote.id ?? pacote.nome}`}
                              className={`admin-manual-package-option ${selecionado ? 'is-selected' : ''} ${ehFaixa ? 'is-flexible' : 'is-fixed'}`}
                            >
                              <input
                                type="checkbox"
                                checked={selecionado}
                                disabled={!pacote.id}
                                onChange={() => pacote.id && alternarPacoteEmEdicao(pacote.id)}
                                className="sr-only"
                              />

                              <div className="admin-manual-package-option__check" aria-hidden="true">
                                <FaCheck className="h-3.5 w-3.5" />
                              </div>

                              <div className="admin-manual-package-option__body">
                                <div className="admin-manual-package-option__head">
                                  <p className="admin-manual-package-option__title">{pacote.nome}</p>
                                </div>

                                <p className="admin-manual-package-option__summary">
                                  {ehFaixa
                                    ? resumoHorario && resumoHorario !== 'Faixa livre'
                                      ? resumoHorario
                                      : 'Disponivel em faixa de horario'
                                    : resumoHorario
                                      ? `Horarios: ${resumoHorario}`
                                      : 'Horarios nao cadastrados'}
                                </p>

                                {selecionado && (
                                  <span className="admin-manual-package-option__state">Incluido na reserva</span>
                                )}
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    )}

                    {conflitoHorarioPacotesEmEdicao ? (
                      <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                        Os pacotes marcados nao possuem horario especifico em comum. Ajuste a selecao para continuar.
                      </div>
                    ) : semHorarioValidoNaDataEmEdicao ? (
                      <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                        Nao ha horarios validos restantes para a data escolhida. Selecione outro dia para continuar.
                      </div>
                    ) : requerHorarioEspecificoEmEdicao ? (
                      <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Horario
                        <select
                          value={editReserva.horario}
                          onChange={(e) => setEditReserva({ ...editReserva, horario: e.target.value })}
                          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                        >
                          <option value="">Selecione um horario</option>
                          {horariosSelecionaveisEmEdicao.map((horario) => {
                            const restante = vagasRestantesPorHorarioEmEdicao[horario];
                            const restanteNormalizado =
                              typeof restante === 'number' ? Math.max(restante, 0) : null;
                            const dataReservaAtual = normalizarDataReserva(editReserva.data);
                            const horarioJaPassouHoje =
                              dataReservaAtual === dayjs().format('YYYY-MM-DD') &&
                              (() => {
                                const minutosHorario = parseHorarioParaMinutos(horario);
                                if (minutosHorario === null) return false;
                                const minutosAgora = dayjs().hour() * 60 + dayjs().minute();
                                return minutosHorario < minutosAgora;
                              })();
                            const sufixosHorario = [
                              horarioJaPassouHoje ? 'horario ja passou' : null,
                              restanteNormalizado === null
                                ? 'sem limite'
                                : restanteNormalizado <= 0
                                  ? 'lotado para o limite regular'
                                  : `${restanteNormalizado} vaga(s)`,
                            ].filter(Boolean);

                            return (
                              <option
                                key={`horario-manual-${horario}`}
                                value={horario}
                              >
                                {`${horario} - ${sufixosHorario.join(' - ')}`}
                              </option>
                            );
                          })}
                        </select>
                        <span className="mt-2 block text-[11px] font-normal text-slate-500">
                          {typeof limiteHorarioSelecionadoEmEdicao === 'number'
                            ? `Referencia regular: ${Math.max(limiteHorarioSelecionadoEmEdicao, 0)} vaga(s). Se precisar exceder, vamos pedir confirmacao antes de salvar.`
                            : 'Mostramos todos os horarios compativeis, inclusive os que ja passaram ou estao lotados.'}
                        </span>
                      </label>
                    ) : null}

                  </div>

                  <div className="admin-manual-section admin-manual-section--participants md:col-span-2 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">

                    <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Participantes</p>
                        <h5 className="mt-1 text-lg font-semibold text-slate-900">Monte a composicao do grupo</h5>
                        {typeof limiteParticipantesManualEmEdicao === 'number' && (
                          <p className="mt-1 text-xs text-slate-500">
                            Referencia disponivel agora: {Math.max(limiteParticipantesManualEmEdicao, 0)} participante(s).
                          </p>
                        )}
                        {excedeuLimiteParticipantesManualEmEdicao && (
                          <p className="mt-1 text-xs text-amber-700">
                            O total atual excede o limite regular. Vamos pedir confirmacao antes de salvar.
                          </p>
                        )}
                        {participantesEmEdicao <= 0 && (
                          <p className="mt-1 text-xs text-rose-600">
                            Informe pelo menos 1 participante para cadastrar a reserva.
                          </p>
                        )}
                      </div>
                      <div className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700">
                        Total atual: {participantesEmEdicao} participante(s)
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">

                      {tiposClientesAtivos.map((tipo) => {

                        const valor = Number(obterValorMapa(editReserva.participantesPorTipo, tipo) ?? 0);

                        return (

                          <ParticipantStepperCard
                            key={`stepper-${obterChaveTipo(tipo)}`}
                            label={tipo.nome}
                            value={valor}
                            description={tipo.descricao || 'Use os botoes para ajustar a quantidade.'}
                            onDecrease={() => ajustarParticipanteTipoEmEdicao(tipo, -1)}
                            onIncrease={() => ajustarParticipanteTipoEmEdicao(tipo, 1)}
                          />

                        );

                      })}

                      <ParticipantStepperCard
                        label="Nao pagante"
                        value={Number(editReserva.naoPagante ?? 0)}
                        description="Conta no total geral, mas nao entra como pagante."
                        onDecrease={() => ajustarNaoPaganteEmEdicao(-1)}
                        onIncrease={() => ajustarNaoPaganteEmEdicao(1)}
                        emphasis="muted"
                      />

                    </div>

                  </div>

                  <div className="md:col-span-2 hidden">

                    <p className="text-xs font-semibold uppercase text-slate-500">Participantes</p>

                    <div className="mt-2 grid gap-3 sm:grid-cols-3">

                      {tiposClientesAtivos.map((tipo) => {

                        const chave = obterChaveTipo(tipo);

                        const valor = obterValorMapa(editReserva.participantesPorTipo, tipo) ?? 0;

                        return (

                          <label key={chave} className="text-xs font-semibold uppercase text-slate-500">

                            {tipo.nome}

                            <input

                              type="number"

                              min={0}

                              value={valor}

                              onChange={(e) =>

                                setEditReserva((prev) => {

                                  if (!prev) return prev;

                                  const participantesPorTipo = {

                                    ...(prev.participantesPorTipo ?? {}),

                                    [chave]: Number(e.target.value),

                                  };

                                  return { ...prev, participantesPorTipo };

                                })

                              }

                              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"

                            />

                          </label>

                        );

                      })}

                      <label className="text-xs font-semibold uppercase text-slate-500">

                        Não pagante

                        <input

                          type="number"

                          min={0}

                          value={editReserva.naoPagante ?? 0}

                          onChange={(e) =>

                            setEditReserva((prev) => (prev ? { ...prev, naoPagante: Number(e.target.value) } : prev))

                          }

                          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"

                        />

                      </label>

                    </div>

                  </div>

                  <label className="hidden text-xs font-semibold uppercase text-slate-500">

                    Horário

                    <input

                      type="time"

                      value={editReserva.horario}

                      onChange={(e) => setEditReserva({ ...editReserva, horario: e.target.value })}

                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"

                    />

                  </label>

                  <label className="hidden text-xs font-semibold uppercase text-slate-500">

                    Atividade

                    <select

                      value={editReserva.atividade}

                      onChange={(e) => setEditReserva({ ...editReserva, atividade: e.target.value })}

                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"

                    >

                      <option value="">Todas as atividades</option>

                      <option value="Trilha Ecológica">Trilha Ecológica</option>

                      <option value="Brunch Gastronômico">Brunch Gastronômico</option>

                      <option value="Brunch + trilha">Brunch + trilha</option>

                    </select>

                  </label>



                  <label className="hidden text-xs font-semibold uppercase text-slate-500">

                    Área da mesa

                    <select

                      value={editReserva.areaMesa ?? ''}

                      onChange={(e) =>

                        setEditReserva({

                          ...editReserva,

                          areaMesa: e.target.value,

                          mesaPrincipalId: null,

                          mesaSecundariaId: null,

                        })

                      }

                      disabled={carregandoMesas || mesas.length === 0}

                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:cursor-not-allowed disabled:bg-slate-100"

                    >

                      <option value="">{mesas.length === 0 ? 'Cadastre mesas para habilitar' : 'Selecione a área'}</option>

                      {areasDisponiveis.map((area) => (

                        <option key={area} value={area}>

                          {area}

                        </option>

                      ))}

                    </select>

                    {carregandoMesas && (

                      <span className="mt-1 block text-[11px] font-normal text-slate-500">Carregando mesas cadastradas...</span>

                    )}

                  </label>

                  <label className="hidden text-xs font-semibold uppercase text-slate-500">

                    Mesa principal

                    <select

                      value={editReserva.mesaPrincipalId ?? ''}

                      onChange={(e) => {

                        const novaMesa = e.target.value || null;

                        setEditReserva({

                          ...editReserva,

                          mesaPrincipalId: novaMesa,

                          mesaSecundariaId:

                            novaMesa && editReserva.mesaSecundariaId === novaMesa ? null : editReserva.mesaSecundariaId ?? null,

                        });

                      }}

                      disabled={!editReserva.areaMesa || mesasDisponiveisNaAreaEmEdicao.length === 0}

                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:cursor-not-allowed disabled:bg-slate-100"

                    >

                      <option value="">Selecione a mesa principal</option>

                      {mesasDisponiveisNaAreaEmEdicao.map((mesa) => (

                        <option key={mesa.id} value={mesa.id}>

                          {mesa.nome} • {mesa.capacidade} pessoa(s)

                        </option>

                      ))}

                    </select>

                  </label>

                  <label className="hidden text-xs font-semibold uppercase text-slate-500">

                    Mesa complementar (opcional)

                    <select

                      value={editReserva.mesaSecundariaId ?? ''}

                      onChange={(e) =>

                        setEditReserva({

                          ...editReserva,

                          mesaSecundariaId: e.target.value || null,

                        })

                      }

                      disabled={

                        !editReserva.areaMesa ||

                        mesasDisponiveisNaAreaEmEdicao.length === 0 ||

                        !editReserva.mesaPrincipalId

                      }

                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:cursor-not-allowed disabled:bg-slate-100"

                    >

                      <option value="">Selecionar mesa complementar</option>

                      {mesasDisponiveisNaAreaEmEdicao

                        .filter((mesa) => mesa.id !== editReserva.mesaPrincipalId)

                        .map((mesa) => (

                          <option key={mesa.id} value={mesa.id}>

                            {mesa.nome} • {mesa.capacidade} pessoa(s)

                          </option>

                        ))}

                    </select>

                    <span className="mt-1 block text-[11px] font-normal text-slate-500">

                      Use somente se precisar somar capacidade.

                    </span>

                  </label>

                  <div className="hidden md:col-span-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">

                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-semibold text-slate-900">Participantes</p>
                        <p>{participantesEmEdicao}</p>
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900">Capacidade das mesas</p>
                        <p>
                          {capacidadeTotalMesasEmEdicao > 0
                            ? `${capacidadeTotalMesasEmEdicao} pessoa(s)`
                            : mesaPrincipalEmEdicao
                              ? `${mesaPrincipalEmEdicao.capacidade} pessoa(s)`
                              : '0 pessoa(s)'}
                        </p>
                      </div>
                    </div>
                    {precisaMesaComplementarEmEdicao && (

                      <p className="mt-2 rounded bg-amber-100 px-2 py-1 text-amber-700">

                        A mesa principal não comporta todos os participantes. Escolha uma mesa complementar da mesma área.

                      </p>

                    )}

                    {capacidadeInsuficienteEmEdicao && (

                      <p className="mt-2 rounded bg-rose-100 px-2 py-1 text-rose-700">

                        A soma das mesas ainda é menor que o total de participantes.

                      </p>

                    )}

                  </div>

                  <label className="md:col-span-2 text-xs font-semibold uppercase text-slate-500">

                    Valor total

                    <input

                      type="text"
                      inputMode={editReserva.educativo === true ? 'decimal' : undefined}
                      value={valorTotalExibicaoEmEdicao}
                      onChange={(e) => {
                        if (editReserva.educativo !== true) return;
                        setValorManualReservaInput(e.target.value);
                      }}
                      onBlur={() => {
                        if (editReserva.educativo !== true) return;
                        const valorManual = parseCurrencyInput(valorManualReservaInput);
                        setValorManualReservaInput(formatCurrencyForEditing(valorManual));
                        setEditReserva({
                          ...editReserva,
                          valor: valorManual,
                        });
                      }}
                      readOnly={editReserva.educativo !== true}
                      placeholder={editReserva.educativo === true ? 'Informe o valor combinado' : undefined}
                      className={`mt-1 w-full rounded-lg border px-3 py-2 text-base font-semibold text-slate-900 shadow-sm focus:outline-none ${
                        editReserva.educativo === true
                          ? 'border-blue-200 bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-200'
                          : 'border-slate-200 bg-slate-50'
                      }`}

                    />

                    <span className="mt-1 block text-[11px] font-normal text-slate-500">

                      {editReserva.educativo === true
                        ? 'Como esta reserva e educativa, informe o valor total manualmente.'
                        : pacotesSelecionadosEmEdicao.length === 0
                        ? 'Selecione os pacotes e os participantes para acompanhar o total.'
                        : `Atualizado automaticamente com ${quantidadePagantesEmEdicao} participante(s) pagante(s).`}

                    </span>

                  </label>

                  <div className="admin-manual-preferences-grid md:col-span-2">
                    <div className="admin-manual-choice-panel">
                      <div className="admin-manual-choice-panel__header">
                        <span className="admin-manual-choice-panel__icon">
                          <FaPaw className="h-4 w-4" />
                        </span>
                        <div>
                          <p className="admin-manual-choice-panel__eyebrow">Pet</p>
                          <h5 className="admin-manual-choice-panel__title">Levara pet?</h5>
                        </div>
                      </div>

                      <div className="admin-manual-choice-row">
                        <label className={`admin-manual-choice ${editReserva.temPet === true ? 'is-active' : ''}`}>
                          <input
                            type="radio"
                            name="editarPetPremium"
                            checked={editReserva.temPet === true}
                            onChange={() => setEditReserva({ ...editReserva, temPet: true })}
                            className="sr-only"
                          />
                          <span className="admin-manual-choice__indicator" aria-hidden="true">
                            {editReserva.temPet === true ? <FaCheck className="h-3 w-3" /> : null}
                          </span>
                          <span className="admin-manual-choice__content">
                            <span className="admin-manual-choice__label">Sim</span>
                            <span className="admin-manual-choice__hint">Reserva com pet</span>
                          </span>
                        </label>

                        <label className={`admin-manual-choice ${editReserva.temPet === false ? 'is-active' : ''}`}>
                          <input
                            type="radio"
                            name="editarPetPremium"
                            checked={editReserva.temPet === false}
                            onChange={() => setEditReserva({ ...editReserva, temPet: false })}
                            className="sr-only"
                          />
                          <span className="admin-manual-choice__indicator" aria-hidden="true">
                            {editReserva.temPet === false ? <FaCheck className="h-3 w-3" /> : null}
                          </span>
                          <span className="admin-manual-choice__content">
                            <span className="admin-manual-choice__label">Nao</span>
                            <span className="admin-manual-choice__hint">Sem pet</span>
                          </span>
                        </label>
                      </div>
                    </div>

                    <div className="admin-manual-choice-panel">
                      <div className="admin-manual-choice-panel__header">
                        <span className="admin-manual-choice-panel__icon">
                          <FaGraduationCap className="h-4 w-4" />
                        </span>
                        <div>
                          <p className="admin-manual-choice-panel__eyebrow">Educativo</p>
                          <h5 className="admin-manual-choice-panel__title">Escola / faculdade</h5>
                        </div>
                      </div>

                      <label className={`admin-manual-toggle-card ${editReserva.educativo === true ? 'is-active' : ''}`}>
                        <input
                          type="checkbox"
                          checked={editReserva.educativo === true}
                          onChange={(e) => setEditReserva({ ...editReserva, educativo: e.target.checked })}
                          className="sr-only"
                        />
                        <span className="admin-manual-toggle-card__indicator" aria-hidden="true">
                          {editReserva.educativo === true ? <FaCheck className="h-3 w-3" /> : null}
                        </span>
                        <span className="admin-manual-toggle-card__content">
                          <span className="admin-manual-toggle-card__label">Escola / faculdade</span>
                          <span className="admin-manual-toggle-card__hint">Use para visitas educativas e grupos academicos</span>
                        </span>
                      </label>
                    </div>

                    <div className="admin-manual-choice-panel">
                      <div className="admin-manual-choice-panel__header">
                        <span className="admin-manual-choice-panel__icon">
                          <FaCreditCard className="h-4 w-4" />
                        </span>
                        <div>
                          <p className="admin-manual-choice-panel__eyebrow">Pagamento</p>
                          <h5 className="admin-manual-choice-panel__title">Registrar como Asaas</h5>
                        </div>
                      </div>

                      <label className={`admin-manual-toggle-card ${editReserva.origem !== 'manual' ? 'is-active' : ''}`}>
                        <input
                          type="checkbox"
                          checked={editReserva.origem !== 'manual'}
                          onChange={(e) =>
                            setEditReserva({
                              ...editReserva,
                              origem: e.target.checked ? 'checkout' : 'manual',
                            })
                          }
                          className="sr-only"
                        />
                        <span className="admin-manual-toggle-card__indicator" aria-hidden="true">
                          {editReserva.origem !== 'manual' ? <FaCheck className="h-3 w-3" /> : null}
                        </span>
                        <span className="admin-manual-toggle-card__content">
                          <span className="admin-manual-toggle-card__label">Pago pelo Asaas</span>
                          <span className="admin-manual-toggle-card__hint">Aparece no dashboard como reserva do checkout</span>
                        </span>
                      </label>
                    </div>
                  </div>

                  <div className="hidden">
                  <div className="text-xs font-semibold uppercase text-slate-500">

                    Pet

                    <div className="mt-2 flex gap-4">

                      <label className="flex items-center gap-2 text-xs font-medium text-slate-600">

                        <input

                          type="radio"

                          name="editarPet"

                          checked={editReserva.temPet === true}

                          onChange={() => setEditReserva({ ...editReserva, temPet: true })}

                        />

                        Sim

                      </label>

                      <label className="flex items-center gap-2 text-xs font-medium text-slate-600">

                        <input

                          type="radio"

                          name="editarPet"

                          checked={editReserva.temPet === false}

                          onChange={() => setEditReserva({ ...editReserva, temPet: false })}

                        />

                        Não

                      </label>

                    </div>

                  </div>

                  <div className="text-xs font-semibold uppercase text-slate-500">

                    Educativo

                    <label className="mt-2 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-800">

                      <input

                        type="checkbox"

                        checked={editReserva.educativo === true}

                        onChange={(e) => setEditReserva({ ...editReserva, educativo: e.target.checked })}

                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"

                      />

                      <FaGraduationCap className="h-3.5 w-3.5 text-slate-500" />

                      Escola / faculdade

                    </label>

                  </div>
                  </div>

                </div>

                <div className="flex flex-col sm:flex-row items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 sm:px-6 py-4">

                  <button

                    onClick={() => {
                      setModalReserva(false);
                      setEditReserva(null);
                      setReservaOriginalEmEdicao(null);
                    }}

                    className="w-full sm:w-auto rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-800"

                  >

                    Cancelar

                  </button>

                  <button

                    onClick={handleSaveReserva}

                    className="w-full sm:w-auto rounded-full bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700"

                  >

                    Salvar reserva

                  </button>

                </div>

              </div>

            </div>

          )}

        </section>

      )}



            {/* ========== Pacotes ========== */}

      {aba === 'pacotes' && (

        <section className="admin-tab-content space-y-6">

          <AdminTabHeader
            title="Pacotes e combos"
            description={'Organize as experiencias vendidas pela Vagafogo, ajuste horarios, limites e precos e mantenha o catalogo pronto para o time comercial.'}
            icon={FaLayerGroup}
            actions={[
              {
                label: 'Novo pacote',
                icon: FaPlus,
                onClick: handleAddPacote,
                variant: 'primary',
              },
            ]}
            metrics={[
              {
                label: 'Pacotes ativos',
                value: totalPacotesAtivos.toLocaleString('pt-BR'),
                hint: 'Atividades prontas para venda',
                icon: FaLayerGroup,
                tone: 'sky',
              },
              {
                label: 'Combos ativos',
                value: totalCombosAtivos.toLocaleString('pt-BR'),
                hint: 'Ofertas combinadas habilitadas',
                icon: FaCheck,
                tone: 'emerald',
              },
              {
                label: 'Sem pet',
                value: pacotesQueNaoAceitamPet.toLocaleString('pt-BR'),
                hint: 'Pacotes com restricao para pets',
                icon: FaQuestionCircle,
                tone: 'amber',
              },
              {
                label: 'Tipos precificados',
                value: tiposClientesAtivos.length.toLocaleString('pt-BR'),
                hint: 'Categorias disponiveis para composicao de preco',
                icon: FaUsers,
                tone: 'indigo',
              },
            ]}
          />

          {pacotes.length === 0 ? (

            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500">

              Nenhum pacote cadastrado. Clique em "Novo pacote" para começar.

            </div>

          ) : (

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">

              {pacotes.map((pacote) => {

                const diasLabel = pacote.dias.length > 0 ? pacote.dias.map((i) => diasDaSemana[i]).join(', ') : 'Todos os dias';

                const horariosLabel =

                  pacote.modoHorario === 'intervalo' && pacote.horarioInicio && pacote.horarioFim

                    ? `${pacote.horarioInicio} - ${pacote.horarioFim} (faixa)`

                    : pacote.horarios.join(', ') || 'Sob consulta';

                const precosResumo = tiposClientesAtivos.map((tipo) => ({

                  key: obterChaveTipo(tipo),

                  nome: tipo.nome,

                  valor: obterPrecoPorTipo(pacote.precosPorTipo, tipo, pacote),

                }));

                return (

                  <article key={pacote.id} className="flex h-full flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-lg">

                    <div className="space-y-4">

                      <div className="flex items-start justify-between gap-4">

                        <div>

                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{pacote.tipo || 'Atividade'}</p>

                          <h3 className="mt-1 text-lg font-semibold text-slate-900">{pacote.nome}</h3>

                        </div>

                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${pacote.aceitaPet ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-600'}`}>

                      {pacote.aceitaPet ? 'Aceita pets' : 'Não aceita pets'}

                        </span>

                      </div>

                      <dl className="space-y-3 text-sm text-slate-600">

                        <div className="flex items-start justify-between gap-2">

                          <dt className="font-medium text-slate-500">Dias</dt>

                          <dd className="text-right text-slate-800">{diasLabel}</dd>

                        </div>

                        <div className="flex items-start justify-between gap-2">

                          <dt className="font-medium text-slate-500">Horário</dt>

                          <dd className="text-right text-slate-800">{horariosLabel}</dd>

                        </div>

                        <div>

                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Valores</p>

                          <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-600">

                            {precosResumo.map((item) => (

                              <span key={item.key} className="rounded-full bg-slate-100 px-2 py-1">

                                {item.nome} {formatCurrency(item.valor)}

                              </span>

                            ))}

                          </div>

                        </div>

                        <div className="flex items-center justify-between text-xs text-slate-500">

                          <span>Limite por horário</span>

                          <span className="font-semibold text-slate-800">{pacote.limite}</span>

                        </div>

                        <div className="flex items-center justify-between text-xs text-slate-500">

                          <span>Datas bloqueadas</span>

                          <span className="font-semibold text-slate-800">{pacote.datasBloqueadas?.length ?? 0}</span>

                        </div>

                      </dl>

                    </div>

                    <div className="mt-5 flex items-center justify-between gap-3 border-t border-slate-200 pt-4">

                      <button

                        onClick={() => pacote.id && excluirPacote(pacote.id)}

                        className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-600 transition hover:bg-rose-100"

                      >

                        <FaTrash className="h-3.5 w-3.5" />

                        Excluir

                      </button>

                      <button

                        onClick={() => handleEditPacote(pacote)}

                        className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-blue-300 hover:text-blue-600"

                      >

                        <FaEdit className="h-3.5 w-3.5" />

                        Editar

                      </button>

                    </div>

                  </article>

                );

              })}

            </div>

          )}












          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Combos de pacotes</h3>
                <p className="text-sm text-slate-500">
                  Agrupe atividades existentes e ofereça um valor especial aos clientes.
                </p>
              </div>
              <button
                onClick={handleAddCombo}
                disabled={pacotes.length === 0}
                className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-white shadow-sm transition ${
                  pacotes.length === 0 ? 'bg-slate-300 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                <FaLayerGroup className="h-4 w-4" />
                Novo combo
              </button>
            </div>
            {pacotes.length === 0 ? (
              <p className="py-6 text-sm text-slate-500">Cadastre ao menos um pacote antes de criar combos.</p>
            ) : combos.length === 0 ? (
              <p className="py-6 text-sm text-slate-500">Nenhum combo cadastrado até o momento.</p>
            ) : (
              <div className="mt-4 space-y-4">
                {combos.map((combo) => {
                  const pacoteNomes = combo.pacoteIds
                    .map((id) => (id ? pacotesPorId.get(id)?.nome ?? 'Pacote removido' : ''))
                    .filter((nome) => nome && nome.length > 0);
                  const precosResumo = tiposClientesAtivos.map((tipo) => ({

                    key: obterChaveTipo(tipo),

                    nome: tipo.nome,

                    valor: obterPrecoPorTipo(combo.precosPorTipo, tipo, combo),

                  }));
                  return (
                    <article key={combo.id ?? combo.nome} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-3">
                            <h4 className="text-base font-semibold text-slate-900">{combo.nome}</h4>
                            <span
                              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                combo.ativo !== false ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'
                              }`}
                            >
                              {combo.ativo !== false ? 'Ativo' : 'Inativo'}
                            </span>
                          </div>
                          <div className="space-y-1 text-sm text-slate-600">
                            {precosResumo.map((item) => (
                              <p key={item.key}>
                                <span className="font-semibold text-slate-700">{item.nome}:</span> {formatCurrency(item.valor)}
                              </p>
                            ))}
                          </div>
                          <p className="text-xs text-slate-500">
                            Inclui: {pacoteNomes.length > 0 ? pacoteNomes.join(', ') : 'Pacotes removidos'}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => handleEditCombo(combo)}
                            className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-blue-300 hover:text-blue-600"
                          >
                            <FaEdit className="h-3.5 w-3.5" />
                            Editar
                          </button>
                          <button
                            onClick={() => combo.id && handleDeleteCombo(combo.id)}
                            className="inline-flex items-center gap-2 rounded-full border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-50"
                          >
                            <FaTrash className="h-3.5 w-3.5" />
                            Excluir
                          </button>
                        </div>
                      </div>
                      <div className="mt-4 flex flex-col gap-3 border-t border-dashed border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-xs text-slate-500">Ative ou desative o combo rapidamente.</p>
                        <button
                          onClick={() => handleToggleComboAtivo(combo)}
                          className={`inline-flex items-center justify-center rounded-full px-4 py-2 text-xs font-semibold transition ${
                            combo.ativo !== false ? 'bg-slate-100 text-slate-600 hover:bg-slate-200' : 'bg-emerald-600 text-white hover:bg-emerald-700'
                          }`}
                        >
                          {combo.ativo !== false ? 'Desativar combo' : 'Ativar combo'}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>


          {modalPacote && editPacote && (

            <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/60 px-2 py-2 overflow-y-auto">

              <div className="w-full max-w-3xl my-4 overflow-hidden rounded-2xl bg-white shadow-2xl">

                <div className="flex items-center justify-between border-b border-slate-200 px-4 sm:px-6 py-4">

                  <h4 className="text-lg font-semibold text-slate-900">

                    {isEditingPacote ? 'Editar pacote' : 'Novo pacote'}

                  </h4>

                  <button

                    onClick={() => {

                      setModalPacote(false);

                      setEditPacote(null);

                      setNovaDataBloqueada('');

                    }}

                    className="rounded-full border border-slate-200 p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"

                  >

                    x

                  </button>

                </div>

                <div className="grid gap-4 px-4 sm:px-6 py-5 md:grid-cols-2 max-h-[80vh] overflow-y-auto">

                  <label className="text-xs font-semibold uppercase text-slate-500">

                    Nome da atividade

                    <input

                      value={editPacote.nome}

                      onChange={(e) => setEditPacote((f) => ({ ...f!, nome: e.target.value }))}

                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"

                    />

                  </label>

                  <label className="text-xs font-semibold uppercase text-slate-500">

                    Tipo de atividade

                    <input

                      value={editPacote.tipo}

                      onChange={(e) => setEditPacote((f) => ({ ...f!, tipo: e.target.value }))}

                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"

                    />

                  </label>

                  <div className="md:col-span-2">

                    <p className="text-xs font-semibold uppercase text-slate-500">Preços por tipo</p>

                    <div className="mt-2 grid gap-3 sm:grid-cols-3">

                      {tiposClientesAtivos.map((tipo) => {

                        const chave = obterChaveTipo(tipo);

                        const valor = obterPrecoPorTipo(editPacote.precosPorTipo, tipo, editPacote);

                        return (

                          <label key={chave} className="text-xs font-semibold uppercase text-slate-500">

                            {tipo.nome}

                            <input

                              type="number"

                              value={valor}

                              onChange={(e) =>

                                setEditPacote((prev) => {

                                  if (!prev) return prev;

                                  const precosPorTipo = {

                                    ...(prev.precosPorTipo ?? {}),

                                    [chave]: Number(e.target.value),

                                  };

                                  return { ...prev, precosPorTipo };

                                })

                              }

                              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"

                            />

                          </label>

                        );

                      })}

                    </div>

                  </div>

                  <label className="text-xs font-semibold uppercase text-slate-500">

                    Limite por horário

                    <input

                      type="number"

                      value={editPacote.limite}

                      onChange={(e) => setEditPacote((f) => ({ ...f!, limite: Number(e.target.value) }))}

                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"

                    />

                  </label>

                  <div className="text-xs font-semibold uppercase text-slate-500">

                    Política de pets

                    <div className="mt-2 flex gap-4 text-xs font-medium text-slate-600">

                      <label className="flex items-center gap-2">

                        <input

                          type="radio"

                          name="aceitaPet"

                          checked={editPacote.aceitaPet}

                          onChange={() => setEditPacote((f) => ({ ...f!, aceitaPet: true }))}

                        />

                        Aceita

                      </label>

                      <label className="flex items-center gap-2">

                        <input

                          type="radio"

                          name="aceitaPet"

                          checked={!editPacote.aceitaPet}

                          onChange={() => setEditPacote((f) => ({ ...f!, aceitaPet: false }))}

                        />

                        Não aceita

                      </label>

                    </div>

                  </div>

                  <div className="text-xs font-semibold uppercase text-slate-500 md:col-span-2">

                    Aviso para o cliente (opcional)

                    <textarea
                      value={editPacote.aviso ?? ''}
                      onChange={(e) => setEditPacote((f) => ({ ...f!, aviso: e.target.value }))}
                      placeholder="Ex: Chegar 15 minutos antes do horário. Levar protetor solar."
                      rows={2}
                      className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 font-normal normal-case tracking-normal focus:outline-none focus:ring-2 focus:ring-[#8B4F23]/20 focus:border-[#8B4F23]"
                    />

                    <p className="mt-1 text-xs font-normal normal-case tracking-normal text-slate-400">
                      Aparece em destaque quando o cliente escolhe o horário desse pacote.
                    </p>

                  </div>

                  <div className="text-xs font-semibold uppercase text-slate-500 md:col-span-2">

                    Dias disponíveis

                    <div className="mt-2 flex flex-wrap gap-2">

                      {diasDaSemana.map((dia, index) => {

                        const ativo = editPacote.dias.includes(index);

                        return (

                          <button

                            key={dia}

                            type="button"

                            onClick={() =>

                              setEditPacote((f) => ({

                                ...f!,

                                dias: ativo ? f!.dias.filter((d) => d !== index) : [...f!.dias, index],

                              }))

                            }

                            className={`rounded-full px-3 py-1 text-xs font-medium transition ${

                              ativo ? 'bg-blue-600 text-white' : 'border border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100'

                            }`}

                          >

                            {dia}

                          </button>

                        );

                      })}

                    </div>

                  </div>

                  <div className="text-xs font-semibold uppercase text-slate-500 md:col-span-2">

                    Formato de horários

                    <select

                      value={editPacote.modoHorario ?? 'lista'}

                      onChange={(e) => setEditPacote((f) => ({ ...f!, modoHorario: e.target.value as 'lista' | 'intervalo' }))}

                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"

                    >

                      <option value="lista">Horários fixos</option>

                      <option value="intervalo">Faixa contínua</option>

                    </select>

                  </div>

                  {editPacote.modoHorario === 'intervalo' ? (

                    <div className="grid gap-4 md:col-span-2 md:grid-cols-2">

                      <label className="text-xs font-semibold uppercase text-slate-500">

                        Horário inicial

                        <input

                          type="time"

                          value={editPacote.horarioInicio ?? ''}

                          onChange={(e) => setEditPacote((f) => ({ ...f!, horarioInicio: e.target.value }))}

                          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"

                        />

                      </label>

                      <label className="text-xs font-semibold uppercase text-slate-500">

                        Horário final

                        <input

                          type="time"

                          value={editPacote.horarioFim ?? ''}

                          onChange={(e) => setEditPacote((f) => ({ ...f!, horarioFim: e.target.value }))}

                          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"

                        />

                      </label>

                      <p className="md:col-span-2 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">

                        {faixaHorarioDescricao || 'Informe horário inicial e final para exibir apenas a faixa ao cliente.'}

                      </p>

                    </div>

                  ) : (

                    <div className="text-xs font-semibold uppercase text-slate-500 md:col-span-2">

                      Horários disponíveis

                      <div className="mt-2 flex flex-wrap gap-2">

                        {horariosDisponiveis.map((horario) => {

                          const ativo = editPacote.horarios.includes(horario);

                          return (

                            <button

                              key={horario}

                              type="button"

                              onClick={() =>

                                setEditPacote((f) => ({

                                  ...f!,

                                  horarios: ativo ? f!.horarios.filter((h) => h !== horario) : [...f!.horarios, horario],

                                }))

                              }

                              className={`rounded-full px-3 py-1 text-xs font-medium transition ${

                                ativo ? 'bg-blue-600 text-white' : 'border border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100'

                              }`}

                            >

                              {horario}

                            </button>

                          );

                        })}

                      </div>

                    </div>

                  )}

                  <div className="text-xs font-semibold uppercase text-slate-500 md:col-span-2">

                    Datas sem disponibilidade

                    <div className="mt-2 flex gap-2">

                      <input

                        type="date"

                        value={novaDataBloqueada}

                        onChange={(e) => setNovaDataBloqueada(e.target.value)}

                        className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"

                      />

                      <button

                        type="button"

                        onClick={adicionarDataBloqueada}

                        disabled={!novaDataBloqueada}

                        className={`rounded-full px-4 py-2 text-sm font-semibold text-white shadow-sm transition ${

                          novaDataBloqueada ? 'bg-blue-600 hover:bg-blue-700' : 'bg-slate-300 cursor-not-allowed'

                        }`}

                      >

                        Adicionar

                      </button>

                    </div>

                    {(editPacote.datasBloqueadas?.length ?? 0) > 0 ? (

                      <ul className="mt-3 max-h-32 space-y-2 overflow-y-auto">

                        {editPacote.datasBloqueadas?.map((data) => (

                          <li key={data} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">

                            <span>{dayjs(data).format('DD/MM/YYYY')}</span>

                            <button

                              type="button"

                              onClick={() => removerDataBloqueada(data)}

                              className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-600 transition hover:bg-rose-100"

                            >

                              Remover

                            </button>

                          </li>

                        ))}

                      </ul>

                    ) : (

                      <p className="mt-3 text-xs text-slate-400">Nenhuma data bloqueada.</p>

                    )}

                  </div>

                  

                  <div className="text-xs font-semibold uppercase text-slate-500 md:col-span-2">

                    Perguntas personalizadas para o cliente

                    <div className="mt-2 space-y-3">

                      <div className="flex gap-2">

                        <input

                          type="text"

                          placeholder="Ex: Juntar mesa?"

                          value={novaPergunta.pergunta}

                          onChange={(e) => setNovaPergunta(prev => ({ ...prev, pergunta: e.target.value }))}

                          className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"

                        />

                        <select

                          value={novaPergunta.tipo}

                          onChange={(e) => setNovaPergunta(prev => ({ ...prev, tipo: e.target.value as 'sim_nao' | 'texto' }))}

                          className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"

                        >

                          <option value="sim_nao">Sim/Não</option>

                          <option value="texto">Texto</option>

                        </select>

                        <label className="flex items-center gap-1 text-xs">

                          <input

                            type="checkbox"

                            checked={novaPergunta.obrigatoria}

                            onChange={(e) => setNovaPergunta(prev => ({ ...prev, obrigatoria: e.target.checked }))}

                          />

                          Obrigatória

                        </label>

                        <button

                          type="button"

                          onClick={adicionarPergunta}

                          disabled={!novaPergunta.pergunta.trim()}

                          className={`rounded-full px-4 py-2 text-sm font-semibold text-white shadow-sm transition ${

                            novaPergunta.pergunta.trim() ? 'bg-blue-600 hover:bg-blue-700' : 'bg-slate-300 cursor-not-allowed'

                          }`}

                        >

                          Adicionar

                        </button>

                      </div>

                      {novaPergunta.tipo === 'sim_nao' && (
                        <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                            Emojis no resumo da reserva
                          </p>
                          <div className="flex flex-wrap items-end gap-3">
                            <label className="flex flex-col gap-1 text-[11px] font-medium text-slate-600">
                              <span>Quando "Sim"</span>
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="text"
                                  value={novaPergunta.emojiSim}
                                  onChange={(e) => setNovaPergunta((p) => ({ ...p, emojiSim: e.target.value.slice(0, 4) }))}
                                  className="w-16 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-center text-lg shadow-sm focus:border-blue-500 focus:outline-none"
                                  maxLength={4}
                                />
                                <div className="flex gap-1">
                                  {['✅', '🟢', '👍', '🐾', '🌿'].map((e) => (
                                    <button
                                      key={e}
                                      type="button"
                                      onClick={() => setNovaPergunta((p) => ({ ...p, emojiSim: e }))}
                                      className="w-7 h-7 rounded border border-slate-200 bg-white text-sm hover:bg-slate-100"
                                    >{e}</button>
                                  ))}
                                </div>
                              </div>
                            </label>
                            <label className="flex flex-col gap-1 text-[11px] font-medium text-slate-600">
                              <span>Quando "Não"</span>
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="text"
                                  value={novaPergunta.emojiNao}
                                  onChange={(e) => setNovaPergunta((p) => ({ ...p, emojiNao: e.target.value.slice(0, 4) }))}
                                  className="w-16 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-center text-lg shadow-sm focus:border-blue-500 focus:outline-none"
                                  maxLength={4}
                                />
                                <div className="flex gap-1">
                                  {['❌', '🔴', '👎', '🚫', '⛔'].map((e) => (
                                    <button
                                      key={e}
                                      type="button"
                                      onClick={() => setNovaPergunta((p) => ({ ...p, emojiNao: e }))}
                                      className="w-7 h-7 rounded border border-slate-200 bg-white text-sm hover:bg-slate-100"
                                    >{e}</button>
                                  ))}
                                </div>
                              </div>
                            </label>
                          </div>
                          <p className="mt-2 text-[10px] text-slate-400">
                            Esses emojis serão exibidos no resumo da reserva no painel.
                          </p>
                        </div>
                      )}

                      {(editPacote.perguntasPersonalizadas?.length ?? 0) > 0 ? (

                        <ul className="space-y-2">

                          {editPacote.perguntasPersonalizadas?.map((pergunta) => (

                            <li key={pergunta.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs">

                              <div className="flex-1">

                                <span className="font-medium text-slate-700">{pergunta.pergunta}</span>

                                <span className="ml-2 text-slate-500">({pergunta.tipo === 'sim_nao' ? 'Sim/Não' : 'Texto'})</span>

                                {pergunta.obrigatoria && <span className="ml-1 text-red-500">*</span>}

                                {pergunta.tipo === 'sim_nao' && (pergunta.emojiSim || pergunta.emojiNao) && (
                                  <span className="ml-2 inline-flex items-center gap-1 text-slate-500">
                                    {pergunta.emojiSim && <span>Sim {pergunta.emojiSim}</span>}
                                    {pergunta.emojiNao && <span>· Não {pergunta.emojiNao}</span>}
                                  </span>
                                )}

                              </div>

                              <button

                                type="button"

                                onClick={() => removerPergunta(pergunta.id)}

                                className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-600 transition hover:bg-rose-100"

                              >

                                Remover

                              </button>

                            </li>

                          ))}

                        </ul>

                      ) : (

                        <p className="text-xs text-slate-400">Nenhuma pergunta personalizada.</p>

                      )}

                    </div>

                  </div>

                </div>

                <div className="flex flex-col sm:flex-row items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 sm:px-6 py-4">

                  <button

                    onClick={() => {

                      setModalPacote(false);

                      setEditPacote(null);

                      setNovaDataBloqueada('');

                    }}

                    className="w-full sm:w-auto rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-800"

                  >

                    Cancelar

                  </button>

                  <button

                    onClick={handleSavePacote}

                    className="w-full sm:w-auto rounded-full bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700"

                  >

                    Salvar pacote

                  </button>

                </div>

              </div>

            </div>

          )}

          {modalCombo && editCombo && (

            <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/60 px-2 py-2 overflow-y-auto">

              <div className="w-full max-w-2xl my-4 overflow-hidden rounded-2xl bg-white shadow-2xl">

                <div className="flex items-center justify-between border-b border-slate-200 px-4 sm:px-6 py-4">

                  <h4 className="text-lg font-semibold text-slate-900">

                    {isEditingCombo ? 'Editar combo' : 'Novo combo'}

                  </h4>

                  <button

                    onClick={() => {

                      setModalCombo(false);

                      setEditCombo(null);

                    }}

                    className="rounded-full border border-slate-200 p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"

                  >

                    x

                  </button>

                </div>

                <div className="space-y-5 px-4 sm:px-6 py-5 max-h-[75vh] overflow-y-auto">

                  <label className="text-xs font-semibold uppercase text-slate-500">

                    Nome do combo

                    <input

                      value={editCombo.nome}

                      onChange={(e) => setEditCombo((prev) => (prev ? { ...prev, nome: e.target.value } : prev))}

                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"

                    />

                  </label>

                  <div className="space-y-2">

                    <p className="text-xs font-semibold uppercase text-slate-500">Preços por tipo (R$)</p>

                    <div className="grid gap-3 sm:grid-cols-3 text-xs font-semibold uppercase text-slate-500">

                      {tiposClientesAtivos.map((tipo) => {

                        const chave = obterChaveTipo(tipo);

                        const valor = obterPrecoPorTipo(editCombo.precosPorTipo, tipo, editCombo);

                        return (

                          <label key={chave}>

                            {tipo.nome}

                            <input

                              type="number"

                              min="0"

                              value={valor}

                              onChange={(e) =>

                                setEditCombo((prev) => {

                                  if (!prev) return prev;

                                  const precosPorTipo = {

                                    ...(prev.precosPorTipo ?? {}),

                                    [chave]: Number(e.target.value),

                                  };

                                  return { ...prev, precosPorTipo };

                                })

                              }

                              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"

                            />

                          </label>

                        );

                      })}

                    </div>

                  </div>

                  <label className="flex items-center gap-2 text-xs font-semibold uppercase text-slate-500">

                    <input

                      type="checkbox"

                      checked={editCombo.ativo !== false}

                      onChange={(e) => setEditCombo((prev) => (prev ? { ...prev, ativo: e.target.checked } : prev))}

                    />

                    Combo ativo

                  </label>

                  <div>

                    <p className="text-xs font-semibold uppercase text-slate-500">Selecione os pacotes</p>

                    {pacotes.length === 0 ? (

                      <p className="mt-2 text-sm text-slate-500">Cadastre pacotes antes de montar um combo.</p>

                    ) : (

                      <div className="mt-3 grid max-h-64 gap-2 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">

                        {pacotes.map((pacote) => {

                          if (!pacote.id) return null;

                          const selecionado = editCombo.pacoteIds.includes(pacote.id);

                          return (

                            <label

                              key={pacote.id}

                              className={`flex items-center justify-between rounded-lg border px-3 py-2 text-xs font-medium transition ${

                                selecionado ? 'border-emerald-200 bg-white text-emerald-700' : 'border-transparent bg-white text-slate-600'

                              }`}

                            >

                              <span>{pacote.nome}</span>

                              <input

                                type="checkbox"

                                checked={selecionado}

                                onChange={(e) =>

                                  setEditCombo((prev) => {

                                    if (!prev) return prev;

                                    const ids = new Set(prev.pacoteIds ?? []);

                                    if (e.target.checked) {

                                      ids.add(pacote.id!);

                                    } else {

                                      ids.delete(pacote.id!);

                                    }

                                    return { ...prev, pacoteIds: Array.from(ids) };

                                  })

                                }

                              />

                            </label>

                          );

                        })}

                      </div>

                    )}

                  </div>

                </div>

                <div className="flex flex-col gap-2 border-t border-slate-200 bg-slate-50 px-4 sm:px-6 py-4 sm:flex-row sm:items-center sm:justify-end">

                  <button

                    onClick={() => {

                      setModalCombo(false);

                      setEditCombo(null);

                    }}

                    className="w-full rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-800 sm:w-auto"

                  >

                    Cancelar

                  </button>

                  <button

                    onClick={handleSaveCombo}

                    disabled={salvandoCombo || pacotes.length === 0}

                    className={`w-full rounded-full px-4 py-2 text-xs font-semibold text-white shadow-sm transition sm:w-auto ${

                      salvandoCombo || pacotes.length === 0

                        ? 'bg-emerald-200 cursor-not-allowed'

                        : 'bg-emerald-600 hover:bg-emerald-700'

                    }`}

                  >

                    {salvandoCombo ? 'Salvando...' : 'Salvar combo'}

                  </button>

                </div>

              </div>

            </div>

          )}

          

        </section>

      )}

          {/* Modal Editar Disponibilidade */}

          {modalDisponibilidade && (

            <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/60 px-2 py-2 overflow-y-auto">

              <div className="w-full max-w-4xl my-4 overflow-hidden rounded-2xl bg-white shadow-2xl">

                <div className="flex items-center justify-between border-b border-slate-200 px-4 sm:px-6 py-4">

                  <h4 className="text-lg font-semibold text-slate-900">

                    Editar disponibilidade - {dayjs(selectedDate).format('DD/MM/YYYY')}

                  </h4>

                  <button

                    onClick={() => setModalDisponibilidade(false)}

                    className="rounded-full border border-slate-200 p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"

                  >

                    x

                  </button>

                </div>

                <div className="px-4 sm:px-6 py-5 max-h-[80vh] overflow-y-auto">

                  {carregandoDisponibilidade ? (

                    <div className="py-6 text-center text-sm text-slate-500">

                      Carregando disponibilidade...

                    </div>

                  ) : (

                    <div className="space-y-6">
                      <div className="grid gap-6 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
                        <div className="space-y-4">

                          <div className="rounded-xl border border-orange-200 bg-white p-4">
                            <div>
                              <p className="text-sm font-semibold text-slate-900">Ajuste por periodo</p>
                              <p className="text-xs text-slate-500">
                                Aplica fechamento ou reabertura em varias datas.
                              </p>
                            </div>
                            <div className="mt-3 grid gap-3 sm:grid-cols-2">
                              <label className="text-xs font-semibold uppercase text-orange-700">
                                Inicio do periodo
                                <input
                                  type="date"
                                  value={fechamentoInicio}
                                  onChange={(e) => setFechamentoInicio(e.target.value)}
                                  className="mt-1 w-full rounded-lg border border-orange-200 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                                />
                              </label>
                              <label className="text-xs font-semibold uppercase text-orange-700">
                                Fim do periodo
                                <input
                                  type="date"
                                  value={fechamentoFim}
                                  onChange={(e) => setFechamentoFim(e.target.value)}
                                  className="mt-1 w-full rounded-lg border border-orange-200 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                                />
                              </label>
                            </div>
                            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
                              <label className="flex w-full flex-col text-xs font-semibold uppercase text-orange-700">
                                Acao
                                <select
                                  value={acaoFechamentoPeriodo}
                                  onChange={(e) => setAcaoFechamentoPeriodo(e.target.value as 'fechar' | 'abrir')}
                                  className="mt-1 w-full rounded-lg border border-orange-200 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                                >
                                  <option value="fechar">Fechar periodo</option>
                                  <option value="abrir">Reabrir periodo</option>
                                </select>
                              </label>
                              <button
                                type="button"
                                onClick={aplicarFechamentoPeriodo}
                                disabled={processandoFechamentoPeriodo}
                                className={`w-full rounded-full px-4 py-2 text-xs font-semibold text-white transition ${
                                  processandoFechamentoPeriodo
                                    ? 'bg-orange-200 cursor-not-allowed'
                                    : 'bg-orange-600 hover:bg-orange-700'
                                }`}
                              >
                                {processandoFechamentoPeriodo ? 'Aplicando...' : 'Aplicar ajuste para o periodo'}
                              </button>
                            </div>
                            <p className="mt-2 text-xs text-slate-500">
                              Essa acao fecha ou reabre todos os pacotes no periodo selecionado.
                            </p>
                          </div>

                          {(() => {
                            const dataStr = dayjs(selectedDate).format('YYYY-MM-DD');
                            const chaveExtraDiaGeral = montarChaveVagasExtrasDiaGeral(dataStr);
                            const vagasExtrasDiaGeral =
                              vagasExtrasDisponibilidade[chaveExtraDiaGeral] ?? 0;
                            const totalVagasExtrasHorarioGeral =
                              horariosDisponibilidadeGerais.reduce((total, horario) => {
                                const chaveHorario = montarChaveVagasExtrasHorarioGeral(
                                  dataStr,
                                  horario
                                );
                                return total + (vagasExtrasDisponibilidade[chaveHorario] ?? 0);
                              }, 0);

                            return (
                              <div className="rounded-xl border border-blue-200 bg-white p-4">
                                <div>
                                  <p className="text-sm font-semibold text-slate-900">
                                    Adicionar vagas extras
                                  </p>
                                  <p className="text-xs text-slate-500">
                                    Ajuste geral para esta data ou para um horario especifico.
                                    Esse valor soma com o ajuste especifico de cada pacote.
                                  </p>
                                </div>

                                <div className="mt-4 space-y-4">
                                  <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                                    <div className="flex items-start justify-between gap-3">
                                      <div>
                                        <p className="text-sm font-semibold text-blue-900">
                                          Vagas extras gerais do dia
                                        </p>
                                        <p className="text-xs text-blue-800/80">
                                          Vale para todos os pacotes nesta data.
                                        </p>
                                      </div>
                                      <span className="rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-blue-700">
                                        Atual: +{vagasExtrasDiaGeral}
                                      </span>
                                    </div>
                                    <label className="mt-3 block text-[11px] font-semibold uppercase tracking-wide text-blue-900">
                                      Quantidade
                                      <input
                                        type="number"
                                        min="0"
                                        step="1"
                                        value={vagasExtrasDiaGeral > 0 ? vagasExtrasDiaGeral : ''}
                                        onChange={(e) =>
                                          atualizarVagasExtrasDisponibilidade(
                                            chaveExtraDiaGeral,
                                            e.target.value
                                          )
                                        }
                                        className="mt-1 w-full rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                        placeholder="0"
                                      />
                                    </label>
                                    <div className="mt-3 flex flex-wrap gap-2">
                                      {opcoesAjusteRapidoVagas.map((incremento) => (
                                        <button
                                          key={`geral-dia-${incremento}`}
                                          type="button"
                                          onClick={() =>
                                            somarVagasExtrasDisponibilidade(
                                              chaveExtraDiaGeral,
                                              incremento
                                            )
                                          }
                                          className="rounded-full border border-blue-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-blue-700 transition hover:border-blue-300 hover:text-blue-900"
                                        >
                                          +{incremento} vaga{incremento !== 1 ? 's' : ''}
                                        </button>
                                      ))}
                                      {vagasExtrasDiaGeral > 0 && (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            atualizarVagasExtrasDisponibilidade(
                                              chaveExtraDiaGeral,
                                              ''
                                            )
                                          }
                                          className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
                                        >
                                          Limpar ajuste
                                        </button>
                                      )}
                                    </div>
                                  </div>

                                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                                    <div className="flex items-start justify-between gap-3">
                                      <div>
                                        <p className="text-sm font-semibold text-slate-900">
                                          Vagas extras por horario
                                        </p>
                                        <p className="text-xs text-slate-500">
                                          Use quando precisar reforcar apenas horarios pontuais.
                                        </p>
                                      </div>
                                      <span className="rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-slate-600">
                                        Total: +{totalVagasExtrasHorarioGeral}
                                      </span>
                                    </div>

                                    {horariosDisponibilidadeGerais.length === 0 ? (
                                      <p className="mt-3 text-xs text-slate-500">
                                        Nenhum horario fixo cadastrado nos pacotes para ajustar aqui.
                                      </p>
                                    ) : (
                                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                        {horariosDisponibilidadeGerais.map((horario) => {
                                          const chaveHorario = montarChaveVagasExtrasHorarioGeral(
                                            dataStr,
                                            horario
                                          );
                                          const vagasExtrasHorario =
                                            vagasExtrasDisponibilidade[chaveHorario] ?? 0;

                                          return (
                                            <div
                                              key={`geral-${horario}`}
                                              className="rounded-lg border border-slate-200 bg-white p-3"
                                            >
                                              <div className="flex items-start justify-between gap-3">
                                                <div>
                                                  <p className="text-sm font-semibold text-slate-900">
                                                    {horario}
                                                  </p>
                                                  <p className="text-xs text-slate-500">
                                                    Ajuste geral deste horario.
                                                  </p>
                                                </div>
                                                <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">
                                                  +{vagasExtrasHorario}
                                                </span>
                                              </div>
                                              <label className="mt-3 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                                Quantidade
                                                <input
                                                  type="number"
                                                  min="0"
                                                  step="1"
                                                  value={
                                                    vagasExtrasHorario > 0 ? vagasExtrasHorario : ''
                                                  }
                                                  onChange={(e) =>
                                                    atualizarVagasExtrasDisponibilidade(
                                                      chaveHorario,
                                                      e.target.value
                                                    )
                                                  }
                                                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-300"
                                                  placeholder="0"
                                                />
                                              </label>
                                              <div className="mt-3 flex flex-wrap gap-2">
                                                {opcoesAjusteRapidoVagas.map((incremento) => (
                                                  <button
                                                    key={`geral-${horario}-${incremento}`}
                                                    type="button"
                                                    onClick={() =>
                                                      somarVagasExtrasDisponibilidade(
                                                        chaveHorario,
                                                        incremento
                                                      )
                                                    }
                                                    className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-800"
                                                  >
                                                    +{incremento}
                                                  </button>
                                                ))}
                                                {vagasExtrasHorario > 0 && (
                                                  <button
                                                    type="button"
                                                    onClick={() =>
                                                      atualizarVagasExtrasDisponibilidade(
                                                        chaveHorario,
                                                        ''
                                                      )
                                                    }
                                                    className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
                                                  >
                                                    Limpar
                                                  </button>
                                                )}
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })()}

                        </div>

                        <div className="space-y-4">

                          {pacotes.length === 0 ? (
                            <div className="py-6 text-center text-sm text-slate-500">
                              Nenhum pacote cadastrado para configurar disponibilidade.

                            </div>
                          ) : (
                            <div className="space-y-4">
                              {pacotes.map((pacote) => {
                                const dataStr = dayjs(selectedDate).format('YYYY-MM-DD');
                                const pacoteKey = `${dataStr}-${pacote.id}`;
                                const pacoteId = pacote.id ?? '';
                                const aberto = pacotesDisponibilidadeAbertos[pacoteId] ?? false;
                                const horariosPacote = pacote.horarios ?? [];
                                const totalHorarios = horariosPacote.length;
                                const chaveExtraDia = pacoteId
                                  ? montarChaveVagasExtrasDia(dataStr, pacoteId)
                                  : '';
                                const vagasExtrasDia = chaveExtraDia
                                  ? vagasExtrasDisponibilidade[chaveExtraDia] ?? 0
                                  : 0;
                                const bloqueados = horariosPacote.filter(
                                  (horario) => disponibilidadeData[`${pacoteKey}-${horario}`] === false
                                ).length;
                                const vagasExtrasHorarios = horariosPacote.reduce((total, horario) => {
                                  if (!pacoteId) return total;
                                  const chaveHorario = montarChaveVagasExtrasHorario(
                                    dataStr,
                                    pacoteId,
                                    horario
                                  );
                                  return total + (vagasExtrasDisponibilidade[chaveHorario] ?? 0);
                                }, 0);
                                const totalVagasExtrasPacote = vagasExtrasDia + vagasExtrasHorarios;
                                const resumoDisponibilidadePacote =
                                  pacote.modoHorario === 'intervalo'
                                    ? 'Faixa de horario por dia'
                                    : totalHorarios > 0
                                      ? `${bloqueados} bloqueados de ${totalHorarios} horarios`
                                      : 'Sem horarios configurados';
                                const indicador =
                                  pacote.emoji ||
                                  (pacote.nome ? pacote.nome.trim().charAt(0).toUpperCase() : '') ||
                                  'P';

                                return (
                                  <div key={pacote.id} className="rounded-xl border border-slate-200 bg-white p-4">
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                      <div className="flex items-start gap-3">
                                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-base font-semibold text-slate-600">
                                          {indicador}
                                        </div>
                                        <div>
                                          <h5 className="font-semibold text-slate-900">{pacote.nome}</h5>
                                          <p className="text-xs text-slate-500">
                                            {resumoDisponibilidadePacote}
                                            {totalVagasExtrasPacote > 0
                                              ? ` · +${totalVagasExtrasPacote} vaga(s) extras no pacote`
                                              : ''}
                                          </p>
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        {pacote.modoHorario === 'intervalo' && (
                                          <span className="rounded-full bg-yellow-100 px-2 py-1 text-xs font-semibold text-yellow-700">
                                            Faixa de horario
                                          </span>
                                        )}
                                        <button
                                          type="button"
                                          onClick={() => {
                                            if (!pacoteId) return;
                                            setPacotesDisponibilidadeAbertos((prev) => ({
                                              ...prev,
                                              [pacoteId]: !aberto,
                                            }));
                                          }}
                                          className="rounded-full border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-800"
                                        >
                                          {aberto ? 'Recolher horarios' : 'Mostrar horarios'}
                                        </button>
                                      </div>
                                    </div>

                                    {aberto && (
                                      <div className="mt-4 space-y-3">
                                        {pacote.modoHorario === 'intervalo' ? (
                                          <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 space-y-3">
                                            <p className="text-sm text-yellow-700">
                                              Este pacote funciona em faixa de horario ({pacote.horarioInicio} - {pacote.horarioFim}).
                                              Ajuste aqui as vagas extras apenas para {dayjs(selectedDate).format('DD/MM/YYYY')}. Para bloquear,
                                              continue usando as "Datas sem disponibilidade" do pacote.
                                            </p>
                                            <label className="block text-xs font-semibold uppercase text-yellow-800">
                                              Vagas extras deste pacote no dia
                                              <input
                                                type="number"
                                                min="0"
                                                step="1"
                                                value={vagasExtrasDia > 0 ? vagasExtrasDia : ''}
                                                onChange={(e) =>
                                                  atualizarVagasExtrasDisponibilidade(
                                                    chaveExtraDia,
                                                    e.target.value
                                                  )
                                                }
                                                className="mt-1 w-full rounded-lg border border-yellow-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-yellow-500 focus:outline-none focus:ring-1 focus:ring-yellow-500"
                                                placeholder="0"
                                              />
                                            </label>
                                            <div className="flex flex-wrap gap-2">
                                              {opcoesAjusteRapidoVagas.map((incremento) => (
                                                <button
                                                  key={`${pacoteId}-dia-${incremento}`}
                                                  type="button"
                                                  onClick={() =>
                                                    somarVagasExtrasDisponibilidade(
                                                      chaveExtraDia,
                                                      incremento
                                                    )
                                                  }
                                                  className="rounded-full border border-yellow-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-yellow-700 transition hover:border-yellow-300 hover:text-yellow-900"
                                                >
                                                  +{incremento} vaga{incremento !== 1 ? 's' : ''}
                                                </button>
                                              ))}
                                              {vagasExtrasDia > 0 && (
                                                <button
                                                  type="button"
                                                  onClick={() =>
                                                    atualizarVagasExtrasDisponibilidade(
                                                      chaveExtraDia,
                                                      ''
                                                    )
                                                  }
                                                  className="rounded-full border border-yellow-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-yellow-700 transition hover:border-yellow-300 hover:text-yellow-900"
                                                >
                                                  Limpar ajuste
                                                </button>
                                              )}
                                            </div>
                                            <p className="text-xs text-yellow-700/80">
                                              Limite regular: {pacote.limite} vaga(s). Este ajuste
                                              e especifico do pacote e se soma ao ajuste geral da
                                              data, quando existir.
                                            </p>
                                          </div>
                                        ) : (
                                          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                                            {pacote.horarios.map((horario) => {
                                              const horarioKey = `${pacoteKey}-${horario}`;
                                              const isDisponivel =
                                                disponibilidadeData[horarioKey] !== false;
                                              const chaveExtraHorario = pacoteId
                                                ? montarChaveVagasExtrasHorario(
                                                    dataStr,
                                                    pacoteId,
                                                    horario
                                                  )
                                                : '';
                                              const vagasExtrasHorario = chaveExtraHorario
                                                ? vagasExtrasDisponibilidade[chaveExtraHorario] ?? 0
                                                : 0;

                                              return (
                                                <div
                                                  key={horario}
                                                  className={`rounded-xl border p-3 transition ${
                                                    isDisponivel
                                                      ? 'border-green-200 bg-green-50/80'
                                                      : 'border-red-200 bg-red-50/80'
                                                  }`}
                                                >
                                                  <button
                                                    type="button"
                                                    onClick={() => {
                                                      setDisponibilidadeData((prev) => {
                                                        const proximo = { ...prev };
                                                        if (isDisponivel) {
                                                          proximo[horarioKey] = false;
                                                        } else {
                                                          delete proximo[horarioKey];
                                                        }
                                                        return proximo;
                                                      });
                                                    }}
                                                    className="flex w-full items-start justify-between gap-3 text-left"
                                                  >
                                                    <div>
                                                      <p
                                                        className={`text-sm font-semibold ${
                                                          isDisponivel ? 'text-green-800' : 'text-red-800'
                                                        }`}
                                                      >
                                                        {horario}
                                                      </p>
                                                      <p
                                                        className={`text-xs ${
                                                          isDisponivel ? 'text-green-700' : 'text-red-700'
                                                        }`}
                                                      >
                                                        {isDisponivel ? 'Disponivel' : 'Bloqueado'}
                                                      </p>
                                                    </div>
                                                    <span
                                                      className={`rounded-full px-2 py-1 text-[11px] font-semibold ${
                                                        isDisponivel
                                                          ? 'bg-green-100 text-green-700'
                                                          : 'bg-red-100 text-red-700'
                                                      }`}
                                                    >
                                                      {isDisponivel ? 'Aberto' : 'Fechado'}
                                                    </span>
                                                  </button>
                                                  <label className="mt-3 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                                    Vagas extras deste pacote
                                                    <input
                                                      type="number"
                                                      min="0"
                                                      step="1"
                                                      value={vagasExtrasHorario > 0 ? vagasExtrasHorario : ''}
                                                      onChange={(e) =>
                                                        atualizarVagasExtrasDisponibilidade(
                                                          chaveExtraHorario,
                                                          e.target.value
                                                        )
                                                      }
                                                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-300"
                                                      placeholder="0"
                                                    />
                                                  </label>
                                                  <div className="mt-3 flex flex-wrap gap-2">
                                                    {opcoesAjusteRapidoVagas.map((incremento) => (
                                                      <button
                                                        key={`${pacoteId}-${horario}-${incremento}`}
                                                        type="button"
                                                        onClick={() =>
                                                          somarVagasExtrasDisponibilidade(
                                                            chaveExtraHorario,
                                                            incremento
                                                          )
                                                        }
                                                        className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-800"
                                                      >
                                                        +{incremento}
                                                      </button>
                                                    ))}
                                                    {vagasExtrasHorario > 0 && (
                                                      <button
                                                        type="button"
                                                        onClick={() =>
                                                          atualizarVagasExtrasDisponibilidade(
                                                            chaveExtraHorario,
                                                            ''
                                                          )
                                                        }
                                                        className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
                                                      >
                                                        Limpar
                                                      </button>
                                                    )}
                                                  </div>
                                                  <p className="mt-2 text-[11px] text-slate-500">
                                                    Limite regular: {pacote.limite} vaga(s) neste
                                                    horario. O ajuste deste pacote soma com o ajuste
                                                    geral do horario, quando houver.
                                                  </p>
                                                </div>
                                              );
                                            })}
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                  )}

                </div>

                <div className="flex flex-col sm:flex-row items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 sm:px-6 py-4">

                  <button

                    onClick={() => setModalDisponibilidade(false)}

                    className="w-full sm:w-auto rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-800"

                  >

                    Fechar

                  </button>

                  <button

                    onClick={salvarDisponibilidade}

                    disabled={salvandoDisponibilidade || carregandoDisponibilidade}

                    className={`w-full sm:w-auto rounded-full px-4 py-2 text-xs font-semibold text-white shadow-sm transition ${

                      salvandoDisponibilidade || carregandoDisponibilidade

                        ? 'bg-blue-300 cursor-not-allowed'

                        : 'bg-blue-600 hover:bg-blue-700'

                    }`}

                  >

                    {salvandoDisponibilidade ? 'Salvando...' : 'Salvar alterações'}

                  </button>

                </div>

              </div>

            </div>

          )}

      {/* ========== Tipos de Clientes ========== */}

      {aba === 'tipos_clientes' && (

        <section className="admin-tab-content space-y-6">

          <AdminTabHeader
            title="Tipos de clientes"
            description={'Defina categorias para o formulario, mantenha a politica de precos clara e facilite a operacao das reservas manuais e online.'}
            icon={FaUsers}
            actions={[
              {
                label: 'Novo tipo',
                icon: FaPlus,
                onClick: iniciarNovoTipoCliente,
                variant: 'primary',
                disabled: salvandoTipoCliente,
              },
            ]}
            metrics={[
              {
                label: 'Tipos ativos',
                value: tiposClientes.length.toLocaleString('pt-BR'),
                hint: 'Categorias cadastradas hoje',
                icon: FaUsers,
                tone: 'sky',
              },
              {
                label: 'Com descricao',
                value: totalTiposComDescricao.toLocaleString('pt-BR'),
                hint: 'Itens prontos para orientar a equipe',
                icon: FaCheck,
                tone: 'emerald',
              },
              {
                label: 'Sem descricao',
                value: Math.max(0, tiposClientes.length - totalTiposComDescricao).toLocaleString('pt-BR'),
                hint: 'Tipos que podem ganhar mais contexto',
                icon: FaQuestionCircle,
                tone: 'amber',
              },
              {
                label: 'Modo atual',
                value: isEditingTipoCliente ? 'Edicao' : 'Novo cadastro',
                hint: isEditingTipoCliente ? 'Um tipo esta sendo ajustado' : 'Formulario pronto para novo registro',
                icon: FaEdit,
                tone: 'indigo',
              },
            ]}
          />

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">

              <div className="flex flex-col gap-2 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">

                <div>

                  <h3 className="text-lg font-semibold text-slate-900">

                    {isEditingTipoCliente ? 'Editar tipo' : 'Novo tipo'}

                  </h3>

                  <p className="text-sm text-slate-500">Defina o nome e, se quiser, uma descrição.</p>

                </div>

                {isEditingTipoCliente && (

                  <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">

                    Edição

                  </span>

                )}

              </div>

              <form

                onSubmit={(e) => {

                  e.preventDefault();

                  void handleSalvarTipoCliente();

                }}

                className="mt-4 space-y-4"

              >

                <label className="text-xs font-semibold uppercase text-slate-500">

                  Nome do tipo

                  <input

                    type="text"

                    value={editTipoCliente.nome}

                    onChange={(e) => setEditTipoCliente((prev) => ({ ...prev, nome: e.target.value }))}

                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"

                    placeholder="Ex: Adulto, Criança"

                  />

                </label>

                <label className="text-xs font-semibold uppercase text-slate-500">

                  Descrição (opcional)

                  <textarea

                    value={editTipoCliente.descricao ?? ''}

                    onChange={(e) => setEditTipoCliente((prev) => ({ ...prev, descricao: e.target.value }))}

                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"

                    rows={3}

                    placeholder="Detalhe quando este tipo deve ser usado."

                  />

                </label>

                <div className="flex flex-col gap-2 sm:flex-row">

                  <button

                    type="submit"

                    disabled={salvandoTipoCliente}

                    className={`inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-white shadow-sm transition ${

                      salvandoTipoCliente ? 'bg-slate-300 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-700'

                    }`}

                  >

                    {salvandoTipoCliente ? 'Salvando...' : isEditingTipoCliente ? 'Salvar alterações' : 'Cadastrar tipo'}

                  </button>

                  {isEditingTipoCliente && (

                    <button

                      type="button"

                      onClick={iniciarNovoTipoCliente}

                      className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-800"

                    >

                      Cancelar edição

                    </button>

                  )}

                </div>

              </form>

            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">

              <div className="flex flex-col gap-2 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">

                <div>

                  <h3 className="text-lg font-semibold text-slate-900">Tipos cadastrados</h3>

                  <p className="text-sm text-slate-500">Gerencie os tipos de clientes cadastrados.</p>

                </div>

                <span className="text-xs font-semibold uppercase text-slate-400">{tiposClientes.length} tipo(s)</span>

              </div>

              {carregandoTiposClientes ? (

                <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">

                  Carregando tipos de clientes...

                </div>

              ) : tiposClientes.length === 0 ? (

                <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500">

                  Nenhum tipo cadastrado. Cadastre um tipo para comecar.

                </div>

              ) : (

                <div className="mt-4 space-y-3">

                  {tiposClientes.map((tipo) => {



                    const emEdicao = isEditingTipoCliente && editTipoCliente.id === tipo.id;

                    return (

                      <div

                        key={tipo.id ?? tipo.nome}

                        className={`rounded-xl border p-4 transition ${

                          emEdicao ? 'border-blue-300 bg-blue-50/40' : 'border-slate-200 bg-white'

                        }`}

                      >

                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">

                          <div>

                            <div className="flex flex-wrap items-center gap-2">

                              <h4 className="text-base font-semibold text-slate-900">{tipo.nome}</h4>


                            </div>

                            {tipo.descricao ? (

                              <p className="text-sm text-slate-500">{tipo.descricao}</p>

                            ) : (

                              <p className="text-xs text-slate-400">Sem descrição.</p>

                            )}

                          </div>

                          <div className="flex flex-wrap gap-2">

                            <button

                              onClick={() => handleEditTipoCliente(tipo)}

                              className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-blue-300 hover:text-blue-600"

                            >

                              <FaEdit className="h-3.5 w-3.5" />

                              Editar

                            </button>

                            <button

                              onClick={() => handleExcluirTipoCliente(tipo)}

                              className="inline-flex items-center gap-2 rounded-full border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-50"

                            >

                              <FaTrash className="h-3.5 w-3.5" />

                              Excluir

                            </button>

                          </div>

                        </div>

                      </div>

                    );

                  })}

                </div>

              )}

            </div>

          </div>

        </section>

      )}

      {/* ========== Email ========== */}

      {aba === 'email' && (

        <section className="admin-tab-content space-y-6">

          <AdminTabHeader
            title="Email"
            description={'Acompanhe emails pendentes, enviados e com erro, com reenvio manual dentro do limite disponivel.'}
            icon={FaEnvelope}
            actions={[
              {
                label: 'Atualizar fila',
                icon: FaSyncAlt,
                onClick: carregarFilaEmails,
                disabled: emailFilaCarregando,
              },
              {
                label: 'Salvar configuracao',
                icon: FaCheck,
                onClick: salvarEmailConfig,
                disabled: whatsappSalvando,
              },
            ]}
            metrics={[
              {
                label: 'Confirmacao automatica',
                value: whatsappConfig.ativo ? 'Ativa' : 'Inativa',
                hint: 'Disparo quando o pagamento e confirmado',
                icon: FaEnvelope,
                tone: whatsappConfig.ativo ? 'emerald' : 'slate',
              },
              {
                label: 'Enviados hoje',
                value: `${emailFila.uso.diario.enviados}/${emailFila.uso.diario.limite}`,
                hint: `${emailFila.uso.diario.restantes.toLocaleString('pt-BR')} restante(s) no limite diario`,
                icon: FaPaperPlane,
                tone: emailFila.uso.diario.restantes > 0 ? 'sky' : 'amber',
              },
              {
                label: 'Enviados no mes',
                value: `${emailFila.uso.mensal.enviados}/${emailFila.uso.mensal.limite}`,
                hint: `${emailFila.uso.mensal.restantes.toLocaleString('pt-BR')} restante(s) no limite mensal`,
                icon: FaChartBar,
                tone: emailFila.uso.mensal.restantes > 0 ? 'emerald' : 'amber',
              },
              {
                label: 'Corpo do email',
                value: whatsappConfig.mensagemConfirmacaoAutomatica.trim() ? 'Configurado' : 'Pendente',
                hint: 'Texto enviado apos a confirmacao do pagamento',
                icon: FaClipboardList,
                tone: whatsappConfig.mensagemConfirmacaoAutomatica.trim() ? 'sky' : 'amber',
              },
              {
                label: 'Na fila',
                value: emailFila.pendentes.toLocaleString('pt-BR'),
                hint: 'Reservas pagas aguardando envio',
                icon: FaPaperPlane,
                tone: emailFila.pendentes > 0 ? 'amber' : 'emerald',
              },
              {
                label: 'Com erro',
                value: emailFila.erros.toLocaleString('pt-BR'),
                hint: 'Falharam no envio anterior',
                icon: FaQuestionCircle,
                tone: emailFila.erros > 0 ? 'amber' : 'emerald',
              },
              {
                label: 'Assunto',
                value: whatsappConfig.assuntoConfirmacaoEmail.trim() ? 'Configurado' : 'Pendente',
                hint: 'Linha de assunto da confirmacao',
                icon: FaEnvelope,
                tone: whatsappConfig.assuntoConfirmacaoEmail.trim() ? 'emerald' : 'amber',
              },
            ]}
          />

          {/* Disparar fila com data minima */}
          <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-amber-50/60 p-5 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <FaPaperPlane className="h-4 w-4 text-amber-600" />
                  <h3 className="text-base font-semibold text-slate-900">Disparar fila de emails pendentes</h3>
                </div>
                <p className="text-sm text-slate-600">
                  Envia confirmacao para reservas pagas cuja <strong>data da visita</strong> seja
                  igual ou posterior à data escolhida. Considera a data do agendamento, não a data de criação da reserva.
                </p>
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
              <label className="flex flex-col gap-1.5 flex-1 sm:max-w-xs">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Data da visita ≥
                </span>
                <input
                  type="date"
                  value={emailDataMinima}
                  onChange={(e) => setEmailDataMinima(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-200 focus:border-amber-400"
                />
              </label>
              <button
                type="button"
                onClick={processarFilaEmails}
                disabled={processandoFila || !emailDataMinima}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-amber-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <FaPaperPlane className="h-3.5 w-3.5" />
                {processandoFila ? 'Disparando...' : 'Disparar fila agora'}
              </button>
              <button
                type="button"
                onClick={() => setEmailDataMinima(dayjs().format('YYYY-MM-DD'))}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                Hoje
              </button>
            </div>

            {emailDataMinima && (
              <p className="mt-3 text-xs text-amber-800/80">
                <strong>Atenção:</strong> reservas cuja <strong>visita</strong> seja anterior a {dayjs(emailDataMinima).format('DD/MM/YYYY')} não receberão email
                (mesmo se a reserva tiver sido criada recentemente).
              </p>
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">Confirmacoes</h3>
                  <p className="text-sm text-slate-500">Controle o disparo automatico quando uma reserva for paga.</p>
                </div>

                <label className="flex items-center gap-2 text-xs font-semibold uppercase text-slate-500">
                  <input
                    type="checkbox"
                    checked={whatsappConfig.ativo}
                    onChange={(e) => setWhatsappConfig((prev) => ({ ...prev, ativo: e.target.checked }))}
                    className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  Ativar envio automatico
                </label>
              </div>

              <div className="mt-4 space-y-4">
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <p className="text-sm font-semibold text-slate-900">Status operacional</p>
                  <p className="mt-1 text-sm text-slate-500">
                    {whatsappConfig.ativo
                      ? 'As novas reservas pagas entram na fila de confirmacao por email.'
                      : 'O envio automatico esta pausado no painel.'}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white px-4 py-4">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Uso do limite de envio</p>
                      <p className="mt-1 text-sm text-slate-500">
                        Acompanhamento calculado pelos emails confirmados no sistema.
                      </p>
                    </div>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                      {emailFila.uso.referencia?.timezone ?? 'America/Sao_Paulo'}
                    </span>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {[
                      {
                        label: 'Diario',
                        enviados: emailFila.uso.diario.enviados,
                        limite: emailFila.uso.diario.limite,
                        restantes: emailFila.uso.diario.restantes,
                        percentual: emailFila.uso.diario.percentual,
                        detalhe: emailFila.uso.referencia?.hoje
                          ? dayjs(emailFila.uso.referencia.hoje).format('DD/MM/YYYY')
                          : 'Hoje',
                        tone: emailFila.uso.diario.restantes > 0 ? 'emerald' : 'amber',
                      },
                      {
                        label: 'Mensal',
                        enviados: emailFila.uso.mensal.enviados,
                        limite: emailFila.uso.mensal.limite,
                        restantes: emailFila.uso.mensal.restantes,
                        percentual: emailFila.uso.mensal.percentual,
                        detalhe: emailFila.uso.referencia?.mes
                          ? dayjs(`${emailFila.uso.referencia.mes}-01`).format('MMMM/YYYY')
                          : 'Mes atual',
                        tone: emailFila.uso.mensal.restantes > 0 ? 'emerald' : 'amber',
                      },
                    ].map((item) => (
                      <div key={item.label} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs font-semibold uppercase text-slate-500">{item.label}</p>
                            <p className="mt-1 text-lg font-semibold text-slate-900">
                              {item.enviados.toLocaleString('pt-BR')} / {item.limite.toLocaleString('pt-BR')}
                            </p>
                          </div>
                          <span
                            className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                              item.tone === 'emerald'
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                : 'border-amber-200 bg-amber-50 text-amber-700'
                            }`}
                          >
                            {item.restantes.toLocaleString('pt-BR')} restantes
                          </span>
                        </div>
                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
                          <div
                            className={`h-full rounded-full ${
                              item.tone === 'emerald' ? 'bg-emerald-500' : 'bg-amber-500'
                            }`}
                            style={{ width: `${item.percentual}%` }}
                          />
                        </div>
                        <p className="mt-2 text-xs text-slate-500">
                          {item.percentual}% usado - {item.detalhe}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3">
                    <p className="text-xs font-semibold uppercase text-amber-700">Pendentes</p>
                    <p className="mt-1 text-2xl font-semibold text-slate-900">{emailFila.pendentes}</p>
                  </div>
                  <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3">
                    <p className="text-xs font-semibold uppercase text-emerald-700">Enviados</p>
                    <p className="mt-1 text-2xl font-semibold text-slate-900">{emailFila.enviados}</p>
                  </div>
                  <div className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3">
                    <p className="text-xs font-semibold uppercase text-rose-700">Com erro</p>
                    <p className="mt-1 text-2xl font-semibold text-slate-900">{emailFila.erros}</p>
                  </div>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={carregarFilaEmails}
                    disabled={emailFilaCarregando}
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <FaSyncAlt className="h-4 w-4" />
                    {emailFilaCarregando ? 'Atualizando...' : 'Atualizar fila'}
                  </button>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="border-b border-slate-100 pb-4">
                <h3 className="text-lg font-semibold text-slate-900">Modelo do email</h3>
                <p className="text-sm text-slate-500">Configure o assunto e o corpo enviados apos o pagamento.</p>
              </div>

              <div className="mt-4 space-y-4">
                <label className="text-xs font-semibold uppercase text-slate-500">
                  Assunto
                  <input
                    value={whatsappConfig.assuntoConfirmacaoEmail}
                    onChange={(e) =>
                      setWhatsappConfig((prev) => ({
                        ...prev,
                        assuntoConfirmacaoEmail: e.target.value,
                      }))
                    }
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                    placeholder={emailAssuntoConfirmacaoPadrao}
                  />
                </label>

                <label className="text-xs font-semibold uppercase text-slate-500">
                  Corpo do email
                  <textarea
                    value={whatsappConfig.mensagemConfirmacaoAutomatica}
                    onChange={(e) =>
                      setWhatsappConfig((prev) => ({
                        ...prev,
                        mensagemConfirmacaoAutomatica: e.target.value,
                      }))
                    }
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                    rows={8}
                    placeholder={emailTemplateConfirmacaoPadrao}
                  />
                </label>

                <div className="flex flex-wrap gap-2">
                  {whatsappPlaceholders.map((placeholder) => (
                    <button
                      key={'email-' + placeholder}
                      type="button"
                      onClick={() => inserirPlaceholderWhatsapp('mensagemConfirmacaoAutomatica', placeholder)}
                      className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-emerald-300 hover:text-emerald-600"
                    >
                      {placeholder}
                    </button>
                  ))}
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase text-slate-500">Preview</p>
                  <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 whitespace-pre-wrap">
                    {emailPreviewConfirmacao || '-'}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setWhatsappConfig((prev) => ({
                      ...prev,
                      assuntoConfirmacaoEmail: emailAssuntoConfirmacaoPadrao,
                      mensagemConfirmacaoAutomatica: emailTemplateConfirmacaoPadrao,
                    }))
                  }
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-800"
                >
                  <FaClipboardList className="h-3.5 w-3.5" />
                  Restaurar padrao
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Registro de emails</h3>
                <p className="text-sm text-slate-500">
                  Emails pendentes, enviados e com falha no envio.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {[
                  { id: 'todos', label: `Todos (${emailFila.itens.length})` },
                  { id: 'pendente', label: `Pendentes (${emailFila.pendentes})` },
                  { id: 'enviado', label: `Enviados (${emailFila.enviados})` },
                  { id: 'erro', label: `Erros (${emailFila.erros})` },
                ].map((filtro) => (
                  <button
                    key={filtro.id}
                    type="button"
                    onClick={() => setEmailRegistroFiltro(filtro.id as typeof emailRegistroFiltro)}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                      emailRegistroFiltro === filtro.id
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                        : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    {filtro.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Filtros adicionais */}
            <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
              <label className="flex flex-col gap-1.5">
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Buscar</span>
                <div className="relative">
                  <FaSearch className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={emailBuscaTexto}
                    onChange={(e) => setEmailBuscaTexto(e.target.value)}
                    placeholder="Nome, e-mail, telefone, atividade"
                    className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400"
                  />
                </div>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Data da reserva (de)</span>
                <input
                  type="date"
                  value={emailFiltroDataDe}
                  onChange={(e) => setEmailFiltroDataDe(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Até</span>
                <input
                  type="date"
                  value={emailFiltroDataAte}
                  onChange={(e) => setEmailFiltroDataAte(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400"
                />
              </label>
            </div>

            {(emailBuscaTexto || emailFiltroDataDe || emailFiltroDataAte) && (
              <button
                type="button"
                onClick={() => { setEmailBuscaTexto(''); setEmailFiltroDataDe(''); setEmailFiltroDataAte(''); }}
                className="mt-2 text-xs text-slate-500 underline hover:text-slate-700"
              >
                Limpar filtros
              </button>
            )}

            {/* Toolbar de selecao em massa */}
            {emailRegistroItensFiltrados.length > 0 && (
              <div className="mt-4 flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={todosFiltradosSelecionados}
                    onChange={toggleSelecionarTodosFiltrados}
                    className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  {todosFiltradosSelecionados ? 'Desmarcar todos' : 'Selecionar todos'} ({emailRegistroItensFiltrados.length})
                </label>

                {emailSelecionados.size > 0 && (
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-semibold text-slate-600">
                      {emailSelecionados.size} selecionado(s)
                    </span>
                    <button
                      type="button"
                      onClick={() => setEmailSelecionados(new Set())}
                      className="text-xs text-slate-500 underline hover:text-slate-700"
                    >
                      Limpar
                    </button>
                    <button
                      type="button"
                      onClick={excluirEmailsSelecionadosEmMassa}
                      disabled={excluindoEmMassa}
                      className="inline-flex items-center gap-1.5 rounded-full bg-rose-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <FaTrash className="h-3 w-3" />
                      {excluindoEmMassa ? 'Excluindo...' : `Excluir ${emailSelecionados.size}`}
                    </button>
                  </div>
                )}
              </div>
            )}

            {emailFilaCarregando ? (
              <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                Carregando registro de emails...
              </div>
            ) : emailRegistroItensFiltrados.length === 0 ? (
              <div className="mt-4 rounded-xl border border-dashed border-emerald-200 bg-emerald-50 px-4 py-8 text-center text-sm text-emerald-700">
                Nenhum registro encontrado para este filtro.
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {emailRegistroItensFiltrados.map((item) => {
                  const statusLabel =
                    item.statusEmail === 'enviado'
                      ? 'Enviado'
                      : item.statusEmail === 'erro'
                        ? 'Erro'
                        : 'Pendente';
                  const statusClassName =
                    item.statusEmail === 'enviado'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : item.statusEmail === 'erro'
                        ? 'border-rose-200 bg-rose-50 text-rose-700'
                        : 'border-amber-200 bg-amber-50 text-amber-700';
                  const dataEvento =
                    item.statusEmail === 'enviado'
                      ? item.dataEmailEnviado
                      : item.statusEmail === 'erro'
                        ? item.dataEmailErro
                        : item.criadoEm || item.data;
                  const labelEvento =
                    item.statusEmail === 'enviado'
                      ? 'Enviado em'
                      : item.statusEmail === 'erro'
                        ? 'Erro em'
                        : 'Criado em';

                  const selecionado = emailSelecionados.has(item.id);
                  const podeSelecionar = item.statusEmail !== 'enviado';
                  return (
                    <div
                      key={item.id}
                      className={`rounded-xl border bg-white p-4 shadow-sm transition ${
                        selecionado ? 'border-emerald-300 bg-emerald-50/30' : 'border-slate-200'
                      }`}
                    >
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="flex min-w-0 items-start gap-3">
                          {podeSelecionar && (
                            <input
                              type="checkbox"
                              checked={selecionado}
                              onChange={() => toggleSelecaoEmail(item.id)}
                              className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                              aria-label={`Selecionar ${item.nome}`}
                            />
                          )}
                          <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="text-base font-semibold text-slate-900">{item.nome || 'Cliente'}</h4>
                            <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusClassName}`}>
                              {statusLabel}
                            </span>
                          </div>

                          <p className="mt-1 text-sm text-slate-600">
                            {item.email || 'Email não informado'}
                          </p>
                          <p className="mt-1 text-sm text-slate-500">
                            {formatarDataReserva(item.data)} {item.horario || '---'} · {item.atividade || 'Atividade'}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                            {dataEvento ? (
                              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                                {labelEvento}: {dayjs(dataEvento).format('DD/MM/YYYY HH:mm')}
                              </span>
                            ) : null}
                            {item.dataEmailEnviado ? (
                              <span className="rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-emerald-700">
                                Confirmado: {dayjs(item.dataEmailEnviado).format('DD/MM/YYYY HH:mm')}
                              </span>
                            ) : null}
                          </div>

                          {item.emailErro ? (
                            <p className="mt-2 rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                              {item.emailErro}
                            </p>
                          ) : null}
                          </div>
                        </div>

                        <div className="shrink-0 text-left text-sm text-slate-500 lg:text-right">
                          <p className="font-semibold text-slate-900">{formatCurrency(Number(item.valor ?? 0))}</p>
                          <p className="mt-1">{statusLabel}</p>
                          <p className="mt-1 text-xs text-slate-400">Reserva {item.id}</p>
                          {item.statusEmail !== 'enviado' ? (
                            <div className="mt-3 flex flex-wrap justify-start gap-2 lg:justify-end">
                              <button
                                type="button"
                                onClick={() => tentarReenviarEmail(item)}
                                disabled={
                                  !emailTemLimiteDisponivel ||
                                  (emailAcaoCarregando?.id === item.id && emailAcaoCarregando.acao === 'retry')
                                }
                                title={!emailTemLimiteDisponivel ? 'Limite de envio indisponivel' : undefined}
                                className="inline-flex items-center justify-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-45"
                              >
                                <FaPaperPlane className="h-3.5 w-3.5" />
                                {emailAcaoCarregando?.id === item.id && emailAcaoCarregando.acao === 'retry'
                                  ? 'Tentando...'
                                  : 'Tentar novamente'}
                              </button>
                              <button
                                type="button"
                                onClick={() => excluirEmailDaFila(item)}
                                disabled={emailAcaoCarregando?.id === item.id}
                                className="inline-flex items-center justify-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-45"
                              >
                                <FaTrash className="h-3.5 w-3.5" />
                                {emailAcaoCarregando?.id === item.id && emailAcaoCarregando.acao === 'excluir'
                                  ? 'Excluindo...'
                                  : 'Excluir'}
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </section>

      )}

      {/* ========== WhatsApp ========== */}

      {aba === 'whatsapp' && (

        <section className="admin-tab-content space-y-6">

          <AdminTabHeader
            title="WhatsApp"
            description={'Conecte o WhatsApp do Disparador Agradecimento e configure a mensagem automatica enviada ao marcar chegada.'}
            icon={FaWhatsapp}
            actions={[
              {
                label: whatsappStatus.status === 'ready' ? 'Atualizar status' : 'Gerar QR Code',
                icon: whatsappStatus.status === 'ready' ? FaSyncAlt : FaQrcode,
                onClick: whatsappStatus.status === 'ready' ? carregarStatusWhatsapp : iniciarConexaoWhatsapp,
                variant: whatsappStatus.status === 'ready' ? undefined : 'primary',
                disabled: whatsappStatusCarregando || whatsappAcaoCarregando === 'start',
              },
              {
                label: 'Desconectar',
                icon: FaSignOutAlt,
                onClick: desconectarConexaoWhatsapp,
                disabled: whatsappAcaoCarregando === 'logout' || whatsappStatus.status === 'idle',
              },
              {
                label: 'Salvar WhatsApp',
                icon: FaCheck,
                onClick: salvarMensagensWhatsapp,
                disabled: whatsappSalvando,
              },
            ]}
            metrics={[
              {
                label: 'Conexao',
                value: whatsappStatusInfo.label,
                hint: whatsappStatusInfo.hint,
                icon: FaWhatsapp,
                tone: whatsappStatusInfo.tone,
              },
              {
                label: 'Disparador',
                value: 'Disparador Agradecimento',
                hint: 'Nome exibido ao vincular pelo QR Code',
                icon: FaQrcode,
                tone: 'indigo',
              },
              {
                label: 'Sessao',
                value:
                  whatsappStatus.authStrategy === 'remote'
                    ? 'Persistente'
                    : whatsappStatus.authStrategy === 'local'
                      ? 'Local'
                      : 'Aguardando',
                hint:
                  whatsappStatus.authStrategy === 'remote'
                    ? 'Salva no Firebase Storage'
                    : whatsappStatus.authStrategy === 'local'
                      ? 'Pode perder no deploy'
                      : 'Inicia junto com o servidor',
                icon: FaSyncAlt,
                tone: whatsappStatus.authStrategy === 'remote' ? 'emerald' : 'amber',
              },
              {
                label: 'Mensagem',
                value: whatsappConfig.mensagemBoasVindas.trim() ? 'Pronta' : 'Pendente',
                hint: 'Enviada quando a chegada e confirmada',
                icon: FaClipboardList,
                tone: whatsappConfig.mensagemBoasVindas.trim() ? 'emerald' : 'amber',
              },
              {
                label: 'Modelos manuais',
                value: `${modelosPreviewWhatsappManual.length} modelo(s)`,
                hint: 'Aparecem antes de abrir o WhatsApp do cliente',
                icon: FaEye,
                tone: 'sky',
              },
            ]}
          />

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.82fr)]">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">Conexao do disparador</h3>
                  <p className="text-sm text-slate-500">Vincule o WhatsApp que enviara o Disparador Agradecimento.</p>
                </div>

                <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${
                  whatsappStatus.status === 'ready'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : whatsappStatus.status === 'qr'
                      ? 'border-amber-200 bg-amber-50 text-amber-700'
                      : 'border-slate-200 bg-slate-50 text-slate-600'
                }`}>
                  {whatsappStatusInfo.label}
                </span>
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-[230px_minmax(0,1fr)]">
                <div className="flex min-h-[230px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4">
                  {whatsappStatus.qr ? (
                    <img
                      src={whatsappStatus.qr}
                      alt="QR Code do Disparador Agradecimento"
                      className="h-48 w-48 rounded-lg bg-white object-contain p-2 shadow-sm"
                    />
                  ) : (
                    <div className="text-center text-sm text-slate-500">
                      <FaQrcode className="mx-auto h-10 w-10 text-slate-300" />
                      <p className="mt-2 font-semibold text-slate-700">QR Code indisponivel</p>
                      <p className="mt-1">Clique em Gerar QR Code para iniciar a conexao.</p>
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
                    <p className="text-xs font-semibold uppercase text-slate-500">Nome da conexao</p>
                    <p className="mt-1 text-base font-semibold text-slate-900">Disparador Agradecimento</p>
                    <p className="mt-1 text-sm text-slate-500">Esse nome aparece nos dispositivos vinculados do WhatsApp.</p>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white px-4 py-4">
                    <p className="text-xs font-semibold uppercase text-slate-500">Estado atual</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{whatsappStatusInfo.label}</p>
                    <p className="mt-1 text-sm text-slate-500">{whatsappStatusInfo.hint}</p>
                    {whatsappStatus.lastQrAt ? (
                      <p className="mt-2 text-xs text-slate-400">
                        QR gerado em {dayjs(whatsappStatus.lastQrAt).format('DD/MM/YYYY HH:mm')}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      onClick={iniciarConexaoWhatsapp}
                      disabled={whatsappAcaoCarregando === 'start'}
                      className="inline-flex items-center justify-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                    >
                      <FaQrcode className="h-3.5 w-3.5" />
                      {whatsappAcaoCarregando === 'start' ? 'Iniciando...' : 'Gerar QR Code'}
                    </button>
                    <button
                      type="button"
                      onClick={carregarStatusWhatsapp}
                      disabled={whatsappStatusCarregando}
                      className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <FaSyncAlt className="h-3.5 w-3.5" />
                      Atualizar
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Confirmacao automatica (quando reserva e paga) */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">Confirmacao automatica</h3>
                  <p className="text-sm text-slate-500">
                    WhatsApp disparado automaticamente quando o pagamento da reserva e confirmado.
                  </p>
                </div>

                <label className="flex items-center gap-2 text-xs font-semibold uppercase text-slate-500">
                  <input
                    type="checkbox"
                    checked={whatsappConfig.whatsappConfirmacaoAtiva === true}
                    onChange={(e) => setWhatsappConfig((prev) => ({ ...prev, whatsappConfirmacaoAtiva: e.target.checked }))}
                  />
                  {whatsappConfig.whatsappConfirmacaoAtiva ? 'Ativada' : 'Desativada'}
                </label>
              </div>

              <div className="mt-4 space-y-4">
                <label className="text-xs font-semibold uppercase text-slate-500">
                  Mensagem enviada quando o pagamento for confirmado
                  <textarea
                    value={whatsappConfig.whatsappMensagemConfirmacao ?? ''}
                    onChange={(e) => setWhatsappConfig((prev) => ({ ...prev, whatsappMensagemConfirmacao: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                    rows={7}
                    placeholder={`Olá {nome}! ✅ Sua reserva foi confirmada.\nData: {data}\nHorário: {horario}\nValor: {valor}`}
                  />
                </label>

                <div className="flex flex-wrap gap-2">
                  {whatsappPlaceholders.map((placeholder) => (
                    <button
                      key={'confirma-' + placeholder}
                      type="button"
                      onClick={() => {
                        const atual = whatsappConfig.whatsappMensagemConfirmacao ?? '';
                        setWhatsappConfig((prev) => ({ ...prev, whatsappMensagemConfirmacao: `${atual}${placeholder}` }));
                      }}
                      className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-emerald-300 hover:text-emerald-600"
                    >
                      {placeholder}
                    </button>
                  ))}
                </div>

                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 flex items-start gap-2">
                  <svg className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2L1 21h22L12 2zm0 4l7.53 13H4.47L12 6zm-1 5v4h2v-4h-2zm0 6v2h2v-2h-2z"/>
                  </svg>
                  <p className="text-[11px] text-amber-900 leading-snug">
                    <strong>Atenção:</strong> o disparo só acontece se o WhatsApp estiver conectado.
                    Reservas pagas presencialmente (manuais) <strong>não</strong> recebem este disparo.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="border-b border-slate-100 pb-4">
                <h3 className="text-lg font-semibold text-slate-900">Disparador Agradecimento</h3>
                <p className="text-sm text-slate-500">Mensagem automatica enviada no WhatsApp quando a chegada do cliente e confirmada.</p>
              </div>

              <div className="mt-4 space-y-4">
                <label className="text-xs font-semibold uppercase text-slate-500">
                  Mensagem do disparador
                  <textarea
                    value={whatsappConfig.mensagemBoasVindas}
                    onChange={(e) =>
                      setWhatsappConfig((prev) => ({
                        ...prev,
                        mensagemBoasVindas: e.target.value,
                      }))
                    }
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                    rows={6}
                    placeholder={whatsappTemplateBoasVindasPadrao}
                  />
                </label>

                <div className="flex flex-wrap gap-2">
                  {whatsappPlaceholders.map((placeholder) => (
                    <button
                      key={'boasvindas-' + placeholder}
                      type="button"
                      onClick={() => inserirPlaceholderWhatsapp('mensagemBoasVindas', placeholder)}
                      className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-emerald-300 hover:text-emerald-600"
                    >
                      {placeholder}
                    </button>
                  ))}
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase text-slate-500">Preview do disparador</p>
                  <div className="mt-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-3">
                    <div className="max-w-[92%] rounded-2xl rounded-tl-md bg-white px-3 py-2 text-sm leading-relaxed text-slate-800 shadow-sm whitespace-pre-wrap">
                      {mensagemPreviewDisparadorAgradecimento || '-'}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setWhatsappConfig((prev) => ({
                      ...prev,
                      mensagemBoasVindas: whatsappTemplateBoasVindasPadrao,
                    }))
                  }
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-800"
                >
                  Restaurar padrao
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Modelos antes de abrir WhatsApp do cliente</h3>
                <p className="text-sm text-slate-500">
                  Estes textos aparecem no seletor quando a equipe clica no WhatsApp de uma reserva.
                </p>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={adicionarModeloMensagemManual}
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50"
                >
                  <FaPlus className="h-3.5 w-3.5" />
                  Novo modelo
                </button>
                <button
                  type="button"
                  onClick={salvarMensagensWhatsapp}
                  disabled={whatsappSalvando}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  <FaCheck className="h-3.5 w-3.5" />
                  {whatsappSalvando ? 'Salvando...' : 'Salvar modelos'}
                </button>
              </div>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {modelosPreviewWhatsappManual.map((modelo) => (
                <div
                  key={modelo.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setWhatsappModeloAbertoId(modelo.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setWhatsappModeloAbertoId(modelo.id);
                    }
                  }}
                  className={`group flex min-h-[230px] cursor-pointer flex-col rounded-xl border p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-emerald-200 ${
                    modelo.pronto
                      ? 'border-slate-200 bg-white'
                      : 'border-amber-200 bg-amber-50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold text-slate-900">{modelo.titulo}</p>
                      <p className="mt-1 text-xs font-semibold uppercase text-slate-500">{modelo.tipo}</p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                        modelo.pronto
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          : 'border-amber-200 bg-white text-amber-700'
                      }`}
                    >
                      {modelo.pronto ? 'Pronto' : 'Incompleto'}
                    </span>
                  </div>

                  <div className="mt-4 max-h-[96px] flex-1 overflow-hidden rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm leading-relaxed text-slate-700 whitespace-pre-wrap">
                    {modelo.preview}
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setWhatsappModeloAbertoId(modelo.id);
                      }}
                      className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                    >
                      <FaEdit className="h-3.5 w-3.5" />
                      Editar
                    </button>

                    {modelo.id !== 'padrao' ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removerModeloMensagemManual(modelo.id);
                        }}
                        className="inline-flex items-center justify-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
                      >
                        <FaTrash className="h-3.5 w-3.5" />
                        Excluir
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}

              <button
                type="button"
                onClick={adicionarModeloMensagemManual}
                className="flex min-h-[230px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-slate-500 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700"
              >
                <FaPlus className="h-5 w-5" />
                <span className="mt-3 text-sm font-semibold">Novo modelo</span>
              </button>
            </div>
          </div>

        </section>

      )}

      {/* ========== Pesquisa de Clientes ========== */}

      {aba === 'pesquisa' && (

        <section className="admin-tab-content space-y-6">

          <AdminTabHeader
            title="Pesquisa de clientes"
            description={'Encontre reservas por nome, CPF ou telefone e abra o contato certo com poucos cliques quando precisar atender ou confirmar detalhes.'}
            icon={FaSearch}
            metrics={[
              {
                label: 'Termo atual',
                value: termoPesquisa.trim() || 'Sem filtro',
                hint: 'Busca principal do momento',
                icon: FaSearch,
                tone: 'sky',
              },
              {
                label: 'Resultados',
                value: resultadosPesquisa.length.toLocaleString('pt-BR'),
                hint: 'Reservas encontradas na consulta',
                icon: FaUsers,
                tone: 'indigo',
              },
              {
                label: 'Status',
                value: carregandoPesquisa ? 'Buscando' : 'Pronto',
                hint: carregandoPesquisa ? 'Aguarde o retorno do banco' : 'Painel pronto para nova busca',
                icon: FaCheck,
                tone: carregandoPesquisa ? 'amber' : 'emerald',
              },
            ]}
          />

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">

          <form

            onSubmit={(e) => {

              e.preventDefault();

              pesquisarClientes();

            }}

            className="mt-4 flex flex-col gap-3 md:flex-row"

          >

            <div className="flex-1">

              <label className="text-xs font-semibold uppercase text-slate-500">

                Termo de busca

                <input

                  type="text"

                  value={termoPesquisa}

                  onChange={(e) => setTermoPesquisa(e.target.value)}

                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"

                  placeholder="Ex: Ana Silva, 00000000000, 629999999"

                />

              </label>

            </div>

            <div className="flex items-end">

              <button

                type="submit"

                className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"

              >

                <FaSearch className="h-4 w-4" />

                Pesquisar

              </button>

            </div>

          </form>

          {carregandoPesquisa ? (
            <div className="mt-6 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
              Buscando resultados...
            </div>
          ) : resultadosPesquisa.length > 0 ? (
            <div className="mt-6">
              <table className="w-full table-fixed divide-y divide-slate-100 text-sm">
                <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3 text-left w-[26%]">Nome</th>
                    <th className="px-4 py-3 text-left w-[14%]">CPF</th>
                    <th className="px-4 py-3 text-left w-[18%]">Telefone</th>
                    <th className="px-4 py-3 text-left w-[14%]">Data</th>
                    <th className="px-4 py-3 text-left w-[18%]">Atividade</th>
                    <th className="px-4 py-3 text-right w-[10%]">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {resultadosPesquisa.map((resultado) => {
                    const participantes = calcularParticipantes(resultado);
                    const pacoteDescricao = formatarPacote(resultado);
                    const valorFormatado = formatarValor(resultado.valor);
                    const podeEnviarWhatsapp = Boolean(normalizarTelefoneWhatsapp(resultado.telefone));

                    return (
                      <tr key={resultado.id} className="hover:bg-slate-50/80">
                        <td className="px-4 py-3 font-medium text-slate-800 break-words">{resultado.nome}</td>
                        <td className="px-4 py-3 text-slate-600 break-all">{resultado.cpf}</td>
                        <td className="px-4 py-3 text-slate-600 break-all">{resultado.telefone}</td>
                        <td className="px-4 py-3 text-slate-600">{formatarDataReserva(resultado.data)}</td>
                        <td className="px-4 py-3 text-slate-600 break-words">{resultado.atividade}</td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() =>
                              abrirEnvioWhatsapp(resultado, participantes, pacoteDescricao, valorFormatado)
                            }
                            disabled={!podeEnviarWhatsapp}
                            className="inline-flex items-center justify-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <FaWhatsapp className="h-3.5 w-3.5" />
                            WhatsApp
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (

            <div className="mt-6 rounded-xl border border-dashed border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500">

              Nenhum cliente encontrado para o termo informado.

            </div>

          )}

          </div>

        </section>

      )}

      {aba === 'configuracoes' && (
        <section className="admin-tab-content space-y-6">
          <AdminTabHeader
            title="Configurações do site"
            description="Informações exibidas publicamente no site. Altere aqui e o site atualiza automaticamente."
            icon={FaCog}
            actions={[
              {
                label: siteConfigSalvando ? 'Salvando...' : 'Salvar',
                icon: FaCheck,
                onClick: salvarSiteConfig,
                disabled: siteConfigSalvando,
              },
            ]}
          />

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-5">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                Texto de funcionamento
              </label>
              <input
                type="text"
                value={siteConfig.textoFuncionamento}
                onChange={(e) => setSiteConfig((prev) => ({ ...prev, textoFuncionamento: e.target.value }))}
                placeholder="Ex: Sábados e Domingos · 9h às 14h · Vagas limitadas"
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[#8B4F23]/20 focus:border-[#8B4F23] bg-white"
              />
              <p className="text-xs text-slate-400 mt-1.5">
                Aparece abaixo do botão de reserva na seção Brunch e no rodapé do site. Deixe em branco para ocultar.
              </p>
            </div>
          </div>
        </section>
      )}

        </div>

      </div>

      </div>

    </main>

  );

}
