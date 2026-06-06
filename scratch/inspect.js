import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, getDocs, collection, query, where } from "firebase/firestore";

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
  console.log("=== INSPECCIÓN DE LA BASE DE DATOS CONTRA RESTRICCIONES ===");

  // 1. Inspect SLOT_L5_008 (Revisión y empaque)
  const slotRef = doc(db, "puestos", "SLOT_L5_008");
  const slotSnap = await getDoc(slotRef);
  if (slotSnap.exists()) {
    console.log("Slot L5_008 details:", JSON.stringify(slotSnap.data(), null, 2));
  } else {
    console.log("Slot L5_008 does not exist under that ID!");
    // Query slots in L5
    const qSlots = query(collection(db, "puestos"), where("lineId", "==", "L5"));
    const slotsSnap = await getDocs(qSlots);
    console.log(`Found ${slotsSnap.size} slots in L5:`);
    slotsSnap.forEach(d => {
      console.log(`- ${d.id}: Name: "${d.data().puestoName}", Sex: "${d.data().sexoPreferente}", Type: "${d.data().tipoPuesto}"`);
    });
  }

  // 2. Query available workers with physicalLineLocation = L5
  const qWorkers = query(collection(db, "trabajadores"), where("physicalLineLocation", "==", "L5"));
  const workersSnap = await getDocs(qWorkers);
  console.log(`\nAvailable workers at L5 physical location (${workersSnap.size}):`);
  workersSnap.forEach(d => {
    const w = d.data();
    console.log(`- ${d.id}: Name: "${w.name}", Role: "${w.role}", Sex: "${w.sexo}", Status: "${w.status}", slotId: "${w.currentSlotId}", medicalRestrictions: ${JSON.stringify(w.medicalRestrictions || [])}`);
  });

  // 3. Check fixed positions in L4
  const qSlotsL4 = query(collection(db, "puestos"), where("lineId", "==", "L4"));
  const slotsL4Snap = await getDocs(qSlotsL4);
  console.log(`\nSlots in L4 (${slotsL4Snap.size}):`);
  slotsL4Snap.forEach(d => {
    const p = d.data();
    console.log(`- ${d.id}: Name: "${p.puestoName}", status: "${p.status}", currentWorker: "${p.idWorkerCurrent}", originalWorker: "${p.idWorkerOriginal}"`);
  });

  process.exit(0);
}

inspect().catch(err => {
  console.error("Error inspecting:", err);
  process.exit(1);
});
