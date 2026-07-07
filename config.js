/* ============================================================
   config.js — LleSer Ltda.
   Configuración e inicialización de Firebase (Firestore, Auth,
   Storage) + constantes globales de la aplicación.

   IMPORTANTE:
   1. Reemplaza el objeto firebaseConfig con las credenciales de
      TU proyecto (Firebase Console > Configuración del proyecto
      > Tus apps > SDK de configuración).
   2. Este archivo debe cargarse en index.html DESPUÉS de los
      scripts compat de Firebase y ANTES de script.js:

      <script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>
      <script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>
      <script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>
      <script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-storage-compat.js"></script>
      <script src="config.js"></script>
      <script src="script.js"></script>

   3. En Firebase Console habilita:
      - Authentication > Email/Password
      - Firestore Database (modo producción)
      - Storage
   ============================================================ */

// -------------------- CREDENCIALES FIREBASE --------------------
const firebaseConfig = {
  apiKey: "AIzaSyCWdkmnT5CmQJTlSsB3rsP04mViiFDFusQ",
  authDomain: "lleser.firebaseapp.com",
  projectId: "lleser",
  storageBucket: "lleser.firebasestorage.app",
  messagingSenderId: "112125305944",
  appId: "1:112125305944:web:0d1cfbb93e863412d3562d",
};

// -------------------- INICIALIZACIÓN --------------------
firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

// Habilita caché offline para mejorar el rendimiento
db.enablePersistence().catch((err) => {
  console.warn("Persistencia offline no disponible:", err.code);
});

// -------------------- COLECCIONES FIRESTORE --------------------
const COLLECTIONS = {
  USUARIOS: "usuarios",
  EQUIPOS: "equipos",
  ORDENES: "ordenesTrabajo",
  REPORTES_PREVENTIVOS: "reportesPreventivos",
  REPORTES_CORRECTIVOS: "reportesCorrectivos",
  TECNICOS: "tecnicos",
  CONFIGURACION: "configuracion",
  CONTADORES: "contadores"
};

// -------------------- ROLES DE USUARIO --------------------
const ROLES = {
  ADMIN: "administrador",
  TECNICO: "tecnico"
};

// -------------------- TIPOS DE ORDEN --------------------
const TIPOS_ORDEN = {
  PREVENTIVO: "Preventivo",
  CORRECTIVO: "Correctivo",
  DIAGNOSTICO: "Diagnóstico",
  INSTALACION: "Instalación"
};

// -------------------- CONSTANTES DE LA APP --------------------
const APP_CONFIG = {
  nombreEmpresa: "LleSer Ltda.",
  colorLogoLle: "#FFFFFF",
  colorLogoSer: "#1E88E5",
  itemsPorPagina: 15,
  maxTamanoImagenMB: 5,
  storagePathLogo: "config/logo",
  storagePathEvidencias: "evidencias",
  storagePathFirmas: "firmas"
};

// -------------------- UTILIDAD: CONTADORES ATÓMICOS --------------------
/**
 * Genera un número consecutivo atómico (para órdenes de trabajo
 * y reportes correctivos) usando una transacción de Firestore,
 * evitando colisiones por concurrencia.
 * @param {string} nombreContador - clave del documento contador
 * @returns {Promise<number>} siguiente número consecutivo
 */
async function obtenerSiguienteConsecutivo(nombreContador) {
  const ref = db.collection(COLLECTIONS.CONTADORES).doc(nombreContador);
  return db.runTransaction(async (transaction) => {
    const doc = await transaction.get(ref);
    const actual = doc.exists ? doc.data().valor : 0;
    const siguiente = actual + 1;
    transaction.set(ref, { valor: siguiente }, { merge: true });
    return siguiente;
  });
}
