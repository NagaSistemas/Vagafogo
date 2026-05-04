import { useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../../firebase";
import logo from "../assets/logo.jpg";
import {
  reservaEstaConfirmada,
  reservaEhPreReserva,
  reservaEhAguardandoPagamento,
} from "../utils/reservaStatus";

type Reserva = {
  id: string;
  nome?: string;
  cpf?: string;
  email?: string;
  telefone?: string;
  atividade?: string;
  data?: string;
  horario?: string;
  participantes?: number;
  valor?: number;
  status?: string;
  confirmada?: boolean;
  naoConsomeDisponibilidade?: boolean;
  observacao?: string;
  emailEnviado?: boolean;
  pacoteIds?: string[];
  comboId?: string;
  criadoEm?: { seconds: number } | string | Date;
  dataPagamento?: { seconds: number } | string | Date;
};

const onlyNumbers = (value: string) => value.replace(/\D/g, "");

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

const formatCurrency = (valor?: number) => {
  if (typeof valor !== "number" || !Number.isFinite(valor)) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor);
};

const formatData = (valor?: string) => {
  if (!valor) return "—";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  return valor;
};

const obterDataPagamento = (valor: Reserva["dataPagamento"]): Date | null => {
  if (!valor) return null;
  if (valor instanceof Date) return valor;
  if (typeof valor === "string") {
    const d = new Date(valor);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof valor === "object" && "seconds" in valor) {
    return new Date(valor.seconds * 1000);
  }
  return null;
};

type StatusVisual = {
  label: string;
  description: string;
  badgeClass: string;
  dotClass: string;
  cardAccent: string;
};

const obterStatusVisual = (reserva: Reserva): StatusVisual => {
  if (reservaEstaConfirmada(reserva)) {
    return {
      label: "Confirmada",
      description: "Pagamento aprovado. Sua vaga está garantida.",
      badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
      dotClass: "bg-emerald-500",
      cardAccent: "from-emerald-500 to-green-600",
    };
  }
  if (reservaEhAguardandoPagamento(reserva)) {
    return {
      label: "Aguardando pagamento",
      description: "Estamos aguardando a confirmação do pagamento.",
      badgeClass: "bg-amber-50 text-amber-700 border-amber-200",
      dotClass: "bg-amber-500",
      cardAccent: "from-amber-500 to-orange-500",
    };
  }
  if (reservaEhPreReserva(reserva)) {
    return {
      label: "Pré-reserva",
      description: "Reserva criada manualmente, aguardando confirmação.",
      badgeClass: "bg-sky-50 text-sky-700 border-sky-200",
      dotClass: "bg-sky-500",
      cardAccent: "from-sky-500 to-blue-600",
    };
  }
  return {
    label: "Não confirmada",
    description: "Esta reserva ainda não foi confirmada.",
    badgeClass: "bg-rose-50 text-rose-700 border-rose-200",
    dotClass: "bg-rose-500",
    cardAccent: "from-rose-500 to-red-600",
  };
};

export function MinhaReserva() {
  const [cpf, setCpf] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [reservas, setReservas] = useState<Reserva[] | null>(null);
  const [pesquisaRealizada, setPesquisaRealizada] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErro(null);

    const digits = onlyNumbers(cpf);
    if (digits.length !== 11) {
      setErro("Informe um CPF válido com 11 dígitos.");
      return;
    }

    setCarregando(true);
    setReservas(null);
    setPesquisaRealizada(false);

    try {
      const formatado = formatCpf(digits);
      const consultas = await Promise.all([
        getDocs(query(collection(db, "reservas"), where("cpf", "==", formatado))),
        getDocs(query(collection(db, "reservas"), where("cpf", "==", digits))),
      ]);

      const mapa = new Map<string, Reserva>();
      consultas.forEach((snapshot) => {
        snapshot.forEach((docSnap) => {
          mapa.set(docSnap.id, { id: docSnap.id, ...(docSnap.data() as Omit<Reserva, "id">) });
        });
      });

      const lista = Array.from(mapa.values()).sort((a, b) => {
        const da = a.data ?? "";
        const db_ = b.data ?? "";
        return db_.localeCompare(da);
      });

      setReservas(lista);
      setPesquisaRealizada(true);
    } catch (error) {
      console.error("Erro ao consultar reserva:", error);
      setErro("Não foi possível consultar agora. Tente novamente em instantes.");
    } finally {
      setCarregando(false);
    }
  };

  const limparPesquisa = () => {
    setReservas(null);
    setPesquisaRealizada(false);
    setErro(null);
  };

  return (
    <div
      className="min-h-screen"
      style={{ background: "linear-gradient(160deg, #F7FAEF 0%, #f0ede6 50%, #F7FAEF 100%)" }}
    >
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-[#8B4F23]/10 shadow-sm">
        <div className="mx-auto w-full max-w-screen-xl px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 group">
            <img
              src={logo}
              alt="Logo Vagafogo"
              className="h-10 w-10 rounded-full border border-[#8B4F23]/20 object-cover shadow-sm group-hover:border-[#8B4F23]/50 transition-colors"
              loading="lazy"
            />
            <div>
              <p className="font-bold text-[#8B4F23] text-base leading-none tracking-wide">VAGAFOGO</p>
              <p className="text-[10px] text-gray-400 uppercase tracking-widest leading-none mt-0.5">
                Santuário Natural
              </p>
            </div>
          </Link>

          <Link
            to="/"
            className="inline-flex items-center gap-1.5 rounded-full border border-[#8B4F23]/20 bg-white px-4 py-2 text-sm font-medium text-[#8B4F23] shadow-sm hover:bg-[#8B4F23]/5 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Voltar ao site
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-screen-md px-4 sm:px-6 lg:px-8 pt-10 pb-16">
        <div className="text-center mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-[#2D1E0F] leading-tight tracking-tight">
            Consulte sua reserva
          </h1>
          <p className="mt-3 text-gray-600 text-sm md:text-base max-w-md mx-auto">
            Informe seu CPF para visualizar o status e os detalhes da sua reserva.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-3xl border border-slate-200 bg-white/90 backdrop-blur-sm p-6 sm:p-8 shadow-xl"
        >
          <label htmlFor="cpf-consulta" className="block text-xs font-bold uppercase tracking-[0.2em] text-slate-500 mb-2">
            CPF do titular da reserva
          </label>
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              id="cpf-consulta"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="000.000.000-00"
              value={cpf}
              onChange={(e) => setCpf(formatCpf(e.target.value))}
              maxLength={14}
              className="flex-1 px-4 py-3 rounded-xl border border-slate-200 bg-white text-base focus:outline-none focus:ring-2 focus:ring-[#8B4F23]/30 focus:border-[#8B4F23] transition"
            />
            <button
              type="submit"
              disabled={carregando}
              className="inline-flex items-center justify-center gap-2 bg-[#8B4F23] text-white font-semibold px-6 py-3 rounded-xl shadow-lg hover:bg-[#A05D2B] disabled:bg-slate-400 disabled:cursor-not-allowed transition-all duration-200"
            >
              {carregando ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Consultando...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  Consultar
                </>
              )}
            </button>
          </div>
          {erro && <p className="mt-3 text-sm text-rose-600">{erro}</p>}
        </form>

        {pesquisaRealizada && reservas && reservas.length === 0 && (
          <div className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center">
            <svg className="w-10 h-10 text-amber-500 mx-auto mb-3" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h3 className="text-base font-semibold text-amber-900">Nenhuma reserva encontrada</h3>
            <p className="text-sm text-amber-800 mt-1">
              Não localizamos reservas com este CPF. Verifique se o número está correto ou{" "}
              <Link to="/reservar" className="underline hover:text-amber-900">
                faça uma nova reserva
              </Link>
              .
            </p>
            <button
              type="button"
              onClick={limparPesquisa}
              className="mt-4 text-sm text-amber-700 hover:text-amber-900 underline"
            >
              Tentar outro CPF
            </button>
          </div>
        )}

        {reservas && reservas.length > 0 && (
          <div className="mt-8 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-600">
                <strong className="text-slate-900">{reservas.length}</strong>{" "}
                {reservas.length === 1 ? "reserva encontrada" : "reservas encontradas"}
              </p>
              <button
                type="button"
                onClick={limparPesquisa}
                className="text-xs text-slate-500 hover:text-slate-800 underline"
              >
                Nova consulta
              </button>
            </div>

            {reservas.map((reserva) => {
              const visual = obterStatusVisual(reserva);
              const dataPagamento = obterDataPagamento(reserva.dataPagamento);
              return (
                <article
                  key={reserva.id}
                  className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-md"
                >
                  <div className={`h-1.5 w-full bg-gradient-to-r ${visual.cardAccent}`} />

                  <div className="p-5 sm:p-6">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-5">
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                          Código da reserva
                        </p>
                        <p className="font-mono text-xs text-slate-700 mt-1 truncate">
                          {reserva.id}
                        </p>
                      </div>
                      <span
                        className={`inline-flex items-center gap-2 self-start rounded-full px-3 py-1.5 text-xs font-semibold border ${visual.badgeClass}`}
                      >
                        <span className={`h-2 w-2 rounded-full ${visual.dotClass}`} />
                        {visual.label}
                      </span>
                    </div>

                    <p className="text-xs text-slate-600 mb-5 leading-relaxed">{visual.description}</p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <DetailRow label="Atividade" value={reserva.atividade} />
                      <DetailRow label="Data" value={formatData(reserva.data)} />
                      <DetailRow label="Horário" value={reserva.horario || "—"} />
                      <DetailRow label="Participantes" value={String(reserva.participantes ?? "—")} />
                      <DetailRow label="Valor" value={formatCurrency(reserva.valor)} />
                      {dataPagamento && (
                        <DetailRow
                          label="Pagamento confirmado em"
                          value={dataPagamento.toLocaleDateString("pt-BR", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        />
                      )}
                    </div>

                    {(reserva.nome || reserva.email || reserva.telefone) && (
                      <div className="mt-5 pt-5 border-t border-slate-100">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400 mb-3">
                          Titular
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                          {reserva.nome && (
                            <p className="text-slate-700">
                              <span className="text-slate-500">Nome:</span> {reserva.nome}
                            </p>
                          )}
                          {reserva.email && (
                            <p className="text-slate-700 truncate">
                              <span className="text-slate-500">E-mail:</span> {reserva.email}
                            </p>
                          )}
                          {reserva.telefone && (
                            <p className="text-slate-700">
                              <span className="text-slate-500">Telefone:</span> {reserva.telefone}
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    {!reservaEstaConfirmada(reserva) && (
                      <div className="mt-5 rounded-xl bg-amber-50 border border-amber-200 p-3 flex items-start gap-3">
                        <svg className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <p className="text-xs text-amber-800 leading-relaxed">
                          Caso já tenha pago, aguarde alguns instantes para a confirmação automática. Em caso de dúvidas, entre em contato pelo{" "}
                          <a
                            href={`https://wa.me/5562992225471?text=Olá! Preciso de ajuda com a reserva ${reserva.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-semibold underline hover:text-amber-900"
                          >
                            WhatsApp
                          </a>
                          .
                        </p>
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}

      </main>

      <div className="border-t border-[#8B4F23]/10 py-6 text-center">
        <p className="text-xs text-gray-400">
          © {new Date().getFullYear()} Santuário Vagafogo · Pirenópolis, GO
        </p>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</p>
      <p className="text-sm text-slate-800 mt-1 break-words">{value ?? "—"}</p>
    </div>
  );
}
