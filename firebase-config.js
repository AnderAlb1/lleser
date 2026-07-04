// ==========================================================================
// CONFIGURACIÓN FIREBASE
// ⚠️ Reemplaza estos valores con los de tu proyecto en Firebase Console
// (Configuración del proyecto → Tus apps → SDK de Firebase).
// Ver LEEME_CONFIGURACION.md para la guía paso a paso.
// ==========================================================================

const firebaseConfig = {
  apiKey: "AIzaSyCWdkmnT5CmQJTlSsB3rsP04mViiFDFusQ",
  authDomain: "lleser.firebaseapp.com",
  projectId: "lleser",
  storageBucket: "lleser.firebasestorage.app",
  messagingSenderId: "112125305944",
  appId: "1:112125305944:web:0d1cfbb93e863412d3562d"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();


// ⚠️ Debe coincidir EXACTO con el correo de la cuenta Administrador
// que crees manualmente en Firebase Console → Authentication → Users
const ADMIN_EMAIL = "admin@lleser.com";
