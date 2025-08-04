import express from "express";
import cors from "cors";
import { criarCobrancaHandler } from "../services/assas";
import "dotenv/config";
import webhookRouter from "./webhook";

const app = express();

// Permitir requisições do localhost:5173 (seu front-end)
app.use(cors());

app.use(express.json());

app.post("/criar-cobranca", criarCobrancaHandler);
app.use('/webhook', webhookRouter);

const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
  console.log("Token carregado:", process.env.ASAAS_API_KEY);

});

