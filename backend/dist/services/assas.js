"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.criarCobrancaHandler = criarCobrancaHandler;
const reservas_1 = require("./reservas");
const firestore_1 = require("firebase/firestore");
const firebase_1 = require("./firebase");
async function criarCobrancaHandler(req, res) {
    const { nome, email, valor, cpf, telefone, atividade, data, horario, participantes, adultos, bariatrica, criancas, naoPagante, billingType, } = req.body;
    console.log("📥 Dados recebidos:", req.body);
    const horarioFormatado = horario?.toString().trim();
    if (!nome ||
        !email ||
        !valor ||
        !cpf ||
        !telefone ||
        !atividade ||
        !data ||
        !horarioFormatado ||
        !participantes ||
        !billingType) {
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
        const reservasQuery = (0, firestore_1.query)((0, firestore_1.collection)(firebase_1.db, "reservas"), (0, firestore_1.where)("Data", "==", data), (0, firestore_1.where)("Horario", "==", horarioFormatado));
        const snapshot = await (0, firestore_1.getDocs)(reservasQuery);
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
        const reservaId = await (0, reservas_1.criarReserva)({
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
        const customerSearch = await fetch(`https://api.asaas.com/v3/customers?cpfCnpj=${cpf}`, {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
                access_token: process.env.ASAAS_API_KEY,
            },
        });
        const customerSearchData = await customerSearch.json();
        let customerId = null;
        if (customerSearchData?.data?.length > 0) {
            customerId = customerSearchData.data[0].id;
            console.log("🔁 Cliente encontrado:", customerId);
        }
        else {
            // 👤 Criar novo cliente
            const customerCreate = await fetch("https://api.asaas.com/v3/customers", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    access_token: process.env.ASAAS_API_KEY,
                },
                body: JSON.stringify({
                    name: nome,
                    email,
                    cpfCnpj: cpf,
                    phone: telefone,
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
                access_token: process.env.ASAAS_API_KEY,
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
    }
    catch (error) {
        console.error("🔥 Erro inesperado ao criar cobrança:", error?.response?.data || error?.message || error);
        res.status(500).json({
            status: "erro",
            error: error?.response?.data || error?.message || "Erro interno ao processar a cobrança.",
        });
    }
}
