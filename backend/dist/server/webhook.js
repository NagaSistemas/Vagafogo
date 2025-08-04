"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const firebase_1 = require("../services/firebase");
const firestore_1 = require("firebase/firestore");
const emailService_1 = require("../services/emailService");
const router = (0, express_1.Router)();
router.post('/', async (req, res) => {
    const data = req.body;
    console.log("📩 Webhook recebido:", JSON.stringify(data, null, 2));
    const evento = data.event;
    const pagamento = data.payment;
    const metodo = pagamento?.billingType;
    const status = pagamento?.status;
    const externalId = pagamento?.externalReference;
    const isCartaoPago = evento === 'PAYMENT_CONFIRMED' && status === 'CONFIRMED';
    const isPixPago = evento === 'PAYMENT_RECEIVED' && metodo === 'PIX' && status === 'RECEIVED';
    if (!isCartaoPago && !isPixPago) {
        console.log("⏭️ Evento ignorado:", evento, "| Status:", status, "| Método:", metodo);
        return res.sendStatus(204); // Ignora eventos não relacionados a pagamento confirmado
    }
    if (!externalId) {
        console.warn("⚠️ externalReference ausente no webhook.");
        return res.status(400).send('externalReference ausente');
    }
    try {
        console.log(`🔄 Atualizando reserva com ID: ${externalId}`);
        const reservaRef = (0, firestore_1.doc)(firebase_1.db, 'reservas', externalId);
        await (0, firestore_1.updateDoc)(reservaRef, {
            status: 'pago',
            dataPagamento: new Date()
        });
        const reservaSnap = await (0, firestore_1.getDoc)(reservaRef);
        if (!reservaSnap.exists()) {
            console.warn(`⚠️ Reserva ${externalId} não encontrada para envio de e-mail`);
            return res.sendStatus(404);
        }
        const reserva = reservaSnap.data();
        await (0, emailService_1.enviarEmailConfirmacao)({
            nome: reserva.nome,
            email: reserva.email,
            atividade: reserva.atividade,
            data: reserva.data,
            horario: reserva.horario,
            participantes: reserva.participantes,
        });
        console.log(`✅ E-mail de confirmação enviado para: ${reserva.email}`);
        res.sendStatus(200);
    }
    catch (error) {
        console.error('❌ Erro ao atualizar reserva ou enviar e-mail:', error);
        res.status(500).send('Erro ao processar o webhook');
    }
});
exports.default = router;
