"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.criarReserva = criarReserva;
const firebase_1 = require("./firebase");
const firestore_1 = require("firebase/firestore");
const uuid_1 = require("uuid");
async function criarReserva(payload) {
    const { nome, cpf, email, valor, telefone, atividade, data, participantes, adultos, bariatrica, criancas, naoPagante, horario, // Captura o horário do payload
    status = "aguardando", observacao = "", temPet } = payload;
    // 🔹 Gera um ID único (reservaId)
    const reservaId = (0, uuid_1.v4)();
    const reservaRef = (0, firestore_1.doc)(firebase_1.db, "reservas", reservaId);
    // 🔹 Cria o documento com ID fixo
    await (0, firestore_1.setDoc)(reservaRef, {
        nome,
        cpf,
        email,
        valor,
        telefone,
        atividade,
        data,
        participantes,
        adultos,
        bariatrica,
        criancas,
        naoPagante,
        horario, // Adiciona o horário ao documento
        status,
        observacao,
        temPet,
        criadoEm: firestore_1.Timestamp.now(),
    });
    // 🔹 Retorna o ID gerado (será usado no externalReference do Asaas)
    return reservaId;
}
