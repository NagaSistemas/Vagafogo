// Importar Firebase App e Firestore
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth"; // ADICIONE ESTA LINHA


// Config do Firebase
const firebaseConfig = {
  apiKey: "AIzaSyBBm3tDxQvD8SmB5AIerpe-QL-IXk1N1O4",
  authDomain: "banco-vagafogo.firebaseapp.com",
  projectId: "banco-vagafogo",
  storageBucket: "banco-vagafogo.appspot.com",   // Corrigido o .com
  messagingSenderId: "1037581590966",
  appId: "1:1037581590966:web:35195eccc16e8f3c742117"
};

// Inicializa o Firebase
const app = initializeApp(firebaseConfig);

// Instância do Firestore para usar no projeto
export const db = getFirestore(app);
export const auth = getAuth(app);  // ADICIONE ESTA LINHA

// Se precisar usar o app em outros lugares:
export { app };
