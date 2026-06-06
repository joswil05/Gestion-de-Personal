import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, doc, getDoc } from "firebase/firestore";
import { getRelocationDestination, getSlotsInTransitChains, getRelocationDestinationSimple } from "../src/services/firebaseService.js";

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

async function runDiagnosis() {
  console.log("=== DB DIAGNOSIS START ===");
  const slotsSnap = await getDocs(collection(db, "puestos"));
  const workersSnap = await getDocs(collection(db, "trabajadores"));
  const globalPriorityDoc = await getDoc(doc(db, "config", "global_priority"));

  const allSlots = [];
  slotsSnap.forEach(d => allSlots.push({ id: d.id, ...d.data() }));

  const workersMap = {};
  workersSnap.forEach(d => workersMap[d.id] = { id: d.id, ...d.data() });

  const priorityOrder = globalPriorityDoc.exists() ? globalPriorityDoc.data().priorityOrder : [];

  console.log(`Loaded ${allSlots.length} slots and ${Object.keys(workersMap).length} workers.`);

  // Find workers in transit
  const transitWorkers = Object.values(workersMap).filter(w => w.status === 'EN_TRANSITO');
  console.log("\n--- Workers in Transit ---");
  transitWorkers.forEach(w => {
    console.log(`Worker: "${w.name}" (ID: ${w.id}) -> TargetSlot: "${w.targetSlotId}" on destLine: "${w.lineaDestinoId}"`);
  });

  // Find fatigued slots
  console.log("\n--- Fatigued Slots (elapsed >= 105 mins or relevoSolicitado) ---");
  const getElapsedMins = (slot) => {
    const t = slot.asignadoEnSegundoVirtual;
    if (!t) return 0;
    const ms = t.toDate ? t.toDate().getTime() : (t.seconds ? t.seconds * 1000 : new Date(t).getTime());
    return Math.max(0, Math.floor((Date.now() - ms) / 60000));
  };
  
  allSlots.forEach(s => {
    if (s.status === 'ASIGNADO' && s.asignadoEnSegundoVirtual) {
      const elapsed = getElapsedMins(s);
      if (elapsed >= 105 || s.relevoSolicitado) {
        const worker = workersMap[s.idWorkerCurrent];
        console.log(`Slot: "${s.puestoName}" (ID: ${s.id}) on Line ${s.lineId} - Worker: "${worker ? worker.name : 'Unknown'}" (ID: ${s.idWorkerCurrent}) - Elapsed: ${elapsed} mins - relevoSolicitado: ${s.relevoSolicitado}`);
      }
    }
  });

  // Calculate getSlotsInTransitChains
  console.log("\n--- Transit Chains ---");
  const transitChains = getSlotsInTransitChains(allSlots, workersMap, priorityOrder);
  console.log("Full Transit Chains Slots:", transitChains);

  // Trace relocation for each fatigued worker that has a worker in transit coming to them
  console.log("\n--- Tracing Relocations ---");
  for (const tw of transitWorkers) {
    const destSlot = allSlots.find(s => s.id === tw.targetSlotId);
    if (destSlot) {
      const relievedWorker = workersMap[destSlot.idWorkerCurrent];
      if (relievedWorker) {
        console.log(`\nRelocation for relieved worker "${relievedWorker.name}" (ID: ${relievedWorker.id}) from slot "${destSlot.puestoName}" (ID: ${destSlot.id}):`);
        
        // Let's run getRelocationDestinationSimple
        const simpleDest = getRelocationDestinationSimple(relievedWorker, destSlot, allSlots, workersMap, priorityOrder);
        console.log(`  Simple destination: type="${simpleDest.type}", slotId="${simpleDest.slotId}", lineId="${simpleDest.lineId}"`);
        
        // Let's run getSlotsInTransitChains with exclusion
        const excludedChains = getSlotsInTransitChains(allSlots, workersMap, priorityOrder, destSlot.id);
        console.log(`  Excluded chains (excluding "${destSlot.id}"):`, excludedChains);

        // Run full getRelocationDestination
        const dest = getRelocationDestination(relievedWorker, destSlot, allSlots, workersMap, priorityOrder);
        console.log(`  RESULT Destination: type="${dest.type}", label="${dest.label}", slotId="${dest.slotId}"`);
      } else {
        console.log(`Dest slot "${destSlot.puestoName}" has no current worker assigned!`);
      }
    }
  }

  console.log("=== DIAGNOSIS END ===");
}

runDiagnosis().catch(console.error);
