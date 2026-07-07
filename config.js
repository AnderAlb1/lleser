/* ============================================================================
   LleSer Ltda. — Sistema de gestión de mantenimientos
   config.js
   ----------------------------------------------------------------------------
   Responsabilidades de este archivo:
   1. Inicializar Firebase (App, Auth, Firestore, Storage).
   2. Definir constantes compartidas: nombres de colecciones y roles.
   3. Exponer helpers de autenticación/roles que usará script.js:
      - onAuthChange()          → suscripción al estado de sesión
      - login() / logout()
      - getUserProfile()        → trae { nombre, rol, ... } desde Firestore
      - createUserWithRole()    → permite al admin crear usuarios (admin/técnico)
        sin cerrar su propia sesión (usa una app secundaria de Firebase).

   IMPORTANTE: este archivo se importa como módulo ES desde index.html:
   <script type="module" src="config.js"></script>
   ============================================================================ */

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  createUserWithEmailAndPassword,
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-storage.js";

/* ---------------------------------------------------------------------------
   1. CONFIGURACIÓN DE FIREBASE
   ⚠️ REEMPLAZA estos valores por los de tu proyecto:
   Firebase Console → ⚙ Configuración del proyecto → Tus apps → SDK setup and configuration
--------------------------------------------------------------------------- */
const firebaseConfig = {
  apiKey: "AIzaSyCWdkmnT5CmQJTlSsB3rsP04mViiFDFusQ",
  authDomain: "lleser.firebaseapp.com",
  projectId: "lleser",
  storageBucket: "lleser.firebasestorage.app",
  messagingSenderId: "112125305944",
  appId: "1:112125305944:web:0d1cfbb93e863412d3562d",
};

/* App principal: mantiene la sesión de quien está usando la aplicación */
const app = initializeApp(firebaseConfig);

/* App secundaria: se usa SOLO para crear usuarios nuevos desde el panel de
   administración. Firebase Auth inicia sesión automáticamente como el
   usuario recién creado en la instancia donde se ejecuta createUser...,
   así que aislamos esa operación en una app aparte para no botar la sesión
   del administrador que está creando la cuenta. */
const secondaryApp =
  getApps().find((a) => a.name === "secondary") ||
  initializeApp(firebaseConfig, "secondary");

export const auth = getAuth(app);
const secondaryAuth = getAuth(secondaryApp);
export const db = getFirestore(app);
export const storage = getStorage(app);

/* ---------------------------------------------------------------------------
   2. CONSTANTES COMPARTIDAS
--------------------------------------------------------------------------- */

// Nombres de colecciones de Firestore — únicos por módulo, en un solo lugar
// para evitar strings mágicos repetidos en script.js.
export const COLLECTIONS = {
  USUARIOS: "usuarios",
  EQUIPOS: "equipos",
  ORDENES: "ordenes",
  REPORTES: "reportes",           // reportes de órdenes de trabajo asignadas
  CORRECTIVOS: "correctivos",     // reportes de mantenimiento correctivo
  TECNICOS: "tecnicos",           // ficha técnica (nombre/cargo/firma) — puede
                                   // vincularse o no a un usuario con acceso
  CONFIGURACION: "configuracion", // doc único, ej: configuracion/general (logo)
  CONTADORES: "contadores",       // consecutivos automáticos (OT y correctivos)
};

export const ROLES = {
  ADMIN: "admin",
  TECNICO: "tecnico",
};

/* ---------------------------------------------------------------------------
   3. AUTENTICACIÓN
--------------------------------------------------------------------------- */

/**
 * Suscribe un callback a los cambios de sesión.
 * El callback recibe (firebaseUser | null).
 * Devuelve la función de "unsubscribe" por si se necesita.
 */
export function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback);
}

/**
 * Inicia sesión con correo y contraseña.
 * Lanza el error de Firebase tal cual para que script.js decida el mensaje
 * a mostrar (credenciales inválidas, usuario deshabilitado, etc.).
 */
export async function login(email, password) {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return credential.user;
}

export async function logout() {
  await signOut(auth);
}

/* ---------------------------------------------------------------------------
   4. PERFILES DE USUARIO Y ROLES
   Estructura esperada en Firestore:
     usuarios/{uid} = {
       nombre: string,
       correo: string,
       rol: "admin" | "tecnico",
       activo: boolean,
       creadoEn: timestamp
     }
   El ID del documento DEBE ser el mismo UID que genera Firebase Authentication.
   Esto es lo que hace posible aplicar reglas de seguridad en Firestore del
   tipo: request.auth.uid == userId, y es también el patrón que usa
   createUserWithRole() más abajo.

   Tu usuario admin@lleser.com ya existe en Firestore: si el documento fue
   creado con un ID distinto al UID de Authentication (por ejemplo, un ID
   autogenerado o el correo como ID), getUserProfile() no lo va a encontrar.
   En ese caso lo más simple es: entrar una vez a Authentication, copiar el
   UID real de admin@lleser.com, y usarlo como ID del documento en
   usuarios/{uid} (o decirme y ajustamos la búsqueda por campo "correo").
--------------------------------------------------------------------------- */

/**
 * Trae el perfil (nombre, correo, rol, activo) del usuario autenticado.
 * Devuelve null si no existe el documento en Firestore.
 */
export async function getUserProfile(uid) {
  const ref = doc(db, COLLECTIONS.USUARIOS, uid);
  const snap = await getDoc(ref);
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/**
 * Crea un usuario nuevo (Authentication + documento de perfil en Firestore)
 * sin afectar la sesión del administrador que ejecuta la acción.
 * Solo debe llamarse desde una pantalla protegida para rol === ROLES.ADMIN.
 *
 * @param {Object} datos
 * @param {string} datos.nombre
 * @param {string} datos.correo
 * @param {string} datos.password
 * @param {"admin"|"tecnico"} datos.rol
 */
export async function createUserWithRole({ nombre, correo, password, rol }) {
  if (![ROLES.ADMIN, ROLES.TECNICO].includes(rol)) {
    throw new Error("Rol inválido. Debe ser 'admin' o 'tecnico'.");
  }

  // 1. Crear la cuenta en la instancia secundaria (no afecta la sesión activa).
  const credential = await createUserWithEmailAndPassword(secondaryAuth, correo, password);
  const newUid = credential.user.uid;

  // 2. Guardar el perfil/rol en Firestore, usando el UID como ID del documento.
  await setDoc(doc(db, COLLECTIONS.USUARIOS, newUid), {
    nombre,
    correo,
    rol,
    activo: true,
    creadoEn: serverTimestamp(),
  });

  // 3. Cerrar la sesión de la instancia secundaria para dejarla limpia
  //    para la siguiente creación de usuario.
  await signOut(secondaryAuth);

  return newUid;
}
