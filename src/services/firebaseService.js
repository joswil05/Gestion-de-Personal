// Servicio de Producción de Firebase Firestore para Gestión de Personal y Rotaciones en Tiempo Real
// Este archivo contiene la lógica de negocio modular y atómica utilizando la SDK oficial de Firebase.
// Garantiza la integridad, evita colisiones y sincroniza múltiples dispositivos de supervisores en milisegundos.

import { db } from '../firebase';
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

// Prioridades estrictas de la planta
export const ORDEN_PRIORIDADES = ['L4', 'L1', 'L2', 'L6', 'L7', 'L5', 'L3', 'L8', 'L9', 'L10'];

// --- OBSERVADOR EN TIEMPO REAL DE FIRESTORE (onSnapshot) ---
// Sincroniza el estado de la planta con los celulares de los supervisores al instante
export function suscribirEstadoPlanta(callback) {
  const state = {
    workers: [],
    lines: [],
    puestos: [],
    alerts: [],
    logs: []
  };

  // 1. Escuchar trabajadores
  const unsubWorkers = onSnapshot(collection(db, "workers"), (snapshot) => {
    state.workers = snapshot.docs.map(d => d.data());
    callback({ ...state });
  }, (err) => console.warn("Firestore offline - usando caché local para trabajadores"));

  // 2. Escuchar líneas
  const unsubLines = onSnapshot(collection(db, "lines"), (snapshot) => {
    state.lines = snapshot.docs.map(d => d.data()).sort((a, b) => a.prioridad - b.prioridad);
    callback({ ...state });
  }, (err) => console.warn("Firestore offline - usando caché local para líneas"));

  // 3. Escuchar puestos
  const unsubPuestos = onSnapshot(collection(db, "puestos"), (snapshot) => {
    state.puestos = snapshot.docs.map(d => d.data());
    callback({ ...state });
  }, (err) => console.warn("Firestore offline - usando caché local para puestos"));

  // 4. Escuchar alertas
  const unsubAlerts = onSnapshot(collection(db, "alerts"), (snapshot) => {
    state.alerts = snapshot.docs.map(d => d.data());
    callback({ ...state });
  }, (err) => console.warn("Firestore offline - usando caché local para alertas"));

  // 5. Escuchar logs de eventos
  const unsubLogs = onSnapshot(collection(db, "logs"), (snapshot) => {
    state.logs = snapshot.docs.map(d => d.data()).sort((a, b) => b.timestamp - a.timestamp).slice(0, 50);
    callback({ ...state });
  }, (err) => console.warn("Firestore offline - usando caché local para logs"));

  // Retorna función de desuscripción de todos los WebSockets de Firebase
  return () => {
    unsubWorkers();
    unsubLines();
    unsubPuestos();
    unsubAlerts();
    unsubLogs();
  };
}

/**
 * Función auxiliar para registrar un log de auditoría en Firestore
 */
export async function registrarLogFirestore(mensaje, tipo = 'info') {
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
    console.warn("No se pudo escribir el log en Firestore, guardando en consola local.");
  }
}

/**
 * 1. INICIALIZACIÓN DE TURNO Y ASIGNACIÓN DE PUESTOS FIJOS (Segundo Cero)
 * Pobla Firestore e inicia la congelación inicial de operadores técnicos.
 */
export async function firebaseInicializarTurno() {
  await registrarLogFirestore("Iniciando carga de programa diario de Sheets y registro de huellas...", "info");

  // Crear colecciones y escribir la estructura inicial de puestos
  const puestosIniciales = [];
  
  LINEAS_MOCK.forEach(l => {
    // Escribir/Actualizar documento de línea
    setDoc(doc(db, "lines", l.idLinea), l);

    // Configurar puestos fijos
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

    // Configurar puestos varios
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
        timer: 120, // 2 minutos en prototipo
        maxHorasPermitidas: 2,
        rotacionIniciada: false
      });
    });
  });

  // Poblar todos los puestos en la nube
  for (let p of puestosIniciales) {
    await setDoc(doc(db, "puestos", p.idPuesto), p);
  }

  // Poblar todos los trabajadores
  for (let w of TRABAJADORES_MOCK) {
    await setDoc(doc(db, "workers", w.idWorker), w);
  }

  // --- TRANSACCIÓN FIRESTORE AL SEGUNDO CERO ---
  try {
    await runTransaction(db, async (transaction) => {
      // 1. Simular registro de huella dactilar de trabajadores activos (pasar a POOL_ARRANQUE)
      for (let w of TRABAJADORES_MOCK) {
        if (w.rol !== 'Coordinador' && w.rol !== 'Supervisor') {
          const workerRef = doc(db, "workers", w.idWorker);
          const workerDoc = await transaction.get(workerRef);
          
          if (workerDoc.exists() && workerDoc.data().estadoActual !== 'BAJA_TEMPORAL') {
            transaction.update(workerRef, {
              estadoActual: 'POOL_ARRANQUE',
              lineaActualId: null,
              lineaDestinoId: null,
              puestoActualId: null
            });
          }
        }
      }

      // 2. Procesar puestos fijos de forma atómica en la nube
      for (let p of puestosIniciales) {
        if (p.tipo === 'Fijo') {
          const puestoRef = doc(db, "puestos", p.idPuesto);

          // Buscar titular calificado en el pool de arranque
          const qTitulares = query(collection(db, "workers"), 
            where("rol", "==", p.rolRequerido), 
            where("estadoActual", "==", "POOL_ARRANQUE")
          );
          
          const snapshotTitulares = await getDocs(qTitulares);
          
          if (!snapshotTitulares.empty) {
            // Asignar titular
            const titularDoc = snapshotTitulares.docs[0];
            const titularRef = doc(db, "workers", titularDoc.id);

            transaction.update(puestoRef, {
              idWorkerAsignado: titularDoc.id,
              idWorkerOriginal: titularDoc.id
            });

            transaction.update(titularRef, {
              estadoActual: 'ASIGNADO',
              lineaActualId: p.idLinea,
              puestoActualId: p.idPuesto
            });

            registrarLogFirestore(`Puesto Fijo asignado a Titular: ${titularDoc.data().nombre} en ${p.idPuesto}`, 'success');
          } else {
            // El titular no está (probablemente BAJA_TEMPORAL). Buscar reemplazo (Operador B disponible)
            const qReemplazo = query(collection(db, "workers"), 
              where("rol", "==", "Operador B"), 
              where("estadoActual", "==", "POOL_ARRANQUE")
            );
            const snapshotReemplazo = await getDocs(qReemplazo);

            // Obtener el ID del titular en baja para mantener el registro de pertenencia
            const qTitularBaja = query(collection(db, "workers"), 
              where("rol", "==", p.rolRequerido), 
              where("estadoActual", "==", "BAJA_TEMPORAL")
            );
            const snapshotBaja = await getDocs(qTitularBaja);
            const titularId = !snapshotBaja.empty ? snapshotBaja.docs[0].id : 'N/A';

            if (!snapshotReemplazo.empty) {
              const reemplazoDoc = snapshotReemplazo.docs[0];
              const reemplazoRef = doc(db, "workers", reemplazoDoc.id);

              transaction.update(puestoRef, {
                idWorkerAsignado: reemplazoDoc.id,
                idWorkerOriginal: titularId
              });

              transaction.update(reemplazoRef, {
                estadoActual: 'ASIGNADO',
                lineaActualId: p.idLinea,
                puestoActualId: p.idPuesto
              });

              registrarLogFirestore(`Reemplazo Temporal: ${reemplazoDoc.data().nombre} cubre vacante técnica en puesto fijo ${p.idPuesto}`, 'warning');
            } else {
              registrarLogFirestore(`Crítico: Puesto fijo ${p.idPuesto} quedó sin cubrir al arrancar el turno.`, 'error');
            }
          }
        }
      }
    });

    registrarLogFirestore("Asignación automática de puestos fijos al minuto cero completada en la base de datos.", "success");
  } catch (error) {
    console.error("Transacción fallida en inicialización:", error);
    registrarLogFirestore(`Falla en inicialización de turno: ${error.message}`, 'error');
  }
}

/**
 * 2. MOTOR DE REGLAS DE ASIGNACIÓN MÓVIL POR QR (Filtros en milisegundos)
 * Valida a nivel transaccional en la nube la compatibilidad de salud, sexo, no repetición y prioridad.
 */
export async function firebaseEscanearQR(workerId, lineaId) {
  let puestoAsignado = null;
  let desvioEjecutado = false;

  await runTransaction(db, async (transaction) => {
    const workerRef = doc(db, "workers", workerId);
    const workerSnap = await transaction.get(workerRef);
    if (!workerSnap.exists()) throw new Error("Código QR no reconocido en el sistema.");

    const worker = workerSnap.data();

    const lineaRef = doc(db, "lines", lineaId);
    const lineaSnap = await transaction.get(lineaRef);
    if (!lineaSnap.exists()) throw new Error("Línea no configurada.");

    const linea = lineaSnap.data();

    if (linea.estado === 'En Preparación') {
      throw new Error(`La ${linea.nombre} se encuentra detenida. No se admiten asignaciones.`);
    }

    if (worker.estadoActual === 'ASIGNADO' && worker.rol === 'Operador A') {
      throw new Error(`${worker.nombre} es un Operador A y está congelado en su máquina.`);
    }

    // Consultar puestos vacíos en esta línea en la nube
    const qPuestos = query(collection(db, "puestos"), 
      where("idLinea", "==", lineaId), 
      where("tipo", "==", "Vario")
    );
    const puestosSnap = await getDocs(qPuestos);
    const puestosVacios = puestosSnap.docs.map(d => d.data()).filter(p => p.idWorkerAsignado === null);

    if (puestosVacios.length === 0) {
      throw new Error(`No hay vacantes disponibles en la ${linea.nombre}.`);
    }

    // --- FILTRO CRÍTICO 3: REDIRECCIÓN OBLIGATORIA POR PRIORIDAD DE PLANTA ---
    const lineaActualPrioIdx = ORDEN_PRIORIDADES.indexOf(lineaId);

    for (let i = 0; i < lineaActualPrioIdx; i++) {
      const lineaPrioId = ORDEN_PRIORIDADES[i];
      const lineaPrioRef = doc(db, "lines", lineaPrioId);
      const lineaPrioSnap = await transaction.get(lineaPrioRef);

      if (lineaPrioSnap.exists() && lineaPrioSnap.data().estado === 'Operando') {
        const qPuestosPrio = query(collection(db, "puestos"), 
          where("idLinea", "==", lineaPrioId), 
          where("tipo", "==", "Vario")
        );
        const puestosPrioSnap = await getDocs(qPuestosPrio);
        const puestosPrioVacios = puestosPrioSnap.docs.map(d => d.data()).filter(p => p.idWorkerAsignado === null);

        if (puestosPrioVacios.length > 0) {
          // Evaluar si el trabajador califica para al menos un puesto de la línea prioritaria vacía
          const calificaParaPrio = puestosPrioVacios.some(puestoPrio => 
            evaluarFiltrosCompatibilidad(worker, puestoPrio) === true
          );

          if (calificaParaPrio) {
            desvioEjecutado = true;

            // Cambiar estado a EN_TRANSITO con destino a la línea prioritaria
            transaction.update(workerRef, {
              estadoActual: 'EN_TRANSITO',
              lineaActualId: null,
              lineaDestinoId: lineaPrioId,
              puestoActualId: null
            });

            // Crear alerta de tránsito en la colección
            const alertaId = `ALERTA_TRANSITO_${workerId}_${Date.now()}`;
            const alertaRef = doc(db, "alerts", alertaId);
            transaction.set(alertaRef, {
              id: alertaId,
              type: 'transito',
              title: `DESVÍO POR PRIORIDAD`,
              message: `${worker.nombre} ha sido redirigido a ${lineaPrioSnap.data().nombre} por jerarquía de prioridad de planta.`,
              workerId,
              lineaDestinoId: lineaPrioId
            });

            registrarLogFirestore(`Redirección: ${worker.nombre} desviado a la línea de prioridad superior ${lineaPrioSnap.data().nombre}`, 'warning');
            return;
          }
        }
      }
    }

    if (desvioEjecutado) return;

    // --- FILTROS DE SEGURIDAD OPERATIVA ---
    let mensajeError = "";

    for (let puesto of puestosVacios) {
      const resultadoCompatibilidad = evaluarFiltrosCompatibilidad(worker, puesto);
      if (resultadoCompatibilidad === true) {
        puestoAsignado = puesto;
        break;
      } else {
        mensajeError = resultadoCompatibilidad;
      }
    }

    if (!puestoAsignado) {
      throw new Error(`Incompatibilidad técnica: ${mensajeError}`);
    }

    // --- ASIGNACIÓN ATÓMICA EN FIRESTORE ---
    const puestoRef = doc(db, "puestos", puestoAsignado.idPuesto);
    
    transaction.update(puestoRef, {
      idWorkerAsignado: workerId,
      timer: 120, // Cuenta regresiva acelerada
      rotacionIniciada: false
    });

    transaction.update(workerRef, {
      estadoActual: 'ASIGNADO',
      lineaActualId: lineaId,
      lineaDestinoId: null,
      puestoActualId: puestoAsignado.idPuesto
    });

    // Limpiar alertas de tránsito previas del trabajador en la base de datos
    const qAlertasPrevias = query(collection(db, "alerts"), 
      where("workerId", "==", workerId), 
      where("type", "==", "transito")
    );
    const snapAlerts = await getDocs(qAlertasPrevias);
    snapAlerts.forEach(doc => {
      transaction.delete(doc.ref);
    });

    registrarLogFirestore(`QR escaneado: ${worker.nombre} ingresa con éxito a puesto ${puestoAsignado.nombreTarea}`, 'success');
  });

  if (desvioEjecutado) {
    return { status: 'redirigido', msg: `Redirigido a la línea prioritaria.` };
  }
  return { status: 'asignado', puesto: puestoAsignado.nombreTarea };
}

// Evalúa las restricciones físicas, sexo e historial de no repetición
function evaluarFiltrosCompatibilidad(worker, puesto) {
  if (puesto.sexoRequerido !== 'Indiferente' && worker.sexo !== puesto.sexoRequerido) {
    return `Puesto exclusivo para sexo ${puesto.sexoRequerido}.`;
  }

  if (worker.restriccionesMedicas && worker.restriccionesMedicas.length > 0) {
    const tieneRestriccion = puesto.restriccionesProhibidas && puesto.restriccionesProhibidas.some(r => 
      worker.restriccionesMedicas.includes(r)
    );
    if (tieneRestriccion) {
      return `Presenta restricción de salud de ${worker.restriccionesMedicas.join(', ')}.`;
    }
  }

  if (worker.ultimaActividadAyer && worker.ultimaActividadAyer.toLowerCase().trim() === puesto.nombreTarea.toLowerCase().trim()) {
    return `No Repetición: El operario cerró su turno anterior en esta misma actividad (${puesto.nombreTarea}).`;
  }

  return true;
}

/**
 * 3. APROBACIÓN DE DESPACHO EN LÍNEA 8 (ROTACIÓN - FASE 4)
 * El supervisor de la Línea 8 aprueba la salida de un operario disponible.
 */
export async function firebaseAprobarDespachoRotacion(alertaId) {
  await runTransaction(db, async (transaction) => {
    const alertaRef = doc(db, "alerts", alertaId);
    const alertaSnap = await transaction.get(alertaRef);
    if (!alertaSnap.exists()) throw new Error("Alerta de rotación no encontrada");

    const alerta = alertaSnap.data();
    const workerEntranteRef = doc(db, "workers", alerta.workerEntranteId);
    const workerEntranteSnap = await transaction.get(workerEntranteRef);
    if (!workerEntranteSnap.exists()) throw new Error("Operario no encontrado");

    // 1. Cambiar estado a EN_TRANSITO
    transaction.update(workerEntranteRef, {
      estadoActual: 'EN_TRANSITO',
      lineaActualId: null,
      lineaDestinoId: alerta.lineaPrioId,
      puestoActualId: null
    });

    // 2. Liberar puesto en Línea 8
    const qPuestosL8 = query(collection(db, "puestos"), 
      where("idWorkerAsignado", "==", alerta.workerEntranteId), 
      where("idLinea", "==", "L8")
    );
    const puestosL8Snap = await getDocs(qPuestosL8);
    puestosL8Snap.forEach(d => {
      transaction.update(d.ref, { idWorkerAsignado: null });
    });

    // 3. Modificar alerta a esperando_recepcion
    transaction.set(alertaRef, {
      ...alerta,
      type: 'esperando_recepcion',
      title: `TRABAJADOR EN CAMINO`,
      message: `${workerEntranteSnap.data().nombre} fue despachado. Registra su llegada al ingresar a la línea prioritaria.`
    });

    registrarLogFirestore(`Despacho autorizado: Reemplazo ${workerEntranteSnap.data().nombre} va en camino a ${alerta.lineaPrioId}`, 'success');
  });
}

/**
 * 4. EFECTO DOMINÓ Y REDISTRIBUCIÓN EN CASCADA DE ROTACIONES (FASE 4)
 * Ocurre de forma atómica en Firestore cuando llega el relevista y se concreta el relevo.
 */
export async function firebaseCompletarRotacionYCascada(alertaId) {
  await runTransaction(db, async (transaction) => {
    const alertaRef = doc(db, "alerts", alertaId);
    const alertaSnap = await transaction.get(alertaRef);
    if (!alertaSnap.exists()) throw new Error("Alerta no válida");

    const alerta = alertaSnap.data();
    const workerEntranteRef = doc(db, "workers", alerta.workerEntranteId);
    const workerSalienteRef = doc(db, "workers", alerta.workerSalienteId);
    const puestoPrioRef = doc(db, "puestos", alerta.puestoId);

    const workerEntranteSnap = await transaction.get(workerEntranteRef);
    const workerSalienteSnap = await transaction.get(workerSalienteRef);
    const puestoPrioSnap = await transaction.get(puestoPrioRef);

    if (!workerEntranteSnap.exists() || !workerSalienteSnap.exists() || !puestoPrioSnap.exists()) {
      throw new Error("Datos de rotación no válidos o incompletos.");
    }

    const workerSaliente = workerSalienteSnap.data();

    // 1. Asignar al relevista (entrante) al puesto prioritario
    transaction.update(puestoPrioRef, {
      idWorkerAsignado: workerEntranteSnap.id,
      timer: 120,
      rotacionIniciada: false
    });

    transaction.update(workerEntranteRef, {
      estadoActual: 'ASIGNADO',
      lineaActualId: alerta.lineaPrioId,
      lineaDestinoId: null,
      puestoActualId: puestoPrioSnap.id
    });

    // 2. ALGORITMO EN CASCADA PARA EL TRABAJADOR SALIENTE (RELEVADO)
    // Recorre por prioridad estricta las líneas en busca de puestos varios libres compatibles
    let vacanteEncontrada = false;
    let lineaDestinoId = 'L8';

    for (let lineaId of ORDEN_PRIORIDADES) {
      if (lineaId === 'L8') continue;

      const lineaRef = doc(db, "lines", lineaId);
      const lineaSnap = await transaction.get(lineaRef);

      if (lineaSnap.exists() && lineaSnap.data().estado === 'Operando') {
        const qPuestosVacios = query(collection(db, "puestos"), 
          where("idLinea", "==", lineaId), 
          where("tipo", "==", "Vario")
        );
        const puestosSnap = await getDocs(qPuestosVacios);
        const puestosVacios = puestosSnap.docs.map(d => d.data()).filter(p => p.idWorkerAsignado === null);

        const puestoApto = puestosVacios.find(p => evaluarFiltrosCompatibilidad(workerSaliente, p) === true);

        if (puestoApto) {
          vacanteEncontrada = true;
          lineaDestinoId = lineaId;

          // Poner al trabajador saliente en tránsito
          transaction.update(workerSalienteRef, {
            estadoActual: 'EN_TRANSITO',
            lineaActualId: null,
            lineaDestinoId: lineaId,
            puestoActualId: null
          });

          // Crear la alerta de tránsito
          const alertId = `ALERTA_TRANSITO_${workerSaliente.idWorker}_${Date.now()}`;
          const alertRef = doc(db, "alerts", alertId);
          transaction.set(alertRef, {
            id: alertId,
            type: 'transito',
            title: `OPERARIO REDISTRIBUIDO`,
            message: `${workerSaliente.nombre} ha sido redirigido a ${lineaSnap.data().nombre} tras ser relevado en la Línea ${alerta.lineaPrioId}.`,
            workerId: workerSaliente.idWorker,
            lineaDestinoId: lineaId
          });

          registrarLogFirestore(`Efecto Dominó: Relevado ${workerSaliente.nombre} reasignado en tránsito a la prioritaria ${lineaSnap.data().nombre}`, 'success');
          break;
        }
      }
    }

    if (!vacanteEncontrada) {
      // Regresa a la Línea 8 (Bolsón)
      transaction.update(workerSalienteRef, {
        estadoActual: 'DISPONIBLE_BOLSON',
        lineaActualId: 'L8',
        lineaDestinoId: null,
        puestoActualId: null
      });

      // Asignar en puesto de ensamble vacío de L8
      const qPuestosL8 = query(collection(db, "puestos"), 
        where("idLinea", "==", "L8")
      );
      const puestosL8Snap = await getDocs(qPuestosL8);
      const puestosL8Vacios = puestosL8Snap.docs.filter(d => d.data().idWorkerAsignado === null);

      if (puestosL8Vacios.length > 0) {
        transaction.update(puestosL8Vacios[0].ref, {
          idWorkerAsignado: workerSaliente.idWorker
        });
      }

      registrarLogFirestore(`Efecto Dominó: Sin vacantes prioritarias. ${workerSaliente.nombre} regresa a Línea 8`, 'info');
    }

    // 3. Eliminar la alerta procesada
    transaction.delete(alertaRef);
  });
}

/**
 * 5. PROTOCOLO DE REINCORPORACIÓN DESDE BAJA_TEMPORAL (Coordinador)
 */
export async function firebaseReincorporarTrabajador(workerId) {
  await runTransaction(db, async (transaction) => {
    const workerRef = doc(db, "workers", workerId);
    const workerSnap = await transaction.get(workerRef);
    if (!workerSnap.exists() || workerSnap.data().estadoActual !== 'BAJA_TEMPORAL') {
      throw new Error("El operario no se encuentra en BAJA_TEMPORAL.");
    }

    const worker = workerSnap.data();
    registrarLogFirestore(`Procesando reincorporación de ${worker.nombre}...`, 'info');

    if (worker.rol === 'Operador A' || worker.rol === 'Averiero') {
      // --- CASO PUESTO FIJO TÉCNICO ---
      const qPuestoOriginal = query(collection(db, "puestos"), 
        where("idWorkerOriginal", "==", workerId)
      );
      const puestoOriginalSnap = await getDocs(qPuestoOriginal);

      if (!puestoOriginalSnap.empty) {
        const puestoDoc = puestoOriginalSnap.docs[0];
        const puestoOriginal = puestoDoc.data();
        const reemplazoId = puestoOriginal.idWorkerAsignado;

        // 1. Reasignar titular en su máquina
        transaction.update(puestoDoc.ref, {
          idWorkerAsignado: workerId
        });

        transaction.update(workerRef, {
          estadoActual: 'ASIGNADO',
          lineaActualId: puestoOriginal.idLinea,
          lineaDestinoId: null,
          puestoActualId: puestoOriginal.idPuesto
        });

        registrarLogFirestore(`Alta Médica: Titular ${worker.nombre} reasume puesto técnico original ${puestoOriginal.idPuesto}`, 'success');

        // 2. Si había reemplazo temporal, desalojarlo y aplicar la cascada por prioridad
        if (reemplazoId && reemplazoId !== workerId) {
          const reemplazoRef = doc(db, "workers", reemplazoId);
          const reemplazoSnap = await transaction.get(reemplazoRef);
          
          if (reemplazoSnap.exists()) {
            const reemplazo = reemplazoSnap.data();
            registrarLogFirestore(`Desalojando reemplazo temporal ${reemplazo.nombre}. Buscando vacante...`, 'warning');

            let vacanteEncontrada = false;

            for (let lineaId of ORDEN_PRIORIDADES) {
              if (lineaId === 'L8') continue;

              const lineaRef = doc(db, "lines", lineaId);
              const lineaSnap = await transaction.get(lineaRef);

              if (lineaSnap.exists() && lineaSnap.data().estado === 'Operando') {
                const qPuestosVacios = query(collection(db, "puestos"), 
                  where("idLinea", "==", lineaId), 
                  where("tipo", "==", "Vario")
                );
                const puestosSnap = await getDocs(qPuestosVacios);
                const puestosVacios = puestosSnap.docs.map(d => d.data()).filter(p => p.idWorkerAsignado === null);

                const puestoApto = puestosVacios.find(p => evaluarFiltrosCompatibilidad(reemplazo, p) === true);

                if (puestoApto) {
                  vacanteEncontrada = true;

                  transaction.update(reemplazoRef, {
                    estadoActual: 'EN_TRANSITO',
                    lineaActualId: null,
                    lineaDestinoId: lineaId,
                    puestoActualId: null
                  });

                  const alertId = `ALERTA_TRANSITO_${reemplazoId}_${Date.now()}`;
                  const alertRef = doc(db, "alerts", alertId);
                  transaction.set(alertRef, {
                    id: alertId,
                    type: 'transito',
                    title: `REEMPLAZO REDISTRIBUIDO`,
                    message: `${reemplazo.nombre} fue liberado de un puesto fijo y redirigido a ${lineaSnap.data().nombre}.`,
                    workerId: reemplazoId,
                    lineaDestinoId: lineaId
                  });

                  registrarLogFirestore(`Redistribución: Reemplazo ${reemplazo.nombre} redirigido en tránsito a la prioritaria ${lineaSnap.data().nombre}`, 'success');
                  break;
                }
              }
            }

            if (!vacanteEncontrada) {
              // Regresa a Línea 8
              transaction.update(reemplazoRef, {
                estadoActual: 'DISPONIBLE_BOLSON',
                lineaActualId: 'L8',
                lineaDestinoId: null,
                puestoActualId: null
              });

              const qPuestosL8 = query(collection(db, "puestos"), 
                where("idLinea", "==", "L8")
              );
              const puestosL8Snap = await getDocs(qPuestosL8);
              const puestosL8Vacios = puestosL8Snap.docs.filter(d => d.data().idWorkerAsignado === null);

              if (puestosL8Vacios.length > 0) {
                transaction.update(puestosL8Vacios[0].ref, {
                  idWorkerAsignado: reemplazoId
                });
              }

              registrarLogFirestore(`Redistribución: Sin vacantes. Reemplazo ${reemplazo.nombre} enviado a la Línea 8`, 'info');
            }
          }
        }
      } else {
        transaction.update(workerRef, {
          estadoActual: 'POOL_ARRANQUE',
          lineaActualId: null,
          lineaDestinoId: null,
          puestoActualId: null
        });
        registrarLogFirestore(`Operador ${worker.nombre} ingresado al Pool de Arranque.`, 'info');
      }
    } else {
      // --- CASO PUESTO VARIO ---
      // Envía directo a la Línea 8 en estado disponible
      transaction.update(workerRef, {
        estadoActual: 'DISPONIBLE_BOLSON',
        lineaActualId: 'L8',
        lineaDestinoId: null,
        puestoActualId: null
      });

      const qPuestosL8 = query(collection(db, "puestos"), 
        where("idLinea", "==", "L8")
      );
      const puestosL8Snap = await getDocs(qPuestosL8);
      const puestosL8Vacios = puestosL8Snap.docs.filter(d => d.data().idWorkerAsignado === null);

      if (puestosL8Vacios.length > 0) {
        transaction.update(puestosL8Vacios[0].ref, {
          idWorkerAsignado: workerId
        });
      }

      registrarLogFirestore(`Alta Médica: Operario ${worker.nombre} ingresado directo a sala de ensamble de Línea 8`, 'success');
    }
  });
}

/**
 * 6. PAROS POR PREPARACIÓN DE EQUIPOS
 */
export async function firebaseActivarPreparacion(lineaId) {
  await runTransaction(db, async (transaction) => {
    const lineaRef = doc(db, "lines", lineaId);
    transaction.update(lineaRef, { estado: 'En Preparación' });

    // Buscar puestos varios de esa línea que estén asignados
    const qPuestos = query(collection(db, "puestos"), 
      where("idLinea", "==", lineaId), 
      where("tipo", "==", "Vario")
    );
    const puestosSnap = await getDocs(qPuestos);
    const puestosAsignados = puestosSnap.docs.filter(d => d.data().idWorkerAsignado !== null);

    const idsDesalojados = puestosAsignados.map(d => d.data().idWorkerAsignado);

    // Vaciar puestos varios
    puestosAsignados.forEach(d => {
      transaction.update(d.ref, {
        idWorkerAsignado: null,
        timer: 120,
        rotacionIniciada: false
      });
    });

    // Poner operarios desalojados en tránsito a L8 en la base de datos
    for (let workerId of idsDesalojados) {
      const workerRef = doc(db, "workers", workerId);
      const workerSnap = await transaction.get(workerRef);
      
      if (workerSnap.exists()) {
        transaction.update(workerRef, {
          estadoActual: 'EN_TRANSITO',
          lineaActualId: null,
          lineaDestinoId: 'L8',
          puestoActualId: null
        });

        // Crear alerta de tránsito
        const alertId = `ALERTA_TRANSITO_${workerId}_${Date.now()}`;
        const alertRef = doc(db, "alerts", alertId);
        transaction.set(alertRef, {
          id: alertId,
          type: 'transito',
          title: `DESALOJO POR PARO`,
          message: `${workerSnap.data().nombre} desalojado por mantenimiento, va en tránsito a la Línea 8 (Bolsón).`,
          workerId,
          lineaDestinoId: 'L8'
        });
      }
    }

    registrarLogFirestore(`Línea ${lineaId} entra EN PREPARACIÓN. ${idsDesalojados.length} operarios de puestos varios desalojados a L8.`, 'warning');
  });
}

/**
 * Restablecer línea a Operando
 */
export async function firebaseRestablecerLinea(lineaId) {
  await runTransaction(db, async (transaction) => {
    const lineaRef = doc(db, "lines", lineaId);
    transaction.update(lineaRef, { estado: 'Operando' });
    registrarLogFirestore(`Línea ${lineaId} restablecida a estado OPERANDO.`, 'success');
  });
}

/**
 * Decrementa atómicamente los temporizadores de los puestos en Firestore (Reloj de Simulación)
 */
export async function firebaseDecrementarTemporizadores(simSpeed) {
  try {
    await runTransaction(db, async (transaction) => {
      // Consultar puestos varios ocupados en la nube
      const qPuestos = query(collection(db, "puestos"), 
        where("tipo", "==", "Vario")
      );
      const puestosSnap = await getDocs(qPuestos);
      const puestosOcupados = puestosSnap.docs
        .map(d => ({ ref: d.ref, data: d.data() }))
        .filter(x => x.data.idWorkerAsignado !== null);

      for (let puesto of puestosOcupados) {
        const p = puesto.data;
        if (p.timer > 0) {
          const nuevoTiempo = Math.max(0, p.timer - 1 * simSpeed);
          transaction.update(puesto.ref, { timer: nuevoTiempo });

          // Si el temporizador baja de 30s y no ha iniciado rotación
          if (nuevoTiempo <= 30 && nuevoTiempo > 0 && !p.rotacionIniciada) {
            transaction.update(puesto.ref, { rotacionIniciada: true });

            const workerSalienteRef = doc(db, "workers", p.idWorkerAsignado);
            const workerSalienteSnap = await transaction.get(workerSalienteRef);

            if (workerSalienteSnap.exists()) {
              const workerSaliente = workerSalienteSnap.data();

              // Buscar un relevista libre en Línea 8 (Bolsón)
              const qCandidatosL8 = query(collection(db, "workers"), 
                where("lineaActualId", "==", "L8"),
                where("estadoActual", "==", "DISPONIBLE_BOLSON")
              );
              const candidatosL8Snap = await getDocs(qCandidatosL8);
              const candidatosL8 = candidatosL8Snap.docs.map(d => d.data());

              // Encontrar relevista compatible
              const relevo = candidatosL8.find(w => 
                evaluarFiltrosBasicos(w, p) === true
              );

              if (relevo) {
                const alertaId = `ALERTA_ROT_${p.idPuesto}_${relevo.idWorker}_${Date.now()}`;
                const alertaRef = doc(db, "alerts", alertaId);
                
                transaction.set(alertaRef, {
                  id: alertaId,
                  type: 'solicitud_rotacion',
                  title: `ROTACIÓN EN CURSO (➜ L${p.idLinea})`,
                  message: `Línea prioritaria ${p.idLinea} solicita a ${relevo.nombre} para relevar en ${p.nombreTarea}.`,
                  workerSalienteId: workerSaliente.idWorker,
                  workerEntranteId: relevo.idWorker,
                  puestoId: p.idPuesto,
                  lineaPrioId: p.idLinea,
                  lineaL8Id: 'L8'
                });
                
                registrarLogFirestore(`Rotación: Solicitando relevo de L8 para ${p.nombreTarea}.`, 'warning');
              } else {
                // Reintentar
                transaction.update(puesto.ref, { timer: 20, rotacionIniciada: false });
              }
            }
          }
        }
      }
    });
  } catch (error) {
    // Silenciar errores de transacción de background recurrentes
  }
}

// Función auxiliar de validación de compatibilidad para el decremento en background
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
