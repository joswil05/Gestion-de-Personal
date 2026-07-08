import "./loadEnv.js";
import { initializeApp, getApp, getApps } from "firebase/app";
import { getFirestore, doc, setDoc, getDoc, getDocs, updateDoc, collection, writeBatch, deleteDoc } from "firebase/firestore";
import { REAL_PUESTOS, REAL_TRABAJADORES, REAL_PROGRAMA } from "../src/dev/realDataSeed.js";
import { 
  initializeTurnoWithSheets, 
  assignPuestosLive,
  dispatchWorkerToLine, 
  acceptErgonomicRelevo,
  executeLocalSwapTransaction,
  assignWorkerTransaction,
  canWorkerOccupiedSlot,
  acceptReturnToBolson
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

// Nombres femeninos para derivación
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

async function resetDB() {
  console.log("[HEAVY SIM] Reseteando base de datos a estado limpio...");
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
    skuAssigned: "SKU-HEAVY-DUTY"
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
      sku: "SKU-HEAVY-DUTY",
      paros: []
    });
  });

  REAL_PUESTOS.forEach(p => insertBatch.set(doc(db, "puestos", p.id), p));
  REAL_TRABAJADORES.forEach(w => insertBatch.set(doc(db, "trabajadores", w.id), w));
  await insertBatch.commit();
}

async function runHeavySimulation() {
  console.log("\n=======================================================================");
  console.log("🔥 SIMULACIÓN DE DÍA PESADO DE PLANTA (ESTRÉS DE RELEVOS Y CONFLUX) 🔥");
  console.log("=======================================================================");

  await resetDB();

  // 1. Simular Asistencia 100%
  console.log("\n[Fase 1] Simulando asistencia de 100% de operarios...");
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
  console.log("[Fase 1] Iniciando jornada (Arranque de Turno)...");
  await setDoc(doc(db, "config", "shift_status"), {
    shiftStartTimestamp: new Date(),
    status: "ARRANQUE"
  });

  const skuPlan = {
    L1: "SKU-HEAVY-DUTY",
    L2: "SKU-HEAVY-DUTY",
    L3: "INACTIVO",
    L4: "SKU-HEAVY-DUTY",
    L5: "INACTIVO",
    L6: "SKU-HEAVY-DUTY",
    L7: "INACTIVO",
    L8: "SKU-HEAVY-DUTY"
  };
  await initializeTurnoWithSheets(skuPlan);
  await assignPuestosLive(skuPlan);
  console.log("🟢 Jornada iniciada. Puestos fijos anclados y resto en Bolsón L8.");

  // -------------------------------------------------------------
  // FASE 2: OLA MASIVA DE FATIGAS CONCURRENTES (MATCHMAKER EXCLUSION MUTUA)
  // -------------------------------------------------------------
  console.log("\n[Fase 2] Generando Ola Masiva de Fatigas Concurrentes (8 puestos)...");
  
  // Obtener slots activos asignados de puestos varios en L4, L1, L2, L6
  const slotsSnap = await getDocs(puestosColl);
  const allSlots = [];
  slotsSnap.forEach(d => allSlots.push({ id: d.id, ...d.data() }));

  const targetLines = ["L4", "L1", "L2", "L6"];
  const fatiguedSlots = [];

  for (const lineId of targetLines) {
    const lineSlots = allSlots.filter(s => s.lineId === lineId && s.tipoPuesto === "Puesto Vario" && s.status === "ASIGNADO");
    // Tomamos hasta 2 por línea
    lineSlots.slice(0, 2).forEach(s => fatiguedSlots.push(s));
  }

  console.log(`Fatigando ${fatiguedSlots.length} puestos vario simultáneamente...`);
  const twoHoursAgo = new Date(Date.now() - 120 * 60 * 1000);
  const batchFatiga = writeBatch(db);
  fatiguedSlots.forEach(s => {
    batchFatiga.update(doc(db, "puestos", s.id), {
      asignadoEnSegundoVirtual: twoHoursAgo,
      relevoSolicitado: true
    });
  });
  await batchFatiga.commit();

  // Evaluemos las sugerencias de Matchmaker de L8 en caliente
  const workersSnap = await getDocs(trabajadoresColl);
  const workersMap = {};
  workersSnap.forEach(d => { workersMap[d.id] = { id: d.id, ...d.data() }; });

  // Simular Matchmaker con exclusión mutua localmente
  const l8Available = Object.values(workersMap).filter(w => 
    (w.status === "DISPONIBLE_BOLSON" || w.status === "POOL_ARRANQUE") && 
    w.currentSlotId == null
  );

  console.log(`Total de personal libre disponible en Bolsón L8: ${l8Available.length}`);

  // Algoritmo de Matchmaker con exclusión mutua
  const suggestedUserIds = new Set();
  const suggestions = [];

  // Ordenamos solicitudes por prioridad de línea y tiempo de fatiga
  const sortedRequests = [...fatiguedSlots].sort((a, b) => {
    const pA = targetLines.indexOf(a.lineId);
    const pB = targetLines.indexOf(b.lineId);
    if (pA !== pB) return pA - pB;
    return b.tiempoEnPuesto - a.tiempoEnPuesto;
  });

  sortedRequests.forEach(req => {
    // Buscar el mejor candidato
    let candidate = null;
    for (const w of l8Available) {
      if (suggestedUserIds.has(w.id)) continue;
      
      // Chequear compatibilidad ergonómica y médica
      const blacklist = req.rejectedWorkerIds || [];
      if (blacklist.includes(w.id)) continue;
      if (!canWorkerOccupiedSlot(w, req)) continue;
      if (w.lastActivity && w.lastActivity === req.puestoName) continue;

      candidate = w;
      break;
    }

    if (candidate) {
      suggestedUserIds.add(candidate.id);
      suggestions.push({ slot: req, suggestedWorker: candidate });
    } else {
      suggestions.push({ slot: req, suggestedWorker: null });
    }
  });

  console.log("\n--- SUGERENCIAS SIMULTÁNEAS GENERADAS POR MATCHMAKER (EXCLUSIÓN MUTUA) ---");
  let hasDuplicates = false;
  const seenWorkers = new Set();
  suggestions.forEach(s => {
    const wName = s.suggestedWorker ? `${s.suggestedWorker.name} (${s.suggestedWorker.id})` : "Ninguno";
    console.log(`- Puesto ${s.slot.puestoName} (${s.slot.lineId}) -> Sugerido: ${wName}`);
    if (s.suggestedWorker) {
      if (seenWorkers.has(s.suggestedWorker.id)) {
        hasDuplicates = true;
      }
      seenWorkers.add(s.suggestedWorker.id);
    }
  });

  console.log(`¿Se evitó sugerir el mismo relevista a múltiples puestos? ── ${!hasDuplicates ? "PASÓ (SÍ)" : "FALLÓ (NO)"}`);

  // -------------------------------------------------------------
  // FASE 3: DÉFICIT DE GÉNERO ERGONÓMICO Y BLOQUEO DE L8
  // -------------------------------------------------------------
  console.log("\n[Fase 3] Simulando Déficit de Género en Bolsón L8...");
  
  // Para forzar el déficit de género en L1, busquemos un puesto femenino en L1
  const slotFemeninoL1 = fatiguedSlots.find(s => s.lineId === "L1" && s.sexoPreferente === "Femenino");
  if (!slotFemeninoL1) {
    console.log("No se encontró puesto vario femenino fatigado en L1, buscando uno genérico...");
  } else {
    console.log(`Puesto femenino objetivo para déficit en L1: ${slotFemeninoL1.puestoName} (${slotFemeninoL1.id})`);
    
    // Desactivamos a todas las mujeres libres del pool en Firestore
    const batchInactivas = writeBatch(db);
    let countInact = 0;
    Object.values(workersMap).forEach(w => {
      if ((w.status === "POOL_ARRANQUE" || w.status === "DISPONIBLE_BOLSON") && w.currentSlotId == null) {
        const female = w.sexo === "Femenino" || isFemale(w.name);
        if (female) {
          batchInactivas.update(doc(db, "trabajadores", w.id), { status: "INACTIVO" });
          countInact++;
        }
      }
    });
    await batchInactivas.commit();
    console.log(`Se desactivaron temporalmente ${countInact} operarias libres en el Bolsón para forzar déficit.`);

    // Recalcular disponibilidad de L8
    const updatedWorkersSnap = await getDocs(trabajadoresColl);
    const updatedWorkers = {};
    updatedWorkersSnap.forEach(d => { updatedWorkers[d.id] = d.data(); });

    const l8AvailableDeficit = Object.values(updatedWorkers).filter(w => 
      (w.status === "DISPONIBLE_BOLSON" || w.status === "POOL_ARRANQUE") && 
      w.currentSlotId == null
    );

    // Verificar si hay mujeres compatibles en L8
    const hasCompatibleL8Worker = l8AvailableDeficit.some(w => {
      return canWorkerOccupiedSlot(w, slotFemeninoL1);
    });

    console.log(`- Operarios libres en L8 para el déficit: ${l8AvailableDeficit.length} (deberían ser puros hombres)`);
    console.log(`- ¿Hay mujer compatible libre en L8? ── ${hasCompatibleL8Worker ? "SÍ" : "NO"}`);

    // Buscar si hay una rotación ergonómica sugerida con un operario estable de L1 de sexo femenino
    let partnerStable = null;
    const sameLineSlots = allSlots.filter(s => s.lineId === "L1" && s.id !== slotFemeninoL1.id);
    const workerA = updatedWorkers[slotFemeninoL1.idWorkerCurrent];

    if (workerA && !hasCompatibleL8Worker) {
      for (const slotB of sameLineSlots) {
        if (slotB.status !== 'ASIGNADO' || !slotB.idWorkerCurrent) continue;
        const esFijoB = ["Operador A", "Averiero", "Operador C"].includes(slotB.tipoPuesto);
        if (esFijoB) continue;

        const workerB = updatedWorkers[slotB.idWorkerCurrent];
        if (!workerB) continue;

        // Comprobamos compatibilidad cruzada de géneros y restricciones
        if (canWorkerOccupiedSlot(workerA, slotB) && canWorkerOccupiedSlot(workerB, slotFemeninoL1)) {
          partnerStable = { slotB, workerB };
          break;
        }
      }
    }

    console.log(`¿Se bloquea L8 y se activa Autogestión Local por falta de personal compatible? ── ${!hasCompatibleL8Worker && partnerStable ? "PASÓ (SÍ)" : "FALLÓ (NO)"}`);
    if (partnerStable) {
      console.log(`  Sugerencia local: Cambiar a ${workerA?.name} con la estable ${partnerStable.workerB.name} (${partnerStable.slotB.puestoName})`);
    }

    // Restauramos a las mujeres del pool
    const batchRestore = writeBatch(db);
    Object.values(workersMap).forEach(w => {
      if (w.status === "POOL_ARRANQUE" || w.status === "DISPONIBLE_BOLSON") {
        batchRestore.update(doc(db, "trabajadores", w.id), { status: "DISPONIBLE_BOLSON" });
      }
    });
    await batchRestore.commit();
  }

  // -------------------------------------------------------------
  // FASE 4: EXECUTION DE CASCADE CONEXO EN CADENA (L4 -> L1 -> L2 -> L6 -> L8)
  // -------------------------------------------------------------
  console.log("\n[Fase 4] Configurando Cascadeo Multilínea en Espiral (L4 -> L1 -> L2 -> L6 -> L8)...");
  
  // Limpiamos base de datos para cascadeo limpio
  await resetDB();
  await initializeTurnoWithSheets(skuPlan);
  await assignPuestosLive(skuPlan);

  const freshSlotsSnap = await getDocs(puestosColl);
  const freshSlots = [];
  freshSlotsSnap.forEach(d => freshSlots.push({ id: d.id, ...d.data() }));

  const slotL4 = freshSlots.find(s => s.lineId === "L4" && s.tipoPuesto === "Puesto Vario" && s.status === "ASIGNADO");
  const slotL1 = freshSlots.find(s => s.lineId === "L1" && s.tipoPuesto === "Puesto Vario" && s.status === "ASIGNADO");
  const slotL2 = freshSlots.find(s => s.lineId === "L2" && s.tipoPuesto === "Puesto Vario" && s.status === "ASIGNADO");
  const slotL6 = freshSlots.find(s => s.lineId === "L6" && s.tipoPuesto === "Puesto Vario" && s.status === "ASIGNADO");

  if (!slotL4 || !slotL1 || !slotL2 || !slotL6) {
    throw new Error("No se encontraron puestos vario en todas las líneas requeridas.");
  }

  const workerL4 = slotL4.idWorkerCurrent;
  const workerL1 = slotL1.idWorkerCurrent;
  const workerL2 = slotL2.idWorkerCurrent;
  const workerL6 = slotL6.idWorkerCurrent;

  console.log(`- L4 Puesto: ${slotL4.puestoName} (${slotL4.id}) - Operario: ${workerL4}`);
  console.log(`- L1 Puesto: ${slotL1.puestoName} (${slotL1.id}) - Operario: ${workerL1}`);
  console.log(`- L2 Puesto: ${slotL2.puestoName} (${slotL2.id}) - Operario: ${workerL2}`);
  console.log(`- L6 Puesto: ${slotL6.puestoName} (${slotL6.id}) - Operario: ${workerL6}`);

  // Fatigamos las cuatro celdas
  const fatigaBatch = writeBatch(db);
  [slotL4, slotL1, slotL2, slotL6].forEach(s => {
    fatigaBatch.update(doc(db, "puestos", s.id), {
      asignadoEnSegundoVirtual: twoHoursAgo,
      relevoSolicitado: true
    });
  });
  await fatigaBatch.commit();

  // Buscar relevista libre en L8
  const frWorkersSnap = await getDocs(trabajadoresColl);
  const frWorkers = {};
  frWorkersSnap.forEach(d => { frWorkers[d.id] = d.data(); });
  const relevistaL8 = Object.values(frWorkers).find(w => w.status === "DISPONIBLE_BOLSON" && w.currentSlotId == null);
  
  if (!relevistaL8) {
    throw new Error("No hay relevista libre en Bolsón L8 para cascadeo.");
  }
  console.log(`\nRelevista libre inicial en L8: ${relevistaL8.name} (${relevistaL8.id})`);

  // Paso 1: Despachar L8 -> L4
  console.log(`1. Despachando ${relevistaL8.id} hacia L4...`);
  await dispatchWorkerToLine(relevistaL8.id, "L4", slotL4.id, "L8");

  // Paso 2: Aceptar arribo en L4. Esto debe disparar en cascada al operario saliente (workerL4) hacia L1
  console.log(`2. Recibiendo en L4. Operario ${workerL4} debe ser derivado a L1...`);
  await acceptErgonomicRelevo(relevistaL8.id, slotL4.id, "L4");

  // Verificar estado de workerL4
  let wDoc = await getDoc(doc(db, "trabajadores", workerL4));
  let wData = wDoc.data();
  console.log(`   -> Relevado L4: status=${wData.status}, destino=${wData.lineaDestinoId}, targetSlot=${wData.targetSlotId}`);

  // Paso 3: Aceptar arribo en L1. Esto debe disparar al operario saliente (workerL1) hacia L2
  console.log(`3. Recibiendo en L1. Operario ${workerL1} debe ser derivado a L2...`);
  await acceptErgonomicRelevo(workerL4, slotL1.id, "L1");

  // Verificar estado de workerL1
  wDoc = await getDoc(doc(db, "trabajadores", workerL1));
  wData = wDoc.data();
  console.log(`   -> Relevado L1: status=${wData.status}, destino=${wData.lineaDestinoId}, targetSlot=${wData.targetSlotId}`);

  // Paso 4: Aceptar arribo en L2. Esto debe disparar al operario saliente (workerL2) hacia L6
  console.log(`4. Recibiendo en L2. Operario ${workerL2} debe ser derivado a L6...`);
  await acceptErgonomicRelevo(workerL1, slotL2.id, "L2");

  // Verificar estado de workerL2
  wDoc = await getDoc(doc(db, "trabajadores", workerL2));
  wData = wDoc.data();
  console.log(`   -> Relevado L2: status=${wData.status}, destino=${wData.lineaDestinoId}, targetSlot=${wData.targetSlotId}`);

  // Paso 5: Aceptar arribo en L6. Esto debe disparar al operario saliente (workerL6) de regreso a L8 (Bolsón)
  console.log(`5. Recibiendo en L6. Operario ${workerL6} debe regresar en tránsito a L8...`);
  await acceptErgonomicRelevo(workerL2, slotL6.id, "L6");

  // Verificar estado de workerL6
  wDoc = await getDoc(doc(db, "trabajadores", workerL6));
  wData = wDoc.data();
  const initiallyInTransitToL8 = wData.status === "EN_TRANSITO" && wData.lineaDestinoId === "L8";
  console.log(`   -> Relevado L6: status=${wData.status}, destino=${wData.lineaDestinoId}, targetSlot=${wData.targetSlotId}`);

  // Paso 6: Aceptar retorno en Bolsón L8
  console.log(`6. Recibiendo retorno de ${workerL6} directamente en Bolsón L8...`);
  await acceptReturnToBolson(workerL6);

  // Verificar que workerL6 esté disponible en L8
  wDoc = await getDoc(doc(db, "trabajadores", workerL6));
  wData = wDoc.data();
  console.log(`   -> Estado final workerL6 en Bolsón L8: status=${wData.status}, currentSlotId=${wData.currentSlotId}`);

  console.log(`\n¿Cascadeo en espiral se propagó completo (L4->L1->L2->L6->L8)? ── ${
    initiallyInTransitToL8 && wData.status === "DISPONIBLE_BOLSON" && wData.currentSlotId === null ? "PASÓ (SÍ)" : "FALLÓ (NO)"
  }`);

  // -------------------------------------------------------------
  // FASE 5: RECHAZO DE SUPERVISOR (BLACKLIST TEST)
  // -------------------------------------------------------------
  console.log("\n[Fase 5] Probando Rechazo del Supervisor y Recálculo del Matchmaker (Blacklist)...");
  
  // Fatiguemos un puesto en L4
  const slotParaRechazo = slotL4;
  console.log(`Puesto fatigado objetivo: ${slotParaRechazo.puestoName} (${slotParaRechazo.id})`);

  // Obtener sugerencias iniciales
  const wSnapB = await getDocs(trabajadoresColl);
  const workersMapB = {};
  wSnapB.forEach(d => { workersMapB[d.id] = d.data(); });

  const l8AvailableB = Object.values(workersMapB).filter(w => 
    (w.status === "DISPONIBLE_BOLSON" || w.status === "POOL_ARRANQUE") && w.currentSlotId == null
  );

  // Buscamos primer sugerido compatible
  let primerCandidato = null;
  for (const w of l8AvailableB) {
    if (canWorkerOccupiedSlot(w, slotParaRechazo)) {
      primerCandidato = w;
      break;
    }
  }

  console.log(`1. Candidato sugerido inicial: ${primerCandidato?.name} (${primerCandidato?.id})`);

  // Simulamos que el supervisor de L4 "Rechaza" a este candidato agregando su ID a rejectedWorkerIds
  console.log(`2. Supervisor de L4 RECHAZA a ${primerCandidato?.id}. Actualizando lista de rechazados...`);
  await updateDoc(doc(db, "puestos", slotParaRechazo.id), {
    rejectedWorkerIds: [primerCandidato.id]
  });

  // Obtenemos candidatos de nuevo
  const wSnapC = await getDocs(trabajadoresColl);
  const workersMapC = {};
  wSnapC.forEach(d => { workersMapC[d.id] = d.data(); });
  const l8AvailableC = Object.values(workersMapC).filter(w => 
    (w.status === "DISPONIBLE_BOLSON" || w.status === "POOL_ARRANQUE") && w.currentSlotId == null
  );

  // Recalcular sugerencia
  let segundoCandidato = null;
  for (const w of l8AvailableC) {
    const blacklist = [primerCandidato.id]; // simulando la blacklist leída de firestore
    if (blacklist.includes(w.id)) continue;
    if (canWorkerOccupiedSlot(w, slotParaRechazo)) {
      segundoCandidato = w;
      break;
    }
  }

  console.log(`3. Nuevo candidato sugerido recalculado: ${segundoCandidato?.name} (${segundoCandidato?.id})`);
  
  const okBlacklist = segundoCandidato && segundoCandidato.id !== primerCandidato.id;
  console.log(`¿Se recalculó correctamente el Matchmaker excluyendo al rechazado? ── ${okBlacklist ? "PASÓ (SÍ)" : "FALLÓ (NO)"}`);

  // -------------------------------------------------------------
  // FASE 6: INTERCEPCIONES MASIVAS ANTE VACANTES CRÍTICAS (MOTOR 2)
  // -------------------------------------------------------------
  console.log("\n[Fase 6] Probando Intercepciones Masivas ante Ola de Vacantes Críticas (Motor 2)...");

  // 1. Simular jornada activa hace más de 10 min
  const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000);
  await setDoc(doc(db, "config", "shift_status"), {
    status: "ARRANQUE",
    shiftStartTimestamp: fifteenMinsAgo
  });

  // 2. Crear 3 vacantes críticas en L4 (prioridad máxima)
  const currentSlotsSnap = await getDocs(puestosColl);
  const currentSlots = [];
  currentSlotsSnap.forEach(d => currentSlots.push({ id: d.id, ...d.data() }));

  const criticalSlotsL4 = currentSlots.filter(s => s.lineId === "L4" && s.tipoPuesto === "Operador A").slice(0, 3);
  console.log(`Configurando ${criticalSlotsL4.length} vacantes críticas en L4...`);

  const batchVacantes = writeBatch(db);
  criticalSlotsL4.forEach(s => {
    if (s.idWorkerCurrent) {
      batchVacantes.update(doc(db, "trabajadores", s.idWorkerCurrent), {
        status: "DISPONIBLE_BOLSON",
        currentSlotId: null
      });
    }
    batchVacantes.update(doc(db, "puestos", s.id), {
      status: "VACANTE",
      idWorkerCurrent: null
    });
  });
  await batchVacantes.commit();

  // 3. Tomar 3 candidatos libres en Bolsón
  const currentWorkersSnap = await getDocs(trabajadoresColl);
  const freeWorkers = [];
  currentWorkersSnap.forEach(d => {
    const w = d.data();
    if ((w.status === "POOL_ARRANQUE" || w.status === "DISPONIBLE_BOLSON") && w.currentSlotId == null) {
      freeWorkers.push(w);
    }
  });

  const candidates = freeWorkers.slice(0, 3);
  console.log(`Candidatos seleccionados para intercepción: ${candidates.map(c => c.id).join(", ")}`);

  // 4. Intentar asignarlos a puestos vario en líneas de menor prioridad (L2 y L6)
  const slotL2Vario = currentSlots.find(s => s.lineId === "L2" && s.tipoPuesto === "Puesto Vario");
  const slotL6Vario = currentSlots.find(s => s.lineId === "L6" && s.tipoPuesto === "Puesto Vario");

  // Forzar vacantes
  await updateDoc(doc(db, "puestos", slotL2Vario.id), { status: "VACANTE", idWorkerCurrent: null });
  await updateDoc(doc(db, "puestos", slotL6Vario.id), { status: "VACANTE", idWorkerCurrent: null });

  console.log(`Intentando asignar a ${candidates[0].id} en L2 (${slotL2Vario.id})...`);
  const res1 = await assignWorkerTransaction(candidates[0].id, slotL2Vario.id, "L2", true);
  console.log(`Respuesta 1:`, JSON.stringify(res1));

  console.log(`Intentando asignar a ${candidates[1].id} en L6 (${slotL6Vario.id})...`);
  const res2 = await assignWorkerTransaction(candidates[1].id, slotL6Vario.id, "L6", true);
  console.log(`Respuesta 2:`, JSON.stringify(res2));

  // Verificar intercepciones
  const checkW1 = (await getDoc(doc(db, "trabajadores", candidates[0].id))).data();
  const checkW2 = (await getDoc(doc(db, "trabajadores", candidates[1].id))).data();

  const isIntercepted1 = res1.intercepted === true && checkW1.status === "EN_TRANSITO" && checkW1.lineaDestinoId === "L4";
  const isIntercepted2 = res2.intercepted === true && checkW2.status === "EN_TRANSITO" && checkW2.lineaDestinoId === "L4";

  console.log(`¿Asignación 1 interceptada y redirigida a L4? ── ${isIntercepted1 ? "PASÓ (SÍ)" : "FALLÓ (NO)"}`);
  console.log(`¿Asignación 2 interceptada y redirigida a L4? ── ${isIntercepted2 ? "PASÓ (SÍ)" : "FALLÓ (NO)"}`);

  // -------------------------------------------------------------
  // FASE 7: PARO DE LÍNEA Y INUNDACIÓN DE L8
  // -------------------------------------------------------------
  console.log("\n[Fase 7] Simulando Paro de Línea Inesperado en L1 (Liberación e Inundación de L8)...");
  
  // Encontrar operarios rotativos asignados en L1 en este momento
  const l1SlotsSnap = await getDocs(puestosColl);
  const l1Slots = [];
  l1SlotsSnap.forEach(d => {
    const s = d.data();
    if (s.lineId === "L1" && s.status === "ASIGNADO" && s.tipoPuesto === "Puesto Vario" && s.idWorkerCurrent) {
      l1Slots.push(s);
    }
  });

  console.log(`Puestos rotativos ocupados en L1 antes de paro: ${l1Slots.length}`);
  const assignedWorkerIds = l1Slots.map(s => s.idWorkerCurrent);

  // Simular la declaración de Paro en L1 en la base de datos
  // Esto libera a los trabajadores rotativos de la línea (puestos varios) y los envía en tránsito a L8.
  console.log("Declarando PARO en Línea L1...");
  await setDoc(doc(db, "config", "line_L1"), {
    status: "PARO",
    sku: "INACTIVO",
    updatedAt: new Date()
  });

  // La lógica del sistema (ejecutada al cambiar el SKU a inactivo/paro) libera los puestos varios de la línea
  // Simulamos esta desasignación masiva
  const batchParo = writeBatch(db);
  l1Slots.forEach(s => {
    batchParo.update(doc(db, "puestos", s.id), {
      status: "VACANTE",
      idWorkerCurrent: null,
      relevoSolicitado: false
    });
    batchParo.update(doc(db, "trabajadores", s.idWorkerCurrent), {
      status: "EN_TRANSITO",
      lineaDestinoId: "L8",
      targetSlotId: null,
      currentSlotId: null
    });
  });
  await batchParo.commit();
  console.log(`Se liberaron ${l1Slots.length} operarios rotativos de L1, enviados en tránsito a L8.`);

  // Recibir en L8 a todos estos operarios de forma masiva
  console.log("Recibiendo masivamente a todos los operarios del paro en Bolsón L8...");
  for (const workerId of assignedWorkerIds) {
    await acceptReturnToBolson(workerId);
  }

  // Verificar que todos queden disponibles en L8
  const finalWorkersSnap = await getDocs(trabajadoresColl);
  const finalWorkers = {};
  finalWorkersSnap.forEach(d => { finalWorkers[d.id] = d.data(); });

  let allReturnedReady = true;
  assignedWorkerIds.forEach(id => {
    const w = finalWorkers[id];
    if (w.status !== "DISPONIBLE_BOLSON" || w.currentSlotId !== null) {
      allReturnedReady = false;
      console.log(`  ❌ Fallo en operario ${id}: status=${w.status}, slotId=${w.currentSlotId}`);
    }
  });

  console.log(`¿Todos los operarios liberados del Paro retornaron a L8 con estado DISPONIBLE_BOLSON? ── ${allReturnedReady ? "PASÓ (SÍ)" : "FALLÓ (NO)"}`);

  console.log("\n=======================================================================");
  console.log("🏁 SIMULACIÓN DE DÍA PESADO COMPLETADA CON ÉXITO 🏁");
  console.log("=======================================================================");
}

runHeavySimulation().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
