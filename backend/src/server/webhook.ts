import { Router } from "express";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "../services/firebase";
import { obterCamposRetencaoReservaNaAtualizacao } from "../services/reservaRetention";
import { enviarEmailConfirmacaoReserva } from "../services/emailReservas";
import { enviarConfirmacaoWhatsapp } from "../services/whatsapp";

type WebhookPayment = {
  status?: string;
  billingType?: string;
  externalReference?: string;
};

type WebhookPayload = {
  event?: string;
  payment?: WebhookPayment | null;
};

const parseNumber = (value: string | undefined, fallback: number) => {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const MAX_RETRIES = parseNumber(process.env.WEBHOOK_MAX_RETRIES, 3);
const RETRY_DELAY_MS = parseNumber(process.env.WEBHOOK_RETRY_DELAY_MS, 4000);

const router = Router();
const taskQueue: Array<{ payload: WebhookPayload; attempt: number }> = [];
let queueRunning = false;

router.post("/", (req, res) => {
  enqueueTask(req.body as WebhookPayload);
  res.status(200).send("OK");
});

function enqueueTask(payload: WebhookPayload) {
  taskQueue.push({ payload, attempt: 0 });
  console.log(
    `[webhook] Evento ${payload.event ?? "desconhecido"} recebido | fila: ${taskQueue.length}`,
  );

  if (!queueRunning) {
    queueRunning = true;
    void processQueue();
  }
}

async function processQueue() {
  while (taskQueue.length > 0) {
    const task = taskQueue.shift();
    if (!task) {
      continue;
    }
    await processTask(task);
  }

  queueRunning = false;
}

async function processTask(task: { payload: WebhookPayload; attempt: number }) {
  while (task.attempt <= MAX_RETRIES) {
    try {
      await handleWebhook(task.payload);
      return;
    } catch (error) {
      task.attempt += 1;
      const externalId =
        task.payload?.payment?.externalReference ?? "sem-id";

      if (task.attempt > MAX_RETRIES) {
        console.error(
          `[webhook] Falha definitiva ao processar ${externalId}:`,
          error,
        );
        return;
      }

      console.warn(
        `[webhook] Tentativa ${task.attempt}/${MAX_RETRIES} para ${externalId}:`,
        error,
      );
      await delay(RETRY_DELAY_MS);
    }
  }
}

async function handleWebhook(payload: WebhookPayload) {
  const event = payload?.event;
  const payment = payload?.payment ?? undefined;

  if (!shouldProcess(event, payment)) {
    console.log(
      `[webhook] Evento ignorado (${event ?? "desconhecido"}) | status: ${
        payment?.status ?? "-"
      } | metodo: ${payment?.billingType ?? "-"}`,
    );
    return;
  }

  const externalReference = payment?.externalReference;
  if (!externalReference) {
    throw new Error("externalReference ausente no payload");
  }

  const reservaRef = doc(db, "reservas", externalReference);
  const reservaSnap = await getDoc(reservaRef);

  if (!reservaSnap.exists()) {
    console.warn(
      `[webhook] Reserva ${externalReference} nao encontrada no Firestore`,
    );
    return;
  }

  const reservaExistente = reservaSnap.data() as Record<string, any>;

  await updateDoc(reservaRef, {
    status: "pago",
    confirmada: true,
    dataPagamento: new Date(),
    ...obterCamposRetencaoReservaNaAtualizacao({
      status: "pago",
      confirmada: true,
      criadoEm: reservaExistente.criadoEm,
    }),
  });

  const reserva: Record<string, any> = {
    ...reservaExistente,
    status: "pago",
    confirmada: true,
  };

  try {
    const resultadoEmail = await enviarEmailConfirmacaoReserva(
      externalReference,
      reserva,
      reservaRef,
    );
    if (resultadoEmail.enviado) {
      console.log(`[webhook] Email enviado para ${externalReference}.`);
    } else {
      console.warn(
        `[webhook] Email nao enviado para ${externalReference}: ${resultadoEmail.motivo}`,
      );
    }
  } catch (error: any) {
    await updateDoc(reservaRef, {
      emailErro: error?.message || "Erro ao enviar email",
      dataEmailErro: new Date(),
    }).catch(() => undefined);
    console.error(
      `[webhook] Erro ao enviar email para ${externalReference}:`,
      error,
    );
  }

  // Disparo automatico de WhatsApp (em background, nao bloqueia o webhook)
  void enviarConfirmacaoWhatsapp(externalReference, reserva)
    .then(async (resultado) => {
      if (resultado.enviado) {
        await updateDoc(reservaRef, {
          whatsappConfirmacaoEnviado: true,
          dataWhatsappConfirmacao: new Date(),
          whatsappConfirmacaoMensagem: resultado.mensagem ?? "",
        }).catch(() => undefined);
        console.log(`[webhook] WhatsApp confirmacao enviado para ${externalReference}.`);
      } else if (resultado.motivo !== "desativado" && resultado.motivo !== "ja_enviado") {
        await updateDoc(reservaRef, {
          whatsappConfirmacaoErro: resultado.motivo ?? "erro",
          dataWhatsappConfirmacaoErro: new Date(),
        }).catch(() => undefined);
        console.warn(`[webhook] WhatsApp confirmacao nao enviado para ${externalReference}: ${resultado.motivo}`);
      }
    })
    .catch((error: any) => {
      console.error(`[webhook] Erro ao enviar WhatsApp confirmacao para ${externalReference}:`, error);
    });

  console.log(`[webhook] Reserva ${externalReference} atualizada.`);
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function shouldProcess(event?: string, payment?: WebhookPayment | null) {
  if (!event || !payment) {
    return false;
  }

  const statusNormalizado = (payment.status ?? "").toString().toUpperCase();
  const eventNormalizado = event.toString().toUpperCase();

  const statusPago = ["CONFIRMED", "RECEIVED", "PAID"].includes(statusNormalizado);
  const eventoPago = ["PAYMENT_CONFIRMED", "PAYMENT_RECEIVED"].includes(eventNormalizado);

  return statusPago && eventoPago;
}

export default router;
