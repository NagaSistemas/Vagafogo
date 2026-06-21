// Importar Firebase App e Firestore
import { initializeApp } from "firebase/app";
import { collection, getDocs, getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth"; // ADICIONE ESTA LINHA
import { getStorage } from "firebase/storage";


// Config do Firebase
const firebaseConfig = {
  apiKey: "AIzaSyBBm3tDxQvD8SmB5AIerpe-QL-IXk1N1O4",
  authDomain: "banco-vagafogo.firebaseapp.com",
  projectId: "banco-vagafogo",
  storageBucket: "banco-vagafogo.firebasestorage.app",
  messagingSenderId: "1037581590966",
  appId: "1:1037581590966:web:35195eccc16e8f3c742117"
};

// Inicializa o Firebase
const app = initializeApp(firebaseConfig);

// Instância do Firestore para usar no projeto
export const db = getFirestore(app);
export const auth = getAuth(app);  // ADICIONE ESTA LINHA
export const storage = getStorage(app);

export async function testFirebaseConnection() {
  try {
    await getDocs(collection(db, "pacotes"));
    return { success: true };
  } catch (error: any) {
    return {
      success: false,
      error: error?.message ?? String(error),
    };
  }
}

// Se precisar usar o app em outros lugares:
export { app };
