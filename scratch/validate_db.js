import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";

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

async function validate() {
  console.log("Fetching database documents...");
  const slotsSnap = await getDocs(collection(db, "puestos"));
  const workersSnap = await getDocs(collection(db, "trabajadores"));

  const slots = {};
  slotsSnap.forEach(d => slots[d.id] = d.data());

  const workers = {};
  workersSnap.forEach(d => workers[d.id] = d.data());

  console.log(`Loaded ${Object.keys(slots).length} slots and ${Object.keys(workers).length} workers.`);

  let errorsCount = 0;

  // 1. Validate slots
  for (const [slotId, slot] of Object.entries(slots)) {
    if (slot.idWorkerCurrent) {
      const worker = workers[slot.idWorkerCurrent];
      if (!worker) {
        console.error(`ERROR: Slot "${slotId}" (${slot.puestoName}) refers to non-existent worker "${slot.idWorkerCurrent}"`);
        errorsCount++;
      } else if (worker.currentSlotId !== slotId) {
        console.error(`ERROR: Slot "${slotId}" (${slot.puestoName}) has worker "${slot.idWorkerCurrent}" (${worker.name}), but worker's currentSlotId is "${worker.currentSlotId}"`);
        errorsCount++;
      }
    }
  }

  // 2. Validate workers
  for (const [workerId, worker] of Object.entries(workers)) {
    if (worker.currentSlotId) {
      const slot = slots[worker.currentSlotId];
      if (!slot) {
        console.error(`ERROR: Worker "${workerId}" (${worker.name}) refers to non-existent slot "${worker.currentSlotId}"`);
        errorsCount++;
      } else if (slot.idWorkerCurrent !== workerId) {
        console.error(`ERROR: Worker "${workerId}" (${worker.name}) has currentSlotId "${worker.currentSlotId}" (${slot.puestoName}), but slot's idWorkerCurrent is "${slot.idWorkerCurrent}"`);
        errorsCount++;
      }
    }
  }

  if (errorsCount === 0) {
    console.log("SUCCESS: Database is 100% consistent!");
  } else {
    console.log(`FAILED: Found ${errorsCount} inconsistency errors.`);
  }
}

validate().catch(console.error);
