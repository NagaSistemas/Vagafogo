"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const assas_1 = require("../services/assas");
require("dotenv/config");
const webhook_1 = __importDefault(require("./webhook"));
const app = (0, express_1.default)();
// Permitir requisições do localhost:5173 (seu front-end)
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.post("/criar-cobranca", assas_1.criarCobrancaHandler);
app.use('/webhook', webhook_1.default);
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Servidor rodando na porta ${port}`);
    console.log("Token carregado:", process.env.ASAAS_API_KEY);
});
