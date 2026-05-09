import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
  type DocumentReference,
} from "firebase/firestore";
import { db } from "./firebase";
import {
  enviarEmailConfirmacao,
  enviarEmailPersonalizado,
  getEmailRateLimitScope,
  isEmailConfirmacaoHabilitada,
  isEmailConnectivityError,
  isEmailRateLimitError,
} from "./emailService";

type ReservaEmail = Record<string, any>;

type EmailFilaStatus = "enviado" | "pendente" | "erro" | "sem_email";

type EmailUsageScope = {
  enviados: number;
  limite: number;
  restantes: number;
  percentual: number;
};

type ResultadoEmailReserva =
  | { enviado: true }
  | {
      enviado: false;
      motivo:
        | "JA_ENVIADO"
        | "EMAIL_AUSENTE"
        | "DISABLED"
        | "MISSING_CONFIG"
        | "LIMITE_ATINGIDO";
    };

type ResultadoReenvioEmail =
  | { enviado: true; uso: ReturnType<typeof calcularUsoEmail> }
  | {
      enviado: false;
      motivo:
        | "RESERVA_NAO_ENCONTRADA"
        | "JA_ENVIADO"
        | "EMAIL_AUSENTE"
        | "DISABLED"
        | "MISSING_CONFIG"
        | "LIMITE_ATINGIDO"
        | "EMAIL_EXCLUIDO_DA_FILA";
      uso: ReturnType<typeof calcularUsoEmail>;
    };

const normalizarNumero = (valor: unknown) => {
  const numero = Number(valor);
  return Number.isFinite(numero) ? Math.max(numero, 0) : 0;
};

const parsePositiveInteger = (valor: string | undefined, fallback: number) => {
  const numero = Number(valor);
  if (!Number.isFinite(numero) || numero <= 0) return fallback;
  return Math.floor(numero);
};

const EMAIL_DAILY_LIMIT = parsePositiveInteger(process.env.EMAIL_DAILY_LIMIT, 100);
const EMAIL_MONTHLY_LIMIT = parsePositiveInteger(process.env.EMAIL_MONTHLY_LIMIT, 3000);
const EMAIL_QUOTA_REF = doc(db, "configuracoes", "emailQuota");

const calcularParticipantes = (reserva: ReservaEmail) => {
  const participantesDeclarados = normalizarNumero(reserva.participantes);
  const participantesPorTipo =
    reserva.participantesPorTipo &&
    typeof reserva.participantesPorTipo === "object"
      ? (Object.values(reserva.participantesPorTipo) as unknown[]).reduce<number>(
          (total, valor) => total + normalizarNumero(valor),
          0,
        )
      : 0;

  const base =
    participantesPorTipo > 0
      ? participantesPorTipo
      : normalizarNumero(reserva.adultos) +
        normalizarNumero(reserva.criancas) +
        normalizarNumero(reserva.bariatrica);

  return Math.max(
    participantesDeclarados,
    base + normalizarNumero(reserva.naoPagante),
  );
};

const serializarData = (valor: any) => {
  if (!valor) return "";
  if (typeof valor === "string") return valor;
  if (valor instanceof Date) return valor.toISOString();
  if (typeof valor?.toDate === "function") {
    return valor.toDate().toISOString();
  }
  if (typeof valor?.seconds === "number") {
    return new Date(valor.seconds * 1000).toISOString();
  }
  return "";
};

const obterPartesDataSaoPaulo = (date: Date) => {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    partes.find((part) => part.type === type)?.value ?? "";

  return {
    ano: get("year"),
    mes: get("month"),
    dia: get("day"),
  };
};

const obterChaveDiaSaoPaulo = (date: Date) => {
  const { ano, mes, dia } = obterPartesDataSaoPaulo(date);
  return `${ano}-${mes}-${dia}`;
};

const obterChaveMesSaoPaulo = (date: Date) => {
  const { ano, mes } = obterPartesDataSaoPaulo(date);
  return `${ano}-${mes}`;
};

const normalizarDataEnvio = (valor: any) => {
  if (!valor) return null;
  if (valor instanceof Date) return valor;
  if (typeof valor === "string") {
    const parsed = new Date(valor);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof valor?.toDate === "function") {
    const date = valor.toDate();
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
  }
  if (typeof valor?.seconds === "number") {
    return new Date(valor.seconds * 1000);
  }
  return null;
};

const montarUsoEscopo = (enviados: number, limite: number): EmailUsageScope => ({
  enviados,
  limite,
  restantes: Math.max(limite - enviados, 0),
  percentual: limite > 0 ? Math.min(Math.round((enviados / limite) * 100), 100) : 0,
});

const calcularUsoEmail = (reservas: ReservaEmail[]) => {
  const agora = new Date();
  const hoje = obterChaveDiaSaoPaulo(agora);
  const mesAtual = obterChaveMesSaoPaulo(agora);

  let enviadosHoje = 0;
  let enviadosMes = 0;

  for (const reserva of reservas) {
    if (reserva.emailEnviado !== true) continue;

    const dataEnvio = normalizarDataEnvio(reserva.dataEmailEnviado);
    if (!dataEnvio) continue;

    if (obterChaveDiaSaoPaulo(dataEnvio) === hoje) {
      enviadosHoje += 1;
    }
    if (obterChaveMesSaoPaulo(dataEnvio) === mesAtual) {
      enviadosMes += 1;
    }
  }

  return {
    diario: montarUsoEscopo(enviadosHoje, EMAIL_DAILY_LIMIT),
    mensal: montarUsoEscopo(enviadosMes, EMAIL_MONTHLY_LIMIT),
    referencia: {
      hoje,
      mes: mesAtual,
      timezone: "America/Sao_Paulo",
    },
  };
};

const obterEstadoLimiteEmail = async () => {
  try {
    const snap = await getDoc(EMAIL_QUOTA_REF);
    return snap.exists() ? (snap.data() as Record<string, any>) : {};
  } catch (error) {
    console.warn("[email] Nao foi possivel carregar estado de limite:", error);
    return {};
  }
};

const aplicarEstadoLimiteEmail = (
  uso: ReturnType<typeof calcularUsoEmail>,
  estado: Record<string, any>,
) => {
  const diarioEsgotado = estado.dailyExhaustedFor === uso.referencia.hoje;
  const mensalEsgotado = estado.monthlyExhaustedFor === uso.referencia.mes;

  return {
    ...uso,
    diario: diarioEsgotado
      ? montarUsoEscopo(Math.max(uso.diario.enviados, uso.diario.limite), uso.diario.limite)
      : uso.diario,
    mensal: mensalEsgotado
      ? montarUsoEscopo(Math.max(uso.mensal.enviados, uso.mensal.limite), uso.mensal.limite)
      : uso.mensal,
    providerLimit: {
      diario: diarioEsgotado,
      mensal: mensalEsgotado,
      mensagem: typeof estado.message === "string" ? estado.message : "",
      updatedAt: serializarData(estado.updatedAt),
    },
  };
};

const obterUsoEmailAtual = async (reservas: ReservaEmail[]) => {
  const uso = calcularUsoEmail(reservas);
  const estado = await obterEstadoLimiteEmail();
  return aplicarEstadoLimiteEmail(uso, estado);
};

const registrarLimiteEmailAtingido = async (error: unknown) => {
  if (!isEmailRateLimitError(error)) return;

  const agora = new Date();
  const hoje = obterChaveDiaSaoPaulo(agora);
  const mes = obterChaveMesSaoPaulo(agora);
  const scope = getEmailRateLimitScope(error);
  const message = (error as { message?: string })?.message || "Limite de envio atingido.";

  const payload: Record<string, unknown> = {
    updatedAt: agora,
    scope,
    message,
  };

  if (scope === "monthly") {
    payload.monthlyExhaustedFor = mes;
  } else {
    payload.dailyExhaustedFor = hoje;
  }

  await setDoc(EMAIL_QUOTA_REF, payload, { merge: true }).catch((innerError) => {
    console.warn("[email] Nao foi possivel registrar limite atingido:", innerError);
  });
};

function obterStatusFilaEmail(reserva: ReservaEmail): EmailFilaStatus {
  if (reserva.emailEnviado === true) return "enviado";

  const email = typeof reserva.email === "string" ? reserva.email.trim() : "";
  if (!email) return "sem_email";

  const erro = typeof reserva.emailErro === "string" ? reserva.emailErro.trim() : "";
  return erro ? "erro" : "pendente";
}

const obterReservasPagas = async () => {
  const snapshot = await getDocs(
    query(collection(db, "reservas"), where("status", "==", "pago")),
  );

  return snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    reserva: docSnap.data() as ReservaEmail,
  }));
};

export async function enviarEmailConfirmacaoReserva(
  reservaId: string,
  reserva: ReservaEmail,
  reservaRef: DocumentReference = doc(db, "reservas", reservaId),
): Promise<ResultadoEmailReserva> {
  const reservaAtualSnap = await getDoc(reservaRef).catch(() => null);
  const reservaAtual = reservaAtualSnap?.exists()
    ? { ...reserva, ...(reservaAtualSnap.data() as ReservaEmail) }
    : reserva;

  if (reservaAtual.emailEnviado === true) {
    return { enviado: false, motivo: "JA_ENVIADO" };
  }

  const email =
    typeof reservaAtual.email === "string" ? reservaAtual.email.trim() : "";
  if (!email) {
    return { enviado: false, motivo: "EMAIL_AUSENTE" };
  }

  const reservasPagas = await obterReservasPagas();
  const uso = await obterUsoEmailAtual(reservasPagas.map(({ reserva }) => reserva));
  if (uso.diario.restantes <= 0 || uso.mensal.restantes <= 0) {
    await updateDoc(reservaRef, {
      emailErro: "Limite de envio de email atingido.",
      dataEmailErro: new Date(),
    }).catch(() => undefined);
    return { enviado: false, motivo: "LIMITE_ATINGIDO" };
  }

  let resultado;
  try {
    resultado = await enviarEmailConfirmacao({
      codigoReserva: reservaId,
      nome: reservaAtual.nome || "Cliente",
      email,
      atividade: reservaAtual.atividade || "",
      data: reservaAtual.data || "",
      horario: reservaAtual.horario || "",
      participantes: calcularParticipantes(reservaAtual),
      valor: normalizarNumero(reservaAtual.valor),
    });
  } catch (error: any) {
    const mensagemErro = error?.message || "Erro ao enviar email";
    await registrarLimiteEmailAtingido(error);
    await updateDoc(reservaRef, {
      emailErro: mensagemErro,
      dataEmailErro: new Date(),
    }).catch(() => undefined);
    throw error;
  }

  if (!resultado.enviado) {
    return resultado;
  }

  await updateDoc(reservaRef, {
    emailEnviado: true,
    dataEmailEnviado: new Date(),
    emailErro: "",
  });

  return { enviado: true };
}

type ProcessarPendentesOptions = {
  /** Se true, ignora o filtro de data e processa qualquer reserva paga sem email enviado. Default: false */
  incluirAntigas?: boolean;
  /** Limite maximo de envios por execucao (defesa em profundidade). Default: 50 */
  limite?: number;
};

const PROCESSAMENTO_LIMITE_PADRAO = 50;

const obterDataReservaISO = (valor: unknown): string | null => {
  if (!valor) return null;
  if (typeof valor === "string") {
    const match = /^(\d{4}-\d{2}-\d{2})/.exec(valor.trim());
    return match ? match[1] : null;
  }
  if (valor instanceof Date) {
    return valor.toISOString().slice(0, 10);
  }
  const maybeDate = (valor as { toDate?: () => Date }).toDate?.();
  if (maybeDate instanceof Date) {
    return maybeDate.toISOString().slice(0, 10);
  }
  return null;
};

export async function processarEmailsConfirmacaoPendentes(
  options: ProcessarPendentesOptions = {},
) {
  if (!isEmailConfirmacaoHabilitada()) {
    return {
      emailHabilitado: false,
      emailsEnviados: 0,
      emailsIgnorados: 0,
      falhas: 0,
      candidatos: 0,
      ignoradosPorData: 0,
    };
  }

  const limite = Math.max(1, options.limite ?? PROCESSAMENTO_LIMITE_PADRAO);
  const incluirAntigas = options.incluirAntigas === true;
  const hojeISO = new Date().toISOString().slice(0, 10);

  const snapshot = await getDocs(
    query(collection(db, "reservas"), where("status", "==", "pago")),
  );

  // Separa quem realmente vai ser processado: pendente de email + data >= hoje (a menos que incluirAntigas)
  type Candidato = { id: string; reserva: ReservaEmail };
  const candidatos: Candidato[] = [];
  let ignoradosPorData = 0;

  for (const docSnap of snapshot.docs) {
    const reserva = docSnap.data() as ReservaEmail;
    if (reserva.emailEnviado === true) continue;
    if (reserva.emailFilaExcluido === true) continue;

    if (!incluirAntigas) {
      const dataReserva = obterDataReservaISO(reserva.data);
      if (!dataReserva || dataReserva < hojeISO) {
        ignoradosPorData += 1;
        continue;
      }
    }

    candidatos.push({ id: docSnap.id, reserva });
  }

  const lote = candidatos.slice(0, limite);
  console.log(
    `[email] processamento manual: ${candidatos.length} candidato(s) (futuras), ${ignoradosPorData} ignorada(s) por data antiga, processando ${lote.length} (limite ${limite}).`,
  );

  let emailsEnviados = 0;
  let emailsIgnorados = 0;
  let falhas = 0;
  let interrompidoPorConexao = false;
  let erroGeral = "";

  for (const { id, reserva } of lote) {
    try {
      const resultado = await enviarEmailConfirmacaoReserva(
        id,
        reserva,
        doc(db, "reservas", id),
      );

      if (resultado.enviado) {
        emailsEnviados += 1;
      } else {
        emailsIgnorados += 1;
      }
    } catch (error: any) {
      falhas += 1;
      const mensagemErro = error?.message || "Erro ao enviar email";
      await updateDoc(doc(db, "reservas", id), {
        emailErro: mensagemErro,
        dataEmailErro: new Date(),
      }).catch(() => undefined);
      console.error(`[email] erro ao enviar confirmacao ${id}:`, error);

      if (isEmailConnectivityError(error)) {
        interrompidoPorConexao = true;
        erroGeral = `Provedor de email indisponivel: ${mensagemErro}`;
        console.error(
          "[email] processamento interrompido para evitar novas tentativas com provedor indisponivel.",
        );
        break;
      }
    }
  }

  return {
    emailHabilitado: true,
    emailsEnviados,
    emailsIgnorados,
    falhas,
    candidatos: candidatos.length,
    ignoradosPorData,
    interrompidoPorConexao,
    erroGeral,
  };
}

export async function tentarReenviarEmailConfirmacaoReserva(
  reservaId: string,
): Promise<ResultadoReenvioEmail> {
  const reservasPagas = await obterReservasPagas();
  const usoAntes = await obterUsoEmailAtual(reservasPagas.map(({ reserva }) => reserva));
  const item = reservasPagas.find((reserva) => reserva.id === reservaId);

  if (!item) {
    return { enviado: false, motivo: "RESERVA_NAO_ENCONTRADA", uso: usoAntes };
  }

  if (item.reserva.emailFilaExcluido === true) {
    return { enviado: false, motivo: "EMAIL_EXCLUIDO_DA_FILA", uso: usoAntes };
  }

  if (item.reserva.emailEnviado === true) {
    return { enviado: false, motivo: "JA_ENVIADO", uso: usoAntes };
  }

  if (usoAntes.diario.restantes <= 0 || usoAntes.mensal.restantes <= 0) {
    return { enviado: false, motivo: "LIMITE_ATINGIDO", uso: usoAntes };
  }

  try {
    const resultado = await enviarEmailConfirmacaoReserva(
      reservaId,
      item.reserva,
      doc(db, "reservas", reservaId),
    );

    if (!resultado.enviado) {
      return { enviado: false, motivo: resultado.motivo, uso: usoAntes };
    }

    const usoDepois = await obterUsoEmailAtual([
      ...reservasPagas
        .filter((reserva) => reserva.id !== reservaId)
        .map(({ reserva }) => reserva),
      {
        ...item.reserva,
        emailEnviado: true,
        dataEmailEnviado: new Date(),
      },
    ]);

    return { enviado: true, uso: usoDepois };
  } catch (error: any) {
    await updateDoc(doc(db, "reservas", reservaId), {
      emailErro: error?.message || "Erro ao enviar email",
      dataEmailErro: new Date(),
    }).catch(() => undefined);
    throw error;
  }
}

export async function excluirEmailDaFila(reservaId: string) {
  const reservaRef = doc(db, "reservas", reservaId);
  const snapshot = await getDoc(reservaRef);

  if (!snapshot.exists()) {
    return { excluido: false, motivo: "RESERVA_NAO_ENCONTRADA" };
  }

  const reserva = snapshot.data() as ReservaEmail;
  if (reserva.emailEnviado === true) {
    return { excluido: false, motivo: "JA_ENVIADO" };
  }

  await updateDoc(reservaRef, {
    emailFilaExcluido: true,
    dataEmailFilaExcluido: new Date(),
    emailErro: "",
  });

  return { excluido: true };
}

export async function listarFilaEmailsConfirmacao(limit = 200) {
  const reservasPagas = await obterReservasPagas();

  let enviados = 0;
  let pendentes = 0;
  let erros = 0;
  let semEmail = 0;

  const uso = await obterUsoEmailAtual(reservasPagas.map(({ reserva }) => reserva));

  const itens = reservasPagas
    .map(({ id, reserva }) => {
      if (reserva.emailFilaExcluido === true) return null;

      const statusEmail = obterStatusFilaEmail(reserva);

      if (statusEmail === "enviado") enviados += 1;
      if (statusEmail === "pendente") pendentes += 1;
      if (statusEmail === "erro") erros += 1;
      if (statusEmail === "sem_email") semEmail += 1;

      if (statusEmail === "sem_email") return null;

      return {
        id,
        statusEmail,
        nome: reserva.nome || "Cliente",
        email: typeof reserva.email === "string" ? reserva.email.trim() : "",
        telefone: reserva.telefone || "",
        atividade: reserva.atividade || "",
        data: serializarData(reserva.data),
        horario: reserva.horario || "",
        valor: normalizarNumero(reserva.valor),
        emailErro: typeof reserva.emailErro === "string" ? reserva.emailErro : "",
        dataEmailErro: serializarData(reserva.dataEmailErro),
        dataEmailEnviado: serializarData(reserva.dataEmailEnviado),
        criadoEm: serializarData(reserva.criadoEm),
      };
    })
    .filter(Boolean)
    .sort((a: any, b: any) => {
      const prioridade: Record<EmailFilaStatus, number> = {
        erro: 0,
        pendente: 1,
        sem_email: 2,
        enviado: 3,
      };
      const prioridadeDiff =
        prioridade[a.statusEmail as EmailFilaStatus] -
        prioridade[b.statusEmail as EmailFilaStatus];
      if (prioridadeDiff !== 0) return prioridadeDiff;

      const dataA = Date.parse(a.dataEmailErro || a.dataEmailEnviado || a.criadoEm || a.data || "");
      const dataB = Date.parse(b.dataEmailErro || b.dataEmailEnviado || b.criadoEm || b.data || "");
      return (Number.isFinite(dataB) ? dataB : 0) - (Number.isFinite(dataA) ? dataA : 0);
    })
    .slice(0, limit);

  return {
    emailHabilitado: isEmailConfirmacaoHabilitada(),
    totalReservasPagas: reservasPagas.length,
    enviados,
    pendentes,
    erros,
    semEmail,
    uso,
    itens,
  };
}

export async function enviarEmailManual(payload: {
  to: string;
  subject: string;
  message: string;
}) {
  return enviarEmailPersonalizado(payload);
}
