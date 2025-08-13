import type { Request, Response } from "express";
import { criarReserva } from "./reservas";
import { getDocs, collection, query, where } from "firebase/firestore";
import { db } from "./firebase";

export type CriarCobrancaPayload = {
  nome: string;
  email: string;
  valor: number;
  cpf: string;
  telefone: string;
  atividade: string;
  data: string;
  horario: string;
  participantes: number;
  adultos: number;
  bariatrica: number;
  criancas: number;
  naoPagante: number;
  billingType: "PIX" | "CREDIT_CARD";
};

export type CriarCobrancaResponse = {
  status: string;
  cobranca?: {
    id: string;
    status: string;
    invoiceUrl?: string;
  };
  error?: any;
};

export async function criarCobrancaHandler(req: Request, res: Response): Promise<void> {
  const {
    nome,
    email,
    valor,
    cpf,
    telefone,
    atividade,
    data,
    horario,
    participantes,
    adultos,
    bariatrica,
    criancas,
    naoPagante,
    billingType,
  } = req.body as CriarCobrancaPayload;

  console.log("📥 Dados recebidos:", req.body);

  const horarioFormatado = horario?.toString().trim();

  if (
    !nome ||
    !email ||
    !valor ||
    !cpf ||
    !telefone ||
    !atividade ||
    !data ||
    !horarioFormatado ||
    !participantes ||
    !billingType
  ) {
    res.status(400).json({
      status: "erro",
      error: "Dados incompletos. Todos os campos são obrigatórios.",
    });
    return;
  }

  if (!["PIX", "CREDIT_CARD"].includes(billingType)) {
    res.status(400).json({
      status: "erro",
      error: "Forma de pagamento inválida. Use 'PIX' ou 'CREDIT_CARD'.",
    });
    return;
  }

  try {
    // 🔍 Verificar disponibilidade no Firebase
    const reservasQuery = query(
      collection(db, "reservas"),
      where("Data", "==", data),
      where("Horario", "==", horarioFormatado)
    );

    const snapshot = await getDocs(reservasQuery);

    let totalReservados = 0;
    snapshot.forEach((doc) => {
      const dados = doc.data();
      totalReservados += dados.Participantes || 0;
    });

    if (totalReservados + participantes > 30) {
      res.status(400).json({
        status: "erro",
        error: "Limite de 30 pessoas por horário atingido. Escolha outro horário.",
      });
      return;
    }

    // ✅ Criar reserva no Firebase
    const reservaId = await criarReserva({
      nome,
      cpf,
      email,
      telefone,
      atividade,
      valor,
      data,
      participantes,
      adultos,
      bariatrica,
      criancas,
      naoPagante,
      observacao: "",
      horario: horarioFormatado,
      status: "aguardando",
    });

    const dataHoje = new Date().toISOString().split("T")[0];

    // 🔍 Verificar se o cliente já existe no Asaas (pelo CPF)
    const customerSearch = await fetch(
      `https://api.asaas.com/v3/customers?cpfCnpj=${cpf}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          access_token: process.env.ASAAS_API_KEY!,
        },
      }
    );

    const customerSearchData = await customerSearch.json();
    let customerId: string | null = null;

    if (customerSearchData?.data?.length > 0) {
      customerId = customerSearchData.data[0].id;
      console.log("🔁 Cliente encontrado:", customerId);
    } else {
      // 👤 Criar novo cliente
      const customerCreate = await fetch("https://api.asaas.com/v3/customers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          access_token: process.env.ASAAS_API_KEY!,
        },
        body: JSON.stringify({
          name: nome,
          email,
          cpfCnpj: cpf,
          phone: telefone,
          notificationDisabled: true, // 👈 DESATIVA TUDO
        }),
      });

      const customerData = await customerCreate.json();

      if (!customerCreate.ok) {
        console.error("❌ Erro ao criar cliente no Asaas:", customerData);
        res.status(400).json({ status: "erro", erro: customerData });
        return;
      }

      customerId = customerData.id;
      console.log("🆕 Cliente criado:", customerId);
    }

    // 💰 Criar pagamento com o customer correto
    const paymentResponse = await fetch("https://api.asaas.com/v3/payments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        accept: "application/json",
        access_token: process.env.ASAAS_API_KEY!,
      },
      body: JSON.stringify({
        billingType,
        customer: customerId,
        value: valor,
        dueDate: dataHoje,
        description: `Cobrança de ${nome}`,
        externalReference: reservaId,
      }),
    });

    const cobrancaData = await paymentResponse.json();

    if (!paymentResponse.ok) {
      console.error("❌ Erro ao criar cobrança:", cobrancaData);
      res.status(400).json({ status: "erro", erro: cobrancaData });
      return;
    }

    // ✅ Resposta de sucesso
    res.status(200).json({
      status: "ok",
      cobranca: {
        id: cobrancaData.id,
        status: cobrancaData.status,
        invoiceUrl: cobrancaData.invoiceUrl,
      },
    });
  } catch (error) {
    console.error("🔥 Erro inesperado ao criar cobrança:", error);
    res.status(500).json({
      status: "erro",
      error: "Erro interno ao processar a cobrança.",
    });
  }
}
