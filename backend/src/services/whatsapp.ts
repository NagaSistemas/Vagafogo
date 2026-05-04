import { Client, LocalAuth, RemoteAuth } from "whatsapp-web.js";
import qrcode from "qrcode";
import { collection, doc, getDoc, getDocs, query, updateDoc, where } from "firebase/firestore";
import { rm } from "fs/promises";
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
  info?: {
    wid?: string;
    pushname?: string;
  };
};

type WhatsappConfig = {
  ativo?: boolean;
  mensagemConfirmacao?: string;
  mensagemBoasVindas?: string;
};

type ResultadoEnvio = {
  enviado: boolean;
  motivo?: string;
  mensagem?: string;
  telefone?: string;
};

type ResultadoProcessamento = {
  enviados: number;
  falhas: number;
  motivo?: string;
};

const TEMPLATE_PADRAO =
  "Olá {nome}! Sua reserva foi confirmada para {datareserva} às {horario}. Atividade: {atividade}. Participantes: {participantes}.";

const TEMPLATE_BOAS_VINDAS_PADRAO =
  "Olá {nome}! 🌿 Seja muito bem-vindo(a) ao Santuário Vagafogo. É um prazer receber você hoje! Tenha uma experiência incrível.";

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
const WHATSAPP_CLIENT_ID = (process.env.WHATSAPP_CLIENT_ID ?? "vagafogo").trim() || "vagafogo";
const WHATSAPP_AUTH_PATH = (process.env.WHATSAPP_AUTH_PATH ?? ".wwebjs_auth").trim() || ".wwebjs_auth";
const WHATSAPP_AUTH_SESSION_PATH = path.resolve(
  process.cwd(),
  WHATSAPP_AUTH_PATH,
  `RemoteAuth-${WHATSAPP_CLIENT_ID}`
);
const REMOTE_BACKUP_INTERVAL_MS = parseNumber(
  process.env.WHATSAPP_REMOTE_BACKUP_MS,
  300000 // 5 min
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
let initializing = false;
let processingPending = false;
let initRetries = 0;
let retryTimer: NodeJS.Timeout | null = null;

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
  status = "disconnected";
  initializing = false;
  lastError = (error as { message?: string })?.message || "init_error";
  qrDataUrl = null;
  lastInfo = null;
  if (client) {
    client.destroy().catch(() => undefined);
  }
  client = null;
  scheduleRetry(lastError);
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

  clearRetryTimer();
  initializing = true;
  status = "initializing";
  lastError = null;

  const store = obterFirebaseStore();
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
    puppeteer: {
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
      ...(executablePath ? { executablePath } : {}),
    },
  });

  registrarHandlersClient();

  client.initialize().catch((error: any) => {
    console.error("[whatsapp] Falha ao inicializar:", error);
    handleInitFailure(error);
  });
}

function registrarHandlersClient(): void {
  if (!client) return;

  client.on("qr", async (qr) => {
    status = "qr";
    lastQrAt = Date.now();
    try {
      qrDataUrl = await qrcode.toDataURL(qr);
    } catch (error: any) {
      lastError = error?.message || "qr_error";
    }
  });

  client.on("ready", () => {
    status = "ready";
    initializing = false;
    initRetries = 0;
    qrDataUrl = null;
    lastError = null;
    lastInfo = {
      wid: client?.info?.wid?._serialized,
      pushname: client?.info?.pushname,
    };
    void processarPendentesWhatsapp();
  });

  client.on("authenticated", () => {
    status = "initializing";
    initializing = false;
    lastError = null;
  });

  client.on("auth_failure", (msg) => {
    status = "auth_failure";
    initializing = false;
    qrDataUrl = null;
    lastInfo = null;
    lastError = msg?.toString() || "auth_failure";
    const clienteAtual = client;
    client = null;
    void (async () => {
      try {
        await clienteAtual?.destroy();
      } catch {
        // noop
      }
      await limparSessaoWhatsapp();
      scheduleRetry(lastError);
    })();
  });

  client.on("disconnected", (reason) => {
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

  client.on("remote_session_saved" as any, () => {
    console.log("[whatsapp] Sessao sincronizada com Firebase Storage");
  });
}

export async function desconectarWhatsApp(): Promise<void> {
  clearRetryTimer();
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

export function obterStatusWhatsApp(): WhatsappStatusPayload {
  return {
    status,
    qr: qrDataUrl,
    lastError,
    lastQrAt: lastQrAt ? new Date(lastQrAt).toISOString() : null,
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

export async function enviarConfirmacaoWhatsapp(
  reservaId: string,
  reserva: Record<string, any>,
  configOverride?: WhatsappConfig
): Promise<ResultadoEnvio> {
  iniciarWhatsApp();

  const config = configOverride ?? (await obterConfig());
  if (!config.ativo) {
    return { enviado: false, motivo: "config_desativado" };
  }

  const telefone = normalizarTelefone(reserva?.telefone);
  if (!telefone) {
    return { enviado: false, motivo: "telefone_invalido" };
  }

  const template = (config.mensagemConfirmacao || TEMPLATE_PADRAO).trim();
  if (!template) {
    return { enviado: false, motivo: "mensagem_vazia" };
  }

  if (!client || status !== "ready") {
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
    return { enviado: false, motivo: error?.message || "erro_envio" };
  }
  return {
    enviado: true,
    mensagem,
    telefone,
  };
}

export async function enviarBoasVindasWhatsapp(
  reservaId: string,
  reserva: Record<string, any>,
  configOverride?: WhatsappConfig
): Promise<ResultadoEnvio> {
  iniciarWhatsApp();

  const config = configOverride ?? (await obterConfig());
  if (!config.ativo) {
    return { enviado: false, motivo: "config_desativado" };
  }

  const telefone = normalizarTelefone(reserva?.telefone);
  if (!telefone) {
    return { enviado: false, motivo: "telefone_invalido" };
  }

  const template = (config.mensagemBoasVindas || TEMPLATE_BOAS_VINDAS_PADRAO).trim();
  if (!template) {
    return { enviado: false, motivo: "mensagem_vazia" };
  }

  if (!client || status !== "ready") {
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
    return { enviado: false, motivo: error?.message || "erro_envio" };
  }

  return {
    enviado: true,
    mensagem,
    telefone,
  };
}

export async function processarPendentesWhatsapp(): Promise<ResultadoProcessamento> {
  if (processingPending) {
    return { enviados: 0, falhas: 0, motivo: "em_andamento" };
  }
  processingPending = true;

  try {
    iniciarWhatsApp();

    const config = await obterConfig();
    if (!config.ativo) {
      return { enviados: 0, falhas: 0, motivo: "config_desativado" };
    }

    if (!client || status !== "ready") {
      return { enviados: 0, falhas: 0, motivo: "whatsapp_nao_conectado" };
    }

    const injecaoOk = await garantirInjecaoStore();
    if (!injecaoOk) {
      handleInitFailure(new Error("whatsapp_store_indisponivel"));
      return { enviados: 0, falhas: 0, motivo: "whatsapp_nao_conectado" };
    }

    const statusElegiveis = ["pago", "Pago", "PAGO"];
    const snapshot = await getDocs(
      query(collection(db, "reservas"), where("status", "in", statusElegiveis))
    );

    let enviados = 0;
    let falhas = 0;
    const hoje = formatDateKey(new Date());

    for (const docSnap of snapshot.docs) {
      const reserva = docSnap.data() as Record<string, any>;
      const dataReserva = obterDataReserva(reserva.data);
      if (!dataReserva || dataReserva < hoje) {
        continue;
      }
      if (reserva.whatsappEnviado === true) {
        continue;
      }

      try {
        const resultado = await enviarConfirmacaoWhatsapp(docSnap.id, reserva, config);
        if (resultado.enviado) {
          await updateDoc(doc(db, "reservas", docSnap.id), {
            whatsappEnviado: true,
            dataWhatsappEnviado: new Date(),
            whatsappMensagem: resultado.mensagem ?? "",
            whatsappTelefone: resultado.telefone ?? "",
          });
          enviados += 1;
        } else {
          falhas += 1;
          console.warn(
            `[whatsapp] pendente nao enviado ${docSnap.id}: ${resultado.motivo ?? "erro"}`
          );
        }
      } catch (error) {
        falhas += 1;
        console.error(`[whatsapp] erro ao enviar ${docSnap.id}:`, error);
      }
    }

    return { enviados, falhas };
  } catch (error) {
    console.error("[whatsapp] erro ao processar pendentes:", error);
    return { enviados: 0, falhas: 0, motivo: "erro" };
  } finally {
    processingPending = false;
  }
}
