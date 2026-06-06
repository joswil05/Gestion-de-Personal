import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, getDocs, collection } from "firebase/firestore";
import { canWorkerOccupiedSlot, getRelocationDestination } from "../src/services/firebaseService.js";

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
  const workersSnap = await getDocs(collection(db, "trabajadores"));
  const slotsSnap = await getDocs(collection(db, "puestos"));

  const allSlots = [];
  slotsSnap.forEach(d => allSlots.push({ id: d.id, ...d.data() }));

  const workersMap = {};
  workersSnap.forEach(d => {
    workersMap[d.id] = { id: d.id, ...d.data() };
  });

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

  // Find Roberto Daniel Lira Munguia (WORKER_10432)
  const roberto = workersMap["WORKER_10432"];
  console.log("Roberto:", roberto);

  // Find slot L2_016
  const slotL2_016 = allSlots.find(s => s.id === "SLOT_L2_016");
  console.log("Slot L2_016:", slotL2_016);

  console.log("\nChecking all L4 slots for Roberto's relocation eligibility:");
  const l4Slots = allSlots.filter(s => s.lineId === "L4");

  l4Slots.forEach(s => {
    console.log(`\nSlot: "${s.puestoName}" (ID: ${s.id}, status: ${s.status}, type: ${s.tipoPuesto})`);
    
    // Check 1: Status
    const isAssigned = s.status === 'ASIGNADO';
    console.log(`  - status is ASIGNADO: ${isAssigned}`);
    
    // Check 2: Fixed position
    const esFijo = ["Operador A", "Averiero", "Operador C"].includes(s.tipoPuesto);
    console.log(`  - esFijo (should be false for swap): ${esFijo}`);
    
    // Check 3: Fatigue
    const elapsed = getElapsedMins(s);
    const needsRelay = s.relevoSolicitado || (elapsed >= 105);
    console.log(`  - needsRelay: ${needsRelay} (elapsed: ${elapsed} mins, relevoSolicitado: ${s.relevoSolicitado})`);
    
    // Check 4: Compatibility
    const isCompatible = canWorkerOccupiedSlot(roberto, s);
    console.log(`  - isCompatible: ${isCompatible}`);
    
    // Check 5: Blacklist
    const isBlacklisted = (s.rejectedWorkerIds || []).includes(roberto.id);
    console.log(`  - isBlacklisted: ${isBlacklisted}`);
    
    // Check 6: Last activity
    const isLastActivity = roberto.lastActivity && roberto.lastActivity === s.puestoName;
    console.log(`  - isLastActivity same as slot: ${isLastActivity} (roberto.lastActivity: "${roberto.lastActivity}")`);
  });

  console.log("\nCalling getRelocationDestination for Roberto:");
  const res = getRelocationDestination(roberto, slotL2_016, allSlots, workersMap, ["L4", "L1", "L2", "L6", "L7", "L5", "L3", "L8", "L9", "L10"]);
  console.log("Relocation destination result:", res);

  process.exit(0);
}

run().catch(console.error);
