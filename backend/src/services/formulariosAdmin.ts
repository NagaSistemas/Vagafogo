import { createHash } from "crypto";
import {
  DocumentReference,
  FieldPath,
  FieldValue,
  Firestore,
  Timestamp,
} from "firebase-admin/firestore";
import type { FormularioAdminIdentity } from "../middleware/formulariosAdminAuth";
import { FormAnswerValue, FormResponseAnswer, FormStatus } from "../types/formularios";
import {
  FormularioValidationError,
  normalizarFormularioPublico,
  normalizarVersaoSchemaArmazenada,
  stringifyCanonico,
} from "../validation/formularios";
import {
  garantirPublicIdImutavel,
  codificarCursorRespostas,
  normalizarFormularioAdminPayload,
  normalizarCursorRespostas,
  normalizarIdDocumentoFormulario,
  normalizarLimitePaginaRespostas,
  normalizarPublicIdAdministravel,
  normalizarStatusFormulario,
} from "../validation/formulariosAdmin";
import { obterFirestoreAdmin } from "./firebaseAdmin";

const FORM_COLLECTION = "formularios";
const PUBLIC_ID_REGISTRY_COLLECTION = "_formularios_public_ids";
const ADMIN_IDEMPOTENCY_COLLECTION = "_formularios_admin_idempotency";

export class FormularioAdminServiceError extends Error {
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
    this.name = "FormularioAdminServiceError";
    this.code = code;
    this.status = status;
    this.extra = extra;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const exigirFirestoreAdmin = (): Firestore => {
  const firestore = obterFirestoreAdmin();
  if (!firestore) {
    throw new FormularioAdminServiceError(
      "FIREBASE_ADMIN_UNAVAILABLE",
      "O servico administrativo de formularios esta temporariamente indisponivel.",
      503,
    );
  }
  return firestore;
};

const throwFormNotFound = (): never => {
  throw new FormularioAdminServiceError(
    "FORM_NOT_FOUND",
    "Formulario nao encontrado.",
    404,
  );
};

const throwResponseNotFound = (): never => {
  throw new FormularioAdminServiceError(
    "FORM_RESPONSE_NOT_FOUND",
    "Resposta nao encontrada.",
    404,
  );
};

const ensureNotDeleting = (data: Record<string, unknown>) => {
  if (data.deletingAt) {
    throw new FormularioAdminServiceError(
      "FORM_DELETION_IN_PROGRESS",
      "Este formulario esta sendo excluido.",
      409,
    );
  }
};

const actorPayload = (identity: FormularioAdminIdentity) => ({
  uid: identity.uid,
  ...(identity.email ? { email: identity.email } : {}),
});

export const serializarTimestampIso = (value: unknown): string | undefined => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
  }
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }
  if (isRecord(value) && typeof value.toDate === "function") {
    const date = (value.toDate as () => unknown)();
    return date instanceof Date && !Number.isNaN(date.getTime())
      ? date.toISOString()
      : undefined;
  }
  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }
  return undefined;
};

const normalizeCount = (value: unknown) => {
  const count = Number(value);
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
};

const normalizeStoredRevision = (value: unknown) => {
  if (value === undefined || value === null) return 1;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new FormularioAdminServiceError(
      "INVALID_STORED_FORM",
      "O formulario possui uma revisao invalida.",
      500,
    );
  }
  return value;
};

const digest = (value: unknown) =>
  createHash("sha256").update(stringifyCanonico(value)).digest("hex");

const formCreationDigest = (form: ReturnType<typeof normalizarFormularioAdminPayload>) =>
  digest(form);

const adminIdempotencyDigest = (
  identity: FormularioAdminIdentity,
  idempotencyKey: string,
) =>
  createHash("sha256")
    .update("admin-form-create:v1\0")
    .update(identity.uid)
    .update("\0")
    .update(idempotencyKey)
    .digest("hex");

const derivedPublicId = (idempotencyHash: string) => `frm_${idempotencyHash.slice(0, 32)}`;

const schemaChanged = (
  currentFields: unknown,
  nextFields: unknown,
) => stringifyCanonico(currentFields) !== stringifyCanonico(nextFields);

export const calcularVersaoSchemaSeguinte = (
  currentFields: unknown,
  nextFields: unknown,
  currentSchemaVersion: number,
) => schemaChanged(currentFields, nextFields)
  ? currentSchemaVersion + 1
  : currentSchemaVersion;

const assertExpectedRevision = (expected: number, current: number) => {
  if (expected !== current) {
    throw new FormularioAdminServiceError(
      "FORM_EDIT_CONFLICT",
      "O formulario foi alterado por outra sessao. Recarregue antes de salvar.",
      409,
      { currentRevision: current },
    );
  }
};

const serializeForm = (id: string, data: Record<string, unknown>) => {
  let form;
  try {
    const publicId = normalizarPublicIdAdministravel(data.publicId);
    form = normalizarFormularioPublico(data, publicId);
  } catch (error) {
    if (error instanceof FormularioValidationError) {
      throw new FormularioAdminServiceError(
        "INVALID_STORED_FORM",
        `O formulario ${id} possui uma configuracao invalida.`,
        500,
      );
    }
    throw error;
  }

  const createdAt = serializarTimestampIso(data.createdAt);
  const updatedAt = serializarTimestampIso(data.updatedAt);
  const publishedAt = serializarTimestampIso(data.publishedAt);
  const lastResponseAt = serializarTimestampIso(data.lastResponseAt);

  return {
    id,
    ...form,
    revision: normalizeStoredRevision(data.revision),
    responseCount: normalizeCount(data.responseCount),
    ...(createdAt ? { createdAt } : {}),
    ...(updatedAt ? { updatedAt } : {}),
    ...(publishedAt ? { publishedAt } : {}),
    ...(lastResponseAt ? { lastResponseAt } : {}),
  };
};

const isAnswerValue = (value: unknown): value is FormAnswerValue =>
  typeof value === "string" ||
  typeof value === "number" ||
  typeof value === "boolean" ||
  (Array.isArray(value) && value.every((item) => typeof item === "string"));

const sanitizeAnswers = (value: unknown): Record<string, FormAnswerValue> => {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, FormAnswerValue] =>
      isAnswerValue(entry[1]),
    ),
  );
};

const sanitizeAnswerSnapshot = (value: unknown): FormResponseAnswer[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (
      !isRecord(item) ||
      typeof item.fieldId !== "string" ||
      typeof item.label !== "string" ||
      typeof item.type !== "string" ||
      !isAnswerValue(item.value)
    ) {
      return [];
    }
    if (
      ![
        "short_text",
        "long_text",
        "email",
        "phone",
        "number",
        "date",
        "single_choice",
        "multiple_choice",
        "consent",
      ].includes(item.type)
    ) {
      return [];
    }
    return [
      {
        fieldId: item.fieldId,
        label: item.label,
        type: item.type as FormResponseAnswer["type"],
        value: item.value,
      },
    ];
  });
};

const serializeResponse = (
  id: string,
  formId: string,
  data: Record<string, unknown>,
) => {
  const submittedAt = serializarTimestampIso(data.submittedAt);
  const rawSchemaVersion = data.schemaVersion ?? data.formVersion;
  const schemaVersion =
    typeof rawSchemaVersion === "number" &&
    Number.isInteger(rawSchemaVersion) &&
    rawSchemaVersion > 0
      ? rawSchemaVersion
      : 1;
  return {
    id,
    formId,
    ...(typeof data.formPublicId === "string" ? { formPublicId: data.formPublicId } : {}),
    ...(typeof data.formTitle === "string" ? { formTitle: data.formTitle } : {}),
    answers: sanitizeAnswers(data.answers),
    answerSnapshot: sanitizeAnswerSnapshot(data.answerSnapshot),
    schemaVersion,
    ...(submittedAt ? { submittedAt } : {}),
  };
};

const formRefFrom = (firestore: Firestore, rawId: unknown) => {
  const id = normalizarIdDocumentoFormulario(rawId);
  return firestore.collection(FORM_COLLECTION).doc(id);
};

const registryRefFrom = (firestore: Firestore, publicId: string) =>
  firestore.collection(PUBLIC_ID_REGISTRY_COLLECTION).doc(publicId);

const readCreatedForm = async (ref: DocumentReference) => {
  const snapshot = await ref.get();
  if (!snapshot.exists) return throwFormNotFound();
  return serializeForm(snapshot.id, snapshot.data() as Record<string, unknown>);
};

export const listarFormulariosAdmin = async () => {
  const firestore = exigirFirestoreAdmin();
  const snapshot = await firestore.collection(FORM_COLLECTION).get();
  const forms = snapshot.docs.flatMap((document) => {
    try {
      return [serializeForm(document.id, document.data() as Record<string, unknown>)];
    } catch (error) {
      console.error(
        `[formularios-admin] Formulario legado invalido ignorado na listagem (${document.id}):`,
        error,
      );
      return [];
    }
  });
  return forms
    .sort((left, right) => {
      const leftTime = typeof left.updatedAt === "string" ? Date.parse(left.updatedAt) : 0;
      const rightTime = typeof right.updatedAt === "string" ? Date.parse(right.updatedAt) : 0;
      return rightTime - leftTime;
    });
};

export const criarFormularioAdmin = async (
  payload: unknown,
  identity: FormularioAdminIdentity,
  idempotencyKey: string,
) => {
  if (!isRecord(payload)) {
    throw new FormularioValidationError(
      "INVALID_PAYLOAD",
      "Envie os dados completos do formulario.",
      400,
    );
  }

  const idempotencyHash = adminIdempotencyDigest(identity, idempotencyKey);
  const publicId = normalizarPublicIdAdministravel(
    payload.publicId === undefined ? derivedPublicId(idempotencyHash) : payload.publicId,
  );
  const form = normalizarFormularioAdminPayload(payload, publicId);
  const requestHash = formCreationDigest(form);
  const firestore = exigirFirestoreAdmin();
  let formRef = firestore.collection(FORM_COLLECTION).doc();
  const registryRef = registryRefFrom(firestore, publicId);
  const idempotencyRef = firestore
    .collection(ADMIN_IDEMPOTENCY_COLLECTION)
    .doc(idempotencyHash);

  // Somente o fallback legado depende de query. Todas as criacoes novas sao
  // serializadas pelo registro atomico de publicId abaixo.
  const legacyExisting = await firestore
    .collection(FORM_COLLECTION)
    .where("publicId", "==", publicId)
    .limit(2)
    .get();
  if (legacyExisting.size > 1) {
    throw new FormularioAdminServiceError(
      "DUPLICATE_PUBLIC_ID",
      "Existem formularios duplicados para este publicId.",
      500,
    );
  }

  let duplicate = false;
  await firestore.runTransaction(async (transaction) => {
    const [idempotencySnapshot, registrySnapshot] = await Promise.all([
      transaction.get(idempotencyRef),
      transaction.get(registryRef),
    ]);

    const registryData = registrySnapshot.exists
      ? (registrySnapshot.data() as Record<string, unknown>)
      : undefined;
    const retiredPublicId =
      registryData?.tombstone === true || registryData?.deletedAt !== undefined;

    if (idempotencySnapshot.exists) {
      const stored = idempotencySnapshot.data() as Record<string, unknown>;
      if (stored.publicId !== publicId || stored.requestHash !== requestHash) {
        throw new FormularioAdminServiceError(
          "IDEMPOTENCY_KEY_CONFLICT",
          "Esta Idempotency-Key ja foi utilizada para outra criacao.",
          409,
        );
      }
      if (retiredPublicId) {
        throw new FormularioAdminServiceError(
          "PUBLIC_ID_RETIRED",
          "Este publicId pertence a um formulario excluido e nao pode ser reutilizado.",
          409,
        );
      }

      const storedFormId = stored.formId;
      if (
        typeof storedFormId !== "string" ||
        storedFormId.length < 1 ||
        storedFormId.length > 128 ||
        !/^[A-Za-z0-9_-]+$/.test(storedFormId)
      ) {
        throw new FormularioAdminServiceError(
          "INVALID_IDEMPOTENCY_RECORD",
          "O registro de idempotencia da criacao e invalido.",
          500,
        );
      }

      const storedFormRef = firestore.collection(FORM_COLLECTION).doc(storedFormId);
      const storedFormSnapshot = await transaction.get(storedFormRef);
      if (!storedFormSnapshot.exists) {
        throw new FormularioAdminServiceError(
          "PUBLIC_ID_RETIRED",
          "O formulario desta criacao ja foi excluido e seu publicId nao pode ser reutilizado.",
          409,
        );
      }
      if ((storedFormSnapshot.data() as Record<string, unknown>).publicId !== publicId) {
        throw new FormularioAdminServiceError(
          "INVALID_IDEMPOTENCY_RECORD",
          "O registro de idempotencia da criacao e inconsistente.",
          500,
        );
      }

      formRef = storedFormRef;
      duplicate = true;
      if (!registrySnapshot.exists) {
        transaction.create(registryRef, {
          formId: storedFormId,
          createdAt: FieldValue.serverTimestamp(),
          createRequestHash: requestHash,
          createIdempotencyHash: idempotencyHash,
        });
      } else if (registryData?.formId !== storedFormId) {
        throw new FormularioAdminServiceError(
          "PUBLIC_ID_ALREADY_EXISTS",
          "O publicId esta associado a outro formulario.",
          409,
        );
      }
      return;
    }

    if (registrySnapshot.exists) {
      throw new FormularioAdminServiceError(
        retiredPublicId ? "PUBLIC_ID_RETIRED" : "PUBLIC_ID_ALREADY_EXISTS",
        retiredPublicId
          ? "Este publicId pertence a um formulario excluido e nao pode ser reutilizado."
          : "Ja existe um formulario com este publicId.",
        409,
      );
    }
    if (!legacyExisting.empty) {
      throw new FormularioAdminServiceError(
        "PUBLIC_ID_ALREADY_EXISTS",
        "Ja existe um formulario legado com este publicId.",
        409,
      );
    }

    const now = FieldValue.serverTimestamp();
    transaction.create(formRef, {
      ...form,
      schemaVersion: 1,
      revision: 1,
      responseCount: 0,
      createdAt: now,
      updatedAt: now,
      ...(form.status === "published" ? { publishedAt: now } : {}),
      createdBy: actorPayload(identity),
      updatedBy: actorPayload(identity),
    });
    transaction.create(registryRef, {
      formId: formRef.id,
      createdAt: now,
      createRequestHash: requestHash,
      createIdempotencyHash: idempotencyHash,
    });
    transaction.create(idempotencyRef, {
      formId: formRef.id,
      publicId,
      requestHash,
      createdAt: now,
    });
  });

  return { form: await readCreatedForm(formRef), duplicate };
};

export const atualizarFormularioAdmin = async (
  rawId: unknown,
  payload: unknown,
  identity: FormularioAdminIdentity,
  expectedRevision: number,
) => {
  const firestore = exigirFirestoreAdmin();
  const formRef = formRefFrom(firestore, rawId);

  await firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(formRef);
    if (!snapshot.exists) return throwFormNotFound();
    const current = snapshot.data() as Record<string, unknown>;
    ensureNotDeleting(current);
    const currentRevision = normalizeStoredRevision(current.revision);
    assertExpectedRevision(expectedRevision, currentRevision);

    const publicId = normalizarPublicIdAdministravel(current.publicId);
    garantirPublicIdImutavel(payload, publicId);
    const form = normalizarFormularioAdminPayload(payload, publicId);
    const currentForm = normalizarFormularioPublico(current, publicId);
    const nextSchemaVersion = calcularVersaoSchemaSeguinte(
      currentForm.fields,
      form.fields,
      currentForm.schemaVersion,
    );
    const registryRef = registryRefFrom(firestore, publicId);
    const registrySnapshot = await transaction.get(registryRef);
    if (
      registrySnapshot.exists &&
      (registrySnapshot.data() as Record<string, unknown>).formId !== formRef.id
    ) {
      throw new FormularioAdminServiceError(
        "PUBLIC_ID_ALREADY_EXISTS",
        "O publicId deste formulario esta associado a outro registro.",
        409,
      );
    }
    if (
      registrySnapshot.exists &&
      ((registrySnapshot.data() as Record<string, unknown>).tombstone === true ||
        (registrySnapshot.data() as Record<string, unknown>).deletedAt)
    ) {
      throw new FormularioAdminServiceError(
        "PUBLIC_ID_RETIRED",
        "O publicId deste formulario esta marcado como excluido.",
        409,
      );
    }

    const previousStatus = current.status;
    const now = FieldValue.serverTimestamp();
    transaction.update(formRef, {
      title: form.title,
      description: form.description,
      status: form.status,
      fields: form.fields,
      confirmationTitle: form.confirmationTitle,
      confirmationMessage: form.confirmationMessage,
      privacyMessage: form.privacyMessage,
      submitButtonLabel: form.submitButtonLabel,
      schemaVersion: nextSchemaVersion,
      revision: currentRevision + 1,
      updatedAt: now,
      updatedBy: actorPayload(identity),
      ...(form.status === "published" && previousStatus !== "published"
        ? { publishedAt: now }
        : {}),
    });
    if (!registrySnapshot.exists) {
      transaction.create(registryRef, { formId: formRef.id, createdAt: now });
    }
  });

  return readCreatedForm(formRef);
};

export const atualizarStatusFormularioAdmin = async (
  rawId: unknown,
  rawStatus: unknown,
  identity: FormularioAdminIdentity,
  expectedRevision: number,
) => {
  const status = normalizarStatusFormulario(rawStatus);
  const firestore = exigirFirestoreAdmin();
  const formRef = formRefFrom(firestore, rawId);

  await firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(formRef);
    if (!snapshot.exists) return throwFormNotFound();
    const current = snapshot.data() as Record<string, unknown>;
    ensureNotDeleting(current);
    const currentRevision = normalizeStoredRevision(current.revision);
    const currentSchemaVersion = normalizarVersaoSchemaArmazenada(
      current.schemaVersion ?? current.formVersion,
    );
    assertExpectedRevision(expectedRevision, currentRevision);

    if (status === "published") {
      // Reutiliza a validacao completa para impedir que um rascunho incompleto
      // seja publicado apenas pela rota de status.
      const publicId = normalizarPublicIdAdministravel(current.publicId);
      const currentForm = normalizarFormularioPublico(current, publicId);
      normalizarFormularioAdminPayload({ ...currentForm, status }, publicId);
    }

    const now = FieldValue.serverTimestamp();
    transaction.update(formRef, {
      status,
      schemaVersion: currentSchemaVersion,
      revision: currentRevision + 1,
      updatedAt: now,
      updatedBy: actorPayload(identity),
      ...(status === "published" && current.status !== "published"
        ? { publishedAt: now }
        : {}),
    });
  });

  return readCreatedForm(formRef);
};

const cursorPositionFromResponseDocument = (
  document: { id: string; data(): Record<string, unknown> },
  formId: string,
) => {
  const submittedAt = document.data().submittedAt;
  if (
    !(submittedAt instanceof Timestamp) ||
    document.id.length < 1 ||
    document.id.length > 128 ||
    !/^[A-Za-z0-9_-]+$/.test(document.id)
  ) {
    throw new FormularioAdminServiceError(
      "INVALID_STORED_RESPONSE",
      "Uma resposta armazenada possui dados de paginacao invalidos.",
      500,
    );
  }
  return {
    formId,
    responseId: document.id,
    seconds: submittedAt.seconds,
    nanoseconds: submittedAt.nanoseconds,
  };
};

export const listarRespostasFormularioAdmin = async (
  rawId: unknown,
  rawLimit?: unknown,
  rawCursor?: unknown,
) => {
  const firestore = exigirFirestoreAdmin();
  const formRef = formRefFrom(firestore, rawId);
  const limit = normalizarLimitePaginaRespostas(rawLimit);
  const cursor = normalizarCursorRespostas(rawCursor, formRef.id);
  const formSnapshot = await formRef.get();
  if (!formSnapshot.exists) return throwFormNotFound();

  const orderedQuery = formRef
    .collection("respostas")
    .orderBy("submittedAt", "desc")
    .orderBy(FieldPath.documentId(), "desc");
  const pageQuery = cursor
    ? orderedQuery.startAfter(
        new Timestamp(cursor.seconds, cursor.nanoseconds),
        cursor.responseId,
      )
    : orderedQuery;
  const snapshot = await pageQuery.limit(limit + 1).get();
  const positions = snapshot.docs.map((document) =>
    cursorPositionFromResponseDocument(document, formRef.id),
  );
  const hasNextPage = snapshot.size > limit;
  const pageDocuments = snapshot.docs.slice(0, limit);
  const items = pageDocuments.map((document) =>
      serializeResponse(
        document.id,
        formRef.id,
        document.data() as Record<string, unknown>,
      ),
    );
  const nextCursor = hasNextPage
    ? codificarCursorRespostas(positions[limit - 1])
    : null;

  return { items, nextCursor };
};

export const excluirRespostaFormularioAdmin = async (
  rawId: unknown,
  rawResponseId: unknown,
) => {
  const firestore = exigirFirestoreAdmin();
  const formRef = formRefFrom(firestore, rawId);
  const responseId = normalizarIdDocumentoFormulario(rawResponseId);
  const responseRef = formRef.collection("respostas").doc(responseId);
  const recentResponsesQuery = formRef
    .collection("respostas")
    .orderBy("submittedAt", "desc")
    .limit(2);

  await firestore.runTransaction(async (transaction) => {
    const [formSnapshot, responseSnapshot, recentResponses] = await Promise.all([
      transaction.get(formRef),
      transaction.get(responseRef),
      transaction.get(recentResponsesQuery),
    ]);
    if (!formSnapshot.exists) return throwFormNotFound();
    if (!responseSnapshot.exists) return throwResponseNotFound();

    const current = formSnapshot.data() as Record<string, unknown>;
    const nextCount = Math.max(normalizeCount(current.responseCount) - 1, 0);
    const mostRecentRemaining = recentResponses.docs.find(
      (document) => document.id !== responseId,
    );
    transaction.delete(responseRef);
    transaction.update(formRef, {
      responseCount: nextCount,
      lastResponseAt: mostRecentRemaining?.data().submittedAt ?? null,
    });
  });

  return { success: true };
};

const deleteResponseBatches = async (formRef: DocumentReference) => {
  let deleted = 0;
  while (true) {
    const snapshot = await formRef.collection("respostas").limit(400).get();
    if (snapshot.empty) return deleted;
    const batch = formRef.firestore.batch();
    snapshot.docs.forEach((document) => batch.delete(document.ref));
    await batch.commit();
    deleted += snapshot.size;
  }
};

export const excluirFormularioAdmin = async (
  rawId: unknown,
  expectedRevision: number,
  identity: FormularioAdminIdentity,
) => {
  const firestore = exigirFirestoreAdmin();
  const formRef = formRefFrom(firestore, rawId);
  let publicId = "";

  await firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(formRef);
    if (!snapshot.exists) return throwFormNotFound();
    const current = snapshot.data() as Record<string, unknown>;
    publicId = normalizarPublicIdAdministravel(current.publicId);
    const registryRef = registryRefFrom(firestore, publicId);
    const registrySnapshot = await transaction.get(registryRef);
    const currentRevision = normalizeStoredRevision(current.revision);
    assertExpectedRevision(expectedRevision, currentRevision);
    if (
      registrySnapshot.exists &&
      (registrySnapshot.data() as Record<string, unknown>).formId !== formRef.id
    ) {
      throw new FormularioAdminServiceError(
        "PUBLIC_ID_ALREADY_EXISTS",
        "O publicId deste formulario esta associado a outro registro.",
        409,
      );
    }
    transaction.update(formRef, {
      status: "closed" satisfies FormStatus,
      deletingAt: FieldValue.serverTimestamp(),
      deletingBy: actorPayload(identity),
    });
  });

  const deletedResponses = await deleteResponseBatches(formRef);
  const registryRef = registryRefFrom(firestore, publicId);

  await firestore.runTransaction(async (transaction) => {
    const [formSnapshot, registrySnapshot] = await Promise.all([
      transaction.get(formRef),
      transaction.get(registryRef),
    ]);
    if (formSnapshot.exists) transaction.delete(formRef);
    const now = FieldValue.serverTimestamp();
    if (!registrySnapshot.exists) {
      transaction.create(registryRef, {
        formId: formRef.id,
        createdAt: now,
        deletedAt: now,
        tombstone: true,
        deletedBy: actorPayload(identity),
      });
    } else if (
      (registrySnapshot.data() as Record<string, unknown>).formId === formRef.id
    ) {
      transaction.set(
        registryRef,
        { deletedAt: now, tombstone: true, deletedBy: actorPayload(identity) },
        { merge: true },
      );
    }
  });

  return { success: true, deletedResponses };
};
