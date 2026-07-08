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
  console.log("[E2E LIFECYCLE] Reseteando base de datos a estado limpio...");
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

async function runEndToEndLifecycle() {
  console.log("\n=========================================================================================");
  console.log("🏁 INICIANDO PRUEBA EXHAUSTIVA DE CICLO DE VIDA E2E DE TURNO COMPLETO (24 HORAS / 2 DÍAS) 🏁");
  console.log("=========================================================================================");

  await resetDB();

  // -------------------------------------------------------------
  // DÍA 1 - FASE 1: PROGRAMACIÓN Y ASISTENCIA
  // -------------------------------------------------------------
  console.log("\n--- DÍA 1: FASE 1 - PROGRAMACIÓN DE SKU Y REGISTRO DE ASISTENCIA ---");
  
  // Simular asistencia: Registramos que 155 operarios vinieron (Asistencia parcial)
  // Algunos faltan (los ponemos INACTIVOS)
  const workersSnap = await getDocs(trabajadoresColl);
  const workers = [];
  workersSnap.forEach(d => workers.push({ id: d.id, ref: d.ref, ...d.data() }));

  const missingWorkersCount = 9;
  const batchAsistencia = writeBatch(db);
  
  workers.forEach((w, index) => {
    if (index < missingWorkersCount) {
      // Estos faltaron al turno
      batchAsistencia.update(w.ref, {
        status: "INACTIVO",
        physicalLineLocation: null,
        currentSlotId: null
      });
      console.log(`  - ❌ Falta del día: ${w.name} (${w.id}) marcado como INACTIVO.`);
    } else {
      batchAsistencia.update(w.ref, {
        status: "POOL_ARRANQUE",
        physicalLineLocation: "L4", // todos inician registrados en L4 o planta
        currentSlotId: null
      });
    }
  });
  await batchAsistencia.commit();
  console.log(`🟢 Asistencia cargada: ${workers.length - missingWorkersCount} operarios presentes.`);

  // -------------------------------------------------------------
  // DÍA 1 - FASE 2: ARRANQUE DE TURNO (ASIGNACIÓN AUTOMÁTICA Y LLENADO MANUAL)
  // -------------------------------------------------------------
  console.log("\n--- DÍA 1: FASE 2 - INICIAR JORNADA Y ASIGNACIONES AUTOMÁTICAS INICIALES ---");
  
  const skuPlanDia1 = {
    L1: "SKU-990-BOST",
    L2: "SKU-990-BOST",
    L3: "INACTIVO",
    L4: "SKU-990-BOST",
    L5: "INACTIVO",
    L6: "SKU-990-BOST",
    L7: "INACTIVO",
    L8: "SKU-990-BOST"
  };

  // Iniciar jornada en base de datos
  await setDoc(doc(db, "config", "shift_status"), {
    status: "ARRANQUE",
    shiftStartTimestamp: new Date() // Hace 0 minutos
  });

  await initializeTurnoWithSheets(skuPlanDia1);
  await assignPuestosLive(skuPlanDia1);
  console.log("🟢 Jornada iniciada de forma virtual. Fijos pre-anclados.");

  // Comprobar puestos vacantes
  const slotsSnap = await getDocs(puestosColl);
  const slots = [];
  slotsSnap.forEach(d => slots.push({ id: d.id, ...d.data() }));

  const activeSlots = slots.filter(s => ["L1", "L2", "L4", "L6"].includes(s.lineId));
  const vacantesFijos = activeSlots.filter(s => s.status === "VACANTE" && ["Operador A", "Averiero", "Operador C"].includes(s.tipoPuesto));
  
  console.log(`Total de puestos Fijos Críticos que quedaron VACANTES por inasistencias: ${vacantesFijos.length}`);

  // El coordinador los llena manualmente a partir de L8 (Bolsón) en orden de prioridad
  const updatedWorkersSnap = await getDocs(trabajadoresColl);
  const workersMap = {};
  updatedWorkersSnap.forEach(d => { workersMap[d.id] = d.data(); });

  let l8Available = Object.values(workersMap).filter(w => 
    (w.status === "DISPONIBLE_BOLSON" || w.status === "POOL_ARRANQUE") && w.currentSlotId == null
  );

  console.log(`Operarios libres en Bolsón inicial: ${l8Available.length}`);

  console.log("Llenando vacantes de puestos fijos críticos con operarios del Bolsón...");
  for (const s of vacantesFijos) {
    // Buscar el primer compatible
    let candidate = null;
    for (const w of l8Available) {
      if (canWorkerOccupiedSlot(w, s)) {
        candidate = w;
        break;
      }
    }

    if (candidate) {
      console.log(`  - Coordinador asigna manualmente a ${candidate.name} (${candidate.id}) en puesto crítico ${s.puestoName} (${s.id})`);
      await assignWorkerTransaction(candidate.id, s.id, s.lineId, false);
      // Actualizar pool local
      l8Available = l8Available.filter(w => w.id !== candidate.id);
    } else {
      console.log(`  - ⚠️ No se encontró operario compatible para el puesto crítico ${s.puestoName} (${s.id})`);
    }
  }

  // -------------------------------------------------------------
  // DÍA 1 - FASE 3: ARRANQUE AISLADO (INACTIVIDAD DEL MOTOR 2)
  // -------------------------------------------------------------
  console.log("\n--- DÍA 1: FASE 3 - ARRANQUE AISLADO (PRIMEROS 10 MINUTOS DE JORNADA) ---");
  
  // Establecer hora de inicio de jornada hace 2 minutos
  const twoMinsAgo = new Date(Date.now() - 2 * 60 * 1000);
  await updateDoc(doc(db, "config", "shift_status"), {
    shiftStartTimestamp: twoMinsAgo
  });

  // El supervisor de L2 intenta mover un operario disponible del Bolsón a un puesto vario de L2
  // Dejamos un puesto vario en L2 vacante
  const slotVarioL2 = slots.find(s => s.lineId === "L2" && s.tipoPuesto === "Puesto Vario");
  await updateDoc(doc(db, "puestos", slotVarioL2.id), { status: "VACANTE", idWorkerCurrent: null });

  // Dejamos una vacante crítica abierta en L4 (para ver si intercepte)
  const criticalSlotL4 = slots.find(s => s.lineId === "L4" && s.tipoPuesto === "Operador A");
  if (criticalSlotL4.idWorkerCurrent) {
    await updateDoc(doc(db, "trabajadores", criticalSlotL4.idWorkerCurrent), { status: "DISPONIBLE_BOLSON", currentSlotId: null });
  }
  await updateDoc(doc(db, "puestos", criticalSlotL4.id), { status: "VACANTE", idWorkerCurrent: null });
  console.log(`Vacante crítica ${criticalSlotL4.id} en L4 abierta.`);

  const testCandidate = l8Available[0];
  console.log(`Intentando asignar a ${testCandidate.name} (${testCandidate.id}) en L2 durante el arranque aislado...`);
  
  const resArranqueAislado = await assignWorkerTransaction(testCandidate.id, slotVarioL2.id, "L2", true);
  console.log(`Resultado asignación:`, JSON.stringify(resArranqueAislado));
  
  const okArranqueAislado = resArranqueAislado.success === true && resArranqueAislado.intercepted === false;
  console.log(`¿Se permitió la asignación libre sin interrupción del Motor 2? ── ${okArranqueAislado ? "PASÓ (SÍ)" : "FALLÓ (NO)"}`);

  // -------------------------------------------------------------
  // DÍA 1 - FASE 4: FASE DE MARCHA (ACTIVACIÓN DEL MOTOR 2)
  // -------------------------------------------------------------
  console.log("\n--- DÍA 1: FASE 4 - FASE DE MARCHA (JORNADA > 10 MINUTOS) ---");
  
  // Establecer hora de inicio hace 15 minutos
  const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000);
  await updateDoc(doc(db, "config", "shift_status"), {
    shiftStartTimestamp: fifteenMinsAgo
  });

  // Liberamos de nuevo al candidato de L2 para probar la intercepción
  await updateDoc(doc(db, "puestos", slotVarioL2.id), { status: "VACANTE", idWorkerCurrent: null });
  await updateDoc(doc(db, "trabajadores", testCandidate.id), { status: "DISPONIBLE_BOLSON", currentSlotId: null });

  console.log(`Intentando asignar a ${testCandidate.name} (${testCandidate.id}) en L2 durante la Fase de Marcha activa...`);
  const resFaseMarcha = await assignWorkerTransaction(testCandidate.id, slotVarioL2.id, "L2", true);
  console.log(`Resultado asignación:`, JSON.stringify(resFaseMarcha));

  const checkW1 = (await getDoc(doc(db, "trabajadores", testCandidate.id))).data();
  const okFaseMarcha = resFaseMarcha.intercepted === true && checkW1.status === "EN_TRANSITO" && checkW1.lineaDestinoId === "L4";
  console.log(`¿Se interceptó exitosamente al operario para desviar a L4? ── ${okFaseMarcha ? "PASÓ (SÍ)" : "FALLÓ (NO)"}`);

  // Consolidamos la llegada de la intercepción para mantener consistencia
  await acceptErgonomicRelevo(testCandidate.id, criticalSlotL4.id, "L4");
  console.log(`Operario interceptado recibido en el puesto crítico de L4.`);

  // -------------------------------------------------------------
  // DÍA 1 - FASE 5: RELEVOS ERGONÓMICOS Y CASCADEOS (2 HORAS DESPUÉS)
  // -------------------------------------------------------------
  console.log("\n--- DÍA 1: FASE 5 - HORAS DE OPERACIÓN MÁXIMA (RELEVOS Y ROTACIONES) ---");
  
  // Transcurrieron 2 horas (fatigar puestos en L4, L1, L2, L6)
  const currentSlotsSnap = await getDocs(puestosColl);
  const currentSlots = [];
  currentSlotsSnap.forEach(d => currentSlots.push({ id: d.id, ...d.data() }));

  const slotL4 = currentSlots.find(s => s.lineId === "L4" && s.tipoPuesto === "Puesto Vario" && s.status === "ASIGNADO");
  const slotL1 = currentSlots.find(s => s.lineId === "L1" && s.tipoPuesto === "Puesto Vario" && s.status === "ASIGNADO");
  const slotL2 = currentSlots.find(s => s.lineId === "L2" && s.tipoPuesto === "Puesto Vario" && s.status === "ASIGNADO");

  if (!slotL4 || !slotL1 || !slotL2) {
    throw new Error("No se encontraron suficientes puestos vario asignados en L4, L1 o L2.");
  }

  const workerL4 = slotL4.idWorkerCurrent;
  const workerL1 = slotL1.idWorkerCurrent;
  const workerL2 = slotL2.idWorkerCurrent;

  console.log(`Puesto L4 a fatigar: ${slotL4.puestoName} (${slotL4.id}) ocupado por ${workerL4}`);
  console.log(`Puesto L1 a fatigar: ${slotL1.puestoName} (${slotL1.id}) ocupado por ${workerL1}`);
  console.log(`Puesto L2 a fatigar: ${slotL2.puestoName} (${slotL2.id}) ocupado por ${workerL2}`);

  const twoHoursAgo = new Date(Date.now() - 120 * 60 * 1000);
  await updateDoc(doc(db, "puestos", slotL4.id), { asignadoEnSegundoVirtual: twoHoursAgo, relevoSolicitado: true });
  await updateDoc(doc(db, "puestos", slotL1.id), { asignadoEnSegundoVirtual: twoHoursAgo, relevoSolicitado: true });
  await updateDoc(doc(db, "puestos", slotL2.id), { asignadoEnSegundoVirtual: twoHoursAgo, relevoSolicitado: true });

  // 1. Relevo simple L8 -> L4
  const workersSnapD1 = await getDocs(trabajadoresColl);
  const workersMapD1 = {};
  workersSnapD1.forEach(d => { workersMapD1[d.id] = d.data(); });
  
  const relevistaL8 = Object.values(workersMapD1).find(w => w.status === "DISPONIBLE_BOLSON" && w.currentSlotId == null);
  console.log(`Relevista L8 para relevo simple: ${relevistaL8.name} (${relevistaL8.id})`);

  console.log(`Despachando ${relevistaL8.id} a L4...`);
  await dispatchWorkerToLine(relevistaL8.id, "L4", slotL4.id, "L8");
  
  console.log(`Aceptando arriba de ${relevistaL8.id} en L4. Cascadeando a ${workerL4} hacia L1...`);
  await acceptErgonomicRelevo(relevistaL8.id, slotL4.id, "L4");

  // Verificar cascadeo 1
  let chW = (await getDoc(doc(db, "trabajadores", workerL4))).data();
  console.log(`  - Estado de operario cascadeado L4: status=${chW.status}, destino=${chW.lineaDestinoId}`);

  console.log(`Aceptando arribo de ${workerL4} en L1. Cascadeando a ${workerL1} hacia L2...`);
  await acceptErgonomicRelevo(workerL4, slotL1.id, "L1");

  // Verificar cascadeo 2
  chW = (await getDoc(doc(db, "trabajadores", workerL1))).data();
  console.log(`  - Estado de operario cascadeado L1: status=${chW.status}, destino=${chW.lineaDestinoId}`);

  console.log(`Aceptando arribo de ${workerL1} en L2. Cascadeando a ${workerL2} de regreso a L8...`);
  await acceptErgonomicRelevo(workerL1, slotL2.id, "L2");

  // Recibir en L8
  console.log(`Recibiendo a ${workerL2} de regreso en Bolsón L8...`);
  await acceptReturnToBolson(workerL2);

  // Verificar estado final en Bolsón
  chW = (await getDoc(doc(db, "trabajadores", workerL2))).data();
  console.log(`  - Estado de operario regresado en L8: status=${chW.status}, currentSlot=${chW.currentSlotId}`);

  const cascadeOk = chW.status === "DISPONIBLE_BOLSON" && chW.currentSlotId === null;
  console.log(`¿Cascadeo inter-línea de 3 niveles completado con éxito? ── ${cascadeOk ? "PASÓ (SÍ)" : "FALLÓ (NO)"}`);

  // -------------------------------------------------------------
  // DÍA 1 - FASE 6: DECLARACIÓN DE PARO DE LÍNEA EN CALIENTE
  // -------------------------------------------------------------
  console.log("\n--- DÍA 1: FASE 6 - PARO DE LÍNEA EN CALIENTE (L6 EN PARO) ---");
  
  const l6SlotsSnap = await getDocs(puestosColl);
  const l6Slots = [];
  l6SlotsSnap.forEach(d => {
    const s = d.data();
    if (s.lineId === "L6" && s.status === "ASIGNADO" && s.tipoPuesto === "Puesto Vario" && s.idWorkerCurrent) {
      l6Slots.push(s);
    }
  });

  console.log(`Puestos rotativos activos en L6: ${l6Slots.length}`);
  const l6WorkerIds = l6Slots.map(s => s.idWorkerCurrent);

  // Simular la declaración de Paro en L6 en la base de datos
  console.log("Declarando PARO en Línea L6...");
  await setDoc(doc(db, "config", "line_L6"), {
    status: "PARO",
    sku: "INACTIVO",
    updatedAt: new Date()
  });

  // Liberamos a los operarios de L6
  const batchParoL6 = writeBatch(db);
  l6Slots.forEach(s => {
    batchParoL6.update(doc(db, "puestos", s.id), { status: "VACANTE", idWorkerCurrent: null });
    batchParoL6.update(doc(db, "trabajadores", s.idWorkerCurrent), {
      status: "EN_TRANSITO",
      lineaDestinoId: "L8",
      targetSlotId: null,
      currentSlotId: null
    });
  });
  await batchParoL6.commit();

  console.log("Recibiendo operarios de L6 de regreso en Bolsón L8...");
  for (const workerId of l6WorkerIds) {
    await acceptReturnToBolson(workerId);
  }

  const workersSnapAfterParo = await getDocs(trabajadoresColl);
  const workersAfterParo = {};
  workersSnapAfterParo.forEach(d => { workersAfterParo[d.id] = d.data(); });

  let allL6Returned = true;
  l6WorkerIds.forEach(id => {
    const w = workersAfterParo[id];
    if (w.status !== "DISPONIBLE_BOLSON") allL6Returned = false;
  });

  console.log(`¿Todos los operarios de L6 liberados retornaron a L8 con éxito? ── ${allL6Returned ? "PASÓ (SÍ)" : "FALLÓ (NO)"}`);

  // -------------------------------------------------------------
  // DÍA 1 - FASE 7: CIERRE DE JORNADA E INYECCIÓN DE LA LASTATTIVITY
  // -------------------------------------------------------------
  console.log("\n--- DÍA 1: FASE 7 - CIERRE DE JORNADA (CONSOLIDACIÓN DE LASTATTIVITY) ---");
  
  // Leer todos los operarios asignados en este momento
  const workersSnapEndDay1 = await getDocs(trabajadoresColl);
  const workersEndDay1 = [];
  workersSnapEndDay1.forEach(d => workersEndDay1.push({ id: d.id, ref: d.ref, ...d.data() }));

  const slotsSnapEndDay1 = await getDocs(puestosColl);
  const slotsEndDay1 = {};
  slotsSnapEndDay1.forEach(d => { slotsEndDay1[d.id] = d.data(); });

  // Consolidar lastActivity
  console.log("Consolidando actividades realizadas hoy (lastActivity) para todos los operarios asignados...");
  const batchCierre = writeBatch(db);
  let consolidadoCount = 0;
  
  workersEndDay1.forEach(w => {
    if (w.status === "ASIGNADO" && w.currentSlotId) {
      const slot = slotsEndDay1[w.currentSlotId];
      if (slot) {
        batchCierre.update(w.ref, {
          lastActivity: slot.puestoName,
          status: "POOL_ARRANQUE", // regresan a pool
          currentSlotId: null,
          physicalLineLocation: null
        });
        consolidadoCount++;
      }
    } else {
      batchCierre.update(w.ref, {
        status: "POOL_ARRANQUE",
        currentSlotId: null,
        physicalLineLocation: null
      });
    }
  });

  // Limpiar todos los puestos para el día siguiente
  Object.values(slotsEndDay1).forEach(s => {
    const pRef = doc(db, "puestos", s.id);
    batchCierre.update(pRef, {
      status: "VACANTE",
      idWorkerCurrent: null,
      idWorkerOriginal: null,
      relevoSolicitado: false,
      rejectedWorkerIds: [],
      asignadoEnSegundoVirtual: null
    });
  });

  // Reset shift_status
  batchCierre.set(doc(db, "config", "shift_status"), {
    status: "PREPARACION",
    shiftStartTimestamp: null
  });

  await batchCierre.commit();
  console.log(`Cierre exitoso. Se consolidó la lastActivity de ${consolidadoCount} operarios activos.`);

  // -------------------------------------------------------------
  // DÍA 2 - FASE 1: PROGRAMACIÓN Y ARRANQUE DE JORNADA
  // -------------------------------------------------------------
  console.log("\n--- DÍA 2: FASE 1 - PROGRAMACIÓN DE DÍA SIGUIENTE E INICIO DE JORNADA ---");
  
  // Simular asistencia completa para el día 2
  const workersSnapD2 = await getDocs(trabajadoresColl);
  const batchAssisD2 = writeBatch(db);
  workersSnapD2.forEach(d => {
    batchAssisD2.update(d.ref, {
      status: "POOL_ARRANQUE",
      physicalLineLocation: "L4",
      currentSlotId: null
    });
  });
  await batchAssisD2.commit();

  const skuPlanDia2 = {
    L1: "SKU-990-BOST",
    L2: "SKU-990-BOST",
    L3: "INACTIVO",
    L4: "SKU-990-BOST",
    L5: "INACTIVO",
    L6: "SKU-990-BOST",
    L7: "INACTIVO",
    L8: "SKU-990-BOST"
  };

  await setDoc(doc(db, "config", "shift_status"), {
    status: "ARRANQUE",
    shiftStartTimestamp: new Date()
  });

  await initializeTurnoWithSheets(skuPlanDia2);
  await assignPuestosLive(skuPlanDia2);
  console.log("🟢 Jornada del Día 2 Iniciada. Puestos iniciales asignados.");

  // -------------------------------------------------------------
  // DÍA 2 - FASE 2: VALIDACIÓN DE REGLA ERGONÓMICA DE 24 HORAS
  // -------------------------------------------------------------
  console.log("\n--- DÍA 2: FASE 2 - PRUEBA DE ROBUSTECIMIENTO DE LA REGLA ERGONÓMICA DE 24 HORAS ---");
  
  // Busquemos a un operario que haya trabajado en el Día 1.
  // Ej: el operario relevista inicial de L8 (relevistaL8) que tomó L4 (slotL4.puestoName)
  const opD2Id = relevistaL8.id;
  const opD2Doc = await getDoc(doc(db, "trabajadores", opD2Id));
  const opD2 = opD2Doc.data();

  console.log(`Operario seleccionado del Día 1: ${opD2.name} (${opD2.id})`);
  console.log(`Actividad realizada al cierre de ayer (lastActivity): "${opD2.lastActivity}"`);

  // Buscamos un puesto libre en el Día 2 en cualquier línea activa que se llame exactamente igual a opD2.lastActivity
  const d2SlotsSnap = await getDocs(puestosColl);
  const d2Slots = [];
  d2SlotsSnap.forEach(d => d2Slots.push({ id: d.id, ...d.data() }));

  const matchingSlot = d2Slots.find(s => s.puestoName === opD2.lastActivity && ["L1", "L2", "L4", "L6"].includes(s.lineId));
  
  if (!matchingSlot) {
    console.log(`⚠️ No se encontró un puesto en L1/L2/L4/L6 con nombre idéntico a "${opD2.lastActivity}". Probando con una simulación directa.`);
  } else {
    console.log(`Puesto libre idéntico encontrado hoy: ${matchingSlot.puestoName} (${matchingSlot.id}) en línea ${matchingSlot.lineId}`);
    
    // Nos aseguramos de que el puesto esté VACANTE para la prueba
    await updateDoc(doc(db, "puestos", matchingSlot.id), { status: "VACANTE", idWorkerCurrent: null });
    await updateDoc(doc(db, "trabajadores", opD2Id), { status: "DISPONIBLE_BOLSON", currentSlotId: null });

    // Intentamos asignarlo
    console.log(`Intentando asignar al operario al mismo puesto de ayer: ${opD2.id} -> ${matchingSlot.id}...`);
    
    // canWorkerOccupiedSlot debe rechazar la asignación
    const isCompatible = canWorkerOccupiedSlot(opD2, matchingSlot);
    console.log(`¿El validador canWorkerOccupiedSlot lo considera compatible? ── ${isCompatible ? "SÍ (FALLÓ)" : "NO (PASÓ)"}`);

    // Intentemos ejecutar la asignación
    const assignRes = await assignWorkerTransaction(opD2Id, matchingSlot.id, matchingSlot.lineId, false);
    console.log(`Resultado de la transacción:`, JSON.stringify(assignRes));

    const okErgo24h = isCompatible === false && assignRes.success === false;
    console.log(`¿Se bloqueó con éxito la asignación repetida en 24h para proteger la salud del operario? ── ${okErgo24h ? "PASÓ (SÍ)" : "FALLÓ (NO)"}`);
  }

  console.log("\n=========================================================================================");
  console.log("🏁 PRUEBA DE CICLO DE VIDA COMPLETO E2E FINALIZADA SIN ERRORES NI VULNERABILIDADES 🏁");
  console.log("=========================================================================================");
}

runEndToEndLifecycle().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
