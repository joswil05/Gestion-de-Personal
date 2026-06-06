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

async function inspect() {
  const slotsSnap = await getDocs(collection(db, "puestos"));
  const workersSnap = await getDocs(collection(db, "trabajadores"));

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

  console.log("\n--- L2 SLOTS AND ASSIGNED WORKERS ---");
  slotsSnap.forEach(d => {
    const s = d.data();
    if (s.lineId === "L2") {
      const elapsed = getElapsedMins(s);
      const isFatigued = s.relevoSolicitado || (elapsed >= 105);
      const worker = s.idWorkerCurrent ? workersMap[s.idWorkerCurrent] : null;
      console.log(`Slot: "${s.puestoName}" (${d.id}) - status: ${s.status} - type: ${s.tipoPuesto}`);
      console.log(`  Worker: ${worker ? `"${worker.name}" (${worker.id}) status=${worker.status} slotId=${worker.currentSlotId} physicalLoc=${worker.physicalLineLocation}` : "NONE"}`);
      console.log(`  Fatigued: ${isFatigued} (elapsed: ${elapsed} mins, relevoSolicitado: ${s.relevoSolicitado})`);
    }
  });

  console.log("\n--- L4 SLOTS AND ASSIGNED WORKERS ---");
  slotsSnap.forEach(d => {
    const s = d.data();
    if (s.lineId === "L4") {
      const elapsed = getElapsedMins(s);
      const isFatigued = s.relevoSolicitado || (elapsed >= 105);
      const worker = s.idWorkerCurrent ? workersMap[s.idWorkerCurrent] : null;
      console.log(`Slot: "${s.puestoName}" (${d.id}) - status: ${s.status} - type: ${s.tipoPuesto}`);
      console.log(`  Worker: ${worker ? `"${worker.name}" (${worker.id}) status=${worker.status} slotId=${worker.currentSlotId} physicalLoc=${worker.physicalLineLocation}` : "NONE"}`);
      console.log(`  Fatigued: ${isFatigued} (elapsed: ${elapsed} mins, relevoSolicitado: ${s.relevoSolicitado})`);
    }
  });

  process.exit(0);
}

inspect().catch(console.error);
