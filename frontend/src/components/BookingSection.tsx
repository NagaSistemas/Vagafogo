import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { collection, doc, getDoc, getDocs, onSnapshot, query, where } from "firebase/firestore";
import { db } from '../../firebase';
import { DayPicker } from "react-day-picker";
import "react-day-picker/dist/style.css";
import { ptBR } from "date-fns/locale";
import { reservaContaParaOcupacao } from "../utils/reservaStatus";
import {
  compararTextoNumericamente,
  normalizarBloqueiosDisponibilidade,
  normalizarVagasExtrasDisponibilidade,
  obterVagasExtrasDisponibilidade,
} from "../utils/disponibilidade";

type PerguntaCondicional = {
  condicao: "sim" | "nao";
  pergunta: string;
  tipo: "sim_nao" | "texto";
  obrigatoria: boolean;
  emojiSim?: string;
  emojiNao?: string;
};

type PerguntaPersonalizada = {
  id: string;
  pergunta: string;
  tipo: "sim_nao" | "texto";
  obrigatoria: boolean;
  emojiSim?: string;
  emojiNao?: string;
  perguntaCondicional?: PerguntaCondicional;
};

type PerguntaCondicionalRespostaPayload = {
  pergunta: string;
  tipo: "sim_nao" | "texto";
  obrigatoria: boolean;
  resposta: string;
  emojiSim?: string;
  emojiNao?: string;
};

type PerguntaPersonalizadaRespostaPayload = {
  pacoteId: string;
  pacoteNome: string;
  perguntaId: string;
  pergunta: string;
  tipo: "sim_nao" | "texto";
  obrigatoria: boolean;
  resposta: string;
  emojiSim?: string;
  emojiNao?: string;
  perguntaCondicional?: PerguntaCondicionalRespostaPayload;
};

type TipoCliente = {
  id?: string;
  nome: string;
  descricao?: string;
};

type TipoClienteQuantidade = Record<string, number>;

type TipoClientePreco = Record<string, number>;

type Pacote = {
  id?: string;
  nome: string;
  tipo: "brunch" | "trilha" | "experiencia";
  emoji?: string;
  precoAdulto: number;
  precoCrianca: number;
  precoBariatrica: number;
  precosPorTipo?: TipoClientePreco;
  horarios?: string[];
  dias: number[];
  limite?: number;
  datasBloqueadas?: string[];
  aceitaPet?: boolean;
  modoHorario?: 'lista' | 'intervalo';
  horarioInicio?: string;
  horarioFim?: string;
  perguntasPersonalizadas?: PerguntaPersonalizada[];
  /** Aviso exibido na escolha do horário do pacote (ex: "Chegar 15 min antes") */
  aviso?: string;
};

type Combo = {
  id?: string;
  nome: string;
  pacoteIds: string[];
  preco?: number;
  precoAdulto?: number;
  precoCrianca?: number;
  precoBariatrica?: number;
  precosPorTipo?: TipoClientePreco;
  desconto?: number;
  ativo: boolean;
};

type GrupoParticipacao = {
  chave: string;
  tipo: "combo" | "pacote";
  refId: string;
  nome: string;
  descricao: string;
  pacoteIds: string[];
  combo?: Combo;
  pacote?: Pacote;
};

type GrupoParticipacaoPayload = {
  tipo: "combo" | "pacote";
  refId: string;
  nome: string;
  pacoteIds: string[];
  participantesPorTipo: TipoClienteQuantidade;
  participantes: number;
};

type ParticipantesPorGrupo = Record<string, TipoClienteQuantidade>;

type ReservaResumo = {
  id?: string;
  data?: string;
  horario?: string;
  horariosPorPacote?: Record<string, string>;
  participantes?: number;
  participantesPorTipo?: Record<string, number>;
  gruposParticipacao?: GrupoParticipacaoPayload[];
  adultos?: number;
  criancas?: number;
  bariatrica?: number;
  naoPagante?: number;
  pacoteIds?: string[];
  atividade?: string;
  status?: string;
  confirmada?: boolean;
};

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const formatCurrency = (valor: number) =>
  currencyFormatter.format(Number.isFinite(valor) ? valor : 0);


const normalizarTexto = (valor: string) =>
  valor
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

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
  if (nome.includes("adult")) return Number(legado.precoAdulto ?? 0);
  if (nome.includes("crian")) return Number(legado.precoCrianca ?? 0);
  if (nome.includes("bariat")) return Number(legado.precoBariatrica ?? 0);
  return 0;
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

const normalizarNumero = (valor: unknown) => {
  const numero = Number(valor);
  return Number.isFinite(numero) ? Math.max(numero, 0) : 0;
};

const somarMapa = (mapa?: Record<string, number>) => {
  if (!mapa) return 0;
  return Object.values(mapa).reduce((total, valor) => total + normalizarNumero(valor), 0);
};

const normalizarMapaQuantidade = (mapa?: Record<string, number>) => {
  if (!mapa) return {};
  return Object.fromEntries(
    Object.entries(mapa).map(([chave, valor]) => [chave, normalizarNumero(valor)])
  ) as TipoClienteQuantidade;
};

const somarMapasQuantidade = (mapas: Array<Record<string, number> | undefined>) => {
  const total: TipoClienteQuantidade = {};
  mapas.forEach((mapa) => {
    Object.entries(mapa ?? {}).forEach(([chave, valor]) => {
      total[chave] = (total[chave] ?? 0) + normalizarNumero(valor);
    });
  });
  return total;
};

const somarGruposParticipacao = (grupos?: Array<{ participantesPorTipo?: Record<string, number>; participantes?: number }>) => {
  if (!Array.isArray(grupos)) return 0;
  return grupos.reduce((total, grupo) => {
    const totalMapa = somarMapa(grupo.participantesPorTipo);
    const declarado = normalizarNumero(grupo.participantes);
    return total + Math.max(totalMapa, declarado);
  }, 0);
};

type PersonalField = "nome" | "email" | "cpf" | "telefone";
type EtapaReserva = 0 | 1 | 2 | 3 | 4;
type FormaPagamento = "CREDIT_CARD" | "PIX";
type SubEtapaPagamento = "metodo" | "pix" | "cartao-dados" | "cartao-cartao" | "cartao-endereco";

const onlyNumbers = (value: string) => value.replace(/\D/g, "");

type CardBrandId = "visa" | "mastercard" | "amex" | "elo" | "hipercard";

const cardBrandConfigs: Array<{ id: CardBrandId; label: string; pattern: RegExp; badgeClass: string }> = [
  { id: "visa", label: "Visa", pattern: /^4/, badgeClass: "bg-blue-600 text-white" },
  { id: "mastercard", label: "Mastercard", pattern: /^(5[1-5]|2[2-7])/, badgeClass: "bg-rose-600 text-white" },
  { id: "amex", label: "Amex", pattern: /^3[47]/, badgeClass: "bg-sky-600 text-white" },
  {
    id: "elo",
    label: "Elo",
    pattern: /^(4011(78|79)|431274|438935|451416|457393|45763[12]|504175|5067(0|1|2)|5090|627780|636297|636368|650)/,
    badgeClass: "bg-emerald-600 text-white",
  },
  { id: "hipercard", label: "Hipercard", pattern: /^(606282|3841)/, badgeClass: "bg-indigo-600 text-white" },
];

const detectarBandeiraCartao = (valor: string): CardBrandId | null => {
  const digits = onlyNumbers(valor);
  if (!digits) return null;
  const match = cardBrandConfigs.find((config) => config.pattern.test(digits));
  return match?.id ?? null;
};

const obterLimiteNumeroCartao = (brand?: CardBrandId | null) => {
  if (brand === "amex") return 15;
  return 19;
};


const formatCpf = (value: string): string => {
  const digits = onlyNumbers(value).slice(0, 11);
  const part1 = digits.slice(0, 3);
  const part2 = digits.slice(3, 6);
  const part3 = digits.slice(6, 9);
  const part4 = digits.slice(9, 11);

  let formatted = part1;
  if (part2) formatted += `.${part2}`;
  if (part3) formatted += `.${part3}`;
  if (part4) formatted += `-${part4}`;
  return formatted;
};

const formatPhone = (value: string): string => {
  const digits = onlyNumbers(value).slice(0, 11);
  if (digits.length === 0) return "";
  if (digits.length < 2) {
    return `(${digits}`;
  }
  if (digits.length === 2) {
    return `(${digits})`;
  }
  if (digits.length <= 6) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  }
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
};

const formatCep = (value: string): string => {
  const digits = onlyNumbers(value).slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
};

const formatCardNumber = (value: string): string => {
  const digits = onlyNumbers(value);
  const brand = detectarBandeiraCartao(digits);
  const maxDigits = obterLimiteNumeroCartao(brand);
  const trimmed = digits.slice(0, maxDigits);

  if (brand === "amex") {
    const match = /^(\d{0,4})(\d{0,6})(\d{0,5})$/.exec(trimmed);
    if (!match) return trimmed;
    return [match[1], match[2], match[3]].filter(Boolean).join(" ");
  }

  return trimmed.replace(/(\d{4})(?=\d)/g, "$1 ");
};

const formatCardExpiry = (value: string): string => {
  const digits = onlyNumbers(value).slice(0, 6);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
};

const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

const isValidCpf = (value: string): boolean => {
  const cpf = onlyNumbers(value);
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) {
    return false;
  }

  let sum = 0;
  for (let i = 0; i < 9; i += 1) {
    sum += Number(cpf[i]) * (10 - i);
  }
  let firstDigit = (sum * 10) % 11;
  if (firstDigit === 10) firstDigit = 0;
  if (firstDigit !== Number(cpf[9])) {
    return false;
  }

  sum = 0;
  for (let i = 0; i < 10; i += 1) {
    sum += Number(cpf[i]) * (11 - i);
  }
  let secondDigit = (sum * 10) % 11;
  if (secondDigit === 10) secondDigit = 0;

  return secondDigit === Number(cpf[10]);
};

const parseCardExpiry = (value: string) => {
  const digits = onlyNumbers(value);
  if (digits.length < 4) return null;
  const month = Number(digits.slice(0, 2));
  if (!Number.isFinite(month) || month < 1 || month > 12) return null;
  let year = Number(digits.slice(2));
  if (!Number.isFinite(year)) return null;
  if (digits.length === 4) {
    year += 2000;
  }
  if (digits.length >= 6) {
    year = Number(digits.slice(2, 6));
  }
  if (!Number.isFinite(year) || year < 2000) return null;
  return { month, year };
};

const extrairMensagemErroPagamento = (resposta: any, fallback: string) => {
  const mensagem =
    resposta?.error ||
    resposta?.message ||
    resposta?.details?.errors?.[0]?.description;
  return mensagem ? String(mensagem) : fallback;
};

const isValidCardNumber = (value: string): boolean => {
  const digits = onlyNumbers(value);
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let shouldDouble = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let digit = Number(digits[i]);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
};

const parseHorarioParaMinutos = (valor: string) => {
  const match = /(\d{1,2})(?:[:hH](\d{2}))?/.exec(valor.trim());
  if (!match) return null;
  const horas = Number(match[1]);
  const minutos = match[2] ? Number(match[2]) : 0;
  if (!Number.isFinite(horas) || !Number.isFinite(minutos)) return null;
  if (horas < 0 || horas > 23 || minutos < 0 || minutos > 59) return null;
  return horas * 60 + minutos;
};

const calcularParticipantesReserva = (reserva: ReservaResumo) => {
  const participantesDeclarados = normalizarNumero(reserva.participantes);
  const participantesGrupos = somarGruposParticipacao(reserva.gruposParticipacao);
  const participantesMapa =
    reserva.participantesPorTipo && Object.keys(reserva.participantesPorTipo).length > 0
      ? somarMapa(reserva.participantesPorTipo)
      : 0;
  const base =
    participantesGrupos > 0
      ? participantesGrupos
      : participantesMapa > 0
      ? participantesMapa
      : normalizarNumero(reserva.adultos) +
        normalizarNumero(reserva.criancas) +
        normalizarNumero(reserva.bariatrica);
  const total = base + normalizarNumero(reserva.naoPagante);
  return Math.max(total, participantesDeclarados);
};

export function BookingSection() {
  const [pacotes, setPacotes] = useState<Pacote[]>([]);
  const [combos, setCombos] = useState<Combo[]>([]);
  const [tiposClientes, setTiposClientes] = useState<TipoCliente[]>([]);
  const [loadingPacotes, setLoadingPacotes] = useState(true);
  const [reservasDia, setReservasDia] = useState<ReservaResumo[]>([]);
  const [selectedPackages, setSelectedPackages] = useState<string[]>([]);
  const [etapa, setEtapa] = useState<EtapaReserva>(0);

  // Formulário
  const [nome, setNome] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [telefone, setTelefone] = useState<string>("");
  const [cpf, setCpf] = useState<string>("");
  const [selectedDay, setSelectedDay] = useState<Date | undefined>();
  const [horario, setHorario] = useState<string>("");
  // Horário por pacote — cada pacote pode ter seu próprio horário.
  // Mantém `horario` legado sincronizado com o primeiro horário escolhido.
  const [horariosPorPacote, setHorariosPorPacote] = useState<Record<string, string>>({});
  // Sub-etapa dentro do passo de pagamento: método primeiro, depois PIX ou cartão.
  const [subEtapaPagamento, setSubEtapaPagamento] = useState<SubEtapaPagamento>("metodo");
  // Sub-passo dentro da etapa Participantes — segue gruposParticipacao + "pet" no final
  const [subPassoParticipantes, setSubPassoParticipantes] = useState<number>(0);
  const [diasBloqueados, setDiasBloqueados] = useState<Set<string>>(new Set());
  const [diaSelecionadoFechado, setDiaSelecionadoFechado] = useState(false);
  const [participantesPorGrupo, setParticipantesPorGrupo] = useState<ParticipantesPorGrupo>({});
  const [naoPagante] = useState<number>(0);
  const [temPet, setTemPet] = useState<boolean | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [formaPagamento, setFormaPagamento] = useState<FormaPagamento>("CREDIT_CARD");
  const [cartaoNome, setCartaoNome] = useState<string>("");
  const [cartaoNumero, setCartaoNumero] = useState<string>("");
  const [cartaoValidade, setCartaoValidade] = useState<string>("");
  const [cartaoCvv, setCartaoCvv] = useState<string>("");
  const [cartaoResultado, setCartaoResultado] = useState<{
    status: "success" | "pending" | "processing" | "error";
    message: string;
  } | null>(null);
  const [enderecoCep, setEnderecoCep] = useState<string>("");
  const [enderecoRua, setEnderecoRua] = useState<string>("");
  const [enderecoNumero, setEnderecoNumero] = useState<string>("");
  const [enderecoComplemento, setEnderecoComplemento] = useState<string>("");
  const [enderecoBairro, setEnderecoBairro] = useState<string>("");
  const [enderecoCidade, setEnderecoCidade] = useState<string>("");
  const [enderecoEstado, setEnderecoEstado] = useState<string>("");
  const [respostasPersonalizadas, setRespostasPersonalizadas] = useState<Record<string, { resposta?: string; condicional?: string }>>({});
  const [disponibilidadeHorarios, setDisponibilidadeHorarios] = useState<Record<string, boolean>>({});
  const [disponibilidadeVagasExtras, setDisponibilidadeVagasExtras] = useState<Record<string, number>>({});
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const pacotesRef = useRef<HTMLDivElement | null>(null);
  const nomeRef = useRef<HTMLInputElement | null>(null);
  const emailRef = useRef<HTMLInputElement | null>(null);
  const cpfRef = useRef<HTMLInputElement | null>(null);
  const telefoneRef = useRef<HTMLInputElement | null>(null);
  const dataRef = useRef<HTMLDivElement | null>(null);
  const horarioRef = useRef<HTMLDivElement | null>(null);
  const participantesRef = useRef<HTMLDivElement | null>(null);
  const petRef = useRef<HTMLDivElement | null>(null);
  const perguntasRef = useRef<HTMLDivElement | null>(null);
  const cartaoRef = useRef<HTMLDivElement | null>(null);
  const paymentMethodRef = useRef<HTMLDivElement | null>(null);
  const paymentFormRef = useRef<HTMLDivElement | null>(null);


  // PIX
  const [pixKey, setPixKey] = useState<string | null>(null);
  const [qrCodeImage, setQrCodeImage] = useState<string | null>(null);
  const [expirationDate, setExpirationDate] = useState<string | null>(null);
  const [pixCopiado, setPixCopiado] = useState(false);
  const paymentCardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setCheckoutUrl(null);
    setPixKey(null);
    setQrCodeImage(null);
    setExpirationDate(null);
    setCartaoResultado(null);
    setPixCopiado(false);
  }, [formaPagamento]);
  const cartaoBrand = useMemo(() => detectarBandeiraCartao(cartaoNumero), [cartaoNumero]);
  const cartaoBrandInfo = useMemo(
    () => (cartaoBrand ? cardBrandConfigs.find((brand) => brand.id === cartaoBrand) ?? null : null),
    [cartaoBrand]
  );
  const cartaoNumeroPlaceholder =
    cartaoBrand === "amex" ? "0000 000000 00000" : "0000 0000 0000 0000";
  const cartaoNumeroMaxLength = cartaoBrand === "amex" ? 17 : 23;
  const cartaoCvvMaxLength = cartaoBrand === "amex" ? 4 : 3;
  const cartaoCvvPlaceholder = cartaoBrand === "amex" ? "1234" : "123";
  const cartaoNumeroExibicao = cartaoNumero.trim() ? cartaoNumero : cartaoNumeroPlaceholder;
  const cartaoNomeExibicao = cartaoNome.trim()
    ? cartaoNome.trim().toUpperCase()
    : "NOME NO CARTAO";
  const cartaoValidadeExibicao = cartaoValidade.trim() ? cartaoValidade : "MM/AA";
  const bloqueiaEnvioCartao =
    formaPagamento === "CREDIT_CARD" &&
    ["processing", "pending"].includes(cartaoResultado?.status ?? "");

  useEffect(() => {
    setCartaoCvv((prev) => prev.slice(0, cartaoCvvMaxLength));
  }, [cartaoCvvMaxLength]);

  const resetFormulario = () => {
    setEtapa(0);
    setSelectedPackages([]);
    setNome("");
    setEmail("");
    setTelefone("");
    setCpf("");
    setSelectedDay(undefined);
    setHorario("");
    setHorariosPorPacote({});
    setSubEtapaPagamento("metodo");
    setParticipantesPorGrupo({});
    setSubPassoParticipantes(0);
    setTemPet(null);
    setCheckoutUrl(null);
    setFormaPagamento("CREDIT_CARD");
    setCartaoNome("");
    setCartaoNumero("");
    setCartaoValidade("");
    setCartaoCvv("");
    setEnderecoCep("");
    setEnderecoRua("");
    setEnderecoNumero("");
    setEnderecoComplemento("");
    setEnderecoBairro("");
    setEnderecoCidade("");
    setEnderecoEstado("");
    setRespostasPersonalizadas({});
    setFormErrors({});
    setPixKey(null);
    setQrCodeImage(null);
    setExpirationDate(null);
    setPixCopiado(false);
  };


  const todayStart = (() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  })();

  const getInputClasses = (field: string) =>
    `w-full px-3 py-2.5 rounded-xl border text-sm transition-all duration-200 focus:outline-none focus:ring-2 bg-white ${
      formErrors[field]
        ? 'border-red-300 focus:ring-red-200 focus:border-red-400 bg-red-50/30'
        : 'border-slate-200 focus:ring-[#8B4F23]/20 focus:border-[#8B4F23]'
    }`;

  const setFieldError = useCallback((field: string, message?: string) => {
    setFormErrors((prev) => {
      if (message) {
        if (prev[field] === message) return prev;
        return { ...prev, [field]: message };
      }
      if (!(field in prev)) {
        return prev;
      }
      const { [field]: _, ...rest } = prev;
      return rest;
    });
  }, []);

  const personalFields: PersonalField[] = ["nome", "email", "cpf", "telefone"];

  const getPersonalFieldError = (field: PersonalField) => {
    switch (field) {
      case "nome": {
        const valor = nome.trim();
        if (!valor) return "Informe seu nome completo.";
        if (valor.length < 3) return "Digite um nome válido.";
        return "";
      }
      case "email": {
        const valor = email.trim();
        if (!valor) return "Informe seu e-mail.";
        if (!isValidEmail(valor)) return "Digite um e-mail válido.";
        return "";
      }
      case "cpf": {
        const valor = cpf.trim();
        if (!valor) return "Informe seu CPF.";
        if (!isValidCpf(valor)) return "Digite um CPF válido.";
        return "";
      }
      case "telefone": {
        const valor = telefone.trim();
        if (!valor) return "";
        const digits = onlyNumbers(valor);
        if (digits.length < 10) return "Digite um telefone válido com DDD.";
        return "";
      }
      default:
        return "";
    }
  };

  const scrollToErrorField = useCallback((errors: Record<string, string>) => {
    const order = [
      "pacotes",
      "data",
      "horario",
      "participantes",
      "pet",
      "nome",
      "email",
      "cpf",
      "telefone",
      "cartaoNome",
      "cartaoNumero",
      "cartaoValidade",
      "cartaoCvv",
      "enderecoCep",
      "enderecoRua",
      "enderecoNumero",
      "enderecoBairro",
      "enderecoCidade",
      "enderecoEstado",
    ] as const;
    const getTarget = (key: (typeof order)[number]): HTMLElement | null => {
      switch (key) {
        case "pacotes":
          return pacotesRef.current;
        case "nome":
          return nomeRef.current;
        case "email":
          return emailRef.current;
        case "cpf":
          return cpfRef.current;
        case "telefone":
          return telefoneRef.current;
        case "data":
          return dataRef.current;
        case "horario":
          return horarioRef.current;
        case "participantes":
          return participantesRef.current;
        case "pet":
          return petRef.current;
        case "cartaoNome":
        case "cartaoNumero":
        case "cartaoValidade":
        case "cartaoCvv":
        case "enderecoCep":
        case "enderecoRua":
        case "enderecoNumero":
        case "enderecoBairro":
        case "enderecoCidade":
        case "enderecoEstado":
          return cartaoRef.current;
        default:
          return null;
      }
    };

    for (const key of order) {
      if (errors[key]) {
        const target = getTarget(key);
        if (target) {
          target.scrollIntoView({ behavior: "smooth", block: "center" });
          const maybeFocusable = target as HTMLElement & { focus?: () => void };
          if (typeof maybeFocusable.focus === "function") {
            maybeFocusable.focus();
          }
        }
        break;
      }
    }
  }, []);

  const validatePersonalField = (field: PersonalField) => {
    const message = getPersonalFieldError(field);
    setFieldError(field, message || undefined);
    return !message;
  };

  const getDadosPessoaisPagamentoErrors = () => {
    const errors: Record<string, string> = {};
    personalFields.forEach((field) => {
      const fieldError = getPersonalFieldError(field);
      if (fieldError) {
        errors[field] = fieldError;
      }
    });
    return errors;
  };

  const getCartaoDadosErrors = () => {
    const errors: Record<string, string> = {};
    if (!cartaoNome.trim()) {
      errors.cartaoNome = "Informe o nome no cartao.";
    }
    if (!isValidCardNumber(cartaoNumero)) {
      errors.cartaoNumero = "Informe um numero de cartao valido.";
    }

    const validade = parseCardExpiry(cartaoValidade);
    if (!validade) {
      errors.cartaoValidade = "Informe a validade (MM/AA).";
    } else {
      const hoje = new Date();
      const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
      const fimMesValidade = new Date(validade.year, validade.month, 0);
      if (fimMesValidade < inicioMes) {
        errors.cartaoValidade = "Cartao vencido.";
      }
    }

    const cvvDigits = onlyNumbers(cartaoCvv);
    if (cvvDigits.length < 3 || cvvDigits.length > 4) {
      errors.cartaoCvv = "Informe o CVV.";
    }

    return errors;
  };

  const getEnderecoCobrancaErrors = () => {
    const errors: Record<string, string> = {};
    const cepDigits = onlyNumbers(enderecoCep);
    if (cepDigits.length !== 8) {
      errors.enderecoCep = "Informe o CEP.";
    }
    if (!enderecoRua.trim()) {
      errors.enderecoRua = "Informe o endereco.";
    }
    if (!enderecoNumero.trim()) {
      errors.enderecoNumero = "Informe o numero.";
    }
    if (!enderecoBairro.trim()) {
      errors.enderecoBairro = "Informe o bairro.";
    }
    if (!enderecoCidade.trim()) {
      errors.enderecoCidade = "Informe a cidade.";
    }
    const estado = enderecoEstado.trim().toUpperCase();
    if (estado.length !== 2) {
      errors.enderecoEstado = "Informe o estado (UF).";
    }
    return errors;
  };

  const aplicarErrosPagamento = (errors: Record<string, string>) => {
    setFormErrors((prev) => ({ ...prev, ...errors }));
    window.setTimeout(() => scrollToErrorField(errors), 100);
  };

  // BUSCA PACOTES E COMBOS VIA FIRESTORE
  useEffect(() => {
    async function fetchData() {
      try {
        const tiposSnapshot = await getDocs(collection(db, "tipos_clientes"));
        const tiposData = tiposSnapshot.docs
          .map((docSnap) => {
            const data = docSnap.data() as Partial<TipoCliente>;
            return {
              id: docSnap.id,
              nome: data.nome ?? "",
              descricao: data.descricao ?? "",
            } as TipoCliente;
          })
          .filter((tipo) => tipo.nome.trim().length > 0)
          .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }));

        // Buscar pacotes do Firestore
        const pacotesSnapshot = await getDocs(collection(db, 'pacotes'));
        const pacotesData = pacotesSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        // Buscar combos do Firestore
        const combosSnapshot = await getDocs(collection(db, 'combos'));
        const combosData = combosSnapshot.docs
          .map((docSnap) => {
            const data = docSnap.data() as any;
            const precosPorTipo =
              data.precosPorTipo && typeof data.precosPorTipo === "object"
                ? Object.fromEntries(
                    Object.entries(data.precosPorTipo).map(([chave, valor]) => [chave, Number(valor) || 0])
                  )
                : undefined;
            return {
              id: docSnap.id,
              nome: data.nome || '',
              pacoteIds: Array.isArray(data.pacoteIds) ? data.pacoteIds.map((id: unknown) => (id ?? '').toString()).filter(Boolean) : [],
              preco: Number(data.preco ?? 0),
              precoAdulto: Number(data.precoAdulto ?? 0),
              precoCrianca: Number(data.precoCrianca ?? 0),
              precoBariatrica: Number(data.precoBariatrica ?? 0),
              precosPorTipo,
              desconto: Number(data.desconto ?? 0),
              ativo: data.ativo !== false,
            } as Combo;
          })
          .filter((combo) => combo.ativo && combo.pacoteIds.length > 0);
        
        const arr: Pacote[] = pacotesData.map((d: any) => ({
          id: d.id,
          nome: d.nome,
          tipo: d.tipo,
          emoji: d.emoji,
          precoAdulto: Number(d.precoAdulto),
          precoCrianca: Number(d.precoCrianca),
          precoBariatrica: Number(d.precoBariatrica),
          precosPorTipo:
            d.precosPorTipo && typeof d.precosPorTipo === "object"
              ? Object.fromEntries(
                  Object.entries(d.precosPorTipo).map(([chave, valor]) => [chave, Number(valor) || 0])
                )
              : undefined,
          horarios: d.horarios ?? [],
          dias: Array.isArray(d.dias) ? d.dias : [],
          limite: d.limite !== undefined ? Number(d.limite) : undefined,
          datasBloqueadas: Array.isArray(d.datasBloqueadas) ? d.datasBloqueadas : [],
          aceitaPet: d.aceitaPet !== false,
          modoHorario: d.modoHorario || 'lista',
          horarioInicio: d.horarioInicio || '',
        horarioFim: d.horarioFim || '',
          perguntasPersonalizadas: Array.isArray(d.perguntasPersonalizadas) ? d.perguntasPersonalizadas : [],
      }));
        
        setTiposClientes(tiposData);
        setPacotes(arr);
        setCombos(combosData);
        
        // Debug: verificar datas bloqueadas
        console.log('📅 Pacotes carregados:', arr.map(p => ({
          nome: p.nome,
          datasBloqueadas: p.datasBloqueadas
        })));
      } catch (err) {
        console.error('Erro ao buscar dados:', err);
        setPacotes([]);
        setCombos([]);
        setTiposClientes([]);
      } finally {
        setLoadingPacotes(false);
      }
    }
    fetchData();
  }, []);

  const tiposClientesAtivos = useMemo(() => tiposClientes, [tiposClientes]);

  const hasCustomComboPricing = useCallback(
    (combo?: Combo | null) => {
      if (!combo) return false;
      return tiposClientesAtivos.some(
        (tipo) => obterPrecoPorTipo(combo.precosPorTipo, tipo, combo) > 0
      );
    },
    [tiposClientesAtivos]
  );

  const describeComboValores = useCallback(
    (combo: Combo) => {
      const partes = tiposClientesAtivos
        .map((tipo) => {
          const valor = obterPrecoPorTipo(combo.precosPorTipo, tipo, combo);
          return valor > 0 ? `${tipo.nome} ${formatCurrency(valor)}` : "";
        })
        .filter((valor) => valor.length > 0);
      return partes.join(" • ");
    },
    [tiposClientesAtivos]
  );

  useEffect(() => {
    const q = query(collection(db, "disponibilidade"), where("fechado", "==", true));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const datas = new Set<string>();
        snapshot.forEach((docSnap) => {
          const dados = docSnap.data();
          const dataStr = typeof dados?.data === "string" ? dados.data : docSnap.id;
          datas.add(dataStr);
        });
        setDiasBloqueados(datas);
      },
      (error) => {
        console.error("Erro ao acompanhar dias bloqueados:", error);
      }
    );
    return () => unsubscribe();
  }, []);

  const selectedPacotes = useMemo(
    () => pacotes.filter((p) => p.id && selectedPackages.includes(p.id)),
    [pacotes, selectedPackages]
  );

  const pacotesPorId = useMemo(() => {
    const mapa = new Map<string, Pacote>();
    pacotes.forEach((pacote) => {
      if (pacote.id) {
        mapa.set(pacote.id, pacote);
      }
    });
    return mapa;
  }, [pacotes]);

  const pacotesPorNome = useMemo(() => {
    const mapa = new Map<string, string>();
    pacotes.forEach((pacote) => {
      if (pacote.id) {
        mapa.set(normalizarTexto(pacote.nome), pacote.id);
      }
    });
    return mapa;
  }, [pacotes]);

  const obterPacoteIdsReserva = useCallback(
    (reserva: ReservaResumo) => {
      if (Array.isArray(reserva.pacoteIds) && reserva.pacoteIds.length > 0) {
        return reserva.pacoteIds
          .map((id) => id?.toString())
          .filter((id): id is string => Boolean(id));
      }
      if (!reserva.atividade) return [];
      const atividadeNormalizada = normalizarTexto(reserva.atividade);
      const encontrados: string[] = [];
      pacotesPorNome.forEach((id, nomeNormalizado) => {
        if (atividadeNormalizada.includes(nomeNormalizado)) {
          encontrados.push(id);
        }
      });
      return encontrados;
    },
    [pacotesPorNome]
  );

  const calcularParticipantesPorPacoteReserva = useCallback(
    (reserva: ReservaResumo) => {
      const porPacote: Record<string, number> = {};
      if (Array.isArray(reserva.gruposParticipacao)) {
        reserva.gruposParticipacao.forEach((grupo) => {
          const participantesGrupo = Math.max(
            somarMapa(grupo.participantesPorTipo),
            normalizarNumero(grupo.participantes)
          );
          if (participantesGrupo <= 0) return;
          const pacoteIdsGrupo =
            Array.isArray(grupo.pacoteIds) && grupo.pacoteIds.length > 0
              ? grupo.pacoteIds
              : grupo.tipo === "pacote" && grupo.refId
              ? [grupo.refId]
              : [];
          Array.from(new Set(pacoteIdsGrupo.map((id) => id?.toString()).filter(Boolean))).forEach((pacoteId) => {
            porPacote[pacoteId] = (porPacote[pacoteId] ?? 0) + participantesGrupo;
          });
        });
      }

      if (Object.keys(porPacote).length > 0) {
        return porPacote;
      }

      const participantes = calcularParticipantesReserva(reserva);
      if (participantes <= 0) return porPacote;
      obterPacoteIdsReserva(reserva).forEach((pacoteId) => {
        porPacote[pacoteId] = (porPacote[pacoteId] ?? 0) + participantes;
      });
      return porPacote;
    },
    [obterPacoteIdsReserva]
  );

  const reservasPorPacoteHorario = useMemo(() => {
    const mapa: Record<string, number> = {};
    reservasDia.forEach((reserva) => {
      const horarioReserva = (reserva.horario ?? "").toString().trim();
      const horariosReserva =
        reserva.horariosPorPacote && typeof reserva.horariosPorPacote === "object"
          ? reserva.horariosPorPacote
          : {};
      const participantesPorPacote = calcularParticipantesPorPacoteReserva(reserva);
      Object.entries(participantesPorPacote).forEach(([pacoteId, participantes]) => {
        const horarioPacote = (horariosReserva[pacoteId] ?? horarioReserva).toString().trim();
        if (!horarioPacote || participantes <= 0) return;
        const chave = `${pacoteId}__${horarioPacote}`;
        mapa[chave] = (mapa[chave] ?? 0) + participantes;
      });
    });
    return mapa;
  }, [calcularParticipantesPorPacoteReserva, reservasDia]);

  const reservasPorPacoteDia = useMemo(() => {
    const mapa: Record<string, number> = {};
    reservasDia.forEach((reserva) => {
      const participantesPorPacote = calcularParticipantesPorPacoteReserva(reserva);
      Object.entries(participantesPorPacote).forEach(([pacoteId, participantes]) => {
        if (participantes <= 0) return;
        mapa[pacoteId] = (mapa[pacoteId] ?? 0) + participantes;
      });
    });
    return mapa;
  }, [calcularParticipantesPorPacoteReserva, reservasDia]);

  const comboAtivo = useMemo(() => {
    if (selectedPackages.length === 0) return undefined;
    return combos.find(
      (c) =>
        c.pacoteIds.length === selectedPackages.length &&
        c.pacoteIds.every((id) => selectedPackages.includes(id))
    );
  }, [combos, selectedPackages]);

  const gruposParticipacao = useMemo<GrupoParticipacao[]>(() => {
    if (selectedPackages.length === 0) return [];
    const idsSelecionados = new Set(selectedPackages);
    const grupos: GrupoParticipacao[] = [];

    combos
      .filter(
        (combo) =>
          combo.id &&
          combo.ativo &&
          combo.pacoteIds.length > 1 &&
          combo.pacoteIds.every((id) => idsSelecionados.has(id) && pacotesPorId.has(id))
      )
      .sort((a, b) => b.pacoteIds.length - a.pacoteIds.length)
      .forEach((combo) => {
        const nomes = combo.pacoteIds
          .map((id) => pacotesPorId.get(id)?.nome)
          .filter(Boolean)
          .join(" + ");
        grupos.push({
          chave: `combo:${combo.id}`,
          tipo: "combo",
          refId: combo.id!,
          nome: combo.nome,
          descricao: nomes ? `Participa de ${nomes}` : "Participa do combo completo",
          pacoteIds: combo.pacoteIds,
          combo,
        });
      });

    selectedPacotes.forEach((pacote) => {
      if (!pacote.id) return;
      grupos.push({
        chave: `pacote:${pacote.id}`,
        tipo: "pacote",
        refId: pacote.id,
        nome: `Somente ${pacote.nome}`,
        descricao: `Para quem vai participar apenas de ${pacote.nome}`,
        pacoteIds: [pacote.id],
        pacote,
      });
    });

    return grupos;
  }, [combos, pacotesPorId, selectedPackages, selectedPacotes]);

  useEffect(() => {
    setParticipantesPorGrupo((prev) => {
      const proximo: ParticipantesPorGrupo = {};

      gruposParticipacao.forEach((grupo) => {
        const anterior = prev[grupo.chave] ?? {};
        const mapaGrupo: TipoClienteQuantidade = {};
        tiposClientesAtivos.forEach((tipo) => {
          const chaveTipo = obterChaveTipo(tipo);
          const existente = obterValorMapa(anterior, tipo);
          // Preserva valor anterior quando válido; caso contrário começa em 0.
          // Sem auto-default de 1 — o cliente decide quem participa de cada grupo.
          mapaGrupo[chaveTipo] = Number.isFinite(existente) ? Number(existente) : 0;
        });
        proximo[grupo.chave] = mapaGrupo;
      });

      return proximo;
    });
  }, [gruposParticipacao, tiposClientesAtivos]);

  const participantesPorTipo = useMemo(
    () =>
      somarMapasQuantidade(
        gruposParticipacao.map((grupo) => participantesPorGrupo[grupo.chave])
      ),
    [gruposParticipacao, participantesPorGrupo]
  );

  const participantesPorPacoteAtual = useMemo(() => {
    const mapa: Record<string, number> = {};
    gruposParticipacao.forEach((grupo) => {
      const totalGrupo = somarMapa(participantesPorGrupo[grupo.chave]);
      if (totalGrupo <= 0) return;
      grupo.pacoteIds.forEach((pacoteId) => {
        mapa[pacoteId] = (mapa[pacoteId] ?? 0) + totalGrupo;
      });
    });
    return mapa;
  }, [gruposParticipacao, participantesPorGrupo]);

  const gruposParticipacaoPayload = useMemo<GrupoParticipacaoPayload[]>(
    () =>
      gruposParticipacao
        .map((grupo) => {
          const participantesGrupo = normalizarMapaQuantidade(participantesPorGrupo[grupo.chave]);
          const participantes = somarMapa(participantesGrupo);
          return {
            tipo: grupo.tipo,
            refId: grupo.refId,
            nome: grupo.nome,
            pacoteIds: grupo.pacoteIds,
            participantesPorTipo: participantesGrupo,
            participantes,
          };
        })
        .filter((grupo) => grupo.participantes > 0),
    [gruposParticipacao, participantesPorGrupo]
  );

  const temPacoteFaixa = useMemo(
    () =>
      selectedPacotes.some(
        (p) => p.modoHorario === "intervalo" || (p.horarios && p.horarios.length === 0)
      ),
    [selectedPacotes]
  );

  useEffect(() => {
    if (!selectedDay) {
      setReservasDia([]);
      return;
    }
    const dataStr = selectedDay.toISOString().slice(0, 10);
    const q = query(collection(db, "reservas"), where("data", "==", dataStr));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const dados = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        })) as ReservaResumo[];
        const reservasAtivas = dados.filter(reservaContaParaOcupacao);
        setReservasDia(reservasAtivas);
      },
      (error) => {
        console.error("Erro ao acompanhar reservas:", error);
        setReservasDia([]);
      }
    );
    return () => unsubscribe();
  }, [selectedDay]);

  useEffect(() => {
    if (!selectedDay) {
      setDisponibilidadeHorarios({});
      setDisponibilidadeVagasExtras({});
      setDiaSelecionadoFechado(false);
      return;
    }
    let ativo = true;
    const dataStr = selectedDay.toISOString().slice(0, 10);
    const carregarDisponibilidade = async () => {
      try {
        const ref = doc(db, "disponibilidade", dataStr);
        const snap = await getDoc(ref);
        if (!ativo) return;
        const dados = snap.exists() ? snap.data() : null;
        setDisponibilidadeHorarios(
          normalizarBloqueiosDisponibilidade(dados?.horarios as Record<string, unknown> | null)
        );
        setDisponibilidadeVagasExtras(
          normalizarVagasExtrasDisponibilidade(
            dados?.vagasExtras as Record<string, unknown> | null
          )
        );
        setDiaSelecionadoFechado(Boolean(dados?.fechado) || diasBloqueados.has(dataStr));
      } catch (error) {
        console.error("Erro ao carregar disponibilidade:", error);
        if (ativo) {
          setDisponibilidadeHorarios({});
          setDisponibilidadeVagasExtras({});
          setDiaSelecionadoFechado(diasBloqueados.has(dataStr));
        }
      }
    };
    carregarDisponibilidade();
    return () => {
      ativo = false;
    };
  }, [selectedDay, diasBloqueados]);

  useEffect(() => {
    if (selectedPacotes.length === 0) {
      setRespostasPersonalizadas({});
      return;
    }
    setRespostasPersonalizadas((prev) => {
      const permitidos = new Set<string>();
      selectedPacotes.forEach((pacote) => {
        if (!pacote.id) return;
        (pacote.perguntasPersonalizadas ?? []).forEach((pergunta) => {
          permitidos.add(`${pacote.id}-${pergunta.id}`);
        });
      });
      const filtrados: Record<string, { resposta?: string; condicional?: string }> = {};
      Object.entries(prev).forEach(([key, value]) => {
        if (permitidos.has(key)) {
          filtrados[key] = value;
        }
      });
      return filtrados;
    });
  }, [selectedPacotes]);

  const horariosVisiveis = useMemo(() => {
    if (selectedPacotes.length === 0) return [];
    const horariosUnicos = [...new Set(selectedPacotes.flatMap((p) => p.horarios || []))].sort(
      compararTextoNumericamente
    );
    if (!selectedDay) return horariosUnicos;
    if (diaSelecionadoFechado) return [];
    const dataStr = selectedDay.toISOString().slice(0, 10);
    let filtrados = horariosUnicos.filter((horarioLista) =>
      selectedPacotes.every((pacote) => {
        if (!pacote.id) return true;
        const chave = `${dataStr}-${pacote.id}-${horarioLista}`;
        return disponibilidadeHorarios[chave] !== false;
      })
    );
    const hoje = new Date();
    const mesmoDia =
      selectedDay.getFullYear() === hoje.getFullYear() &&
      selectedDay.getMonth() === hoje.getMonth() &&
      selectedDay.getDate() === hoje.getDate();

    if (mesmoDia) {
      const minutosAgora = hoje.getHours() * 60 + hoje.getMinutes();
      filtrados = filtrados.filter((h) => {
        const minutos = parseHorarioParaMinutos(h);
        if (minutos === null) return true;
        return minutos >= minutosAgora;
      });
    }

    return filtrados.sort(compararTextoNumericamente);
  }, [selectedDay, selectedPacotes, disponibilidadeHorarios, diaSelecionadoFechado]);

  const vagasRestantesPorHorario = useMemo(() => {
    const mapa: Record<string, number | null> = {};
    if (selectedPacotes.length === 0) return mapa;
    const dataStr = selectedDay?.toISOString().slice(0, 10) ?? "";

    horariosVisiveis.forEach((horarioLista) => {
      let restante: number | null = null;
      selectedPacotes.forEach((pacote) => {
        if (!pacote.id) return;
        const limite = Number(pacote.limite ?? 0);
        if (!Number.isFinite(limite) || limite <= 0) return;
        const ehFaixa =
          pacote.modoHorario === "intervalo" || (pacote.horarios?.length ?? 0) === 0;
        const reservados = ehFaixa
          ? reservasPorPacoteDia[pacote.id] ?? 0
          : reservasPorPacoteHorario[`${pacote.id}__${horarioLista}`] ?? 0;
        const vagasExtras = obterVagasExtrasDisponibilidade({
          dataStr,
          pacoteId: pacote.id,
          horario: ehFaixa ? undefined : horarioLista,
          vagasExtras: disponibilidadeVagasExtras,
        });
        const pacoteRestante = limite + vagasExtras - reservados;
        restante = restante === null ? pacoteRestante : Math.min(restante, pacoteRestante);
      });
      mapa[horarioLista] = restante;
    });
    return mapa;
  }, [
    horariosVisiveis,
    reservasPorPacoteDia,
    reservasPorPacoteHorario,
    selectedDay,
    selectedPacotes,
    disponibilidadeVagasExtras,
  ]);

  const totalParticipantesSelecionados = useMemo(
    () => somarMapa(participantesPorTipo) + naoPagante,
    [naoPagante, participantesPorTipo]
  );

  const vagasRestantesPorPacoteAtual = useMemo(() => {
    const mapa: Record<string, number | null> = {};
    const dataStr = selectedDay?.toISOString().slice(0, 10) ?? "";

    selectedPacotes.forEach((pacote) => {
      if (!pacote.id) return;
      const limite = Number(pacote.limite ?? 0);
      if (!Number.isFinite(limite) || limite <= 0) {
        mapa[pacote.id] = null;
        return;
      }

      const ehFaixa =
        pacote.modoHorario === "intervalo" || (pacote.horarios?.length ?? 0) === 0;
      const horarioPacote = horariosPorPacote[pacote.id] ?? horario;
      const reservados = ehFaixa
        ? reservasPorPacoteDia[pacote.id] ?? 0
        : horarioPacote
        ? reservasPorPacoteHorario[`${pacote.id}__${horarioPacote}`] ?? 0
        : 0;
      const vagasExtras = obterVagasExtrasDisponibilidade({
        dataStr,
        pacoteId: pacote.id,
        horario: ehFaixa ? undefined : horarioPacote,
        vagasExtras: disponibilidadeVagasExtras,
      });
      mapa[pacote.id] = limite + vagasExtras - reservados;
    });

    return mapa;
  }, [
    disponibilidadeVagasExtras,
    horario,
    horariosPorPacote,
    reservasPorPacoteDia,
    reservasPorPacoteHorario,
    selectedDay,
    selectedPacotes,
  ]);

  const horariosComVagas = useMemo(
    () =>
      horariosVisiveis.filter((horarioLista) => {
        const restante = vagasRestantesPorHorario[horarioLista];
        if (restante === null) return true;
        if (typeof restante !== "number") return true;
        return Math.max(restante, 0) > 0;
      }),
    [horariosVisiveis, vagasRestantesPorHorario]
  );

  const horariosDisponiveis = useMemo(
    () =>
      horariosComVagas.filter((horarioLista) => {
        const restante = vagasRestantesPorHorario[horarioLista];
        if (restante === null) return true;
        if (typeof restante !== "number") return true;
        const restanteNormalizado = Math.max(restante, 0);
        if (restanteNormalizado <= 0) return false;
        if (totalParticipantesSelecionados <= 0) return true;
        return restanteNormalizado >= totalParticipantesSelecionados;
      }),
    [horariosComVagas, vagasRestantesPorHorario, totalParticipantesSelecionados]
  );

  useEffect(() => {
    if (!horario) return;
    if (!horariosDisponiveis.includes(horario)) {
      setHorario("");
    }
  }, [horariosDisponiveis, horario]);

  const disponibilidadePacotesNoDia = useMemo(() => {
    const mapa: Record<string, boolean> = {};
    if (!selectedDay || diaSelecionadoFechado) return mapa;

    const dataStr = selectedDay.toISOString().slice(0, 10);
    const hoje = new Date();
    const mesmoDia =
      selectedDay.getFullYear() === hoje.getFullYear() &&
      selectedDay.getMonth() === hoje.getMonth() &&
      selectedDay.getDate() === hoje.getDate();
    const minutosAgora = hoje.getHours() * 60 + hoje.getMinutes();

    pacotes.forEach((pacote) => {
      if (!pacote.id) return;
      if ((pacote.datasBloqueadas ?? []).includes(dataStr)) {
        mapa[pacote.id] = false;
        return;
      }

      const ehFaixa =
        pacote.modoHorario === "intervalo" || (pacote.horarios?.length ?? 0) === 0;
      const limite = Number(pacote.limite ?? 0);
      const temLimite = Number.isFinite(limite) && limite > 0;

      if (ehFaixa) {
        if (!temLimite) {
          mapa[pacote.id] = true;
          return;
        }
        const reservados = reservasPorPacoteDia[pacote.id] ?? 0;
        const vagasExtras = obterVagasExtrasDisponibilidade({
          dataStr,
          pacoteId: pacote.id,
          vagasExtras: disponibilidadeVagasExtras,
        });
        mapa[pacote.id] = limite + vagasExtras - reservados > 0;
        return;
      }

      let horariosPacote = Array.isArray(pacote.horarios) ? pacote.horarios : [];
      if (horariosPacote.length === 0) {
        mapa[pacote.id] = false;
        return;
      }

      horariosPacote = horariosPacote.filter((h) => {
        const chave = `${dataStr}-${pacote.id}-${h}`;
        return disponibilidadeHorarios[chave] !== false;
      });

      if (mesmoDia) {
        horariosPacote = horariosPacote.filter((h) => {
          const minutos = parseHorarioParaMinutos(h);
          if (minutos === null) return true;
          return minutos >= minutosAgora;
        });
      }

      if (horariosPacote.length === 0) {
        mapa[pacote.id] = false;
        return;
      }

      if (!temLimite) {
        mapa[pacote.id] = true;
        return;
      }

      mapa[pacote.id] = horariosPacote.some((h) => {
        const reservados = reservasPorPacoteHorario[`${pacote.id}__${h}`] ?? 0;
        const vagasExtras = obterVagasExtrasDisponibilidade({
          dataStr,
          pacoteId: pacote.id,
          horario: h,
          vagasExtras: disponibilidadeVagasExtras,
        });
        return limite + vagasExtras - reservados > 0;
      });
    });

    return mapa;
  }, [
    diaSelecionadoFechado,
    disponibilidadeHorarios,
    disponibilidadeVagasExtras,
    pacotes,
    reservasPorPacoteDia,
    reservasPorPacoteHorario,
    selectedDay,
  ]);

  useEffect(() => {
    const target =
      etapa === 0
        ? pacotesRef.current
        : etapa === 1
        ? dataRef.current ?? horarioRef.current
        : etapa === 2
        ? participantesRef.current ?? petRef.current
        : etapa === 3
        ? perguntasRef.current ?? participantesRef.current
        : subEtapaPagamento === "metodo"
        ? paymentMethodRef.current
        : paymentFormRef.current ?? nomeRef.current ?? cartaoRef.current;

    if (!target) return;
    const timeoutId = window.setTimeout(() => {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
    return () => window.clearTimeout(timeoutId);
  }, [etapa, subEtapaPagamento]);

  if (loadingPacotes) {
    return (
      <section id="reservas" className="py-10">
        <div className="mx-auto w-full max-w-screen-2xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl rounded-3xl border border-white/60 bg-white/80 p-8 text-center shadow-xl backdrop-blur md:p-10">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
              Reserva
            </p>
            <h2 className="mt-2 text-2xl font-bold text-[#8B4F23] md:text-3xl">
              Carregando pacotes...
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Aguarde um instante enquanto preparamos o formulário.
            </p>
          </div>
        </div>
      </section>
    );
  }

  if (pacotes.length === 0) {
    return (
      <section id="reservas" className="py-10">
        <div className="mx-auto w-full max-w-screen-2xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl rounded-3xl border border-white/60 bg-white/80 p-8 text-center shadow-xl backdrop-blur md:p-10">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
              Reserva
            </p>
            <h2 className="mt-2 text-2xl font-bold text-[#8B4F23] md:text-3xl">
              Nenhum pacote disponível para reserva
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Tente novamente mais tarde ou entre em contato via WhatsApp.
            </p>
          </div>
        </div>
      </section>
    );
  }

  // Calcula total: soma de pacotes selecionados × qtd participantes por tipo.
  // Se a seleção bater com um combo, aplica preço/desconto especial.
  const calcularTotalGrupo = (grupo: GrupoParticipacao, quantidades: TipoClienteQuantidade) => {
    if (grupo.tipo === "combo" && grupo.combo) {
      const combo = grupo.combo;
      const totalParticipantesGrupo = somarMapa(quantidades);
      if (totalParticipantesGrupo <= 0) return 0;

      if (hasCustomComboPricing(combo)) {
        return tiposClientesAtivos.reduce((acc, tipo) => {
          const quantidade = Number(obterValorMapa(quantidades, tipo) ?? 0);
          const preco = obterPrecoPorTipo(combo.precosPorTipo, tipo, combo);
          return acc + quantidade * preco;
        }, 0);
      }

      const valorCombo = Number(combo.preco);
      if (Number.isFinite(valorCombo) && valorCombo > 0) {
        return valorCombo * totalParticipantesGrupo;
      }

      const totalPacotes = combo.pacoteIds.reduce((subtotal, pacoteId) => {
        const pacote = pacotesPorId.get(pacoteId);
        if (!pacote) return subtotal;
        return subtotal + tiposClientesAtivos.reduce((acc, tipo) => {
          const quantidade = Number(obterValorMapa(quantidades, tipo) ?? 0);
          const preco = obterPrecoPorTipo(pacote.precosPorTipo, tipo, pacote);
          return acc + quantidade * preco;
        }, 0);
      }, 0);

      return combo.desconto && combo.desconto > 0
        ? totalPacotes * (1 - combo.desconto / 100)
        : totalPacotes;
    }

    if (grupo.tipo === "pacote" && grupo.pacote) {
      return tiposClientesAtivos.reduce((acc, tipo) => {
        const quantidade = Number(obterValorMapa(quantidades, tipo) ?? 0);
        const preco = obterPrecoPorTipo(grupo.pacote?.precosPorTipo, tipo, grupo.pacote);
        return acc + quantidade * preco;
      }, 0);
    }

    return 0;
  };

  // Preço unitário (por pessoa) de um tipo de cliente no contexto de um grupo (combo ou pacote).
  const precoPorTipoNoGrupo = (grupo: GrupoParticipacao, tipo: TipoCliente): number => {
    if (grupo.tipo === "pacote" && grupo.pacote) {
      return obterPrecoPorTipo(grupo.pacote.precosPorTipo, tipo, grupo.pacote);
    }
    if (grupo.tipo === "combo" && grupo.combo) {
      const combo = grupo.combo;
      if (hasCustomComboPricing(combo)) {
        return obterPrecoPorTipo(combo.precosPorTipo, tipo, combo);
      }
      const valorCombo = Number(combo.preco);
      if (Number.isFinite(valorCombo) && valorCombo > 0) {
        return valorCombo;
      }
      // Soma do preço de cada pacote do combo p/ esse tipo, com possível desconto
      const total = combo.pacoteIds.reduce((acc, pacoteId) => {
        const pacote = pacotesPorId.get(pacoteId);
        return pacote ? acc + obterPrecoPorTipo(pacote.precosPorTipo, tipo, pacote) : acc;
      }, 0);
      return combo.desconto && combo.desconto > 0 ? total * (1 - combo.desconto / 100) : total;
    }
    return 0;
  };

  const calcularTotal = () =>
    gruposParticipacao.reduce(
      (total, grupo) =>
        total + calcularTotalGrupo(grupo, participantesPorGrupo[grupo.chave] ?? {}),
      0
    );

  const atualizarParticipantesGrupo = (grupoChave: string, tipo: TipoCliente, delta: number) => {
    const chaveTipo = obterChaveTipo(tipo);
    setParticipantesPorGrupo((prev) => {
      const grupoAtual = prev[grupoChave] ?? {};
      const valorAtual = Number(obterValorMapa(grupoAtual, tipo) ?? 0);
      return {
        ...prev,
        [grupoChave]: {
          ...grupoAtual,
          [chaveTipo]: Math.max(0, valorAtual + delta),
        },
      };
    });
    setFieldError("participantes");
  };

  const hasDisponibilidadeNoDia = (day: Date) => {
    // Cliente escolhe pacotes ANTES da data (etapa 0 -> 1),
    // entao filtra apenas pelos pacotes selecionados (precisam estar TODOS disponiveis).
    if (selectedPacotes.length === 0) return false;
    const dayStr = day.toISOString().slice(0, 10);
    if (diasBloqueados.has(dayStr)) return false;

    const diaSemana = day.getDay();
    const hoje = new Date();
    const ehHoje =
      day.getFullYear() === hoje.getFullYear() &&
      day.getMonth() === hoje.getMonth() &&
      day.getDate() === hoje.getDate();
    const minutosAgora = ehHoje ? hoje.getHours() * 60 + hoje.getMinutes() : -1;

    // TODOS os pacotes precisam estar disponiveis no dia (interseccao),
    // se nao a pessoa que paga combo nao consegue fazer tudo.
    return selectedPacotes.every((pacote) => {
      if (pacote.dias && pacote.dias.length > 0 && !pacote.dias.includes(diaSemana)) return false;
      const datasBloqueadas = pacote.datasBloqueadas ?? [];
      if (datasBloqueadas.includes(dayStr)) return false;

      const ehFaixa =
        pacote.modoHorario === "intervalo" || (pacote.horarios?.length ?? 0) === 0;
      if (ehFaixa) return pacote.modoHorario === "intervalo";

      const horarios = (pacote.horarios ?? []).filter((h) => {
        if (pacote.id && disponibilidadeHorarios[`${dayStr}-${pacote.id}-${h}`] === false) return false;
        if (ehHoje) {
          const min = parseHorarioParaMinutos(h);
          if (min !== null && min < minutosAgora) return false;
        }
        return true;
      });

      return horarios.length > 0;
    });
  };

  const isBlockedDay = (day: Date) => {
    if (selectedPacotes.length === 0) return false;
    const dayStr = day.toISOString().slice(0, 10);
    if (diasBloqueados.has(dayStr)) return true;
    return selectedPacotes.every((pacote) =>
      (pacote.datasBloqueadas ?? []).includes(dayStr)
    );
  };

  const getPetMessage = () => {
    if (selectedPacotes.length === 0) return null;
    
    const pacotesComPet = selectedPacotes.filter(p => p.aceitaPet);
    const pacotesSemPet = selectedPacotes.filter(p => !p.aceitaPet);
    
    if (pacotesSemPet.length > 0 && pacotesComPet.length > 0) {
      const nomesSemPet = pacotesSemPet.map(p => p.nome).join(", ");
      const nomesComPet = pacotesComPet.map(p => p.nome).join(", ");
      return `A atividade ${nomesSemPet} não permite Pets, A ${nomesComPet} sim.`;
    }
    
    if (pacotesSemPet.length > 0 && pacotesComPet.length === 0) {
      const nomes = pacotesSemPet.map(p => p.nome).join(", ");
      return `Não é permitido pets na atividade: ${nomes}`;
    }
    
    return null;
  };

  const handleDaySelect = (day?: Date) => {
    setSelectedDay(day);
    setHorario("");
    setHorariosPorPacote({});
    setFieldError("data");
    setFieldError("horario");
  };

  const handlePackageToggle = (packageId: string) => {
    setSelectedPackages(prev => 
      prev.includes(packageId) 
        ? prev.filter(id => id !== packageId)
        : [...prev, packageId]
    );
    setSelectedDay(undefined);
    setHorario("");
    setHorariosPorPacote({});
    setTemPet(null);
    setFieldError("pacotes");
    setFieldError("data");
    setFieldError("horario");
  };

  const atualizarRespostaBase = (
    chave: string,
    valor: string,
    condicaoEsperada?: string,
    trim?: boolean
  ) => {
    setRespostasPersonalizadas((prev) => {
      const proximo = { ...prev };
      const resultado = trim ? valor.trim() : valor;

      if (!resultado) {
        if (proximo[chave]) {
          delete proximo[chave];
        }
        return proximo;
      }

      const atual = proximo[chave] ?? {};
      const atualizado: { resposta?: string; condicional?: string } = { ...atual, resposta: resultado };

      if (condicaoEsperada && resultado !== condicaoEsperada && atualizado.condicional !== undefined) {
        delete atualizado.condicional;
      }

      proximo[chave] = atualizado;
      return proximo;
    });
  };

  const atualizarRespostaCondicional = (chave: string, valor: string, trim?: boolean) => {
    setRespostasPersonalizadas((prev) => {
      const proximo = { ...prev };
      const resultado = trim ? valor.trim() : valor;

      if (!resultado) {
        if (proximo[chave]) {
          const atualizado = { ...proximo[chave] };
          delete atualizado.condicional;
          proximo[chave] = atualizado;
        }
        return proximo;
      }

      const atual = proximo[chave] ?? {};
      proximo[chave] = { ...atual, condicional: resultado };
      return proximo;
    });
  };

  const montarRespostasPersonalizadas = (): {
    respostas: PerguntaPersonalizadaRespostaPayload[];
    erro?: string;
  } => {
    const respostas: PerguntaPersonalizadaRespostaPayload[] = [];
    for (const pacote of selectedPacotes) {
      if (!pacote.id) continue;
      const perguntas = pacote.perguntasPersonalizadas ?? [];
      for (const pergunta of perguntas) {
        const chave = `${pacote.id}-${pergunta.id}`;
        const registro = respostasPersonalizadas[chave];
        let valorBase = registro?.resposta ?? "";
        if (pergunta.tipo === "texto") {
          valorBase = valorBase.toString().trim();
        } else if (pergunta.tipo === "sim_nao") {
          valorBase = valorBase.toString();
        }

        if (pergunta.obrigatoria) {
          if (pergunta.tipo === "sim_nao") {
            if (valorBase !== "sim" && valorBase !== "nao") {
              return {
                respostas: [],
                erro: `Responda a pergunta "${pergunta.pergunta}" do pacote ${pacote.nome}.`,
              };
            }
          } else if (!valorBase) {
            return {
              respostas: [],
              erro: `Responda a pergunta "${pergunta.pergunta}" do pacote ${pacote.nome}.`,
            };
          }
        }

        const possuiRespostaBase =
          pergunta.tipo === "sim_nao"
            ? valorBase === "sim" || valorBase === "nao"
            : Boolean(valorBase);

        if (!possuiRespostaBase) {
          // Pergunta opcional sem resposta
          continue;
        }

        const respostaFormatada: PerguntaPersonalizadaRespostaPayload = {
          pacoteId: pacote.id,
          pacoteNome: pacote.nome,
          perguntaId: pergunta.id,
          pergunta: pergunta.pergunta,
          tipo: pergunta.tipo,
          obrigatoria: pergunta.obrigatoria,
          resposta: pergunta.tipo === "texto" ? valorBase : valorBase,
          ...(pergunta.emojiSim ? { emojiSim: pergunta.emojiSim } : {}),
          ...(pergunta.emojiNao ? { emojiNao: pergunta.emojiNao } : {}),
        };

        if (pergunta.perguntaCondicional) {
          const cond = pergunta.perguntaCondicional;
          const condicaoAtiva = valorBase === cond.condicao;
          if (condicaoAtiva) {
            let valorCondicional = registro?.condicional ?? "";
            if (cond.tipo === "texto") {
              valorCondicional = valorCondicional.toString().trim();
            } else if (cond.tipo === "sim_nao") {
              valorCondicional = valorCondicional.toString();
            }

            if (cond.obrigatoria) {
              if (cond.tipo === "sim_nao") {
                if (valorCondicional !== "sim" && valorCondicional !== "nao") {
                  return {
                    respostas: [],
                    erro: `Responda a pergunta complementar "${cond.pergunta}" do pacote ${pacote.nome}.`,
                  };
                }
              } else if (!valorCondicional) {
                return {
                  respostas: [],
                  erro: `Responda a pergunta complementar "${cond.pergunta}" do pacote ${pacote.nome}.`,
                };
              }
            }

            const possuiRespostaCondicional =
              cond.tipo === "sim_nao"
                ? valorCondicional === "sim" || valorCondicional === "nao"
                : Boolean(valorCondicional);

            if (possuiRespostaCondicional) {
              respostaFormatada.perguntaCondicional = {
                pergunta: cond.pergunta,
                tipo: cond.tipo,
                obrigatoria: cond.obrigatoria,
                resposta: valorCondicional,
                ...(cond.emojiSim ? { emojiSim: cond.emojiSim } : {}),
                ...(cond.emojiNao ? { emojiNao: cond.emojiNao } : {}),
              };
            }
          }
        }

        respostas.push(respostaFormatada);
      }
    }

    return { respostas };
  };

  const errorFocusOrder = [
    "pacotes",
    "data",
    "horario",
    "participantes",
    "pet",
    "nome",
    "email",
    "cpf",
    "telefone",
    "cartaoNome",
    "cartaoNumero",
    "cartaoValidade",
    "cartaoCvv",
    "enderecoCep",
    "enderecoRua",
    "enderecoNumero",
    "enderecoBairro",
    "enderecoCidade",
    "enderecoEstado",
  ] as const;

  const etapaParaCampo = (campo: string): EtapaReserva => {
    if (campo === "pacotes") return 0;
    if (campo === "data") return 1;
    if (["horario", "perguntas"].includes(campo)) return 2;
    if (["participantes", "pet"].includes(campo)) return 3;
    return 4;
  };

  const etapaParaPrimeiroErro = (errors: Record<string, string>): EtapaReserva => {
    for (const key of errorFocusOrder) {
      if (errors[key]) {
        return etapaParaCampo(key);
      }
    }
    const fallbackKey = Object.keys(errors)[0];
    return fallbackKey ? etapaParaCampo(fallbackKey) : 0;
  };

  const getErrorsAteEtapa = (ateEtapa: EtapaReserva) => {
    const errors: Record<string, string> = {};

    // Etapa 0: Pacotes
    if (ateEtapa >= 0) {
      if (selectedPackages.length === 0) {
        errors.pacotes = "Selecione pelo menos um pacote.";
      }
    }

    // Etapa 1: Data
    if (ateEtapa >= 1) {
      if (!selectedDay) {
        errors.data = "Selecione uma data disponível.";
      } else if (diaSelecionadoFechado) {
        errors.data = "Esta data está indisponível. Escolha outra.";
      }
    }

    // Etapa 2: Horário (de cada pacote) + perguntas personalizadas
    if (ateEtapa >= 2) {
      const pacotesComHorario = selectedPacotes.filter(
        (p) => p.modoHorario !== "intervalo" && (p.horarios?.length ?? 0) > 0
      );
      const pacotesSemHorarioVisivel = pacotesComHorario.filter((pacote) => {
        const horariosPacote = (pacote.horarios ?? []).filter((h) => horariosVisiveis.includes(h));
        return horariosPacote.length === 0;
      });
      const pacotesSemHorarioComVaga = pacotesComHorario.filter((pacote) => {
        const horariosPacote = (pacote.horarios ?? []).filter((h) => horariosVisiveis.includes(h));
        return horariosPacote.length > 0 && !horariosPacote.some((h) => horariosComVagas.includes(h));
      });
      const pacotesSemHorarioSelecionado = pacotesComHorario.filter((pacote) => {
        if (!pacote.id) return false;
        const horariosPacote = (pacote.horarios ?? []).filter((h) => horariosDisponiveis.includes(h));
        return horariosPacote.length > 0 && !horariosPorPacote[pacote.id];
      });

      if (selectedDay && pacotesSemHorarioVisivel.length > 0) {
        errors.horario = "Não há horários disponíveis para os pacotes selecionados nesta data. Escolha outra data.";
      } else if (selectedDay && pacotesSemHorarioComVaga.length > 0) {
        errors.horario = "Todos os horários estão lotados para os pacotes selecionados.";
      } else if (selectedDay && pacotesSemHorarioSelecionado.length > 0) {
        errors.horario = "Escolha o horário de todos os pacotes selecionados.";
      } else if (selectedDay && pacotesComHorario.length === 0 && !temPacoteFaixa) {
        errors.horario = "Nenhum horário configurado para esta data. Escolha outra data.";
      }
    }

    // Etapa 3: Participantes + pet
    if (ateEtapa >= 3) {
      const totalParticipantes = totalParticipantesSelecionados;
      if (totalParticipantes <= 0) {
        errors.participantes = "Informe a quantidade de participantes.";
      }

      const pacoteSemParticipante = selectedPacotes.find((pacote) => {
        if (!pacote.id) return false;
        return (participantesPorPacoteAtual[pacote.id] ?? 0) <= 0;
      });
      if (pacoteSemParticipante?.id) {
        errors.participantes = `Informe quem vai participar de ${pacoteSemParticipante.nome} ou remova este pacote.`;
      }

      const pacoteSemVaga = selectedPacotes.find((pacote) => {
        if (!pacote.id) return false;
        const restante = vagasRestantesPorPacoteAtual[pacote.id];
        if (typeof restante !== "number") return false;
        const participantesDoPacote = participantesPorPacoteAtual[pacote.id] ?? 0;
        return participantesDoPacote > Math.max(restante, 0);
      });
      if (pacoteSemVaga?.id) {
        const restante = Math.max(vagasRestantesPorPacoteAtual[pacoteSemVaga.id] ?? 0, 0);
        errors.participantes = `Restam apenas ${restante} vaga(s) para ${pacoteSemVaga.nome}.`;
      }

      if (temPet === null) {
        errors.pet = "Informe se vai levar pet.";
      }
    }

    if (ateEtapa >= 4) {
      Object.assign(errors, getDadosPessoaisPagamentoErrors());

      if (formaPagamento === "CREDIT_CARD") {
        Object.assign(errors, getCartaoDadosErrors(), getEnderecoCobrancaErrors());
      }
    }

    return errors;
  };

  const validateForm = (
    ateEtapa: EtapaReserva,
    options?: { scroll?: boolean }
  ) => {
    const errors = getErrorsAteEtapa(ateEtapa);
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) {
      if (options?.scroll !== false) {
        scrollToErrorField(errors);
      }
      return { ok: false, errors };
    }
    return { ok: true, errors: {} as Record<string, string> };
  };

  const wizardSteps = [
    {
      title: "Pacotes",
      description: "Escolha uma ou mais atividades.",
    },
    {
      title: "Data",
      description: "Quando você quer vir?",
    },
    {
      title: "Horários",
      description: "Escolha o horário e responda as perguntas de cada pacote.",
    },
    {
      title: "Participantes",
      description: "",
    },
    {
      title: "Pagamento",
      description: "Revise, escolha como pagar e finalize.",
    },
  ] as const;

  const subEtapasCartao = [
    { id: "cartao-dados", label: "Dados" },
    { id: "cartao-cartao", label: "Cartão" },
    { id: "cartao-endereco", label: "Endereço" },
  ] as const;
  const isSubEtapaCartao = subEtapaPagamento.startsWith("cartao");
  const pagamentoPrecisaContinuar =
    etapa < 4 ||
    subEtapaPagamento === "metodo" ||
    subEtapaPagamento === "cartao-dados" ||
    subEtapaPagamento === "cartao-cartao";
  const subEtapaPagamentoParaErro = (errors: Record<string, string>): SubEtapaPagamento | null => {
    const camposDados = ["nome", "email", "cpf", "telefone"];
    const camposCartao = ["cartaoNome", "cartaoNumero", "cartaoValidade", "cartaoCvv"];
    const camposEndereco = [
      "enderecoCep",
      "enderecoRua",
      "enderecoNumero",
      "enderecoBairro",
      "enderecoCidade",
      "enderecoEstado",
    ];
    if (camposDados.some((campo) => errors[campo])) {
      return formaPagamento === "PIX" ? "pix" : "cartao-dados";
    }
    if (camposCartao.some((campo) => errors[campo])) return "cartao-cartao";
    if (camposEndereco.some((campo) => errors[campo])) return "cartao-endereco";
    return null;
  };

  const handleSelecionarFormaPagamento = (metodo: FormaPagamento) => {
    setFormaPagamento(metodo);
    setSubEtapaPagamento(metodo === "PIX" ? "pix" : "cartao-dados");

    window.setTimeout(() => {
      const target = paymentFormRef.current ?? nomeRef.current ?? cartaoRef.current;
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  };

  const handleVoltarEtapa = () => {
    if (etapa === 4 && subEtapaPagamento === "cartao-endereco") {
      setSubEtapaPagamento("cartao-cartao");
      return;
    }
    if (etapa === 4 && subEtapaPagamento === "cartao-cartao") {
      setSubEtapaPagamento("cartao-dados");
      return;
    }
    if (etapa === 4 && subEtapaPagamento !== "metodo") {
      setSubEtapaPagamento("metodo");
      return;
    }
    // Etapa 3 (Participantes): retrocede sub-passo antes de sair
    if (etapa === 3 && subPassoParticipantes > 0) {
      setSubPassoParticipantes(subPassoParticipantes - 1);
      return;
    }
    setEtapa((prev) => (prev > 0 ? ((prev - 1) as EtapaReserva) : prev));
  };

  const handleAvancarEtapa = () => {
    if (etapa === 4 && subEtapaPagamento === "metodo") {
      handleSelecionarFormaPagamento(formaPagamento);
      return;
    }

    if (etapa === 4 && subEtapaPagamento === "cartao-dados") {
      const errors = getDadosPessoaisPagamentoErrors();
      if (Object.keys(errors).length > 0) {
        aplicarErrosPagamento(errors);
        return;
      }
      setSubEtapaPagamento("cartao-cartao");
      return;
    }

    if (etapa === 4 && subEtapaPagamento === "cartao-cartao") {
      const errors = getCartaoDadosErrors();
      if (Object.keys(errors).length > 0) {
        aplicarErrosPagamento(errors);
        return;
      }
      setSubEtapaPagamento("cartao-endereco");
      return;
    }

    if (etapa === 0) {
      const validation = validateForm(0);
      if (!validation.ok) {
        setEtapa(etapaParaPrimeiroErro(validation.errors));
        return;
      }
      setEtapa(1);
      return;
    }

    if (etapa === 1) {
      const validation = validateForm(1);
      if (!validation.ok) {
        setEtapa(etapaParaPrimeiroErro(validation.errors));
        return;
      }
      setEtapa(2);
      return;
    }

    if (etapa === 2) {
      const validation = validateForm(2);
      if (!validation.ok) {
        setEtapa(etapaParaPrimeiroErro(validation.errors));
        return;
      }
      // Perguntas agora estão na etapa 2 (cards por pacote)
      const { erro } = montarRespostasPersonalizadas();
      if (erro) {
        alert(erro);
        return;
      }
      setEtapa(3);
      return;
    }

    if (etapa === 3) {
      // Se ainda há sub-passos de Participantes, avança o sub-passo
      const totalSubPassos = gruposParticipacao.length + 1; // grupos + pet
      if (subPassoParticipantes < totalSubPassos - 1) {
        setSubPassoParticipantes(subPassoParticipantes + 1);
        return;
      }
      const validation = validateForm(3);
      if (!validation.ok) {
        setEtapa(etapaParaPrimeiroErro(validation.errors));
        return;
      }
      setEtapa(4);
      // Reset sub-passo de pagamento ao entrar
      setSubEtapaPagamento("metodo");
    }
  };

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (etapa !== 4) {
      handleAvancarEtapa();
      return;
    }

    if (
      subEtapaPagamento === "metodo" ||
      subEtapaPagamento === "cartao-dados" ||
      subEtapaPagamento === "cartao-cartao"
    ) {
      handleAvancarEtapa();
      return;
    }

    if (loading || bloqueiaEnvioCartao) {
      return;
    }

    const validation = validateForm(4, { scroll: false });
    if (!validation.ok) {
      const etapaComErro = etapaParaPrimeiroErro(validation.errors);
      setEtapa(etapaComErro);
      if (etapaComErro === 4) {
        const subEtapaErro = subEtapaPagamentoParaErro(validation.errors);
        if (subEtapaErro) {
          setSubEtapaPagamento(subEtapaErro);
        }
      }
      window.setTimeout(() => scrollToErrorField(validation.errors), 120);
      return;
    }

    if (!selectedDay || selectedPackages.length === 0 || temPet === null) {
      return;
    }

    const { respostas, erro } = montarRespostasPersonalizadas();
    if (erro) {
      setEtapa(3);
      alert(erro);
      return;
    }

    setLoading(true);
    setCheckoutUrl(null);
    setPixKey(null);
    setQrCodeImage(null);
    setExpirationDate(null);
    if (formaPagamento === "CREDIT_CARD") {
      setCartaoResultado({
        status: "processing",
        message: "Processando compra. Aguarde a confirmacao do cartao.",
      });
    } else {
      setCartaoResultado(null);
    }

    try {
      const dataStr = selectedDay.toISOString().slice(0, 10);
      const totalParticipantes = somarMapa(participantesPorTipo) + naoPagante;
      const total = calcularTotal();
      const horarioSelecionado =
        horariosDisponiveis.length > 0 && horario
          ? horario
          : "Sem horário específico";

      const atividades = selectedPacotes.map(p => p.nome).join(" + ");
      const grupoComboPrincipal = gruposParticipacaoPayload.find((grupo) => grupo.tipo === "combo");
      const nomesCombosSelecionados = gruposParticipacaoPayload
        .filter((grupo) => grupo.tipo === "combo")
        .map((grupo) => grupo.nome)
        .join(", ");
      const comboAtivoComParticipantes =
        grupoComboPrincipal && comboAtivo?.id === grupoComboPrincipal.refId
          ? comboAtivo
          : undefined;
      const comboInfo = comboAtivoComParticipantes
        ? hasCustomComboPricing(comboAtivoComParticipantes)
          ? ` (Combo: ${comboAtivoComParticipantes.nome} - ${describeComboValores(comboAtivoComParticipantes)})`
          : comboAtivoComParticipantes.preco && comboAtivoComParticipantes.preco > 0
            ? ` (Combo: ${comboAtivoComParticipantes.nome} - valor especial ${formatCurrency(comboAtivoComParticipantes.preco)} por pessoa)`
            : comboAtivoComParticipantes.desconto && comboAtivoComParticipantes.desconto > 0
              ? ` (Combo: ${comboAtivoComParticipantes.nome} - ${comboAtivoComParticipantes.desconto}% de desconto)`
              : ` (Combo: ${comboAtivoComParticipantes.nome})`
        : nomesCombosSelecionados
          ? ` (Combo: ${nomesCombosSelecionados})`
          : "";

      const adultos = obterValorPorTipoNome(participantesPorTipo, tiposClientesAtivos, "adult") ?? 0;
      const criancas = obterValorPorTipoNome(participantesPorTipo, tiposClientesAtivos, "crian") ?? 0;
      const bariatrica = obterValorPorTipoNome(participantesPorTipo, tiposClientesAtivos, "bariat") ?? 0;
      const cartaoExpiracao = formaPagamento === "CREDIT_CARD" ? parseCardExpiry(cartaoValidade) : null;

      const payload: any = {
        nome,
        email,
        valor: total,
        cpf,
        telefone,
        atividade: atividades + comboInfo,
        data: dataStr,
        participantes: totalParticipantes,
        participantesPorTipo,
        gruposParticipacao: gruposParticipacaoPayload,
        adultos,
        bariatrica,
        criancas,
        naoPagante,
        billingType: formaPagamento,
        horario: horarioSelecionado,
        horariosPorPacote,
        temPet,
        pacoteIds: selectedPackages,
        comboId: grupoComboPrincipal?.refId || null,
      };

      if (formaPagamento === "CREDIT_CARD" && cartaoExpiracao) {
        payload.creditCard = {
          holderName: cartaoNome.trim(),
          number: onlyNumbers(cartaoNumero),
          expiryMonth: String(cartaoExpiracao.month).padStart(2, "0"),
          expiryYear: String(cartaoExpiracao.year),
          ccv: onlyNumbers(cartaoCvv),
        };
        payload.creditCardHolderInfo = {
          name: cartaoNome.trim(),
          email,
          cpfCnpj: onlyNumbers(cpf),
          postalCode: onlyNumbers(enderecoCep),
          address: enderecoRua.trim(),
          addressNumber: enderecoNumero.trim(),
          addressComplement: enderecoComplemento.trim(),
          province: enderecoBairro.trim(),
          city: enderecoCidade.trim(),
          state: enderecoEstado.trim().toUpperCase(),
          phone: onlyNumbers(telefone),
        };
      }

      if (respostas.length > 0) {
        payload.perguntasPersonalizadas = respostas;
      }

      console.log('📤 Enviando payload:', {
        nome,
        email,
        valor: total,
        data: dataStr,
        billingType: formaPagamento,
      });
      const rawResponse = await fetch("https://vagafogo-production.up.railway.app/criar-cobranca", {
        method: "POST",
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      console.log('📥 Status da resposta:', rawResponse.status);

      const resposta = await rawResponse.json().catch(() => ({}));
      console.log('📥 Resposta completa:', resposta);

      if (!rawResponse.ok) {
        console.error('❌ Erro na resposta:', resposta);
        const mensagemErro = extrairMensagemErroPagamento(
          resposta,
          "Erro ao criar a cobranca."
        );
        if (formaPagamento === "CREDIT_CARD") {
          setCartaoResultado({
            status: "error",
            message: `Compra negada: ${mensagemErro}`,
          });
        } else {
          alert(`Erro ao criar a cobranca: ${mensagemErro}`);
        }
        return;
      }

      if (resposta?.status === 'ok') {
        console.log('✅ Resposta OK recebida:', resposta);
        console.log('🔗 Invoice URL:', resposta.cobranca?.invoiceUrl);
        console.log('🔑 PIX Key:', resposta.cobranca?.pixKey);

        if (formaPagamento === "PIX") {
          setCheckoutUrl(resposta.cobranca?.invoiceUrl || null);
          setPixKey(resposta.cobranca?.pixKey || null);
          setQrCodeImage(resposta.cobranca?.qrCodeImage || null);
          setExpirationDate(resposta.cobranca?.expirationDate || null);
        } else {
          const statusCobranca = String(resposta.cobranca?.status ?? "").toUpperCase();
          const pagamentoConfirmado = ["CONFIRMED", "RECEIVED", "PAID"].includes(statusCobranca);
          const pagamentoNegado = [
            "DECLINED",
            "DENIED",
            "REFUSED",
            "FAILED",
            "CANCELED",
            "CANCELLED",
            "CHARGEBACK",
          ].includes(statusCobranca);
          const resultadoStatus = pagamentoConfirmado
            ? "success"
            : pagamentoNegado
            ? "error"
            : "pending";
          const mensagemResultado = pagamentoConfirmado
            ? "Compra realizada com sucesso. Reserva confirmada."
            : pagamentoNegado
            ? `Compra negada. Motivo: ${statusCobranca || "NAO INFORMADO"}.`
            : "Pagamento em processamento. Aguarde a confirmacao do cartao.";
          setCartaoResultado({
            status: resultadoStatus,
            message: mensagemResultado,
          });
          if (pagamentoConfirmado) {
            resetFormulario();
          }
        }

        // Scroll automático para o card de pagamento
        setTimeout(() => {
          paymentCardRef.current?.scrollIntoView({
            behavior: 'smooth',
            block: 'center'
          });
        }, 100);

        // Mostrar mensagem sobre carteirinha bariátrica
        if (bariatrica > 0) {
          alert("⚠️ IMPORTANTE: Como você selecionou opção bariátrica, será necessário enviar a foto da carteirinha via WhatsApp após realizar a reserva para validação.");
        }
      } else {
        console.error('❌ Status não é OK:', resposta?.status);
        const mensagemErro = extrairMensagemErroPagamento(
          resposta,
          "Erro ao criar a cobranca. Verifique os dados ou tente novamente."
        );
        if (formaPagamento === "CREDIT_CARD") {
          setCartaoResultado({
            status: "error",
            message: `Compra negada: ${mensagemErro}`,
          });
        } else {
          alert(mensagemErro);
        }
      }

    } catch (error) {
      console.error("Erro ao processar reserva:", error);
      if (formaPagamento === "CREDIT_CARD") {
        setCartaoResultado({
          status: "error",
          message: "Erro ao processar a compra. Tente novamente.",
        });
      } else {
        alert("Erro ao processar reserva. Tente novamente.");
      }
    } finally {
      setLoading(false);
    }
  }

  const totalResumo = selectedPackages.length > 0 ? calcularTotal() : 0;
  const pacotesResumo = selectedPacotes.map((p) => p.nome).filter(Boolean);
  const faixasResumo = selectedPacotes
    .filter((p) => p.modoHorario === "intervalo" && p.horarioInicio && p.horarioFim)
    .map((p) => `${p.horarioInicio}–${p.horarioFim}`);
  const horarioResumo = horario
    ? horario
    : horariosDisponiveis.length > 0
    ? "Selecione um horário"
    : faixasResumo.length > 0
    ? `Faixa: ${faixasResumo.join(" / ")}`
    : "Sem horário específico";

  const atividadesResumoMobile =
    pacotesResumo.length > 0
      ? `${pacotesResumo.slice(0, 2).join(" + ")}${
          pacotesResumo.length > 2 ? ` +${pacotesResumo.length - 2}` : ""
        }`
      : "Selecione os pacotes para continuar.";

  const dadosPessoaisPagamento = (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-bold text-slate-800 mb-1">Seus dados</h3>
        <p className="text-xs text-slate-500">Usados para identificação e envio da confirmação.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
            Nome Completo <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={nome}
            onChange={(e) => {
              setNome(e.target.value);
              setFieldError("nome");
            }}
            onBlur={() => validatePersonalField("nome")}
            className={getInputClasses("nome")}
            ref={nomeRef}
            autoComplete="name"
            required
          />
          {formErrors.nome && (
            <p className="mt-1 text-sm text-red-600">{formErrors.nome}</p>
          )}
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
            E-mail <span className="text-red-500">*</span>
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setFieldError("email");
            }}
            onBlur={() => validatePersonalField("email")}
            className={getInputClasses("email")}
            ref={emailRef}
            autoComplete="email"
            required
          />
          {formErrors.email && (
            <p className="mt-1 text-sm text-red-600">{formErrors.email}</p>
          )}
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
            CPF <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={cpf}
            onChange={(e) => {
              setCpf(formatCpf(e.target.value));
              setFieldError("cpf");
            }}
            onBlur={() => validatePersonalField("cpf")}
            className={getInputClasses("cpf")}
            ref={cpfRef}
            placeholder="000.000.000-00"
            inputMode="numeric"
            maxLength={14}
            autoComplete="off"
            required
          />
          {formErrors.cpf && (
            <p className="mt-1 text-sm text-red-600">{formErrors.cpf}</p>
          )}
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
            Telefone / WhatsApp
          </label>
          <input
            type="tel"
            value={telefone}
            onChange={(e) => {
              setTelefone(formatPhone(e.target.value));
              setFieldError("telefone");
            }}
            onBlur={() => validatePersonalField("telefone")}
            className={getInputClasses("telefone")}
            ref={telefoneRef}
            placeholder="(11) 99999-9999"
            inputMode="tel"
            autoComplete="tel"
            maxLength={15}
          />
          {formErrors.telefone && (
            <p className="mt-1 text-sm text-red-600">{formErrors.telefone}</p>
          )}
        </div>
      </div>
    </div>
  );

  const cartaoPreview = (
    <div className="bg-gradient-to-br from-slate-800 to-slate-900 px-3 py-3 sm:px-4 sm:py-4">
      <div className="relative mx-auto w-full max-w-[300px] aspect-[1.586/1] overflow-hidden rounded-xl bg-gradient-to-br from-slate-700 via-slate-800 to-slate-900 p-3.5 text-white shadow-lg sm:p-4">
        <div className="flex items-center justify-between">
          <span className="text-[9px] font-bold uppercase tracking-[0.3em] text-white/50">Crédito</span>
          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${cartaoBrandInfo ? cartaoBrandInfo.badgeClass : "bg-white/10 text-white/50"}`}>
            {cartaoBrandInfo ? cartaoBrandInfo.label : "Bandeira"}
          </span>
        </div>
        <div className="mt-4 font-mono text-[12px] font-semibold tracking-[0.08em] text-white sm:text-base sm:tracking-[0.18em]">
          {cartaoNumeroExibicao}
        </div>
        <div className="mt-3 flex items-end justify-between gap-2">
          <div className="min-w-0">
            <span className="block text-[8px] uppercase tracking-widest text-white/50">Nome</span>
            <span className="block truncate text-[11px] font-bold uppercase tracking-wider text-white">{cartaoNomeExibicao}</span>
          </div>
          <div className="shrink-0 text-right">
            <span className="block text-[8px] uppercase tracking-widest text-white/50">Validade</span>
            <span className="text-[11px] font-bold text-white">{cartaoValidadeExibicao}</span>
          </div>
        </div>
      </div>
    </div>
  );

  const cartaoDadosFields = (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {cardBrandConfigs.map((brand) => (
          <span key={brand.id} className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide transition-all ${cartaoBrand === brand.id ? brand.badgeClass : "bg-slate-100 text-slate-400"}`}>
            {brand.label}
          </span>
        ))}
      </div>

      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
        Número do cartão
        <input
          type="text"
          value={cartaoNumero}
          onChange={(e) => { setCartaoNumero(formatCardNumber(e.target.value)); setFieldError("cartaoNumero"); }}
          className={`mt-1.5 ${getInputClasses("cartaoNumero")} font-mono tracking-wider`}
          placeholder={cartaoNumeroPlaceholder}
          inputMode="numeric"
          autoComplete="cc-number"
          maxLength={cartaoNumeroMaxLength}
          spellCheck={false}
        />
        {formErrors.cartaoNumero && <p className="mt-1 text-xs text-red-600">{formErrors.cartaoNumero}</p>}
      </label>

      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
        Nome no cartão
        <input
          type="text"
          value={cartaoNome}
          onChange={(e) => { setCartaoNome(e.target.value); setFieldError("cartaoNome"); }}
          className={`mt-1.5 ${getInputClasses("cartaoNome")}`}
          placeholder="Exatamente como impresso no cartão"
          autoComplete="cc-name"
          autoCapitalize="characters"
        />
        {formErrors.cartaoNome && <p className="mt-1 text-xs text-red-600">{formErrors.cartaoNome}</p>}
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
          Validade
          <input
            type="text"
            value={cartaoValidade}
            onChange={(e) => { setCartaoValidade(formatCardExpiry(e.target.value)); setFieldError("cartaoValidade"); }}
            className={`mt-1.5 ${getInputClasses("cartaoValidade")} font-mono`}
            placeholder="MM/AA"
            inputMode="numeric"
            autoComplete="cc-exp"
            maxLength={5}
          />
          {formErrors.cartaoValidade && <p className="mt-1 text-xs text-red-600">{formErrors.cartaoValidade}</p>}
        </label>

        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
          CVV
          <input
            type="password"
            value={cartaoCvv}
            onChange={(e) => { setCartaoCvv(onlyNumbers(e.target.value).slice(0, cartaoCvvMaxLength)); setFieldError("cartaoCvv"); }}
            className={`mt-1.5 ${getInputClasses("cartaoCvv")} font-mono`}
            placeholder={cartaoCvvPlaceholder}
            inputMode="numeric"
            autoComplete="cc-csc"
            maxLength={cartaoCvvMaxLength}
          />
          <p className="mt-1 text-[10px] text-slate-400">{cartaoBrand === "amex" ? "4 dígitos na frente" : "3 dígitos no verso"}</p>
          {formErrors.cartaoCvv && <p className="mt-1 text-xs text-red-600">{formErrors.cartaoCvv}</p>}
        </label>
      </div>
    </div>
  );

  const enderecoCobrancaFields = (
    <div className="space-y-3">
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Endereço de cobrança</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[7rem_1fr]">
        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
          CEP
          <input
            type="text"
            value={enderecoCep}
            onChange={(e) => { setEnderecoCep(formatCep(e.target.value)); setFieldError("enderecoCep"); }}
            className={`mt-1.5 ${getInputClasses("enderecoCep")} bg-white`}
            placeholder="00000-000"
            inputMode="numeric"
          />
          {formErrors.enderecoCep && <p className="mt-1 text-xs text-red-600">{formErrors.enderecoCep}</p>}
        </label>
        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
          Rua / Avenida
          <input
            type="text"
            value={enderecoRua}
            onChange={(e) => { setEnderecoRua(e.target.value); setFieldError("enderecoRua"); }}
            className={`mt-1.5 ${getInputClasses("enderecoRua")} bg-white`}
            placeholder="Rua, Avenida, Alameda..."
          />
          {formErrors.enderecoRua && <p className="mt-1 text-xs text-red-600">{formErrors.enderecoRua}</p>}
        </label>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[7rem_1fr]">
        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
          Número
          <input
            type="text"
            value={enderecoNumero}
            onChange={(e) => { setEnderecoNumero(e.target.value); setFieldError("enderecoNumero"); }}
            className={`mt-1.5 ${getInputClasses("enderecoNumero")} bg-white`}
            placeholder="No."
          />
          {formErrors.enderecoNumero && <p className="mt-1 text-xs text-red-600">{formErrors.enderecoNumero}</p>}
        </label>
        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
          Complemento <span className="normal-case font-normal text-slate-400">(opcional)</span>
          <input
            type="text"
            value={enderecoComplemento}
            onChange={(e) => setEnderecoComplemento(e.target.value)}
            className={`mt-1.5 ${getInputClasses("enderecoComplemento")} bg-white`}
            placeholder="Apto, bloco, casa..."
          />
        </label>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_5rem]">
        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
          Bairro
          <input
            type="text"
            value={enderecoBairro}
            onChange={(e) => { setEnderecoBairro(e.target.value); setFieldError("enderecoBairro"); }}
            className={`mt-1.5 ${getInputClasses("enderecoBairro")} bg-white`}
            placeholder="Bairro"
          />
          {formErrors.enderecoBairro && <p className="mt-1 text-xs text-red-600">{formErrors.enderecoBairro}</p>}
        </label>
        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
          Cidade
          <input
            type="text"
            value={enderecoCidade}
            onChange={(e) => { setEnderecoCidade(e.target.value); setFieldError("enderecoCidade"); }}
            className={`mt-1.5 ${getInputClasses("enderecoCidade")} bg-white`}
            placeholder="Cidade"
          />
          {formErrors.enderecoCidade && <p className="mt-1 text-xs text-red-600">{formErrors.enderecoCidade}</p>}
        </label>
        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
          UF
          <input
            type="text"
            value={enderecoEstado}
            onChange={(e) => { setEnderecoEstado(e.target.value.toUpperCase().slice(0, 2)); setFieldError("enderecoEstado"); }}
            className={`mt-1.5 ${getInputClasses("enderecoEstado")} bg-white text-center`}
            placeholder="UF"
            maxLength={2}
          />
          {formErrors.enderecoEstado && <p className="mt-1 text-xs text-red-600">{formErrors.enderecoEstado}</p>}
        </label>
      </div>
    </div>
  );

  const resumoCard = (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-md">
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
        Resumo
      </p>

      <div className="mt-4 space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase text-slate-500">Atividades</p>
          {pacotesResumo.length > 0 ? (
            <ul className="mt-2 space-y-1 text-sm text-slate-700">
              {pacotesResumo.slice(0, 3).map((nomePacote) => (
                <li key={nomePacote} className="truncate">
                  {nomePacote}
                </li>
              ))}
              {pacotesResumo.length > 3 && (
                <li className="text-slate-500">
                  + {pacotesResumo.length - 3} outro(s)
                </li>
              )}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-slate-600">
              Selecione os pacotes para continuar.
            </p>
          )}
          {comboAtivo && (
            <p className="mt-2 text-xs font-semibold text-emerald-700">
              Combo: {comboAtivo.nome}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs font-semibold uppercase text-slate-500">Data</p>
            <p className="mt-1 text-slate-700">
              {selectedDay ? selectedDay.toLocaleDateString("pt-BR") : "—"}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-slate-500">Horário</p>
            <p className="mt-1 text-slate-700">{selectedDay ? horarioResumo : "—"}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-slate-500">
              Participantes
            </p>
            <p className="mt-1 text-slate-700">
              {totalParticipantesSelecionados > 0 ? totalParticipantesSelecionados : "—"}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-slate-500">Pagamento</p>
            <p className="mt-1 text-slate-700">
              {formaPagamento === "PIX" ? "PIX" : "Cartão"}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-5 flex items-baseline justify-between rounded-2xl bg-slate-50 px-4 py-3">
        <span className="text-sm font-semibold text-slate-700">Total</span>
        <span className="text-xl font-bold text-emerald-700">
          {formatCurrency(totalResumo)}
        </span>
      </div>
    </div>
  );

  const resumoCardMobile = (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Resumo
          </p>
          <p className="mt-1 truncate text-sm font-semibold text-slate-800">
            {atividadesResumoMobile}
          </p>
        </div>
        <p className="text-lg font-bold text-emerald-700">{formatCurrency(totalResumo)}</p>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-x-3 gap-y-2 text-xs text-slate-600 sm:grid-cols-2">
        <p>
          <span className="font-semibold text-slate-700">Data:</span>{" "}
          {selectedDay ? selectedDay.toLocaleDateString("pt-BR") : "—"}
        </p>
        <p>
          <span className="font-semibold text-slate-700">Horário:</span>{" "}
          {selectedDay ? horarioResumo : "—"}
        </p>
        <p>
          <span className="font-semibold text-slate-700">Participantes:</span>{" "}
          {totalParticipantesSelecionados > 0 ? totalParticipantesSelecionados : "—"}
        </p>
        <p>
          <span className="font-semibold text-slate-700">Pagamento:</span>{" "}
          {formaPagamento === "PIX" ? "PIX" : "Cartão"}
        </p>
      </div>
      {comboAtivo && (
        <p className="mt-2 text-xs font-semibold text-emerald-700">Combo: {comboAtivo.nome}</p>
      )}
    </div>
  );

  const etapasCardDesktop = (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-md">
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Etapas</p>
      <div className="mt-4 space-y-2">
        {wizardSteps.map((stepInfo, idx) => {
          const ativo = idx === etapa;
          const disponivel = idx <= etapa;
          return (
            <button
              key={stepInfo.title}
              type="button"
              disabled={!disponivel}
              onClick={() => disponivel && setEtapa(idx as EtapaReserva)}
              className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition ${
                ativo
                  ? "border-[#8B4F23]/30 bg-[#8B4F23]/5"
                  : disponivel
                  ? "border-slate-200 bg-white hover:bg-slate-50"
                  : "cursor-not-allowed border-slate-100 bg-slate-50 text-slate-400"
              }`}
            >
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  ativo
                    ? "bg-[#8B4F23] text-white"
                    : disponivel
                    ? "bg-[#8B4F23]/20 text-[#8B4F23]"
                    : "bg-slate-200 text-slate-500"
                }`}
              >
                {idx + 1}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">{stepInfo.title}</p>
                <p className="truncate text-xs text-slate-500">{stepInfo.description}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <section id="reservas" className="py-8 pb-16">
      <div className="mx-auto w-full max-w-screen-xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start xl:grid-cols-[minmax(0,1fr)_340px]">
            <div>
              <form
                onSubmit={handleSubmit}
                noValidate
                className="rounded-2xl sm:rounded-3xl border border-slate-200/80 bg-gradient-to-br from-white via-white to-[#FAF7F2] p-4 shadow-2xl shadow-[#8B4F23]/5 sm:p-7 md:p-8 relative overflow-hidden flex flex-col min-h-[calc(100svh-180px)] lg:min-h-0"
              >
                <div className="mb-6 sm:mb-8">
                  {/* Stepper bolinhas conectadas — sempre visível */}
                  <div className="relative flex items-center justify-between px-1 mb-5">
                    {/* Linha de progresso atrás das bolinhas */}
                    <div className="absolute left-4 right-4 top-1/2 -translate-y-1/2 h-0.5 bg-slate-200 rounded-full" aria-hidden="true" />
                    <div
                      className="absolute left-4 top-1/2 -translate-y-1/2 h-0.5 rounded-full transition-all duration-500"
                      style={{
                        width: `calc((100% - 2rem) * ${etapa / Math.max(wizardSteps.length - 1, 1)})`,
                        background: "linear-gradient(90deg, #8B4F23, #A05D2B)",
                      }}
                      aria-hidden="true"
                    />
                    {wizardSteps.map((stepInfo, idx) => {
                      const ativo = idx === etapa;
                      const concluida = idx < etapa;
                      const disponivel = idx <= etapa;
                      return (
                        <button
                          key={stepInfo.title}
                          type="button"
                          disabled={!disponivel}
                          onClick={() => disponivel && setEtapa(idx as EtapaReserva)}
                          className="relative z-10 flex flex-col items-center group disabled:cursor-not-allowed"
                          aria-label={`${idx + 1}. ${stepInfo.title}`}
                          title={stepInfo.title}
                        >
                          <span
                            className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-all duration-300 ring-4 ${
                              ativo
                                ? "bg-gradient-to-br from-[#8B4F23] to-[#A05D2B] text-white ring-[#E0B13C]/30 shadow-lg scale-110"
                                : concluida
                                ? "bg-[#8B4F23] text-white ring-white"
                                : "bg-white text-slate-400 ring-white border-2 border-slate-200"
                            }`}
                          >
                            {concluida ? (
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            ) : (
                              idx + 1
                            )}
                          </span>
                          <span className={`mt-1.5 text-[9px] sm:text-[10px] font-semibold uppercase tracking-wider transition-colors hidden sm:block ${
                            ativo ? "text-[#8B4F23]" : concluida ? "text-slate-600" : "text-slate-400"
                          }`}>
                            {stepInfo.title}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Título da etapa atual */}
                  <div>
                    <p className="text-xs font-bold uppercase tracking-widest text-[#8B4F23]">
                      Etapa {etapa + 1} de {wizardSteps.length}
                    </p>
                    <h2 className="mt-1 text-xl font-bold text-[#2D1E0F]">
                      {wizardSteps[etapa].title}
                    </h2>
                    {wizardSteps[etapa].description && (
                      <p className="mt-1 text-sm text-slate-500">
                        {wizardSteps[etapa].description}
                      </p>
                    )}
                  </div>
                </div>

                {/* Wrapper de conteúdo — flex-1 com scroll interno no mobile */}
                <div className="flex-1 overflow-y-auto -mx-4 px-4 sm:mx-0 sm:px-0 lg:overflow-visible lg:flex-none">

                {/* ============ ETAPA 1 — DATA ============ */}
                {etapa === 1 && (
                  <div className="mb-6">
                    <div ref={dataRef} className="flex justify-center">
                      <DayPicker
                        mode="single"
                        selected={selectedDay}
                        onSelect={handleDaySelect}
                        disabled={[{ before: todayStart }, (day) => !hasDisponibilidadeNoDia(day)]}
                        locale={ptBR}
                        className="rdp-vagafogo border border-slate-200 rounded-2xl p-4 shadow-sm bg-white"
                        modifiers={{
                          blocked: (day) => isBlockedDay(day)
                        }}
                        modifiersStyles={{
                          blocked: {
                            backgroundColor: '#fee2e2',
                            color: '#dc2626',
                            textDecoration: 'line-through'
                          }
                        }}
                      />
                    </div>
                    {selectedDay && (
                      <p className="mt-3 text-center text-sm text-emerald-700 font-medium">
                        Data escolhida: {selectedDay.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}
                      </p>
                    )}
                    {formErrors.data && (
                      <p className="mt-2 text-center text-sm text-red-600">{formErrors.data}</p>
                    )}
                  </div>
                )}

                {/* ============ ETAPA 0 — PACOTES (seleção simples) ============ */}
                {etapa === 0 && (
                  <div ref={pacotesRef} className="space-y-5">
                    {/* PACOTES — checkboxes simples */}
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-[#8B4F23] mb-2.5 flex items-center gap-2">
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#8B4F23]" />
                        Atividades
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {pacotes.map((pacote) => {
                          const selecionado = selectedPackages.includes(pacote.id!);
                          const indisponivelNoDia = Boolean(
                            selectedDay && pacote.id && disponibilidadePacotesNoDia[pacote.id] === false
                          );
                          const desabilitado = indisponivelNoDia && !selecionado;
                          return (
                            <div
                              key={pacote.id}
                              aria-disabled={desabilitado}
                              onClick={() => !desabilitado && handlePackageToggle(pacote.id!)}
                              className={`relative rounded-2xl border-2 p-4 transition-all duration-300 ${
                                desabilitado
                                  ? "border-slate-100 bg-slate-50 opacity-60 cursor-not-allowed"
                                  : selecionado
                                  ? "border-[#8B4F23] bg-gradient-to-br from-[#8B4F23]/8 via-white to-[#E0B13C]/8 cursor-pointer shadow-lg shadow-[#8B4F23]/10 scale-[1.01]"
                                  : "border-slate-200 bg-white hover:border-[#8B4F23]/40 hover:shadow-md hover:-translate-y-0.5 cursor-pointer"
                              }`}
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex-1 min-w-0">
                                  <p className="font-semibold text-[#2D1E0F] flex items-center gap-2">
                                    {pacote.emoji && <span>{pacote.emoji}</span>}
                                    <span>{pacote.nome}</span>
                                    {indisponivelNoDia && (
                                      <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                                        Esgotado
                                      </span>
                                    )}
                                  </p>
                                  <div className="mt-2 space-y-0.5">
                                    {tiposClientesAtivos.map((tipo) => {
                                      const preco = obterPrecoPorTipo(pacote.precosPorTipo, tipo, pacote);
                                      if (preco <= 0) return null;
                                      return (
                                        <p key={obterChaveTipo(tipo)} className="text-xs text-slate-500">
                                          {tipo.nome}: {formatCurrency(preco)}
                                        </p>
                                      );
                                    })}
                                  </div>
                                </div>
                                <span className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                                  selecionado ? "border-[#8B4F23] bg-[#8B4F23]" : "border-slate-300 bg-white"
                                }`}>
                                  {selecionado && (
                                    <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                  )}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Combo detectado automaticamente */}
                    {comboAtivo && (
                      <div className="rounded-2xl border border-[#E0B13C] bg-gradient-to-br from-[#E0B13C]/15 via-[#E0B13C]/5 to-white p-4 flex items-start gap-3 shadow-md">
                        <span className="text-2xl">🎉</span>
                        <div className="flex-1">
                          <p className="text-sm font-bold text-[#8B4F23]">Combo aplicado: {comboAtivo.nome}</p>
                          <p className="text-xs text-slate-600 mt-0.5">
                            {hasCustomComboPricing(comboAtivo)
                              ? describeComboValores(comboAtivo) || "Valores personalizados aplicados"
                              : comboAtivo.preco && comboAtivo.preco > 0
                              ? `Valor especial: ${formatCurrency(comboAtivo.preco)} por pessoa`
                              : comboAtivo.desconto && comboAtivo.desconto > 0
                              ? `${comboAtivo.desconto}% de desconto na sua reserva`
                              : "Condições especiais aplicadas"}
                          </p>
                        </div>
                      </div>
                    )}

                    {formErrors.pacotes && (
                      <p className="text-sm text-red-600">{formErrors.pacotes}</p>
                    )}
                  </div>
                )}


                {/* ============ ETAPA 2 — HORÁRIO + PERGUNTAS POR PACOTE ============ */}
                {etapa === 2 && (
                  <div ref={horarioRef} className="space-y-5">
                    {diaSelecionadoFechado ? (
                      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                        <p className="text-sm text-red-700">
                          Este dia esta fechado para todos os pacotes. Volte e escolha outra data.
                        </p>
                      </div>
                    ) : (
                      selectedPacotes.map((pacote, idxPacote) => {
                        const ehFaixa = pacote.modoHorario === "intervalo";
                        const horariosPacote = (pacote.horarios ?? []).filter((h) =>
                          horariosVisiveis.includes(h)
                        );
                        const temHorariosVisiveis = horariosPacote.length > 0;
                        const horarioPacote = horariosPorPacote[pacote.id!] ?? "";
                        const aviso = pacote.aviso;
                        return (
                          <div
                            key={pacote.id}
                            className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-white to-[#FAF7F2] p-5 shadow-sm hover:shadow-md transition-shadow"
                          >
                            <div className="flex items-start justify-between gap-3 mb-3">
                              <div>
                                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#8B4F23]/70">
                                  Pacote {idxPacote + 1} de {selectedPacotes.length}
                                </p>
                                <h3 className="mt-1 text-base font-bold text-[#2D1E0F] flex items-center gap-2">
                                  <span>{pacote.emoji}</span>
                                  <span>{pacote.nome}</span>
                                </h3>
                              </div>
                              {horarioPacote && (
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                                  {horarioPacote}
                                </span>
                              )}
                            </div>

                            {aviso && aviso.trim() && (
                              <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 flex items-start gap-2.5">
                                <svg className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L1 21h22L12 2zm0 4l7.53 13H4.47L12 6zm-1 5v4h2v-4h-2zm0 6v2h2v-2h-2z"/></svg>
                                <p className="text-xs text-amber-900 leading-relaxed">
                                  <strong className="font-semibold">Atenção:</strong> {aviso}
                                </p>
                              </div>
                            )}

                            {ehFaixa ? (
                              <div className="rounded-xl bg-blue-50 border border-blue-200 px-3.5 py-3">
                                <p className="text-xs text-blue-800">
                                  Funciona em <strong>faixa de horário</strong>, das {pacote.horarioInicio} às {pacote.horarioFim}.
                                </p>
                              </div>
                            ) : temHorariosVisiveis ? (
                              <>
                                <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2.5">
                                  Escolha o horário
                                </p>
                                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                                  {horariosPacote.map((h) => {
                                    const restante = vagasRestantesPorHorario[h];
                                    const restanteExibicao =
                                      typeof restante === "number" ? Math.max(restante, 0) : null;
                                    const lotado = typeof restante === "number" && restante <= 0;
                                    const selecionado = horarioPacote === h;
                                    const estado = lotado
                                      ? "border-red-200 bg-red-50 text-red-500 cursor-not-allowed opacity-70"
                                      : selecionado
                                      ? "border-[#8B4F23] bg-gradient-to-br from-[#8B4F23] to-[#A05D2B] text-white shadow-md scale-[1.02]"
                                      : "border-slate-200 bg-white text-slate-700 hover:border-[#8B4F23] hover:bg-[#8B4F23]/5 hover:scale-[1.02]";
                                    const textoVagas = restanteExibicao === null
                                      ? "Sem limite"
                                      : lotado ? "Esgotado" : `${restanteExibicao} vaga(s)`;
                                    return (
                                      <button
                                        key={h}
                                        type="button"
                                        disabled={lotado}
                                        onClick={() => {
                                          setHorariosPorPacote((prev) => ({ ...prev, [pacote.id!]: h }));
                                          setHorario(h);
                                          setFieldError("horario");
                                        }}
                                        className={`flex flex-col items-center justify-center rounded-xl border-2 px-2.5 py-2.5 text-sm font-medium transition-all duration-200 ${estado}`}
                                      >
                                        <span className="text-base font-semibold">{h}</span>
                                        <span className={`text-[10px] mt-0.5 ${selecionado ? "text-white/90" : "text-slate-500"}`}>{textoVagas}</span>
                                      </button>
                                    );
                                  })}
                                </div>
                              </>
                            ) : (
                              <div className="rounded-xl bg-red-50 border border-red-200 px-3.5 py-3">
                                <p className="text-xs text-red-700">
                                  Nenhum horário disponível para este pacote nesta data.
                                </p>
                              </div>
                            )}

                            {/* Perguntas personalizadas do pacote */}
                            {pacote.perguntasPersonalizadas && pacote.perguntasPersonalizadas.length > 0 && (
                              <div className="mt-5 pt-5 border-t border-slate-100 space-y-4">
                                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                                  Informações adicionais
                                </p>
                                {pacote.perguntasPersonalizadas.map((pergunta) => {
                                  const chave = `${pacote.id}-${pergunta.id}`;
                                  const respostaBase = respostasPersonalizadas[chave]?.resposta ?? "";
                                  const respostaCondicional = respostasPersonalizadas[chave]?.condicional ?? "";
                                  const cond = pergunta.perguntaCondicional;
                                  const mostrarCondicional = cond && respostaBase === cond.condicao;
                                  return (
                                    <div key={pergunta.id}>
                                      <label className="block text-sm font-medium text-slate-700 mb-1.5">
                                        {pergunta.pergunta}
                                        {pergunta.obrigatoria && <span className="text-red-500 ml-1">*</span>}
                                      </label>
                                      {pergunta.tipo === "sim_nao" ? (
                                        <div className="flex gap-2">
                                          {["sim", "nao"].map((opcao) => (
                                            <button
                                              key={opcao}
                                              type="button"
                                              onClick={() => atualizarRespostaBase(chave, opcao, cond?.condicao)}
                                              className={`flex-1 rounded-xl border-2 px-4 py-2.5 text-sm font-medium transition-all ${
                                                respostaBase === opcao
                                                  ? "border-[#8B4F23] bg-[#8B4F23] text-white shadow"
                                                  : "border-slate-200 bg-white text-slate-700 hover:border-[#8B4F23]/40"
                                              }`}
                                            >
                                              {opcao === "sim" ? "Sim" : "Não"}
                                            </button>
                                          ))}
                                        </div>
                                      ) : (
                                        <input
                                          type="text"
                                          value={respostaBase}
                                          onChange={(e) => atualizarRespostaBase(chave, e.target.value, cond?.condicao, true)}
                                          className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#8B4F23]/20 focus:border-[#8B4F23]"
                                          placeholder="Sua resposta"
                                        />
                                      )}
                                      {mostrarCondicional && cond && (
                                        <div className="mt-3 pl-4 border-l-2 border-[#8B4F23]/30">
                                          <label className="block text-sm font-medium text-slate-700 mb-1.5">
                                            {cond.pergunta}
                                            {cond.obrigatoria && <span className="text-red-500 ml-1">*</span>}
                                          </label>
                                          {cond.tipo === "sim_nao" ? (
                                            <div className="flex gap-2">
                                              {["sim", "nao"].map((opcao) => (
                                                <button
                                                  key={opcao}
                                                  type="button"
                                                  onClick={() => atualizarRespostaCondicional(chave, opcao)}
                                                  className={`flex-1 rounded-xl border-2 px-4 py-2.5 text-sm font-medium transition-all ${
                                                    respostaCondicional === opcao
                                                      ? "border-[#8B4F23] bg-[#8B4F23] text-white shadow"
                                                      : "border-slate-200 bg-white text-slate-700 hover:border-[#8B4F23]/40"
                                                  }`}
                                                >
                                                  {opcao === "sim" ? "Sim" : "Não"}
                                                </button>
                                              ))}
                                            </div>
                                          ) : (
                                            <input
                                              type="text"
                                              value={respostaCondicional}
                                              onChange={(e) => atualizarRespostaCondicional(chave, e.target.value, true)}
                                              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#8B4F23]/20 focus:border-[#8B4F23]"
                                              placeholder="Sua resposta"
                                            />
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                    {formErrors.horario && !diaSelecionadoFechado && (
                      <p className="text-sm text-red-600">{formErrors.horario}</p>
                    )}
                  </div>
                )}

                {/* ============ ETAPA 3 — REVISÃO + PET ============ */}
                {etapa === 3 && (() => {
                  // Sub-passos = um por grupo + sub-passo "pet" no final
                  const totalSubPassos = gruposParticipacao.length + 1; // grupos + pet
                  const idx = Math.max(0, Math.min(subPassoParticipantes, totalSubPassos - 1));
                  const ehPet = idx === gruposParticipacao.length;
                  const grupo = !ehPet ? gruposParticipacao[idx] : null;

                  return (
                <div ref={participantesRef}>
                  {/* Stepper bolinhas conectadas */}
                  {totalSubPassos > 1 && (
                    <div className="relative flex items-center justify-between px-1 mb-4">
                      <div className="absolute left-2.5 right-2.5 top-1/2 -translate-y-1/2 h-0.5 bg-slate-200 rounded-full" aria-hidden="true" />
                      <div
                        className="absolute left-2.5 top-1/2 -translate-y-1/2 h-0.5 rounded-full transition-all duration-500"
                        style={{
                          width: `calc((100% - 1.25rem) * ${idx / Math.max(totalSubPassos - 1, 1)})`,
                          background: "linear-gradient(90deg, #8B4F23, #A05D2B)",
                        }}
                        aria-hidden="true"
                      />
                      {Array.from({ length: totalSubPassos }).map((_, i) => {
                        const ativo = i === idx;
                        const concluido = i < idx;
                        const liberado = i <= idx;
                        const ehUltimo = i === totalSubPassos - 1;
                        return (
                          <button
                            key={i}
                            type="button"
                            disabled={!liberado}
                            onClick={() => liberado && setSubPassoParticipantes(i)}
                            className="relative z-10 flex flex-col items-center disabled:cursor-not-allowed"
                          >
                            <span
                              className={`flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold transition-all duration-300 ring-2 ${
                                ativo
                                  ? "bg-gradient-to-br from-[#8B4F23] to-[#A05D2B] text-white ring-[#E0B13C]/40 shadow scale-110"
                                  : concluido
                                  ? "bg-[#8B4F23] text-white ring-white"
                                  : "bg-white text-slate-400 ring-white border border-slate-200"
                              }`}
                            >
                              {concluido ? (
                                <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                              ) : ehUltimo ? "🐾" : i + 1}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Total compacto */}
                  {totalParticipantesSelecionados > 0 && (
                    <div className="mb-3 rounded-xl bg-emerald-50/60 border border-emerald-200 px-3 py-2 flex items-center justify-between">
                      <span className="text-xs font-semibold text-emerald-800">
                        {totalParticipantesSelecionados} pessoa(s) já no grupo
                      </span>
                      <span className="text-sm font-bold text-[#8B4F23]">{formatCurrency(calcularTotal())}</span>
                    </div>
                  )}

                  {/* Sub-passo de grupo (combo ou pacote individual) */}
                  {grupo && (
                    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="mb-3">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider mb-1.5 ${
                          grupo.tipo === "combo"
                            ? "bg-[#E0B13C]/15 text-[#8B4F23] border border-[#E0B13C]/30"
                            : "bg-slate-100 text-slate-600 border border-slate-200"
                        }`}>
                          {grupo.tipo === "combo" ? "🎉 Combo" : "Individual"}
                        </span>
                        <h4 className="text-base font-bold text-[#2D1E0F]">{grupo.nome}</h4>
                        <p className="text-xs text-slate-500 mt-0.5">{grupo.descricao}</p>
                      </div>

                      {/* Card de atenção */}
                      <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 flex items-start gap-2">
                        <svg className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 2L1 21h22L12 2zm0 4l7.53 13H4.47L12 6zm-1 5v4h2v-4h-2zm0 6v2h2v-2h-2z"/>
                        </svg>
                        <p className="text-[11px] text-amber-900 leading-snug">
                          <strong>Atenção:</strong>{" "}
                          {grupo.tipo === "combo"
                            ? <>Preencha aqui <strong>somente</strong> as pessoas que vão fazer o combo <strong>{grupo.nome}</strong> (todas as atividades juntas).</>
                            : <>Preencha aqui <strong>somente</strong> as pessoas que vão fazer <strong>apenas {grupo.nome.replace(/^Somente\s/i, "")}</strong> (sem o combo).</>
                          }
                        </p>
                      </div>

                      <div className="space-y-2 pt-3 border-t border-slate-100">
                        {tiposClientesAtivos.map((tipo) => {
                          const chave = obterChaveTipo(tipo);
                          const valor = Number(obterValorMapa(participantesPorGrupo[grupo.chave] ?? {}, tipo) ?? 0);
                          const precoUnitario = precoPorTipoNoGrupo(grupo, tipo);
                          return (
                            <div key={chave} className="flex items-center justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-baseline gap-1.5 flex-wrap">
                                  <p className="text-sm font-medium text-slate-700">{tipo.nome}</p>
                                  {precoUnitario > 0 && (
                                    <span className="text-[11px] font-semibold text-[#8B4F23]">
                                      {formatCurrency(precoUnitario)} <span className="font-normal text-slate-400">/pessoa</span>
                                    </span>
                                  )}
                                </div>
                                {tipo.descricao && (
                                  <p className="text-[10px] text-slate-400 truncate">{tipo.descricao}</p>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => atualizarParticipantesGrupo(grupo.chave, tipo, -1)}
                                  disabled={valor <= 0}
                                  className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-lg disabled:opacity-30 disabled:cursor-not-allowed"
                                  aria-label={`Diminuir ${tipo.nome}`}
                                >−</button>
                                <span className="w-7 text-center text-base font-bold tabular-nums">{valor}</span>
                                <button
                                  type="button"
                                  onClick={() => atualizarParticipantesGrupo(grupo.chave, tipo, 1)}
                                  className="w-9 h-9 rounded-full bg-[#8B4F23] hover:bg-[#A05D2B] text-white font-bold text-lg"
                                  aria-label={`Aumentar ${tipo.nome}`}
                                >+</button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Sub-passo Pet */}
                  {ehPet && (
                    <div ref={petRef} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <h4 className="text-base font-bold text-[#2D1E0F] mb-3">Vai levar pet? <span className="text-red-500">*</span></h4>

                      {/* Aviso de pacotes que não aceitam pet */}
                      {getPetMessage() && (
                        <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 flex items-start gap-2">
                          <svg className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 2L1 21h22L12 2zm0 4l7.53 13H4.47L12 6zm-1 5v4h2v-4h-2zm0 6v2h2v-2h-2z"/>
                          </svg>
                          <p className="text-[11px] text-amber-900 leading-snug">
                            <strong>Atenção:</strong> {getPetMessage()}
                          </p>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-3">
                        <label className={`flex items-center gap-2 rounded-xl border-2 p-3 cursor-pointer transition-all ${
                          temPet === true ? "border-[#8B4F23] bg-[#8B4F23]/5" : "border-slate-200 bg-white hover:border-[#8B4F23]/30"
                        }`}>
                          <input type="radio" name="pet" checked={temPet === true} onChange={() => { setTemPet(true); setFieldError("pet"); }} className="sr-only" />
                          <span className="text-xl">🐾</span>
                          <div>
                            <p className="text-sm font-semibold text-slate-800">Sim</p>
                            <p className="text-[10px] text-slate-500">Levo pet</p>
                          </div>
                        </label>
                        <label className={`flex items-center gap-2 rounded-xl border-2 p-3 cursor-pointer transition-all ${
                          temPet === false ? "border-[#8B4F23] bg-[#8B4F23]/5" : "border-slate-200 bg-white hover:border-[#8B4F23]/30"
                        }`}>
                          <input type="radio" name="pet" checked={temPet === false} onChange={() => { setTemPet(false); setFieldError("pet"); }} className="sr-only" />
                          <span className="text-xl">🚫</span>
                          <div>
                            <p className="text-sm font-semibold text-slate-800">Não</p>
                            <p className="text-[10px] text-slate-500">Sem pets</p>
                          </div>
                        </label>
                      </div>
                      {((obterValorPorTipoNome(participantesPorTipo, tiposClientesAtivos, "bariat") ?? 0) > 0) && (
                        <div className="mt-3 p-2.5 bg-orange-50 border border-orange-200 rounded-lg">
                          <p className="text-xs text-orange-700">
                            ⚠️ <strong>Bariátrica:</strong> envie carteirinha via WhatsApp após a reserva.
                          </p>
                        </div>
                      )}
                      {formErrors.pet && (
                        <p className="mt-2 text-sm text-red-600">{formErrors.pet}</p>
                      )}
                    </div>
                  )}

                  {/* Navegação entre sub-passos */}
                  <div className="mt-4 flex gap-2">
                    {idx > 0 && (
                      <button
                        type="button"
                        onClick={() => setSubPassoParticipantes(idx - 1)}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
                      >
                        ← Anterior
                      </button>
                    )}
                    {idx < totalSubPassos - 1 && (
                      <button
                        type="button"
                        onClick={() => setSubPassoParticipantes(idx + 1)}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-full bg-[#8B4F23] text-white px-3 py-2 text-sm font-semibold hover:bg-[#A05D2B]"
                      >
                        Próxima →
                      </button>
                    )}
                  </div>

                  {formErrors.participantes && (
                    <p className="mt-2 text-sm text-red-600">{formErrors.participantes}</p>
                  )}
                </div>
                  );
                })()}
                {false && (
                  <>

            <div className="mb-6">
              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
                    Quem vai participar <span className="text-red-500">*</span>
                  </label>
                  <p className="mt-1 text-sm text-slate-500">
                    Separe quem faz o combo completo de quem participa somente de um pacote.
                  </p>
                </div>
                {totalParticipantesSelecionados > 0 && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-left sm:text-right">
                    <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                      Total
                    </p>
                    <p className="text-sm font-bold text-[#8B4F23]">
                      {totalParticipantesSelecionados} pessoa(s) · {formatCurrency(calcularTotal())}
                    </p>
                  </div>
                )}
              </div>

              <div className="space-y-4">
                {gruposParticipacao.map((grupo) => {
                  const quantidadesGrupo = participantesPorGrupo[grupo.chave] ?? {};
                  const totalGrupo = somarMapa(quantidadesGrupo);
                  const subtotalGrupo = calcularTotalGrupo(grupo, quantidadesGrupo);
                  const vagasGrupo = grupo.pacoteIds
                    .map((pacoteId) => {
                      const restante = vagasRestantesPorPacoteAtual[pacoteId];
                      if (typeof restante !== "number") return null;
                      const pacoteNome = pacotesPorId.get(pacoteId)?.nome ?? "Pacote";
                      const ocupadasNestaReserva = participantesPorPacoteAtual[pacoteId] ?? 0;
                      return `${pacoteNome}: ${Math.max(restante - ocupadasNestaReserva, 0)} vaga(s) livres`;
                    })
                    .filter((texto): texto is string => Boolean(texto));

                  return (
                    <div
                      key={grupo.chave}
                      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="text-base font-bold text-slate-800">
                              {grupo.nome}
                            </h4>
                            <span
                              className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${
                                grupo.tipo === "combo"
                                  ? "bg-[#8B4F23]/10 text-[#8B4F23]"
                                  : "bg-slate-100 text-slate-600"
                              }`}
                            >
                              {grupo.tipo === "combo" ? "Combo" : "Individual"}
                            </span>
                          </div>
                          <p className="mt-1 text-sm text-slate-500">{grupo.descricao}</p>
                          {vagasGrupo.length > 0 && (
                            <p className="mt-2 text-xs font-medium text-slate-500">
                              {vagasGrupo.join(" · ")}
                            </p>
                          )}
                        </div>
                        {totalGrupo > 0 && (
                          <div className="shrink-0 rounded-xl bg-slate-50 px-3 py-2 text-left sm:text-right">
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                              Subtotal
                            </p>
                            <p className="text-sm font-bold text-slate-800">
                              {totalGrupo} pessoa(s) · {formatCurrency(subtotalGrupo)}
                            </p>
                          </div>
                        )}
                      </div>

                      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        {tiposClientesAtivos.map((tipo) => {
                          const chave = obterChaveTipo(tipo);
                          const valor = Number(obterValorMapa(quantidadesGrupo, tipo) ?? 0);
                          return (
                            <div
                              key={`${grupo.chave}-${chave}`}
                              className="rounded-xl border border-slate-200 bg-slate-50/70 p-3"
                            >
                              <p className="text-sm font-semibold text-slate-700">{tipo.nome}</p>
                              {tipo.descricao && (
                                <p className="mt-0.5 text-xs text-slate-500">{tipo.descricao}</p>
                              )}
                              <div className="mt-3 flex items-center justify-between gap-3">
                                <button
                                  type="button"
                                  onClick={() => atualizarParticipantesGrupo(grupo.chave, tipo, -1)}
                                  disabled={valor <= 0}
                                  className="h-10 w-10 rounded-lg border border-slate-300 bg-white text-xl font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                                  aria-label={`Diminuir ${tipo.nome} em ${grupo.nome}`}
                                >
                                  -
                                </button>
                                <span className="min-w-[40px] text-center text-2xl font-bold tabular-nums text-slate-800">
                                  {valor}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => atualizarParticipantesGrupo(grupo.chave, tipo, 1)}
                                  className="h-10 w-10 rounded-lg border border-slate-300 bg-white text-xl font-semibold text-slate-700 hover:bg-slate-50"
                                  aria-label={`Aumentar ${tipo.nome} em ${grupo.nome}`}
                                >
                                  +
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {formErrors.participantes && (
                <p className="mt-2 text-sm text-red-600">{formErrors.participantes}</p>
              )}
            </div>

            {((obterValorPorTipoNome(participantesPorTipo, tiposClientesAtivos, "bariat") ?? 0) > 0) && (
              <div className="mb-6 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                <p className="text-sm text-orange-700">
                  ⚠️ <strong>Importante:</strong> É obrigatório apresentar a carteirinha bariátrica via WhatsApp após a reserva para validação.
                </p>
              </div>
            )}

            {/* Pet */}
            <div ref={petRef} className="mb-6">
              <label className="block text-sm font-semibold text-slate-700 mb-3">
                Vai levar pet? <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-2 gap-3 max-w-xs">
                <label className={`flex items-center gap-3 rounded-xl border-2 p-4 cursor-pointer transition-all duration-200 ${
                  temPet === true ? "border-[#8B4F23] bg-[#8B4F23]/5" : "border-slate-200 bg-white hover:border-[#8B4F23]/30"
                }`}>
                  <input
                    type="radio"
                    name="pet"
                    checked={temPet === true}
                    onChange={() => { setTemPet(true); setFieldError("pet"); }}
                    className="sr-only"
                  />
                  <span className="text-xl">🐾</span>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">Sim</p>
                    <p className="text-xs text-slate-500">Levo pet</p>
                  </div>
                </label>
                <label className={`flex items-center gap-3 rounded-xl border-2 p-4 cursor-pointer transition-all duration-200 ${
                  temPet === false ? "border-[#8B4F23] bg-[#8B4F23]/5" : "border-slate-200 bg-white hover:border-[#8B4F23]/30"
                }`}>
                  <input
                    type="radio"
                    name="pet"
                    checked={temPet === false}
                    onChange={() => { setTemPet(false); setFieldError("pet"); }}
                    className="sr-only"
                  />
                  <span className="text-xl">🚫</span>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">Não</p>
                    <p className="text-xs text-slate-500">Sem pets</p>
                  </div>
                </label>
              </div>
              
            {temPet === true && getPetMessage() && (
              <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-700">
                  ⚠️ {getPetMessage()}
                </p>
              </div>
            )}
            {formErrors.pet && (
              <p className="mt-2 text-sm text-red-600">{formErrors.pet}</p>
            )}
          </div>

                  </>
                )}

                {/* Perguntas legacy removidas — agora aparecem nos cards da etapa 2 */}
                {false && (
                  <>

            {/* Perguntas Personalizadas */}
            {selectedPacotes.some(p => (p.perguntasPersonalizadas?.length ?? 0) > 0) && (
              <div ref={perguntasRef} className="mb-6 space-y-5">
                {selectedPacotes.map((pacote) => {
                  if (!pacote.id || (pacote.perguntasPersonalizadas?.length ?? 0) === 0) return null;
                  return (
                    <div
                      key={`perguntas-${pacote.id}`}
                      className="rounded-lg border border-gray-200 bg-gray-50/60 p-4"
                    >
                      <h4 className="text-sm font-semibold text-gray-800 mb-3">
                        Informações adicionais — {pacote.nome}
                      </h4>
                      <div className="space-y-4">
                        {pacote.perguntasPersonalizadas!.map((pergunta) => {
                          const chave = `${pacote.id}-${pergunta.id}`;
                          const registro = respostasPersonalizadas[chave] ?? {};
                          const respostaBase = registro.resposta ?? "";
                          const cond = pergunta.perguntaCondicional;
                          const mostrarCondicional = cond && respostaBase === cond.condicao;
                          return (
                            <div key={pergunta.id} className="space-y-3 rounded-md bg-white p-3 shadow-sm">
                              <div>
                                <p className="text-sm font-medium text-gray-700">
                                  {pergunta.pergunta}
                                  {pergunta.obrigatoria && <span className="text-red-500"> *</span>}
                                </p>
                                <p className="text-xs text-gray-500">
                                  {pergunta.tipo === 'sim_nao'
                                    ? 'Selecione Sim ou Não conforme necessário.'
                                    : 'Informe a resposta no campo abaixo.'}
                                </p>
                              </div>
                              {pergunta.tipo === 'sim_nao' ? (
                                <div className="flex flex-wrap items-center gap-4">
                                  <label className="inline-flex items-center text-sm text-gray-700">
                                    <input
                                      type="radio"
                                      name={`${chave}-base`}
                                      className="mr-2"
                                      checked={respostaBase === 'sim'}
                                      onChange={() => atualizarRespostaBase(chave, 'sim', cond?.condicao)}
                                    />
                                    Sim
                                  </label>
                                  <label className="inline-flex items-center text-sm text-gray-700">
                                    <input
                                      type="radio"
                                      name={`${chave}-base`}
                                      className="mr-2"
                                      checked={respostaBase === 'nao'}
                                      onChange={() => atualizarRespostaBase(chave, 'nao', cond?.condicao)}
                                    />
                                    Não
                                  </label>
                                  <button
                                    type="button"
                                    onClick={() => atualizarRespostaBase(chave, '', cond?.condicao)}
                                    className="text-xs text-gray-500 underline"
                                  >
                                    Limpar
                                  </button>
                                </div>
                              ) : (
                                <textarea
                                  value={typeof respostaBase === 'string' ? respostaBase : ''}
                                  onChange={(e) => atualizarRespostaBase(chave, e.target.value, cond?.condicao, true)}
                                  className="w-full rounded-md border border-black px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                                  rows={3}
                                  placeholder="Digite sua resposta"
                                />
                              )}

                              {cond && (
                                <div
                                  className={`rounded-md border px-3 py-2 ${
                                    mostrarCondicional ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-gray-100'
                                  }`}
                                >
                                  <p className="text-sm font-medium text-gray-700">
                                    {cond.pergunta}
                                    {cond.obrigatoria && <span className="text-red-500"> *</span>}
                                  </p>
                                  <p className="text-xs text-gray-500">
                                    Condicional exibida quando a resposta anterior for “{cond.condicao === 'sim' ? 'Sim' : 'Não'}”.
                                  </p>
                                  {cond.tipo === 'sim_nao' ? (
                                    <div className="mt-2 flex flex-wrap items-center gap-4">
                                      <label className="inline-flex items-center text-sm text-gray-700">
                                        <input
                                          type="radio"
                                          name={`${chave}-condicional`}
                                          className="mr-2"
                                          checked={registro.condicional === 'sim'}
                                          disabled={!mostrarCondicional}
                                          onChange={() => atualizarRespostaCondicional(chave, 'sim')}
                                        />
                                        Sim
                                      </label>
                                      <label className="inline-flex items-center text-sm text-gray-700">
                                        <input
                                          type="radio"
                                          name={`${chave}-condicional`}
                                          className="mr-2"
                                          checked={registro.condicional === 'nao'}
                                          disabled={!mostrarCondicional}
                                          onChange={() => atualizarRespostaCondicional(chave, 'nao')}
                                        />
                                        Não
                                      </label>
                                      <button
                                        type="button"
                                        onClick={() => atualizarRespostaCondicional(chave, '')}
                                        className="text-xs text-gray-500 underline"
                                        disabled={!mostrarCondicional}
                                      >
                                        Limpar
                                      </button>
                                    </div>
                                  ) : (
                                    <textarea
                                      value={typeof registro.condicional === 'string' ? registro.condicional : ''}
                                      onChange={(e) => atualizarRespostaCondicional(chave, e.target.value, true)}
                                      className="mt-2 w-full rounded-md border border-black px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black disabled:bg-gray-100"
                                      rows={2}
                                      placeholder="Digite a resposta complementar"
                                      disabled={!mostrarCondicional}
                                    />
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {!selectedPacotes.some(p => (p.perguntasPersonalizadas?.length ?? 0) > 0) && (
              <div ref={perguntasRef} className="mb-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-700">Sem perguntas adicionais.</p>
                <p className="mt-1 text-sm text-slate-600">
                  Os pacotes selecionados não exigem informações extras. Clique em continuar para revisar e pagar.
                </p>
              </div>
            )}

                  </>
                )}

                {/* ============ ETAPA 4 — MÉTODO + PAGAMENTO ============ */}
                {etapa === 4 && subEtapaPagamento === "metodo" && (
                  <div ref={paymentMethodRef} className="scroll-mt-24 space-y-5">
                    <div className="text-center mb-3">
                      <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#8B4F23]/70 mb-1">Falta pouco</p>
                      <h3 className="text-xl font-bold text-[#2D1E0F]">Como você prefere pagar?</h3>
                      <p className="text-sm text-slate-500 mt-1">Escolha um método para continuar.</p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {[
                        { id: "PIX", label: "PIX", desc: "Confirmação instantânea", icon: "⚡" },
                        { id: "CREDIT_CARD", label: "Cartão de crédito", desc: "Parcele em até 12x", icon: "💳" },
                      ].map((m) => {
                        const ativo = formaPagamento === (m.id as "PIX" | "CREDIT_CARD");
                        return (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => handleSelecionarFormaPagamento(m.id as "PIX" | "CREDIT_CARD")}
                            className={`group relative rounded-2xl border-2 p-5 text-left transition-all duration-200 ${
                              ativo
                                ? "border-[#8B4F23] bg-gradient-to-br from-[#8B4F23]/8 to-[#E0B13C]/8 shadow-md"
                                : "border-slate-200 bg-white hover:border-[#8B4F23]/40 hover:shadow-sm"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-center gap-3">
                                <span className="text-3xl">{m.icon}</span>
                                <div>
                                  <p className="text-sm font-bold text-[#2D1E0F]">{m.label}</p>
                                  <p className="text-xs text-slate-500 mt-0.5">{m.desc}</p>
                                </div>
                              </div>
                              <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                                ativo ? "border-[#8B4F23] bg-[#8B4F23]" : "border-slate-300 bg-white"
                              }`}>
                                {ativo && (
                                  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                  </svg>
                                )}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 flex items-start gap-3">
                      <svg className="w-5 h-5 text-slate-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        Pagamento seguro pela <strong>Asaas</strong>. Seus dados de cartão não são armazenados.
                      </p>
                    </div>
                  </div>
                )}

                {etapa === 4 && subEtapaPagamento !== "metodo" && (
                  <div ref={paymentFormRef} className="scroll-mt-24 space-y-5">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#8B4F23]/70">
                          Pagamento
                        </p>
                        <h3 className="text-xl font-bold text-[#2D1E0F]">
                          {formaPagamento === "PIX" ? "PIX" : "Cartão de crédito"}
                        </h3>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSubEtapaPagamento("metodo")}
                        className="w-full rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 sm:w-auto"
                      >
                        Alterar forma
                      </button>
                    </div>

                    {subEtapaPagamento === "pix" && (
                      <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
                          <p className="text-sm font-bold text-emerald-900">PIX selecionado</p>
                          <p className="mt-1 text-sm text-emerald-800">
                            Preencha seus dados e gere o QR Code. O código para copiar aparece logo abaixo após a geração.
                          </p>
                        </div>
                        {dadosPessoaisPagamento}
                      </div>
                    )}

                    {isSubEtapaCartao && (
                      <div ref={cartaoRef} className="scroll-mt-24 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                        {cartaoPreview}

                        <div className="border-b border-slate-100 bg-white px-4 py-3 sm:px-5">
                          {/* Stepper bolinhas conectadas */}
                          {(() => {
                            const etapaAtual = subEtapasCartao.findIndex((item) => item.id === subEtapaPagamento);
                            return (
                              <div className="relative flex items-center justify-between px-1">
                                <div className="absolute left-3 right-3 top-3 h-0.5 bg-slate-200 rounded-full" aria-hidden="true" />
                                <div
                                  className="absolute left-3 top-3 h-0.5 rounded-full transition-all duration-500"
                                  style={{
                                    width: `calc((100% - 1.5rem) * ${etapaAtual / Math.max(subEtapasCartao.length - 1, 1)})`,
                                    background: "linear-gradient(90deg, #8B4F23, #A05D2B)",
                                  }}
                                  aria-hidden="true"
                                />
                                {subEtapasCartao.map((step, index) => {
                                  const ativa = subEtapaPagamento === step.id;
                                  const concluida = index < etapaAtual;
                                  const liberado = index <= etapaAtual;
                                  return (
                                    <button
                                      key={step.id}
                                      type="button"
                                      disabled={!liberado}
                                      onClick={() => liberado && setSubEtapaPagamento(step.id)}
                                      className="relative z-10 flex flex-col items-center group disabled:cursor-not-allowed"
                                      title={step.label}
                                    >
                                      <span
                                        className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold transition-all duration-300 ring-2 ${
                                          ativa
                                            ? "bg-gradient-to-br from-[#8B4F23] to-[#A05D2B] text-white ring-[#E0B13C]/40 shadow scale-110"
                                            : concluida
                                            ? "bg-[#8B4F23] text-white ring-white"
                                            : "bg-white text-slate-400 ring-white border border-slate-200"
                                        }`}
                                      >
                                        {concluida ? (
                                          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                          </svg>
                                        ) : (
                                          index + 1
                                        )}
                                      </span>
                                      <span className={`mt-1 text-[9px] font-semibold uppercase tracking-wider transition-colors ${
                                        ativa ? "text-[#8B4F23]" : concluida ? "text-slate-600" : "text-slate-400"
                                      }`}>
                                        {step.label}
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            );
                          })()}
                        </div>

                        <div className="p-4 sm:p-5">
                          {subEtapaPagamento === "cartao-dados" && dadosPessoaisPagamento}
                          {subEtapaPagamento === "cartao-cartao" && cartaoDadosFields}
                          {subEtapaPagamento === "cartao-endereco" && enderecoCobrancaFields}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {etapa === 4 && <div className="mb-6 lg:hidden">{resumoCardMobile}</div>}

                </div>{/* fim do wrapper de conteúdo scrollável */}

                <div className="sticky bottom-0 -mx-4 px-4 pt-4 pb-2 sm:pb-0 sm:pt-6 mt-auto sm:mt-10 bg-gradient-to-t from-white via-white/95 to-white/0 border-t border-slate-200 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between sm:relative sm:mx-0 sm:px-0 sm:bg-transparent">
                  <button
                    type="button"
                    onClick={handleVoltarEtapa}
                    disabled={etapa === 0 || loading}
                    className="w-full sm:w-auto inline-flex items-center gap-1.5 justify-center rounded-full border border-slate-200 bg-white px-5 py-3.5 sm:py-3 text-sm font-medium text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                    </svg>
                    Voltar
                  </button>

                  {pagamentoPrecisaContinuar ? (
                    <button
                      type="button"
                      onClick={handleAvancarEtapa}
                      className="w-full sm:w-auto inline-flex items-center gap-2 justify-center rounded-full bg-[#8B4F23] px-7 py-3.5 sm:py-3 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:bg-[#A05D2B] hover:shadow-md"
                    >
                      {etapa < 4
                        ? "Continuar"
                        : subEtapaPagamento === "cartao-dados"
                        ? "Continuar para cartão"
                        : subEtapaPagamento === "cartao-cartao"
                        ? "Continuar para endereço"
                        : "Continuar"}
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  ) : (
                    <button
                      type="submit"
                      disabled={loading || selectedPackages.length === 0 || bloqueiaEnvioCartao}
                      className="w-full sm:w-auto inline-flex items-center gap-2 justify-center rounded-full bg-[#8B4F23] px-7 py-3.5 sm:py-3 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:bg-[#A05D2B] hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {loading
                        ? "Processando..."
                        : bloqueiaEnvioCartao
                        ? "Aguardando confirmação..."
                        : formaPagamento === "PIX"
                        ? "Gerar QR Code PIX"
                        : "Pagar com cartão"}
                    </button>
                  )}
                </div>
          </form>

          {/* ============ RESERVA CONFIRMADA — RESUMO FINAL ============ */}
          {cartaoResultado?.status === "success" && (
            <div className="mt-8 rounded-3xl border border-emerald-200 bg-gradient-to-br from-white via-emerald-50/40 to-emerald-100/30 p-6 sm:p-10 shadow-xl overflow-hidden relative">
              <div className="pointer-events-none absolute -top-20 -right-20 w-64 h-64 rounded-full bg-emerald-400/15 blur-3xl" />
              <div className="pointer-events-none absolute -bottom-20 -left-20 w-64 h-64 rounded-full bg-[#E0B13C]/15 blur-3xl" />

              <div className="relative text-center mb-6">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-lg mb-3 animate-bounce">
                  <svg className="w-9 h-9 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-emerald-700 mb-1">Reserva confirmada</p>
                <h3 className="font-display text-2xl sm:text-3xl font-bold text-[#2D1E0F]">
                  Nos vemos em breve, {nome.split(" ")[0] || "visitante"}!
                </h3>
                <p className="mt-2 text-sm text-slate-600 max-w-md mx-auto">
                  Enviamos a confirmação para <strong className="text-[#8B4F23]">{email}</strong>. Guarde esses detalhes:
                </p>
              </div>

              <div className="relative grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-3xl mx-auto mb-6">
                {[
                  { label: "Data", value: selectedDay ? selectedDay.toLocaleDateString("pt-BR") : "—" },
                  { label: "Horário", value: horario || "—" },
                  { label: "Pessoas", value: String(totalParticipantesSelecionados) },
                  { label: "Valor", value: formatCurrency(calcularTotal()) },
                ].map((item) => (
                  <div key={item.label} className="rounded-xl bg-white/80 backdrop-blur-sm border border-emerald-100 p-3 text-center shadow-sm">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{item.label}</p>
                    <p className="text-sm font-bold text-[#2D1E0F] mt-1">{item.value}</p>
                  </div>
                ))}
              </div>

              {pacotesResumo.length > 0 && (
                <div className="relative max-w-3xl mx-auto mb-6 rounded-2xl bg-white/70 backdrop-blur-sm border border-emerald-100 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Atividades</p>
                  <div className="flex flex-wrap gap-2">
                    {pacotesResumo.map((nomePacote) => (
                      <span key={nomePacote} className="inline-flex items-center gap-1.5 rounded-full bg-[#8B4F23]/10 text-[#8B4F23] px-3 py-1 text-xs font-medium border border-[#8B4F23]/15">
                        {nomePacote}
                      </span>
                    ))}
                  </div>
                  {comboAtivo && (
                    <p className="mt-2 text-xs font-semibold text-[#E0B13C]">
                      🎉 Combo: {comboAtivo.nome}
                    </p>
                  )}
                </div>
              )}

              <div className="relative flex flex-col sm:flex-row gap-3 justify-center max-w-md mx-auto">
                <a
                  href="/minha-reserva"
                  className="inline-flex items-center justify-center gap-2 bg-[#8B4F23] text-white font-semibold px-6 py-3 rounded-full shadow-md hover:bg-[#A05D2B] transition-all duration-300 hover:shadow-lg text-sm whitespace-nowrap"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  Consultar reserva
                </a>
                <button
                  type="button"
                  onClick={resetFormulario}
                  className="inline-flex items-center justify-center gap-2 border border-[#8B4F23]/20 bg-white text-[#8B4F23] font-medium px-6 py-3 rounded-full hover:bg-[#8B4F23]/5 hover:border-[#8B4F23]/40 transition-all duration-300 text-sm whitespace-nowrap"
                >
                  Fazer nova reserva
                </button>
              </div>
            </div>
          )}

          {/* Resultado do Pagamento */}
          {cartaoResultado?.status !== "success" && (checkoutUrl || pixKey || cartaoResultado) && (
            <div
              ref={paymentCardRef}
              className="relative mt-8 w-full min-w-0 overflow-hidden rounded-2xl p-4 shadow-2xl sm:rounded-3xl sm:p-8"
              style={{
                background: (checkoutUrl || pixKey)
                  ? 'linear-gradient(135deg, #1a6b3a 0%, #145c30 100%)'
                  : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                animation: 'pulse-glow 3s ease-in-out infinite'
              }}
            >
              {(checkoutUrl || pixKey) ? (
                /* ── PIX inline ── */
                <div className="flex w-full min-w-0 flex-col items-center gap-5">
                  <div className="flex items-center gap-2 text-center">
                    <span className="text-2xl">⚡</span>
                    <h3 className="text-xl font-bold text-white">Pague com PIX</h3>
                  </div>

                  {qrCodeImage ? (
                    <div className="rounded-2xl bg-white p-3 shadow-lg">
                      <img
                        src={qrCodeImage}
                        alt="QR Code PIX"
                        className="mx-auto block h-44 w-44 sm:h-52 sm:w-52"
                      />
                    </div>
                  ) : checkoutUrl ? (
                    /* fallback: backend returned only invoiceUrl — fetch QR from page */
                    <div className="flex flex-col items-center gap-3 w-full max-w-sm">
                      <p className="text-sm text-white/80 text-center">
                        Seu PIX foi gerado com sucesso. Acesse o link para escanear o QR Code:
                      </p>
                      <a
                        href={checkoutUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full flex items-center justify-center gap-2 rounded-xl bg-white py-3 text-sm font-semibold text-slate-800 shadow-md hover:bg-white/90 transition-colors"
                      >
                        Abrir página de pagamento PIX
                      </a>
                    </div>
                  ) : null}

                  {pixKey && (
                    <>
                      <p className="text-sm text-white/80 text-center max-w-xs">
                        Escaneie o QR Code acima ou copie o código PIX abaixo para pagar no seu banco.
                      </p>

                      {/* Copia-e-cola */}
                      <div className="w-full max-w-sm min-w-0">
                        <div className="max-h-28 overflow-y-auto rounded-xl border border-white/20 bg-white/10 px-3 py-3 sm:px-4">
                          <p className="font-mono text-xs break-all text-white/90 leading-relaxed select-all">
                            {pixKey}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(pixKey).then(() => {
                              setPixCopiado(true);
                              setTimeout(() => setPixCopiado(false), 3000);
                            }).catch(() => {
                              /* fallback */
                            });
                          }}
                          className={`mt-2 w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-all duration-200 shadow-md ${
                            pixCopiado
                              ? 'bg-emerald-400 text-emerald-900'
                              : 'bg-white text-slate-800 hover:bg-white/90 active:scale-[0.98]'
                          }`}
                        >
                          {pixCopiado ? (
                            <>
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                              Código copiado!
                            </>
                          ) : (
                            <>
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <rect x="9" y="9" width="13" height="13" rx="2" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                              </svg>
                              Copiar código PIX
                            </>
                          )}
                        </button>
                      </div>
                    </>
                  )}

                  {expirationDate && (
                    <p className="text-xs text-white/60 text-center">
                      Válido até {new Date(expirationDate).toLocaleString('pt-BR')}
                    </p>
                  )}
                </div>
              ) : cartaoResultado ? (
                /* ── Cartão resultado ── */
                <div className="text-center space-y-4">
                  <h3 className="text-xl font-bold text-white">
                    {cartaoResultado.status === "processing" ? "Processando pagamento" : "Pagamento no cartão"}
                  </h3>
                  <p className="text-base text-white/90">
                    {cartaoResultado.message}
                  </p>
                  <span
                    className={`inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold ${
                      cartaoResultado.status === "processing"
                        ? "bg-sky-500/20 text-sky-100"
                        : cartaoResultado.status === "pending"
                        ? "bg-amber-500/20 text-amber-100"
                        : "bg-rose-500/20 text-rose-100"
                    }`}
                  >
                    {cartaoResultado.status === "processing"
                      ? "Processando compra"
                      : cartaoResultado.status === "pending"
                      ? "Pagamento em processamento"
                      : "Pagamento não aprovado"}
                  </span>
                </div>
              ) : null}
            </div>
          )}

            </div>

            <aside className="hidden lg:block">
              <div className="sticky top-6 space-y-4">
                {etapa === 4 && resumoCard}
                {etapasCardDesktop}
              </div>
            </aside>
          </div>
        </div>
      </div>
    </section>
  );
}

// Adicionar CSS para animação do card de pagamento
const style = document.createElement('style');
style.textContent = `
  @keyframes pulse-glow {
    0%, 100% {
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(255, 255, 255, 0.1);
      transform: translateY(0);
    }
    50% {
      box-shadow: 0 25px 50px -12px rgba(102, 126, 234, 0.4), 0 0 30px rgba(102, 126, 234, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.2);
      transform: translateY(-2px);
    }
  }
`;
if (!document.head.querySelector('style[data-payment-card]')) {
  style.setAttribute('data-payment-card', 'true');
  document.head.appendChild(style);
}
