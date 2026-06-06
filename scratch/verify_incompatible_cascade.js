import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDocs, collection, updateDoc, setDoc } from "firebase/firestore";
import { 
  getRelocationDestination, 
  getSlotsInTransitChains,
  dispatchWorkerToLine,
  initializeTurnoWithSheets,
  assignPuestosLive
} from "../src/services/firebaseService.js";

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

async function run() {
  console.log("=== INCOMPATIBLE CASCADE VERIFICATION ===");

  const skuPlan = {
    L1: "850EC0832L35",
    L2: "850EC0832L35",
    L3: "INACTIVO",
    L4: "850EC0832L35",
    L5: "INACTIVO",
    L6: "850EC0832L35",
    L7: "INACTIVO",
    L8: "850EC0832L35",
    L9: "INACTIVO",
    L10: "INACTIVO"
  };
  
  await setDoc(doc(db, "config", "shift_status"), {
    status: "EN_PRODUCCION",
    shiftStartTimestamp: new Date()
  });

  await initializeTurnoWithSheets(skuPlan);
  await assignPuestosLive(skuPlan);
  console.log("Shift initialized successfully!");

  let slotsSnap = await getDocs(collection(db, "puestos"));
  let workersSnap = await getDocs(collection(db, "trabajadores"));
  
  let allSlots = [];
  slotsSnap.forEach(d => allSlots.push({ id: d.id, ...d.data() }));
  
  let workersMap = {};
  workersSnap.forEach(d => {
    workersMap[d.id] = { id: d.id, ...d.data() };
  });

  // SLOT_L2_002 (Ingreso Botella 1) is Varios and has Male worker WORKER_352208 (Juan Carlos)
  // SLOT_L4_004 (Lampara 1) is Varios, requires Femenino, and has Female worker WORKER_23972
  const slotL2 = allSlots.find(s => s.id === "SLOT_L2_002");
  const slotL4 = allSlots.find(s => s.id === "SLOT_L4_004");
  
  const workerL2 = workersMap[slotL2.idWorkerCurrent];
  const workerL4 = workersMap[slotL4.idWorkerCurrent];

  console.log(`L2 Slot: "${slotL2.puestoName}" (${slotL2.id}) - Worker: "${workerL2.name}" (${workerL2.id}, sex=${workerL2.sexo})`);
  console.log(`L4 Slot: "${slotL4.puestoName}" (${slotL4.id}, sexPref=${slotL4.sexoPreferente}) - Worker: "${workerL4.name}" (${workerL4.id}, sex=${workerL4.sexo})`);

  console.log("\nSimulating fatigue on both slots...");
  const twoHoursAgo = new Date(Date.now() - 120 * 60 * 1000);
  await updateDoc(doc(db, "puestos", slotL2.id), {
    asignadoEnSegundoVirtual: twoHoursAgo,
    updatedAt: twoHoursAgo,
    relevoSolicitado: true
  });
  await updateDoc(doc(db, "puestos", slotL4.id), {
    asignadoEnSegundoVirtual: twoHoursAgo,
    updatedAt: twoHoursAgo,
    relevoSolicitado: true
  });

  // Re-fetch fresh state
  slotsSnap = await getDocs(collection(db, "puestos"));
  workersSnap = await getDocs(collection(db, "trabajadores"));
  allSlots = [];
  slotsSnap.forEach(d => allSlots.push({ id: d.id, ...d.data() }));
  workersMap = {};
  workersSnap.forEach(d => {
    workersMap[d.id] = { id: d.id, ...d.data() };
  });

  const freshSlotL2 = allSlots.find(s => s.id === slotL2.id);
  const freshSlotL4 = allSlots.find(s => s.id === slotL4.id);
  const freshWorkerL2 = workersMap[workerL2.id];

  // Dispatch a worker to L2 to create a transit chain
  const l8Workers = Object.values(workersMap).filter(w => w.status === "DISPONIBLE_BOLSON");
  const relevista = l8Workers[0];
  console.log(`\nDispatching L8 Relevista "${relevista.name}" (${relevista.id}) to L2 slot "${slotL2.puestoName}"...`);
  await dispatchWorkerToLine(relevista.id, "L2", slotL2.id, "L8");

  // Re-fetch state with worker in transit
  workersSnap = await getDocs(collection(db, "trabajadores"));
  workersMap = {};
  workersSnap.forEach(d => {
    workersMap[d.id] = { id: d.id, ...d.data() };
  });

  console.log("\nTracing transit chains (L8 Console calculation)...");
  const priorityOrder = ["L4", "L1", "L2", "L6", "L7", "L5", "L3", "L8"];
  const transitChains = getSlotsInTransitChains(allSlots, workersMap, priorityOrder);
  console.log("Slots reserved in transit chains:", transitChains);
  
  const isL4Reserved = transitChains.includes(slotL4.id);
  console.log(`Is L4 Slot "${slotL4.puestoName}" hidden/reserved? ${isL4Reserved} (Expected: false)`);

  console.log("\nPredicting L2 relocation destination (L2 Supervisor HUD)...");
  const prediction = getRelocationDestination(freshWorkerL2, freshSlotL2, allSlots, workersMap, priorityOrder);
  console.log("L2 Relocation Prediction:", prediction);
  
  const isDestinationL8 = prediction.type === "bolson";
  console.log(`Does L2 worker relocate to L8? ${isDestinationL8} (Expected: true)`);

  if (!isL4Reserved && isDestinationL8) {
    console.log("\nSUCCESS: The incompatible check correctly prevented the cascade and kept L4 alert visible!");
  } else {
    console.error("\nFAILURE: Mismatch detected between predictions!");
  }

  process.exit(0);
}

run().catch(console.error);
