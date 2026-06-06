import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, getDocs, collection, updateDoc, setDoc } from "firebase/firestore";
import { 
  initializeTurnoWithSheets, 
  assignPuestosLive,
  dispatchWorkerToLine, 
  getRelocationDestination, 
  acceptErgonomicRelevo 
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
  console.log("\n=== STEP 1: INITIALIZING SHIFT ===");
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
  
  // Set shift_status to EN_PRODUCCION since initializeTurnoWithSheets changes it or requires it
  await setDoc(doc(db, "config", "shift_status"), {
    status: "EN_PRODUCCION",
    shiftStartTimestamp: new Date()
  });

  await initializeTurnoWithSheets(skuPlan);
  await assignPuestosLive(skuPlan);
  console.log("Shift initialized successfully!");

  console.log("\n=== STEP 2: VERIFYING ASSIGNMENTS ===");
  let slotsSnap = await getDocs(collection(db, "puestos"));
  let workersSnap = await getDocs(collection(db, "trabajadores"));
  
  let allSlots = [];
  slotsSnap.forEach(d => allSlots.push({ id: d.id, ...d.data() }));
  
  let workersMap = {};
  workersSnap.forEach(d => {
    workersMap[d.id] = { id: d.id, ...d.data() };
  });

  // Find assigned Varios slots on L2 and L4
  const slotL2 = allSlots.find(s => s.lineId === "L2" && s.puestoName === "Ingreso Botella 1" && s.status === "ASIGNADO");
  const slotL4 = allSlots.find(s => s.lineId === "L4" && s.puestoName === "Estibador 1" && s.status === "ASIGNADO");

  if (!slotL2 || !slotL4) {
    console.error("Could not find assigned Puesto Vario slots on L2 or L4!");
    console.log("Slots on L2:");
    allSlots.filter(s => s.lineId === "L2").forEach(s => console.log(`- ${s.puestoName} (${s.id}) status=${s.status} idWorkerCurrent=${s.idWorkerCurrent}`));
    console.log("Slots on L4:");
    allSlots.filter(s => s.lineId === "L4").forEach(s => console.log(`- ${s.puestoName} (${s.id}) status=${s.status} idWorkerCurrent=${s.idWorkerCurrent}`));
    process.exit(1);
  }

  const workerL2 = workersMap[slotL2.idWorkerCurrent];
  const workerL4 = workersMap[slotL4.idWorkerCurrent];

  console.log(`L2 Slot: "${slotL2.puestoName}" (${slotL2.id}) - Worker: "${workerL2.name}" (${workerL2.id})`);
  console.log(`L4 Slot: "${slotL4.puestoName}" (${slotL4.id}) - Worker: "${workerL4.name}" (${workerL4.id})`);

  console.log("\n=== STEP 3: FATIGUING BOTH SLOTS ===");
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
  
  console.log("Both L2 and L4 slots marked as fatigued.");

  console.log("\n=== STEP 4: FINDING L8 RELEVISTA AND DISPATCHING TO L2 ===");
  const l8Workers = Object.values(workersMap).filter(w => w.status === "DISPONIBLE_BOLSON");
  if (l8Workers.length === 0) {
    console.error("No L8 workers available!");
    process.exit(1);
  }
  
  const relevista = l8Workers[0];
  console.log(`L8 Relevista selected: "${relevista.name}" (${relevista.id})`);

  console.log(`Dispatching "${relevista.name}" to L2 slot "${slotL2.puestoName}"...`);
  await dispatchWorkerToLine(relevista.id, "L2", slotL2.id, "L8");
  console.log("Dispatched!");

  console.log("\n=== STEP 5: PREDICTING RELOCATION IN THE UI ===");
  // Fetch fresh state for prediction
  slotsSnap = await getDocs(collection(db, "puestos"));
  workersSnap = await getDocs(collection(db, "trabajadores"));
  
  allSlots = [];
  slotsSnap.forEach(d => allSlots.push({ id: d.id, ...d.data() }));
  
  workersMap = {};
  workersSnap.forEach(d => {
    workersMap[d.id] = { id: d.id, ...d.data() };
  });

  const freshWorkerL2 = workersMap[workerL2.id];
  const freshSlotL2 = allSlots.find(s => s.id === slotL2.id);

  const priorityOrder = ["L4", "L1", "L2", "L6", "L7", "L5", "L3", "L8"];
  const prediction = getRelocationDestination(freshWorkerL2, freshSlotL2, allSlots, workersMap, priorityOrder);
  console.log("Prediction Result:", prediction);

  console.log("\n=== STEP 6: RECEIVING RELEVISTA (ACCEPT TRANSIT) ===");
  console.log(`Executing acceptErgonomicRelevo for relevista "${relevista.name}" on slot "${slotL2.puestoName}"...`);
  const acceptRes = await acceptErgonomicRelevo(relevista.id, slotL2.id, "L2");
  console.log("Relay Accepted! Response:", JSON.stringify(acceptRes, null, 2));

  console.log("\n=== STEP 7: VERIFYING FINAL DATABASE STATE ===");
  // Fetch fresh state after transaction
  slotsSnap = await getDocs(collection(db, "puestos"));
  workersSnap = await getDocs(collection(db, "trabajadores"));
  
  allSlots = [];
  slotsSnap.forEach(d => allSlots.push({ id: d.id, ...d.data() }));
  
  workersMap = {};
  workersSnap.forEach(d => {
    workersMap[d.id] = { id: d.id, ...d.data() };
  });

  const finalSlotL2 = allSlots.find(s => s.id === slotL2.id);
  const finalSlotL4 = allSlots.find(s => s.id === slotL4.id);

  console.log(`L2 Slot current worker: ${finalSlotL2.idWorkerCurrent} (expected: ${relevista.id})`);
  console.log(`L4 Slot current worker: ${finalSlotL4.idWorkerCurrent} (expected: ${workerL2.id})`);
  
  const finalWorkerL2 = workersMap[workerL2.id];
  const finalWorkerL4 = workersMap[workerL4.id];

  console.log(`Worker L2 (Roberto-equivalent) state: status=${finalWorkerL2.status}, slotId=${finalWorkerL2.currentSlotId}, physicalLoc=${finalWorkerL2.physicalLineLocation}`);
  console.log(`Worker L4 state: status=${finalWorkerL4.status}, slotId=${finalWorkerL4.currentSlotId}, physicalLoc=${finalWorkerL4.physicalLineLocation}`);

  process.exit(0);
}

run().catch(console.error);
