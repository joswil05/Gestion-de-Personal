// Servicio Híbrido de Base de Datos y Motores de Distribución Lean en Tiempo Real
// Autodetecta si hay Firebase disponible; de lo contrario, usa LocalStorage con transacciones consistentes.
//
// ======================================================================================
// ARQUITECTURA DE INTEGRACIÓN FUTURA DE FIREBASE FIRESTORE:
// - Cada método de este servicio cuenta con una bifurcación lógica basada en 'useRealFirebase'.
// - RAMA Firestore (useRealFirebase === true): Realiza operaciones atómicas síncronas usando
//   transacciones 'runTransaction' sobre las colecciones 'workers', 'lines', 'puestos', 'alerts' y 'logs'.
// - RAMA LocalStorage (useRealFirebase === false): Ejecuta transacciones y consultas equivalentes
//   sobre un estado en memoria persistido localmente para contingencia y desarrollo offline.
// - Al inyectar las llaves reales en el archivo '.env', el sistema se conectará a tu base de
//   datos de Firestore en caliente automáticamente sin cambiar una sola línea de código aquí.
// ======================================================================================

import { db, useRealFirebase } from '../firebase';
import { 
  collection, 
  doc, 
  setDoc, 
  runTransaction, 
  query, 
  where, 
  getDocs,
  onSnapshot
} from 'firebase/firestore';
import { LINEAS_MOCK, TRABAJADORES_MOCK, PUESTOS_PLANTILLA } from '../mocks/mockData';

// Jerarquía estricta de prioridad de la planta
export const ORDEN_PRIORIDADES = ['L4', 'L1', 'L2', 'L6', 'L7', 'L5', 'L3', 'L8', 'L9', 'L10'];

// --- BASE DE DATOS LOCAL EN LOCALSTORAGE (Adaptador de Respaldo Consistente) ---
class LocalStorageDatabaseAdapter {
  constructor() {
    this.listeners = [];
    window.addEventListener('storage', () => this.notifyListeners());
  }

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

  initialize(workers, lines, puestos) {
    localStorage.setItem(`smartassign_workers`, JSON.stringify(workers));
    localStorage.setItem(`smartassign_lines`, JSON.stringify(lines));
    localStorage.setItem(`smartassign_puestos`, JSON.stringify(puestos));
    localStorage.setItem(`smartassign_alerts`, JSON.stringify([]));
    localStorage.setItem(`smartassign_logs`, JSON.stringify([]));
    this.addLog("Base de datos local inicializada con vacantes por defecto.", "success");
    this.notifyListeners();
  }

  addLog(message, type = 'info') {
    const logs = this.getCollection('logs', []);
    const time = new Date().toLocaleTimeString();
    logs.unshift({ timestamp: Date.now(), timeFormatted: time, message, type });
    this.saveCollection('logs', logs.slice(0, 50));
  }

  runTransaction(transactionFn) {
    const state = this.getDataState();
    
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
      this.saveCollection('workers', dbSnapshot.workers);
      this.saveCollection('lines', dbSnapshot.lines);
      this.saveCollection('puestos', dbSnapshot.puestos);
      this.saveCollection('alerts', dbSnapshot.alerts);
      return { success: true };
    } catch (e) {
      console.error("Transacción abortada:", e.message);
      this.addLog(`Fallo de consistencia: ${e.message}`, 'error');
      throw e;
    }
  }
}

export const localDb = new LocalStorageDatabaseAdapter();

// --- SISTEMA DE SUSCRIPCIÓN EN TIEMPO REAL ---
export function suscribirEstadoPlanta(callback) {
  if (useRealFirebase) {
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
      console.warn("Falla de registro en la nube.", e);
    }
  } else {
    localDb.addLog(mensaje, tipo);
  }
}

// --- EVALUADOR DE COMPATIBILIDAD LEAN ---
export function evaluarFiltrosCompatibilidad(worker, puesto) {
  if (!worker) return "Trabajador indefinido.";
  if (!puesto) return "Puesto indefinido.";
  
  // 1. Filtro de Sexo
  if (puesto.sexoRequerido && puesto.sexoRequerido !== 'Indiferente' && worker.sexo !== puesto.sexoRequerido) {
    return `Exclusivo para sexo ${puesto.sexoRequerido}.`;
  }
  
  // 2. Filtro de Restricciones Médicas y de Salud
  if (worker.restriccionesMedicas && worker.restriccionesMedicas.length > 0) {
    const tieneRestriccion = puesto.restriccionesProhibidas && puesto.restriccionesProhibidas.some(r => 
      worker.restriccionesMedicas.includes(r)
    );
    if (tieneRestriccion) return `Restricción médica: ${worker.restriccionesMedicas.join(', ')}.`;
  }
  
  // 3. Filtro de No Repetición (Historial)
  if (worker.ultimaActividadAyer && worker.ultimaActividadAyer.toLowerCase().trim() === puesto.nombreTarea.toLowerCase().trim()) {
    return `Regla No Repetición: Ayer trabajó en ${puesto.nombreTarea}.`;
  }
  
  return true;
}

// --- INICIALIZACIÓN ABSOLUTA DE TURNO (SEGURO CONTRA UNDEFINED) ---
export async function firebaseInicializarTurno() {
  // Inicializa el turno con todo el personal por defecto (mantiene retrocompatibilidad)
  const todosLosIds = TRABAJADORES_MOCK
    .filter(w => w.rol !== 'Coordinador' && w.rol !== 'Supervisor')
    .map(w => w.idWorker);
  return firebaseIniciarTurnoConAsistencia(todosLosIds);
}

// --- ARRANQUE DE TURNO SELECCIONANDO ASISTENCIA REAL DE PLANTA ---
export async function firebaseIniciarTurnoConAsistencia(presentesIds) {
  const puestosIniciales = [];
  LINEAS_MOCK.forEach(l => {
    // 3 puestos fijos por línea
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
    // Puestos varios de plantilla
    const variosDeLinea = PUESTOS_PLANTILLA.varios[l.idLinea] || [];
    variosDeLinea.forEach(pv => {
      puestosIniciales.push({
        idPuesto: pv.idPuesto,
        idLinea: l.idLinea,
        tipo: 'Vario',
        nombreTarea: pv.nombreTarea,
        sexoRequerido: pv.sexoRequerido || 'Indiferente',
        restriccionesProhibidas: pv.restriccionesProhibidas || [],
        idWorkerAsignado: null,
        asignadoEnSegundoVirtual: null,
        maxHorasPermitidas: 2,
        rotacionIniciada: false
      });
    });
  });

  // Copia de los presentes para control de asignación
  const poolActivos = [...presentesIds];

  if (useRealFirebase) {
    try {
      // Escribir líneas y puestos base en Firestore
      for (let l of LINEAS_MOCK) {
        await setDoc(doc(db, "lines", l.idLinea), l);
      }
      for (let p of puestosIniciales) {
        await setDoc(doc(db, "puestos", p.idPuesto), p);
      }
      for (let w of TRABAJADORES_MOCK) {
        await setDoc(doc(db, "workers", w.idWorker), w);
      }

      await runTransaction(db, async (transaction) => {
        // 1. Configurar estado de asistencia para todos los trabajadores
        for (let w of TRABAJADORES_MOCK) {
          const wRef = doc(db, "workers", w.idWorker);
          if (w.rol === 'Coordinador' || w.rol === 'Supervisor') {
            transaction.update(wRef, { 
              estadoActual: 'ASIGNADO', 
              lineaActualId: w.lineaActualId || null, 
              puestoActualId: w.puestoActualId || null 
            });
          } else if (poolActivos.includes(w.idWorker)) {
            transaction.update(wRef, { 
              estadoActual: 'POOL_ARRANQUE', 
              lineaActualId: null, 
              puestoActualId: null 
            });
          } else {
            transaction.update(wRef, { 
              estadoActual: 'INACTIVO', 
              lineaActualId: null, 
              puestoActualId: null 
            });
          }
        }

        // 2. Realizar cascadeo atómico de fijos
        const asignadosLocalmente = [];
        for (let p of puestosIniciales) {
          if (p.tipo === 'Fijo') {
            const pRef = doc(db, "puestos", p.idPuesto);
            
            // Buscar titular de la rol que esté presente
            const titular = TRABAJADORES_MOCK.find(w => 
              w.rol === p.rolRequerido && 
              poolActivos.includes(w.idWorker) && 
              !asignadosLocalmente.includes(w.idWorker)
            );

            if (titular) {
              transaction.update(pRef, { 
                idWorkerAsignado: titular.idWorker, 
                idWorkerOriginal: titular.idWorker 
              });
              transaction.update(doc(db, "workers", titular.idWorker), { 
                estadoActual: 'ASIGNADO', 
                lineaActualId: p.idLinea, 
                puestoActualId: p.idPuesto 
              });
              asignadosLocalmente.push(titular.idWorker);
            } else {
              // Reemplazo Operador B que esté presente
              const reemplazo = TRABAJADORES_MOCK.find(w => 
                w.rol === 'Operador B' && 
                poolActivos.includes(w.idWorker) && 
                !asignadosLocalmente.includes(w.idWorker)
              );
              if (reemplazo) {
                transaction.update(pRef, { 
                  idWorkerAsignado: reemplazo.idWorker, 
                  idWorkerOriginal: 'N/A' 
                });
                transaction.update(doc(db, "workers", reemplazo.idWorker), { 
                  estadoActual: 'ASIGNADO', 
                  lineaActualId: p.idLinea, 
                  puestoActualId: p.idPuesto 
                });
                asignadosLocalmente.push(reemplazo.idWorker);
              }
            }
          }
        }
      });
      await registrarLogFirestore(`Arranque de turno exitoso en la nube. ${poolActivos.length} operarios registrados. Puestos fijos asignados en cascada.`, "success");
    } catch (e) {
      console.error("Falla de arranque con asistencia en Firestore:", e);
      throw e;
    }
  } else {
    // Arranque Local
    const localWorkers = JSON.parse(JSON.stringify(TRABAJADORES_MOCK));
    const localPuestos = JSON.parse(JSON.stringify(puestosIniciales));

    // 1. Actualizar asistencia
    localWorkers.forEach(w => {
      if (w.rol === 'Coordinador' || w.rol === 'Supervisor') {
        w.estadoActual = 'ASIGNADO';
      } else if (poolActivos.includes(w.idWorker)) {
        w.estadoActual = 'POOL_ARRANQUE';
        w.lineaActualId = null;
        w.puestoActualId = null;
      } else {
        w.estadoActual = 'INACTIVO';
        w.lineaActualId = null;
        w.puestoActualId = null;
      }
    });

    const asignadosLocalmente = [];

    // 2. Cascadeo de Fijos
    localPuestos.forEach(p => {
      if (p.tipo === 'Fijo') {
        const titularIndex = localWorkers.findIndex(w => 
          w.rol === p.rolRequerido && 
          w.estadoActual === 'POOL_ARRANQUE' && 
          !asignadosLocalmente.includes(w.idWorker)
        );
        if (titularIndex !== -1) {
          const titular = localWorkers[titularIndex];
          p.idWorkerAsignado = titular.idWorker;
          p.idWorkerOriginal = titular.idWorker;
          titular.estadoActual = 'ASIGNADO';
          titular.lineaActualId = p.idLinea;
          titular.puestoActualId = p.idPuesto;
          asignadosLocalmente.push(titular.idWorker);
        } else {
          // Reemplazo Operador B
          const reemplazoIndex = localWorkers.findIndex(w => 
            w.rol === 'Operador B' && 
            w.estadoActual === 'POOL_ARRANQUE' && 
            !asignadosLocalmente.includes(w.idWorker)
          );
          if (reemplazoIndex !== -1) {
            const reemplazo = localWorkers[reemplazoIndex];
            p.idWorkerAsignado = reemplazo.idWorker;
            p.idWorkerOriginal = 'N/A';
            reemplazo.estadoActual = 'ASIGNADO';
            reemplazo.lineaActualId = p.idLinea;
            reemplazo.puestoActualId = p.idPuesto;
            asignadosLocalmente.push(reemplazo.idWorker);
          }
        }
      }
    });

    localDb.initialize(localWorkers, LINEAS_MOCK, localPuestos);
  }
}

// --- MOTOR 1: INTERCEPCIÓN DEFENSIVA ---
export async function firebaseEscanearQR(workerId, lineaId, simSeconds) {
  if (useRealFirebase) {
    let response = null;
    await runTransaction(db, async (transaction) => {
      const wRef = doc(db, "workers", workerId);
      const wSnap = await transaction.get(wRef);
      if (!wSnap.exists()) throw new Error("QR no reconocido en la base de datos.");
      const worker = wSnap.data();

      const lRef = doc(db, "lines", lineaId);
      const lSnap = await transaction.get(lRef);
      if (!lSnap.exists()) throw new Error("Línea no parametrizada.");
      const linea = lSnap.data();

      if (linea.estado === 'En Preparación') {
        throw new Error(`Operación bloqueada. La línea está en mantenimiento.`);
      }

      if (worker.estadoActual === 'ASIGNADO' && worker.rol === 'Operador A') {
        throw new Error(`${worker.nombre} es un Operador A congelado en su puesto.`);
      }

      // Buscar vacante disponible en la línea actual escaneada
      const qPuestos = query(collection(db, "puestos"), where("idLinea", "==", lineaId), where("tipo", "==", "Vario"));
      const pSnap = await getDocs(qPuestos);
      const vacantesLocales = pSnap.docs.map(d => d.data()).filter(p => p.idWorkerAsignado === null);

      if (vacantesLocales.length === 0) throw new Error("No hay vacantes varias en esta línea.");

      // Evaluar compatibilidad con la vacante local
      let puestoElegido = null;
      let razonFalla = "";
      for (let pv of vacantesLocales) {
        const comp = evaluarFiltrosCompatibilidad(worker, pv);
        if (comp === true) {
          puestoElegido = pv;
          break;
        } else {
          razonFalla = comp;
        }
      }

      if (!puestoElegido) throw new Error(`Restricción técnica: ${razonFalla}`);

      // --- BUCLE DE INTERCEPCIÓN DEFENSIVA ---
      const idxActual = ORDEN_PRIORIDADES.indexOf(lineaId);
      
      for (let i = 0; i < idxActual; i++) {
        const lpId = ORDEN_PRIORIDADES[i];
        const lpSnap = await transaction.get(doc(db, "lines", lpId));
        
        if (lpSnap.exists() && lpSnap.data().estado === 'Operando') {
          const qPrio = query(collection(db, "puestos"), where("idLinea", "==", lpId), where("tipo", "==", "Vario"));
          const prioSnap = await getDocs(qPrio);
          const vacantesPrio = prioSnap.docs.map(d => d.data()).filter(p => p.idWorkerAsignado === null);

          for (let vp of vacantesPrio) {
            if (evaluarFiltrosCompatibilidad(worker, vp) === true) {
              // Interceptado
              transaction.update(wRef, { 
                estadoActual: 'EN_TRANSITO', 
                lineaActualId: null, 
                lineaDestinoId: lpId, 
                puestoActualId: null 
              });
              
              const aId = `INTERCEPT_${workerId}_${Date.now()}`;
              transaction.set(doc(db, "alerts", aId), {
                id: aId,
                type: 'transito',
                title: 'DESVÍO FORZADO POR PRIORIDAD',
                message: `${worker.nombre} interceptado para cubrir Línea Prioritaria ${lpSnap.data().nombre}.`,
                workerId,
                lineaDestinoId: lpId
              });

              response = { status: 'redirigido', msg: `¡DESVÍO! Enviado a la Línea Prioritaria ${lpSnap.data().nombre}.` };
              return;
            }
          }
        }
      }

      // Asignación directa local correcta
      transaction.update(doc(db, "puestos", puestoElegido.idPuesto), { 
        idWorkerAsignado: workerId, 
        asignadoEnSegundoVirtual: simSeconds,
        rotacionIniciada: false 
      });
      transaction.update(wRef, { 
        estadoActual: 'ASIGNADO', 
        lineaActualId: lineaId, 
        lineaDestinoId: null, 
        puestoActualId: puestoElegido.idPuesto 
      });

      // Eliminar alertas viejas de tránsito
      const qAlerts = query(collection(db, "alerts"), where("workerId", "==", workerId), where("type", "==", "transito"));
      const sAlerts = await getDocs(qAlerts);
      sAlerts.forEach(d => transaction.delete(d.ref));

      response = { status: 'asignado', puesto: puestoElegido.nombreTarea };
    });
    return response;
  } else {
    // Escaneo Local con Adaptador
    let response = null;
    localDb.runTransaction((t) => {
      const worker = t.get('workers', workerId);
      if (!worker) throw new Error("Código QR no reconocido.");

      const linea = t.get('lines', lineaId);
      if (linea.estado === 'En Preparación') throw new Error("Línea en mantenimiento.");

      if (worker.estadoActual === 'ASIGNADO' && worker.rol === 'Operador A') {
        throw new Error("Operador A congelado en su máquina.");
      }

      const vacantesLocales = t.query('puestos', p => p.idLinea === lineaId && p.tipo === 'Vario' && p.idWorkerAsignado === null);
      if (vacantesLocales.length === 0) throw new Error("Sin vacantes varias en esta línea.");

      let puestoElegido = null;
      let razonFalla = "";
      for (let pv of vacantesLocales) {
        const comp = evaluarFiltrosCompatibilidad(worker, pv);
        if (comp === true) {
          puestoElegido = pv;
          break;
        } else {
          razonFalla = comp;
        }
      }

      if (!puestoElegido) throw new Error(`Restricción técnica: ${razonFalla}`);

      // Intercepción superior
      const idxActual = ORDEN_PRIORIDADES.indexOf(lineaId);

      for (let i = 0; i < idxActual; i++) {
        const lpId = ORDEN_PRIORIDADES[i];
        const lp = t.get('lines', lpId);
        
        if (lp && lp.estado === 'Operando') {
          const vacantesPrio = t.query('puestos', p => p.idLinea === lpId && p.tipo === 'Vario' && p.idWorkerAsignado === null);
          for (let vp of vacantesPrio) {
            if (evaluarFiltrosCompatibilidad(worker, vp) === true) {
              t.update('workers', workerId, { 
                estadoActual: 'EN_TRANSITO', 
                lineaActualId: null, 
                lineaDestinoId: lpId, 
                puestoActualId: null 
              });

              const aId = `INTERCEPT_${workerId}_${Date.now()}`;
              t.set('alerts', aId, {
                id: aId,
                type: 'transito',
                title: 'DESVÍO FORZADO POR PRIORIDAD',
                message: `${worker.nombre} redirigido a ${lp.nombre} por prioridad.`,
                workerId,
                lineaDestinoId: lpId
              });

              response = { status: 'redirigido', msg: `¡DESVÍO! Redirigido a la línea prioritaria ${lp.nombre}.` };
              return;
            }
          }
        }
      }

      // Asignar directo local
      t.update('puestos', puestoElegido.idPuesto, { 
        idWorkerAsignado: workerId, 
        asignadoEnSegundoVirtual: simSeconds,
        rotacionIniciada: false 
      });
      t.update('workers', workerId, { 
        estadoActual: 'ASIGNADO', 
        lineaActualId: lineaId, 
        lineaDestinoId: null, 
        puestoActualId: puestoElegido.idPuesto 
      });

      const alertasViejas = t.query('alerts', a => a.workerId === workerId && a.type === 'transito');
      alertasViejas.forEach(a => t.delete('alerts', a.id));

      response = { status: 'asignado', puesto: puestoElegido.nombreTarea };
    });
    localDb.addLog(`Asignación QR exitosa: ${workerId} en ${lineaId}`, 'success');
    return response;
  }
}

// --- CHEQUEO PASIVO Y DISPARADOR DE ROTACIÓN ---
export async function firebaseTriggerRotacionAutomatica(puestoId) {
  if (useRealFirebase) {
    try {
      await runTransaction(db, async (transaction) => {
        const pRef = doc(db, "puestos", puestoId);
        const pSnap = await transaction.get(pRef);
        if (!pSnap.exists() || pSnap.data().rotacionIniciada || !pSnap.data().idWorkerAsignado) return;
        const p = pSnap.data();

        // Buscar relevo compatible en L8 (Bolsón)
        const qL8 = query(collection(db, "workers"), where("lineaActualId", "==", "L8"), where("estadoActual", "==", "DISPONIBLE_BOLSON"));
        const sL8 = await getDocs(qL8);
        const candidatos = sL8.docs.map(d => d.data());

        const relevo = candidatos.find(w => evaluarFiltrosCompatibilidad(w, p) === true);
        if (relevo) {
          transaction.update(pRef, { rotacionIniciada: true });
          
          const aId = `ALERTA_ROT_${p.idPuesto}_${relevo.idWorker}_${Date.now()}`;
          transaction.set(doc(db, "alerts", aId), {
            id: aId,
            type: 'solicitud_rotacion',
            title: `ROTACIÓN REQUERIDA (➜ L${p.idLinea})`,
            message: `Línea prioritaria solicita a ${relevo.nombre} para relevar en ${p.nombreTarea}.`,
            workerSalienteId: p.idWorkerAsignado,
            workerEntranteId: relevo.idWorker,
            puestoId: p.idPuesto,
            lineaPrioId: p.idLinea
          });
        }
      });
    } catch (e) {
      console.error("Error en rotación automática Firestore:", e);
    }
  } else {
    localDb.runTransaction((t) => {
      const p = t.get('puestos', puestoId);
      if (!p || p.rotacionIniciada || !p.idWorkerAsignado) return;

      const candidatos = t.query('workers', w => w.lineaActualId === 'L8' && w.estadoActual === 'DISPONIBLE_BOLSON');
      const relevo = candidatos.find(w => evaluarFiltrosCompatibilidad(w, p) === true);

      if (relevo) {
        t.update('puestos', puestoId, { rotacionIniciada: true });
        const aId = `ALERTA_ROT_${p.idPuesto}_${relevo.idWorker}_${Date.now()}`;
        t.set('alerts', aId, {
          id: aId,
          type: 'solicitud_rotacion',
          title: `ROTACIÓN REQUERIDA (➜ L${p.idLinea})`,
          message: `Línea prioritaria solicita a ${relevo.nombre} para relevar en ${p.nombreTarea}.`,
          workerSalienteId: p.idWorkerAsignado,
          workerEntranteId: relevo.idWorker,
          puestoId: p.idPuesto,
          lineaPrioId: p.idLinea
        });
      }
    });
  }
}

// --- MOTOR 2: EL RELEVO Y EL EFECTO DOMINÓ (APROBACIÓN L8 Y LLEGADA) ---
export async function firebaseAprobarDespachoRotacion(alertaId) {
  if (useRealFirebase) {
    await runTransaction(db, async (transaction) => {
      const aRef = doc(db, "alerts", alertaId);
      const aSnap = await transaction.get(aRef);
      if (!aSnap.exists()) return;
      const alerta = aSnap.data();

      // Pasa a en tránsito
      transaction.update(doc(db, "workers", alerta.workerEntranteId), { 
        estadoActual: 'EN_TRANSITO', 
        lineaActualId: null, 
        lineaDestinoId: alerta.lineaPrioId,
        puestoActualId: null
      });
      
      // Liberar su puesto en L8
      const q = query(collection(db, "puestos"), where("idWorkerAsignado", "==", alerta.workerEntranteId), where("idLinea", "==", "L8"));
      const snap = await getDocs(q);
      snap.forEach(d => transaction.update(d.ref, { idWorkerAsignado: null }));

      // Actualizar alerta
      transaction.set(aRef, {
        ...alerta,
        type: 'esperando_recepcion',
        title: `RELEVO EN CAMINO A L${alerta.lineaPrioId}`,
        message: `El supervisor de L8 despachó al relevo. Regístralo al llegar.`
      });
    });
  } else {
    localDb.runTransaction((t) => {
      const alerta = t.get('alerts', alertaId);
      if (!alerta) return;

      t.update('workers', alerta.workerEntranteId, { 
        estadoActual: 'EN_TRANSITO', 
        lineaActualId: null, 
        lineaDestinoId: alerta.lineaPrioId,
        puestoActualId: null
      });

      const puestosL8 = t.query('puestos', p => p.idWorkerAsignado === alerta.workerEntranteId && p.idLinea === 'L8');
      puestosL8.forEach(p => t.update('puestos', p.idPuesto, { idWorkerAsignado: null }));

      t.set('alerts', alertaId, {
        ...alerta,
        type: 'esperando_recepcion',
        title: `RELEVO EN CAMINO A L${alerta.lineaPrioId}`,
        message: `El supervisor de L8 despachó al relevo. Regístralo al llegar.`
      });
    });
    localDb.addLog(`Supervisor de L8 aprueba despacho para ${alertaId}`, 'success');
  }
}

// Cierre e Intercambio + Cascada del Relevado
export async function firebaseCompletarRotacionYCascada(alertaId, simSeconds) {
  if (useRealFirebase) {
    await runTransaction(db, async (transaction) => {
      const aRef = doc(db, "alerts", alertaId);
      const aSnap = await transaction.get(aRef);
      if (!aSnap.exists()) return;
      const alerta = aSnap.data();

      // 1. Asignar al entrante en el puesto prioritario
      transaction.update(doc(db, "puestos", alerta.puestoId), { 
        idWorkerAsignado: alerta.workerEntranteId, 
        asignadoEnSegundoVirtual: simSeconds,
        rotacionIniciada: false 
      });
      transaction.update(doc(db, "workers", alerta.workerEntranteId), { 
        estadoActual: 'ASIGNADO', 
        lineaActualId: alerta.lineaPrioId, 
        puestoActualId: alerta.puestoId,
        lineaDestinoId: null 
      });

      // 2. Liberar al saliente (relevado)
      const salienteSnap = await transaction.get(doc(db, "workers", alerta.workerSalienteId));
      if (!salienteSnap.exists()) {
        transaction.delete(aRef);
        return;
      }
      const workerSaliente = salienteSnap.data();

      // --- CASCADA DEL RELEVADO ---
      let redistribuido = false;
      for (let lId of ORDEN_PRIORIDADES) {
        if (lId === 'L8') continue; // Evitar ir a L8 directo
        const lSnap = await transaction.get(doc(db, "lines", lId));
        if (lSnap.exists() && lSnap.data().estado === 'Operando') {
          const qP = query(collection(db, "puestos"), where("idLinea", "==", lId), where("tipo", "==", "Vario"));
          const pSnap = await getDocs(qP);
          const vacantes = pSnap.docs.map(d => d.data()).filter(p => p.idWorkerAsignado === null);

          // Buscar puesto compatible
          const apto = vacantes.find(pv => evaluarFiltrosCompatibilidad(workerSaliente, pv) === true);
          if (apto) {
            redistribuido = true;
            transaction.update(doc(db, "workers", workerSaliente.idWorker), { 
              estadoActual: 'EN_TRANSITO', 
              lineaActualId: null, 
              lineaDestinoId: lId,
              puestoActualId: null 
            });

            const alertId = `CASCADA_${workerSaliente.idWorker}_${Date.now()}`;
            transaction.set(doc(db, "alerts", alertId), {
              id: alertId,
              type: 'transito',
              title: 'REDIRECCIÓN POR CASCADA (RELEVO)',
              message: `${workerSaliente.nombre} reasignado a L${lId} por prioridad tras relevo ergonómico.`,
              workerId: workerSaliente.idWorker,
              lineaDestinoId: lId
            });
            break;
          }
        }
      }

      if (!redistribuido) {
        // Regresa a L8 (Bolsón)
        transaction.update(doc(db, "workers", workerSaliente.idWorker), { 
          estadoActual: 'DISPONIBLE_BOLSON', 
          lineaActualId: 'L8', 
          puestoActualId: null,
          lineaDestinoId: null 
        });
        
        // Asignar en un puesto vario vacío de L8 para mantenerlo productivo
        const qL8 = query(collection(db, "puestos"), where("idLinea", "==", "L8"));
        const snapL8 = await getDocs(qL8);
        const vaciasL8 = snapL8.docs.filter(d => d.data().idWorkerAsignado === null);
        if (vaciasL8.length > 0) {
          transaction.update(vaciasL8[0].ref, { idWorkerAsignado: workerSaliente.idWorker });
          transaction.update(doc(db, "workers", workerSaliente.idWorker), { puestoActualId: vaciasL8[0].id });
        }
      }

      // Consumir alerta
      transaction.delete(aRef);
    });
  } else {
    // Cascada Local
    localDb.runTransaction((t) => {
      const alerta = t.get('alerts', alertaId);
      if (!alerta) return;

      t.update('puestos', alerta.puestoId, { 
        idWorkerAsignado: alerta.workerEntranteId, 
        asignadoEnSegundoVirtual: simSeconds,
        rotacionIniciada: false 
      });
      t.update('workers', alerta.workerEntranteId, { 
        estadoActual: 'ASIGNADO', 
        lineaActualId: alerta.lineaPrioId, 
        puestoActualId: alerta.puestoId,
        lineaDestinoId: null 
      });

      const workerSaliente = t.get('workers', alerta.workerSalienteId);
      if (!workerSaliente) {
        t.delete('alerts', alertaId);
        return;
      }

      let redistribuido = false;
      for (let lId of ORDEN_PRIORIDADES) {
        if (lId === 'L8') continue;
        const l = t.get('lines', lId);
        if (l && l.estado === 'Operando') {
          const vacantes = t.query('puestos', p => p.idLinea === lId && p.tipo === 'Vario' && p.idWorkerAsignado === null);
          const apto = vacantes.find(pv => evaluarFiltrosCompatibilidad(workerSaliente, pv) === true);

          if (apto) {
            redistribuido = true;
            t.update('workers', workerSaliente.idWorker, { 
              estadoActual: 'EN_TRANSITO', 
              lineaActualId: null, 
              lineaDestinoId: lId,
              puestoActualId: null 
            });

            const alertId = `CASCADA_${workerSaliente.idWorker}_${Date.now()}`;
            t.set('alerts', alertId, {
              id: alertId,
              type: 'transito',
              title: 'REDIRECCIÓN POR CASCADA (RELEVO)',
              message: `${workerSaliente.nombre} reasignado en tránsito a ${l.nombre} tras relevo ergonómico.`,
              workerId: workerSaliente.idWorker,
              lineaDestinoId: lId
            });
            break;
          }
        }
      }

      if (!redistribuido) {
        t.update('workers', workerSaliente.idWorker, { 
          estadoActual: 'DISPONIBLE_BOLSON', 
          lineaActualId: 'L8', 
          puestoActualId: null,
          lineaDestinoId: null 
        });

        const vaciasL8 = t.query('puestos', p => p.idLinea === 'L8' && p.idWorkerAsignado === null);
        if (vaciasL8.length > 0) {
          t.update('puestos', vaciasL8[0].idPuesto, { idWorkerAsignado: workerSaliente.idWorker });
          t.update('workers', workerSaliente.idWorker, { puestoActualId: vaciasL8[0].idPuesto });
        }
      }

      t.delete('alerts', alertaId);
    });
    localDb.addLog(`Rotación completada exitosamente. Se ejecutó la cascada.`, 'success');
  }
}

// --- MOTOR 3: DESALOJO ATÓMICO POR MODO PREPARACIÓN (PARO) ---
export async function firebaseActivarPreparacion(lineaId) {
  if (useRealFirebase) {
    await runTransaction(db, async (transaction) => {
      transaction.update(doc(db, "lines", lineaId), { estado: 'En Preparación' });
      
      const q = query(collection(db, "puestos"), where("idLinea", "==", lineaId), where("tipo", "==", "Vario"));
      const snap = await getDocs(q);
      const asignados = snap.docs.filter(d => d.data().idWorkerAsignado !== null);

      // Desalojar masivamente
      asignados.forEach(d => {
        const wId = d.data().idWorkerAsignado;
        transaction.update(d.ref, { idWorkerAsignado: null, rotacionIniciada: false, asignadoEnSegundoVirtual: null });
        transaction.update(doc(db, "workers", wId), { 
          estadoActual: 'EN_TRANSITO', 
          lineaActualId: null, 
          lineaDestinoId: 'L8',
          puestoActualId: null 
        });

        const aId = `PARO_${wId}_${Date.now()}`;
        transaction.set(doc(db, "alerts", aId), {
          id: aId,
          type: 'transito',
          title: 'DESALOJO MASIVO (PARO DE LÍNEA)',
          message: `Línea entra en preparación. Operario reubicado en tránsito a Línea 8 (Bolsón).`,
          workerId: wId,
          lineaDestinoId: 'L8'
        });
      });
    });
  } else {
    // Paro Local
    localDb.runTransaction((t) => {
      t.update('lines', lineaId, { estado: 'En Preparación' });

      const puestos = t.query('puestos', p => p.idLinea === lineaId && p.tipo === 'Vario' && p.idWorkerAsignado !== null);
      puestos.forEach(p => {
        const wId = p.idWorkerAsignado;
        t.update('puestos', p.idPuesto, { idWorkerAsignado: null, rotacionIniciada: false, asignadoEnSegundoVirtual: null });
        t.update('workers', wId, { 
          estadoActual: 'EN_TRANSITO', 
          lineaActualId: null, 
          lineaDestinoId: 'L8',
          puestoActualId: null 
        });

        const aId = `PARO_${wId}_${Date.now()}`;
        t.set('alerts', aId, {
          id: aId,
          type: 'transito',
          title: 'DESALOJO MASIVO (PARO)',
          message: `Línea entra en preparación. Operario reubicado en tránsito a Línea 8 (Bolsón).`,
          workerId: wId,
          lineaDestinoId: 'L8'
        });
      });
    });
    localDb.addLog(`Línea ${lineaId} detenida en preparación. Desalojo en masa a L8.`, 'warning');
  }
}

// Restablecer Línea
export async function firebaseRestablecerLinea(lineaId) {
  if (useRealFirebase) {
    await runTransaction(db, async (transaction) => {
      transaction.update(doc(db, "lines", lineaId), { estado: 'Operando' });
    });
  } else {
    localDb.runTransaction(t => t.update('lines', lineaId, { estado: 'Operando' }));
    localDb.addLog(`Línea ${lineaId} en operación activa.`, 'success');
  }
}

// --- MOTOR 4: PROTOCOLO DE REINCORPORACIÓN DIFERENCIAL (ALTAS MÉDICAS) ---
export async function firebaseReincorporarTrabajador(workerId) {
  if (useRealFirebase) {
    await runTransaction(db, async (transaction) => {
      const wRef = doc(db, "workers", workerId);
      const wSnap = await transaction.get(wRef);
      if (!wSnap.exists()) return;
      const worker = wSnap.data();

      if (worker.rol === 'Operador A' || worker.rol === 'Averiero') {
        // --- CASO PUESTO FIJO ---
        const q = query(collection(db, "puestos"), where("idWorkerOriginal", "==", workerId));
        const s = await getDocs(q);
        if (!s.empty) {
          const pDoc = s.docs[0];
          const reemplazoId = pDoc.data().idWorkerAsignado;

          // Regresar al titular a su puesto
          transaction.update(pDoc.ref, { idWorkerAsignado: workerId });
          transaction.update(wRef, { 
            estadoActual: 'ASIGNADO', 
            lineaActualId: pDoc.data().idLinea, 
            puestoActualId: pDoc.id,
            lineaDestinoId: null 
          });

          // Si había un reemplazo, se le expulsa de inmediato
          if (reemplazoId && reemplazoId !== workerId) {
            const reemplazoSnap = await transaction.get(doc(db, "workers", reemplazoId));
            if (reemplazoSnap.exists()) {
              const reemplazo = reemplazoSnap.data();

              // Aplicar cascada al expulsado
              let vacanteEncontrada = false;
              for (let lId of ORDEN_PRIORIDADES) {
                if (lId === 'L8') continue;
                const lSnap = await transaction.get(doc(db, "lines", lId));
                if (lSnap.exists() && lSnap.data().estado === 'Operando') {
                  const qP = query(collection(db, "puestos"), where("idLinea", "==", lId), where("tipo", "==", "Vario"));
                  const pSnap = await getDocs(qP);
                  const vacantes = pSnap.docs.map(d => d.data()).filter(p => p.idWorkerAsignado === null);

                  const apto = vacantes.find(pv => evaluarFiltrosCompatibilidad(reemplazo, pv) === true);
                  if (apto) {
                    vacanteEncontrada = true;
                    transaction.update(doc(db, "workers", reemplazoId), { 
                      estadoActual: 'EN_TRANSITO', 
                      lineaActualId: null, 
                      lineaDestinoId: lId,
                      puestoActualId: null 
                    });

                    const aId = `REINC_CASCADA_${reemplazoId}_${Date.now()}`;
                    transaction.set(doc(db, "alerts", aId), {
                      id: aId,
                      type: 'transito',
                      title: 'OPERARIO REEMPLAZO EXPULSADO',
                      message: `${reemplazo.nombre} liberado tras retorno de titular, enviado a L${lId}.`,
                      workerId: reemplazoId,
                      lineaDestinoId: lId
                    });
                    break;
                  }
                }
              }

              if (!vacanteEncontrada) {
                // Al Bolsón L8
                transaction.update(doc(db, "workers", reemplazoId), { 
                  estadoActual: 'DISPONIBLE_BOLSON', 
                  lineaActualId: 'L8', 
                  puestoActualId: null,
                  lineaDestinoId: null 
                });
                
                const qL8 = query(collection(db, "puestos"), where("idLinea", "==", "L8"));
                const snapL8 = await getDocs(qL8);
                const vaciasL8 = snapL8.docs.filter(d => d.data().idWorkerAsignado === null);
                if (vaciasL8.length > 0) {
                  transaction.update(vaciasL8[0].ref, { idWorkerAsignado: reemplazoId });
                  transaction.update(doc(db, "workers", reemplazoId), { puestoActualId: vaciasL8[0].id });
                }
              }
            }
          }
        }
      } else {
        // --- CASO PUESTO VARIO ---
        // Al Bolsón L8 directamente
        transaction.update(wRef, { 
          estadoActual: 'DISPONIBLE_BOLSON', 
          lineaActualId: 'L8', 
          puestoActualId: null,
          lineaDestinoId: null 
        });
        
        const qL8 = query(collection(db, "puestos"), where("idLinea", "==", "L8"));
        const snapL8 = await getDocs(qL8);
        const vaciasL8 = snapL8.docs.filter(d => d.data().idWorkerAsignado === null);
        if (vaciasL8.length > 0) {
          transaction.update(vaciasL8[0].ref, { idWorkerAsignado: workerId });
          transaction.update(wRef, { puestoActualId: vaciasL8[0].id });
        }
      }
    });
  } else {
    // Reincorporación Local
    localDb.runTransaction((t) => {
      const worker = t.get('workers', workerId);
      if (!worker) return;

      if (worker.rol === 'Operador A' || worker.rol === 'Averiero') {
        const puestosOriginales = t.query('puestos', p => p.idWorkerOriginal === workerId);
        if (puestosOriginales.length > 0) {
          const puesto = puestosOriginales[0];
          const reemplazoId = puesto.idWorkerAsignado;

          t.update('puestos', puesto.idPuesto, { idWorkerAsignado: workerId });
          t.update('workers', workerId, { 
            estadoActual: 'ASIGNADO', 
            lineaActualId: puesto.idLinea, 
            puestoActualId: puesto.idPuesto,
            lineaDestinoId: null 
          });

          if (reemplazoId && reemplazoId !== workerId) {
            const reemplazo = t.get('workers', reemplazoId);
            if (reemplazo) {
              let vacanteEncontrada = false;
              for (let lId of ORDEN_PRIORIDADES) {
                if (lId === 'L8') continue;
                const l = t.get('lines', lId);
                if (l && l.estado === 'Operando') {
                  const vacantes = t.query('puestos', p => p.idLinea === lId && p.tipo === 'Vario' && p.idWorkerAsignado === null);
                  const apto = vacantes.find(pv => evaluarFiltrosCompatibilidad(reemplazo, pv) === true);

                  if (apto) {
                    vacanteEncontrada = true;
                    t.update('workers', reemplazoId, { 
                      estadoActual: 'EN_TRANSITO', 
                      lineaActualId: null, 
                      lineaDestinoId: lId,
                      puestoActualId: null 
                    });

                    const aId = `REINC_CASCADA_${reemplazoId}_${Date.now()}`;
                    t.set('alerts', aId, {
                      id: aId,
                      type: 'transito',
                      title: 'OPERARIO REEMPLAZO EXPULSADO',
                      message: `${reemplazo.nombre} liberado tras retorno de titular, enviado a ${l.nombre}.`,
                      workerId: reemplazoId,
                      lineaDestinoId: lId
                    });
                    break;
                  }
                }
              }

              if (!vacanteEncontrada) {
                t.update('workers', reemplazoId, { 
                  estadoActual: 'DISPONIBLE_BOLSON', 
                  lineaActualId: 'L8', 
                  puestoActualId: null,
                  lineaDestinoId: null 
                });

                const vaciasL8 = t.query('puestos', p => p.idLinea === 'L8' && p.idWorkerAsignado === null);
                if (vaciasL8.length > 0) {
                  t.update('puestos', vaciasL8[0].idPuesto, { idWorkerAsignado: reemplazoId });
                  t.update('workers', reemplazoId, { puestoActualId: vaciasL8[0].idPuesto });
                }
              }
            }
          }
        }
      } else {
        t.update('workers', workerId, { 
          estadoActual: 'DISPONIBLE_BOLSON', 
          lineaActualId: 'L8', 
          puestoActualId: null,
          lineaDestinoId: null 
        });

        const vaciasL8 = t.query('puestos', p => p.idLinea === 'L8' && p.idWorkerAsignado === null);
        if (vaciasL8.length > 0) {
          t.update('puestos', vaciasL8[0].idPuesto, { idWorkerAsignado: workerId });
          t.update('workers', workerId, { puestoActualId: vaciasL8[0].idPuesto });
        }
      }
    });
    localDb.addLog(`Alta médica registrada para ${workerId}. Reubicado differential.`, 'success');
  }
}

// --- MANDAR A BAJA TEMPORAL ---
export async function firebaseRegistrarBajaTemporal(workerId) {
  if (useRealFirebase) {
    await runTransaction(db, async (transaction) => {
      const wRef = doc(db, "workers", workerId);
      const wSnap = await transaction.get(wRef);
      if (!wSnap.exists()) return;
      const worker = wSnap.data();

      // Puesto actual del trabajador si está asignado
      if (worker.estadoActual === 'ASIGNADO' && worker.puestoActualId) {
        const pRef = doc(db, "puestos", worker.puestoActualId);
        const pSnap = await transaction.get(pRef);
        
        if (pSnap.exists()) {
          const puesto = pSnap.data();
          if (puesto.tipo === 'Fijo') {
            // Mandar aviso de vacante y ver si hay reemplazo
            transaction.update(pRef, { idWorkerAsignado: null });
            
            const qR = query(collection(db, "workers"), where("rol", "==", "Operador B"), where("estadoActual", "==", "DISPONIBLE_BOLSON"));
            const snapR = await getDocs(qR);
            if (!snapR.empty) {
              const reemplazo = snapR.docs[0].data();
              transaction.update(pRef, { idWorkerAsignado: reemplazo.idWorker });
              transaction.update(doc(db, "workers", reemplazo.idWorker), { 
                estadoActual: 'ASIGNADO', 
                lineaActualId: puesto.idLinea, 
                puestoActualId: puesto.idPuesto 
              });
              
              // Quitar del puesto L8 anterior
              const q = query(collection(db, "puestos"), where("idWorkerAsignado", "==", reemplazo.idWorker), where("idLinea", "==", "L8"));
              const snap = await getDocs(q);
              snap.forEach(d => transaction.update(d.ref, { idWorkerAsignado: null }));
            }
          } else {
            transaction.update(pRef, { idWorkerAsignado: null, rotacionIniciada: false, asignadoEnSegundoVirtual: null });
          }
        }
      }

      transaction.update(wRef, { 
        estadoActual: 'BAJA_TEMPORAL', 
        lineaActualId: null, 
        puestoActualId: null, 
        lineaDestinoId: null 
      });
    });
  } else {
    // Registrar Baja local
    localDb.runTransaction((t) => {
      const worker = t.get('workers', workerId);
      if (!worker) return;

      if (worker.estadoActual === 'ASIGNADO' && worker.puestoActualId) {
        const puesto = t.get('puestos', worker.puestoActualId);
        if (puesto) {
          if (puesto.tipo === 'Fijo') {
            t.update('puestos', puesto.idPuesto, { idWorkerAsignado: null });
            
            const reemplazos = t.query('workers', w => w.rol === 'Operador B' && w.estadoActual === 'DISPONIBLE_BOLSON');
            if (reemplazos.length > 0) {
              const reemplazo = reemplazos[0];
              t.update('puestos', puesto.idPuesto, { idWorkerAsignado: reemplazo.idWorker });
              t.update('workers', reemplazo.idWorker, { 
                estadoActual: 'ASIGNADO', 
                lineaActualId: puesto.idLinea, 
                puestoActualId: puesto.idPuesto 
              });
              
              const puestosL8 = t.query('puestos', p => p.idWorkerAsignado === reemplazo.idWorker && p.idLinea === 'L8');
              puestosL8.forEach(p => t.update('puestos', p.idPuesto, { idWorkerAsignado: null }));
            }
          } else {
            t.update('puestos', puesto.idPuesto, { idWorkerAsignado: null, rotacionIniciada: false, asignadoEnSegundoVirtual: null });
          }
        }
      }

      t.update('workers', workerId, { 
        estadoActual: 'BAJA_TEMPORAL', 
        lineaActualId: null, 
        puestoActualId: null, 
        lineaDestinoId: null 
      });
    });
    localDb.addLog(`${workerId} ingresa a BAJA_TEMPORAL.`, 'warning');
  }
}

// --- CONFIRMAR LLEGADA DE TRANSITOS GENÉRICOS ---
export async function firebaseRegistrarLlegadaDirectaL8(workerId) {
  if (useRealFirebase) {
    await runTransaction(db, async (transaction) => {
      transaction.update(doc(db, "workers", workerId), { 
        estadoActual: 'DISPONIBLE_BOLSON', 
        lineaActualId: 'L8', 
        puestoActualId: null,
        lineaDestinoId: null 
      });

      const qL8 = query(collection(db, "puestos"), where("idLinea", "==", "L8"));
      const snapL8 = await getDocs(qL8);
      const vaciasL8 = snapL8.docs.filter(d => d.data().idWorkerAsignado === null);
      if (vaciasL8.length > 0) {
        transaction.update(vaciasL8[0].ref, { idWorkerAsignado: workerId });
      }

      const qAlerts = query(collection(db, "alerts"), where("workerId", "==", workerId), where("type", "==", "transito"));
      const sAlerts = await getDocs(qAlerts);
      sAlerts.forEach(d => transaction.delete(d.ref));
    });
  } else {
    localDb.runTransaction((t) => {
      t.update('workers', workerId, { 
        estadoActual: 'DISPONIBLE_BOLSON', 
        lineaActualId: 'L8', 
        puestoActualId: null,
        lineaDestinoId: null 
      });

      const vaciasL8 = t.query('puestos', p => p.idLinea === 'L8' && p.idWorkerAsignado === null);
      if (vaciasL8.length > 0) {
        t.update('puestos', vaciasL8[0].idPuesto, { idWorkerAsignado: workerId });
      }

      const alertas = t.query('alerts', a => a.workerId === workerId && a.type === 'transito');
      alertas.forEach(a => t.delete('alerts', a.id));
    });
    localDb.addLog(`Relevista registrado exitosamente en la Línea 8.`, 'success');
  }
}
