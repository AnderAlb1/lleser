/* ============================================================================
   LleSer Ltda. — Sistema de gestión de mantenimientos
   config.js
   ----------------------------------------------------------------------------
   Usa el SDK "compat" de Firebase (API clásica firebase.*, sin módulos ES).
   Se carga con <script> normales en index.html, en este orden:
     firebase-app-compat.js → firebase-auth-compat.js →
     firebase-firestore-compat.js → firebase-storage-compat.js → config.js → script.js

   Las variables const/let declaradas aquí en el nivel superior quedan
   disponibles para script.js (los <script> clásicos comparten el mismo
   ámbito global del documento), así que NO se usa export/import.
   ============================================================================ */

/* ---------------------------------------------------------------------------
   1. CONFIGURACIÓN DE FIREBASE — proyecto "lleser"
--------------------------------------------------------------------------- */
const firebaseConfig = {
  apiKey: "AIzaSyCWdkmnT5CmQJTlSsB3rsP04mViiFDFusQ",
  authDomain: "lleser.firebaseapp.com",
  projectId: "lleser",
  storageBucket: "lleser.firebasestorage.app",
  messagingSenderId: "112125305944",
  appId: "1:112125305944:web:0d1cfbb93e863412d3562d",
};

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

/* ---------------------------------------------------------------------------
   2. CONSTANTES COMPARTIDAS
--------------------------------------------------------------------------- */
const COLLECTIONS = {
  USUARIOS: "usuarios",
  EQUIPOS: "equipos",
  ORDENES: "ordenes",
  REPORTES: "reportes",
  CORRECTIVOS: "correctivos",
  TECNICOS: "tecnicos",
  CONFIGURACION: "configuracion",
  CONTADORES: "contadores",
};

const ROLES = {
  ADMIN: "admin",
  TECNICO: "tecnico",
};

/* ---------------------------------------------------------------------------
   3. AUTENTICACIÓN
--------------------------------------------------------------------------- */

/** Suscribe un callback a los cambios de sesión: callback(firebaseUser | null). */
function onAuthChange(callback) {
  return auth.onAuthStateChanged(callback);
}

async function login(email, password) {
  const credential = await auth.signInWithEmailAndPassword(email, password);
  return credential.user;
}

async function logout() {
  await auth.signOut();
}

/* ---------------------------------------------------------------------------
   4. PERFILES DE USUARIO Y ROLES
   Estructura esperada en Firestore:
     usuarios/{uid} = { nombre, correo, rol: "admin"|"tecnico", activo, creadoEn }
   El ID del documento debe ser el mismo UID de Firebase Authentication.
--------------------------------------------------------------------------- */

async function getUserProfile(uid) {
  const snap = await db.collection(COLLECTIONS.USUARIOS).doc(uid).get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

/**
 * Crea un usuario nuevo (Authentication + documento de perfil en Firestore)
 * y restaura la sesión del administrador al terminar, porque
 * createUserWithEmailAndPassword inicia sesión automáticamente como el
 * usuario recién creado.
 */
async function createUserWithRole({ nombre, correo, password, rol }) {
  if (![ROLES.ADMIN, ROLES.TECNICO].includes(rol)) {
    throw new Error("Rol inválido. Debe ser 'admin' o 'tecnico'.");
  }

  const adminUser = auth.currentUser; // quien está creando la cuenta

  const credential = await auth.createUserWithEmailAndPassword(correo, password);
  const newUid = credential.user.uid;

  await db.collection(COLLECTIONS.USUARIOS).doc(newUid).set({
    nombre,
    correo,
    rol,
    activo: true,
    creadoEn: firebase.firestore.FieldValue.serverTimestamp(),
  });

  // Regresar la sesión activa al administrador.
  await auth.updateCurrentUser(adminUser);

  return newUid;
}
