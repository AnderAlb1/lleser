/**
 * ============================================
 * LleSer Ltda. - Configuración Firebase
 * ============================================
 * 
 * INSTRUCCIONES:
 * 1. Ve a https://console.firebase.google.com
 * 2. Crea un nuevo proyecto (o usa uno existente)
 * 3. Habilita Authentication > Email/Password
 * 4. Crea una base de datos Firestore
 * 5. Copia la configuración de Project Settings > General > Your apps > Web app
 * 6. Pega los valores aquí
 */


const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCWdkmnT5CmQJTlSsB3rsP04mViiFDFusQ",
  authDomain: "lleser.firebaseapp.com",
  databaseURL: "https://lleser-default-rtdb.firebaseio.com",
  projectId: "lleser",
  storageBucket: "lleser.firebasestorage.app",
  messagingSenderId: "112125305944",
  appId: "1:112125305944:web:0d1cfbb93e863412d3562d",
  measurementId: "G-190JLPQDME"
};
firebase.initializeApp(FIREBASE_CONFIG);
/* ============================================
   Configuración general de la aplicación
   ============================================ */
const APP_CONFIG = {
    nombreEmpresa: "LleSer Ltda.",
    itemsPorPagina: 20,
    maxFotosEvidencia: 4,
    maxTamannoFoto: 800, // px de ancho máximo para compresión    calidadFoto: 0.6,
    estadosEquipo: ["Operativo", "En mantenimiento", "Fuera de servicio"],
    tiposOrden: ["Preventivo", "Correctivo", "Diagnóstico", "Instalación"],
    estadosOrden: ["Pendiente", "En proceso", "Completada"]
};
