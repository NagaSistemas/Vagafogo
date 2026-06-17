import { db } from "./firebase";
import { doc, setDoc } from "firebase/firestore";
import { v4 as uuidv4 } from "uuid";
import { PerguntaPersonalizadaResposta } from "../types/perguntasPersonalizadas";
import { reservaEstaConfirmada } from "./reservaStatus";
import { obterCamposRetencaoReservaNaCriacao } from "./reservaRetention";

const normalizarNumero = (valor: unknown) => {
  const numero = Number(valor);
  return Number.isFinite(numero) ? Math.max(numero, 0) : 0;
};

const somarMapa = (mapa?: Record<string, number>) => {
  if (!mapa) return 0;
  return Object.values(mapa).reduce((total, valor) => total + normalizarNumero(valor), 0);
};

const normalizarMapa = (mapa?: Record<string, number>) => {
  if (!mapa) return undefined;
  return Object.fromEntries(
    Object.entries(mapa).map(([chave, valor]) => [chave, normalizarNumero(valor)])
  );
};

export type GrupoParticipacaoPayload = {
  tipo: "combo" | "pacote";
  refId: string;
  nome: string;
  pacoteIds: string[];
  participantesPorTipo: Record<string, number>;
  participantes: number;
};

const normalizarGruposParticipacao = (grupos?: GrupoParticipacaoPayload[]) => {
  if (!Array.isArray(grupos)) return [];
  return grupos
    .map((grupo) => {
      const refId = grupo.refId?.toString().trim();
      const participantesPorTipo = normalizarMapa(grupo.participantesPorTipo) ?? {};
      const participantes = Math.max(
        somarMapa(participantesPorTipo),
        normalizarNumero(grupo.participantes)
      );
      const pacoteIds = Array.isArray(grupo.pacoteIds)
        ? grupo.pacoteIds
            .map((id) => id?.toString().trim())
            .filter((id): id is string => Boolean(id))
        : [];
      return {
        tipo: grupo.tipo === "combo" ? "combo" : "pacote",
        refId,
        nome: grupo.nome?.toString().trim() || (grupo.tipo === "combo" ? "Combo" : "Pacote"),
        pacoteIds,
        participantesPorTipo,
        participantes,
      };
    })
    .filter(
      (grupo): grupo is GrupoParticipacaoPayload =>
        Boolean(grupo.refId) && grupo.pacoteIds.length > 0 && grupo.participantes > 0
    );
};

const normalizarHorariosPorPacote = (horarios?: Record<string, string>) => {
  if (!horarios || typeof horarios !== "object") return {};
  return Object.fromEntries(
    Object.entries(horarios)
      .map(([pacoteId, horario]) => [pacoteId.toString().trim(), (horario ?? "").toString().trim()])
      .filter(([pacoteId, horario]) => Boolean(pacoteId) && Boolean(horario))
  );
};

export type CriarReservaPayload = {
  nome: string;
  cpf: string;
  email: string;
  valor: number;
  telefone: string;
  atividade: string;
  data: string;
  adultos: number;
  bariatrica: number;
  criancas: number;
  naoPagante: number;
  participantes: number;
  participantesPorTipo?: Record<string, number>;
  gruposParticipacao?: GrupoParticipacaoPayload[];
  pacoteIds?: string[];
  comboId?: string | null;
  horario: string | null;
  horariosPorPacote?: Record<string, string>;
  status?: string;
  observacao?: string;
  temPet?: boolean;
  perguntasPersonalizadas?: PerguntaPersonalizadaResposta[];
};

export async function criarReserva(payload: CriarReservaPayload): Promise<string> {
  const {
    nome,
    cpf,
    email,
    valor,
    telefone,
    atividade,
    data,
    adultos,
    bariatrica,
    criancas,
    naoPagante,
    participantes,
    participantesPorTipo,
    gruposParticipacao,
    pacoteIds,
    comboId,
    horario,
    horariosPorPacote,
    status = "aguardando",
    observacao = "",
    temPet,
    perguntasPersonalizadas,
  } = payload;

  const participantesPorTipoNormalizado = normalizarMapa(participantesPorTipo);
  const gruposParticipacaoNormalizados = normalizarGruposParticipacao(gruposParticipacao);
  const participantesGrupos = gruposParticipacaoNormalizados.reduce(
    (total, grupo) => total + grupo.participantes,
    0
  );
  const mapaAtivo =
    participantesPorTipoNormalizado &&
    Object.keys(participantesPorTipoNormalizado).length > 0;
  const participantesCalculadosBase = mapaAtivo
    ? somarMapa(participantesPorTipoNormalizado)
    : (adultos ?? 0) + (bariatrica ?? 0) + (criancas ?? 0);
  const participantesCalculados = participantesCalculadosBase + (naoPagante ?? 0);
  const participantesConsiderados = Math.max(
    participantesGrupos + (naoPagante ?? 0),
    participantesCalculados,
    Number.isFinite(participantes) ? participantes : 0
  );
  const pacoteIdsNormalizados = Array.isArray(pacoteIds)
    ? pacoteIds
        .map((id) => id?.toString())
        .filter((id): id is string => Boolean(id))
    : [];
  const comboIdNormalizado = comboId ? comboId.toString() : null;
  const horariosPorPacoteNormalizado = normalizarHorariosPorPacote(horariosPorPacote);

  const reservaId = uuidv4();
  const reservaRef = doc(db, "reservas", reservaId);
  const camposRetencao = obterCamposRetencaoReservaNaCriacao({ status });

  await setDoc(reservaRef, {
    nome,
    cpf,
    email,
    valor,
    telefone,
    atividade,
    data,
    participantes: participantesConsiderados,
    adultos,
    bariatrica,
    criancas,
    naoPagante,
    ...(mapaAtivo ? { participantesPorTipo: participantesPorTipoNormalizado } : {}),
    ...(gruposParticipacaoNormalizados.length > 0
      ? { gruposParticipacao: gruposParticipacaoNormalizados }
      : {}),
    ...(pacoteIdsNormalizados.length > 0 ? { pacoteIds: pacoteIdsNormalizados } : {}),
    ...(comboIdNormalizado ? { comboId: comboIdNormalizado } : {}),
    horario,
    ...(Object.keys(horariosPorPacoteNormalizado).length > 0
      ? { horariosPorPacote: horariosPorPacoteNormalizado }
      : {}),
    status,
    confirmada: reservaEstaConfirmada({ status }),
    observacao,
    temPet,
    perguntasPersonalizadas: perguntasPersonalizadas ?? [],
    ...camposRetencao,
  });

  return reservaId;
}
