// Servicio de Firebase Firestore para Gestión de Personal y Rotaciones en Tiempo Real
// Este archivo contiene la lógica de negocio modular y atómica utilizando transacciones de Firestore.
// Está diseñado para garantizar la integridad de los datos, evitar colisiones en milisegundos y evitar duplicados.

import { LINEAS_MOCK, TRABAJADORES_MOCK } from '../mocks/mockData';

// --- CONFIGURACIÓN DE PRODUCCIÓN DE FIREBASE ---
// En producción, descomentar las siguientes líneas e importar la configuración de Firebase
/*
import { 
  getFirestore, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  runTransaction, 
  collection, 
  query, 
  where, 
  getDocs 
} from 'firebase/firestore';
import { db } from '../firebase';
*/

// --- EMULADOR TRANSACCIONAL DE FIRESTORE (Para Pruebas Inmediatas en Planta) ---
// Este emulador replica exactamente la interfaz y el comportamiento atómico de runTransaction de la SDK de Firebase.
// Esto permite que el simulador funcione en la planta y en local en milisegundos sin requerir llaves API en la fase de pruebas.
class LocalFirestoreEmulator {
  constructor() {
    this.workers = new Map();
    this.lines = new Map();
    this.puestos = new Map();
    this.alerts = new Map();
    this.logs = [];
    this.listeners = [];
  }

  // Inicializa los datos en memoria emulando Firestore
  initialize(workersData, linesData, puestosData) {
    this.workers.clear();
    this.lines.clear();
    this.puestos.clear();
    this.alerts.clear();
    this.logs = [];

    workersData.forEach(w => this.workers.set(w.idWorker, { ...w }));
    linesData.forEach(l => this.lines.set(l.idLinea, { ...l }));
    puestosData.forEach(p => this.puestos.set(p.idPuesto, { ...p }));
    this.notifyListeners();
  }

  // Registra un listener de actualización en tiempo real (similar a onSnapshot de Firestore)
  subscribe(callback) {
    this.listeners.push(callback);
    // Ejecutar callback inicial
    callback(this.getDataState());
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback);
    };
  }

  notifyListeners() {
    const state = this.getDataState();
    this.listeners.forEach(cb => cb(state));
  }

  getDataState() {
    return {
      workers: Array.from(this.workers.values()),
      lines: Array.from(this.lines.values()),
      puestos: Array.from(this.puestos.values()),
      alerts: Array.from(this.alerts.values()),
      logs: [...this.logs]
    };
  }

  addLog(message, type = 'info') {
    const time = new Date().toLocaleTimeString();
    this.logs.unshift({ timestamp: time, message, type });
    if (this.logs.length > 50) this.logs.pop();
  }

  // Ejecuta una transacción atómica segura
  async runTransaction(transactionFn) {
    // Clonar base de datos local para simular aislamiento de transacciones
    const localDbSnapshot = {
      workers: new Map(JSON.parse(JSON.stringify(Array.from(this.workers.entries())))),
      lines: new Map(JSON.parse(JSON.stringify(Array.from(this.lines.entries())))),
      puestos: new Map(JSON.parse(JSON.stringify(Array.from(this.puestos.entries())))),
      alerts: new Map(JSON.parse(JSON.stringify(Array.from(this.alerts.entries())))),
      logs: [...this.logs]
    };

    const transactionContext = {
      get: (collection, id) => {
        if (collection === 'workers') return localDbSnapshot.workers.get(id);
        if (collection === 'lines') return localDbSnapshot.lines.get(id);
        if (collection === 'puestos') return localDbSnapshot.puestos.get(id);
        if (collection === 'alerts') return localDbSnapshot.alerts.get(id);
        return null;
      },
      update: (collection, id, data) => {
        const targetMap = localDbSnapshot[collection];
        if (targetMap && targetMap.has(id)) {
          targetMap.set(id, { ...targetMap.get(id), ...data });
        }
      },
      set: (collection, id, data) => {
        const targetMap = localDbSnapshot[collection];
        if (targetMap) {
          targetMap.set(id, { ...data });
        }
      },
      delete: (collection, id) => {
        const targetMap = localDbSnapshot[collection];
        if (targetMap) {
          targetMap.delete(id);
        }
      },
      // Permite realizar consultas dentro de la transacción
      query: (collectionName, filterFn) => {
        const list = Array.from(localDbSnapshot[collectionName].values());
        return list.filter(filterFn);
      }
    };

    try {
      // Ejecutar función de transacción
      await transactionFn(transactionContext);

      // Si todo sale bien, aplicar cambios de forma atómica a la base de datos principal
      this.workers = localDbSnapshot.workers;
      this.lines = localDbSnapshot.lines;
      this.puestos = localDbSnapshot.puestos;
      this.alerts = localDbSnapshot.alerts;
      this.notifyListeners();
      return { success: true };
    } catch (error) {
      console.error("Transacción fallida/abortada:", error.message);
      this.addLog(`Transacción abortada: ${error.message}`, 'error');
      throw error; // Propagar error
    }
  }
}

export const dbEmulator = new LocalFirestoreEmulator();

// --- LOGICA DE NEGOCIO TRANSACCIONAL DE FIRESTORE ---

// Prioridades estrictas de la planta
export const ORDEN_PRIORIDADES = ['L4', 'L1', 'L2', 'L6', 'L7', 'L5', 'L3', 'L8', 'L9', 'L10'];

/**
 * 1. INICIALIZACIÓN DE TURNO Y ASIGNACIÓN DE PUESTOS FIJOS (Segundo Cero)
 * Esta función inicializa el estado en Firestore y congela a los técnicos en sus puestos fijos.
 */
export async function firebaseInicializarTurno() {
  const nuevosPuestos = [];
  
  // Generar puestos vacíos
  LINEAS_MOCK.forEach(l => {
    // Puestos fijos
    PUESTOS_PLANTILLA.fijos.forEach((pf, index) => {
      nuevosPuestos.push({
        idPuesto: `${l.idLinea}_F${index + 1}`,
        idLinea: l.idLinea,
        tipo: 'Fijo',
        nombreTarea: `${pf.nombreTarea} (${l.nombre})`,
        rolRequerido: pf.rolRequerido,
        idWorkerAsignado: null,
        idWorkerOriginal: null
      });
    });
    // Puestos varios
    const variosDeLinea = PUESTOS_PLANTILLA.varios[l.idLinea] || [];
    variosDeLinea.forEach(pv => {
      nuevosPuestos.push({
        idPuesto: pv.idPuesto,
        idLinea: l.idLinea,
        tipo: 'Vario',
        nombreTarea: pv.nombreTarea,
        sexoRequerido: pv.sexoRequerido,
        restriccionesProhibidas: pv.restriccionesProhibidas,
        idWorkerAsignado: null,
        timer: 120, // 2 minutos para pruebas aceleradas
        maxHorasPermitidas: 2,
        rotacionIniciada: false
      });
    });
  });

  // Inicializamos el emulador de base de datos
  dbEmulator.initialize(TRABAJADORES_MOCK, LINEAS_MOCK, nuevosPuestos);

  // Ejecutamos la transacción atómica de asignación inicial
  await dbEmulator.runTransaction(async (transaction) => {
    dbEmulator.addLog("Iniciando Transacción de Asignación de Puestos Fijos al segundo cero...", "info");

    const todosLosPuestos = transaction.query('puestos', () => true);
    
    // Simular huella dactilar de todos los trabajadores inactivos para pasarlos al pool de arranque
    const workers = transaction.query('workers', w => w.rol !== 'Coordinador' && w.rol !== 'Supervisor');
    workers.forEach(w => {
      if (w.estadoActual !== 'BAJA_TEMPORAL') {
        transaction.update('workers', w.idWorker, {
          estadoActual: 'POOL_ARRANQUE',
          lineaActualId: null,
          lineaDestinoId: null,
          puestoActualId: null
        });
      }
    });

    // Procesar cada puesto fijo de forma atómica
    todosLosPuestos.forEach(puesto => {
      if (puesto.tipo === 'Fijo') {
        // 1. Intentar asignar al titular técnico original del pool
        const titularesAptos = transaction.query('workers', w => 
          w.rol === puesto.rolRequerido && 
          w.estadoActual === 'POOL_ARRANQUE'
        );

        if (titularesAptos.length > 0) {
          const titular = titularesAptos[0];
          
          transaction.update('puestos', puesto.idPuesto, {
            idWorkerAsignado: titular.idWorker,
            idWorkerOriginal: titular.idWorker
          });

          transaction.update('workers', titular.idWorker, {
            estadoActual: 'ASIGNADO',
            lineaActualId: puesto.idLinea,
            puestoActualId: puesto.idPuesto
          });
          
          dbEmulator.addLog(`Asignado Técnico Titular: ${titular.nombre} en puesto fijo ${puesto.idPuesto}`, 'success');
        } else {
          // 2. Si el titular está en BAJA_TEMPORAL, buscar un reemplazo temporal (Operador B calificado en el Pool)
          const titularBaja = transaction.query('workers', w => 
            w.rol === puesto.rolRequerido && 
            w.estadoActual === 'BAJA_TEMPORAL'
          )[0];

          const titularId = titularBaja ? titularBaja.idWorker : 'N/A';
          
          // Buscar un Operador B disponible en el pool para cubrir la vacante temporal
          const reemplazosDisponibles = transaction.query('workers', w => 
            w.rol === 'Operador B' && 
            w.estadoActual === 'POOL_ARRANQUE'
          );

          if (reemplazosDisponibles.length > 0) {
            const reemplazo = reemplazosDisponibles[0];
            
            transaction.update('puestos', puesto.idPuesto, {
              idWorkerAsignado: reemplazo.idWorker,
              idWorkerOriginal: titularId // Guardamos quién es el dueño original
            });

            transaction.update('workers', reemplazo.idWorker, {
              estadoActual: 'ASIGNADO',
              lineaActualId: puesto.idLinea,
              puestoActualId: puesto.idPuesto
            });

            dbEmulator.addLog(`Reemplazo Temporal: ${reemplazo.nombre} cubre Puesto Fijo ${puesto.idPuesto} (Titular de baja)`, 'warning');
          } else {
            dbEmulator.addLog(`Alerta: Puesto Fijo ${puesto.idPuesto} no pudo cubrirse por falta de personal.`, 'error');
          }
        }
      }
    });
  });
}

/**
 * 2. MOTOR DE REGLAS DE ASIGNACIÓN MÓVIL POR QR (Filtros en milisegundos)
 * Valida de manera transaccional y atómica la compatibilidad de salud, sexo, no repetición y prioridad.
 */
export async function firebaseEscanearQR(workerId, lineaId) {
  return await dbEmulator.runTransaction(async (transaction) => {
    const worker = transaction.get('workers', workerId);
    if (!worker) throw new Error("Código QR inválido");

    const linea = transaction.get('lines', lineaId);
    if (!linea) throw new Error("Línea no configurada");

    if (linea.estado === 'En Preparación') {
      throw new Error(`La ${linea.nombre} está en mantenimiento/limpieza. No se admiten asignaciones.`);
    }

    if (worker.estadoActual === 'ASIGNADO' && worker.rol === 'Operador A') {
      throw new Error(`${worker.nombre} es un Operador A y está congelado en su puesto técnico.`);
    }

    // Obtener los puestos varios vacíos de la línea destino
    const puestosVacios = transaction.query('puestos', p => 
      p.idLinea === lineaId && 
      p.tipo === 'Vario' && 
      !p.idWorkerAsignado
    );

    if (puestosVacios.length === 0) {
      throw new Error(`No hay vacantes de puestos varios en la ${linea.nombre}.`);
    }

    // --- FILTRO CRÍTICO 3: REDIRECCIÓN POR PRIORIDAD DE LA PLANTA ---
    const lineaActualPrioIdx = ORDEN_PRIORIDADES.indexOf(lineaId);

    for (let i = 0; i < lineaActualPrioIdx; i++) {
      const lineaPrioId = ORDEN_PRIORIDADES[i];
      const lineaPrio = transaction.get('lines', lineaPrioId);

      if (lineaPrio && lineaPrio.estado === 'Operando') {
        const vacantesPrio = transaction.query('puestos', p => 
          p.idLinea === lineaPrioId && 
          p.tipo === 'Vario' && 
          !p.idWorkerAsignado
        );

        if (vacantesPrio.length > 0) {
          // Comprobar si el trabajador califica para al menos un puesto de la línea prioritaria vacía
          const calificaParaPrio = vacantesPrio.some(puestoPrio => 
            evaluarFiltrosCompatibilidad(worker, puestoPrio) === true
          );

          if (calificaParaPrio) {
            // REDIRECCIÓN OBLIGATORIA: Cambiar estado a EN_TRANSITO y setear destino
            transaction.update('workers', workerId, {
              estadoActual: 'EN_TRANSITO',
              lineaActualId: null,
              lineaDestinoId: lineaPrioId,
              puestoActualId: null
            });

            // Crear alerta de tránsito en Firestore
            const alertaId = `ALERTA_TRANSITO_${workerId}_${Date.now()}`;
            transaction.set('alerts', alertaId, {
              id: alertaId,
              type: 'transito',
              title: `DESVÍO OBLIGATORIO`,
              message: `${worker.nombre} ha sido redirigido a ${lineaPrio.nombre} debido a jerarquía de prioridad de planta.`,
              workerId,
              lineaDestinoId: lineaPrioId
            });

            dbEmulator.addLog(`Filtro Prioridad: Redirigiendo a ${worker.nombre} hacia ${lineaPrio.nombre} (Prioridad superior)`, 'warning');
            return { status: 'redirigido', msg: `Redirigido a la línea prioritaria ${lineaPrio.nombre}.` };
          }
        }
      }
    }

    // --- FILTROS DE SEGURIDAD OPERATIVA ---
    let puestoAsignado = null;
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

    // --- ASIGNACIÓN ATÓMICA EXITOSA ---
    transaction.update('puestos', puestoAsignado.idPuesto, {
      idWorkerAsignado: workerId,
      timer: 120, // Resetear 2 minutos
      rotacionIniciada: false
    });

    transaction.update('workers', workerId, {
      estadoActual: 'ASIGNADO',
      lineaActualId: lineaId,
      lineaDestinoId: null,
      puestoActualId: puestoAsignado.idPuesto
    });

    // Limpiar alertas de tránsito previas del trabajador
    const alertasPrevias = transaction.query('alerts', a => a.workerId === workerId && a.type === 'transito');
    alertasPrevias.forEach(a => transaction.delete('alerts', a.id));

    dbEmulator.addLog(`Escaneo QR Exitoso: ${worker.nombre} asignado a ${puestoAsignado.nombreTarea}`, 'success');
    return { status: 'asignado', puesto: puestoAsignado.nombreTarea };
  });
}

// Evalúa las restricciones físicas, sexo e historial de no repetición
function evaluarFiltrosCompatibilidad(worker, puesto) {
  // Filtro de Sexo
  if (puesto.sexoRequerido !== 'Indiferente' && worker.sexo !== puesto.sexoRequerido) {
    return `Puesto exclusivo para personal de sexo ${puesto.sexoRequerido}.`;
  }

  // Filtro de Restricciones Médicas (Salud)
  if (worker.restriccionesMedicas && worker.restriccionesMedicas.length > 0) {
    const tieneRestriccion = puesto.restriccionesProhibidas && puesto.restriccionesProhibidas.some(r => 
      worker.restriccionesMedicas.includes(r)
    );
    if (tieneRestriccion) {
      return `Restricción médica activa: El operario tiene constancia de ${worker.restriccionesMedicas.join(', ')}.`;
    }
  }

  // Filtro de Historial de No Repetición (última actividad del día anterior)
  if (worker.ultimaActividadAyer && worker.ultimaActividadAyer.toLowerCase().trim() === puesto.nombreTarea.toLowerCase().trim()) {
    return `Regla de No Repetición: El operario finalizó su turno anterior en la tarea ${puesto.nombreTarea}.`;
  }

  return true;
}

/**
 * 3. APROBACIÓN DE DESPACHO EN LÍNEA 8 (ROTACIÓN - FASE 4)
 * El supervisor de la Línea 8 aprueba la salida de un operario libre ("DISPONIBLE_BOLSON")
 */
export async function firebaseAprobarDespachoRotacion(alertaId) {
  await dbEmulator.runTransaction(async (transaction) => {
    const alerta = transaction.get('alerts', alertaId);
    if (!alerta) throw new Error("Alerta de rotación no encontrada");

    const workerEntrante = transaction.get('workers', alerta.workerEntranteId);
    if (!workerEntrante) throw new Error("Operario de reemplazo no encontrado");

    // 1. Cambiar estado del trabajador entrante a "EN_TRANSITO" con destino a la línea prioritaria
    transaction.update('workers', workerEntrante.idWorker, {
      estadoActual: 'EN_TRANSITO',
      lineaActualId: null,
      lineaDestinoId: alerta.lineaPrioId,
      puestoActualId: null
    });

    // 2. Desalojar al operario de su puesto en la Línea 8 (Bolsón)
    const puestosL8 = transaction.query('puestos', p => p.idWorkerAsignado === workerEntrante.idWorker && p.idLinea === 'L8');
    puestosL8.forEach(p => transaction.update('puestos', p.idPuesto, { idWorkerAsignado: null }));

    // 3. Transformar la alerta en una notificación de recepción para el supervisor de destino
    transaction.set('alerts', alertaId, {
      ...alerta,
      type: 'esperando_recepcion',
      title: `RELEVIDA EN CAMINO`,
      message: `El supervisor de L8 autorizó la salida de ${workerEntrante.nombre}. Por favor, escanea su QR al recibirlo.`
    });

    dbEmulator.addLog(`Rotación: Supervisor de L8 autorizó despacho de ${workerEntrante.nombre} a la línea prioritaria ${alerta.lineaPrioId}`, 'success');
  });
}

/**
 * 4. EFECTO DOMINÓ Y REDISTRIBUCIÓN EN CASCADA DE ROTACIONES (FASE 4)
 * Se ejecuta en una transacción atómica cuando el relevista es escaneado en la línea prioritaria.
 * El operario relevado es redistribuido en cascada por orden de prioridad de la planta.
 */
export async function firebaseCompletarRotacionYCascada(alertaId) {
  await dbEmulator.runTransaction(async (transaction) => {
    const alerta = transaction.get('alerts', alertaId);
    if (!alerta) throw new Error("Alerta no válida");

    const workerEntrante = transaction.get('workers', alerta.workerEntranteId);
    const workerSaliente = transaction.get('workers', alerta.workerSalienteId);
    const puestoPrio = transaction.get('puestos', alerta.puestoId);

    if (!workerEntrante || !workerSaliente || !puestoPrio) {
      throw new Error("Datos de rotación incompletos");
    }

    dbEmulator.addLog(`Ejecutando Efecto Dominó: Relevando a ${workerSaliente.nombre} con ${workerEntrante.nombre}...`, 'info');

    // 1. Asignar al relevista (entrante) al puesto prioritario
    transaction.update('puestos', puestoPrio.idPuesto, {
      idWorkerAsignado: workerEntrante.idWorker,
      timer: 120, // Resetear a 2 minutos
      rotacionIniciada: false
    });

    transaction.update('workers', workerEntrante.idWorker, {
      estadoActual: 'ASIGNADO',
      lineaActualId: alerta.lineaPrioId,
      lineaDestinoId: null,
      puestoActualId: puestoPrio.idPuesto
    });

    // 2. ALGORITMO EN CASCADA PARA EL TRABAJADOR SALIENTE (RELEVADO)
    // Evaluamos vacantes en orden de prioridad estricta
    let vacanteEncontrada = false;
    let lineaDestinoId = 'L8';

    for (let lineaId of ORDEN_PRIORIDADES) {
      if (lineaId === 'L8') continue; // L8 se trata al final si no hay de prioridad superior

      const linea = transaction.get('lines', lineaId);
      if (linea && linea.estado === 'Operando') {
        const puestosVacios = transaction.query('puestos', p => 
          p.idLinea === lineaId && 
          p.tipo === 'Vario' && 
          !p.idWorkerAsignado
        );

        // Buscar un puesto vacío que coincida con las restricciones, sexo e historial del relevado
        const puestoApto = puestosVacios.find(p => evaluarFiltrosCompatibilidad(workerSaliente, p) === true);

        if (puestoApto) {
          // Encontró vacante en línea activa prioritaria
          vacanteEncontrada = true;
          lineaDestinoId = lineaId;

          // Poner al trabajador saliente en tránsito hacia esa línea
          transaction.update('workers', workerSaliente.idWorker, {
            estadoActual: 'EN_TRANSITO',
            lineaActualId: null,
            lineaDestinoId: lineaId,
            puestoActualId: null
          });

          // Crear la alerta de tránsito para el supervisor de destino
          const alertId = `ALERTA_TRANSITO_${workerSaliente.idWorker}_${Date.now()}`;
          transaction.set('alerts', alertId, {
            id: alertId,
            type: 'transito',
            title: `OPERARIO REDISTRIBUIDO`,
            message: `${workerSaliente.nombre} ha sido redirigido a ${linea.nombre} tras ser relevado en la Línea ${alerta.lineaPrioId}.`,
            workerId: workerSaliente.idWorker,
            lineaDestinoId: lineaId
          });

          dbEmulator.addLog(`Efecto Dominó: ${workerSaliente.nombre} redirigido en tránsito a la línea de prioridad ${linea.nombre}`, 'success');
          break;
        }
      }
    }

    if (!vacanteEncontrada) {
      // Si no hay vacantes en planta, regresa al Bolsón (Línea 8)
      transaction.update('workers', workerSaliente.idWorker, {
        estadoActual: 'DISPONIBLE_BOLSON',
        lineaActualId: 'L8',
        lineaDestinoId: null,
        puestoActualId: null
      });

      // Asignarlo a un puesto de ensamble vacío en la Línea 8
      const puestosL8Vacios = transaction.query('puestos', p => p.idLinea === 'L8' && !p.idWorkerAsignado);
      if (puestosL8Vacios.length > 0) {
        transaction.update('puestos', puestosL8Vacios[0].idPuesto, {
          idWorkerAsignado: workerSaliente.idWorker
        });
      }

      dbEmulator.addLog(`Efecto Dominó: Sin vacantes prioritarias. ${workerSaliente.nombre} regresa a Línea 8 (Bolsón)`, 'info');
    }

    // 3. Eliminar la alerta de recepción ya completada
    transaction.delete('alerts', alertaId);
  });
}

/**
 * 5. PROTOCOLO DE REINCORPORACIÓN DESDE BAJA_TEMPORAL (Altas de Coordinador)
 * Devuelve de inmediato a los técnicos fijos a su puesto técnico, desalojando reemplazos
 * y enviando a los reemplazos desalojados al algoritmo en cascada.
 */
export async function firebaseReincorporarTrabajador(workerId) {
  await dbEmulator.runTransaction(async (transaction) => {
    const worker = transaction.get('workers', workerId);
    if (!worker || worker.estadoActual !== 'BAJA_TEMPORAL') {
      throw new Error("El trabajador no está registrado en BAJA_TEMPORAL.");
    }

    dbEmulator.addLog(`Procesando Reincorporación Médica de ${worker.nombre}...`, 'info');

    if (worker.rol === 'Operador A' || worker.rol === 'Averiero') {
      // --- CASO PUESTO FIJO TÉCNICO ---
      // Localizar el puesto fijo original del titular en Firestore
      const puestoOriginal = transaction.query('puestos', p => p.idWorkerOriginal === workerId)[0];

      if (puestoOriginal) {
        const reemplazoId = puestoOriginal.idWorkerAsignado;

        // 1. Asignar al titular de vuelta en su puesto original
        transaction.update('puestos', puestoOriginal.idPuesto, {
          idWorkerAsignado: workerId
        });

        transaction.update('workers', workerId, {
          estadoActual: 'ASIGNADO',
          lineaActualId: puestoOriginal.idLinea,
          lineaDestinoId: null,
          puestoActualId: puestoOriginal.idPuesto
        });

        dbEmulator.addLog(`Puesto Fijo: Titular ${worker.nombre} reasume su puesto en ${puestoOriginal.idPuesto}`, 'success');

        // 2. Si había un reemplazo ocupando el puesto, desalojarlo y mandarlo al algoritmo de prioridad
        if (reemplazoId && reemplazoId !== workerId) {
          const reemplazo = transaction.get('workers', reemplazoId);
          dbEmulator.addLog(`Desalojando reemplazo temporal ${reemplazo.nombre}. Buscando vacante en planta...`, 'warning');

          let vacanteEncontrada = false;

          for (let lineaId of ORDEN_PRIORIDADES) {
            if (lineaId === 'L8') continue;

            const linea = transaction.get('lines', lineaId);
            if (linea && linea.estado === 'Operando') {
              const puestosVacios = transaction.query('puestos', p => 
                p.idLinea === lineaId && 
                p.tipo === 'Vario' && 
                !p.idWorkerAsignado
              );

              const puestoApto = puestosVacios.find(p => evaluarFiltrosCompatibilidad(reemplazo, p) === true);

              if (puestoApto) {
                vacanteEncontrada = true;

                // Redirigir reemplazo en tránsito
                transaction.update('workers', reemplazoId, {
                  estadoActual: 'EN_TRANSITO',
                  lineaActualId: null,
                  lineaDestinoId: lineaId,
                  puestoActualId: null
                });

                // Crear alerta de tránsito
                const alertId = `ALERTA_TRANSITO_${reemplazoId}_${Date.now()}`;
                transaction.set('alerts', alertId, {
                  id: alertId,
                  type: 'transito',
                  title: `REEMPLAZO REDISTRIBUIDO`,
                  message: `${reemplazo.nombre} fue liberado de un puesto fijo y redirigido a ${linea.nombre}.`,
                  workerId: reemplazoId,
                  lineaDestinoId: lineaId
                });

                dbEmulator.addLog(`Redistribución: Reemplazo ${reemplazo.nombre} enviado a la línea prioritaria ${linea.nombre}`, 'success');
                break;
              }
            }
          }

          if (!vacanteEncontrada) {
            // Regresa a la Línea 8
            transaction.update('workers', reemplazoId, {
              estadoActual: 'DISPONIBLE_BOLSON',
              lineaActualId: 'L8',
              lineaDestinoId: null,
              puestoActualId: null
            });

            const puestosL8Vacios = transaction.query('puestos', p => p.idLinea === 'L8' && !p.idWorkerAsignado);
            if (puestosL8Vacios.length > 0) {
              transaction.update('puestos', puestosL8Vacios[0].idPuesto, {
                idWorkerAsignado: reemplazoId
              });
            }

            dbEmulator.addLog(`Redistribución: Sin vacantes prioritarias. Reemplazo ${reemplazo.nombre} enviado a la Línea 8`, 'info');
          }
        }
      } else {
        // Fallback al pool si no tiene puesto asociado
        transaction.update('workers', workerId, {
          estadoActual: 'POOL_ARRANQUE',
          lineaActualId: null,
          lineaDestinoId: null,
          puestoActualId: null
        });
        dbEmulator.addLog(`Trabajador ${worker.nombre} ingresado al Pool de Arranque.`, 'info');
      }
    } else {
      // --- CASO PUESTO VARIO ---
      // Envía directamente a la Línea 8 (Bolsón) como DISPONIBLE_BOLSON
      transaction.update('workers', workerId, {
        estadoActual: 'DISPONIBLE_BOLSON',
        lineaActualId: 'L8',
        lineaDestinoId: null,
        puestoActualId: null
      });

      const puestosL8Vacios = transaction.query('puestos', p => p.idLinea === 'L8' && !p.idWorkerAsignado);
      if (puestosL8Vacios.length > 0) {
        transaction.update('puestos', puestosL8Vacios[0].idPuesto, {
          idWorkerAsignado: workerId
        });
      }

      dbEmulator.addLog(`Puesto Vario: ${worker.nombre} ingresa directamente a la sala de ensamble de la Línea 8`, 'success');
    }
  });
}

/**
 * 6. PAROS POR PREPARACIÓN DE EQUIPOS
 * Detiene la línea, los puestos fijos (Operadores A) se quedan en mantenimiento,
 * y todos los puestos varios se desalojan en tránsito inmediato a la Línea 8.
 */
export async function firebaseActivarPreparacion(lineaId) {
  await dbEmulator.runTransaction(async (transaction) => {
    transaction.update('lines', lineaId, { estado: 'En Preparación' });

    // Encontrar todos los puestos varios de esa línea que tengan personal
    const puestosDeLinea = transaction.query('puestos', p => 
      p.idLinea === lineaId && 
      p.tipo === 'Vario' && 
      p.idWorkerAsignado !== null
    );

    const idsDesalojados = puestosDeLinea.map(p => p.idWorkerAsignado);

    // Vaciar los puestos varios
    puestosDeLinea.forEach(p => {
      transaction.update('puestos', p.idPuesto, {
        idWorkerAsignado: null,
        timer: 120,
        rotacionIniciada: false
      });
    });

    // Poner a todos los operarios desalojados en tránsito a la Línea 8
    idsDesalojados.forEach(workerId => {
      transaction.update('workers', workerId, {
        estadoActual: 'EN_TRANSITO',
        lineaActualId: null,
        lineaDestinoId: 'L8',
        puestoActualId: null
      });

      // Crear alerta de tránsito
      const alertId = `ALERTA_TRANSITO_${workerId}_${Date.now()}`;
      const worker = transaction.get('workers', workerId);
      
      transaction.set('alerts', alertId, {
        id: alertId,
        type: 'transito',
        title: `DESALOJO POR PARO`,
        message: `${worker.nombre} fue liberado por preparación de línea y se dirige a la Línea 8 (Bolsón).`,
        workerId,
        lineaDestinoId: 'L8'
      });
    });

    dbEmulator.addLog(`Línea ${lineaId} EN PREPARACIÓN. ${idsDesalojados.length} operarios de puestos varios reubicados a L8.`, 'warning');
  });
}

/**
 * Restablecer línea a operativa
 */
export async function firebaseRestablecerLinea(lineaId) {
  await dbEmulator.runTransaction(async (transaction) => {
    transaction.update('lines', lineaId, { estado: 'Operando' });
    dbEmulator.addLog(`Línea ${lineaId} restablecida a estado OPERANDO.`, 'success');
  });
}
