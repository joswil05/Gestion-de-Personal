import "./loadEnv.js";
import { initializeApp, getApp, getApps } from "firebase/app";
import { getFirestore, doc, setDoc, getDoc, getDocs, updateDoc, collection, writeBatch, deleteDoc } from "firebase/firestore";
import { REAL_PUESTOS, REAL_TRABAJADORES, REAL_PROGRAMA } from "../src/dev/realDataSeed.js";
import { 
  initializeTurnoWithSheets, 
  assignPuestosLive,
  canWorkerOccupiedSlot,
  assignWorkerTransaction
} from "../src/services/firebaseService.js";

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

const trabajadoresColl = collection(db, "trabajadores");
const puestosColl = collection(db, "puestos");

async function resetDB() {
  console.log("[Simulation] Reseteando base de datos...");
  const snapPuestos = await getDocs(puestosColl);
  const snapTrabajadores = await getDocs(trabajadoresColl);

  const batch = writeBatch(db);
  snapPuestos.forEach(d => batch.delete(d.ref));
  snapTrabajadores.forEach(d => batch.delete(d.ref));
  await batch.commit();

  const insertBatch = writeBatch(db);
  insertBatch.set(doc(db, "config", "global_priority"), {
    activeLines: ["L4", "L1", "L2", "L6", "L7", "L5", "L3", "L8"],
    priorityOrder: ["L4", "L1", "L2", "L6", "L7", "L5", "L3", "L8"],
    skuAssigned: "SKU-990-BOST"
  });

  insertBatch.set(doc(db, "config", "shift_status"), {
    shiftStartTimestamp: null,
    status: "PREPARACION"
  });

  const lines = ["L1", "L2", "L3", "L4", "L5", "L6", "L7", "L8"];
  lines.forEach(lineId => {
    insertBatch.set(doc(db, "config", `line_${lineId}`), {
      status: "PREPARACION",
      fijosAssigned: false,
      sku: "SKU-990-BOST",
      paros: []
    });
  });

  REAL_PUESTOS.forEach(p => insertBatch.set(doc(db, "puestos", p.id), p));
  REAL_TRABAJADORES.forEach(w => insertBatch.set(doc(db, "trabajadores", w.id), w));
  await insertBatch.commit();
}

async function simulate() {
  await resetDB();

  // 1. Simular Asistencia 100%
  console.log("[Simulation] Simulando asistencia 100%...");
  const wSnap = await getDocs(trabajadoresColl);
  const batchAssis = writeBatch(db);
  wSnap.forEach(d => {
    batchAssis.update(d.ref, {
      status: "POOL_ARRANQUE",
      physicalLineLocation: "L4",
      currentSlotId: null
    });
  });
  await batchAssis.commit();

  // 2. Iniciar Jornada
  console.log("[Simulation] Iniciando jornada...");
  await setDoc(doc(db, "config", "shift_status"), {
    shiftStartTimestamp: new Date(),
    status: "ARRANQUE"
  });

  const skuPlan = {
    L1: "SKU-990-BOST",
    L2: "SKU-990-BOST",
    L3: "INACTIVO",
    L4: "SKU-990-BOST",
    L5: "INACTIVO",
    L6: "SKU-990-BOST",
    L7: "INACTIVO",
    L8: "SKU-990-BOST",
    L9: "INACTIVO",
    L10: "INACTIVO"
  };
  await initializeTurnoWithSheets(skuPlan);

  // 3. Asignar explícitamente a Dayana y Diana
  console.log("[Simulation] Asignando a Dayana y Diana en L4...");
  // Dayana: WORKER_365550 a SLOT_L4_004 (Lampara 1)
  // Diana: WORKER_365532 a SLOT_L4_013 (Limpieza)
  await assignWorkerTransaction("WORKER_365550", "SLOT_L4_004", "L4");
  await assignWorkerTransaction("WORKER_365532", "SLOT_L4_013", "L4");

  // El resto de los trabajadores que no son fijos, enviarlos a L8 en DISPONIBLE_BOLSON
  console.log("[Simulation] Enviando a trabajadores no asignados a L8 en DISPONIBLE_BOLSON...");
  const currentWorkersSnap = await getDocs(trabajadoresColl);
  const batchL8 = writeBatch(db);
  currentWorkersSnap.forEach(d => {
    const w = d.data();
    if (w.status === "POOL_ARRANQUE" && w.currentSlotId == null) {
      batchL8.update(d.ref, {
        status: "DISPONIBLE_BOLSON",
        physicalLineLocation: "L8"
      });
    }
  });
  await batchL8.commit();

  // 4. Identificar quién está en Lampara 1 (L4) y quién en Limpieza (L4)
  const updatedSlotsSnap = await getDocs(puestosColl);
  const updatedSlots = [];
  updatedSlotsSnap.forEach(d => updatedSlots.push({ id: d.id, ...d.data() }));

  const slotLampara1 = updatedSlots.find(s => s.id === "SLOT_L4_004");
  const slotLimpieza = updatedSlots.find(s => s.id === "SLOT_L4_013");

  console.log("Estado Lampara 1 (L4):", slotLampara1 ? `${slotLampara1.status}, ocupado por: ${slotLampara1.idWorkerCurrent}` : "No encontrado");
  console.log("Estado Limpieza (L4):", slotLimpieza ? `${slotLimpieza.status}, ocupado por: ${slotLimpieza.idWorkerCurrent}` : "No encontrado");

  // 5. Fatigar a Lampara 1
  console.log("[Simulation] Fatigando a Lampara 1...");
  const twoHoursAgo = new Date(Date.now() - 120 * 60 * 1000);
  await updateDoc(doc(db, "puestos", "SLOT_L4_004"), {
    asignadoEnSegundoVirtual: twoHoursAgo,
    relevoSolicitado: true
  });

  // 6. Evaluar la lógica de isLocalResolvable
  console.log("[Simulation] Ejecutando evaluación lógica...");
  const finalWorkersSnap = await getDocs(trabajadoresColl);
  const workersMap = {};
  finalWorkersSnap.forEach(d => {
    workersMap[d.id] = { id: d.id, ...d.data() };
  });

  const slot = {
    ...slotLampara1,
    status: "ASIGNADO",
    idWorkerCurrent: "WORKER_365550",
    asignadoEnSegundoVirtual: twoHoursAgo,
    relevoSolicitado: true
  };

  const getBaseNameLocal = (name) => {
    if (!name) return "";
    return name.toLowerCase().split(/\d/)[0].trim();
  };

  let isLocalResolvable = false;
  let localSwapInfo = null;
  const workerA = workersMap[slot.idWorkerCurrent];

  if (workerA) {
    const sameLineSlots = updatedSlots.filter(s => s.lineId === slot.lineId && s.id !== slot.id);
    
    // 1. Buscar si hay otro fatigado compatible (Siempre bloquea L8)
    let partnerFatigued = null;
    for (const slotB of sameLineSlots) {
      if (slotB.status !== 'ASIGNADO' || !slotB.idWorkerCurrent) continue;
      const esFijoB = ["Operador A", "Averiero", "Operador C"].includes(slotB.tipoPuesto);
      if (esFijoB) continue;

      let isFatiguedB = slotB.relevoSolicitado === true;
      if (!isFatiguedB && slotB.asignadoEnSegundoVirtual) {
        const tB = slotB.asignadoEnSegundoVirtual;
        const msB = tB.toDate ? tB.toDate().getTime() : (tB.seconds ? tB.seconds * 1000 : new Date(tB).getTime());
        const elapsedB = Math.max(0, Math.floor((Date.now() - msB) / 60000));
        isFatiguedB = elapsedB >= 105;
      }
      if (!isFatiguedB) continue;

      if (getBaseNameLocal(slot.puestoName) === getBaseNameLocal(slotB.puestoName)) continue;
      const workerB = workersMap[slotB.idWorkerCurrent];
      if (!workerB) continue;

      if (canWorkerOccupiedSlot(workerA, slotB) && canWorkerOccupiedSlot(workerB, slot)) {
        partnerFatigued = { slotB, workerB };
        break;
      }
    }

    if (partnerFatigued) {
      isLocalResolvable = true;
      localSwapInfo = {
        partnerSlot: partnerFatigued.slotB,
        partnerWorker: partnerFatigued.workerB,
        reason: "both_fatigued"
      };
    } else {
      // 2. Si no hay fatigado compatible, verificar si L8 tiene personal disponible compatible
      const l8Available = Object.values(workersMap).filter(w => 
        (w.status === "DISPONIBLE_BOLSON" || w.status === "POOL_ARRANQUE") && 
        w.currentSlotId == null
      );

      const hasCompatibleL8Worker = l8Available.some(w => {
        const blacklist = slot.rejectedWorkerIds || [];
        if (blacklist.includes(w.id)) return false;
        if (!canWorkerOccupiedSlot(w, slot)) return false;
        if (w.lastActivity && w.lastActivity === slot.puestoName) return false;
        return true;
      });

      console.log(`- l8Available en total: ${l8Available.length}`);
      console.log(`- hasCompatibleL8Worker: ${hasCompatibleL8Worker}`);

      // Si L8 NO tiene recursos, verificamos si hay algún estable compatible localmente
      if (!hasCompatibleL8Worker) {
        let partnerStable = null;
        for (const slotB of sameLineSlots) {
          if (slotB.status !== 'ASIGNADO' || !slotB.idWorkerCurrent) continue;
          const esFijoB = ["Operador A", "Averiero", "Operador C"].includes(slotB.tipoPuesto);
          if (esFijoB) continue;

          if (getBaseNameLocal(slot.puestoName) === getBaseNameLocal(slotB.puestoName)) continue;
          const workerB = workersMap[slotB.idWorkerCurrent];
          if (!workerB) continue;

          if (canWorkerOccupiedSlot(workerA, slotB) && canWorkerOccupiedSlot(workerB, slot)) {
            partnerStable = { slotB, workerB };
            break;
          }
        }

        if (partnerStable) {
          isLocalResolvable = true;
          localSwapInfo = {
            partnerSlot: partnerStable.slotB,
            partnerWorker: partnerStable.workerB,
            reason: "no_l8_resources"
          };
        }
      }
    }
  }

  console.log("\n--- RESULTADO DE LA EVALUACIÓN ---");
  console.log("isLocalResolvable:", isLocalResolvable);
  console.log("localSwapInfo:", JSON.stringify(localSwapInfo));
}

simulate().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
