import { useState } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from '../../firebase';
import { DayPicker } from "react-day-picker";
import "react-day-picker/dist/style.css";
import { ptBR } from "date-fns/locale";

type Pacote = {
  nome: string;
  tipo: "brunch" | "trilha" | "experiencia";
  precoAdulto: number;
  precoCrianca: number;
  precoBariatrica: number;
  horarios?: string[];
  dias: number[];
  limite?: number;
};

const PACOTES: Pacote[] = [
  {
    nome: "Brunch Gastronômico",
    tipo: "brunch",
    precoAdulto: 115,
    precoCrianca: 40,
    precoBariatrica: 80,
    horarios: ["09:00", "11:00", "13:00"],
    dias: [0, 1, 2, 3, 4, 5, 6],
    limite: 30,
  },
  {
    nome: "Trilha Ecológica",
    tipo: "trilha",
    precoAdulto: 30,
    precoCrianca: 15,
    precoBariatrica: 0,
    dias: [0, 1, 2, 3, 4, 5, 6],
  },
  {
    nome: "Brunch + trilha",
    tipo: "experiencia",
    precoAdulto: 140,
    precoCrianca: 55,
    precoBariatrica: 0,
    horarios: ["09:00", "11:00", "13:00"],
    dias: [0, 1, 2, 3, 4, 5, 6],
    limite: 30,
  },
];

export function BookingSection() {
  const [selectedPackage, setSelectedPackage] = useState<number>(0);
  const [nome, setNome] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [telefone, setTelefone] = useState<string>("");
  const [cpf, setCpf] = useState<string>("");
  const [selectedDay, setSelectedDay] = useState<Date | undefined>();
  const [horario, setHorario] = useState<string>("");
  const [adultos, setAdultos] = useState<number>(1);
  const [bariatrica, setBariatica] = useState<number>(0);
  const [criancas, setCriancas] = useState<number>(0);
  const [naoPagante, setPagante] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [formaPagamento, setFormaPagamento] = useState<"CREDIT_CARD" | "PIX">("CREDIT_CARD");
  const [vagasRestantes, setVagasRestantes] = useState<number | null>(null);

  // Novos estados para armazenar dados do PIX
  const [pixKey, setPixKey] = useState<string | null>(null);
  const [qrCodeImage, setQrCodeImage] = useState<string | null>(null);
  const [expirationDate, setExpirationDate] = useState<string | null>(null);

  const pacote = PACOTES[selectedPackage];
  const total = adultos * pacote.precoAdulto + criancas * pacote.precoCrianca + bariatrica * pacote.precoBariatrica;
  const allowedDays = (day: Date) => pacote.dias.includes(day.getDay());
  const horariosDisponiveis = pacote.horarios || [];

  // Função para verificar vagas automaticamente (só para pacotes com horário e limite definidos)
  async function verificarVagas(pacote: Pacote, data: Date | undefined, horario: string) {
    if (!data || !horario || !pacote.limite) {
      setVagasRestantes(null);
      return;
    }
    const dataStr = data.toISOString().slice(0, 10);
    try {
      const q = query(
        collection(db, "reservas"),
        where("data", "==", dataStr),
        where("horario", "==", horario),
        where("status", "==", "pago")
      );
      const snapshot = await getDocs(q);
      let total = 0;
      snapshot.forEach(doc => {
        const dados = doc.data();
        total += dados.participantes || 0;
      });
      const restantes = pacote.limite - total;
      setVagasRestantes(restantes);
    } catch (error) {
      console.error("Erro ao verificar vagas:", error);
      setVagasRestantes(null);
    }
  }

  // Atualiza pacote selecionado
  function handlePackage(idx: number) {
    setSelectedPackage(idx);
    setHorario("");
    setVagasRestantes(null);
    // Só verifica se já tem data e horário selecionados
    if (selectedDay && PACOTES[idx].horarios && horario) {
      verificarVagas(PACOTES[idx], selectedDay, horario);
    }
  }

  function handleDate(date: Date | undefined) {
    setSelectedDay(date);
    setHorario("");
    setVagasRestantes(null);
    if (date && horariosDisponiveis.length > 0 && horario) {
      verificarVagas(pacote, date, horario);
    }
  }

  function handleHorario(novoHorario: string) {
    setHorario(novoHorario);
    if (selectedDay && novoHorario && pacote.limite) {
      verificarVagas(pacote, selectedDay, novoHorario);
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!selectedDay) return alert("Selecione uma data válida!");
    if (horariosDisponiveis.length > 0 && !horario) return alert("Selecione o horário!");
    if (!nome || !email || !cpf) return alert("Preencha todos os campos obrigatórios!");

    setLoading(true);

    try {
      const dataStr = selectedDay.toISOString().slice(0, 10);
      // Monta o filtro da query para busca de reservas
      const whereFilters = [where("data", "==", dataStr)];
      if (horariosDisponiveis.length > 0) {
        whereFilters.push(where("horario", "==", horario));
      }
      const q = query(collection(db, "reservas"), ...whereFilters);
      const querySnapshot = await getDocs(q);

      let totalReservas = 0;
      querySnapshot.forEach((doc) => {
        const dados = doc.data();
        totalReservas += dados.participantes || 0;
      });

      const limite = pacote.limite ?? 30; // Default para brunch e experiencia, para trilha é ilimitado

      const totalParticipantes = adultos + criancas + bariatrica + naoPagante;
      // Só bloqueia caso exista limite definido!
      if (pacote.limite && (totalReservas + totalParticipantes > limite)) {
        alert(`Limite de ${limite} pessoas por horário já atingido. Por favor, escolha outro horário.`);
        setLoading(false);
        return;
      }
      setVagasRestantes(pacote.limite ? limite - totalReservas : null);

      // Monta o payload do POST, só envia "horario" se houver horário disponível
    const payload: any = {
  nome,
  email,
  valor: total,
  cpf,
  telefone,
  atividade: pacote.nome,
  data: dataStr,
  participantes: totalParticipantes,
  adultos,
  bariatrica,
  criancas,
  naoPagante,
  billingType: formaPagamento,
  horario: horariosDisponiveis.length > 0 ? horario : "Trilha", // <- aqui está o segredo
};


      // LOG para debugging:
      // console.log("Enviando para o backend:", payload);

      // Faz a requisição
      const rawResponse = await fetch("https://backend-production-ce20.up.railway.app/criar-cobranca", {
        method: "POST",
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      const resposta = await rawResponse.json().catch(() => ({}));

      if (!rawResponse.ok) {
        // Tenta pegar o erro do backend, se houver
        console.error("Backend retornou erro", resposta);
        alert("Erro ao criar a cobrança: " + (resposta?.message || rawResponse.statusText));
        setLoading(false);
        return;
      }

      if (resposta?.status === 'ok') {
        setCheckoutUrl(resposta.cobranca.invoiceUrl);
        setPixKey(resposta.cobranca.pixKey);
        setQrCodeImage(resposta.cobranca.qrCodeImage);
        setExpirationDate(resposta.cobranca.expirationDate);
      } else {
        alert(
          resposta?.cobranca?.status
            ? `Cobrança criada, mas o link não foi retornado. Status: ${resposta.cobranca.status}`
            : "Erro ao criar a cobrança. Verifique os dados ou tente novamente."
        );
      }

    } catch (error) {
      console.error("Erro ao buscar reservas:", error);
      alert("Erro ao verificar disponibilidade. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  // Renderização JSX igual ao seu original
  return (
    <section id="reservas" className="py-16 bg-[#F7FAEF]">
      <div className="container mx-auto px-4">
        <div className="max-w-2xl mx-auto text-center mb-10">
          <span className="text-green-600 font-semibold text-xs uppercase tracking-widest">
            RESERVE SEU PASSEIO
          </span>
          <h2 className="font-heading text-3xl md:text-4xl font-bold text-[#8B4F23] mt-2 mb-1">
            Faça sua Reserva Agora
          </h2>
        </div>
        <div className="max-w-3xl mx-auto">
          <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-xl p-6 md:p-8">
            {/* Pacotes */}
            <label className="block text-base font-semibold text-[#8B4F23] mb-4">
              Escolha seu Pacote:
            </label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
              {PACOTES.map((pkg, idx) => (
                <div
                  key={idx}
                  className={`border-2 p-4 rounded-xl text-center cursor-pointer transition ${
                    selectedPackage === idx ? "border-[#8B4F23] bg-[#F7FAEF]" : "border-gray-200"
                  }`}
                  onClick={() => handlePackage(idx)}
                >
                  <div className="text-3xl mb-2 text-[#8B4F23]">
                    {pkg.tipo === "brunch" ? "🥐" : pkg.tipo === "trilha" ? "🌳" : "✨"}
                  </div>
                  <h4 className="font-bold text-[#8B4F23]">{pkg.nome}</h4>
                  <p className="text-sm text-gray-500">
                    Adulto: R$ {pkg.precoAdulto} | Criança: R$ {pkg.precoCrianca}
                  </p>
                </div>
              ))}
            </div>

            {/* Dados pessoais */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Nome Completo *</label>
                <input
                  type="text"
                  className="w-full px-4 py-3 border rounded-lg text-sm"
                  value={nome}
                  onChange={e => setNome(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">E-mail *</label>
                <input
                  type="email"
                  className="w-full px-4 py-3 border rounded-lg text-sm"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Telefone/WhatsApp *</label>
                <input
                  type="tel"
                  className="w-full px-4 py-3 border rounded-lg text-sm"
                  value={telefone}
                  onChange={e => setTelefone(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">CPF *</label>
                <input
                  type="text"
                  placeholder="000.000.000-00"
                  className="w-full px-4 py-3 border rounded-lg text-sm"
                  value={cpf}
                  onChange={e => setCpf(e.target.value)}
                  required
                />
              </div>
            </div>

            {/* CALENDÁRIO */}
            <div className="mb-4">
              <label className="block text-xs font-semibold text-[#8B4F23] mb-2">Data Preferida *</label>
              <DayPicker
                mode="single"
                selected={selectedDay}
                onSelect={handleDate}
                fromDate={new Date()}
                locale={ptBR}
                modifiers={{ allowed: allowedDays }}
                modifiersClassNames={{
                  allowed: "bg-[#F7FAEF] text-[#8B4F23] font-bold",
                  selected: "bg-white text-[#8B4F23] ring-2 ring-[#8B4F23] font-bold",
                  today: "bg-[#e7dfd7] text-[#8B4F23] font-bold",
                  disabled: "bg-gray-100 text-gray-400 cursor-not-allowed"
                }}
                disabled={(day) => !allowedDays(day)}
                footer={!selectedDay && <span className="text-xs text-red-400">Selecione uma data válida.</span>}
                styles={{
                  root: { width: "100%", maxWidth: "100%", margin: "32px auto" },
                  table: { width: "100%", tableLayout: "fixed" },
                  row: { height: 80, display: "flex", flexWrap: "wrap" },
                  day: {
                    width: "100%",
                    minWidth: "100px",
                    maxWidth: "100%",
                    height: 48,
                    padding: 0,
                    fontSize: "1rem",
                    borderRadius: "8px",
                    border: "1px solid #e2d6c2",
                    margin: "2px",
                    boxSizing: "border-box",
                    flex: "1 0 13%",
                  },
                  caption: { marginBottom: 12, textAlign: "center" },
                  caption_label: { fontSize: 18, color: "#8B4F23", fontWeight: "bold", textTransform: "capitalize" },
                  nav_button_next: { fontSize: 24, color: "#8B4F23" },
                  nav_button_previous: { fontSize: 24, color: "#8B4F23" },
                }}
                className="max-w-full sm:max-w-[600px] mx-auto overflow-x-auto"
              />
            </div>

            {/* Horários */}
            {horariosDisponiveis.length > 0 && (
              <div className="mb-4">
                <label className="block text-xs font-semibold text-[#8B4F23] mb-2">Horário *</label>
                <select
                  className="w-full px-4 py-3 border rounded-lg text-sm"
                  value={horario}
                  onChange={e => handleHorario(e.target.value)}
                  required
                >
                  <option value="">Selecione o horário</option>
                  {horariosDisponiveis.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
                {/* Exibir vagas restantes */}
                {vagasRestantes !== null && (
                  <p className={`text-sm mt-2 ${vagasRestantes <= 0 ? "text-red-600" : "text-green-600 font-bold"}`}>
                    {vagasRestantes <= 0
                      ? "Sem vagas disponíveis para este horário."
                      : ` ${vagasRestantes} Vagas restantes`}
                  </p>
                )}
              </div>
            )}

            {/* Participantes */}
            <div className="flex flex-col md:flex-row gap-4 mb-6">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-700 mb-1">Adultos</label>
                <input type="number" min={1} max={30} className="w-full px-4 py-3 border rounded-lg text-sm" value={adultos} onChange={e => setAdultos(Number(e.target.value))} required />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-700 mb-1">Crianças (5 a 12 anos)</label>
                <input type="number" min={0} max={30} className="w-full px-4 py-3 border rounded-lg text-sm" value={criancas} onChange={e => setCriancas(Number(e.target.value))} required />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-700 mb-1">Bariátrico</label>
                <input type="number" min={0} max={30} className="w-full px-4 py-3 border rounded-lg text-sm" value={bariatrica} onChange={e => setBariatica(Number(e.target.value))} required />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-700 mb-1">Não pagante (&lt;5 anos)</label>
                <input type="number" min={0} max={30} className="w-full px-4 py-3 border rounded-lg text-sm" value={naoPagante} onChange={e => setPagante(Number(e.target.value))} required />
              </div>
            </div>

            {/* Total */}
            <div className="flex justify-between text-xs mb-2">
              <span>
                <b>Total de Pessoas:</b>{" "}
                <span className="font-semibold text-[#8B4F23]">{adultos + criancas + bariatrica + naoPagante}</span>
              </span>
              <span>
                <b>Valor Total:</b>{" "}
                <span className="font-semibold text-[#8B4F23]">R$ {total.toFixed(2)}</span>
              </span>
            </div>

            <div className="mb-6">
              <label className="block text-xs font-semibold text-[#8B4F23] mb-2">Forma de Pagamento *</label>
              <div className="flex gap-6">
                <label className="flex items-center gap-2 text-sm text-[#8B4F23]">
                  <input
                    type="radio"
                    name="formaPagamento"
                    value="CREDIT_CARD"
                    checked={formaPagamento === "CREDIT_CARD"}
                    onChange={() => setFormaPagamento("CREDIT_CARD")}
                  />
                  Cartão de Crédito
                </label>
                <label className="flex items-center gap-2 text-sm text-[#8B4F23]">
                  <input
                    type="radio"
                    name="formaPagamento"
                    value="PIX"
                    checked={formaPagamento === "PIX"}
                    onChange={() => setFormaPagamento("PIX")}
                  />
                  PIX
                </label>
              </div>
            </div>

            {/* Botão */}
            <div className="flex justify-center mt-8">
              <button
                type="submit"
                className="bg-[#8B4F23] flex items-center gap-2 text-white font-medium px-8 py-3 rounded-full shadow hover:bg-[#A05D2B] transition-all duration-300"
                disabled={loading}
              >
                <i className="fas fa-paper-plane"></i>{" "}
                {loading ? "Enviando..." : "Enviar Reserva e Pagar"}
              </button>
            </div>

            {/* Link de pagamento */}
            {checkoutUrl && (
              <div className="text-center mt-8">
                <a
                  href={checkoutUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block px-6 py-3 bg-green-600 text-white rounded-full font-semibold shadow hover:bg-green-700 transition"
                >
                  Clique aqui para concluir o pagamento
                </a>
              </div>
            )}

            {/* Exibir dados do PIX */}
            {formaPagamento === "PIX" && pixKey && qrCodeImage && (
              <div className="mt-8 p-6 bg-gray-50 rounded-lg border border-gray-200">
                <h3 className="text-xl font-bold text-[#8B4F23] mb-4">Pagamento via PIX</h3>
                <div className="flex justify-center mb-6">
                  <img
                    src={`data:image/png;base64,${qrCodeImage}`}
                    alt="QR Code para pagamento via PIX"
                    className="w-56 h-56 border-4 border-white shadow-md"
                  />
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Chave PIX (copiar e colar):
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={pixKey}
                      className="flex-1 px-3 py-2 bg-white border border-gray-300 rounded-md text-sm shadow-sm focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(pixKey || '');
                        alert('Chave PIX copiada com sucesso!');
                      }}
                      className="px-3 py-2 bg-[#8B4F23] text-white rounded-md hover:bg-[#A05D2B] transition-colors"
                    >
                      Copiar
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="font-medium text-gray-700">Valor:</p>
                    <p className="text-[#8B4F23] font-semibold">R$ {total.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="font-medium text-gray-700">Válido até:</p>
                    <p className="text-[#8B4F23] font-semibold">
                      {expirationDate ? new Date(expirationDate).toLocaleString('pt-BR') : '-'}
                    </p>
                  </div>
                </div>
                {checkoutUrl && (
                  <div className="mt-4 text-center">
                    <a
                      href={checkoutUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block px-4 py-2 text-sm text-[#8B4F23] underline hover:text-[#A05D2B]"
                    >
                      Visualizar fatura completa
                    </a>
                  </div>
                )}
                <div className="mt-6 p-3 bg-yellow-50 border-l-4 border-yellow-400 text-yellow-700">
                  <p className="text-sm">
                    <strong>Atenção:</strong> O pagamento via PIX pode levar alguns minutos para ser confirmado.
                  </p>
                </div>
              </div>
            )}
          </form>
        </div>
      </div>
    </section>
  );
}
