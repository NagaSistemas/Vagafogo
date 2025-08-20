"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = exports.db = void 0;
// Importar Firebase App e Firestore
const app_1 = require("firebase/app");
const firestore_1 = require("firebase/firestore");
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
const app = (0, app_1.initializeApp)(firebaseConfig);
exports.app = app;
// Instância do Firestore para usar no projeto
exports.db = (0, firestore_1.getFirestore)(app);
