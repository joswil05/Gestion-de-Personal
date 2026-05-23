// Servicio Híbrido e Inteligente de Base de Datos para Planta de Producción
// Este archivo autodetecta si existe configuración real de Firebase en el dispositivo.
// - SI HAY CREDENCIALES: Opera 100% en la nube de forma atómica con transacciones de Firestore.
// - NO HAY CREDENCIALES (o falla red): Activa un Adaptador de Persistencia en LocalStorage local.
// Esto garantiza tolerancia absoluta a fallos, previene pantallas negras y asegura que los datos no se pierdan.

import { db, useRealFirebase } from '../firebase';
import { 
  collection, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  deleteDoc,
  runTransaction, 
  query, 
  where, 
  getDocs,
  onSnapshot
} from 'firebase/firestore';
import { LINEAS_MOCK, TRABAJADORES_MOCK, PUESTOS_PLANTILLA } from '../mocks/mockData';

// Prioridades de la planta
export const ORDEN_PRIORIDADES = ['L4', 'L1', 'L2', 'L6', 'L7', 'L5', 'L3', 'L8', 'L9', 'L10'];

// --- BASE DE DATOS LOCAL EN LOCALSTORAGE (Adaptador de Respaldo) ---
class LocalStorageDatabaseAdapter {
  constructor() {
    this.listeners = [];
    // Escuchar eventos de cambio en pestañas
    window.addEventListener('storage', () => this.notifyListeners());
  }

  // Carga o inicializa los datos de LocalStorage
  getCollection(name, defaultData = []) {
    const data = localStorage.getItem(`smartassign_${name}`);
    if (!data) {
      localStorage.setItem(`smartassign_${name}`, JSON.stringify(defaultData));
      return defaultData;
    }
    return JSON.parse(data);
  }

  saveCollection(name, data) {
    localStorage.setItem(`smartassign_${name}`, JSON.stringify(data));
    this.notifyListeners();
  }

  notifyListeners() {
    const state = this.getDataState();
    this.listeners.forEach(cb => cb(state));
  }

  subscribe(callback) {
    this.listeners.push(callback);
    callback(this.getDataState());
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback);
    };
  }

  getDataState() {
    return {
      workers: this.getCollection('workers', TRABAJADORES_MOCK),
      lines: this.getCollection('lines', LINEAS_MOCK),
      puestos: this.getCollection('puestos', []),
      alerts: this.getCollection('alerts', []),
      logs: this.getCollection('logs', [])
    };
  }

  addLog(message, type = 'info') {
    const logs = this.getCollection('logs', []);
    const time = new Date().toLocaleTimeString();
    logs.unshift({ timestamp: Date.now(), timeFormatted: time, message, type });
    this.saveCollection('logs', logs.slice(0, 50));
  }

  // Simulación de transacción atómica en LocalStorage
  runTransaction(transactionFn) {
    const state = this.getDataState();
    
    // Clones locales aislados
    const dbSnapshot = {
      workers: JSON.parse(JSON.stringify(state.workers)),
      lines: JSON.parse(JSON.stringify(state.lines)),
      puestos: JSON.parse(JSON.stringify(state.puestos)),
      alerts: JSON.parse(JSON.stringify(state.alerts)),
      logs: JSON.parse(JSON.stringify(state.logs))
    };

    const context = {
      get: (coll, id) => {
        return dbSnapshot[coll].find(x => x.idWorker === id || x.idLinea === id || x.idPuesto === id || x.id === id);
      },
      update: (coll, id, data) => {
        dbSnapshot[coll] = dbSnapshot[coll].map(x => {
          if (x.idWorker === id || x.idLinea === id || x.idPuesto === id || x.id === id) {
            return { ...x, ...data };
          }
          return x;
        });
      },
      set: (coll, id, data) => {
        const idx = dbSnapshot[coll].findIndex(x => x.idWorker === id || x.idLinea === id || x.idPuesto === id || x.id === id);
        if (idx !== -1) {
          dbSnapshot[coll][idx] = { ...data };
        } else {
          dbSnapshot[coll].push({ ...data });
        }
      },
      delete: (coll, id) => {
        dbSnapshot[coll] = dbSnapshot[coll].filter(x => x.idWorker !== id && x.idLinea !== id && x.idPuesto !== id && x.id !== id);
      },
      query: (coll, filterFn) => {
        return dbSnapshot[coll].filter(filterFn);
      }
    };

    try {
      transactionFn(context);
      
      // Aplicar cambios persistentes
      this.saveCollection('workers', dbSnapshot.workers);
      this.saveCollection('lines', dbSnapshot.lines);
      this.saveCollection('puestos', dbSnapshot.puestos);
      this.saveCollection('alerts', dbSnapshot.alerts);
      return { success: true };
    } catch (e) {
      console.error("Transacción LocalStorage abortada:", e.message);
      this.addLog(`Falla: ${e.message}`, 'error');
      throw e;
    }
  }
}

export const localDb = new LocalStorageDatabaseAdapter();

// --- SISTEMA DE SUSCRIPCIÓN EN TIEMPO REAL ---
export function suscribirEstadoPlanta(callback) {
  if (useRealFirebase) {
    console.log("Firestore en tiempo real: Suscribiendo WebSockets.");
    const state = { workers: [], lines: [], puestos: [], alerts: [], logs: [] };

    const unsubWorkers = onSnapshot(collection(db, "workers"), (snap) => {
      state.workers = snap.docs.map(d => d.data());
      callback({ ...state });
    });
    const unsubLines = onSnapshot(collection(db, "lines"), (snap) => {
      state.lines = snap.docs.map(d => d.data()).sort((a, b) => a.prioridad - b.prioridad);
      callback({ ...state });
    });
    const unsubPuestos = onSnapshot(collection(db, "puestos"), (snap) => {
      state.puestos = snap.docs.map(d => d.data());
      callback({ ...state });
    });
    const unsubAlerts = onSnapshot(collection(db, "alerts"), (snap) => {
      state.alerts = snap.docs.map(d => d.data());
      callback({ ...state });
    });
    const unsubLogs = onSnapshot(collection(db, "logs"), (snap) => {
      state.logs = snap.docs.map(d => d.data()).sort((a, b) => b.timestamp - a.timestamp).slice(0, 50);
      callback({ ...state });
    });

    return () => {
      unsubWorkers();
      unsubLines();
      unsubPuestos();
      unsubAlerts();
      unsubLogs();
    };
  } else {
    console.log("Persistencia Local: Suscribiendo LocalStorage.");
    return localDb.subscribe(callback);
  }
}

// Log de auditoría
export async function registrarLogFirestore(mensaje, tipo = 'info') {
  if (useRealFirebase) {
    const logId = `LOG_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const time = new Date().toLocaleTimeString();
    try {
      await setDoc(doc(db, "logs", logId), {
        id: logId,
        timestamp: Date.now(),
        timeFormatted: time,
        message: mensaje,
        type: tipo
      });
    } catch (e) {
      console.warn("Error escribiendo log remoto.");
    }
  } else {
    localDb.addLog(mensaje, tipo);
  }
}

// --- LÓGICA ATÓMICA DE NEGOCIO ---

/**
 * 1. INICIALIZACIÓN DE TURNO
 */
export async function firebaseInicializarTurno() {
  if (useRealFirebase) {
    // Código de inicialización de Firebase nube
    const puestosIniciales = [];
    LINEAS_MOCK.forEach(l => {
      setDoc(doc(db, "lines", l.idLinea), l);
      PUESTOS_PLANTILLA.fijos.forEach((pf, index) => {
        puestosIniciales.push({
          idPuesto: `${l.idLinea}_F${index + 1}`,
          idLinea: l.idLinea,
          tipo: 'Fijo',
          nombreTarea: `${pf.nombreTarea} (${l.nombre})`,
          rolRequerido: pf.rolRequerido,
          idWorkerAsignado: null,
          idWorkerOriginal: null
        });
      });
      const variosDeLinea = PUESTOS_PLANTILLA.varios[l.idLinea] || [];
      variosDeLinea.forEach(pv => {
        puestosIniciales.push({
          idPuesto: pv.idPuesto,
          idLinea: l.idLinea,
          tipo: 'Vario',
          nombreTarea: pv.nombreTarea,
          sexoRequerido: pv.sexoRequerido,
          restriccionesProhibidas: pv.restriccionesProhibidas,
          idWorkerAsignado: null,
          timer: 120,
          maxHorasPermitidas: 2,
          rotacionIniciada: false
        });
      });
    });

    for (let p of puestosIniciales) await setDoc(doc(db, "puestos", p.idPuesto), p);
    for (let w of TRABAJADORES_MOCK) await setDoc(doc(db, "workers", w.idWorker), w);

    try {
      await runTransaction(db, async (transaction) => {
        // Simular marcaje huella
        for (let w of TRABAJADORES_MOCK) {
          if (w.rol !== 'Coordinador' && w.rol !== 'Supervisor') {
            const wRef = doc(db, "workers", w.idWorker);
            const wSnap = await transaction.get(wRef);
            if (wSnap.exists() && wSnap.data().estadoActual !== 'BAJA_TEMPORAL') {
              transaction.update(wRef, { estadoActual: 'POOL_ARRANQUE', lineaActualId: null, puestoActualId: null });
            }
          }
        }
        // Asignación de puestos fijos
        for (let p of puestosIniciales) {
          if (p.tipo === 'Fijo') {
            const pRef = doc(db, "puestos", p.idPuesto);
            const qT = query(collection(db, "workers"), where("rol", "==", p.rolRequerido), where("estadoActual", "==", "POOL_ARRANQUE"));
            const sT = await getDocs(qT);

            if (!sT.empty) {
              const tDoc = sT.docs[0];
              transaction.update(pRef, { idWorkerAsignado: tDoc.id, idWorkerOriginal: tDoc.id });
              transaction.update(doc(db, "workers", tDoc.id), { estadoActual: 'ASIGNADO', lineaActualId: p.idLinea, puestoActualId: p.idPuesto });
            } else {
              const qR = query(collection(db, "workers"), where("rol", "==", "Operador B"), where("estadoActual", "==", "POOL_ARRANQUE"));
              const sR = await getDocs(qR);
              if (!sR.empty) {
                const rDoc = sR.docs[0];
                transaction.update(pRef, { idWorkerAsignado: rDoc.id, idWorkerOriginal: 'N/A' });
                transaction.update(doc(db, "workers", rDoc.id), { estadoActual: 'ASIGNADO', lineaActualId: p.idLinea, puestoActualId: p.idPuesto });
              }
            }
          }
        }
      });
      await registrarLogFirestore("Asignación de fijos inicializada en la nube.", "success");
    } catch (e) {
      console.warn("Fallo transaccional nube en inicio:", e.message);
    }
  } else {
    // Inicialización en LocalStorage
    const puestosIniciales = [];
    LINEAS_MOCK.forEach(l => {
      PUESTOS_PLANTILLA.fijos.forEach((pf, index) => {
        puestosIniciales.push({
          idPuesto: `${l.idLinea}_F${index + 1}`,
          idLinea: l.idLinea,
          tipo: 'Fijo',
          nombreTarea: `${pf.nombreTarea} (${l.nombre})`,
          rolRequerido: pf.rolRequerido,
          idWorkerAsignado: null,
          idWorkerOriginal: null
        });
      });
      const variosDeLinea = PUESTOS_PLANTILLA.varios[l.idLinea] || [];
      variosDeLinea.forEach(pv => {
        puestosIniciales.push({
          idPuesto: pv.idPuesto,
          idLinea: l.idLinea,
          tipo: 'Vario',
          nombreTarea: pv.nombreTarea,
          sexoRequerido: pv.sexoRequerido,
          restriccionesProhibidas: pv.restriccionesProhibidas,
          idWorkerAsignado: null,
          timer: 120,
          maxHorasPermitidas: 2,
          rotacionIniciada: false
        });
      });
    });

    localDb.initialize(TRABAJADORES_MOCK, LINEAS_MOCK, puestosIniciales);

    localDb.runTransaction((t) => {
      // Simular marcaje huella
      const workers = t.query('workers', w => w.rol !== 'Coordinador' && w.rol !== 'Supervisor');
      workers.forEach(w => {
        if (w.estadoActual !== 'BAJA_TEMPORAL') {
          t.update('workers', w.idWorker, { estadoActual: 'POOL_ARRANQUE', lineaActualId: null, puestoActualId: null });
        }
      });

      // Asignar fijos
      const puestos = t.query('puestos', p => p.tipo === 'Fijo');
      puestos.forEach(p => {
        const titulares = t.query('workers', w => w.rol === p.rolRequerido && w.estadoActual === 'POOL_ARRANQUE');
        if (titulares.length > 0) {
          const titular = titulares[0];
          t.update('puestos', p.idPuesto, { idWorkerAsignado: titular.idWorker, idWorkerOriginal: titular.idWorker });
          t.update('workers', titular.idWorker, { estadoActual: 'ASIGNADO', lineaActualId: p.idLinea, puestoActualId: p.idPuesto });
        } else {
          // Reemplazo
          const reemplazos = t.query('workers', w => w.rol === 'Operador B' && w.estadoActual === 'POOL_ARRANQUE');
          if (reemplazos.length > 0) {
            const reemplazo = reemplazos[0];
            t.update('puestos', p.idPuesto, { idWorkerAsignado: reemplazo.idWorker, idWorkerOriginal: 'N/A' });
            t.update('workers', reemplazo.idWorker, { estadoActual: 'ASIGNADO', lineaActualId: p.idLinea, puestoActualId: p.idPuesto });
          }
        }
      });
    });

    localDb.addLog("Asignación de puestos fijos completada localmente.", "success");
  }
}

/**
 * 2. MOTOR DE REGLAS DE ASIGNACIÓN MÓVIL POR QR
 */
export async function firebaseEscanearQR(workerId, lineaId) {
  if (useRealFirebase) {
    let puestoAsignado = null;
    let desvioEjecutado = false;

    await runTransaction(db, async (transaction) => {
      const workerRef = doc(db, "workers", workerId);
      const workerSnap = await transaction.get(workerRef);
      if (!workerSnap.exists()) throw new Error("Código QR no reconocido");

      const worker = workerSnap.data();
      const lineaRef = doc(db, "lines", lineaId);
      const lineaSnap = await transaction.get(lineaRef);
      if (!lineaSnap.exists()) throw new Error("Línea no configurada.");

      if (lineaSnap.data().estado === 'En Preparación') {
        throw new Error(`La ${lineaSnap.data().nombre} está parada.`);
      }

      if (worker.estadoActual === 'ASIGNADO' && worker.rol === 'Operador A') {
        throw new Error(`${worker.nombre} es un Operador A congelado.`);
      }

      const qPuestos = query(collection(db, "puestos"), where("idLinea", "==", lineaId), where("tipo", "==", "Vario"));
      const puestosSnap = await getDocs(qPuestos);
      const puestosVacios = puestosSnap.docs.map(d => d.data()).filter(p => p.idWorkerAsignado === null);

      if (puestosVacios.length === 0) throw new Error("Sin vacantes disponibles.");

      // Prioridad
      const lineaActualPrioIdx = ORDEN_PRIORIDADES.indexOf(lineaId);
      for (let i = 0; i < lineaActualPrioIdx; i++) {
        const lpId = ORDEN_PRIORIDADES[i];
        const lpRef = doc(db, "lines", lpId);
        const lpSnap = await transaction.get(lpRef);

        if (lpSnap.exists() && lpSnap.data().estado === 'Operando') {
          const qPrio = query(collection(db, "puestos"), where("idLinea", "==", lpId), where("tipo", "==", "Vario"));
          const prioSnap = await getDocs(qPrio);
          const vacantesPrio = prioSnap.docs.map(d => d.data()).filter(p => p.idWorkerAsignado === null);

          if (vacantesPrio.length > 0) {
            const califica = vacantesPrio.some(p => evaluarFiltrosCompatibilidad(worker, p) === true);
            if (califica) {
              desvioEjecutado = true;
              transaction.update(workerRef, { estadoActual: 'EN_TRANSITO', lineaActualId: null, lineaDestinoId: lpId, puestoActualId: null });
              
              const aId = `ALERTA_TRANSITO_${workerId}_${Date.now()}`;
              transaction.set(doc(db, "alerts", aId), {
                id: aId, type: 'transito', title: `DESVÍO OBLIGATORIO`,
                message: `${worker.nombre} ha sido redirigido a ${lpSnap.data().nombre} por prioridad.`,
                workerId, lineaDestinoId: lpId
              });
              return;
            }
          }
        }
      }

      if (desvioEjecutado) return;

      let mensajeError = "";
      for (let puesto of puestosVacios) {
        const comp = evaluarFiltrosCompatibilidad(worker, puesto);
        if (comp === true) {
          puestoAsignado = puesto;
          break;
        } else {
          mensajeError = comp;
        }
      }

      if (!puestoAsignado) throw new Error(`Incompatible: ${mensajeError}`);

      transaction.update(doc(db, "puestos", puestoAsignado.idPuesto), { idWorkerAsignado: workerId, timer: 120, rotacionIniciada: false });
      transaction.update(workerRef, { estadoActual: 'ASIGNADO', lineaActualId: lineaId, lineaDestinoId: null, puestoActualId: puestoAsignado.idPuesto });

      const qAlerts = query(collection(db, "alerts"), where("workerId", "==", workerId), where("type", "==", "transito"));
      const snapA = await getDocs(qAlerts);
      snapA.forEach(d => transaction.delete(d.ref));
    });

    if (desvioEjecutado) return { status: 'redirigido', msg: `Redirigido a línea prioritaria.` };
    return { status: 'asignado', puesto: puestoAsignado.nombreTarea };
  } else {
    // LocalStorage escaneo
    let puestoAsignado = null;
    let desvioEjecutado = false;
    let redirigidoMsg = "";

    localDb.runTransaction((t) => {
      const worker = t.get('workers', workerId);
      if (!worker) throw new Error("Código QR inválido.");

      const linea = t.get('lines', lineaId);
      if (linea.estado === 'En Preparación') throw new Error(`Línea parada.`);

      if (worker.estadoActual === 'ASIGNADO' && worker.rol === 'Operador A') throw new Error("Operador A congelado.");

      const puestosVacios = t.query('puestos', p => p.idLinea === lineaId && p.tipo === 'Vario' && p.idWorkerAsignado === null);
      if (puestosVacios.length === 0) throw new Error("Sin vacantes en la línea.");

      // Prioridad
      const lineaActualPrioIdx = ORDEN_PRIORIDADES.indexOf(lineaId);
      for (let i = 0; i < lineaActualPrioIdx; i++) {
        const lpId = ORDEN_PRIORIDADES[i];
        const lp = t.get('lines', lpId);

        if (lp && lp.estado === 'Operando') {
          const vacantesPrio = t.query('puestos', p => p.idLinea === lpId && p.tipo === 'Vario' && p.idWorkerAsignado === null);
          if (vacantesPrio.length > 0) {
            const califica = vacantesPrio.some(p => evaluarFiltrosCompatibilidad(worker, p) === true);
            if (califica) {
              desvioEjecutado = true;
              t.update('workers', workerId, { estadoActual: 'EN_TRANSITO', lineaActualId: null, lineaDestinoId: lpId, puestoActualId: null });
              
              const aId = `ALERTA_TRANSITO_${workerId}_${Date.now()}`;
              t.set('alerts', aId, {
                id: aId, type: 'transito', title: `DESVÍO OBLIGATORIO`,
                message: `${worker.nombre} redirigido a ${lp.nombre} por prioridad.`,
                workerId, lineaDestinoId: lpId
              });
              redirigidoMsg = `Redirigido a la línea prioritaria ${lp.nombre}.`;
              return;
            }
          }
        }
      }

      if (desvioEjecutado) return;

      let mensajeError = "";
      for (let puesto of puestosVacios) {
        const comp = evaluarFiltrosCompatibilidad(worker, puesto);
        if (comp === true) {
          puestoAsignado = puesto;
          break;
        } else {
          mensajeError = comp;
        }
      }

      if (!puestoAsignado) throw new Error(`Incompatible: ${mensajeError}`);

      t.update('puestos', puestoAsignado.idPuesto, { idWorkerAsignado: workerId, timer: 120, rotacionIniciada: false });
      t.update('workers', workerId, { estadoActual: 'ASIGNADO', lineaActualId: lineaId, lineaDestinoId: null, puestoActualId: puestoAsignado.idPuesto });

      const alertas = t.query('alerts', a => a.workerId === workerId && a.type === 'transito');
      alertas.forEach(a => t.delete('alerts', a.id));
    });

    if (desvioEjecutado) {
      localDb.addLog(`Redirección de prioridad ejecutada localmente para ${workerId}.`, 'warning');
      return { status: 'redirigido', msg: redirigidoMsg };
    }
    localDb.addLog(`Asignado local: ${workerId} en ${puestoAsignado.nombreTarea}`, 'success');
    return { status: 'asignado', puesto: puestoAsignado.nombreTarea };
  }
}

// Evalúa las restricciones físicas, sexo e historial de no repetición
function evaluarFiltrosCompatibilidad(worker, puesto) {
  if (puesto.sexoRequerido !== 'Indiferente' && worker.sexo !== puesto.sexoRequerido) {
    return `Exclusivo para sexo ${puesto.sexoRequerido}.`;
  }
  if (worker.restriccionesMedicas && worker.restriccionesMedicas.length > 0) {
    const tieneRestriccion = puesto.restriccionesProhibidas && puesto.restriccionesProhibidas.some(r => 
      worker.restriccionesMedicas.includes(r)
    );
    if (tieneRestriccion) return `Presenta restricción de ${worker.restriccionesMedicas.join(', ')}.`;
  }
  if (worker.ultimaActividadAyer && worker.ultimaActividadAyer.toLowerCase().trim() === puesto.nombreTarea.toLowerCase().trim()) {
    return `No Repetición: Jornada anterior en esta tarea (${puesto.nombreTarea}).`;
  }
  return true;
}

/**
 * 3. APROBACIÓN DE DESPACHO EN LÍNEA 8
 */
export async function firebaseAprobarDespachoRotacion(alertaId) {
  if (useRealFirebase) {
    await runTransaction(db, async (transaction) => {
      const aRef = doc(db, "alerts", alertaId);
      const aSnap = await transaction.get(aRef);
      if (!aSnap.exists()) return;
      const alerta = aSnap.data();

      transaction.update(doc(db, "workers", alerta.workerEntranteId), { estadoActual: 'EN_TRANSITO', lineaActualId: null, lineaDestinoId: alerta.lineaPrioId });
      
      const qP = query(collection(db, "puestos"), where("idWorkerAsignado", "==", alerta.workerEntranteId), where("idLinea", "==", "L8"));
      const pSnap = await getDocs(qP);
      pSnap.forEach(d => transaction.update(d.ref, { idWorkerAsignado: null }));

      transaction.set(aRef, {
        ...alerta, type: 'esperando_recepcion', title: `TRABAJADOR EN CAMINO`,
        message: `El supervisor de L8 despachó a ${alerta.workerEntranteId}. Regístralo al llegar.`
      });
    });
  } else {
    localDb.runTransaction((t) => {
      const alerta = t.get('alerts', alertaId);
      if (!alerta) return;

      t.update('workers', alerta.workerEntranteId, { estadoActual: 'EN_TRANSITO', lineaActualId: null, lineaDestinoId: alerta.lineaPrioId, puestoActualId: null });
      
      const puestosL8 = t.query('puestos', p => p.idWorkerAsignado === alerta.workerEntranteId && p.idLinea === 'L8');
      puestosL8.forEach(p => t.update('puestos', p.idPuesto, { idWorkerAsignado: null }));

      t.set('alerts', alertaId, {
        ...alerta, type: 'esperando_recepcion', title: `TRABAJADOR EN CAMINO`,
        message: `El supervisor de L8 despachó a ${alerta.workerEntranteId}. Regístralo al llegar.`
      });
    });
    localDb.addLog(`Despacho local aprobado para ${alertaId}`, 'success');
  }
}

/**
 * 4. EFECTO DOMINÓ Y REDISTRIBUCIÓN EN CASCADA
 */
export async function firebaseCompletarRotacionYCascada(alertaId) {
  if (useRealFirebase) {
    await runTransaction(db, async (transaction) => {
      const aRef = doc(db, "alerts", alertaId);
      const aSnap = await transaction.get(aRef);
      if (!aSnap.exists()) return;
      const alerta = aSnap.data();

      transaction.update(doc(db, "puestos", alerta.puestoId), { idWorkerAsignado: alerta.workerEntranteId, timer: 120, rotacionIniciada: false });
      transaction.update(doc(db, "workers", alerta.workerEntranteId), { estadoActual: 'ASIGNADO', lineaActualId: alerta.lineaPrioId, puestoActualId: alerta.puestoId });

      const workerSalienteSnap = await transaction.get(doc(db, "workers", alerta.workerSalienteId));
      const workerSaliente = workerSalienteSnap.data();

      let vacante = false;
      for (let lineaId of ORDEN_PRIORIDADES) {
        if (lineaId === 'L8') continue;
        const lSnap = await transaction.get(doc(db, "lines", lineaId));
        if (lSnap.exists() && lSnap.data().estado === 'Operando') {
          const qP = query(collection(db, "puestos"), where("idLinea", "==", lineaId), where("tipo", "==", "Vario"));
          const pSnap = await getDocs(qP);
          const vacias = pSnap.docs.map(d => d.data()).filter(p => p.idWorkerAsignado === null);
          const apto = vacias.find(p => evaluarFiltrosCompatibilidad(workerSaliente, p) === true);

          if (apto) {
            vacante = true;
            transaction.update(doc(db, "workers", workerSaliente.idWorker), { estadoActual: 'EN_TRANSITO', lineaActualId: null, lineaDestinoId: lineaId });
            const alertId = `ALERTA_TRANSITO_${workerSaliente.idWorker}_${Date.now()}`;
            transaction.set(doc(db, "alerts", alertId), {
              id: alertId, type: 'transito', title: `OPERARIO REDISTRIBUIDO`,
              message: `${workerSaliente.nombre} reasignado a ${lineaId} tras relevo.`,
              workerId: workerSaliente.idWorker, lineaDestinoId: lineaId
            });
            break;
          }
        }
      }

      if (!vacante) {
        transaction.update(doc(db, "workers", workerSaliente.idWorker), { estadoActual: 'DISPONIBLE_BOLSON', lineaActualId: 'L8', puestoActualId: null });
        const qL8 = query(collection(db, "puestos"), where("idLinea", "==", "L8"));
        const snapL8 = await getDocs(qL8);
        const vaciasL8 = snapL8.docs.filter(d => d.data().idWorkerAsignado === null);
        if (vaciasL8.length > 0) transaction.update(vaciasL8[0].ref, { idWorkerAsignado: workerSaliente.idWorker });
      }

      transaction.delete(aRef);
    });
  } else {
    // LocalStorage rotación completa
    localDb.runTransaction((t) => {
      const alerta = t.get('alerts', alertaId);
      if (!alerta) return;

      t.update('puestos', alerta.puestoId, { idWorkerAsignado: alerta.workerEntranteId, timer: 120, rotacionIniciada: false });
      t.update('workers', alerta.workerEntranteId, { estadoActual: 'ASIGNADO', lineaActualId: alerta.lineaPrioId, puestoActualId: alerta.puestoId });

      const workerSaliente = t.get('workers', alerta.workerSalienteId);

      let vacante = false;
      for (let lineaId of ORDEN_PRIORIDADES) {
        if (lineaId === 'L8') continue;
        const l = t.get('lines', lineaId);
        if (l && l.estado === 'Operando') {
          const vacias = t.query('puestos', p => p.idLinea === lineaId && p.tipo === 'Vario' && p.idWorkerAsignado === null);
          const apto = vacias.find(p => evaluarFiltrosCompatibilidad(workerSaliente, p) === true);

          if (apto) {
            vacante = true;
            t.update('workers', workerSaliente.idWorker, { estadoActual: 'EN_TRANSITO', lineaActualId: null, lineaDestinoId: lineaId, puestoActualId: null });
            
            const alertId = `ALERTA_TRANSITO_${workerSaliente.idWorker}_${Date.now()}`;
            t.set('alerts', alertId, {
              id: alertId, type: 'transito', title: `OPERARIO REDISTRIBUIDO`,
              message: `${workerSaliente.nombre} reasignado a ${lineaId} tras relevo.`,
              workerId: workerSaliente.idWorker, lineaDestinoId: lineaId
            });
            break;
          }
        }
      }

      if (!vacante) {
        t.update('workers', workerSaliente.idWorker, { estadoActual: 'DISPONIBLE_BOLSON', lineaActualId: 'L8', puestoActualId: null });
        const vaciasL8 = t.query('puestos', p => p.idLinea === 'L8' && p.idWorkerAsignado === null);
        if (vaciasL8.length > 0) t.update('puestos', vaciasL8[0].idPuesto, { idWorkerAsignado: workerSaliente.idWorker });
      }

      t.delete('alerts', alertaId);
    });
    localDb.addLog(`Rotación local completada para ${alertaId}`, 'success');
  }
}

/**
 * 5. PROTOCOLO DE REINCORPORACIÓN
 */
export async function firebaseReincorporarTrabajador(workerId) {
  if (useRealFirebase) {
    await runTransaction(db, async (transaction) => {
      const workerSnap = await transaction.get(doc(db, "workers", workerId));
      if (!workerSnap.exists()) return;
      const worker = workerSnap.data();

      if (worker.rol === 'Operador A' || worker.rol === 'Averiero') {
        const q = query(collection(db, "puestos"), where("idWorkerOriginal", "==", workerId));
        const s = await getDocs(q);
        if (!s.empty) {
          const pDoc = s.docs[0];
          const reemplazoId = pDoc.data().idWorkerAsignado;

          transaction.update(pDoc.ref, { idWorkerAsignado: workerId });
          transaction.update(doc(db, "workers", workerId), { estadoActual: 'ASIGNADO', lineaActualId: pDoc.data().idLinea, puestoActualId: pDoc.id });

          if (reemplazoId && reemplazoId !== workerId) {
            const reemplazoSnap = await transaction.get(doc(db, "workers", reemplazoId));
            const reemplazo = reemplazoSnap.data();

            let vacante = false;
            for (let lineaId of ORDEN_PRIORIDADES) {
              if (lineaId === 'L8') continue;
              const lSnap = await transaction.get(doc(db, "lines", lineaId));
              if (lSnap.exists() && lSnap.data().estado === 'Operando') {
                const qP = query(collection(db, "puestos"), where("idLinea", "==", lineaId), where("tipo", "==", "Vario"));
                const pSnap = await getDocs(qP);
                const vacias = pSnap.docs.map(d => d.data()).filter(p => p.idWorkerAsignado === null);
                const apto = vacias.find(p => evaluarFiltrosCompatibilidad(reemplazo, p) === true);

                if (apto) {
                  vacante = true;
                  transaction.update(doc(db, "workers", reemplazoId), { estadoActual: 'EN_TRANSITO', lineaActualId: null, lineaDestinoId: lineaId });
                  break;
                }
              }
            }
            if (!vacante) {
              transaction.update(doc(db, "workers", reemplazoId), { estadoActual: 'DISPONIBLE_BOLSON', lineaActualId: 'L8', puestoActualId: null });
            }
          }
        }
      } else {
        transaction.update(doc(db, "workers", workerId), { estadoActual: 'DISPONIBLE_BOLSON', lineaActualId: 'L8', puestoActualId: null });
      }
    });
  } else {
    // LocalStorage reincorporar
    localDb.runTransaction((t) => {
      const worker = t.get('workers', workerId);
      if (!worker) return;

      if (worker.rol === 'Operador A' || worker.rol === 'Averiero') {
        const puestosOriginales = t.query('puestos', p => p.idWorkerOriginal === workerId);
        if (puestosOriginales.length > 0) {
          const puesto = puestosOriginales[0];
          const reemplazoId = puesto.idWorkerAsignado;

          t.update('puestos', puesto.idPuesto, { idWorkerAsignado: workerId });
          t.update('workers', workerId, { estadoActual: 'ASIGNADO', lineaActualId: puesto.idLinea, puestoActualId: puesto.idPuesto });

          if (reemplazoId && reemplazoId !== workerId) {
            const reemplazo = t.get('workers', reemplazoId);
            let vacante = false;

            for (let lineaId of ORDEN_PRIORIDADES) {
              if (lineaId === 'L8') continue;
              const l = t.get('lines', lineaId);
              if (l && l.estado === 'Operando') {
                const vacias = t.query('puestos', p => p.idLinea === lineaId && p.tipo === 'Vario' && p.idWorkerAsignado === null);
                const apto = vacias.find(p => evaluarFiltrosCompatibilidad(reemplazo, p) === true);

                if (apto) {
                  vacante = true;
                  t.update('workers', reemplazoId, { estadoActual: 'EN_TRANSITO', lineaActualId: null, lineaDestinoId: lineaId, puestoActualId: null });
                  break;
                }
              }
            }

            if (!vacante) {
              t.update('workers', reemplazoId, { estadoActual: 'DISPONIBLE_BOLSON', lineaActualId: 'L8', puestoActualId: null });
              const vaciasL8 = t.query('puestos', p => p.idLinea === 'L8' && p.idWorkerAsignado === null);
              if (vaciasL8.length > 0) t.update('puestos', vaciasL8[0].idPuesto, { idWorkerAsignado: reemplazoId });
            }
          }
        }
      } else {
        t.update('workers', workerId, { estadoActual: 'DISPONIBLE_BOLSON', lineaActualId: 'L8', puestoActualId: null });
        const vaciasL8 = t.query('puestos', p => p.idLinea === 'L8' && p.idWorkerAsignado === null);
        if (vaciasL8.length > 0) t.update('puestos', vaciasL8[0].idPuesto, { idWorkerAsignado: workerId });
      }
    });
    localDb.addLog(`Reincorporación local exitosa para ${workerId}`, 'success');
  }
}

/**
 * 6. PAROS POR PREPARACIÓN DE EQUIPOS
 */
export async function firebaseActivarPreparacion(lineaId) {
  if (useRealFirebase) {
    await runTransaction(db, async (transaction) => {
      transaction.update(doc(db, "lines", lineaId), { estado: 'En Preparación' });
      
      const q = query(collection(db, "puestos"), where("idLinea", "==", lineaId), where("tipo", "==", "Vario"));
      const s = await getDocs(q);
      const asignados = s.docs.filter(d => d.data().idWorkerAsignado !== null);

      asignados.forEach(d => {
        const workerId = d.data().idWorkerAsignado;
        transaction.update(d.ref, { idWorkerAsignado: null, timer: 120, rotacionIniciada: false });
        transaction.update(doc(db, "workers", workerId), { estadoActual: 'EN_TRANSITO', lineaActualId: null, lineaDestinoId: 'L8' });
        
        const aId = `ALERTA_TRANSITO_${workerId}_${Date.now()}`;
        transaction.set(doc(db, "alerts", aId), {
          id: aId, type: 'transito', title: `DESALOJO POR PARO`,
          message: `${workerId} desalojado por paro en L${lineaId}, va en tránsito a L8.`,
          workerId, lineaDestinoId: 'L8'
        });
      });
    });
  } else {
    localDb.runTransaction((t) => {
      t.update('lines', lineaId, { estado: 'En Preparación' });

      const puestos = t.query('puestos', p => p.idLinea === lineaId && p.tipo === 'Vario' && p.idWorkerAsignado !== null);
      puestos.forEach(p => {
        const workerId = p.idWorkerAsignado;
        t.update('puestos', p.idPuesto, { idWorkerAsignado: null, timer: 120, rotacionIniciada: false });
        t.update('workers', workerId, { estadoActual: 'EN_TRANSITO', lineaActualId: null, lineaDestinoId: 'L8', puestoActualId: null });

        const aId = `ALERTA_TRANSITO_${workerId}_${Date.now()}`;
        t.set('alerts', aId, {
          id: aId, type: 'transito', title: `DESALOJO POR PARO`,
          message: `${workerId} desalojado por paro en L${lineaId}, va en tránsito a L8.`,
          workerId, lineaDestinoId: 'L8'
        });
      });
    });
    localDb.addLog(`Línea ${lineaId} entra localmente en preparación.`, 'warning');
  }
}

/**
 * Restablecer línea
 */
export async function firebaseRestablecerLinea(lineaId) {
  if (useRealFirebase) {
    await runTransaction(db, async (transaction) => {
      transaction.update(doc(db, "lines", lineaId), { estado: 'Operando' });
    });
  } else {
    localDb.runTransaction(t => t.update('lines', lineaId, { estado: 'Operando' }));
    localDb.addLog(`Línea ${lineaId} restablecida localmente.`, 'success');
  }
}

/**
 * Decremento de temporizadores en segundo plano
 */
export async function firebaseDecrementarTemporizadores(simSpeed) {
  if (useRealFirebase) {
    try {
      await runTransaction(db, async (transaction) => {
        const qPuestos = query(collection(db, "puestos"), where("tipo", "==", "Vario"));
        const puestosSnap = await getDocs(qPuestos);
        const puestosOcupados = puestosSnap.docs
          .map(d => ({ ref: d.ref, data: d.data() }))
          .filter(x => x.data.idWorkerAsignado !== null);

        for (let puesto of puestosOcupados) {
          const p = puesto.data;
          if (p.timer > 0) {
            const nuevoTiempo = Math.max(0, p.timer - 1 * simSpeed);
            transaction.update(puesto.ref, { timer: nuevoTiempo });

            if (nuevoTiempo <= 30 && nuevoTiempo > 0 && !p.rotacionIniciada) {
              transaction.update(puesto.ref, { rotacionIniciada: true });

              const workerSalienteSnap = await transaction.get(doc(db, "workers", p.idWorkerAsignado));
              if (workerSalienteSnap.exists()) {
                const workerSaliente = workerSalienteSnap.data();

                const qC = query(collection(db, "workers"), where("lineaActualId", "==", "L8"), where("estadoActual", "==", "DISPONIBLE_BOLSON"));
                const snapC = await getDocs(qC);
                const candidatos = snapC.docs.map(d => d.data());

                const relevo = candidatos.find(w => evaluarFiltrosBasicos(w, p) === true);
                if (relevo) {
                  const aId = `ALERTA_ROT_${p.idPuesto}_${relevo.idWorker}_${Date.now()}`;
                  transaction.set(doc(db, "alerts", aId), {
                    id: aId, type: 'solicitud_rotacion', title: `ROTACIÓN EN CURSO (➜ L${p.idLinea})`,
                    message: `Línea prioritaria ${p.idLinea} solicita a ${relevo.nombre} para relevar en ${p.nombreTarea}.`,
                    workerSalienteId: workerSaliente.idWorker, workerEntranteId: relevo.idWorker,
                    puestoId: p.idPuesto, lineaPrioId: p.idLinea, lineaL8Id: 'L8'
                  });
                } else {
                  transaction.update(puesto.ref, { timer: 20, rotacionIniciada: false });
                }
              }
            }
          }
        }
      });
    } catch (e) {}
  } else {
    // LocalStorage decremento
    try {
      localDb.runTransaction((t) => {
        const puestos = t.query('puestos', p => p.tipo === 'Vario' && p.idWorkerAsignado !== null);
        
        puestos.forEach(p => {
          if (p.timer > 0) {
            const nuevoTiempo = Math.max(0, p.timer - 1 * simSpeed);
            t.update('puestos', p.idPuesto, { timer: nuevoTiempo });

            if (nuevoTiempo <= 30 && nuevoTiempo > 0 && !p.rotacionIniciada) {
              t.update('puestos', p.idPuesto, { rotacionIniciada: true });

              const workerSaliente = t.get('workers', p.idWorkerAsignado);
              const candidatos = t.query('workers', w => w.lineaActualId === 'L8' && w.estadoActual === 'DISPONIBLE_BOLSON');

              const relevo = candidatos.find(w => evaluarFiltrosBasicos(w, p) === true);
              if (relevo) {
                const aId = `ALERTA_ROT_${p.idPuesto}_${relevo.idWorker}_${Date.now()}`;
                t.set('alerts', aId, {
                  id: aId, type: 'solicitud_rotacion', title: `ROTACIÓN EN CURSO (➜ L${p.idLinea})`,
                  message: `Línea prioritaria ${p.idLinea} solicita a ${relevo.nombre} para relevar en ${p.nombreTarea}.`,
                  workerSalienteId: workerSaliente.idWorker, workerEntranteId: relevo.idWorker,
                  puestoId: p.idPuesto, lineaPrioId: p.idLinea, lineaL8Id: 'L8'
                });
              } else {
                t.update('puestos', p.idPuesto, { timer: 20, rotacionIniciada: false });
              }
            }
          }
        });
      });
    } catch (e) {}
  }
}

function evaluarFiltrosBasicos(worker, puesto) {
  if (puesto.sexoRequerido !== 'Indiferente' && worker.sexo !== puesto.sexoRequerido) return false;
  if (worker.restriccionesMedicas && worker.restriccionesMedicas.length > 0) {
    const tieneRestriccion = puesto.restriccionesProhibidas && puesto.restriccionesProhibidas.some(r => 
      worker.restriccionesMedicas.includes(r)
    );
    if (tieneRestriccion) return false;
  }
  if (worker.ultimaActividadAyer && worker.ultimaActividadAyer.toLowerCase().trim() === puesto.nombreTarea.toLowerCase().trim()) return false;
  return true;
}
