import { initializeApp } from "firebase/app";
import { getFirestore, getDocs, collection } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDpWDghWDwzvxwqC_rsMpyg9R4cVu9N6FU",
  authDomain: "gestion-de-personal-9041a.firebaseapp.com",
  projectId: "gestion-de-personal-9041a",
  storageBucket: "gestion-de-personal-9041a.firebasestorage.app",
  messagingSenderId: "961928077384",
  appId: "1:961928077384:web:f2258c0cbb6cd0b35e387d"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function inspect() {
  console.log("--- TRABAJADORES DISPONIBLES EN FIRESTORE ---");
  const snap = await getDocs(collection(db, "trabajadores"));
  const workers = [];
  snap.forEach(d => workers.push({ id: d.id, ...d.data() }));

  const available = workers.filter(w => 
    (w.status === "POOL_ARRANQUE" || w.status === "DISPONIBLE_BOLSON") &&
    w.currentSlotId == null
  );

  console.log(`Total trabajadores disponibles (POOL_ARRANQUE o DISPONIBLE_BOLSON, sin slot): ${available.length}`);
  available.slice(0, 15).forEach(w => {
    console.log(`- ID: ${w.id} | Nombre: ${w.name} | Rol: ${w.role} | Status: ${w.status} | LineaLocation: ${w.physicalLineLocation}`);
  });

  console.log("\n--- TRABAJADORES ASIGNADOS (ASIGNADO) ---");
  const assigned = workers.filter(w => w.status === "ASIGNADO");
  console.log(`Total trabajadores asignados: ${assigned.length}`);
  assigned.slice(0, 5).forEach(w => {
    console.log(`- ID: ${w.id} | Nombre: ${w.name} | Rol: ${w.role} | Slot: ${w.currentSlotId} | LineaLocation: ${w.physicalLineLocation}`);
  });

  process.exit(0);
}

inspect().catch(console.error);
