import { createHash } from "crypto";
import { DocumentReference, FieldValue, Firestore } from "firebase-admin/firestore";
import { obterFirestoreAdmin } from "./firebaseAdmin";
import { FormularioPublico } from "../types/formularios";
import {
  FormularioValidationError,
  normalizarFormularioPublico,
  normalizarIdentificadorPublico,
  normalizarSchemaVersionSubmissao,
  stringifyCanonico,
  validarENormalizarRespostas,
} from "../validation/formularios";

export class FormularioPublicoServiceError extends Error {
  readonly code: string;
  readonly status: number;
  readonly extra?: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    status: number,
    extra?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "FormularioPublicoServiceError";
    this.code = code;
    this.status = status;
    this.extra = extra;
  }
}

type FormularioEncontrado = {
  ref: DocumentReference;
  data: Record<string, unknown>;
};

type RegistroRespostaResultado = {
  responseId: string;
  duplicate: boolean;
  confirmationTitle: string;
  confirmationMessage: string;
  schemaVersion: number;
};

const exigirFirestoreAdmin = (): Firestore => {
  const firestore = obterFirestoreAdmin();
  if (!firestore) {
    throw new FormularioPublicoServiceError(
      "FIREBASE_ADMIN_UNAVAILABLE",
      "O servico de formularios esta temporariamente indisponivel.",
      503,
    );
  }
  return firestore;
};

const throwFormNotFound = (): never => {
  throw new FormularioPublicoServiceError(
    "FORM_NOT_FOUND",
    "Formulario nao encontrado.",
    404,
  );
};

const localizarFormulario = async (
  firestore: Firestore,
  publicId: string,
): Promise<FormularioEncontrado> => {
  const registrySnapshot = await firestore
    .collection("_formularios_public_ids")
    .doc(publicId)
    .get();

  if (registrySnapshot.exists) {
    const registry = registrySnapshot.data() as Record<string, unknown>;
    if (registry.tombstone === true || registry.deletedAt) {
      return throwFormNotFound();
    }

    const formId = registry.formId;
    if (
      typeof formId !== "string" ||
      formId.length < 1 ||
      formId.length > 128 ||
      !/^[A-Za-z0-9_-]+$/.test(formId)
    ) {
      throw new FormularioPublicoServiceError(
        "PUBLIC_ID_REGISTRY_INVALID",
        "A configuracao do formulario e inconsistente.",
        500,
      );
    }

    const document = await firestore.collection("formularios").doc(formId).get();
    if (!document.exists) return throwFormNotFound();
    const data = document.data() as Record<string, unknown>;
    if (data.publicId !== publicId) {
      throw new FormularioPublicoServiceError(
        "PUBLIC_ID_REGISTRY_INVALID",
        "A configuracao do formulario e inconsistente.",
        500,
      );
    }
    return { ref: document.ref, data };
  }

  // Compatibilidade com formularios anteriores ao registro de publicId.
  const snapshot = await firestore
    .collection("formularios")
    .where("publicId", "==", publicId)
    .limit(2)
    .get();

  if (snapshot.empty) {
    return throwFormNotFound();
  }
  if (snapshot.size > 1) {
    throw new FormularioPublicoServiceError(
      "DUPLICATE_PUBLIC_ID",
      "A configuracao do formulario e inconsistente.",
      500,
    );
  }

  const document = snapshot.docs[0];
  return {
    ref: document.ref,
    data: document.data() as Record<string, unknown>,
  };
};

const responseDocumentId = (publicId: string, idempotencyKey: string) =>
  createHash("sha256")
    .update("form-response:v1\0")
    .update(publicId)
    .update("\0")
    .update(idempotencyKey)
    .digest("hex");

const requestDigest = (answers: unknown) =>
  createHash("sha256").update(stringifyCanonico(answers)).digest("hex");

const readConfirmationFromResponse = (
  data: Record<string, unknown>,
  requestedSchemaVersion: number,
  fallback?: FormularioPublico,
) => ({
  confirmationTitle:
    typeof data.confirmationTitle === "string" && data.confirmationTitle.trim()
      ? data.confirmationTitle
      : fallback?.confirmationTitle ?? "Resposta enviada!",
  confirmationMessage:
    typeof data.confirmationMessage === "string" && data.confirmationMessage.trim()
      ? data.confirmationMessage
      : fallback?.confirmationMessage ?? "Obrigado por responder.",
  schemaVersion:
    typeof data.schemaVersion === "number" &&
    Number.isInteger(data.schemaVersion) &&
    data.schemaVersion > 0
      ? data.schemaVersion
      : requestedSchemaVersion,
});

const validarRespostaIdempotente = (
  existingData: Record<string, unknown>,
  currentRequestHash: string,
  legacyRequestHash: string,
  requestedSchemaVersion: number,
) => {
  const isCompatibleLegacyRetry =
    requestedSchemaVersion === 1 &&
    existingData.schemaVersion === undefined &&
    existingData.requestHash === legacyRequestHash;
  if (existingData.requestHash !== currentRequestHash && !isCompatibleLegacyRetry) {
    throw new FormularioPublicoServiceError(
      "IDEMPOTENCY_KEY_CONFLICT",
      "Esta Idempotency-Key ja foi utilizada com outras respostas.",
      409,
    );
  }
};

export const obterFormularioPublico = async (rawPublicId: unknown) => {
  const publicId = normalizarIdentificadorPublico(rawPublicId);
  const firestore = exigirFirestoreAdmin();
  const found = await localizarFormulario(firestore, publicId);
  const formulario = normalizarFormularioPublico(found.data, publicId);

  if (formulario.status === "draft") {
    throw new FormularioPublicoServiceError(
      "FORM_NOT_AVAILABLE",
      "Formulario nao encontrado.",
      404,
    );
  }

  return formulario;
};

export const garantirFormularioExisteParaQr = async (rawPublicId: unknown) => {
  const publicId = normalizarIdentificadorPublico(rawPublicId);
  const firestore = exigirFirestoreAdmin();
  await localizarFormulario(firestore, publicId);
  return publicId;
};

export const registrarRespostaFormulario = async (
  rawPublicId: unknown,
  payload: unknown,
  idempotencyKey: string,
): Promise<RegistroRespostaResultado> => {
  const publicId = normalizarIdentificadorPublico(rawPublicId);
  const firestore = exigirFirestoreAdmin();
  const requestedSchemaVersion = normalizarSchemaVersionSubmissao(payload);

  if (
    typeof payload !== "object" ||
    payload === null ||
    Array.isArray(payload) ||
    !("answers" in payload)
  ) {
    throw new FormularioValidationError(
      "INVALID_PAYLOAD",
      "Envie as respostas no campo answers.",
      400,
    );
  }

  const rawAnswers = (payload as { answers: unknown }).answers;
  const legacyRequestHash = requestDigest(rawAnswers);
  const currentRequestHash = requestDigest({
    schemaVersion: requestedSchemaVersion,
    answers: rawAnswers,
  });
  const found = await localizarFormulario(firestore, publicId);
  const responseId = responseDocumentId(publicId, idempotencyKey);
  const responseRef = found.ref.collection("respostas").doc(responseId);

  return firestore.runTransaction(async (transaction) => {
    // A resposta e lida antes do formulario para que um retry legitimo continue
    // idempotente mesmo se o formulario for fechado logo apos o primeiro envio.
    const existingResponse = await transaction.get(responseRef);
    if (existingResponse.exists) {
      const existingData = existingResponse.data() as Record<string, unknown>;
      validarRespostaIdempotente(
        existingData,
        currentRequestHash,
        legacyRequestHash,
        requestedSchemaVersion,
      );
      return {
        responseId,
        duplicate: true,
        ...readConfirmationFromResponse(existingData, requestedSchemaVersion),
      };
    }

    const currentFormSnapshot = await transaction.get(found.ref);
    if (!currentFormSnapshot.exists) {
      throw new FormularioPublicoServiceError(
        "FORM_NOT_FOUND",
        "Formulario nao encontrado.",
        404,
      );
    }

    const currentFormData = currentFormSnapshot.data() as Record<string, unknown>;
    if (currentFormData.publicId !== publicId) {
      throw new FormularioPublicoServiceError(
        "FORM_NOT_FOUND",
        "Formulario nao encontrado.",
        404,
      );
    }

    const formulario = normalizarFormularioPublico(currentFormData, publicId);
    if (formulario.status !== "published") {
      throw new FormularioPublicoServiceError(
        "FORM_CLOSED",
        "Este formulario nao esta aceitando novas respostas.",
        409,
      );
    }
    if (formulario.schemaVersion !== requestedSchemaVersion) {
      throw new FormularioPublicoServiceError(
        "FORM_SCHEMA_CHANGED",
        "O formulario foi atualizado. Recarregue a pagina antes de enviar.",
        409,
        { currentSchemaVersion: formulario.schemaVersion },
      );
    }

    const normalized = validarENormalizarRespostas(formulario, payload);
    const now = FieldValue.serverTimestamp();

    transaction.create(responseRef, {
      formId: found.ref.id,
      formPublicId: publicId,
      formTitle: formulario.title,
      schemaVersion: formulario.schemaVersion,
      answers: normalized.answers,
      answerSnapshot: normalized.answerSnapshot,
      submittedAt: now,
      requestHash: currentRequestHash,
      idempotencyKeyHash: responseId,
      confirmationTitle: formulario.confirmationTitle,
      confirmationMessage: formulario.confirmationMessage,
    });
    transaction.update(found.ref, {
      responseCount: FieldValue.increment(1),
      lastResponseAt: now,
    });

    return {
      responseId,
      duplicate: false,
      confirmationTitle: formulario.confirmationTitle,
      confirmationMessage: formulario.confirmationMessage,
      schemaVersion: formulario.schemaVersion,
    };
  });
};
