import { App, cert, getApps, initializeApp } from "firebase-admin/app";
import { Auth, getAuth } from "firebase-admin/auth";
import { Firestore, getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

let adminApp: App | null = null;
let adminFirestore: Firestore | null = null;
let adminAuth: Auth | null = null;
let adminInitAttempted = false;

const STORAGE_BUCKET =
  process.env.FIREBASE_STORAGE_BUCKET?.trim() || "banco-vagafogo.firebasestorage.app";

const lerServiceAccount = () => {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT?.trim();
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    return {
      ...parsed,
      private_key:
        typeof parsed.private_key === "string"
          ? parsed.private_key.replace(/\\n/g, "\n")
          : parsed.private_key,
    };
  } catch (error) {
    console.error("[firebase-admin] FIREBASE_SERVICE_ACCOUNT invalido:", error);
    return null;
  }
};

const inicializarAdminApp = () => {
  if (adminApp) {
    return adminApp;
  }
  if (adminInitAttempted) {
    return null;
  }

  adminInitAttempted = true;
  const serviceAccount = lerServiceAccount();
  if (!serviceAccount) {
    console.warn(
      "[firebase-admin] FIREBASE_SERVICE_ACCOUNT ausente. Rotinas retroativas de limpeza ficarao desabilitadas."
    );
    return null;
  }

  try {
    adminApp =
      getApps()[0] ??
      initializeApp({
        credential: cert(serviceAccount),
        storageBucket: STORAGE_BUCKET,
      });
    return adminApp;
  } catch (error) {
    console.error("[firebase-admin] Nao foi possivel inicializar o Admin SDK:", error);
    adminApp = null;
    return null;
  }
};

export const obterFirestoreAdmin = () => {
  if (adminFirestore) {
    return adminFirestore;
  }

  const app = inicializarAdminApp();
  if (!app) {
    return null;
  }

  adminFirestore = getFirestore(app);
  return adminFirestore;
};

export const obterAuthAdmin = () => {
  if (adminAuth) {
    return adminAuth;
  }

  const app = inicializarAdminApp();
  if (!app) {
    return null;
  }

  adminAuth = getAuth(app);
  return adminAuth;
};

export const obterStorageBucketAdmin = () => {
  const app = inicializarAdminApp();
  if (!app) {
    console.warn("[firebase-admin] obterStorageBucketAdmin: admin app nao inicializado (FIREBASE_SERVICE_ACCOUNT ausente?)");
    return null;
  }
  try {
    const bucket = getStorage(app).bucket();
    console.log(`[firebase-admin] Storage bucket obtido: ${bucket.name}`);
    return bucket;
  } catch (error) {
    console.error("[firebase-admin] Falha ao obter bucket de Storage:", error);
    return null;
  }
};
