import "./loadEnv.js";
import { initializeApp, getApp, getApps } from "firebase/app";
import { getFirestore, doc, setDoc, getDoc, getDocs, updateDoc, collection, writeBatch } from "firebase/firestore";
import { REAL_PUESTOS, REAL_TRABAJADORES } from "../src/dev/realDataSeed.js";
import { initializeTurnoWithSheets, assignPuestosLive, startLineParoTransaction, endLineParoTransaction } from "../src/services/firebaseService.js";

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
  console.log("[Test Paros] Reseteando base de datos a estado limpio...");
  const snapPuestos = await getDocs(puestosColl);
  const snapTrabajadores = await getDocs(trabajadoresColl);

  const batch = writeBatch(db);
  snapPuestos.forEach(d => batch.delete(d.ref));
  snapTrabajadores.forEach(d => batch.delete(d.ref));
  await batch.commit();

  const insertBatch = writeBatch(db);
  insertBatch.set(doc(db, "config", "global_priority"), {
    activeLines: ["L4", "L1", "L2", "L6", "L8"],
    priorityOrder: ["L4", "L1", "L2", "L6", "L8"],
    skuAssigned: "SKU-990-BOST"
  });

  insertBatch.set(doc(db, "config", "shift_status"), {
    shiftStartTimestamp: null,
    status: "PREPARACION"
  });

  const lines = ["L1", "L2", "L4", "L6", "L8"];
  lines.forEach(lineId => {
    insertBatch.set(doc(db, "config", `line_${lineId}`), {
      status: "PREPARACION",
      fijosAssigned: false,
      sku: "SKU-990-BOST",
      paros: [],
      activeParo: null
    });
  });

  REAL_PUESTOS.forEach(p => insertBatch.set(doc(db, "puestos", p.id), p));
  REAL_TRABAJADORES.forEach(w => insertBatch.set(doc(db, "trabajadores", w.id), w));
  await insertBatch.commit();
}

// Lógica de cálculo OEE adaptada del cliente para el test
function calculateOEELocal(lineState, puestosList, sku, mermas) {
  if (!lineState) return { oee: 95, availability: 100, performance: 100, quality: 100 };

  const startTimestamp = lineState?.turnStartTimestamp;
  let startMs = Date.now() - 3600000; // 1 hora atrás por defecto
  if (startTimestamp) {
    if (typeof startTimestamp.toDate === 'function') {
      startMs = startTimestamp.toDate().getTime();
    } else if (startTimestamp.seconds) {
      startMs = startTimestamp.seconds * 1000;
    } else {
      const ms = new Date(startTimestamp).getTime();
      if (!isNaN(ms)) startMs = ms;
    }
  }
  
  const totalElapsedSeconds = Math.max(60, Math.floor((Date.now() - startMs) / 1000));

  // Sumar tiempo de paros
  let totalParoSeconds = 0;
  if (lineState.paros) {
    lineState.paros.forEach(p => {
      totalParoSeconds += p.durationSeconds || 0;
    });
  }

  if (lineState.activeParo) {
    const paroStartMs = lineState.activeParo.startedAt?.toDate ? lineState.activeParo.startedAt.toDate().getTime() : new Date(lineState.activeParo.startedAt).getTime();
    totalParoSeconds += Math.max(0, Math.floor((Date.now() - paroStartMs) / 1000));
  }

  // Disponibilidad (Availability)
  const runSeconds = Math.max(0, totalElapsedSeconds - totalParoSeconds);
  const availability = totalElapsedSeconds > 0 ? (runSeconds / totalElapsedSeconds) : 1;

  // Velocidad nominal teórica
  let speedPerMin = 100;
  if (sku.includes("BOST")) speedPerMin = 120;

  // Producción Estimada
  const estimatedProduction = Math.max(100, Math.round((runSeconds * speedPerMin) / 60));

  // Mermas totales de proceso
  const processWaste = Object.values(mermas).reduce((acc, m) => acc + (parseInt(m.proceso) || 0), 0);

  // Calidad (Quality)
  const quality = estimatedProduction > 0 ? Math.max(0, Math.min(1, (estimatedProduction - processWaste) / estimatedProduction)) : 1;

  // Rendimiento (Performance)
  const totalSlots = puestosList.length || 8;
  const activeSlots = puestosList.filter(p => p.status === "ASIGNADO").length;
  const coverageFactor = totalSlots > 0 ? (activeSlots / totalSlots) : 1;
  const performance = lineState.status === "PREPARACION" ? 0 : (coverageFactor * 0.98);

  const oeeVal = Math.round(availability * performance * quality * 100);

  return {
    oee: oeeVal,
    availability: Math.round(availability * 100),
    performance: Math.round(performance * 100),
    quality: Math.round(quality * 100),
    estimatedProduction,
    processWaste
  };
}

async function runParosTest() {
  console.log("\n=========================================================");
  console.log("🚦 TEST DE COBERTURA: REGISTRO DE PAROS Y CÁLCULO DE OEE 🚦");
  console.log("=========================================================");

  try {
    await resetDB();

    const skuPlan = {
      L1: "SKU-990-BOST",
      L2: "SKU-990-BOST",
      L4: "SKU-990-BOST",
      L6: "SKU-990-BOST",
      L8: "SKU-990-BOST"
    };

    // 1. Iniciar Jornada
    console.log("\n1. Iniciando jornada...");
    await setDoc(doc(db, "config", "shift_status"), {
      status: "ARRANQUE",
      shiftStartTimestamp: new Date()
    });

    await initializeTurnoWithSheets(skuPlan);
    await assignPuestosLive(skuPlan);

    // Guardar timestamp de inicio del turno en la línea para OEE
    const turnStart = new Date(Date.now() - 30 * 60 * 1000); // Iniciado hace 30 minutos
    await updateDoc(doc(db, "config", "line_L4"), {
      turnStartTimestamp: turnStart,
      status: "PRODUCCION"
    });

    // 2. Comprobar operarios asignados en puestos varios de L4
    const snapPuestos1 = await getDocs(puestosColl);
    const slotsL4Varios = [];
    snapPuestos1.forEach(d => {
      const s = d.data();
      if (s.lineId === "L4" && s.tipoPuesto === "Puesto Vario" && s.status === "ASIGNADO") {
        slotsL4Varios.push({ id: d.id, ...s });
      }
    });

    console.log(`Puestos varios ocupados en L4 antes del Paro: ${slotsL4Varios.length}`);
    const originalOccupants = slotsL4Varios.map(s => s.idWorkerCurrent);
    console.log("Operarios asignados a puestos varios en L4:", originalOccupants);

    // 3. Registrar Paro Técnico en L4 (Categoría Mecánico, Causa Atasco de Cadena)
    console.log("\n2. Registrando Paro Técnico en Línea L4...");
    await startLineParoTransaction("L4", "MECÁNICO", "ATASCO_DE_CADENA", "Cadena de transporte principal bloqueada en zona de llenado.");

    // Validar en base de datos
    const snapPuestosPost = await getDocs(puestosColl);
    let allSlotsVacated = true;
    snapPuestosPost.forEach(d => {
      const s = d.data();
      if (s.lineId === "L4" && s.tipoPuesto === "Puesto Vario" && s.idWorkerCurrent !== null) {
        allSlotsVacated = false;
      }
    });

    const snapWorkersPost = await getDocs(trabajadoresColl);
    let allWorkersReturned = true;
    originalOccupants.forEach(wId => {
      snapWorkersPost.forEach(d => {
        if (d.id === wId) {
          const w = d.data();
          if (w.status !== "DISPONIBLE_BOLSON" || w.currentSlotId !== null || w.physicalLineLocation !== "L8") {
            allWorkersReturned = false;
            console.log(`  ❌ Error en ficha de operario ${wId}: status=${w.status}, slot=${w.currentSlotId}, location=${w.physicalLineLocation}`);
          }
        }
      });
    });

    console.log(`¿Se vaciaron todas las celdas varias de L4? ── ${allSlotsVacated ? "PASÓ (SÍ)" : "FALLÓ (NO)"}`);
    console.log(`¿Todos los operarios desalojados retornaron a L8 disponibles? ── ${allWorkersReturned ? "PASÓ (SÍ)" : "FALLÓ (NO)"}`);

    // 4. Calcular OEE reactivo en Paro
    console.log("\n3. Calculando métricas OEE durante el Paro...");
    const l4Doc = await getDoc(doc(db, "config", "line_L4"));
    const lineState = l4Doc.data();
    
    const postsL4List = [];
    (await getDocs(puestosColl)).forEach(d => {
      const s = d.data();
      if (s.lineId === "L4") postsL4List.push(s);
    });

    const mermasMock = {
      tapon: { inventario: 0, proceso: 10 },
      botella: { inventario: 0, proceso: 5 },
      estuche: { inventario: 0, proceso: 0 },
      etiqueta: { inventario: 0, proceso: 20 }
    };

    const oeeMetricsParo = calculateOEELocal(lineState, postsL4List, "SKU-990-BOST", mermasMock);
    console.log("Métricas OEE en Paro:", JSON.stringify(oeeMetricsParo, null, 2));
    console.log(`¿Rendimiento en Paro es 0% (debido a estado PREPARACION)? ── ${oeeMetricsParo.performance === 0 ? "PASÓ (SÍ)" : "FALLÓ (NO)"}`);
    console.log(`¿OEE es 0%? ── ${oeeMetricsParo.oee === 0 ? "PASÓ (SÍ)" : "FALLÓ (NO)"}`);

    // 5. Finalizar Paro Técnico (Reanudar Producción)
    console.log("\n4. Finalizando Paro Técnico y reanudando producción...");
    await endLineParoTransaction("L4");

    // Calcular OEE reactivo post-paro
    const l4DocPost = await getDoc(doc(db, "config", "line_L4"));
    const lineStatePost = l4DocPost.data();

    // Re-asignamos algunos operarios a L4 para simular producción
    await updateDoc(doc(db, "puestos", slotsL4Varios[0].id), { status: "ASIGNADO", idWorkerCurrent: originalOccupants[0] });

    const postsL4ListPost = [];
    (await getDocs(puestosColl)).forEach(d => {
      const s = d.data();
      if (s.lineId === "L4") postsL4ListPost.push(s);
    });

    const oeeMetricsPost = calculateOEELocal(lineStatePost, postsL4ListPost, "SKU-990-BOST", mermasMock);
    console.log("\nMétricas OEE Post-Paro (Producción Reanudada):", JSON.stringify(oeeMetricsPost, null, 2));

    const pastParosRecorded = lineStatePost.paros && lineStatePost.paros.length === 1 && lineStatePost.paros[0].durationSeconds >= 0;
    console.log(`¿Paro técnico guardado correctamente en el historial? ── ${pastParosRecorded ? "PASÓ (SÍ)" : "FALLÓ (NO)"}`);
    console.log(`¿Rendimiento Post-Paro recuperado (>0%)? ── ${oeeMetricsPost.performance > 0 ? "PASÓ (SÍ)" : "FALLÓ (NO)"}`);
    console.log(`¿OEE Post-Paro recuperado (>0%)? ── ${oeeMetricsPost.oee > 0 ? "PASÓ (SÍ)" : "FALLÓ (NO)"}`);

    console.log("\n=========================================================");
    console.log("🏁 TEST DE PAROS Y OEE COMPLETADO 🏁");
    console.log("=========================================================");
    process.exit(0);
  } catch (err) {
    console.error("Falla de ejecución en test de paros:", err);
    process.exit(1);
  }
}

runParosTest();
