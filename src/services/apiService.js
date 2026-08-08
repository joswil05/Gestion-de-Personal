/**
 * Service: Core de Conexión, Persistencia y Transacciones Firebase (apiService.js)
 * Responsabilidad: Gobernar la persistencia y reactividad de las Fases A y B del MVP.
 * Estilo de código: Producción limpio, modular, sin placeholders y totalmente tipado en lógica.
 * Versión de SDK: Firebase v10+ (Modular JS API)
 */

import { initializeApp, getApp, getApps } from "firebase/app";
import { isAppOnline } from "../skills/state-connectivity-guard.js";
import { getToken } from "./authService";
import {
  getFirestore,
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager,
  connectFirestoreEmulator,
  collection, 
  doc, 
  getDoc, 
  getDocs,
  getDocFromServer,
  getDocsFromServer,
  query,
  where,
  runTransaction, 
  serverTimestamp,
  writeBatch,
  setDoc,
  updateDoc
} from "firebase/firestore";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";

// 1. Configuración Oficial de Firebase (Producción)
const firebaseConfig = {
  apiKey: (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env.VITE_FIREBASE_API_KEY : (typeof process !== 'undefined' ? process.env.VITE_FIREBASE_API_KEY : undefined),
  authDomain: (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env.VITE_FIREBASE_AUTH_DOMAIN : (typeof process !== 'undefined' ? process.env.VITE_FIREBASE_AUTH_DOMAIN : undefined),
  projectId: (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env.VITE_FIREBASE_PROJECT_ID : (typeof process !== 'undefined' ? process.env.VITE_FIREBASE_PROJECT_ID : undefined),
  storageBucket: (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env.VITE_FIREBASE_STORAGE_BUCKET : (typeof process !== 'undefined' ? process.env.VITE_FIREBASE_STORAGE_BUCKET : undefined),
  messagingSenderId: (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID : (typeof process !== 'undefined' ? process.env.VITE_FIREBASE_MESSAGING_SENDER_ID : undefined),
  appId: (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env.VITE_FIREBASE_APP_ID : (typeof process !== 'undefined' ? process.env.VITE_FIREBASE_APP_ID : undefined)
};

// Inicialización de la Aplicación y Firestore con Caché Persistente Multitab (Capacitor)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

let dbInstance;
try {
  dbInstance = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager()
    })
  });
} catch (e) {
  console.warn("[Firebase] initializeFirestore already called, falling back to getFirestore:", e.message);
  dbInstance = getFirestore(app);
}

// Conectar a emuladores locales si VITE_USE_EMULATORS está activo
if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_USE_EMULATORS === 'true') {
  console.log("[Firebase] Conectando a emuladores locales (Firestore: 8080, Auth: 9099, Functions: 5001)...");
  try {
    connectFirestoreEmulator(dbInstance, 'localhost', 8080);
    connectAuthEmulator(getAuth(app), 'http://localhost:9099', { disableWarnings: true });
    connectFunctionsEmulator(getFunctions(app), 'localhost', 5001);
  } catch (emuErr) {
    console.warn("[Firebase] Emuladores ya conectados o no disponibles:", emuErr.message);
  }
}

export { app };
export const db = dbInstance;

// Referencias de colecciones esenciales
export const trabajadoresColl = collection(db, "trabajadores");
export const puestosColl = collection(db, "puestos");
export const configColl = collection(db, "config");

// --- CLOCK SYNCHRONIZATION ENGINE ---
let serverTimeOffset = 0;

export async function syncServerTimeOffset() {
  const syncRef = doc(db, "config", "time_sync");
  const clientBefore = Date.now();
  try {
    await setDoc(syncRef, {
      timestamp: serverTimestamp()
    });
    const snap = await getDoc(syncRef);
    const clientAfter = Date.now();
    if (snap.exists() && snap.data().timestamp) {
      const serverTime = snap.data().timestamp.toDate().getTime();
      const avgClientTime = (clientBefore + clientAfter) / 2;
      serverTimeOffset = serverTime - avgClientTime;
      console.log(`[Clock Sync] Servidor desfasado por ${serverTimeOffset}ms frente a cliente.`);
    }
  } catch (e) {
    console.warn("[Clock Sync] Error sincronizando hora de servidor, usando desfase 0:", e.message);
  }
}

export function getServerTimeOffset() {
  return serverTimeOffset;
}

// Puestos fijos/críticos (anclados por asistencia vía Motor 1) vs. puestos
// varios/rotativos (llenados manualmente por el supervisor vía QR).
// Centralizado aquí porque el literal se repetía 10 veces en este archivo.
const CRITICAL_TIPOS_PUESTO = ["Operador A", "Averiero", "Operador C"];

// --- PUENTE REST HACIA EL BACKEND SQL SERVER (server/server.js) ---
// Las funciones del flujo diario de Supervisor (asignar, liberar, baja
// temporal, relevo ergonómico, despacho entre líneas, Motor 1, paros,
// mermas, cierre de turno, intercambio local) ya no corren contra el mock de
// Firestore: hablan directamente con la API REST + SQL Server real.
// El resto de funciones de este archivo (planificación T+1, sugerencias de
// rotación) siguen sobre el mock hasta que se migren en una fase posterior.
const REST_API_URL = "http://localhost:3001/api";

const TIMEOUT_MS = 15000;

// Antes un backend colgado (o una red móvil de planta con cobertura
// intermitente) dejaba el fetch pendiente indefinidamente: sin timeout, la
// UI quedaba en su spinner de "Guardando..." para siempre en vez de
// mostrar un error accionable (AUDIT_REPORT.md M-9).
async function conTimeout(url, options, ms = TIMEOUT_MS) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } catch (err) {
    if (err.name === "AbortError") throw new Error("El servidor no respondió a tiempo.");
    throw err;
  } finally {
    clearTimeout(t);
  }
}

async function apiFetch(path, options = {}) {
  const token = getToken();
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const method = (options.method || "GET").toUpperCase();
  const url = `${REST_API_URL}${path}`;
  let response;
  try {
    response = await conTimeout(url, { ...options, headers });
  } catch (err) {
    // Reintentar UNA vez, solo si es idempotente (GET). POST/PATCH nunca se
    // reintentan aquí: los endpoints de asignación no son idempotentes y un
    // reintento automático podría duplicar un movimiento de personal.
    if (method !== "GET") throw err;
    await new Promise(r => setTimeout(r, 1000));
    response = await conTimeout(url, { ...options, headers });
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch (e) {
    // Respuesta sin cuerpo JSON (poco común, pero no debe tumbar el flujo)
  }

  if (!response.ok) {
    const message = (payload && payload.error) || `Error de red (HTTP ${response.status})`;
    throw new Error(message);
  }

  return payload;
}

/**
 * MOTOR 1: INYECCIÓN DE TURNO Y PRE-LLENADO DE PUESTOS FIJOS (Fase A)
 * Se ejecuta al iniciar la jornada. Vincula automáticamente el personal crítico y
 * maneja la lógica de Rastro Dual en caso de inasistencias de los titulares.
 * 
 * @param {object} skuData Objeto que contiene las líneas planificadas con su SKU asignado. Ej: { "L1": "SKU-990", "L4": "SKU-112" }
 */
export async function initializeTurnoWithSheets(skuData) {
  console.log("[Motor 1] Iniciando inyección del turno...");

  // NOTA (migración SQL Server, Fase 2): reemplaza el flujo Firestore
  // (lectura de config/global_priority + writeBatch masivo sobre
  // trabajadores/puestos) por una única transacción SQL real en
  // POST /coordinador/inyectar-turno (server/server.js). Esa transacción
  // suspende las líneas sin SKU hoy y auto-asigna puestos fijos/críticos
  // (Operador A/Averiero/Operador C) a operarios en POOL_ARRANQUE.
  //
  // Simplificación deliberada respecto a la versión anterior: no se porta el
  // "Rastro Dual" persistente (titular fijo de una máquina específica +
  // sustituto Operador B cuando falta) porque requiere una columna de
  // "titular permanente por puesto" que todavía no existe en el esquema SQL
  // (ver plan de Fase 2). El emparejamiento server-side usa
  // Operarios.PuestoBase cuando coincide con el tipo de puesto, y si no,
  // cualquier operario disponible que pase las reglas de salud/género/24h.
  // Activación de puestos SKU-dependientes y auto-asignación de supervisor
  // por plan del coordinador (pasos g.1/g.2 de la versión anterior) también
  // quedan fuera de esta ronda.
  const payload = await apiFetch("/coordinador/inyectar-turno", {
    method: "POST",
    body: JSON.stringify({ skuData })
  });

  console.log(`[Motor 1] Inyección completada: ${payload?.totalAsignados ?? 0} puestos fijos asignados.`);
  return {
    success: !!(payload && payload.success),
    totalAsignados: payload?.totalAsignados ?? 0,
    lineasActivas: payload?.lineasActivas ?? [],
    lineasInactivas: payload?.lineasInactivas ?? []
  };
}

/**
 * MOTOR DE ARRANQUE LOCAL DE LÍNEA: Inicializa una sola línea individualmente.
 * Se ejecuta cuando el supervisor presiona "Iniciar Línea [lineId]".
 * Vincula atómicamente el personal crítico fijo (Operador A, Averiero, Operador C) y 
 * establece el estado de esa línea en ARRANQUE.
 * 
 * @param {string} lineId ID de la línea a iniciar (ej. "L1", "L4")
 * @param {string} sku SKU asignado a la línea
 */
export async function initializeSingleLineTransaction(lineId, sku) {
  console.log(`[Motor Arranque Línea] Iniciando línea ${lineId} con SKU: ${sku}...`);
  
  try {
    // 1. Obtener todos los trabajadores que registraron asistencia (POOL_ARRANQUE)
    const snapshotTrabajadores = await getDocs(trabajadoresColl);
    const trabajadoresPresentes = {};
    snapshotTrabajadores.forEach(docSnap => {
      const data = docSnap.data();
      if (data.status === "POOL_ARRANQUE") {
        trabajadoresPresentes[docSnap.id] = { id: docSnap.id, ...data };
      }
    });

    // 2. Obtener los puestos asociados a esta línea
    const qSlots = query(puestosColl, where("lineId", "==", lineId));
    const snapshotPuestos = await getDocs(qSlots);
    const puestosDeLinea = [];
    snapshotPuestos.forEach(docSnap => {
      puestosDeLinea.push({ id: docSnap.id, ...docSnap.data() });
    });

    const batch = writeBatch(db);
    const asignadosEnLote = new Set();

    // 3. Procesar puestos
    for (const puesto of puestosDeLinea) {
      const esPuestoFijoCritico = CRITICAL_TIPOS_PUESTO.includes(puesto.tipoPuesto);
      
      if (!esPuestoFijoCritico) {
        // Los puestos varios se inician como VACANTE
        batch.update(doc(db, "puestos", puesto.id), {
          status: "VACANTE",
          idWorkerCurrent: null,
          updatedAt: serverTimestamp()
        });
        // Limpiar el estado y currentSlotId del operario que estaba asignado a este puesto varios
        if (puesto.idWorkerCurrent) {
          const workerPresent = trabajadoresPresentes[puesto.idWorkerCurrent];
          batch.update(doc(db, "trabajadores", puesto.idWorkerCurrent), {
            status: workerPresent ? "POOL_ARRANQUE" : "INACTIVO",
            currentSlotId: null,
            lineaDestinoId: null,
            physicalLineLocation: workerPresent ? lineId : null,
            updatedAt: serverTimestamp()
          });
        }
        continue;
      }

      // DEFENSA ABSOLUTA DE SEGURIDAD OPERATIVA: Si el puesto ya está asignado en Firestore, omitimos para no destruirlo
      if (puesto.idWorkerCurrent && puesto.status === "ASIGNADO") {
        console.log(`[Arranque Línea] El puesto ${puesto.id} ya se encuentra ASIGNADO a ${puesto.idWorkerCurrent}. Omitiendo.`);
        continue;
      }

      // Si es puesto fijo crítico (técnico)
      const titularId = puesto.idWorkerOriginal;
      const titularPresente = titularId && trabajadoresPresentes[titularId] && !asignadosEnLote.has(titularId);

      if (titularPresente) {
        // Asignación directa del titular
        batch.update(doc(db, "puestos", puesto.id), {
          status: "ASIGNADO",
          idWorkerCurrent: titularId,
          idWorkerOriginal: titularId,
          asignadoEnSegundoVirtual: serverTimestamp(),
          updatedAt: serverTimestamp()
        });

        batch.update(doc(db, "trabajadores", titularId), {
          status: "ASIGNADO",
          currentSlotId: puesto.id,
          lineaDestinoId: null,
          physicalLineLocation: lineId,
          updatedAt: serverTimestamp()
        });

        asignadosEnLote.add(titularId);
      } else {
        // LÓGICA INTELIGENTE DE REEMPLAZO TÉCNICO:
        // 1. Buscamos primero un operario libre del mismo rol técnico presente y desocupado
        let reemplazoId = Object.keys(trabajadoresPresentes).find(id => {
          const t = trabajadoresPresentes[id];
          return t.role === puesto.tipoPuesto && !asignadosEnLote.has(id);
        });

        // 2. Si no, buscamos un 'Operador B' calificado
        if (!reemplazoId) {
          reemplazoId = Object.keys(trabajadoresPresentes).find(id => {
            const t = trabajadoresPresentes[id];
            return t.role === "Operador B" && !asignadosEnLote.has(id);
          });
        }

        if (reemplazoId) {
          batch.update(doc(db, "puestos", puesto.id), {
            status: "ASIGNADO",
            idWorkerCurrent: reemplazoId,
            idWorkerOriginal: titularId,
            asignadoEnSegundoVirtual: serverTimestamp(),
            updatedAt: serverTimestamp(),
            microCopiaContextual: "Reemplazo automático - Titular ausente"
          });

          batch.update(doc(db, "trabajadores", reemplazoId), {
            status: "ASIGNADO",
            currentSlotId: puesto.id,
            lineaDestinoId: null,
            physicalLineLocation: lineId,
            updatedAt: serverTimestamp()
          });

          asignadosEnLote.add(reemplazoId);
        } else {
          // Queda en alerta vacante
          batch.update(doc(db, "puestos", puesto.id), {
            status: "ALERTA_VACANTE",
            idWorkerCurrent: null,
            idWorkerOriginal: titularId,
            updatedAt: serverTimestamp(),
            microCopiaContextual: "Crítico vacante sin relevo disponible"
          });
        }
      }
    }

    // 4. Actualizar el estado de la línea a ARRANQUE en config/line_[lineId]
    batch.set(doc(db, "config", `line_${lineId}`), {
      status: "ARRANQUE",
      fijosAssigned: true,
      sku: sku,
      updatedAt: serverTimestamp()
    }, { merge: true });

    // 5. Asegurar que el estado del turno global shift_status se active
    batch.set(doc(db, "config", "shift_status"), {
      status: "ARRANQUE",
      shiftStartTimestamp: serverTimestamp()
    }, { merge: true });

    // 6. Actualizar global_priority de forma reactiva
    const globalPriorityRef = doc(db, "config", "global_priority");
    const globalPriorityDoc = await getDoc(globalPriorityRef);
    let currentSkuPlan = {};
    let currentActiveLines = [];

    if (globalPriorityDoc.exists()) {
      const data = globalPriorityDoc.data();
      currentSkuPlan = data.skuPlan || {};
      currentActiveLines = data.activeLines || [];
    }

    currentSkuPlan[lineId] = sku;
    if (!currentActiveLines.includes(lineId)) {
      currentActiveLines.push(lineId);
    }

    batch.set(globalPriorityRef, {
      skuPlan: currentSkuPlan,
      activeLines: currentActiveLines
    }, { merge: true });

    await batch.commit();
    console.log(`[Motor Arranque Línea] Línea ${lineId} iniciada exitosamente.`);
    return { success: true, totalAsignados: asignadosEnLote.size };
  } catch (error) {
    console.error(`[Motor Arranque Línea] Error iniciando línea ${lineId}:`, error);
    throw error;
  }
}

/**
 * OFICIALIZADOR DE ARRANQUE DE LÍNEA: Cambia el estado de la línea a ARRANQUE,
 * sin sobreescribir ni borrar ninguna de las asignaciones manuales o por QR que el supervisor
 * ya haya realizado en su fase de preparación.
 *
 * NOTA (migración SQL Server, AUDIT_REPORT.md Fase 1 paso 1.5 Grupo B):
 * reemplaza el writeBatch contra el shim muerto de Firestore por
 * POST /lineas/:lineId/arrancar (server/server.js), una única transacción
 * SQL real.
 */
export async function startLineOfficially(lineId, sku) {
  console.log(`[Oficializador Arranque] Iniciando línea ${lineId} con SKU: ${sku}...`);
  await apiFetch(`/lineas/${lineId}/arrancar`, {
    method: "POST",
    body: JSON.stringify({ sku })
  });
  console.log(`[Oficializador Arranque] Línea ${lineId} oficializada exitosamente.`);
  return { success: true };
}

/**
 * AUTO-ASIGNADOR DE PUESTOS FIJOS/CRÍTICOS: Se ejecuta automáticamente al inicio
 * de la preparación de la línea. Vincula de forma atómica a los operarios fijos/titulares
 * (o reemplazos) que estén presentes en planta a sus celdas críticas, manteniendo la línea
 * en estado "PREPARACION" para que el supervisor continúe con la dotación manual/QR.
 *
 * NOTA (migración SQL Server, AUDIT_REPORT.md Fase 1 paso 1.5 Grupo B):
 * reemplaza el writeBatch contra el shim muerto de Firestore por
 * POST /lineas/:lineId/auto-asignar-fijos, que reutiliza server-side la
 * misma lógica de emparejamiento titular/reemplazo que ejecutarInyeccionDeTurno
 * (Motor 1), acotada a esta única línea (server/server.js,
 * autoAsignarCriticosDeLinea). El parámetro sku se conserva solo para
 * logging del llamador; la asignación de críticos no depende de él.
 */
export async function autoAssignFixedOperators(lineId, sku) {
  console.log(`[AutoAsignador Fijos] Iniciando auto-asignación para línea ${lineId} (SKU: ${sku})...`);
  const payload = await apiFetch(`/lineas/${lineId}/auto-asignar-fijos`, {
    method: "POST",
    body: JSON.stringify({ sku })
  });
  console.log(`[AutoAsignador Fijos] Línea ${lineId}: ${payload?.totalAsignados ?? 0} fijos asignados.`);
  return { success: true, totalAsignados: payload?.totalAsignados ?? 0 };
}

/**
 * FASE B: REGISTRO DE TRABAJADOR EN PUESTO (Exclusión mutua y validación local de arranque)
 * Gobierna el proceso de registro manual o por escaneo QR de operarios generales.
 * 
 * @param {string} workerId ID del operario a asignar
 * @param {string} puestoId ID del puesto / celda operativa destino
 * @param {string} supervisorLineId ID de la línea activa del supervisor solicitante
 * @param {boolean} allowInterception Permitir intercepción tardía a líneas de mayor prioridad (true por defecto en HUD)
 */
export async function assignWorkerTransaction(workerId, puestoId, supervisorLineId, allowInterception = true) {
  if (!workerId || !puestoId || !supervisorLineId) {
    throw new Error("Faltan parámetros obligatorios en la petición de asignación.");
  }

  // NOTA (migración SQL Server): reemplaza el flujo Firestore (offline-bypass +
  // runTransaction) por una llamada real a /api/puestos/asignar, que ya corre
  // en una transacción SQL con UPDLOCK/SERIALIZABLE y valida salud ocupacional
  // server-side (ver server/server.js y canWorkerOccupiedSlot.js). La
  // intercepción "Motor 2" (allowInterception, redirección automática a otra
  // línea de mayor prioridad) queda pendiente de migrar: por ahora este
  // parámetro se conserva en la firma mas no tiene efecto.
  console.log(`[Asignación] Asignando worker: ${workerId} -> puesto: ${puestoId} (línea ${supervisorLineId})`);

  const payload = await apiFetch("/puestos/asignar", {
    method: "POST",
    body: JSON.stringify({
      assignments: [{ slotId: Number(puestoId), workerId: Number(workerId) }]
    })
  });

  console.log(`[Asignación] ÉXITO: Asignación consolidada en servidor para ${workerId} -> ${puestoId}`);
  return {
    success: !!(payload && payload.success),
    assignedWorker: workerId,
    assignedSlot: puestoId,
    assignedAt: new Date().toISOString()
  };
}

/**
 * Permite desvincular transaccionalmente a un operario de su puesto actual
 * y regresarlo a la Línea 8 (Bolsón) en estado disponible.
 * 
 * @param {string} puestoId ID del puesto / celda operativa a vaciar
 * @param {string} workerId ID del operario a liberar
 * @param {string} supervisorLineId ID de la línea activa del supervisor solicitante
 */
export async function releaseWorkerTransaction(puestoId, workerId, supervisorLineId) {
  if (!puestoId || !workerId || !supervisorLineId) {
    throw new Error("Faltan parámetros obligatorios en la petición de liberación.");
  }

  console.log(`[Liberación] Liberando worker: ${workerId} de puesto: ${puestoId}`);

  await apiFetch("/puestos/relevo", {
    method: "POST",
    body: JSON.stringify({ action: "liberar", slotId: Number(puestoId) })
  });

  console.log(`[Liberación] ÉXITO: Operario ${workerId} liberado de ${puestoId} y enviado a Línea 8.`);
  return {
    success: true,
    releasedWorker: workerId,
    releasedSlot: puestoId,
    releasedAt: new Date().toISOString()
  };
}

/**
 * REGISTRAR BAJA TEMPORAL (Médica/Permiso)
 * Libera el puesto actual y cambia el estado del trabajador a BAJA_TEMPORAL.
 * 
 * @param {string} puestoId ID del puesto
 * @param {string} workerId ID del operario
 * @param {string} supervisorLineId ID de la línea
 */
export async function tempBajaWorkerTransaction(puestoId, workerId, supervisorLineId) {
  if (!puestoId || !workerId || !supervisorLineId) {
    throw new Error("Faltan parámetros obligatorios en la petición de baja temporal.");
  }

  console.log(`[Baja Temporal] Registrando baja para worker: ${workerId}`);

  await apiFetch("/puestos/relevo", {
    method: "POST",
    body: JSON.stringify({ action: "baja_temporal", slotId: Number(puestoId) })
  });

  console.log(`[Baja Temporal] ÉXITO: Operario ${workerId} asignado a BAJA_TEMPORAL.`);
  return { success: true };
}

/**
 * CONFIRMAR ARRIBO DE OPERARIO EN TRÁNSITO
 * Valida reactivamente y vincula al operario que llega físicamente a la línea.
 * 
 * @param {string} workerId ID del operario
 * @param {string} slotId ID del puesto de destino
 * @param {string} supervisorLineId ID de la línea del supervisor
 */
export async function confirmTransitWorkerArrival(workerId, slotId, supervisorLineId) {
  if (!workerId || !slotId || !supervisorLineId) {
    throw new Error("Parámetros incompletos para confirmar arribo.");
  }

  console.log(`[Arribo] Confirmando arribo para worker: ${workerId} -> slot: ${slotId}`);

  await apiFetch("/puestos/relevo", {
    method: "POST",
    body: JSON.stringify({ action: "confirmar_llegada", workerId: Number(workerId), targetSlotId: Number(slotId) })
  });

  console.log(`[Arribo] ÉXITO: Operario ${workerId} arribado y asignado a ${slotId}.`);
  return { success: true };
}

/**
 * CONFIRMAR ARRIBO FÍSICO DE REGRESO AL BOLSÓN L8
 * Actualiza el estado del operario de EN_TRANSITO de vuelta a DISPONIBLE_BOLSON.
 * 
 * @param {string} workerId ID del operario
 */
export async function acceptReturnToBolson(workerId) {
  if (!workerId) {
    throw new Error("ID del operario no provisto.");
  }

  console.log(`[Retorno Bolsón] Confirmando retorno para worker: ${workerId}`);

  await apiFetch("/puestos/relevo", {
    method: "POST",
    body: JSON.stringify({ action: "retorno_bolson", workerId: Number(workerId) })
  });

  console.log(`[Retorno Bolsón] ÉXITO: Operario ${workerId} devuelto a DISPONIBLE_BOLSON.`);
  return { success: true };
}

/**
 * RECHAZAR TRÁNSITO GENERAL (sin puesto predefinido)
 * El operario venía EN_TRANSITO hacia esta línea a llegada "de pasillo"
 * (targetSlotId nulo) y el supervisor destino rechaza el arribo: regresa de
 * inmediato a DISPONIBLE_BOLSON en L8.
 *
 * NOTA (migración SQL Server, AUDIT_REPORT.md C-3 / Fase 1 paso 1.5):
 * reemplaza el updateDoc directo contra el shim muerto de Firestore que
 * RelevosNotificaciones.jsx usaba para este caso (a diferencia de
 * rejectErgonomicRelevo, que sí tiene un slotId y por tanto una blacklist
 * que llenar).
 *
 * @param {string} workerId ID del operario
 */
export async function rejectGeneralTransit(workerId) {
  if (!workerId) {
    throw new Error("ID del operario no provisto.");
  }

  console.log(`[Rechazo Tránsito] Regresando a L8 al operario: ${workerId}`);

  await apiFetch("/puestos/relevo", {
    method: "POST",
    body: JSON.stringify({ action: "rechazar_transito_general", workerId: Number(workerId) })
  });

  console.log(`[Rechazo Tránsito] ÉXITO: Operario ${workerId} devuelto a DISPONIBLE_BOLSON.`);
  return { success: true };
}

/**
 * DESPACHAR OPERARIO A OTRA LÍNEA (Relevo / Tránsito)
 * Pone a un operario disponible de la línea actual (ej: Bolsón L8) en estado EN_TRANSITO con destino.
 * 
 * @param {string} workerId ID del operario
 * @param {string} targetLineId ID de la línea destino
 * @param {string} targetSlotId ID del puesto destino (opcional)
 * @param {string} supervisorLineId ID de la línea del supervisor que despacha (ej: L8)
 */
export async function dispatchWorkerToLine(workerId, targetLineId, targetSlotId, supervisorLineId) {
  if (!workerId || !targetLineId || !supervisorLineId) {
    throw new Error("Parámetros incompletos para despachar operario.");
  }

  console.log(`[Despacho] Despachando worker: ${workerId} desde ${supervisorLineId} -> ${targetLineId}`);

  await apiFetch("/puestos/relevo", {
    method: "POST",
    body: JSON.stringify({
      action: "despachar",
      workerId: Number(workerId),
      targetLineId,
      targetSlotId: targetSlotId ? Number(targetSlotId) : null
    })
  });

  console.log(`[Despacho] ÉXITO: Operario ${workerId} puesto EN_TRANSITO con destino a ${targetLineId}.`);
  return { success: true };
}

/**
 * MOTOR 3: REVOLUCIÓN ERGONÓMICA Y MATCHMAKER DE PLANTA
 * Busca el relevista disponible más apto en el Bolsón L8 para cubrir un puesto fatigado
 * y lo despacha en tránsito de forma atómica.
 * 
 * @param {string} slotId ID del puesto fatigado
 * @param {string} supervisorLineId ID de la línea del supervisor
 */
export async function requestErgonomicRelevo(slotId, supervisorLineId) {
  if (!slotId || !supervisorLineId) {
    throw new Error("Parámetros incompletos para solicitar relevo.");
  }

  console.log(`[Relevos] Solicitando relevo para puesto: ${slotId}`);

  await apiFetch("/puestos/relevo", {
    method: "POST",
    body: JSON.stringify({ action: "solicitar_relevo", slotId: Number(slotId) })
  });

  return { success: true };
}

/**
 * Filtra los puestos/celdas operativas activos en base al SKU planificado para la línea.
 * SKU-HIGH-DEMAND / SKU-990-BOST: Activa todos los puestos (MAQ1, AV1, OPC1, VAR1, VAR2)
 * SKU-MED-DEMAND: Activa 4 puestos (MAQ1, AV1, OPC1, VAR1; oculta VAR2)
 * SKU-LOW-DEMAND: Activa 3 puestos (MAQ1, AV1, OPC1; oculta VAR1, VAR2)
 * SKU-TECH-ONLY: Activa sólo puestos críticos fijos (MAQ1, AV1; oculta OPC1, VAR1, VAR2)
 * 
 * @param {string} sku SKU asignado a la línea
 * @param {Array} slots Lista completa de puestos de la línea
 */
export function getSlotsForSku(sku, slots) {
  if (!sku || sku === "INACTIVO" || sku === "SIN PLANIFICAR" || sku === "SIN SKU") return [];
  
  const uppercaseSku = sku.toUpperCase();
  
  // Sort slots by ID for deterministic and consistent filtering
  const sortedSlots = [...slots].sort((a, b) => a.id.localeCompare(b.id));

  // --- Real Data SKU Demand Mapping ---
  // High Demand: if it includes RM or SV or BOST or has high demand indicators
  if (uppercaseSku === "SKU-990-BOST" || uppercaseSku.includes("RM") || uppercaseSku.includes("SV") || uppercaseSku.includes("BOST")) {
    return sortedSlots;
  }
  
  // Medium Demand: if it includes EC or MX or AQUA
  if (uppercaseSku === "SKU-441-AQUA" || uppercaseSku.includes("EC") || uppercaseSku.includes("MX") || uppercaseSku.includes("AQUA")) {
    let varioIndex = 0;
    return sortedSlots.filter(s => {
      const isCritical = CRITICAL_TIPOS_PUESTO.includes(s.tipoPuesto);
      if (isCritical) return true;
      varioIndex++;
      return varioIndex % 3 !== 0; // Omit every 3rd variable position
    });
  }

  // Default / Low Demand: if it is Diet or includes SP, PX, NI, CR, PA, LITE etc.
  let varioIndex = 0;
  return sortedSlots.filter(s => {
    const isCritical = CRITICAL_TIPOS_PUESTO.includes(s.tipoPuesto);
    if (isCritical) return true;
    varioIndex++;
    return varioIndex % 2 === 0; // Retain only half of the variable positions
  });
}

/**
 * Función D: Obtener las órdenes de producción reales cargadas desde Excel para una fecha específica.
 * 
 * @param {string} fechaStr Fecha en formato YYYY-MM-DD
 */
export async function getProgramaProduccionPorFecha(fechaStr) {
  if (!fechaStr) return [];
  try {
    const q = query(collection(db, "programa_produccion"), where("fechaProd", "==", fechaStr));
    const snap = await getDocs(q);
    const orders = [];
    snap.forEach(d => {
      orders.push({ id: d.id, ...d.data() });
    });
    return orders;
  } catch (error) {
    console.error("[apiService] Error en getProgramaProduccionPorFecha:", error);
    return [];
  }
}


/**
 * ACEPTAR RELEVO ERGONÓMICO FÍSICAMENTE
 * Transacción atómica que confirma el arribo físico de un relevista:
 * 1. Asigna al relevista al puesto de destino fatigado.
 * 2. Libera al titular anterior (el fatigado), retornándolo al estado de disponible en Bolsón.
 * 3. Limpia la lista de rechazados (blacklist) del puesto fatigado al concretarse con éxito.
 * 
 * @param {string} relevistaId ID del relevista en tránsito
 * @param {string} slotId ID del puesto fatigado a relevar
 * @param {string} supervisorLineId ID de la línea del supervisor receptor
 */
export async function acceptErgonomicRelevo(relevistaId, slotId, supervisorLineId) {
  if (!relevistaId || !slotId || !supervisorLineId) {
    throw new Error("Parámetros incompletos para aceptar el relevo ergonómico.");
  }

  console.log(`[Relevo] Aceptando relevista ${relevistaId} en puesto ${slotId}.`);

  const payload = await apiFetch("/puestos/relevo", {
    method: "POST",
    body: JSON.stringify({ action: "aceptar_relevo", slotId: Number(slotId), newWorkerId: Number(relevistaId) })
  });

  // NOTA (migración SQL Server): el backend ya no devuelve el objeto completo
  // del trabajador relevado (relievedWorker) ni un chainPath detallado -
  // solo su id (relievedWorkerId). HudPlanta.jsx/RelevosNotificaciones.jsx
  // usan estos campos únicamente para mensajes informativos; si su ausencia
  // afecta algún texto en pantalla, se puede enriquecer luego con una
  // consulta adicional a /api/operarios.
  console.log(`[Relevo] ÉXITO: Relevista ${relevistaId} asignado a puesto ${slotId}.`);
  return {
    success: true,
    relievedWorker: payload && payload.relievedWorkerId ? { id: String(payload.relievedWorkerId) } : null,
    chainPath: []
  };
}

/**
 * RECHAZAR RELEVO ERGONÓMICO FÍSICAMENTE
 * Transacción atómica en caso de que ocurra un percance o incompatibilidad en el trayecto:
 * 1. El relevista en tránsito es devuelto al Bolsón de origen.
 * 2. Se registra el ID del relevista en el array 'rejectedWorkerIds' del puesto fatigado.
 * 3. La app detectará reactivamente el cambio y ofrecerá otra sugerencia distinta al supervisor de L8.
 * 
 * @param {string} relevistaId ID del relevista rechazado
 * @param {string} slotId ID del puesto de destino
 * @param {string} supervisorLineId ID de la línea del supervisor receptor
 */
export async function rejectErgonomicRelevo(relevistaId, slotId, supervisorLineId) {
  if (!relevistaId || !slotId || !supervisorLineId) {
    throw new Error("Parámetros incompletos para rechazar el relevo ergonómico.");
  }

  console.log(`[Rechazar Relevo] Iniciando: ${relevistaId} -> puesto ${slotId}`);

  await apiFetch("/puestos/relevo", {
    method: "POST",
    body: JSON.stringify({ action: "rechazar_relevo", slotId: Number(slotId), newWorkerId: Number(relevistaId) })
  });

  console.log(`[Rechazar Relevo] ÉXITO: Relevista ${relevistaId} devuelto a L8. Puesto ${slotId} blacklistea a este trabajador.`);
  return { success: true };
}

/**
 * EJECUTAR INTERCAMBIO ERGONÓMICO LOCAL ENTRE DOS PUESTOS DE LA MISMA LÍNEA
 * Rota a los dos operarios ya asignados en slotIdA y slotIdB.
 *
 * NOTA (migración SQL Server): reemplaza la transacción Firestore inline
 * (runTransaction/transaction.get contra el mock, que siempre devolvía un
 * snapshot vacío y por lo tanto fallaba con "Ambos puestos deben tener
 * operarios asignados" en cada intento) por la acción 'intercambio_local'
 * del despachador real POST /puestos/relevo (server/server.js), que ya
 * concentra el resto de transiciones de Puestos/Operarios (asignar, liberar,
 * aceptar_relevo, etc.) bajo el mismo bloqueo transaccional.
 */
export async function executeLocalSwapTransaction(slotIdA, slotIdB, lineId) {
  if (!slotIdA || !slotIdB || !lineId) {
    throw new Error("Parámetros incompletos para ejecutar el intercambio local.");
  }

  const payload = await apiFetch("/puestos/relevo", {
    method: "POST",
    body: JSON.stringify({ action: "intercambio_local", slotIdA: Number(slotIdA), slotIdB: Number(slotIdB) })
  });

  return {
    success: !!(payload && payload.success),
    workerAName: payload?.workerAName || null,
    workerBName: payload?.workerBName || null,
    puestoAName: payload?.puestoAName || null,
    puestoBName: payload?.puestoBName || null
  };
}

/**
 * LIMPIAR LISTA DE RECHAZADOS (BLACKLIST) DE UN PUESTO ESPECÍFICO
 * Permite restablecer el pool de candidatos disponibles para un puesto fatigado.
 *
 * NOTA (migración SQL Server, AUDIT_REPORT.md C-4 / Fase 1 paso 1.5 Grupo B):
 * antes hacía updateDoc(doc(db,"puestos",slotId), {rejectedWorkerIds:[]}), que
 * el shim reinterpretaba como una asignación real mal formada
 * (POST /puestos/relevo con action:'asignar', newWorkerId:null). Ahora pega
 * contra un endpoint dedicado que no puede confundirse con una asignación.
 *
 * @param {string} slotId ID del puesto
 */
export async function clearSlotBlacklist(slotId) {
  if (!slotId) throw new Error("ID del puesto no proporcionado.");
  await apiFetch(`/puestos/${slotId}/limpiar-blacklist`, { method: "POST" });
  return { success: true };
}

/**
 * PLANIFICACIÓN DÍA SIGUIENTE (Motor de Planificación Preventiva)
 * Realiza una simulación completa de asignaciones y cobertura para mañana.
 * 
 * @param {object} skuData Plan de SKUs por línea para mañana. Ej: { "L4": "SKU-990-BOST", "L1": "SKU-441-AQUA" }
 */
/**
 * Verifica las restricciones duras del Plan Maestro para asignar un trabajador a un puesto:
 * 1. Sexo: Correspondencia obligatoria con el sexo preferente del puesto (si no es Indistinto).
 * 2. Constancia Médica: Exclusión automática si el puesto requiere ESFUERZO_FISICO y el operario lo tiene restringido.
 */
export function canWorkerOccupiedSlot(w, p) {
  if (!w || !p) return false;

  // 1. Restricción Dura: Constancia Médica
  const requiredCaps = p.requiredCapabilities || [];
  const medicalRestrictions = w.medicalRestrictions || [];

  const hasMedicalConflict = requiredCaps.some(cap => {
    const cleanCap = cap.trim().toUpperCase();
    return medicalRestrictions.some(res => {
      const cleanRes = res.trim().toUpperCase();
      return cleanRes === cleanCap || cleanRes === `PROHIBIDO_${cleanCap}`;
    });
  });

  if (hasMedicalConflict) {
    console.log(`[Restricción Médica] Operario ${w.name} excluido de puesto ${p.puestoName} (${p.id}) debido a conflicto de aptitud médica.`);
    return false;
  }

  // 2. Restricción Dura: Sexo preferente
  let preferedSex = "Indistinto";
  const rawPref = (p.sexoPreferente || "").trim().toLowerCase();

  if (["masculino", "masculina"].includes(rawPref)) {
    preferedSex = "Masculino";
  } else if (["femenino", "femenina"].includes(rawPref)) {
    preferedSex = "Femenino";
  } else {
    // Si el género en base de datos es no-estándar (e.g. "Operador", "Estibador", "Averiero"),
    // derivamos el género correspondiente a partir del nombre del puesto o el tipo de puesto.
    const pName = (p.puestoName || "").toLowerCase();
    const pReq = (p.tipoPuesto || p.perfilRequerido || "").toLowerCase();

    if (pName.includes("despaletizador") || 
        pName.includes("monoblock") || 
        pName.includes("averiero") || 
        pName.includes("envolvedora") || 
        pName.includes("estibador") || 
        pName.includes("estivador") ||
        pName.includes("taponador") ||
        pName.includes("filtro") ||
        pReq.includes("operador a") ||
        pReq.includes("averiero")) {
      preferedSex = "Masculino";
    } else if (pName.includes("revisión") || 
               pName.includes("revision") || 
               pName.includes("lámpara") || 
               pName.includes("lampara") || 
               pName.includes("girar botellas") || 
               pName.includes("empacadora")) {
      preferedSex = "Femenino";
    }
  }

  if (preferedSex !== "Indistinto") {
    // NOTA (limpieza Fase 3): se quitó la lista fija de nombres para adivinar
    // el sexo del operario cuando w.sexo venía vacío. Los 153 operarios reales
    // sembrados ya tienen sexo poblado; si algún registro futuro llega sin
    // sexo, no se aplica la restricción (en vez de adivinarlo por nombre).
    if (!w.sexo) return true;
    const wSex = w.sexo;
    const normPref = preferedSex.trim().toLowerCase().replace(/a$/, "o");
    const normWSex = wSex.trim().toLowerCase().replace(/a$/, "o");
    if (normWSex !== normPref) {
      console.log(`[Restricción Sexo] Operario ${w.name} (${wSex}) no coincide con sexo preferente (${preferedSex}) para puesto ${p.puestoName}.`);
      return false;
    }
  }

  return true;
}

/**
 * SIMPLIFIED RELOCATION DESTINATION (FOR TRANSIT CHAIN TRACING)
 * Excludes recursive checks to prevent infinite loops.
 */
export function getRelocationDestinationSimple(relievedWorker, relievedFromSlot, allSlots, workersList, priorityOrder) {
  if (!relievedWorker || !relievedFromSlot) return { type: "bolson" };
  const currentLineId = relievedFromSlot.lineId;
  if (currentLineId === "L7") return { type: "fixed" };

  const ownLineSlots = allSlots.filter(s => s.lineId === currentLineId && s.id !== relievedFromSlot.id);
  const getElapsedMins = (slot) => {
    const t = slot.asignadoEnSegundoVirtual;
    if (!t) return 0;
    const ms = t.toDate ? t.toDate().getTime() : (t.seconds ? t.seconds * 1000 : new Date(t).getTime());
    return Math.max(0, Math.floor((Date.now() - ms) / 60000));
  };
  const getBaseName = (name) => name ? name.toLowerCase().split(/\d/)[0].trim() : "";

  const fatiguedLocal = ownLineSlots.find(s => {
    if (s.status !== 'ASIGNADO') return false;
    if (CRITICAL_TIPOS_PUESTO.includes(s.tipoPuesto)) return false;
    if (getBaseName(s.puestoName) === getBaseName(relievedFromSlot.puestoName)) return false;
    const elapsed = getElapsedMins(s);
    const needsRelay = s.relevoSolicitado || (elapsed >= 105);
    if (!needsRelay) return false;
    return canWorkerOccupiedSlot(relievedWorker, s);
  });
  if (fatiguedLocal) return { type: "local", slotId: fatiguedLocal.id };

  // La rotación cruzada entre líneas (robar operarios de otras celdas/líneas
  // activas) está deshabilitada por simplificación; siempre cae a Bolsón L8.
  return { type: "bolson" };
}

/**
 * TRACE ALL ACTIVE TRANSIT CHAINS AND COLLECT RESERVED SLOT IDS
 * Supports excluding the chain containing a specific slot to avoid self-blocking in simulations.
 */
export function getSlotsInTransitChains(allSlots, workersList, priorityOrder, excludeChainContainingSlotId = null) {
  const workersArray = Array.isArray(workersList) ? workersList : Object.values(workersList || {});
  const coveredSlotIds = new Set();
  
  const transitWorkers = workersArray.filter(w => w.status === 'EN_TRANSITO' && w.targetSlotId);
  
  for (const tw of transitWorkers) {
    let currentTargetSlotId = tw.targetSlotId;
    const visitedInThisChain = new Set();
    const thisChainSlots = [];
    
    while (currentTargetSlotId && !visitedInThisChain.has(currentTargetSlotId)) {
      visitedInThisChain.add(currentTargetSlotId);
      thisChainSlots.push(currentTargetSlotId);
      
      const slot = allSlots.find(s => s.id === currentTargetSlotId);
      if (!slot || slot.status !== 'ASIGNADO' || !slot.idWorkerCurrent) {
        break; 
      }
      
      const relievedWorker = workersArray.find(w => w.id === slot.idWorkerCurrent);
      if (!relievedWorker) {
        break;
      }
      
      const relocation = getRelocationDestinationSimple(relievedWorker, slot, allSlots, workersList, priorityOrder);
      if (relocation && (relocation.type === 'local' || relocation.type === 'transit') && relocation.slotId) {
        currentTargetSlotId = relocation.slotId;
      } else {
        currentTargetSlotId = null;
      }
    }

    // Si esta cadena contiene el puesto que queremos excluir (autoconsulta), omitirla
    if (excludeChainContainingSlotId && thisChainSlots.includes(excludeChainContainingSlotId)) {
      continue;
    }
    
    thisChainSlots.forEach(id => coveredSlotIds.add(id));
  }
  
  return Array.from(coveredSlotIds);
}

/**
 * CALCULAR DESTINO DE REUBICACIÓN AUTOMÁTICA DEL OPERARIO RELEVADO
 * Aplica las reglas y prioridades por línea solicitadas.
 */
export function getRelocationDestination(relievedWorker, relievedFromSlot, allSlots, workersList, priorityOrder) {
  if (!relievedWorker || !relievedFromSlot) return { type: "bolson", label: "Bolsón L8" };

  const currentLineId = relievedFromSlot.lineId;

  // Los operarios de L7 no deben moverse en absoluto
  if (currentLineId === "L7") {
    return { type: "fixed", label: "Permanecer en puesto (L7 no se mueve)" };
  }

  const workersArray = Array.isArray(workersList) ? workersList : Object.values(workersList || {});
  const transitChainsSet = new Set(getSlotsInTransitChains(allSlots, workersList, priorityOrder, relievedFromSlot.id));

  // Helper para verificar si ya hay un relevista en camino hacia una celda o reservado en cascada por otra cadena
  const isTargetSlotInTransit = (slotId) => {
    return transitChainsSet.has(slotId);
  };

  // Helper para calcular los minutos transcurridos en caliente
  const getElapsedMins = (slot) => {
    const t = slot.asignadoEnSegundoVirtual;
    if (!t) return 0;
    const ms = t.toDate ? t.toDate().getTime() : (t.seconds ? t.seconds * 1000 : new Date(t).getTime());
    return Math.max(0, Math.floor((Date.now() - ms) / 60000));
  };

  // Helper para obtener el nombre base (ej. "Lámpara 1" -> "lámpara")
  const getBaseName = (name) => {
    if (!name) return "";
    return name.toLowerCase().split(/\d/)[0].trim();
  };

  // 1. Verificar si hay otra persona fatigada en su misma línea (excluyendo su celda original)
  const ownLineSlots = allSlots.filter(s => s.lineId === currentLineId && s.id !== relievedFromSlot.id);

  const fatiguedLocal = ownLineSlots.find(s => {
    if (s.status !== 'ASIGNADO') return false;
    
    // Excluir puestos fijos críticos
    const esFijo = CRITICAL_TIPOS_PUESTO.includes(s.tipoPuesto);
    if (esFijo) return false;

    // Restricción: No debe ser un puesto similar (misma raíz de nombre)
    const isSimilar = getBaseName(s.puestoName) === getBaseName(relievedFromSlot.puestoName);
    if (isSimilar) return false;

    const elapsed = getElapsedMins(s);
    const needsRelay = s.relevoSolicitado || (elapsed >= 105);
    if (!needsRelay) return false;
    if (isTargetSlotInTransit(s.id)) return false;

    return canWorkerOccupiedSlot(relievedWorker, s);
  });

  if (fatiguedLocal) {
    return {
      type: "local",
      slotId: fatiguedLocal.id,
      label: `Relevar Puesto Local: "${fatiguedLocal.puestoName}"`
    };
  }

  // Deshabilitado por simplificación y para no robar operarios de otras celdas/líneas
  return { type: "bolson", label: "Bolsón L8" };
}

export async function programNextDayShift(skuData, planStatus = "BORRADOR") {
  console.log("[Planificación] Generando plan de producción para el día siguiente...");
  
  try {
    const globalPriorityDoc = await getDoc(doc(db, "config", "global_priority"));
    if (!globalPriorityDoc.exists()) {
      throw new Error("Configuración 'config/global_priority' no encontrada.");
    }
    const { priorityOrder } = globalPriorityDoc.data();

    // 1. Obtener todos los operarios
    const snapshotTrabajadores = await getDocs(trabajadoresColl);
    const trabajadoresPool = [];
    snapshotTrabajadores.forEach(docSnap => {
      trabajadoresPool.push({ id: docSnap.id, ...docSnap.data() });
    });

    // 2. Obtener todos los puestos
    const snapshotPuestos = await getDocs(puestosColl);
    const puestosList = [];
    snapshotPuestos.forEach(docSnap => {
      puestosList.push({ id: docSnap.id, ...docSnap.data() });
    });

    // 3. Simular pool de asistencia para mañana
    const asignadosLote = new Set();
    const nextDayAssignments = {};
    const deficits = {};
    const totalSlots = {};
    const OEE = {};

    // Mapear puestos por línea
    const puestosPorLinea = {};
    puestosList.forEach(p => {
      if (!puestosPorLinea[p.lineId]) puestosPorLinea[p.lineId] = [];
      puestosPorLinea[p.lineId].push(p);
    });

    // 4. Procesar asignaciones simuladas de fijos y rotativos para cada línea activa mañana
    priorityOrder.forEach(lineId => {
      const skuTomorrow = skuData[lineId];
      const allLinePuestos = puestosPorLinea[lineId] || [];

      totalSlots[lineId] = allLinePuestos.length;
      deficits[lineId] = 0;
      OEE[lineId] = 0;

      if (!skuTomorrow || skuTomorrow === "INACTIVO") {
        // Línea inactiva mañana -> Todos los puestos suspendidos
        allLinePuestos.forEach(p => {
          nextDayAssignments[p.id] = {
            id: p.id,
            puestoName: p.puestoName,
            tipoPuesto: p.tipoPuesto,
            status: "SUSPENDIDO",
            idWorkerCurrent: null,
            workerName: "VACANTE (Línea Inactiva)",
            locked: false
          };
        });
        return;
      }

      // Línea activa mañana: filtrar puestos habilitados según SKU
      const enabledPuestos = getSlotsForSku(skuTomorrow, allLinePuestos);
      const disabledPuestos = allLinePuestos.filter(p => !enabledPuestos.some(ep => ep.id === p.id));

      // 1. Marcar puestos excluidos/deshabilitados por el SKU como SUSPENDIDOS
      disabledPuestos.forEach(p => {
        nextDayAssignments[p.id] = {
          id: p.id,
          puestoName: p.puestoName,
          tipoPuesto: p.tipoPuesto,
          status: "SUSPENDIDO",
          idWorkerCurrent: null,
          workerName: "VACANTE (Excluido por SKU)",
          locked: false
        };
      });

      // 2. Procesar asignación de personal para puestos habilitados por el SKU
      let assignedCount = 0;
      enabledPuestos.forEach(p => {
        const esFijo = CRITICAL_TIPOS_PUESTO.includes(p.tipoPuesto);
        
        if (esFijo) {
          const titularId = p.idWorkerOriginal;
          
          // Verificar si el titular está presente (no inactivo) en base a los datos reales de la base de datos y cumple restricciones
          const worker = titularId ? trabajadoresPool.find(w => w.id === titularId) : null;
          const titularAsistira = worker && worker.status !== "INACTIVO" && canWorkerOccupiedSlot(worker, p);

          if (titularAsistira && !asignadosLote.has(titularId)) {
            const worker = trabajadoresPool.find(w => w.id === titularId);
            nextDayAssignments[p.id] = {
              id: p.id,
              puestoName: p.puestoName,
              tipoPuesto: p.tipoPuesto,
              status: "ASIGNADO",
              idWorkerCurrent: titularId,
              workerName: worker ? worker.name : "Operario Fijo",
              locked: false
            };
            asignadosLote.add(titularId);
            assignedCount++;
          } else {
            // LÓGICA INTELIGENTE DE REEMPLAZO TÉCNICO:
            // 1. Buscamos primero un operario libre del mismo rol técnico presente, desocupado y apto
            let reemplazo = trabajadoresPool.find(w => w.role === p.tipoPuesto && !asignadosLote.has(w.id) && canWorkerOccupiedSlot(w, p));
            // 2. Si no hay del mismo rol técnico, buscamos un 'Operador B' calificado
            if (!reemplazo) {
              reemplazo = trabajadoresPool.find(w => w.role === "Operador B" && !asignadosLote.has(w.id) && canWorkerOccupiedSlot(w, p));
            }
            if (reemplazo) {
              nextDayAssignments[p.id] = {
                id: p.id,
                puestoName: p.puestoName,
                tipoPuesto: p.tipoPuesto,
                status: "ASIGNADO",
                idWorkerCurrent: reemplazo.id,
                workerName: `${reemplazo.name} (Reemplazo Dual)`,
                locked: false
              };
              asignadosLote.add(reemplazo.id);
              assignedCount++;
            } else {
              // Si no hay reemplazo, queda en déficit
              nextDayAssignments[p.id] = {
                id: p.id,
                puestoName: p.puestoName,
                tipoPuesto: p.tipoPuesto,
                status: "VACANTE",
                idWorkerCurrent: null,
                workerName: "VACANTE",
                locked: false
              };
              deficits[lineId]++;
            }
          }
        } else {
          // Puestos varios rotativos: Asignamos operarios disponibles que cumplan restricciones duras
          const operarioLibre = trabajadoresPool.find(w => (w.role === "Operario Varios" || w.role === "Operario") && !asignadosLote.has(w.id) && canWorkerOccupiedSlot(w, p));
          if (operarioLibre) {
            nextDayAssignments[p.id] = {
              id: p.id,
              puestoName: p.puestoName,
              tipoPuesto: p.tipoPuesto,
              status: "ASIGNADO",
              idWorkerCurrent: operarioLibre.id,
              workerName: operarioLibre.name,
              locked: false
            };
            asignadosLote.add(operarioLibre.id);
            assignedCount++;
          } else {
            nextDayAssignments[p.id] = {
              id: p.id,
              puestoName: p.puestoName,
              tipoPuesto: p.tipoPuesto,
              status: "VACANTE",
              idWorkerCurrent: null,
              workerName: "VACANTE",
              locked: false
            };
            deficits[lineId]++;
          }
        }
      });
    });

    // === OPTIMIZACIÓN Y BALANCEO INTELIGENTE AUTOMÁTICO EN 1 PASO (SMART ROTATION) ===
    console.log("[Planificación] Ejecutando algoritmo de balanceo y Smart Rotation por Prioridad de Planta...");
    const priorityMap = {};
    priorityOrder.forEach((l, idx) => {
      priorityMap[l] = priorityOrder.length - idx;
    });

    const tomorrowDeficits = Object.values(nextDayAssignments).filter(a => a.status === 'VACANTE');
    tomorrowDeficits.forEach(assign => {
      const slotId = assign.id;
      const slot = puestosList.find(p => p.id === slotId);
      if (!slot) return;
      
      const requiredCap = slot.requiredCapabilities || [];
      const slotPriority = priorityMap[slot.lineId] || 0;

      // Intentar primero con operarios libres remanentes en el roster
      let chosenWorker = trabajadoresPool.find(w => {
        if (asignadosLote.has(w.id)) return false;
        if (w.status === "INACTIVO") return false;
        
        const restrictions = w.medicalRestrictions || [];
        if (requiredCap.some(cap => restrictions.includes(`PROHIBIDO_${cap}`) || restrictions.includes(cap))) return false;
        return true;
      });

      // Si no hay operarios libres en el roster general, buscar en líneas activas de menor prioridad
      if (!chosenWorker) {
        const candidateRotations = Object.values(nextDayAssignments).filter(a => {
          if (a.status !== 'ASIGNADO' || !a.idWorkerCurrent) return false;
          
          const w = trabajadoresPool.find(worker => worker.id === a.idWorkerCurrent);
          if (!w || w.role === "Operador A" || w.role === "Averiero") return false;
          
          const origSlot = puestosList.find(p => p.id === a.id);
          if (!origSlot) return false;
          
          const wLinePriority = priorityMap[origSlot.lineId] || 0;
          if (wLinePriority >= slotPriority) return false;

          const restrictions = w.medicalRestrictions || [];
          if (requiredCap.some(cap => restrictions.includes(`PROHIBIDO_${cap}`) || restrictions.includes(cap))) return false;
          return true;
        });

        candidateRotations.sort((a, b) => {
          const aSlot = puestosList.find(p => p.id === a.id);
          const bSlot = puestosList.find(p => p.id === b.id);
          return (priorityMap[aSlot?.lineId] || 0) - (priorityMap[bSlot?.lineId] || 0);
        });

        if (candidateRotations.length > 0) {
          const bestAssign = candidateRotations[0];
          chosenWorker = trabajadoresPool.find(w => w.id === bestAssign.idWorkerCurrent);
          
          const origSlot = puestosList.find(p => p.id === bestAssign.id);
          nextDayAssignments[bestAssign.id] = {
            ...nextDayAssignments[bestAssign.id],
            status: "VACANTE",
            idWorkerCurrent: null,
            workerName: "VACANTE",
            locked: false
          };
          if (origSlot) {
            deficits[origSlot.lineId] = (deficits[origSlot.lineId] || 0) + 1;
          }
        }
      }

      if (chosenWorker) {
        asignadosLote.add(chosenWorker.id);
        nextDayAssignments[slotId] = {
          ...nextDayAssignments[slotId],
          status: "ASIGNADO",
          idWorkerCurrent: chosenWorker.id,
          workerName: chosenWorker.name,
          locked: false
        };
        if (deficits[slot.lineId] > 0) {
          deficits[slot.lineId]--;
        }
      }
    });

    // Recalcular los porcentajes de OEE final de todas las líneas basándose en las asignaciones finales optimizadas
    priorityOrder.forEach(lineId => {
      const skuTomorrow = skuData[lineId];
      if (!skuTomorrow || skuTomorrow === "INACTIVO") {
        OEE[lineId] = 0;
        return;
      }
      const allLinePuestos = puestosPorLinea[lineId] || [];
      const enabledPuestos = getSlotsForSku(skuTomorrow, allLinePuestos);
      const finalAssignedCount = enabledPuestos.filter(p => nextDayAssignments[p.id]?.status === 'ASIGNADO').length;
      
      const coveragePct = enabledPuestos.length > 0 ? (finalAssignedCount / enabledPuestos.length) : 0;
      OEE[lineId] = Math.round(coveragePct * 95);
    });

    // 5. Consolidar y guardar el plan en config/next_day_plan
    const planDocRef = doc(db, "config", "next_day_plan");
    await setDoc(planDocRef, {
      status: planStatus,
      skuPlan: skuData,
      priorityOrder,
      assignments: nextDayAssignments,
      deficits,
      totalSlots,
      OEE,
      updatedAt: new Date()
    });

    console.log("[Planificación] Plan de producción del día siguiente consolidado y balanceado con éxito.");
    return { success: true };
  } catch (error) {
    console.error("[Planificación] Error al programar día siguiente:", error);
    throw error;
  }
}

/**
 * REPROGRAMACIÓN PARCIAL POR INFRACOBERTURA ($T+1$)
 * Recalcula las asignaciones preventivas para el día siguiente pero únicamente
 * sobre puestos que no están explícitamente bloqueados (locked) por el Coordinador,
 * respetando estrictamente las decisiones previas.
 * 
 * @param {object} skuData Plan de SKUs por línea para mañana.
 * @param {string} planStatus Estado del plan (BORRADOR por defecto).
 */
export async function reprogramPartialNextDayShift(skuData, planStatus = "BORRADOR") {
  console.log("[Planificación] Ejecutando reprogramación parcial por infracobertura para mañana...");
  
  try {
    const globalPriorityDoc = await getDoc(doc(db, "config", "global_priority"));
    if (!globalPriorityDoc.exists()) {
      throw new Error("Configuración 'config/global_priority' no encontrada.");
    }
    const { priorityOrder } = globalPriorityDoc.data();

    // 1. Obtener el plan de mañana actual
    const planDocRef = doc(db, "config", "next_day_plan");
    const planDocSnap = await getDoc(planDocRef);
    if (!planDocSnap.exists()) {
      // Si no existe, corre una programación completa normal
      return await programNextDayShift(skuData, planStatus);
    }
    
    const currentPlanData = planDocSnap.data();
    const existingAssignments = currentPlanData.assignments || {};

    // 2. Obtener todos los operarios
    const snapshotTrabajadores = await getDocs(trabajadoresColl);
    const trabajadoresPool = [];
    snapshotTrabajadores.forEach(docSnap => {
      trabajadoresPool.push({ id: docSnap.id, ...docSnap.data() });
    });

    // 3. Obtener todos los puestos
    const snapshotPuestos = await getDocs(puestosColl);
    const puestosList = [];
    snapshotPuestos.forEach(docSnap => {
      puestosList.push({ id: docSnap.id, ...docSnap.data() });
    });

    const nextDayAssignments = { ...existingAssignments };
    const deficits = {};
    const totalSlots = {};
    const OEE = {};

    // Mapear puestos por línea
    const puestosPorLinea = {};
    puestosList.forEach(p => {
      if (!puestosPorLinea[p.lineId]) puestosPorLinea[p.lineId] = [];
      puestosPorLinea[p.lineId].push(p);
    });

    // Identificar qué trabajadores ya están asignados a puestos bloqueados (locked)
    const asignadosLote = new Set();
    Object.keys(existingAssignments).forEach(slotId => {
      const assign = existingAssignments[slotId];
      if (assign.locked && assign.status === "ASIGNADO" && assign.idWorkerCurrent) {
        asignadosLote.add(assign.idWorkerCurrent);
      }
    });

    // 4. Procesar asignaciones para cada línea activa mañana
    priorityOrder.forEach(lineId => {
      const skuTomorrow = skuData[lineId];
      const allLinePuestos = puestosPorLinea[lineId] || [];

      totalSlots[lineId] = allLinePuestos.length;
      deficits[lineId] = 0;
      OEE[lineId] = 0;

      if (!skuTomorrow || skuTomorrow === "INACTIVO") {
        // Línea inactiva mañana -> Todos los puestos suspendidos
        allLinePuestos.forEach(p => {
          nextDayAssignments[p.id] = {
            id: p.id,
            puestoName: p.puestoName,
            tipoPuesto: p.tipoPuesto,
            status: "SUSPENDIDO",
            idWorkerCurrent: null,
            workerName: "VACANTE (Línea Inactiva)",
            locked: false
          };
        });
        return;
      }

      // Línea activa mañana: filtrar puestos habilitados según SKU
      const enabledPuestos = getSlotsForSku(skuTomorrow, allLinePuestos);
      const disabledPuestos = allLinePuestos.filter(p => !enabledPuestos.some(ep => ep.id === p.id));

      // Marcar puestos excluidos/deshabilitados por el SKU como SUSPENDIDOS
      disabledPuestos.forEach(p => {
        nextDayAssignments[p.id] = {
          id: p.id,
          puestoName: p.puestoName,
          tipoPuesto: p.tipoPuesto,
          status: "SUSPENDIDO",
          idWorkerCurrent: null,
          workerName: "VACANTE (Excluido por SKU)",
          locked: false
        };
      });

      // Procesar asignación de personal para puestos habilitados por el SKU
      enabledPuestos.forEach(p => {
        const existingAssign = existingAssignments[p.id];
        
        // REGLA DE PROTECCIÓN DE DATOS: Si está locked, se respeta estrictamente
        if (existingAssign && existingAssign.locked) {
          if (existingAssign.status === "ASIGNADO" && existingAssign.idWorkerCurrent) {
            // Verificar si el operario sigue siendo válido
            const worker = trabajadoresPool.find(w => w.id === existingAssign.idWorkerCurrent);
            if (worker && worker.status !== "INACTIVO" && canWorkerOccupiedSlot(worker, p)) {
              // Mantener intacto
              if (existingAssign.status === "ASIGNADO") {
                asignadosLote.add(existingAssign.idWorkerCurrent);
              }
              return;
            }
          } else if (existingAssign.status === "VACANTE") {
            // Si estaba bloqueado como vacante por el Coordinador, respetamos
            deficits[lineId]++;
            return;
          }
        }

        // Si no está locked o el operario ya no está disponible, recalculamos
        const esFijo = CRITICAL_TIPOS_PUESTO.includes(p.tipoPuesto);
        if (esFijo) {
          const titularId = p.idWorkerOriginal;
          const worker = titularId ? trabajadoresPool.find(w => w.id === titularId) : null;
          const titularAsistira = worker && worker.status !== "INACTIVO" && canWorkerOccupiedSlot(worker, p);

          if (titularAsistira && !asignadosLote.has(titularId)) {
            nextDayAssignments[p.id] = {
              id: p.id,
              puestoName: p.puestoName,
              tipoPuesto: p.tipoPuesto,
              status: "ASIGNADO",
              idWorkerCurrent: titularId,
              workerName: worker.name,
              locked: false
            };
            asignadosLote.add(titularId);
          } else {
            // LÓGICA INTELIGENTE DE REEMPLAZO TÉCNICO:
            // 1. Buscamos primero un operario libre del mismo rol técnico presente, desocupado y apto
            let reemplazo = trabajadoresPool.find(w => w.role === p.tipoPuesto && !asignadosLote.has(w.id) && canWorkerOccupiedSlot(w, p));
            // 2. Si no hay del mismo rol técnico, buscamos un 'Operador B' calificado
            if (!reemplazo) {
              reemplazo = trabajadoresPool.find(w => w.role === "Operador B" && !asignadosLote.has(w.id) && canWorkerOccupiedSlot(w, p));
            }
            if (reemplazo) {
              nextDayAssignments[p.id] = {
                id: p.id,
                puestoName: p.puestoName,
                tipoPuesto: p.tipoPuesto,
                status: "ASIGNADO",
                idWorkerCurrent: reemplazo.id,
                workerName: `${reemplazo.name} (Reemplazo Dual)`,
                locked: false
              };
              asignadosLote.add(reemplazo.id);
            } else {
              nextDayAssignments[p.id] = {
                id: p.id,
                puestoName: p.puestoName,
                tipoPuesto: p.tipoPuesto,
                status: "VACANTE",
                idWorkerCurrent: null,
                workerName: "VACANTE",
                locked: false
              };
              deficits[lineId]++;
            }
          }
        } else {
          // Puestos varios rotativos: Asignamos operarios disponibles que cumplan restricciones duras
          const operarioLibre = trabajadoresPool.find(w => (w.role === "Operario Varios" || w.role === "Operario" || w.role === "Soporte" || w.role === "Limpieza" || w.role === "Nuevos Ingresos") && !asignadosLote.has(w.id) && canWorkerOccupiedSlot(w, p));
          if (operarioLibre) {
            nextDayAssignments[p.id] = {
              id: p.id,
              puestoName: p.puestoName,
              tipoPuesto: p.tipoPuesto,
              status: "ASIGNADO",
              idWorkerCurrent: operarioLibre.id,
              workerName: operarioLibre.name,
              locked: false
            };
            asignadosLote.add(operarioLibre.id);
          } else {
            nextDayAssignments[p.id] = {
              id: p.id,
              puestoName: p.puestoName,
              tipoPuesto: p.tipoPuesto,
              status: "VACANTE",
              idWorkerCurrent: null,
              workerName: "VACANTE",
              locked: false
            };
            deficits[lineId]++;
          }
        }
      });
    });

    // Smart Rotation por prioridad sólo para puestos desbloqueados
    const priorityMap = {};
    priorityOrder.forEach((l, idx) => {
      priorityMap[l] = priorityOrder.length - idx;
    });

    const tomorrowDeficits = Object.values(nextDayAssignments).filter(a => a.status === 'VACANTE' && !a.locked);
    tomorrowDeficits.forEach(assign => {
      const slotId = assign.id;
      const slot = puestosList.find(p => p.id === slotId);
      if (!slot) return;
      
      const requiredCap = slot.requiredCapabilities || [];
      const slotPriority = priorityMap[slot.lineId] || 0;

      // Intentar primero con operarios libres remanentes en el roster
      let chosenWorker = trabajadoresPool.find(w => {
        if (asignadosLote.has(w.id)) return false;
        if (w.status === "INACTIVO") return false;
        
        const restrictions = w.medicalRestrictions || [];
        if (requiredCap.some(cap => restrictions.includes(`PROHIBIDO_${cap}`) || restrictions.includes(cap))) return false;
        return true;
      });

      // Si no, buscar rotar operarios no bloqueados de líneas de menor prioridad
      if (!chosenWorker) {
        const candidateRotations = Object.values(nextDayAssignments).filter(a => {
          if (a.status !== 'ASIGNADO' || !a.idWorkerCurrent || a.locked) return false;
          
          const w = trabajadoresPool.find(worker => worker.id === a.idWorkerCurrent);
          if (!w || w.role === "Operador A" || w.role === "Averiero") return false;
          
          const origSlot = puestosList.find(p => p.id === a.id);
          if (!origSlot) return false;
          
          const wLinePriority = priorityMap[origSlot.lineId] || 0;
          if (wLinePriority >= slotPriority) return false;

          const restrictions = w.medicalRestrictions || [];
          if (requiredCap.some(cap => restrictions.includes(`PROHIBIDO_${cap}`) || restrictions.includes(cap))) return false;
          return true;
        });

        candidateRotations.sort((a, b) => {
          const aSlot = puestosList.find(p => p.id === a.id);
          const bSlot = puestosList.find(p => p.id === b.id);
          return (priorityMap[aSlot?.lineId] || 0) - (priorityMap[bSlot?.lineId] || 0);
        });

        if (candidateRotations.length > 0) {
          const bestAssign = candidateRotations[0];
          chosenWorker = trabajadoresPool.find(w => w.id === bestAssign.idWorkerCurrent);
          
          const origSlot = puestosList.find(p => p.id === bestAssign.id);
          nextDayAssignments[bestAssign.id] = {
            ...nextDayAssignments[bestAssign.id],
            status: "VACANTE",
            idWorkerCurrent: null,
            workerName: "VACANTE",
            locked: false
          };
          if (origSlot) {
            deficits[origSlot.lineId] = (deficits[origSlot.lineId] || 0) + 1;
          }
        }
      }

      if (chosenWorker) {
        asignadosLote.add(chosenWorker.id);
        nextDayAssignments[slotId] = {
          ...nextDayAssignments[slotId],
          status: "ASIGNADO",
          idWorkerCurrent: chosenWorker.id,
          workerName: chosenWorker.name,
          locked: false
        };
        if (deficits[slot.lineId] > 0) {
          deficits[slot.lineId]--;
        }
      }
    });

    // Recalcular los porcentajes de OEE final
    priorityOrder.forEach(lineId => {
      const skuTomorrow = skuData[lineId];
      if (!skuTomorrow || skuTomorrow === "INACTIVO") {
        OEE[lineId] = 0;
        return;
      }
      const allLinePuestos = puestosPorLinea[lineId] || [];
      const enabledPuestos = getSlotsForSku(skuTomorrow, allLinePuestos);
      const finalAssignedCount = enabledPuestos.filter(p => nextDayAssignments[p.id]?.status === 'ASIGNADO').length;
      
      const coveragePct = enabledPuestos.length > 0 ? (finalAssignedCount / enabledPuestos.length) : 0;
      OEE[lineId] = Math.round(coveragePct * 95);
    });

    // Consolidar y guardar el plan
    const planDocRefUpdate = doc(db, "config", "next_day_plan");
    await setDoc(planDocRefUpdate, {
      status: planStatus,
      skuPlan: skuData,
      priorityOrder,
      assignments: nextDayAssignments,
      deficits,
      totalSlots,
      OEE,
      updatedAt: new Date()
    });

    console.log("[Planificación] Reprogramación parcial completada con éxito.");
    return { success: true };
  } catch (error) {
    console.error("[Planificación] Error al reprogramar parcialmente el día siguiente:", error);
    throw error;
  }
}

/**
 * ASIGNACIÓN REAL DE PUESTOS EN CALIENTE (Día en Curso / Hoy)
 * Ejecuta la asignación atómica de personal para el turno activo
 * basándose en las líneas activas, SKUs y el personal presente.
 * 
 * @param {object} skuData Configuración de SKUs por línea para hoy.
 */
export async function assignPuestosLive(skuData) {
  console.log("[Asignador Live] Ejecutando asignación de puestos para el turno de hoy...");
  
  try {
    const globalPriorityDoc = await getDoc(doc(db, "config", "global_priority"));
    if (!globalPriorityDoc.exists()) {
      throw new Error("Configuración 'config/global_priority' no encontrada.");
    }
    
    // Sanar y recuperar el priorityOrder completo de la planta en caso de corrupción
    const fullLineOrder = ["L4", "L1", "L2", "L6", "L7", "L5", "L3", "L8", "L9", "L10"];
    const priorityOrder = (globalPriorityDoc.data().priorityOrder && globalPriorityDoc.data().priorityOrder.length >= 8)
      ? globalPriorityDoc.data().priorityOrder
      : fullLineOrder;

    // 1. Obtener todos los trabajadores
    const snapshotTrabajadores = await getDocs(trabajadoresColl);
    const trabajadoresPool = [];
    snapshotTrabajadores.forEach(docSnap => {
      trabajadoresPool.push({ id: docSnap.id, ...docSnap.data() });
    });

    // 2. Obtener todos los puestos
    const snapshotPuestos = await getDocs(puestosColl);
    const puestosList = [];
    snapshotPuestos.forEach(docSnap => {
      puestosList.push({ id: docSnap.id, ...docSnap.data() });
    });

    // Mapear puestos por línea
    const puestosPorLinea = {};
    puestosList.forEach(p => {
      if (!puestosPorLinea[p.lineId]) puestosPorLinea[p.lineId] = [];
      puestosPorLinea[p.lineId].push(p);
    });

    const batch = writeBatch(db);
    const asignadosLote = new Set();

    // Helper para verificar si un trabajador es elegible/disponible (Categorías de inasistencia: VACACIONES, PERMISOS, CONSULTAS_MEDICAS, SUBSIDIOS, ACCIDENTE_LABORAL)
    const isWorkerEligible = (w) => {
      if (!w) return false;
      const statusUpper = (w.status || "").toUpperCase();
      return !["VACACIONES", "PERMISOS", "CONSULTAS_MEDICAS", "SUBSIDIOS", "ACCIDENTE_LABORAL"].includes(statusUpper);
    };

    // 3. Procesar asignaciones reales para cada línea activa hoy
    priorityOrder.forEach(lineId => {
      const skuToday = skuData[lineId];
      const allLinePuestos = puestosPorLinea[lineId] || [];

      if (!skuToday || skuToday === "INACTIVO") {
        // Línea inactiva hoy -> Todos los puestos suspendidos
        allLinePuestos.forEach(p => {
          batch.update(doc(db, "puestos", p.id), {
            status: "SUSPENDIDO",
            idWorkerCurrent: null,
            updatedAt: serverTimestamp()
          });

          // Liberar operario actual si tenía uno asignado
          if (p.idWorkerCurrent) {
            batch.update(doc(db, "trabajadores", p.idWorkerCurrent), {
              status: "DISPONIBLE_BOLSON",
              currentSlotId: null,
              lineaDestinoId: null,
              physicalLineLocation: "L8",
              updatedAt: serverTimestamp()
            });
          }
        });
        batch.set(doc(db, "config", `line_${lineId}`), {
          status: "INACTIVA",
          fijosAssigned: false,
          sku: "INACTIVO",
          updatedAt: serverTimestamp()
        }, { merge: true });
        return;
      }

      // Línea activa hoy: filtrar puestos habilitados según SKU
      const enabledPuestos = getSlotsForSku(skuToday, allLinePuestos);
      const disabledPuestos = allLinePuestos.filter(p => !enabledPuestos.some(ep => ep.id === p.id));

      // Marcar puestos excluidos/deshabilitados por el SKU como SUSPENDIDOS
      disabledPuestos.forEach(p => {
        batch.update(doc(db, "puestos", p.id), {
          status: "SUSPENDIDO",
          idWorkerCurrent: null,
          updatedAt: serverTimestamp()
        });

        // Liberar operario actual si tenía uno asignado
        if (p.idWorkerCurrent) {
          batch.update(doc(db, "trabajadores", p.idWorkerCurrent), {
            status: "DISPONIBLE_BOLSON",
            currentSlotId: null,
            lineaDestinoId: null,
            physicalLineLocation: "L8",
            updatedAt: serverTimestamp()
          });
        }
      });

      // Procesar asignación de personal para puestos habilitados por el SKU
      enabledPuestos.forEach(p => {
        const esFijo = CRITICAL_TIPOS_PUESTO.includes(p.tipoPuesto);
        
        if (esFijo) {
          const titularId = p.idWorkerOriginal;
          
          // Verificar si el titular está presente/disponible en pool y cumple restricciones duras
          const titular = trabajadoresPool.find(w => w.id === titularId && isWorkerEligible(w) && !asignadosLote.has(w.id) && canWorkerOccupiedSlot(w, p));

          if (titular) {
            batch.update(doc(db, "puestos", p.id), {
              status: "ASIGNADO",
              idWorkerCurrent: titular.id,
              updatedAt: serverTimestamp()
            });
            batch.update(doc(db, "trabajadores", titular.id), {
              status: "ASIGNADO",
              currentSlotId: p.id,
              physicalLineLocation: lineId,
              updatedAt: serverTimestamp()
            });
            asignadosLote.add(titular.id);
          } else {
            // Ausencia del titular: Buscar reemplazo calificado libre (Operador B) que cumpla restricciones duras
            const reemplazo = trabajadoresPool.find(w => w.role === "Operador B" && isWorkerEligible(w) && !asignadosLote.has(w.id) && canWorkerOccupiedSlot(w, p));
            if (reemplazo) {
              batch.update(doc(db, "puestos", p.id), {
                status: "ASIGNADO",
                idWorkerCurrent: reemplazo.id,
                updatedAt: serverTimestamp()
              });
              batch.update(doc(db, "trabajadores", reemplazo.id), {
                status: "ASIGNADO",
                currentSlotId: p.id,
                physicalLineLocation: lineId,
                updatedAt: serverTimestamp()
              });
              asignadosLote.add(reemplazo.id);
            } else {
              // Si no hay reemplazo, queda en déficit
              batch.update(doc(db, "puestos", p.id), {
                status: "VACANTE",
                idWorkerCurrent: null,
                updatedAt: serverTimestamp()
              });
            }
          }
        } else {
          // Puestos varios rotativos: Asignamos operarios generales libres del pool que cumplan restricciones duras
          const operarioLibre = trabajadoresPool.find(w => (w.role === "Operario Varios" || w.role === "Operario") && isWorkerEligible(w) && !asignadosLote.has(w.id) && canWorkerOccupiedSlot(w, p));
          if (operarioLibre) {
            batch.update(doc(db, "puestos", p.id), {
              status: "ASIGNADO",
              idWorkerCurrent: operarioLibre.id,
              updatedAt: serverTimestamp()
            });
            batch.update(doc(db, "trabajadores", operarioLibre.id), {
              status: "ASIGNADO",
              currentSlotId: p.id,
              physicalLineLocation: lineId,
              updatedAt: serverTimestamp()
            });
            asignadosLote.add(operarioLibre.id);
          } else {
            batch.update(doc(db, "puestos", p.id), {
              status: "VACANTE",
              idWorkerCurrent: null,
              updatedAt: serverTimestamp()
            });
          }
        }
      });
      // Marcar los fijos como asignados y el SKU de la línea activa en Firestore para que el supervisor no los limpie
      batch.set(doc(db, "config", `line_${lineId}`), {
        status: "ARRANQUE",
        fijosAssigned: true,
        sku: skuToday,
        updatedAt: serverTimestamp()
      }, { merge: true });
    });

    // 3.5. Transferir los trabajadores que registraron asistencia (POOL_ARRANQUE) y que no fueron asignados a ningún puesto, al Bolsón L8
    trabajadoresPool.forEach(w => {
      if (w.status === "POOL_ARRANQUE" && !asignadosLote.has(w.id)) {
        batch.update(doc(db, "trabajadores", w.id), {
          status: "DISPONIBLE_BOLSON",
          physicalLineLocation: "L8",
          currentSlotId: null,
          lineaDestinoId: null,
          updatedAt: serverTimestamp()
        });
      }
    });

    // 4. Actualizar global_priority con los SKUs asignados reales sin encoger la prioridad
    const activeList = Object.keys(skuData).filter(lineId => skuData[lineId] && skuData[lineId] !== "INACTIVO");
    
    batch.update(doc(db, "config", "global_priority"), {
      activeLines: activeList,
      priorityOrder: fullLineOrder // Forzar siempre el orden físico completo para sanar cualquier corrupción
    });

    // 5. Establecer estado del turno en ARRANQUE
    batch.update(doc(db, "config", "shift_status"), {
      shiftStartTimestamp: new Date(),
      status: "ARRANQUE"
    });

    await batch.commit();
    console.log("[Asignador Live] Asignación atómica de puestos en caliente realizada con éxito y base de datos sanada.");
    return { success: true };
  } catch (error) {
    console.error("[Asignador Live] Error en asignación en caliente:", error);
    throw error;
  }
}

/**
 * Asigna o rota atómicamente a un trabajador a un puesto con déficit (para uso exclusivo del Coordinador)
 *
 * NOTA (migración SQL Server): reemplaza la transacción Firestore inline
 * (runTransaction/transaction.get contra el mock, código muerto que nadie
 * importaba) por la acción 'aplicar_sugerencia' del despachador real
 * POST /puestos/relevo (server/server.js) — contraparte real de
 * PanelCoordinador.jsx:deficitSuggestions (tipos POOL/BOLSON/ROTACION).
 *
 * @param {string|number} workerId ID del trabajador
 * @param {string|number} targetSlotId ID del puesto vacante destino
 * @param {string|number|null} originalSlotId ID del puesto anterior (si es rotación, opcional)
 */
export async function executeCoordinatorSuggestion(workerId, targetSlotId, originalSlotId) {
  if (!workerId || !targetSlotId) {
    throw new Error("Faltan parámetros indispensables para aplicar la sugerencia.");
  }

  const payload = await apiFetch("/puestos/relevo", {
    method: "POST",
    body: JSON.stringify({
      action: "aplicar_sugerencia",
      workerId: Number(workerId),
      slotId: Number(targetSlotId),
      originalSlotId: originalSlotId ? Number(originalSlotId) : null
    })
  });

  return { success: !!(payload && payload.success), workerName: payload?.workerName || null, slotName: payload?.slotName || null };
}

// NOTA (limpieza Fase 3): getHistorialDia/saveHistorialDia se eliminaron de
// este archivo. Eran código inalcanzable (ningún componente las importaba
// desde aquí; PanelCoordinador.jsx usa las versiones reales de
// coordinatorApi.js, que sí pegan contra /api/historial) y la versión que
// vivía aquí fabricaba historial falso con Math.random() cuando no
// encontraba un registro real — justo el antipatrón que no debía portarse.

/**
 * MOTOR 4: Registra el inicio de un paro técnico.
 * Desaloja los puestos varios ocupados hacia el Bolsón L8; los puestos
 * fijos/críticos permanecen anclados (el técnico se queda con el equipo).
 */
export async function startLineParoTransaction(lineId, category, cause, symptoms) {
  if (!lineId || !category || !cause) {
    throw new Error("Faltan parámetros obligatorios para registrar el paro.");
  }

  const payload = await apiFetch(`/lineas/${lineId}/paro/iniciar`, {
    method: "POST",
    body: JSON.stringify({ categoria: category, causa: cause, sintomas: symptoms || "" })
  });

  console.log(`[Motor 4] Paro registrado en línea ${lineId}. Puestos varios liberados: ${payload?.puestosLiberados ?? 0}.`);
  return { success: !!(payload && payload.success), newParo: payload?.paro || null };
}

/**
 * Finaliza un paro técnico activo y reanuda producción.
 */
export async function endLineParoTransaction(lineId) {
  if (!lineId) {
    throw new Error("Falta el identificador de la línea.");
  }

  const payload = await apiFetch(`/lineas/${lineId}/paro/finalizar`, {
    method: "POST"
  });

  console.log(`[Paros] Paro finalizado en línea ${lineId}. Duración: ${payload?.duracionSegundos ?? "N/A"}s`);
  return {
    success: !!(payload && payload.success),
    completedParo: payload?.paroFinalizado || null,
    durationSeconds: payload?.duracionSegundos ?? null
  };
}

/**
 * CAMBIO ATÓMICO DE SKU EN VIVO:
 * Realiza la transición de puestos de una línea según el nuevo SKU, liberando operarios
 * excedentes al Bolsón L8 y habilitando las nuevas vacantes.
 *
 * NOTA (migración SQL Server, AUDIT_REPORT.md Fase 1 paso 1.5 Grupo B):
 * reemplaza el runTransaction contra el shim muerto de Firestore por
 * POST /lineas/:lineId/sku (server/server.js), una única transacción SQL
 * real que activa/desactiva puestos SKU-dependientes según
 * Puestos.IsSkuDependent/RequiredSkusJson y reintenta la auto-asignación de
 * críticos. A propósito NO replica getSlotsForSku (más abajo): esa
 * heurística basada en substrings del nombre del SKU (RM/SV/BOST/EC/MX/
 * AQUA) no corresponde a ninguna columna real del esquema migrado.
 */
export async function transitionLineToSku(lineId, currentSku, nextSku) {
  if (!lineId || !nextSku) {
    throw new Error("Faltan parámetros para la transición de SKU.");
  }
  console.log(`[Transacción SKU] Línea ${lineId}: ${currentSku || 'Ninguno'} -> ${nextSku}`);

  const payload = await apiFetch(`/lineas/${lineId}/sku`, {
    method: "POST",
    body: JSON.stringify({ skuAnterior: currentSku || null, skuNuevo: nextSku })
  });

  console.log(`[Transacción SKU] Línea ${lineId} cambiada a ${nextSku}: ${payload?.activados ?? 0} puestos activados, ${payload?.desactivados ?? 0} desactivados, ${payload?.totalAsignados ?? 0} fijos re-asignados.`);
  return { success: true };
}

/**
 * MOTOR DE SUGERENCIAS INTELIGENTES PARA EL SUPERVISOR:
 * Calcula candidatos del Bolsón L8 y rotaciones de fatiga ergonómica en caliente
 * para cubrir una vacante específica en la línea.
 */
export function getBestSuggestionsForSlot(slot, allSlots, allWorkers, priorityOrder) {
  if (!slot) return [];

  // Helper de compatibilidad de roles
  const isWorkerRoleCompatibleWithSlot = (workerRole, slotTipo, slotName) => {
    if (!workerRole || !slotTipo) return false;
    const wRole = workerRole.trim().toLowerCase();
    const sTipo = slotTipo.trim().toLowerCase();
    const sName = slotName ? slotName.trim().toLowerCase() : "";

    // Estibadores: Ningún rol de operador técnico (A, B, C, Averiero, Calderas, etc.) es compatible con Estibador/Estivador
    const isEstibador = sName.includes("estibador") || sName.includes("estivador");
    const isTechnicalOperator = wRole.includes("operador") || wRole.includes("averiero");
    if (isEstibador && isTechnicalOperator) {
      return false;
    }

    if (sTipo === "operador a") {
      return wRole === "operador a" || wRole === "operador b";
    }
    if (sTipo === "averiero") {
      return wRole === "averiero" || wRole === "operador b";
    }
    if (sTipo === "operador c") {
      return wRole === "operador c" || wRole === "operador b" || wRole === "operador a";
    }
    if (sTipo === "puesto vario") {
      return ["operario", "operario varios", "auxiliar materiales", "limpieza", "soporte", "nuevos ingresos", "asistente", "rotativo", "operario de patio", "operador b"].includes(wRole);
    }
    return wRole === sTipo;
  };

  const requiredCap = slot.requiredCapabilities || [];
  const restrictionsMatch = (worker) => {
    const restrictions = worker.medicalRestrictions || [];
    const medicalConflict = requiredCap.some(cap => restrictions.includes(`PROHIBIDO_${cap}`) || restrictions.includes(cap));
    return !medicalConflict;
  };

  const workersList = Array.isArray(allWorkers) ? allWorkers : Object.values(allWorkers || {});

  // 1. Filtrar operarios libres compatibles de Bolsón L8
  const availableCandidates = workersList.filter(w =>
    (w.status === "POOL_ARRANQUE" || w.status === "DISPONIBLE_BOLSON") &&
    w.currentSlotId == null &&
    isWorkerRoleCompatibleWithSlot(w.role, slot.tipoPuesto, slot.puestoName) &&
    restrictionsMatch(w) &&
    w.lastActivity !== slot.puestoName
  );

  // NOTA: la rotación por fatiga en otras líneas ("ROTACION") no está
  // implementada todavía -no hay ninguna fuente que popule candidatos ahí-;
  // por ahora las sugerencias solo salen de Bolsón L8 (abajo) y, si no hay
  // ninguna, del Motor 3 (extracción inversa por jerarquía, más abajo).
  const suggestions = [];

  // Agregar disponibles de Bolsón L8 con puntuación base alta (100)
  availableCandidates.forEach(w => {
    suggestions.push({
      worker: w,
      type: "BOLSON",
      label: `${w.name} (Disponible en Bolsón L8)`,
      score: 100
    });
  });

  // 3. MOTOR 3: EXTRACCIÓN INVERSA (Si Bolsón L8 está vacío o incompatible)
  const slotLineIndex = priorityOrder ? priorityOrder.indexOf(slot.lineId) : -1;
  if (suggestions.length === 0 && slotLineIndex !== -1 && priorityOrder) {
    const MIN_OPERARIOS_LINEA = 2;
    // Líneas de menor prioridad (después en el array priorityOrder)
    const lowerPriorityLines = priorityOrder.slice(slotLineIndex + 1);
    // Ordenar de menor prioridad absoluta a mayor prioridad absoluta para extraer primero de las peores líneas
    const lowerPriorityLinesSorted = [...lowerPriorityLines].reverse();

    const slotsList = Array.isArray(allSlots) ? allSlots : Object.values(allSlots || {});
    
    // Contar cuántos operarios asignados tiene cada línea activa
    const activeCountByLine = {};
    slotsList.forEach(s => {
      if (s.idWorkerCurrent && s.status === "ASIGNADO") {
        activeCountByLine[s.lineId] = (activeCountByLine[s.lineId] || 0) + 1;
      }
    });

    lowerPriorityLinesSorted.forEach(lowerLineId => {
      const activeCount = activeCountByLine[lowerLineId] || 0;
      // Inmunidad de origen: Si la línea tiene 2 o menos operarios asignados, no se le puede quitar ninguno
      if (activeCount <= MIN_OPERARIOS_LINEA) {
        return;
      }

      // Buscar puestos de esta línea que tengan un trabajador asignado compatible
      const lineSlots = slotsList.filter(s => s.lineId === lowerLineId && s.idWorkerCurrent && s.status === "ASIGNADO");
      lineSlots.forEach(s => {
        const worker = workersList.find(w => w.id === s.idWorkerCurrent);
        if (worker && isWorkerRoleCompatibleWithSlot(worker.role, slot.tipoPuesto, slot.puestoName) && restrictionsMatch(worker)) {
          suggestions.push({
            worker: worker,
            type: "EXTRACCION_INVERSA",
            originalSlotId: s.id,
            originalLineId: lowerLineId,
            label: `${worker.name} (Extracción de Línea ${lowerLineId} - Capacidad: ${activeCount} operarios)`,
            score: 10 // Puntuación baja para ser la última alternativa
          });
        }
      });
    });
  }

  // Ordenar sugerencias por puntuación descendente
  suggestions.sort((a, b) => b.score - a.score);

  return suggestions;
}

/**
 * GESTIÓN DE DOBLE TURNO
 * Actualiza la marca de doble turno en caliente para un operario (pre-selección
 * de conveniencia para el modal de Cierre de Turno; el efecto real ocurre en
 * closeShiftForLineTransaction, más abajo).
 *
 * NOTA (migración SQL Server, AUDIT_REPORT.md Fase 1 paso 1.5 Grupo B):
 * reemplaza el updateDoc contra el shim muerto de Firestore por
 * PATCH /operarios/:id/doble-turno (Operarios.DobleTurnoActivo).
 */
export async function updateWorkerDobleTurno(workerId, dobleTurnoActivo) {
  console.log(`[Doble Turno] Actualizando doble turno para ${workerId} a ${dobleTurnoActivo}`);
  await apiFetch(`/operarios/${workerId}/doble-turno`, {
    method: "PATCH",
    body: JSON.stringify({ activo: !!dobleTurnoActivo })
  });
  return { success: true };
}

/**
 * CIERRE DE TURNO
 * Calcula el OEE real del turno y lo persiste en HistoricoOEE (alimenta
 * GET /api/historial), resetea los puestos de la línea, y despacha a cada
 * operario asignado a POOL_ARRANQUE (doble turno) o INACTIVO.
 *
 * NOTA (migración SQL Server): reemplaza el cálculo/escritura inline contra
 * Firestore por una única transacción SQL real en
 * POST /lineas/:lineId/cerrar-turno (server/server.js), con la misma fórmula
 * de OEE (availability × performance × quality). La generación de
 * "productionReport"/"skuFinishedEvent" (config/production_reports, capado a
 * 50) no se portó — no hay tabla ni consumidor confirmado que dependa de eso
 * hoy; queda pendiente para cuando se construya el Dashboard analítico real.
 */
export async function closeShiftForLineTransaction(lineId, selectedWorkersForDobleTurno) {
  console.log(`[Cierre Turno] Iniciando cierre de turno para línea ${lineId}...`);

  const payload = await apiFetch(`/lineas/${lineId}/cerrar-turno`, {
    method: "POST",
    body: JSON.stringify({ workersDobleTurno: (selectedWorkersForDobleTurno || []).map(Number) })
  });

  console.log(`[Cierre Turno] Cierre consolidado para línea ${lineId}. OEE: ${payload?.oee?.oeeGlobalPct ?? "N/A"}%.`);
  return { success: !!(payload && payload.success), oee: payload?.oee || null };
}

/**
 * FORMULARIO DE MERMAS: guarda el snapshot actual (4 materiales x
 * inventario/proceso) de la línea en curso. Reemplaza el updateDoc contra
 * Firestore que el mock ignoraba silenciosamente (LineaSku.jsx handleSaveMermas).
 */
export async function saveMermasForLine(lineId, mermas, justification) {
  if (!lineId) {
    throw new Error("Falta el identificador de la línea.");
  }

  const payload = await apiFetch(`/lineas/${lineId}/mermas`, {
    method: "POST",
    body: JSON.stringify({ mermas, justification: justification || "" })
  });

  return {
    success: !!(payload && payload.success),
    totalProcessWaste: payload?.totalProcessWaste ?? null,
    wastePercentage: payload?.wastePercentage ?? null
  };
}


/**
 * Obtiene todos los trabajadores con rol de "Supervisor" del sistema.
 * Retorna su estado actual (disponible, asignado a línea, etc.)
 * 
 * @returns {Promise<Array>} Lista de supervisores con id, name, status, y assignedLine (si aplica)
 */
export async function getSupervisorWorkers() {
  try {
    const snapshot = await getDocs(trabajadoresColl);
    const supervisors = [];
    
    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      if (data.role === "Supervisor") {
        supervisors.push({
          id: docSnap.id,
          name: data.name,
          sexo: data.sexo,
          status: data.status,
          physicalLineLocation: data.physicalLineLocation || null,
          currentSlotId: data.currentSlotId || null
        });
      }
    });

    // Enriquecer con asignación del coordinador
    const assignDoc = await getDoc(doc(db, "config", "supervisors_assignment"));
    const assignments = assignDoc.exists() ? assignDoc.data() : {};

    return supervisors.map(sup => {
      const assignedLine = Object.entries(assignments).find(
        ([, val]) => val?.workerId === sup.id
      );
      return {
        ...sup,
        assignedLine: assignedLine ? assignedLine[0] : null,
        assignedLineName: assignedLine ? `Línea ${assignedLine[0]}` : null
      };
    });
  } catch (error) {
    console.error("[getSupervisorWorkers] Error:", error);
    return [];
  }
}


/**
 * Asigna atómicamente un supervisor real a una línea de producción.
 * - Escribe en config/supervisors_assignment con el ID y nombre del worker
 * - Actualiza el slot de supervisor de esa línea (primer slot con tipoPuesto "Supervisor")
 * - Marca al worker como ASIGNADO con physicalLineLocation
 * - Si había otro supervisor asignado a esa línea, lo libera
 * 
 * @param {string} lineId Ej: "L1", "L4"
 * @param {string} supervisorWorkerId Ej: "WORKER_365515"
 * @param {string} supervisorName Ej: "Axel Javier Antonio Tercero Lola"
 * @param {string} supervisorShortName Ej: "Axel Tercero"
 */
export async function assignSupervisorToLine(lineId, supervisorWorkerId, supervisorName, supervisorShortName) {
  console.log(`[Supervisor] Asignando ${supervisorShortName} (${supervisorWorkerId}) a línea ${lineId}...`);
  
  try {
    // 1. Leer asignaciones actuales
    const assignDoc = await getDoc(doc(db, "config", "supervisors_assignment"));
    const currentAssignments = assignDoc.exists() ? assignDoc.data() : {};
    
    const batch = writeBatch(db);
    
    // 2. Si este supervisor ya estaba asignado a OTRA línea, liberarlo
    const previousLineEntry = Object.entries(currentAssignments).find(
      ([, val]) => val?.workerId === supervisorWorkerId
    );
    if (previousLineEntry && previousLineEntry[0] !== lineId) {
      const prevLineId = previousLineEntry[0];
      // Buscar el slot de supervisor en la línea anterior y liberarlo
      const prevSlotsSnap = await getDocs(
        query(puestosColl, where("lineId", "==", prevLineId))
      );
      prevSlotsSnap.forEach(slotDoc => {
        const slotData = slotDoc.data();
        if (slotData.tipoPuesto === "Supervisor" || slotData.puestoName === "Supervisor") {
          if (slotData.idWorkerCurrent === supervisorWorkerId) {
            batch.update(slotDoc.ref, {
              status: "VACANTE",
              idWorkerCurrent: null,
              updatedAt: serverTimestamp()
            });
          }
        }
      });
    }
    
    // 3. Si la línea destino ya tenía otro supervisor, liberarlo
    const existingAssignment = currentAssignments[lineId];
    if (existingAssignment?.workerId && existingAssignment.workerId !== supervisorWorkerId) {
      // Liberar al supervisor previo
      batch.update(doc(db, "trabajadores", existingAssignment.workerId), {
        status: "POOL_ARRANQUE",
        currentSlotId: null,
        physicalLineLocation: null,
        updatedAt: serverTimestamp()
      });
    }
    
    // 4. Actualizar la asignación en config/supervisors_assignment
    const newAssignments = { ...currentAssignments };
    // Limpiar la asignación anterior si venía de otra línea
    if (previousLineEntry && previousLineEntry[0] !== lineId) {
      newAssignments[previousLineEntry[0]] = { workerId: null, name: "Sin Asignar", shortName: "Sin Asignar" };
    }
    newAssignments[lineId] = {
      workerId: supervisorWorkerId,
      name: supervisorName,
      shortName: supervisorShortName
    };
    batch.set(doc(db, "config", "supervisors_assignment"), newAssignments);
    
    // 5. Buscar el slot de supervisor en la línea destino y asignarlo
    const lineSlotsSnap = await getDocs(
      query(puestosColl, where("lineId", "==", lineId))
    );
    let supervisorSlotFound = false;
    lineSlotsSnap.forEach(slotDoc => {
      const slotData = slotDoc.data();
      if (slotData.tipoPuesto === "Supervisor" || slotData.puestoName === "Supervisor") {
        batch.update(slotDoc.ref, {
          status: "ASIGNADO",
          idWorkerCurrent: supervisorWorkerId,
          asignadoEnSegundoVirtual: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        supervisorSlotFound = true;

        // 6. Actualizar el worker
        batch.update(doc(db, "trabajadores", supervisorWorkerId), {
          status: "ASIGNADO",
          currentSlotId: slotDoc.id,
          physicalLineLocation: lineId,
          updatedAt: serverTimestamp()
        });
      }
    });
    
    if (!supervisorSlotFound) {
      // Si no existe slot de supervisor, solo actualizar el worker sin slot
      batch.update(doc(db, "trabajadores", supervisorWorkerId), {
        status: "ASIGNADO",
        currentSlotId: null,
        physicalLineLocation: lineId,
        updatedAt: serverTimestamp()
      });
    }
    
    // 7. Marcar plan como BORRADOR
    batch.set(doc(db, "config", "next_day_plan"), {
      status: "BORRADOR",
      updatedAt: serverTimestamp()
    }, { merge: true });
    
    await batch.commit();
    console.log(`[Supervisor] ✅ ${supervisorShortName} asignado exitosamente a línea ${lineId}.`);
    return { success: true };
  } catch (error) {
    console.error("[assignSupervisorToLine] Error:", error);
    throw error;
  }
}


/**
 * Activa o desactiva puestos SKU-dependientes según el SKU asignado a la línea.
 * - Lee los puestos con isSkuDependent=true de la colección
 * - Si el puesto tiene requiredSkus que incluye el nuevo SKU → activa (VACANTE)
 * - Si el puesto tiene requiredSkus que NO incluye el nuevo SKU → desactiva (SUSPENDIDO) y libera operario
 * 
 * @param {string} lineId Ej: "L1"
 * @param {string} newSku El SKU nuevo asignado
 */
export async function activateSkuDependentSlots(lineId, newSku) {
  console.log(`[SKU Slots] Activando/desactivando puestos SKU-dependientes para ${lineId} con SKU: ${newSku}`);
  
  try {
    const slotsSnap = await getDocs(
      query(puestosColl, where("lineId", "==", lineId))
    );
    
    const batch = writeBatch(db);
    let activated = 0;
    let deactivated = 0;
    
    slotsSnap.forEach(slotDoc => {
      const data = slotDoc.data();
      
      // Solo procesar puestos SKU-dependientes
      if (!data.isSkuDependent) return;
      
      const requiredSkus = data.requiredSkus || [];
      const shouldBeActive = requiredSkus.includes(newSku);
      
      if (shouldBeActive && data.status === "SUSPENDIDO") {
        // Activar: pasar de SUSPENDIDO a VACANTE
        batch.update(slotDoc.ref, {
          status: "VACANTE",
          idWorkerCurrent: null,
          updatedAt: serverTimestamp()
        });
        activated++;
      } else if (!shouldBeActive && data.status !== "SUSPENDIDO") {
        // Desactivar: liberar operario si tiene uno y suspender
        if (data.idWorkerCurrent) {
          batch.update(doc(db, "trabajadores", data.idWorkerCurrent), {
            status: "DISPONIBLE_BOLSON",
            currentSlotId: null,
            physicalLineLocation: "L8",
            updatedAt: serverTimestamp()
          });
        }
        batch.update(slotDoc.ref, {
          status: "SUSPENDIDO",
          idWorkerCurrent: null,
          updatedAt: serverTimestamp()
        });
        deactivated++;
      }
    });
    
    if (activated > 0 || deactivated > 0) {
      await batch.commit();
      console.log(`[SKU Slots] ✅ ${activated} puestos activados, ${deactivated} desactivados para ${lineId} (SKU: ${newSku})`);
    } else {
      console.log(`[SKU Slots] Sin cambios en puestos SKU-dependientes para ${lineId}`);
    }
    
    return { activated, deactivated };
  } catch (error) {
    console.error("[activateSkuDependentSlots] Error:", error);
    // No lanzar error para no bloquear la transición principal
    return { activated: 0, deactivated: 0 };
  }
}


/**
 * Registra explícitamente el evento de finalización de SKU de una línea
 * para visibilidad en vivo del coordinador (panel de Eventos de Producción).
 *
 * NOTA (migración SQL Server, AUDIT_REPORT.md Fase 1 paso 1.5 Grupo B):
 * reemplaza el setDoc contra el shim muerto de Firestore por
 * POST /lineas/:lineId/sku-finalizado, que además pasa la línea a estado
 * LIMPIEZA e inserta en la tabla real EventosProduccion (capada a los 50
 * más recientes por GET /api/config/production_reports).
 *
 * @param {string} lineId Ej: "L4"
 * @param {string} sku Ej: "SKU-990-BOST"
 */
export async function registerSkuFinishedEvent(lineId, sku) {
  console.log(`[SKU Event] Registrando finalización de SKU ${sku} en línea ${lineId}...`);
  try {
    await apiFetch(`/lineas/${lineId}/sku-finalizado`, {
      method: "POST",
      body: JSON.stringify({ sku })
    });
    return { success: true };
  } catch (error) {
    console.error("[registerSkuFinishedEvent] Error:", error);
    throw error;
  }
}

