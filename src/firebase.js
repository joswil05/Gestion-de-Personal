// Inicialización Oficial y Tolerante a Fallos de la SDK de Firebase
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

// Credenciales leídas del .env o valores falsos por defecto
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || ""
};

let app = null;
let db = null;
let useRealFirebase = false;

// Validar que las credenciales de Firebase tengan un formato real antes de inicializar
// Esto evita que la SDK de Firebase lance un error fatal síncrono al importar el módulo
const esConfigValida = 
  firebaseConfig.apiKey && 
  firebaseConfig.apiKey.length > 10 && 
  firebaseConfig.projectId && 
  !firebaseConfig.apiKey.includes("tu_api_key_aqui");

if (esConfigValida) {
  try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    useRealFirebase = true;
    console.log("Firebase SDK: Inicializado de forma exitosa en la nube.");
  } catch (error) {
    console.error("Firebase SDK: Error fatal de inicialización, activando Adaptador LocalStorage de respaldo.", error);
    db = null;
    useRealFirebase = false;
  }
} else {
  console.log("Firebase SDK: Sin credenciales reales configuradas en el archivo .env. Activando Adaptador LocalStorage de respaldo de forma automática.");
  db = null;
  useRealFirebase = false;
}

export { db, useRealFirebase };
export default db;
