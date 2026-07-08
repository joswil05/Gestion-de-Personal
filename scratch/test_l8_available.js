import "./loadEnv.js";
import { initializeApp, getApp, getApps } from "firebase/app";
import { getFirestore, doc, getDoc, getDocs, collection } from "firebase/firestore";
import { canWorkerOccupiedSlot } from "../src/services/firebaseService.js";

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);

async function inspectL8() {
  const slotId = "SLOT_L4_004"; // Lampara 1
  const slotDoc = await getDoc(doc(db, "puestos", slotId));
  const slot = { id: slotDoc.id, ...slotDoc.data() };

  console.log("Puesto a evaluar:", slot.puestoName, "ID:", slot.id, "Sexo Preferente:", slot.sexoPreferente);

  const workersSnap = await getDocs(collection(db, "trabajadores"));
  const workers = [];
  workersSnap.forEach(d => {
    workers.push({ id: d.id, ...d.data() });
  });

  console.log("Total trabajadores en Firestore:", workers.length);

  const l8Available = workers.filter(w => 
    (w.status === "DISPONIBLE_BOLSON" || w.status === "POOL_ARRANQUE") && 
    w.currentSlotId == null
  );

  console.log("Trabajadores detectados como L8 Disponibles:", l8Available.length);
  
  const compatibles = [];
  l8Available.forEach(w => {
    const isCompatible = canWorkerOccupiedSlot(w, slot);
    if (isCompatible) {
      compatibles.push(w);
    }
  });

  console.log("Trabajadores L8 Disponibles compatibles:", compatibles.length);
  if (compatibles.length > 0) {
    console.log("Primeros 5 compatibles:");
    compatibles.slice(0, 5).forEach(c => {
      console.log(`  - ID: ${c.id}, Nombre: ${c.name}, Sexo: ${c.sexo}, Status: ${c.status}, currentSlotId: ${c.currentSlotId}`);
    });
  } else {
    console.log("No se encontraron compatibles en L8.");
    console.log("Ejemplos de trabajadores en L8:");
    l8Available.slice(0, 10).forEach(w => {
      console.log(`  - ID: ${w.id}, Nombre: ${w.name}, Sexo: ${w.sexo}, Status: ${w.status}, currentSlotId: ${w.currentSlotId}`);
    });
  }
}

inspectL8().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
