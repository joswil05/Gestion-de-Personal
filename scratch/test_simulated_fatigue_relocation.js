import { initializeApp } from "firebase/app";
import { getFirestore, getDocs, collection } from "firebase/firestore";
import { getRelocationDestination } from "../src/services/firebaseService.js";

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
  slotsSnap.forEach(d => {
    const s = d.data();
    // Simulate SLOT_L4_010 (Estibador 1) being fatigued (elapsed 120 mins)
    if (d.id === "SLOT_L4_010") {
      const twoHoursAgo = new Date(Date.now() - 120 * 60 * 1000);
      const seconds = Math.floor(twoHoursAgo.getTime() / 1000);
      allSlots.push({ 
        id: d.id, 
        ...s, 
        asignadoEnSegundoVirtual: { seconds, nanoseconds: 0 },
        relevoSolicitado: true
      });
    } else {
      allSlots.push({ id: d.id, ...s });
    }
  });

  const workersMap = {};
  workersSnap.forEach(d => {
    workersMap[d.id] = { id: d.id, ...d.data() };
  });

  const roberto = workersMap["WORKER_10432"];
  const slotL2_016 = allSlots.find(s => s.id === "SLOT_L2_016");

  console.log("Calling getRelocationDestination for Roberto with L4 Estibador 1 simulated as fatigued:");
  const res = getRelocationDestination(roberto, slotL2_016, allSlots, workersMap, ["L4", "L1", "L2", "L6", "L7", "L5", "L3", "L8", "L9", "L10"]);
  console.log("Relocation destination result:", res);

  process.exit(0);
}

run().catch(console.error);
