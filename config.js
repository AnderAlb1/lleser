/* ============================================================
   config.js — LleSer Ltda.
   Inicialización de Firebase (SDK modular v10 vía CDN) + re-export
   de las funciones que script.js necesita, para tener un único
   punto de configuración en todo el proyecto.

   Se carga como <script type="module" src="config.js"> en index.html,
   por lo tanto usa import/export nativos de ES Modules (sin bundler).

   IMPORTANTE:
   1. Reemplaza `firebaseConfig` con las credenciales de TU proyecto
      (Firebase Console > Configuración del proyecto > Tus apps).
   2. En Firebase Console habilita:
      - Authentication > Email/Password
      - Firestore Database
      - Storage
   ============================================================ */

import {
  initializeApp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  getFirestore,
  enableIndexedDbPersistence,
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  serverTimestamp,
  Timestamp,
  runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
  deleteObject
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

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
const firebaseApp = initializeApp(firebaseConfig);

export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);
export const storage = getStorage(firebaseApp);

// Caché offline (mejora rendimiento y permite trabajar con conexión inestable)
enableIndexedDbPersistence(db).catch((err) => {
  console.warn("Persistencia offline no disponible:", err.code);
});

// -------------------- RE-EXPORTS (Firestore / Storage / Auth) --------------------
// Se re-exportan aquí para que script.js importe TODO desde config.js
// y no tenga que repetir URLs de CDN en cada módulo.
export {
  // Firestore
  collection, doc, addDoc, setDoc, updateDoc, deleteDoc,
  getDoc, getDocs, onSnapshot, query, where, orderBy, limit,
  startAfter, serverTimestamp, Timestamp, runTransaction,
  // Storage
  storageRef, uploadBytes, getDownloadURL, deleteObject,
  // Auth
  signInWithEmailAndPassword, signOut, onAuthStateChanged
};

// -------------------- COLECCIONES FIRESTORE --------------------
export const COLLECTIONS = {
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
export const ROLES = {
  ADMIN: "administrador",
  TECNICO: "tecnico"
};

// -------------------- TIPOS DE ORDEN --------------------
export const TIPOS_ORDEN = {
  PREVENTIVO: "Preventivo",
  CORRECTIVO: "Correctivo",
  DIAGNOSTICO: "Diagnóstico",
  INSTALACION: "Instalación"
};

// -------------------- CONSTANTES DE LA APP --------------------
export const APP_CONFIG = {
  nombreEmpresa: "LleSer Ltda.",
  itemsPorPagina: 15,
  maxTamanoImagenMB: 5,
  configDocId: "general",          // doc en COLLECTIONS.CONFIGURACION
  storagePathLogo: "config/logo",  // carpeta logo en Storage
  storagePathFirmas: "firmas",     // carpeta firmas técnicos en Storage
  storagePathEvidencias: "evidencias"
};

// -------------------- UTILIDAD: CONTADORES ATÓMICOS --------------------
/**
 * Genera un número consecutivo atómico (para órdenes de trabajo y
 * reportes correctivos) usando una transacción de Firestore, evitando
 * colisiones por concurrencia entre varios usuarios a la vez.
 * @param {string} nombreContador - clave del documento contador
 * @returns {Promise<number>} siguiente número consecutivo
 */
export async function obtenerSiguienteConsecutivo(nombreContador) {
  const ref = doc(db, COLLECTIONS.CONTADORES, nombreContador);
  return runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    const actual = snap.exists() ? snap.data().valor : 0;
    const siguiente = actual + 1;
    transaction.set(ref, { valor: siguiente }, { merge: true });
    return siguiente;
  });
}
