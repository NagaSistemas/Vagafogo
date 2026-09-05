import express, { Router } from "express";
import cors from "cors";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "../services/firebase";
import { reservaEstaConfirmada } from "../services/reservaStatus";
import {
  obterCamposRetencaoReservaNaAtualizacao,
  obterCamposRetencaoReservaNaCriacao,
} from "../services/reservaRetention";
import formulariosPublicosRouter from "./formulariosPublicos";
import formulariosAdminRouter from "./formulariosAdmin";

const router = Router();
router.use(cors());
router.use(express.json({ limit: "1mb" }));

const reservasRef = collection(db, "reservas");
const pacotesRef = collection(db, "pacotes");

router.use("/formularios/publico", formulariosPublicosRouter);
router.use("/formularios/admin", formulariosAdminRouter);

router.get("/reservas", async (_req, res) => {
  try {
    const statusVisiveis = [
      "pago",
      "confirmado",
      "pre_reserva",
      "aguardando",
      "pending",
      "processing",
      "processando",
    ];
    const reservasQuery = query(reservasRef, where("status", "in", statusVisiveis));
    const snapshot = await getDocs(reservasQuery);
    const reservas = snapshot.docs.map((registro) => ({
      id: registro.id,
      ...registro.data(),
    }));
    res.json(reservas);
  } catch (error: any) {
    res.status(500).json({ error: error.message ?? "Erro ao listar reservas" });
  }
});

router.get("/pacotes", async (_req, res) => {
  try {
    const snapshot = await getDocs(pacotesRef);
    const pacotes = snapshot.docs.map((registro) => ({
      id: registro.id,
      ...registro.data(),
    }));
    res.json(pacotes);
  } catch (error: any) {
    res.status(500).json({ error: error.message ?? "Erro ao listar pacotes" });
  }
});

router.post("/reservas", async (req, res) => {
  try {
    const body = (req.body ?? {}) as Record<string, any>;
    const status = typeof body.status === "string" ? body.status : "pre_reserva";
    const confirmada = reservaEstaConfirmada({
      status,
      confirmada: body.confirmada,
    });
    const {
      numero: _numero,
      cardNumber: _cardNumber,
      num: _num,
      card: _card,
      titular: _titular,
      cardHolder: _cardHolder,
      holder: _holder,
      validade: _validade,
      expiry: _expiry,
      exp: _exp,
      validity: _validity,
      cvv: _cvv,
      cvc: _cvc,
      code: _code,
      security: _security,
      creditCard: _creditCard,
      creditCardHolderInfo: _creditCardHolderInfo,
      ...safeBody
    } = body;

    const payload = {
      ...safeBody,
      status,
      confirmada,
      ...obterCamposRetencaoReservaNaCriacao({
        status,
        confirmada,
      }),
    };
    const novo = await addDoc(reservasRef, payload);
    res.json({ id: novo.id, ...payload });
  } catch (error: any) {
    res.status(500).json({ error: error.message ?? "Erro ao criar reserva" });
  }
});

router.post("/pacotes", async (req, res) => {
  try {
    const novo = await addDoc(pacotesRef, req.body);
    res.json({ id: novo.id, ...req.body });
  } catch (error: any) {
    res.status(500).json({ error: error.message ?? "Erro ao criar pacote" });
  }
});

router.put("/reservas/:id", async (req, res) => {
  try {
    const ref = doc(reservasRef, req.params.id);
    const snapshot = await getDoc(ref);
    const atual = snapshot.exists()
      ? (snapshot.data() as Record<string, any>)
      : ({} as Record<string, any>);
    const status =
      typeof req.body?.status === "string" ? req.body.status : atual.status;
    const confirmada =
      req.body && Object.prototype.hasOwnProperty.call(req.body, "confirmada")
        ? req.body.confirmada
        : atual.confirmada;
    const payload = {
      ...req.body,
      ...obterCamposRetencaoReservaNaAtualizacao({
        status,
        confirmada,
        criadoEm: atual.criadoEm,
      }),
    };
    await updateDoc(ref, payload);
    res.json({ id: req.params.id, ...payload });
  } catch (error: any) {
    res.status(500).json({ error: error.message ?? "Erro ao atualizar reserva" });
  }
});

router.delete("/reservas/:id", async (req, res) => {
  try {
    const ref = doc(reservasRef, req.params.id);
    await deleteDoc(ref);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message ?? "Erro ao remover reserva" });
  }
});

export default router;
