import "./loadEnv.js";
import { initializeApp, getApp, getApps } from "firebase/app";
import { getFirestore, doc, getDoc, getDocs, collection } from "firebase/firestore";
import { canWorkerOccupiedSlot } from "../src/services/firebaseService.js";

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);

async function debugState() {
  console.log("=== INSPECCIONANDO ESTADO ACTUAL EN FIRESTORE ===");
  
  // 1. Obtener puestos
  const puestosSnap = await getDocs(collection(db, "puestos"));
  const puestos = [];
  puestosSnap.forEach(d => puestos.push({ id: d.id, ...d.data() }));

  const fatiguedSlots = puestos.filter(s => {
    if (s.status !== 'ASIGNADO' || !s.asignadoEnSegundoVirtual) return false;
    const t = s.asignadoEnSegundoVirtual;
    const ms = t.toDate ? t.toDate().getTime() : (t.seconds ? t.seconds * 1000 : new Date(t).getTime());
    const elapsed = Math.max(0, Math.floor((Date.now() - ms) / 60000));
    return elapsed >= 105 || s.relevoSolicitado === true;
  });

  console.log(`Puestos fatigados detectados en total: ${fatiguedSlots.length}`);
  fatiguedSlots.forEach(s => {
    console.log(`- Slot: ${s.puestoName} (${s.id}), Line: ${s.lineId}, WorkerCurrent: ${s.idWorkerCurrent}, Status: ${s.status}, RelevoSolicitado: ${s.relevoSolicitado}`);
  });

  // 2. Obtener trabajadores
  const workersSnap = await getDocs(collection(db, "trabajadores"));
  const workers = [];
  workersSnap.forEach(d => workers.push({ id: d.id, ...d.data() }));

  console.log(`Total trabajadores en Firestore: ${workers.length}`);

  const l8Available = workers.filter(w => 
    (w.status === "DISPONIBLE_BOLSON" || w.status === "POOL_ARRANQUE") && 
    w.currentSlotId == null
  );
  console.log(`Trabajadores disponibles en L8/Pool: ${l8Available.length}`);

  // Evaluar para cada fatigado
  for (const slot of fatiguedSlots) {
    console.log(`\nEvaluando puesto fatigado: ${slot.puestoName} (${slot.id}) en línea ${slot.lineId}`);
    
    // Ver si tiene pareja local estable
    const sameLineSlots = puestos.filter(s => s.lineId === slot.lineId && s.id !== slot.id);
    let partnerStable = null;
    const workerA = workers.find(w => w.id === slot.idWorkerCurrent);
    if (workerA) {
      for (const slotB of sameLineSlots) {
        if (slotB.status !== 'ASIGNADO' || !slotB.idWorkerCurrent) continue;
        const esFijoB = ["Operador A", "Averiero", "Operador C"].includes(slotB.tipoPuesto);
        if (esFijoB) continue;

        const workerB = workers.find(w => w.id === slotB.idWorkerCurrent);
        if (!workerB) continue;

        if (canWorkerOccupiedSlot(workerA, slotB) && canWorkerOccupiedSlot(workerB, slot)) {
          partnerStable = { slotB, workerB };
          break;
        }
      }
    }
    console.log(`- Pareja local estable encontrada: ${partnerStable ? `${partnerStable.workerB.name} (${partnerStable.slotB.puestoName})` : 'Ninguna'}`);

    // Evaluar si L8 tiene personal disponible compatible
    const compatibles = [];
    l8Available.forEach(w => {
      const blacklist = slot.rejectedWorkerIds || [];
      if (blacklist.includes(w.id)) return;
      if (w.lastActivity && w.lastActivity === slot.puestoName) return;
      if (canWorkerOccupiedSlot(w, slot)) {
        compatibles.push(w);
      }
    });

    console.log(`- Trabajadores L8 compatibles libres: ${compatibles.length}`);
    if (compatibles.length > 0) {
      console.log(`  Compatibles: ${compatibles.slice(0, 5).map(c => `${c.name} (${c.id})`).join(', ')}`);
    } else {
      console.log("  No hay compatibles. Por qué?");
      // Imprimir algunos trabajadores en L8 y por qué fallaron
      l8Available.slice(0, 5).forEach(w => {
        const blacklist = slot.rejectedWorkerIds || [];
        const inBlacklist = blacklist.includes(w.id);
        const lastActMatch = w.lastActivity && w.lastActivity === slot.puestoName;
        const canOccupy = canWorkerOccupiedSlot(w, slot);
        console.log(`    * ${w.name} (${w.id}): status=${w.status}, currentSlotId=${w.currentSlotId}, blacklist=${inBlacklist}, lastActMatch=${lastActMatch}, canOccupy=${canOccupy}`);
      });
    }
  }
}

debugState().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
