// Inicialización Oficial y Tolerante a Fallos de la SDK de Firebase para Dispositivos Móviles
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

// Credenciales leídas desde el entorno de compilación de Vite (.env)
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || ""
};

let db = null;
let useRealFirebase = false;

// VALIDACIÓN BLINDADA: Previene que la SDK lance un error fatal síncrono en Capacitor si no hay claves
const esClaveInvalida = (val) => {
  if (!val) return true;
  const s = val.toLowerCase().trim();
  return (
    s === "" ||
    s.includes("pega_aquí_tu_api_key") ||
    s.includes("tu_api_key_aqui") ||
    s.includes("tu_project_id_aqui") ||
    s.includes("tu_app_id_aqui") ||
    s.includes("tu_proyecto")
  );
};

const esConfigValida = 
  !esClaveInvalida(firebaseConfig.apiKey) && 
  !esClaveInvalida(firebaseConfig.projectId) && 
  firebaseConfig.apiKey.length > 10;

if (esConfigValida) {
  try {
    let appInstance;
    // Inicializar singleton de Firebase
    if (getApps().length === 0) {
      appInstance = initializeApp(firebaseConfig);
    } else {
      appInstance = getApp();
    }
    db = getFirestore(appInstance);
    useRealFirebase = true;
    console.log("Firebase SDK: Sincronización activa en la nube.");
  } catch (error) {
    console.error("Firebase SDK: Falla crítica de conexión, activando persistencia de contingencia local.", error);
    db = null;
    useRealFirebase = false;
  }
} else {
  console.log("Firebase SDK: Modo Desconectado (Offline). Usando base de datos local LocalStorage (Tolerancia a fallos en piso de planta).");
  db = null;
  useRealFirebase = false;
}

export { db, useRealFirebase };
export default db;
