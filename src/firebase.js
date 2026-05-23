// Inicialización Oficial de la SDK de Firebase para el Proyecto SmartAssign
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

// Lee las credenciales del archivo .env cargado por Vite
// Si no están configuradas, utiliza valores por defecto para permitir compilación
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyFakeKeyForCompilatonOnly",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "smartassign-planta.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "smartassign-planta",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "smartassign-planta.appspot.com",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "1234567890",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:1234567890:web:1234567890"
};

// Inicializar la app de Firebase
const app = initializeApp(firebaseConfig);

// Inicializar y exportar Firestore (El Cerebro en tiempo real)
export const db = getFirestore(app);
