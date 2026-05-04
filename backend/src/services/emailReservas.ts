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

export async function processarEmailsConfirmacaoPendentes() {
  if (!isEmailConfirmacaoHabilitada()) {
    return {
      emailHabilitado: false,
      emailsEnviados: 0,
      emailsIgnorados: 0,
      falhas: 0,
    };
  }

  const snapshot = await getDocs(
    query(collection(db, "reservas"), where("status", "==", "pago")),
  );

  let emailsEnviados = 0;
  let emailsIgnorados = 0;
  let falhas = 0;
  let interrompidoPorConexao = false;
  let erroGeral = "";

  for (const docSnap of snapshot.docs) {
    const reserva = docSnap.data() as ReservaEmail;
    try {
      const resultado = await enviarEmailConfirmacaoReserva(
        docSnap.id,
        reserva,
        doc(db, "reservas", docSnap.id),
      );

      if (resultado.enviado) {
        emailsEnviados += 1;
      } else {
        emailsIgnorados += 1;
      }
    } catch (error: any) {
      falhas += 1;
      const mensagemErro = error?.message || "Erro ao enviar email";
      await updateDoc(doc(db, "reservas", docSnap.id), {
        emailErro: mensagemErro,
        dataEmailErro: new Date(),
      }).catch(() => undefined);
      console.error(`[email] erro ao enviar confirmacao ${docSnap.id}:`, error);

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
    interrompidoPorConexao,
    erroGeral,
  };
}

export async function enviarEmailManual(payload: {
  to: string;
  subject: string;
  message: string;
}) {
  return enviarEmailPersonalizado(payload);
}
