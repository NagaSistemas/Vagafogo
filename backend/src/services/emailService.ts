import nodemailer from "nodemailer";
import { doc, getDoc } from "firebase/firestore";
import { db } from "./firebase";

export type EmailConfirmacaoPayload = {
  codigoReserva?: string;
  nome: string;
  email: string;
  atividade: string;
  data: string;
  horario: string;
  participantes: number;
  valor?: number | null;
};

type EmailConfirmacaoResultado =
  | { enviado: true }
  | { enviado: false; motivo: "DISABLED" | "MISSING_CONFIG" };

type EmailPersonalizadoPayload = {
  to: string;
  subject: string;
  message: string;
};

type MensagensEmailConfig = {
  assuntoConfirmacaoEmail?: string;
  mensagemConfirmacaoEmail?: string;
};

type EmailConfig = {
  ativo?: boolean;
};

function parseBooleanEnv(value: string | undefined): boolean | undefined {
  if (!value) {
    return undefined;
  }

  const normalizado = value.trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalizado)) {
    return true;
  }
  if (["0", "false", "no", "n", "off"].includes(normalizado)) {
    return false;
  }

  return undefined;
}

const SMTP_HOST = process.env.SMTP_HOST ?? "smtp.hostinger.com";
const SMTP_PORT = Number(process.env.SMTP_PORT ?? 465);
const SMTP_SECURE =
  (process.env.SMTP_SECURE ?? (SMTP_PORT === 465 ? "true" : "false"))
    .toLowerCase() === "true";
const SMTP_USER = (process.env.SMTP_USER ?? "").trim();
const SMTP_PASS = (process.env.SMTP_PASS ?? "").trim();
const SMTP_NAME = process.env.SMTP_FROM_NAME ?? "Vagafogo Reservas";
const SMTP_FROM = (process.env.SMTP_FROM ?? SMTP_USER).trim();
const EMAIL_CONFIRMATION_ENABLED = parseBooleanEnv(
  process.env.EMAIL_CONFIRMATION_ENABLED,
);

const MAX_RETRIES = Number(process.env.SMTP_MAX_RETRIES ?? 3);
const RETRY_DELAY_MS = Number(process.env.SMTP_RETRY_DELAY_MS ?? 3000);
const RETRIABLE_ERRORS = new Set([
  "ETIMEDOUT",
  "ECONNECTION",
  "ESOCKET",
  "ECONNRESET",
  "EAI_AGAIN",
]);

const EMAIL_SUBJECT_PADRAO = "Confirmacao de Reserva - Vagafogo";
const EMAIL_TEMPLATE_PADRAO = [
  "Ola, {nome}!",
  "",
  "Seu pagamento foi confirmado e sua reserva esta garantida.",
  "",
  "Codigo da reserva: {codigoReserva}",
  "Atividade: {atividade}",
  "Data: {datareserva}",
  "Horario: {horario}",
  "Participantes: {participantes}",
  "Valor: {valor}",
  "",
  "Aguardamos voce no Vagafogo.",
].join("\n");

let transporter: nodemailer.Transporter | null = null;
let transporterVerified: Promise<void> | null = null;

function resetTransporter() {
  try {
    transporter?.close();
  } catch {
    // noop
  }
  transporter = null;
  transporterVerified = null;
}

export function isEmailConfirmacaoHabilitada(): boolean {
  if (EMAIL_CONFIRMATION_ENABLED !== undefined) {
    return EMAIL_CONFIRMATION_ENABLED;
  }

  return Boolean(SMTP_USER && SMTP_PASS);
}

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      pool: true,
      maxConnections: Number(process.env.SMTP_MAX_CONNECTIONS ?? 1),
      maxMessages: Number(process.env.SMTP_MAX_MESSAGES ?? 100),
      connectionTimeout: Number(process.env.SMTP_CONNECTION_TIMEOUT ?? 10000),
      greetingTimeout: Number(process.env.SMTP_GREETING_TIMEOUT ?? 7000),
      socketTimeout: Number(process.env.SMTP_SOCKET_TIMEOUT ?? 15000),
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      },
      tls: {
        minVersion: "TLSv1.2",
        servername: SMTP_HOST,
        rejectUnauthorized: process.env.SMTP_REJECT_UNAUTHORIZED !== "false",
      },
    });
  }

  return transporter;
}

async function ensureTransporterReady(): Promise<void> {
  if (!transporterVerified) {
    transporterVerified = getTransporter()
      .verify()
      .then(() => {
        console.log(
          `[email] SMTP ready at ${SMTP_HOST}:${SMTP_PORT} (secure=${SMTP_SECURE})`,
        );
      })
      .catch((error) => {
        transporterVerified = null;
        console.error("[email] SMTP verification failed:", error?.message);
        throw error;
      });
  }
  return transporterVerified;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetry(error: unknown, attempt: number) {
  if (attempt >= MAX_RETRIES) {
    return false;
  }

  const code = (error as { code?: string })?.code;
  return code ? RETRIABLE_ERRORS.has(code) : false;
}

function sanitize(value: string) {
  return value.replace(/[&<>"]/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return char;
    }
  });
}

function textToHtml(value: string) {
  return sanitize(value).replace(/\n/g, "<br />");
}

function formatarDataReserva(valor: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(valor ?? "");
  if (match) {
    return `${match[3]}/${match[2]}/${match[1]}`;
  }
  return valor || "";
}

function formatCurrency(valor: number | null | undefined) {
  const numero = Number(valor ?? 0);
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number.isFinite(numero) ? numero : 0);
}

function montarDadosEmail(payload: EmailConfirmacaoPayload) {
  return {
    codigoReserva: payload.codigoReserva ?? "",
    nome: payload.nome ?? "",
    datareserva: formatarDataReserva(payload.data),
    data: formatarDataReserva(payload.data),
    horario: payload.horario ?? "",
    atividade: payload.atividade ?? "",
    participantes: String(payload.participantes ?? ""),
    valor: formatCurrency(payload.valor),
    status: "pago",
  };
}

function aplicarTemplate(template: string, dados: Record<string, string>) {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, chave) => {
    const valor = dados[chave];
    return valor !== undefined ? valor : match;
  });
}

async function obterConfigEmail(): Promise<EmailConfig> {
  try {
    const snap = await getDoc(doc(db, "configuracoes", "email"));
    return snap.exists() ? (snap.data() as EmailConfig) : {};
  } catch (error) {
    console.warn("[email] Nao foi possivel carregar configuracao de email:", error);
    return {};
  }
}

async function obterConfigMensagens(): Promise<MensagensEmailConfig> {
  try {
    const snap = await getDoc(doc(db, "configuracoes", "mensagens"));
    return snap.exists() ? (snap.data() as MensagensEmailConfig) : {};
  } catch (error) {
    console.warn("[email] Nao foi possivel carregar modelos de mensagem:", error);
    return {};
  }
}

function buildEmailHtml({
  codigoReserva,
  nome,
  atividade,
  data,
  horario,
  participantes,
  valor,
}: EmailConfirmacaoPayload) {
  return `
    <h2>Ola, ${sanitize(nome)}!</h2>
    <p>Seu pagamento foi confirmado e sua reserva esta garantida.</p>
    <p>
      ${codigoReserva ? `<strong>Codigo da reserva:</strong> ${sanitize(codigoReserva)}<br />` : ""}
      <strong>Atividade:</strong> ${sanitize(atividade)}<br />
      <strong>Data:</strong> ${sanitize(formatarDataReserva(data))}<br />
      <strong>Horario:</strong> ${sanitize(horario)}<br />
      <strong>Participantes:</strong> ${participantes}<br />
      <strong>Valor:</strong> ${sanitize(formatCurrency(valor))}
    </p>
    <p>Aguardamos voce.</p>
  `;
}

async function buildEmailConfirmacao(payload: EmailConfirmacaoPayload) {
  const config = await obterConfigMensagens();
  const template = (config.mensagemConfirmacaoEmail || EMAIL_TEMPLATE_PADRAO).trim();
  const subject = (config.assuntoConfirmacaoEmail || EMAIL_SUBJECT_PADRAO).trim();

  if (!template) {
    return {
      subject,
      html: buildEmailHtml(payload),
      text: "",
    };
  }

  const text = aplicarTemplate(template, montarDadosEmail(payload));
  return {
    subject,
    html: `<div style="font-family: Arial, sans-serif; line-height: 1.5; color: #1f2937;">${textToHtml(text)}</div>`,
    text,
  };
}

async function sendWithRetry(params: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}) {
  let lastError: unknown = new Error("Email sending failed");
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await ensureTransporterReady();
      const info = await getTransporter().sendMail({
        from: `${SMTP_NAME} <${SMTP_FROM}>`,
        to: params.to,
        subject: params.subject,
        html: params.html,
        text: params.text,
      });

      console.log(
        `[email] enviado para ${params.to} | tentativa ${attempt} | id: ${info.messageId}`,
      );
      return { enviado: true as const };
    } catch (error) {
      lastError = error;
      const message = (error as { message?: string })?.message ?? "unknown";
      const code = (error as { code?: string })?.code ?? "UNKNOWN";
      resetTransporter();
      console.error(
        `[email] erro tentativa ${attempt}/${MAX_RETRIES} (${code}): ${message}`,
      );

      if (shouldRetry(error, attempt)) {
        await delay(RETRY_DELAY_MS * attempt);
        continue;
      }

      break;
    }
  }

  throw lastError;
}

export async function enviarEmailConfirmacao(
  payload: EmailConfirmacaoPayload,
): Promise<EmailConfirmacaoResultado> {
  if (!isEmailConfirmacaoHabilitada()) {
    return { enviado: false, motivo: "DISABLED" };
  }

  const configEmail = await obterConfigEmail();
  if (configEmail.ativo === false) {
    return { enviado: false, motivo: "DISABLED" };
  }

  if (!SMTP_USER || !SMTP_PASS) {
    console.error("[email] SMTP_USER/SMTP_PASS não configurados.");
    return { enviado: false, motivo: "MISSING_CONFIG" };
  }

  const email = await buildEmailConfirmacao(payload);
  await sendWithRetry({
    to: payload.email,
    subject: email.subject,
    html: email.html,
    text: email.text,
  });
  return { enviado: true };
}

export async function enviarEmailPersonalizado(
  payload: EmailPersonalizadoPayload,
): Promise<EmailConfirmacaoResultado> {
  if (!isEmailConfirmacaoHabilitada()) {
    return { enviado: false, motivo: "DISABLED" };
  }

  if (!SMTP_USER || !SMTP_PASS) {
    console.error("[email] SMTP_USER/SMTP_PASS não configurados.");
    return { enviado: false, motivo: "MISSING_CONFIG" };
  }

  await sendWithRetry({
    to: payload.to,
    subject: payload.subject,
    html: `<div style="font-family: Arial, sans-serif; line-height: 1.5; color: #1f2937;">${textToHtml(payload.message)}</div>`,
    text: payload.message,
  });
  return { enviado: true };
}
