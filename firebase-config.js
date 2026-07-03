// ==========================================================================
// CONFIGURACIÓN FIREBASE
// ⚠️ Reemplaza estos valores con los de tu proyecto en Firebase Console
// (Configuración del proyecto → Tus apps → SDK de Firebase).
// Ver LEEME_CONFIGURACION.md para la guía paso a paso.
// ==========================================================================
// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCWdkmnT5CmQJTlSsB3rsP04mViiFDFusQ",
  authDomain: "lleser.firebaseapp.com",
  projectId: "lleser",
  storageBucket: "lleser.firebasestorage.app",
  messagingSenderId: "112125305944",
  appId: "1:112125305944:web:0d1cfbb93e863412d3562d",
  measurementId: "G-190JLPQDME"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();

// ⚠️ Debe coincidir EXACTO con el correo de la cuenta Administrador
// que crees manualmente en Firebase Console → Authentication → Users
const ADMIN_EMAIL = "admin@lleser.com";
