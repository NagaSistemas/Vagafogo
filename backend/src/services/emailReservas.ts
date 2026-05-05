import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where,
  type DocumentReference,
} from "firebase/firestore";
import { db } from "./firebase";
import {
  enviarEmailConfirmacao,
  enviarEmailPersonalizado,
  isEmailConfirmacaoHabilitada,
  isEmailConnectivityError,
} from "./emailService";

type ReservaEmail = Record<string, any>;

type EmailFilaStatus = "enviado" | "pendente" | "erro" | "sem_email";

type ResultadoEmailReserva =
  | { enviado: true }
  | {
      enviado: false;
      motivo:
        | "JA_ENVIADO"
        | "EMAIL_AUSENTE"
        | "DISABLED"
        | "MISSING_CONFIG";
    };

const normalizarNumero = (valor: unknown) => {
  const numero = Number(valor);
  return Number.isFinite(numero) ? Math.max(numero, 0) : 0;
};

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

function obterStatusFilaEmail(reserva: ReservaEmail): EmailFilaStatus {
  if (reserva.emailEnviado === true) return "enviado";

  const email = typeof reserva.email === "string" ? reserva.email.trim() : "";
  if (!email) return "sem_email";

  const erro = typeof reserva.emailErro === "string" ? reserva.emailErro.trim() : "";
  return erro ? "erro" : "pendente";
}

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

  const resultado = await enviarEmailConfirmacao({
    codigoReserva: reservaId,
    nome: reservaAtual.nome || "Cliente",
    email,
    atividade: reservaAtual.atividade || "",
    data: reservaAtual.data || "",
    horario: reservaAtual.horario || "",
    participantes: calcularParticipantes(reservaAtual),
    valor: normalizarNumero(reservaAtual.valor),
  });

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

export async function listarFilaEmailsConfirmacao(limit = 200) {
  const snapshot = await getDocs(
    query(collection(db, "reservas"), where("status", "==", "pago")),
  );

  let enviados = 0;
  let pendentes = 0;
  let erros = 0;
  let semEmail = 0;

  const itens = snapshot.docs
    .map((docSnap) => {
      const reserva = docSnap.data() as ReservaEmail;
      const statusEmail = obterStatusFilaEmail(reserva);

      if (statusEmail === "enviado") enviados += 1;
      if (statusEmail === "pendente") pendentes += 1;
      if (statusEmail === "erro") erros += 1;
      if (statusEmail === "sem_email") semEmail += 1;

      return {
        id: docSnap.id,
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
    totalReservasPagas: snapshot.size,
    enviados,
    pendentes,
    erros,
    semEmail,
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
