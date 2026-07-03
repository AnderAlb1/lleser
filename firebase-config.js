// ==========================================================================
// CONFIGURACIÓN FIREBASE
// ⚠️ Reemplaza estos valores con los de tu proyecto en Firebase Console
// (Configuración del proyecto → Tus apps → SDK de Firebase).
// Ver LEEME_CONFIGURACION.md para la guía paso a paso.
// ==========================================================================

const firebaseConfig = {
  apiKey: "TU_API_KEY",
  authDomain: "TU_PROYECTO.firebaseapp.com",
  projectId: "TU_PROYECTO",
  storageBucket: "TU_PROYECTO.appspot.com",
  messagingSenderId: "TU_SENDER_ID",
  appId: "TU_APP_ID"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();

// ⚠️ Debe coincidir EXACTO con el correo de la cuenta Administrador
// que crees manualmente en Firebase Console → Authentication → Users
const ADMIN_EMAIL = "admin@lleser.com";
