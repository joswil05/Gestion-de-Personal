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
  console.log("[Scenario 3] Reseteando base de datos a estado limpio...");
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

// Lista de nombres femeninos para identificar en caliente
const femaleKeywords = [
  "maria", "maría", "elena", "sofia", "sofía", "teresa", "lucia", "lucía", "laura", "carmen", 
  "patricia", "isabel", "ana", "rosa", "margarita", "juana", "diana", "dayana", "anielka", 
  "vanessa", "meyling", "nahomy", "wendy", "flor", "keidy", "grethel", "tania", "joseline", 
  "ingri", "zuleica", "jenny", "nerling", "nubia", "esmeralda", "ruth", "yessica", "karla", 
  "estela", "marcia", "rebeca", "keyling", "carlota", "fabiana", "jeaneth", "brenda", "digna", 
  "jackeline", "jhovania", "jessica", "sara", "yelba", "fresia", "indira", "tatiana", "elissa", 
  "hanan", "shelsea", "doris", "martha", "miurys", "scarleth", "nancy", "elieth", "karen", 
  "fernanda", "jennifer", "denise", "ashly", "glenda", "sonia", "samira", "mary", "dominga", 
  "mercedes", "leslie", "soraya", "ileana", "marjorie", "francis", "carla", "guadalupe"
];

function isFemale(name) {
  const nameLower = name.trim().toLowerCase();
  return femaleKeywords.some(kw => {
    const regex = new RegExp(`\\b${kw}\\b`, "i");
    return regex.test(nameLower);
  });
}

async function runScenario3Test() {
  await resetDB();

  // 1. Simular Asistencia 100%
  console.log("[Scenario 3] Simulando asistencia 100%...");
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
  console.log("[Scenario 3] Iniciando jornada...");
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

  // 3. Asignar explícitamente a Dayana (Lampara 1) y Diana (Limpieza) en L4
  console.log("[Scenario 3] Asignando a Dayana (Lampara 1) y Diana (Limpieza) en L4...");
  await assignWorkerTransaction("WORKER_365550", "SLOT_L4_004", "L4");
  await assignWorkerTransaction("WORKER_365532", "SLOT_L4_013", "L4");

  // 4. Simular el Déficit: Colocar INACTIVAS a todas las demás mujeres de L8 (los no asignados libres)
  console.log("[Scenario 3] Colocando INACTIVAS a todas las demás mujeres del pool para forzar el déficit...");
  const currentWorkersSnap = await getDocs(trabajadoresColl);
  const batchDeficit = writeBatch(db);
  let deactivatedCount = 0;
  currentWorkersSnap.forEach(d => {
    const w = d.data();
    if ((w.status === "POOL_ARRANQUE" || w.status === "DISPONIBLE_BOLSON") && w.currentSlotId == null) {
      const isFemaleWorker = w.sexo === "Femenino" || isFemale(w.name);
      if (isFemaleWorker) {
        batchDeficit.update(d.ref, {
          status: "INACTIVO"
        });
        deactivatedCount++;
      } else {
        // Hombres sí quedan disponibles en L8
        batchDeficit.update(d.ref, {
          status: "DISPONIBLE_BOLSON",
          physicalLineLocation: "L8"
        });
      }
    }
  });
  await batchDeficit.commit();
  console.log(`[Scenario 3] Se colocaron ${deactivatedCount} operarias en estado INACTIVO.`);

  // 5. Fatigar a Lampara 1 (SLOT_L4_004)
  console.log("[Scenario 3] Fatigando a Lampara 1...");
  const twoHoursAgo = new Date(Date.now() - 120 * 60 * 1000);
  await updateDoc(doc(db, "puestos", "SLOT_L4_004"), {
    asignadoEnSegundoVirtual: twoHoursAgo,
    relevoSolicitado: true
  });

  // 6. Evaluar la lógica en tiempo real
  console.log("[Scenario 3] Evaluando estado actual de la solicitud en Relevos...");
  const finalWorkersSnap = await getDocs(trabajadoresColl);
  const workersMap = {};
  finalWorkersSnap.forEach(d => {
    workersMap[d.id] = { id: d.id, ...d.data() };
  });

  const updatedSlotsSnap = await getDocs(puestosColl);
  const updatedSlots = [];
  updatedSlotsSnap.forEach(d => updatedSlots.push({ id: d.id, ...d.data() }));

  const slotLampara1 = updatedSlots.find(s => s.id === "SLOT_L4_004");
  const slotLimpieza = updatedSlots.find(s => s.id === "SLOT_L4_013");

  const getBaseNameLocal = (name) => {
    if (!name) return "";
    return name.toLowerCase().split(/\d/)[0].trim();
  };

  let isLocalResolvable = false;
  let localSwapInfo = null;
  const workerA = workersMap[slotLampara1.idWorkerCurrent];

  if (workerA) {
    const sameLineSlots = updatedSlots.filter(s => s.lineId === slotLampara1.lineId && s.id !== slotLampara1.id);
    
    // 2. Si no hay fatigado compatible, verificar si L8 tiene personal disponible compatible
    const l8Available = Object.values(workersMap).filter(w => 
      (w.status === "DISPONIBLE_BOLSON" || w.status === "POOL_ARRANQUE") && 
      w.currentSlotId == null
    );

    const hasCompatibleL8Worker = l8Available.some(w => {
      const blacklist = slotLampara1.rejectedWorkerIds || [];
      if (blacklist.includes(w.id)) return false;
      if (!canWorkerOccupiedSlot(w, slotLampara1)) return false;
      if (w.lastActivity && w.lastActivity === slotLampara1.puestoName) return false;
      return true;
    });

    console.log(`- l8Available en total (debería ser sólo hombres): ${l8Available.length}`);
    console.log(`- hasCompatibleL8Worker (debería ser false): ${hasCompatibleL8Worker}`);

    // Si L8 NO tiene recursos, verificamos si hay algún estable compatible localmente
    if (!hasCompatibleL8Worker) {
      let partnerStable = null;
      for (const slotB of sameLineSlots) {
        if (slotB.status !== 'ASIGNADO' || !slotB.idWorkerCurrent) continue;
        const esFijoB = ["Operador A", "Averiero", "Operador C"].includes(slotB.tipoPuesto);
        if (esFijoB) continue;

        if (getBaseNameLocal(slotLampara1.puestoName) === getBaseNameLocal(slotB.puestoName)) continue;
        const workerB = workersMap[slotB.idWorkerCurrent];
        if (!workerB) continue;

        if (canWorkerOccupiedSlot(workerA, slotB) && canWorkerOccupiedSlot(workerB, slotLampara1)) {
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

  console.log("\n==================== RESULTADO ESCENARIO 3 ====================");
  console.log(`¿Se bloquea L8 (isLocalResolvable === true)? ── ${isLocalResolvable === true ? "PASÓ (SÍ)" : "FALLÓ (NO)"}`);
  console.log(`¿La razón es déficit en L8 (reason === "no_l8_resources")? ── ${localSwapInfo?.reason === "no_l8_resources" ? "PASÓ (SÍ)" : "FALLÓ (NO)"}`);
  console.log(`¿La pareja sugerida es Diana (WORKER_365532)? ── ${localSwapInfo?.partnerWorker?.id === "WORKER_365532" ? "PASÓ (SÍ)" : "FALLÓ (NO)"}`);
  console.log("Detalles del swap sugerido:", JSON.stringify(localSwapInfo, null, 2));
  console.log("================================================================");
}

runScenario3Test().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
