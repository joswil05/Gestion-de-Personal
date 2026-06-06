import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, doc, getDoc } from "firebase/firestore";
import { getRelocationDestinationSimple, canWorkerOccupiedSlot } from "../src/services/firebaseService.js";

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

async function runSimulation() {
  const slotsSnap = await getDocs(collection(db, "puestos"));
  const workersSnap = await getDocs(collection(db, "trabajadores"));
  const globalPriorityDoc = await getDoc(doc(db, "config", "global_priority"));

  const allSlots = [];
  slotsSnap.forEach(d => allSlots.push({ id: d.id, ...d.data() }));

  const workersMap = {};
  workersSnap.forEach(d => workersMap[d.id] = { id: d.id, ...d.data() });

  const priorityOrder = globalPriorityDoc.exists() ? globalPriorityDoc.data().priorityOrder : [];

  // Find Carlos (L4 Estibador 1) and slot
  let carlos = null;
  let slotL4 = null;
  
  slotsSnap.forEach(d => {
    const s = d.data();
    if (s.lineId === "L4" && s.puestoName === "Estibador 1") {
      slotL4 = { id: d.id, ...s };
      if (s.idWorkerCurrent) {
        carlos = workersMap[s.idWorkerCurrent];
      }
    }
  });

  if (!slotL4) {
    console.error("L4 Estibador 1 not found");
    return;
  }
  
  // If Carlos is not currently on L4, load him manually
  if (!carlos) {
    console.log("Carlos not currently assigned to L4 Estibador 1. Searching by name...");
    Object.values(workersMap).forEach(w => {
      if (w.name.includes("Carlos Javier Cruz")) {
        carlos = w;
      }
    });
  }

  console.log(`relievedWorker: "${carlos ? carlos.name : 'null'}" (ID: ${carlos ? carlos.id : 'null'})`);
  console.log(`relievedFromSlot: "${slotL4.puestoName}" (ID: ${slotL4.id})`);

  // Let's trace getRelocationDestination manually step-by-step
  const currentLineId = slotL4.lineId;
  const workersArray = Object.values(workersMap);

  const getElapsedMins = (slot) => {
    const t = slot.asignadoEnSegundoVirtual;
    if (!t) return 0;
    const ms = t.toDate ? t.toDate().getTime() : (t.seconds ? t.seconds * 1000 : new Date(t).getTime());
    return Math.max(0, Math.floor((Date.now() - ms) / 60000));
  };

  const getBaseName = (name) => {
    if (!name) return "";
    return name.toLowerCase().split(/\d/)[0].trim();
  };

  console.log("\n--- STEP 1: Same line fatigued slots ---");
  const ownLineSlots = allSlots.filter(s => s.lineId === currentLineId && s.id !== slotL4.id);
  console.log(`Checking ${ownLineSlots.length} local slots:`);
  
  ownLineSlots.forEach(s => {
    const esFijo = ["Operador A", "Averiero", "Operador C"].includes(s.tipoPuesto);
    const isSimilar = getBaseName(s.puestoName) === getBaseName(slotL4.puestoName);
    const elapsed = getElapsedMins(s);
    const needsRelay = s.relevoSolicitado || (elapsed >= 105);
    const compatible = carlos ? canWorkerOccupiedSlot(carlos, s) : false;
    
    console.log(`- Slot: "${s.puestoName}" (ID: ${s.id}, status: ${s.status}): esFijo=${esFijo}, isSimilar=${isSimilar}, elapsed=${elapsed}, needsRelay=${needsRelay}, compatible=${compatible}`);
  });

  console.log("\n--- STEP 2: Other active lines ---");
  const customPriorities = {
    "L1": ["L2", "L4", "L6", "L3"],
    "L2": ["L4", "L1", "L6", "L3"],
    "L3": ["L6", "L4", "L2", "L1"],
    "L4": ["L2", "L1", "L6", "L3"],
    "L5": ["L8", "L1", "L2", "L4", "L6", "L3"],
    "L6": ["L3", "L4", "L2", "L1", "L5"]
  };
  const linePriorityList = customPriorities[currentLineId] || [];
  console.log("Priority list for L4:", linePriorityList);

  for (const targetLineId of linePriorityList) {
    console.log(`\nChecking Line ${targetLineId}:`);
    const targetLineSlots = allSlots.filter(s => s.lineId === targetLineId);
    const isLineActive = targetLineSlots.some(s => s.status !== 'SUSPENDIDO');
    console.log(`  isLineActive: ${isLineActive}`);
    if (!isLineActive) continue;

    targetLineSlots.forEach(s => {
      if (s.status !== 'ASIGNADO') return;
      const esFijo = ["Operador A", "Averiero", "Operador C"].includes(s.tipoPuesto);
      const elapsed = getElapsedMins(s);
      const needsRelay = s.relevoSolicitado || (elapsed >= 105);
      const compatible = carlos ? canWorkerOccupiedSlot(carlos, s) : false;
      const isBlacklisted = (s.rejectedWorkerIds || []).includes(carlos ? carlos.id : "");
      
      console.log(`  - Slot: "${s.puestoName}" (ID: ${s.id}): esFijo=${esFijo}, elapsed=${elapsed}, needsRelay=${needsRelay}, compatible=${compatible}, blacklisted=${isBlacklisted}`);
    });
  }
}

runSimulation().catch(console.error);
