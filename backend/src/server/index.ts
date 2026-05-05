import express from "express";
import cors from "cors";
import { criarCobrancaHandler } from "../services/assas";
import "dotenv/config";
import webhookRouter from "./webhook";
import apiRouter from "./api";
import {
  iniciarLimpezaAutomaticaReservas,
  obterCamposRetencaoReservaNaAtualizacao,
} from "../services/reservaRetention";
import {
  enviarEmailManual,
  listarFilaEmailsConfirmacao,
  processarEmailsConfirmacaoPendentes,
} from "../services/emailReservas";
import {
  desconectarWhatsApp,
  enviarBoasVindasWhatsapp,
  iniciarWhatsApp,
  obterStatusWhatsApp,
} from "../services/whatsapp";

const app = express();

// Permitir requisições do localhost:5173 (seu front-end)
app.use(cors());

app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Webhook test - resposta instantânea
app.post('/webhook-test', (req, res) => {
  res.status(200).send('OK');
});

app.post("/criar-cobranca", criarCobrancaHandler);
app.use('/webhook', webhookRouter);
app.use('/api', apiRouter);

// Endpoint para testar atualização de status (apenas para debug)
app.post('/test-update-status/:reservaId', async (req, res) => {
  try {
    const { reservaId } = req.params;
    const { status } = req.body;
    
    const { doc, getDoc, updateDoc } = await import('firebase/firestore');
    const { db } = await import('../services/firebase');
    
    const reservaRef = doc(db, 'reservas', reservaId);
    const reservaSnap = await getDoc(reservaRef);
    const reservaAtual = reservaSnap.exists()
      ? (reservaSnap.data() as Record<string, any>)
      : {};
    await updateDoc(reservaRef, {
      status: status || 'pago',
      dataPagamento: new Date(),
      ...obterCamposRetencaoReservaNaAtualizacao({
        status: status || 'pago',
        confirmada: ['pago', 'confirmado'].includes(
          (status || 'pago').toString().trim().toLowerCase()
        ),
        criadoEm: reservaAtual.criadoEm,
      }),
    });
    
    res.json({ success: true, message: `Status atualizado para: ${status || 'pago'}` });
  } catch (error) {
    console.error('Erro ao atualizar status:', error);
    res.status(500).json({ error: 'Erro ao atualizar status' });
  }
});

// Endpoint para processar emails de confirmação
// Query params:
//   ?incluir_antigas=true  -> processa reservas com data anterior a hoje (cuidado!)
//   ?limite=N              -> limite de envios por execucao (default 50)
app.post('/process-emails', async (req, res) => {
  try {
    const incluirAntigas = req.query?.incluir_antigas === 'true';
    const limiteParam = Number(req.query?.limite ?? '');
    const limite = Number.isFinite(limiteParam) && limiteParam > 0 ? limiteParam : undefined;

    const resultado = await processarEmailsConfirmacaoPendentes({ incluirAntigas, limite });
    res.json({ success: true, ...resultado });
  } catch (error: any) {
    console.error('Erro ao processar emails:', error);
    res.status(500).json({ error: error?.message || 'Erro desconhecido' });
  }
});

app.get('/emails/fila', async (req, res) => {
  try {
    const limit = Number(req.query.limit ?? 200);
    const resultado = await listarFilaEmailsConfirmacao(
      Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 500) : 200,
    );
    res.json({ success: true, ...resultado });
  } catch (error: any) {
    console.error('Erro ao carregar fila de emails:', error);
    res.status(500).json({ error: error?.message || 'Erro desconhecido' });
  }
});

// Boas-vindas via WhatsApp ao marcar chegada do cliente
app.get('/whatsapp/status', (_req, res) => {
  res.json(obterStatusWhatsApp());
});

app.post('/whatsapp/start', (_req, res) => {
  iniciarWhatsApp();
  res.json(obterStatusWhatsApp());
});

app.post('/whatsapp/logout', async (_req, res) => {
  try {
    await desconectarWhatsApp();
    res.json(obterStatusWhatsApp());
  } catch (error: any) {
    console.error('Erro ao desconectar WhatsApp:', error);
    res.status(500).json({ error: error?.message || 'Erro ao desconectar WhatsApp' });
  }
});

app.post('/whatsapp/boas-vindas/:reservaId', async (req, res) => {
  try {
    const { reservaId } = req.params;
    if (!reservaId) {
      return res.status(400).json({ enviado: false, motivo: 'reserva_id_ausente' });
    }

    const { doc, getDoc, updateDoc } = await import('firebase/firestore');
    const { db } = await import('../services/firebase');

    const reservaRef = doc(db, 'reservas', reservaId);
    const reservaSnap = await getDoc(reservaRef);
    if (!reservaSnap.exists()) {
      return res.status(404).json({ enviado: false, motivo: 'reserva_nao_encontrada' });
    }

    const reserva = reservaSnap.data() as Record<string, any>;

    if (reserva.whatsappBoasVindasEnviado === true) {
      return res.json({ enviado: false, motivo: 'ja_enviado' });
    }

    const resultado = await enviarBoasVindasWhatsapp(reservaId, reserva);

    if (resultado.enviado) {
      await updateDoc(reservaRef, {
        whatsappBoasVindasEnviado: true,
        dataWhatsappBoasVindas: new Date(),
        whatsappBoasVindasMensagem: resultado.mensagem ?? '',
      });
    }

    res.json(resultado);
  } catch (error: any) {
    console.error('Erro ao enviar boas-vindas WhatsApp:', error);
    res.status(500).json({ enviado: false, motivo: error?.message || 'erro' });
  }
});

app.post('/send-email', async (req, res) => {
  try {
    const to = typeof req.body?.to === 'string' ? req.body.to.trim() : '';
    const subject = typeof req.body?.subject === 'string' ? req.body.subject.trim() : '';
    const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';

    if (!to || !subject || !message) {
      res.status(400).json({
        success: false,
        error: 'Informe destinatario, assunto e mensagem.',
      });
      return;
    }

    const resultado = await enviarEmailManual({ to, subject, message });
    if (!resultado.enviado) {
      res.status(400).json({
        success: false,
        error:
          resultado.motivo === 'MISSING_CONFIG'
            ? 'SMTP nao configurado.'
            : 'Envio de email desabilitado.',
      });
      return;
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error('Erro ao enviar email manual:', error);
    res.status(500).json({ success: false, error: error?.message || 'Erro ao enviar email' });
  }
});

// Endpoint para testar webhook
app.post('/test-webhook', (req, res) => {
  const mockWebhookData = {
    event: 'PAYMENT_CONFIRMED',
    payment: {
      id: 'test-payment-id',
      status: 'CONFIRMED',
      billingType: 'CREDIT_CARD',
      externalReference: req.body.reservaId || 'test-reserva-id'
    }
  };
  
  // Simular chamada do webhook
  fetch(`${req.protocol}://${req.get('host')}/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(mockWebhookData)
  }).then(() => {
    res.json({ success: true, message: 'Webhook de teste enviado' });
  }).catch(error => {
    res.status(500).json({ error: error.message });
  });
});

const port = process.env.PORT || 3001;
const WHATSAPP_AUTO_START = (process.env.WHATSAPP_AUTO_START ?? "true").toLowerCase() !== "false";

app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
  iniciarLimpezaAutomaticaReservas();

  if (WHATSAPP_AUTO_START) {
    console.log("[whatsapp] Inicializacao automatica habilitada.");
    iniciarWhatsApp();
  } else {
    console.log("[whatsapp] Inicializacao automatica desabilitada por WHATSAPP_AUTO_START=false.");
  }

  const asaasKey = (process.env.ASAAS_API_KEY ?? "").trim();
  const splitWalletId = (process.env.ASAAS_SPLIT_WALLET_ID ?? "").trim();
  const splitPercentual = (process.env.ASAAS_SPLIT_PERCENTUAL ?? "").trim();

  console.log("Asaas config:", {
    apiKey: asaasKey ? "SIM" : "NÃO",
    splitWalletId: splitWalletId
      ? `${splitWalletId.slice(0, 8)}...${splitWalletId.slice(-4)}`
      : "NÃO",
    splitPercentual: splitPercentual || "N/A",
  });

});
