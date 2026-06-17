import { Client, LocalAuth, RemoteAuth } from "whatsapp-web.js";
import qrcode from "qrcode";
import { doc, getDoc } from "firebase/firestore";
import { mkdir, rm } from "fs/promises";
import path from "path";
import { db } from "./firebase";
import { obterStorageBucketAdmin } from "./firebaseAdmin";

// O whatsapp-web.js v1.34 passa `session` como caminho absoluto em `save`
// (ex: "/app/.wwebjs_auth/RemoteAuth-vagafogo") mas como nome puro em
// sessionExists/extract/delete (ex: "RemoteAuth-vagafogo"). Sempre extraimos
// o basename pra normalizar o destino no bucket.
class FirebaseStore {
  private bucket: any;

  constructor(bucket: any) {
    this.bucket = bucket;
  }

  private destinationFor(session: string) {
    return `whatsapp-sessions/${path.basename(session)}.zip`;
  }

  private legacyPathsFor(session: string): string[] {
    const base = path.basename(session);
    // Caminhos antigos que ja existem no bucket por causa do bug anterior
    return [
      `app/.wwebjs_auth/${base}.zip`,
      `.wwebjs_auth/${base}.zip`,
    ];
  }

  private async migrarLegacy(session: string) {
    const destino = this.destinationFor(session);
    for (const legacy of this.legacyPathsFor(session)) {
      const legacyFile = this.bucket.file(legacy);
      const [existe] = await legacyFile.exists();
      if (!existe) continue;
      console.log(`[whatsapp][store] Migrando sessao legacy ${legacy} -> ${destino}`);
      try {
        await legacyFile.copy(this.bucket.file(destino));
        await legacyFile.delete().catch(() => undefined);
        return true;
      } catch (error) {
        console.error(`[whatsapp][store] Falha ao migrar ${legacy}:`, error);
      }
    }
    return false;
  }

  async sessionExists({ session }: { session: string }) {
    try {
      const destino = this.destinationFor(session);
      let [exists] = await this.bucket.file(destino).exists();
      if (!exists) {
        const migrou = await this.migrarLegacy(session);
        if (migrou) {
          [exists] = await this.bucket.file(destino).exists();
        }
      }
      return exists;
    } catch (error) {
      console.error(`[whatsapp][store] sessionExists falhou:`, error);
      return false;
    }
  }

  async save({ session }: { session: string }) {
    const localZip = `${session}.zip`;
    const destino = this.destinationFor(session);
    try {
      await this.bucket.upload(localZip, { destination: destino, resumable: false });
    } catch (error) {
      console.error(`[whatsapp][store] save FALHOU:`, error);
      throw error;
    }
  }

  async extract({ session, path: destino }: { session: string; path: string }) {
    const remoto = this.destinationFor(session);
    try {
      await mkdir(path.dirname(destino), { recursive: true });
      await this.bucket.file(remoto).download({ destination: destino });
    } catch (error) {
      console.error(`[whatsapp][store] extract FALHOU:`, error);
      throw error;
    }
  }

  async delete({ session }: { session: string }) {
    const destino = this.destinationFor(session);
    try {
      await this.bucket.file(destino).delete();
    } catch (error: any) {
      if (error?.code !== 404) {
        console.warn("[whatsapp][store] Falha ao remover sessao no Storage:", error);
      }
    }
  }
}

type PuppeteerPage = {
  evaluate: <T>(pageFunction: (...args: any[]) => T | Promise<T>, ...args: any[]) => Promise<T>;
};

type WhatsappStatus =
  | "idle"
  | "initializing"
  | "qr"
  | "ready"
  | "auth_failure"
  | "disconnected";

type WhatsappStatusPayload = {
  status: WhatsappStatus;
  qr?: string | null;
  lastError?: string | null;
  lastQrAt?: string | null;
  authStrategy?: "remote" | "local";
  info?: {
    wid?: string;
    pushname?: string;
  };
};

type WhatsappConfig = {
  mensagemBoasVindas?: string;
  /** Liga/desliga o envio automatico de WhatsApp quando reserva e confirmada. */
  confirmacaoAutomaticaAtiva?: boolean;
  /** Template enviado quando o pagamento da reserva e confirmado. */
  mensagemConfirmacaoAutomatica?: string;
};

type ResultadoEnvio = {
  enviado: boolean;
  motivo?: string;
  mensagem?: string;
  telefone?: string;
};

const TEMPLATE_BOAS_VINDAS_PADRAO =
  "Olá {nome}! 🌿 Seja muito bem-vindo(a) ao Santuário Vagafogo. É um prazer receber você hoje! Tenha uma experiência incrível.";

const TEMPLATE_CONFIRMACAO_PADRAO =
  "Olá {nome}! ✅ Sua reserva no Santuário Vagafogo foi confirmada com sucesso.\n\n📅 Data: {data}\n⏰ Horário: {horario}\n🎫 Atividade: {atividade}\n👥 Participantes: {participantes}\n💰 Valor: {valor}\n\nNos vemos em breve! 🌿";

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const formatCurrency = (valor: number) =>
  currencyFormatter.format(Number.isFinite(valor) ? valor : 0);

const parseNumber = (value: string | undefined, fallback: number) => {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const INIT_MAX_RETRIES = parseNumber(process.env.WHATSAPP_INIT_RETRIES, 3);
const INIT_RETRY_DELAY_MS = parseNumber(process.env.WHATSAPP_INIT_RETRY_DELAY_MS, 5000);
const WHATSAPP_CLIENT_ID =
  (process.env.WHATSAPP_CLIENT_ID ?? "disparador-agradecimento").trim() ||
  "disparador-agradecimento";
const WHATSAPP_DEVICE_NAME =
  (process.env.WHATSAPP_DEVICE_NAME ?? "Disparador Agradecimento").trim() ||
  "Disparador Agradecimento";
const WHATSAPP_BROWSER_NAME = (process.env.WHATSAPP_BROWSER_NAME ?? "Chrome").trim() || "Chrome";
const WHATSAPP_AUTH_PATH = (process.env.WHATSAPP_AUTH_PATH ?? ".wwebjs_auth").trim() || ".wwebjs_auth";
const WHATSAPP_AUTH_SESSION_PATH = path.resolve(
  process.cwd(),
  WHATSAPP_AUTH_PATH,
  `RemoteAuth-${WHATSAPP_CLIENT_ID}`
);
const REMOTE_BACKUP_INTERVAL_MS = parseNumber(
  process.env.WHATSAPP_REMOTE_BACKUP_MS,
  900000 // 15 min — backup do session.zip e caro (egress); auth muda pouco
);
const WHATSAPP_IDLE_TIMEOUT_MS = parseNumber(
  process.env.WHATSAPP_IDLE_TIMEOUT_MS,
  10 * 60 * 1000
);
// Tempo de vida MAXIMO absoluto do Chrome — mata mesmo se houver reconnect loop
const WHATSAPP_MAX_LIFETIME_MS = parseNumber(
  process.env.WHATSAPP_MAX_LIFETIME_MS,
  20 * 60 * 1000
);
const WHATSAPP_QR_IDLE_TIMEOUT_MS = parseNumber(
  process.env.WHATSAPP_QR_IDLE_TIMEOUT_MS,
  5 * 60 * 1000
);
const WHATSAPP_STARTUP_TIMEOUT_MS = parseNumber(
  process.env.WHATSAPP_STARTUP_TIMEOUT_MS,
  90 * 1000
);
const WHATSAPP_SEND_READY_TIMEOUT_MS = parseNumber(
  process.env.WHATSAPP_SEND_READY_TIMEOUT_MS,
  45 * 1000
);

let firebaseStore: FirebaseStore | null = null;

const obterFirebaseStore = (): FirebaseStore | null => {
  if (firebaseStore) return firebaseStore;
  const bucket = obterStorageBucketAdmin();
  if (!bucket) return null;
  firebaseStore = new FirebaseStore(bucket);
  return firebaseStore;
};

let client: Client | null = null;
let status: WhatsappStatus = "idle";
let qrDataUrl: string | null = null;
let lastError: string | null = null;
let lastQrAt: number | null = null;
let lastInfo: WhatsappStatusPayload["info"] | null = null;
let lastAuthStrategy: WhatsappStatusPayload["authStrategy"] = undefined;
let initializing = false;
let initRetries = 0;
let retryTimer: NodeJS.Timeout | null = null;
let idleTimer: NodeJS.Timeout | null = null;
let qrIdleTimer: NodeJS.Timeout | null = null;
let startupTimer: NodeJS.Timeout | null = null;
let lifetimeTimer: NodeJS.Timeout | null = null;
let intentionalShutdownReason: string | null = null;

const limparSessaoWhatsapp = async () => {
  try {
    await rm(WHATSAPP_AUTH_SESSION_PATH, { recursive: true, force: true });
  } catch (error) {
    console.warn("[whatsapp] Falha ao limpar sessao local:", error);
  }
};

const clearRetryTimer = () => {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
};

const clearIdleTimer = () => {
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
};

const clearQrIdleTimer = () => {
  if (qrIdleTimer) {
    clearTimeout(qrIdleTimer);
    qrIdleTimer = null;
  }
};

const clearStartupTimer = () => {
  if (startupTimer) {
    clearTimeout(startupTimer);
    startupTimer = null;
  }
};

const clearLifetimeTimer = () => {
  if (lifetimeTimer) {
    clearTimeout(lifetimeTimer);
    lifetimeTimer = null;
  }
};

const clearLifecycleTimers = () => {
  clearIdleTimer();
  clearQrIdleTimer();
  clearStartupTimer();
  clearLifetimeTimer();
};

// Encerra com timeout — se destroy() travar, mata o processo Chrome no SIGKILL
const encerrarRuntimeSemLogout = async (reason: string) => {
  clearRetryTimer();
  clearLifecycleTimers();
  intentionalShutdownReason = reason;

  const clienteAtual = client;
  client = null;
  initializing = false;
  status = "idle";
  qrDataUrl = null;
  lastInfo = null;
  lastError = reason;

  if (clienteAtual) {
    const browserProcess = (clienteAtual as any)?.pupBrowser?.process?.();
    const destroyPromise = clienteAtual.destroy().catch((error) => {
      console.warn("[whatsapp] destroy() falhou:", error);
    });
    const timeoutPromise = new Promise<void>((resolve) => setTimeout(resolve, 8000));
    await Promise.race([destroyPromise, timeoutPromise]);

    // Se Chrome ainda esta vivo, mata no SIGKILL
    if (browserProcess && !browserProcess.killed) {
      try {
        console.log(`[whatsapp] Forçando SIGKILL no Chrome (pid=${browserProcess.pid})`);
        browserProcess.kill("SIGKILL");
      } catch (error) {
        console.warn("[whatsapp] Falha ao forçar SIGKILL:", error);
      }
    }
  }

  setTimeout(() => {
    if (intentionalShutdownReason === reason) {
      intentionalShutdownReason = null;
    }
  }, 1000);
};

const scheduleIdleShutdown = () => {
  clearIdleTimer();
  if (WHATSAPP_IDLE_TIMEOUT_MS <= 0 || !client || status !== "ready") return;

  idleTimer = setTimeout(() => {
    void encerrarRuntimeSemLogout("desligado_por_inatividade");
  }, WHATSAPP_IDLE_TIMEOUT_MS);
};

const scheduleQrShutdown = () => {
  clearQrIdleTimer();
  if (WHATSAPP_QR_IDLE_TIMEOUT_MS <= 0 || !client || status !== "qr") return;

  qrIdleTimer = setTimeout(() => {
    void encerrarRuntimeSemLogout("qr_expirado_por_inatividade");
  }, WHATSAPP_QR_IDLE_TIMEOUT_MS);
};

const scheduleStartupTimeout = () => {
  clearStartupTimer();
  if (WHATSAPP_STARTUP_TIMEOUT_MS <= 0) return;

  startupTimer = setTimeout(() => {
    if (status === "initializing") {
      void encerrarRuntimeSemLogout("startup_timeout");
    }
  }, WHATSAPP_STARTUP_TIMEOUT_MS);
};

const scheduleRetry = (reason?: string | null) => {
  if (INIT_MAX_RETRIES <= 0) return;
  if (initRetries >= INIT_MAX_RETRIES) return;
  initRetries += 1;
  clearRetryTimer();
  retryTimer = setTimeout(() => {
    retryTimer = null;
    iniciarWhatsApp();
  }, INIT_RETRY_DELAY_MS);
  if (reason) {
    lastError = reason;
  }
};

const handleInitFailure = (error?: unknown) => {
  clearLifecycleTimers();
  status = "disconnected";
  initializing = false;
  lastError = (error as { message?: string })?.message || "init_error";
  qrDataUrl = null;
  lastInfo = null;
  if (client) {
    const clienteAtual = client;
    const browserProcess = (clienteAtual as any)?.pupBrowser?.process?.();
    clienteAtual.destroy().catch(() => undefined);
    // Garante que Chrome morre mesmo se destroy() falhar
    setTimeout(() => {
      if (browserProcess && !browserProcess.killed) {
        try {
          browserProcess.kill("SIGKILL");
        } catch {
          // noop
        }
      }
    }, 5000);
  }
  client = null;
  scheduleRetry(lastError);
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const aguardarWhatsAppPronto = async (timeoutMs: number) => {
  if (client && status === "ready") return true;

  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (client && status === "ready") return true;
    if (status === "qr" || status === "auth_failure") return false;
    if (!client && !initializing) return false;
    await sleep(500);
  }

  return Boolean(client && status === "ready");
};

class WhatsappIndisponivelError extends Error {
  cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "WhatsappIndisponivelError";
    this.cause = cause;
  }
}

const getErrorMessage = (error: unknown): string => {
  if (!error) return "";
  if (typeof error === "string") return error;
  const maybeMessage = (error as { message?: unknown })?.message;
  if (typeof maybeMessage === "string") return maybeMessage;
  return String(error);
};

const isStoreNotInjectedError = (error: unknown): boolean => {
  const message = getErrorMessage(error);
  return (
    message.includes("WidFactory") &&
    (message.includes("Cannot read properties of undefined") ||
      message.includes("window.Store") ||
      message.includes("Evaluation failed"))
  );
};

const carregarFuncoesInjecao = (): { ExposeStore: () => void; LoadUtils: () => void } | null => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const store = require("whatsapp-web.js/src/util/Injected/Store") as { ExposeStore?: unknown };
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const utils = require("whatsapp-web.js/src/util/Injected/Utils") as { LoadUtils?: unknown };

    if (typeof store.ExposeStore !== "function" || typeof utils.LoadUtils !== "function") {
      return null;
    }

    return {
      ExposeStore: store.ExposeStore as () => void,
      LoadUtils: utils.LoadUtils as () => void,
    };
  } catch {
    return null;
  }
};

const obterPuppeteerPage = (): PuppeteerPage | null => {
  const page = (client as any)?.pupPage as PuppeteerPage | undefined;
  return page ?? null;
};

const garantirInjecaoStore = async (): Promise<boolean> => {
  const page = obterPuppeteerPage();
  if (!page) return false;

  try {
    const injected = await page.evaluate(() => {
      const w = window as any;
      return Boolean(w.Store && w.WWebJS && w.Store.WidFactory);
    });
    if (injected) return true;
  } catch {
    // ignore
  }

  const fns = carregarFuncoesInjecao();
  if (!fns) return false;

  try {
    await page.evaluate(fns.ExposeStore);
    await page.evaluate(fns.LoadUtils);

    const injected = await page.evaluate(() => {
      const w = window as any;
      return Boolean(w.Store && w.WWebJS && w.Store.WidFactory);
    });
    return Boolean(injected);
  } catch (error) {
    console.warn("[whatsapp] Falha ao reinjetar Store/WWebJS:", error);
    return false;
  }
};

const formatDateKey = (date: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(date);

const obterDataReserva = (valor: unknown): string => {
  if (!valor) return "";
  if (typeof valor === "string") {
    const trimmed = valor.trim();
    const isoMatch = /^(\d{4}-\d{2}-\d{2})/.exec(trimmed);
    if (isoMatch) return isoMatch[1];
    const brMatch = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(trimmed);
    if (brMatch) return `${brMatch[3]}-${brMatch[2]}-${brMatch[1]}`;
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return formatDateKey(parsed);
    }
    return "";
  }
  if (valor instanceof Date) {
    return formatDateKey(valor);
  }
  const maybeDate = (valor as { toDate?: () => Date }).toDate?.();
  if (maybeDate instanceof Date) {
    return formatDateKey(maybeDate);
  }
  return "";
};

const obterNumeroWhatsapp = async (telefone: string) => {
  if (!client) {
    throw new WhatsappIndisponivelError("whatsapp_nao_inicializado");
  }
  try {
    const id = await client.getNumberId(telefone);
    return id?._serialized ?? null;
  } catch (error) {
    if (isStoreNotInjectedError(error)) {
      const reinjetado = await garantirInjecaoStore();
      if (reinjetado && client) {
        try {
          const id = await client.getNumberId(telefone);
          return id?._serialized ?? null;
        } catch (innerError) {
          throw new WhatsappIndisponivelError("whatsapp_store_indisponivel", innerError);
        }
      }
      throw new WhatsappIndisponivelError("whatsapp_store_indisponivel", error);
    }
    console.warn("[whatsapp] Erro ao validar numero:", error);
    return null;
  }
};

export function iniciarWhatsApp(): void {
  if (client || initializing) {
    return;
  }

  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;

  intentionalShutdownReason = null;
  clearRetryTimer();
  clearLifecycleTimers();
  initializing = true;
  status = "initializing";
  lastError = null;

  // Tempo de vida maximo absoluto — mata o Chrome mesmo em reconnect loop
  if (WHATSAPP_MAX_LIFETIME_MS > 0) {
    lifetimeTimer = setTimeout(() => {
      console.warn(`[whatsapp] Tempo de vida maximo (${Math.round(WHATSAPP_MAX_LIFETIME_MS / 60000)}min) atingido — encerrando`);
      void encerrarRuntimeSemLogout("tempo_vida_maximo");
    }, WHATSAPP_MAX_LIFETIME_MS);
  }

  const store = obterFirebaseStore();
  lastAuthStrategy = store ? "remote" : "local";
  const authStrategy = store
    ? new RemoteAuth({
        clientId: WHATSAPP_CLIENT_ID,
        dataPath: WHATSAPP_AUTH_PATH,
        store: store as any,
        backupSyncIntervalMs: Math.max(60000, REMOTE_BACKUP_INTERVAL_MS),
      })
    : new LocalAuth({
        clientId: WHATSAPP_CLIENT_ID,
        dataPath: WHATSAPP_AUTH_PATH,
      });

  if (!store) {
    console.warn(
      "[whatsapp] FIREBASE_SERVICE_ACCOUNT ausente ou Storage indisponivel — usando LocalAuth (sessao sera perdida no proximo deploy)"
    );
  }

  client = new Client({
    authStrategy,
    deviceName: WHATSAPP_DEVICE_NAME,
    browserName: WHATSAPP_BROWSER_NAME,
    puppeteer: {
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--no-zygote",
        "--single-process", // junta renderer + main = menos RAM (~300MB)
        "--disable-gpu",
        "--disable-software-rasterizer",
        "--disable-webgl",
        "--disable-accelerated-2d-canvas",
        "--disable-extensions",
        "--disable-background-networking",
        "--disable-sync",
        "--disable-default-apps",
        "--disable-features=IsolateOrigins,site-per-process,TranslateUI",
        "--metrics-recording-only",
        "--mute-audio",
        "--no-first-run",
        "--no-default-browser-check",
        "--js-flags=--max-old-space-size=256",
      ],
      ...(executablePath ? { executablePath } : {}),
    },
  });

  registrarHandlersClient();
  scheduleStartupTimeout();

  const initializingClient = client;
  initializingClient.initialize().catch((error: any) => {
    if (client !== initializingClient) return;
    console.error("[whatsapp] Falha ao inicializar:", error);
    handleInitFailure(error);
  });
}

function registrarHandlersClient(): void {
  const registeredClient = client;
  if (!registeredClient) return;

  registeredClient.on("qr", async (qr) => {
    if (client !== registeredClient) return;
    status = "qr";
    lastQrAt = Date.now();
    initializing = false;
    clearStartupTimer();
    scheduleQrShutdown();
    try {
      qrDataUrl = await qrcode.toDataURL(qr);
    } catch (error: any) {
      lastError = error?.message || "qr_error";
    }
  });

  registeredClient.on("ready", () => {
    if (client !== registeredClient) return;
    status = "ready";
    initializing = false;
    initRetries = 0;
    clearStartupTimer();
    clearQrIdleTimer();
    qrDataUrl = null;
    lastError = null;
    lastInfo = {
      wid: registeredClient.info?.wid?._serialized,
      pushname: registeredClient.info?.pushname,
    };
    scheduleIdleShutdown();
  });

  registeredClient.on("authenticated", () => {
    if (client !== registeredClient) return;
    status = "initializing";
    initializing = false;
    clearQrIdleTimer();
    scheduleStartupTimeout();
    lastError = null;
  });

  registeredClient.on("auth_failure", (msg) => {
    if (client !== registeredClient) return;
    clearLifecycleTimers();
    status = "auth_failure";
    initializing = false;
    qrDataUrl = null;
    lastInfo = null;
    lastError = msg?.toString() || "auth_failure";
    client = null;
    void (async () => {
      try {
        await registeredClient.destroy();
      } catch {
        // noop
      }
      await limparSessaoWhatsapp();
      scheduleRetry(lastError);
    })();
  });

  registeredClient.on("disconnected", (reason) => {
    if (client !== registeredClient && !intentionalShutdownReason) return;
    if (intentionalShutdownReason) {
      status = "idle";
      initializing = false;
      lastError = intentionalShutdownReason;
      qrDataUrl = null;
      lastInfo = null;
      client = null;
      return;
    }

    clearLifecycleTimers();
    status = "disconnected";
    initializing = false;
    const reasonText = reason?.toString() || "disconnected";
    lastError = reasonText;
    qrDataUrl = null;
    lastInfo = null;
    client = null;
    if (!reasonText.toLowerCase().includes("logout")) {
      scheduleRetry(reasonText);
    }
  });

  registeredClient.on("remote_session_saved" as any, () => {
    console.log("[whatsapp] Sessao sincronizada com Firebase Storage");
  });
}

export async function desconectarWhatsApp(): Promise<void> {
  clearRetryTimer();
  clearLifecycleTimers();
  initRetries = 0;
  const clienteAtual = client;
  client = null;

  try {
    if (clienteAtual) {
      try {
        await clienteAtual.logout();
      } catch {
        // noop
      }
      try {
        await clienteAtual.destroy();
      } catch {
        // noop
      }
    }
  } finally {
    await limparSessaoWhatsapp();
    status = "disconnected";
    qrDataUrl = null;
    lastInfo = null;
    lastError = null;
  }
}

// Chamado pelo monitor de memoria — forca encerramento se RSS estiver alto
export async function encerrarWhatsAppSeMemoriaAlta(rssMB: number): Promise<void> {
  if (!client && !initializing) return;
  await encerrarRuntimeSemLogout(`memoria_alta_${rssMB}MB`);
}

// Loga a config ativa — util para diagnosticar custos no Railway
export function logarConfigWhatsapp(): void {
  console.log("[whatsapp][config] Valores ativos (env sobrescreve default):", {
    AUTO_START: (process.env.WHATSAPP_AUTO_START ?? "false"),
    IDLE_TIMEOUT_min: Math.round(WHATSAPP_IDLE_TIMEOUT_MS / 60000),
    MAX_LIFETIME_min: Math.round(WHATSAPP_MAX_LIFETIME_MS / 60000),
    BACKUP_INTERVAL_min: Math.round(REMOTE_BACKUP_INTERVAL_MS / 60000),
    QR_IDLE_min: Math.round(WHATSAPP_QR_IDLE_TIMEOUT_MS / 60000),
  });
}

export function obterStatusWhatsApp(): WhatsappStatusPayload {
  return {
    status,
    qr: qrDataUrl,
    lastError,
    lastQrAt: lastQrAt ? new Date(lastQrAt).toISOString() : null,
    authStrategy: lastAuthStrategy,
    info: lastInfo ?? undefined,
  };
}

const formatarDataReserva = (valor: unknown) => {
  if (!valor) return "";
  if (typeof valor === "string") {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
    if (match) {
      return `${match[3]}/${match[2]}/${match[1]}`;
    }
    return valor;
  }
  if (valor instanceof Date) {
    const dia = String(valor.getDate()).padStart(2, "0");
    const mes = String(valor.getMonth() + 1).padStart(2, "0");
    const ano = valor.getFullYear();
    return `${dia}/${mes}/${ano}`;
  }
  const maybeDate = (valor as { toDate?: () => Date }).toDate?.();
  if (maybeDate instanceof Date) {
    return formatarDataReserva(maybeDate);
  }
  return "";
};

const montarMensagem = (template: string, reserva: Record<string, any>) => {
  const dados: Record<string, string> = {
    nome: reserva?.nome ?? "",
    datareserva: formatarDataReserva(reserva?.data),
    data: formatarDataReserva(reserva?.data),
    horario: reserva?.horario ?? "",
    atividade: reserva?.atividade ?? "",
    participantes: String(reserva?.participantes ?? ""),
    telefone: reserva?.telefone ?? "",
    valor: formatCurrency(Number(reserva?.valor ?? 0)),
    status: reserva?.status ?? "",
  };

  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, chave) => {
    const valor = dados[chave];
    return valor !== undefined ? valor : match;
  });
};

const normalizarTelefone = (telefone?: string) => {
  if (!telefone) return "";
  const digits = telefone.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    return digits;
  }
  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }
  return digits;
};

const obterConfig = async (): Promise<WhatsappConfig> => {
  const ref = doc(db, "configuracoes", "whatsapp");
  const snap = await getDoc(ref);
  if (!snap.exists()) return {};
  return snap.data() as WhatsappConfig;
};

export async function enviarBoasVindasWhatsapp(
  reservaId: string,
  reserva: Record<string, any>,
  configOverride?: WhatsappConfig
): Promise<ResultadoEnvio> {
  iniciarWhatsApp();
  clearIdleTimer();

  const config = configOverride ?? (await obterConfig());

  const telefone = normalizarTelefone(reserva?.telefone);
  if (!telefone) {
    return { enviado: false, motivo: "telefone_invalido" };
  }

  const template = (config.mensagemBoasVindas || TEMPLATE_BOAS_VINDAS_PADRAO).trim();
  if (!template) {
    return { enviado: false, motivo: "mensagem_vazia" };
  }

  const pronto = await aguardarWhatsAppPronto(WHATSAPP_SEND_READY_TIMEOUT_MS);
  if (!pronto || !client || status !== "ready") {
    scheduleIdleShutdown();
    return { enviado: false, motivo: "whatsapp_nao_conectado" };
  }

  const mensagem = montarMensagem(template, {
    ...reserva,
    id: reservaId,
  });

  let whatsappId: string | null;
  try {
    whatsappId = await obterNumeroWhatsapp(telefone);
  } catch (error) {
    console.warn("[whatsapp] Falha ao validar numero (cliente indisponivel):", error);
    handleInitFailure(error);
    return { enviado: false, motivo: "whatsapp_nao_conectado" };
  }
  if (!whatsappId) {
    return { enviado: false, motivo: "telefone_sem_whatsapp" };
  }

  try {
    await client.sendMessage(whatsappId, mensagem, { sendSeen: false });
  } catch (error: any) {
    scheduleIdleShutdown();
    return { enviado: false, motivo: error?.message || "erro_envio" };
  }

  scheduleIdleShutdown();

  return {
    enviado: true,
    mensagem,
    telefone,
  };
}

/**
 * Dispara mensagem de confirmação automática quando a reserva é paga.
 * Respeita a config `confirmacaoAutomaticaAtiva`. Idempotente: verifica
 * `whatsappConfirmacaoEnviado` antes de enviar.
 */
export async function enviarConfirmacaoWhatsapp(
  reservaId: string,
  reserva: Record<string, any>,
  configOverride?: WhatsappConfig
): Promise<ResultadoEnvio> {
  const config = configOverride ?? (await obterConfig());

  if (config.confirmacaoAutomaticaAtiva === false) {
    return { enviado: false, motivo: "desativado" };
  }

  if (reserva?.whatsappConfirmacaoEnviado === true) {
    return { enviado: false, motivo: "ja_enviado" };
  }

  const telefone = normalizarTelefone(reserva?.telefone);
  if (!telefone) {
    return { enviado: false, motivo: "telefone_invalido" };
  }

  const template = (config.mensagemConfirmacaoAutomatica || TEMPLATE_CONFIRMACAO_PADRAO).trim();
  if (!template) {
    return { enviado: false, motivo: "mensagem_vazia" };
  }

  iniciarWhatsApp();
  clearIdleTimer();

  const pronto = await aguardarWhatsAppPronto(WHATSAPP_SEND_READY_TIMEOUT_MS);
  if (!pronto || !client || status !== "ready") {
    scheduleIdleShutdown();
    return { enviado: false, motivo: "whatsapp_nao_conectado" };
  }

  const mensagem = montarMensagem(template, {
    ...reserva,
    id: reservaId,
  });

  let whatsappId: string | null;
  try {
    whatsappId = await obterNumeroWhatsapp(telefone);
  } catch (error) {
    console.warn("[whatsapp] Falha ao validar numero (confirmacao):", error);
    handleInitFailure(error);
    return { enviado: false, motivo: "whatsapp_nao_conectado" };
  }
  if (!whatsappId) {
    return { enviado: false, motivo: "telefone_sem_whatsapp" };
  }

  try {
    await client.sendMessage(whatsappId, mensagem, { sendSeen: false });
  } catch (error: any) {
    scheduleIdleShutdown();
    return { enviado: false, motivo: error?.message || "erro_envio" };
  }

  scheduleIdleShutdown();

  return {
    enviado: true,
    mensagem,
    telefone,
  };
}
