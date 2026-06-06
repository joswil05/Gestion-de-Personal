import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, doc, getDoc } from "firebase/firestore";
import { canWorkerOccupiedSlot } from "../src/services/firebaseService.js";

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

  let carlos = null;
  workersSnap.forEach(d => {
    if (d.data().name.includes("Carlos Javier Cruz")) {
      carlos = { id: d.id, ...d.data() };
    }
  });

  let slotL2 = null;
  slotsSnap.forEach(d => {
    if (d.id === "SLOT_L2_016") {
      slotL2 = { id: d.id, ...d.data() };
    }
  });

  if (!carlos) {
    console.error("Carlos not found");
    return;
  }
  if (!slotL2) {
    console.error("Slot L2 not found");
    return;
  }

  console.log("Carlos:", carlos);
  console.log("SlotL2:", slotL2);

  const res = canWorkerOccupiedSlot(carlos, slotL2);
  console.log("Compatibility result:", res);
}

run().catch(console.error);
