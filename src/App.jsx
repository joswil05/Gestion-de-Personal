import React, { useState, useEffect, useRef } from 'react';
import { 
  LINEAS_MOCK, 
  TRABAJADORES_MOCK, 
  PUESTOS_PLANTILLA 
} from './mocks/mockData';
import { 
  Users, 
  Activity, 
  RefreshCw, 
  QrCode, 
  AlertTriangle, 
  CheckCircle, 
  AlertCircle,
  Play, 
  Pause, 
  FastForward, 
  Plus, 
  ArrowRight,
  UserCheck,
  UserMinus,
  Settings,
  HelpCircle
} from 'lucide-react';
import './App.css';

function App() {
  // --- ESTADOS DE LA APLICACIÓN (Simulación de DB) ---
  const [workers, setWorkers] = useState(TRABAJADORES_MOCK);
  const [lines, setLines] = useState(LINEAS_MOCK);
  const [puestos, setPuestos] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [activeTab, setActiveTab] = useState('coordinador'); // coordinator o supervisor
  const [selectedLineId, setSelectedLineId] = useState('L4'); // Línea por defecto en vista supervisor
  const [turnoIniciado, setTurnoIniciado] = useState(false);
  const [logs, setLogs] = useState([]);

  // --- ESTADO DEL SIMULADOR DE TIEMPO ---
  const [simTime, setSimTime] = useState({ hour: 6, minute: 0, second: 0 });
  const [simSpeed, setSimSpeed] = useState(1); // 0: Pausado, 1: Normal, 10: Rápido (para ver expirar temporizadores)
  const timerRef = useRef(null);

  // --- ESTADOS DE UI ---
  const [selectedWorkerQR, setSelectedWorkerQR] = useState('');
  const [qrError, setQrError] = useState('');
  const [qrSuccess, setQrSuccess] = useState('');
  const [qrWarning, setQrWarning] = useState('');
  const [showQrModal, setShowQrModal] = useState(false);
  const [showSheetsModal, setShowSheetsModal] = useState(false);

  // --- LOGICA DEL RELOJ DE SIMULACIÓN Y TEMPORIZADORES ---
  useEffect(() => {
    if (simSpeed === 0) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    timerRef.current = setInterval(() => {
      setSimTime(prev => {
        let newSec = prev.second + 1 * simSpeed;
        let newMin = prev.minute;
        let newHour = prev.hour;

        if (newSec >= 60) {
          newMin += Math.floor(newSec / 60);
          newSec = newSec % 60;
        }
        if (newMin >= 60) {
          newHour += Math.floor(newMin / 60);
          newMin = newMin % 60;
        }
        if (newHour >= 24) {
          newHour = 0;
        }

        // Actualizar temporizadores de puestos asignados si el turno está activo
        if (turnoIniciado) {
          setPuestos(currentPuestos => {
            return currentPuestos.map(p => {
              if (p.tipo === 'Vario' && p.idWorkerAsignado && p.timer > 0) {
                const newTimer = Math.max(0, p.timer - 1 * simSpeed);
                // Si el temporizador llega a cero (o está cerca, ej: menos de 20s) y no hay alerta activa
                if (newTimer <= 30 && newTimer > 0 && !p.rotacionIniciada) {
                  triggerRotacionAutomatica(p.idPuesto, p.idLinea);
                  p.rotacionIniciada = true;
                }
                return { ...p, timer: newTimer };
              }
              return p;
            });
          });
        }

        return { hour: newHour, minute: newMin, second: newSec };
      });
    }, 1000);

    return () => clearInterval(timerRef.current);
  }, [simSpeed, turnoIniciado]);

  // Agregar log al feed de eventos
  const addLog = (message, type = 'info') => {
    const timestamp = `${String(simTime.hour).padStart(2, '0')}:${String(simTime.minute).padStart(2, '0')}:${String(simTime.second).padStart(2, '0')}`;
    setLogs(prev => [{ timestamp, message, type }, ...prev].slice(0, 100));
  };

  // --- INGESTA DE PROGRAMA DEL DIA Y REGISTRO DE HUELLA (FASE 1 & 2) ---
  const handleIniciarTurno = () => {
    // 1. Simular registro de huella en bloque para trabajadores inactivos o en pool
    setWorkers(prev => prev.map(w => {
      if (w.rol !== 'Coordinador' && w.rol !== 'Supervisor' && w.estadoActual !== 'BAJA_TEMPORAL') {
        return {
          ...w,
          estadoActual: 'POOL_ARRANQUE',
          lineaActualId: null,
          puestoActualId: null
        };
      }
      return w;
    }));

    addLog("Ingesta de programa de producción desde Google Sheets completada.", "success");
    addLog("Simulación de registro de huella dactilar: 20 operarios en Pool de Arranque.", "info");

    // 2. Crear los puestos vacíos para cada línea en base a la plantilla
    const nuevosPuestos = [];
    lines.forEach(l => {
      // Agregar puestos fijos
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
      // Agregar puestos varios
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
          timer: 120, // 2 minutos para demostración rápida en lugar de 2 horas
          maxHorasPermitidas: 2,
          rotacionIniciada: false
        });
      });
    });

    // 3. Algoritmo al minuto cero: Congelar Puestos Fijos (Operadores A, Averieros, Operadores C en entrenamiento)
    const puestosConAsignacion = [...nuevosPuestos];
    const workersActualizados = [...TRABAJADORES_MOCK].map(w => {
      if (w.rol === 'Coordinador' || w.rol === 'Supervisor') return w;
      if (w.estadoActual === 'BAJA_TEMPORAL') return w;
      return { ...w, estadoActual: 'POOL_ARRANQUE' };
    });

    puestosConAsignacion.forEach(puesto => {
      if (puesto.tipo === 'Fijo') {
        // Encontrar un trabajador apto para este puesto fijo en el pool
        const indexApto = workersActualizados.findIndex(w => 
          w.rol === puesto.rolRequerido && 
          w.estadoActual === 'POOL_ARRANQUE'
        );

        if (indexApto !== -1) {
          const workerSelected = workersActualizados[indexApto];
          puesto.idWorkerAsignado = workerSelected.idWorker;
          puesto.idWorkerOriginal = workerSelected.idWorker; // Titular
          
          workersActualizados[indexApto] = {
            ...workerSelected,
            estadoActual: 'ASIGNADO',
            lineaActualId: puesto.idLinea,
            puestoActualId: puesto.idPuesto
          };
        } else {
          // Si el titular de este puesto fijo está en BAJA_TEMPORAL, buscar un reemplazo temporal calificado (Operador B u Operador C entrenado)
          // Buscamos quién es el dueño original de este rol
          const titularOriginal = workersActualizados.find(w => w.rol === puesto.rolRequerido && w.estadoActual === 'BAJA_TEMPORAL');
          if (titularOriginal) {
            puesto.idWorkerOriginal = titularOriginal.idWorker; // Guardamos quién debiera ser
            
            // Buscamos un reemplazo de nivel Operador B o C entrenado en el pool
            const indexReemplazo = workersActualizados.findIndex(w => 
              (w.rol === 'Operador B' || w.rol === 'Operador C (Entrenado)') && 
              w.estadoActual === 'POOL_ARRANQUE'
            );

            if (indexReemplazo !== -1) {
              const reemplazo = workersActualizados[indexReemplazo];
              puesto.idWorkerAsignado = reemplazo.idWorker;
              
              workersActualizados[indexReemplazo] = {
                ...reemplazo,
                estadoActual: 'ASIGNADO',
                lineaActualId: puesto.idLinea,
                puestoActualId: puesto.idPuesto
              };
              addLog(`Reemplazo Temporal: ${reemplazo.nombre} cubre Puesto Fijo (${puesto.nombreTarea}) por baja de titular.`, 'warning');
            }
          }
        }
      }
    });

    setPuestos(puestosConAsignacion);
    setWorkers(workersActualizados);
    setTurnoIniciado(true);
    addLog("Asignación Automática de Puestos Fijos al Minuto Cero ejecutada. Técnicos congelados.", "success");
  };

  // --- DISTRIBUCIÓN POR ESCANEO QR CON FILTROS EN TIEMPO REAL (FASE 3) ---
  const handleEscanearQR = (workerId, lineaId) => {
    setQrError('');
    setQrSuccess('');
    setQrWarning('');

    const worker = workers.find(w => w.idWorker === workerId);
    if (!worker) {
      setQrError("Código QR no reconocido en el sistema.");
      return;
    }

    if (worker.estadoActual === 'ASIGNADO' && worker.lineaActualId === lineaId) {
      setQrError(`${worker.nombre} ya se encuentra asignado en esta línea.`);
      return;
    }

    // Si el trabajador está en tránsito hacia esta línea, se permite asignarlo
    // Si está asignado en otra línea fija, no se puede jalar así nada más (salvo rotación)
    if (worker.estadoActual === 'ASIGNADO' && worker.rol === 'Operador A') {
      setQrError(`${worker.nombre} es un Operador A congelado en su puesto técnico.`);
      return;
    }

    // 1. OBTENER PUESTOS VARIOS VACÍOS DE LA LÍNEA
    const puestosVariosVacios = puestos.filter(p => p.idLinea === lineaId && p.tipo === 'Vario' && !p.idWorkerAsignado);
    if (puestosVariosVacios.length === 0) {
      setQrError(`No hay puestos varios disponibles en la ${lines.find(l => l.idLinea === lineaId).nombre}.`);
      return;
    }

    // 2. COMPROBAR FILTRO CRÍTICO 3: PRIORIDAD DE LA PLANTA
    // Si hay una línea con mayor prioridad que requiere personal y tiene puestos vacíos, 
    // y el trabajador califica, alertar al supervisor que lo mande para allá.
    const ordenPrio = ['L4', 'L1', 'L2', 'L6', 'L7', 'L5', 'L3', 'L8', 'L9', 'L10'];
    const lineaActualPrioIdx = ordenPrio.indexOf(lineaId);

    for (let i = 0; i < lineaActualPrioIdx; i++) {
      const lineaPrioId = ordenPrio[i];
      const lineaPrio = lines.find(l => l.idLinea === lineaPrioId);
      
      if (lineaPrio && lineaPrio.estado === 'Operando') {
        const puestosPrioVacios = puestos.filter(p => p.idLinea === lineaPrioId && p.tipo === 'Vario' && !p.idWorkerAsignado);
        
        if (puestosPrioVacios.length > 0) {
          // Verificar si el trabajador califica para al menos uno de esos puestos en la línea de mayor prioridad
          const calificaParaPrio = puestosPrioVacios.some(p => evaluarCompatibilidadPuesto(worker, p) === true);
          
          if (calificaParaPrio) {
            setQrWarning(`DESVÍO POR PRIORIDAD: La línea ${lineaPrio.nombre} es de mayor prioridad y tiene puestos vacantes compatibles. Por favor, despache a ${worker.nombre} hacia allá.`);
            addLog(`Filtro Prioridad: Redirección sugerida de ${worker.nombre} hacia ${lineaPrio.nombre} (Prioridad superior)`, 'warning');
            
            // Opcionalmente podemos forzar el desvío poniéndolo en tránsito hacia la prioritaria
            setWorkers(prev => prev.map(w => {
              if (w.idWorker === worker.idWorker) {
                return {
                  ...w,
                  estadoActual: 'EN_TRANSITO',
                  lineaActualId: null,
                  lineaDestinoId: lineaPrioId,
                  puestoActualId: null
                };
              }
              return w;
            }));
            
            // Crear alerta para el supervisor de destino
            crearAlertaEnTransito(worker.idWorker, lineaPrioId);
            return;
          }
        }
      }
    }

    // 3. INTENTAR ASIGNAR AL PRIMER PUESTO COMPATIBLE EN LA LÍNEA SOLICITADA
    for (let puesto of puestosVariosVacios) {
      const compatibilidad = evaluarCompatibilidadPuesto(worker, puesto);
      if (compatibilidad === true) {
        // Asignación Exitosa!
        setPuestos(prev => prev.map(p => {
          if (p.idPuesto === puesto.idPuesto) {
            return {
              ...p,
              idWorkerAsignado: worker.idWorker,
              timer: 120, // Reset temporizador
              rotacionIniciada: false
            };
          }
          return p;
        }));

        setWorkers(prev => prev.map(w => {
          if (w.idWorker === worker.idWorker) {
            return {
              ...w,
              estadoActual: 'ASIGNADO',
              lineaActualId: lineaId,
              lineaDestinoId: null,
              puestoActualId: puesto.idPuesto
            };
          }
          return w;
        }));

        // Limpiar alertas de tránsito antiguas si las hay
        setAlerts(prev => prev.filter(a => !(a.workerId === worker.idWorker && a.type === 'transito')));

        setQrSuccess(`Asignación EXITOSA: ${worker.nombre} asignado a ${puesto.nombreTarea}.`);
        addLog(`QR Escaneo: ${worker.nombre} asignado con éxito a ${puesto.nombreTarea} en la Línea ${lineaId}.`, 'success');
        return;
      } else {
        // Guardar el último error de compatibilidad por si no encuentra ningún puesto
        setQrError(`Incompatibilidad técnica: ${compatibilidad}`);
      }
    }
  };

  // Evalúa sexo, restricciones y regla de no repetición de ayer
  const evaluarCompatibilidadPuesto = (worker, puesto) => {
    // Filtro de Sexo
    if (puesto.sexoRequerido !== 'Indiferente' && worker.sexo !== puesto.sexoRequerido) {
      return `Puesto exclusivo para personal de sexo ${puesto.sexoRequerido}.`;
    }

    // Filtro de Restricciones Médicas
    if (worker.restriccionesMedicas && worker.restriccionesMedicas.length > 0) {
      const tieneRestriccion = puesto.restriccionesProhibidas.some(r => 
        worker.restriccionesMedicas.includes(r)
      );
      if (tieneRestriccion) {
        return `Restricción médica activa: El trabajador presenta constancia de ${worker.restriccionesMedicas.join(', ')}.`;
      }
    }

    // Filtro de Historial de No Repetición (última actividad del día anterior)
    if (worker.ultimaActividadAyer && worker.ultimaActividadAyer.toLowerCase().trim() === puesto.nombreTarea.toLowerCase().trim()) {
      return `Historial de No Repetición: El trabajador finalizó su jornada anterior en esta misma actividad (${puesto.nombreTarea}).`;
    }

    return true;
  };

  // Crear alerta de tránsito para un supervisor
  const crearAlertaEnTransito = (workerId, destinoLineaId) => {
    const worker = workers.find(w => w.idWorker === workerId);
    const linea = lines.find(l => l.idLinea === destinoLineaId);
    
    const nuevaAlerta = {
      id: `ALERTA_TRANSITO_${workerId}_${Date.now()}`,
      type: 'transito',
      title: `TRABAJADOR EN TRÁNSITO`,
      message: `${worker.nombre} (${worker.rol}) ha sido redirigido a ${linea.nombre}. Por favor, escanee su QR al llegar.`,
      workerId,
      lineaDestinoId: destinoLineaId
    };

    setAlerts(prev => [nuevaAlerta, ...prev]);
  };

  // --- MOTOR DE ROTACIÓN AUTOMÁTICA Y APROBACIÓN DE L8 (FASE 4) ---
  const triggerRotacionAutomatica = (puestoId, lineaId) => {
    const puesto = puestos.find(p => p.idPuesto === puestoId);
    const workerSaliente = workers.find(w => w.idWorker === puesto.idWorkerAsignado);
    if (!workerSaliente) return;

    addLog(`Temporizador vencido en ${puesto.nombreTarea} (Línea ${lineaId}). Iniciando búsqueda de relevo.`, 'warning');

    // 1. BUSCAR EN LÍNEA 8 (BOLSON) UN REEMPLAZO CALIFICADO Y DISPONIBLE
    // Reemplazos de L8 que estén DISPONIBLE_BOLSON y sean compatibles con las restricciones del puesto
    const candidatosL8 = workers.filter(w => 
      w.lineaActualId === 'L8' && 
      w.estadoActual === 'DISPONIBLE_BOLSON' &&
      evaluarCompatibilidadPuesto(w, puesto) === true
    );

    if (candidatosL8.length === 0) {
      addLog(`Alerta de Rotación fallida: No se encontraron operarios compatibles disponibles en la Línea 8 para relevar ${puesto.nombreTarea}.`, 'error');
      // Extendemos un poco el tiempo para volver a intentar
      setPuestos(prev => prev.map(p => {
        if (p.idPuesto === puestoId) {
          return { ...p, timer: 30, rotacionIniciada: false };
        }
        return p;
      }));
      return;
    }

    // Seleccionamos al primer candidato idóneo
    const relevo = candidatosL8[0];

    // 2. GENERAR ALERTA DE APROBACIÓN PARA EL SUPERVISOR DE LA LÍNEA 8
    const alertaRotacion = {
      id: `ALERTA_ROT_${puestoId}_${relevo.idWorker}_${Date.now()}`,
      type: 'solicitud_rotacion',
      title: `SOLICITUD DE RELEVO (L8 -> ${lineaId})`,
      message: `La línea prioritaria ${lines.find(l => l.idLinea === lineaId).nombre} solicita a ${relevo.nombre} para cubrir el puesto ${puesto.nombreTarea}.`,
      workerSalienteId: workerSaliente.idWorker,
      workerEntranteId: relevo.idWorker,
      puestoId,
      lineaPrioId: lineaId,
      lineaL8Id: 'L8'
    };

    setAlerts(prev => [alertaRotacion, ...prev]);
    addLog(`Solicitud de despacho enviada al Supervisor de la Línea 8 para el operario ${relevo.nombre}.`, 'info');
  };

  // Supervisor de L8 aprueba el despacho del operario
  const handleAprobarDespachoL8 = (alerta) => {
    // 1. Cambiar estado del trabajador entrante a "EN_TRANSITO"
    setWorkers(prev => prev.map(w => {
      if (w.idWorker === alerta.workerEntranteId) {
        return {
          ...w,
          estadoActual: 'EN_TRANSITO',
          lineaActualId: null,
          lineaDestinoId: alerta.lineaPrioId,
          puestoActualId: null
        };
      }
      return w;
    }));

    // 2. Remover al trabajador entrante de su puesto en la Línea 8 (Bolsón)
    setPuestos(prev => prev.map(p => {
      if (p.idWorkerAsignado === alerta.workerEntranteId && p.idLinea === 'L8') {
        return { ...p, idWorkerAsignado: null };
      }
      return p;
    }));

    // 3. Modificar la alerta para el supervisor de la línea prioritaria esperando su llegada
    const workerEntrante = workers.find(w => w.idWorker === alerta.workerEntranteId);
    const lineaPrio = lines.find(l => l.idLinea === alerta.lineaPrioId);

    const alertaDestino = {
      id: `ALERTA_RECEPCION_${alerta.puestoId}_${Date.now()}`,
      type: 'esperando_recepcion',
      title: `ESPERANDO RELEVISTA`,
      message: `El supervisor de L8 despachó a ${workerEntrante.nombre}. Escanee su QR al llegar para concretar la rotación e intercambiar con el saliente.`,
      workerSalienteId: alerta.workerSalienteId,
      workerEntranteId: alerta.workerEntranteId,
      puestoId: alerta.puestoId,
      lineaPrioId: alerta.lineaPrioId
    };

    // Eliminar la alerta de aprobación de L8 y añadir la de recepción de la prioritaria
    setAlerts(prev => prev.filter(a => a.id !== alerta.id).concat(alertaDestino));
    addLog(`Supervisor de L8 APROBÓ despacho. ${workerEntrante.nombre} está EN TRÁNSITO hacia ${lineaPrio.nombre}.`, 'success');
  };

  // Simular la llegada y escaneo QR del relevista en la línea prioritaria
  const handleCompletarRotacion = (alerta) => {
    const workerEntrante = workers.find(w => w.idWorker === alerta.workerEntranteId);
    const workerSaliente = workers.find(w => w.idWorker === alerta.workerSalienteId);
    const puestoPrio = puestos.find(p => p.idPuesto === alerta.puestoId);

    if (!workerEntrante || !workerSaliente || !puestoPrio) return;

    // 1. Asignar al nuevo operario en el puesto prioritario
    setPuestos(prev => prev.map(p => {
      if (p.idPuesto === alerta.puestoId) {
        return {
          ...p,
          idWorkerAsignado: workerEntrante.idWorker,
          timer: 120, // Reiniciar temporizador
          rotacionIniciada: false
        };
      }
      return p;
    }));

    // Actualizar estado del entrante
    setWorkers(prev => prev.map(w => {
      if (w.idWorker === workerEntrante.idWorker) {
        return {
          ...w,
          estadoActual: 'ASIGNADO',
          lineaActualId: alerta.lineaPrioId,
          lineaDestinoId: null,
          puestoActualId: alerta.puestoId
        };
      }
      return w;
    }));

    // 2. ALGORITMO DE REDISTRIBUCIÓN EN CASCADA PARA EL TRABAJADOR SALIENTE (RELEVADO)
    // El operario relevado no va directo a la Línea 8, busca vacantes por orden de prioridad estricta
    const ordenPrio = ['L4', 'L1', 'L2', 'L6', 'L7', 'L5', 'L3', 'L8', 'L9', 'L10'];
    let vacanteEncontrada = false;
    let lineaDestinoId = 'L8'; // Fallback a Línea 8 (Bolsón)

    // Buscar en todas las líneas (menos la Línea 8 que siempre recibe) por prioridad vacantes de puestos varios
    for (let lineaId of ordenPrio) {
      if (lineaId === 'L8') continue; // L8 se trata al final si no hay de prioridad superior

      const linea = lines.find(l => l.idLinea === lineaId);
      if (linea && linea.estado === 'Operando') {
        const puestosVacios = puestos.filter(p => p.idLinea === lineaId && p.tipo === 'Vario' && !p.idWorkerAsignado);
        
        // Buscar un puesto vacío en esta línea donde el operario saliente califique
        const puestoApto = puestosVacios.find(p => evaluarCompatibilidadPuesto(workerSaliente, p) === true);

        if (puestoApto) {
          // ¡Encontró vacante en línea prioritaria!
          vacanteEncontrada = true;
          lineaDestinoId = lineaId;
          
          // Poner al trabajador saliente en tránsito hacia esa línea prioritaria
          setWorkers(prev => prev.map(w => {
            if (w.idWorker === workerSaliente.idWorker) {
              return {
                ...w,
                estadoActual: 'EN_TRANSITO',
                lineaActualId: null,
                lineaDestinoId: lineaId,
                puestoActualId: null
              };
            }
            return w;
          }));

          // Crear alerta de tránsito para el supervisor de esa línea
          crearAlertaEnTransito(workerSaliente.idWorker, lineaId);
          addLog(`Redistribución en Cascada: Relevado ${workerSaliente.nombre} redirigido a ${linea.nombre} (Vacante disponible).`, 'success');
          break;
        }
      }
    }

    if (!vacanteEncontrada) {
      // Si no hay vacantes en ninguna línea, regresa a Línea 8
      setWorkers(prev => prev.map(w => {
        if (w.idWorker === workerSaliente.idWorker) {
          return {
            ...w,
            estadoActual: 'DISPONIBLE_BOLSON',
            lineaActualId: 'L8',
            lineaDestinoId: null,
            puestoActualId: null
          };
        }
        return w;
      }));

      // Asignarlo a un puesto de ensamble vacío en la Línea 8
      setPuestos(prev => {
        const puestosL8Vacios = prev.filter(p => p.idLinea === 'L8' && !p.idWorkerAsignado);
        if (puestosL8Vacios.length > 0) {
          return prev.map(p => {
            if (p.idPuesto === puestosL8Vacios[0].idPuesto) {
              return { ...p, idWorkerAsignado: workerSaliente.idWorker };
            }
            return p;
          });
        }
        return prev;
      });

      addLog(`Redistribución en Cascada: Relevado ${workerSaliente.nombre} regresa a Línea 8 (Bolsón) al no haber vacantes en planta.`, 'info');
    }

    // Remover la alerta de recepción
    setAlerts(prev => prev.filter(a => a.id !== alerta.id));
    addLog(`Rotación COMPLETADA: ${workerEntrante.nombre} ya opera en ${puestoPrio.nombreTarea}.`, 'success');
  };

  // --- PROTOCOLO DE REINCORPORACIÓN DESDE BAJA_TEMPORAL (FASE 6) ---
  const handleReincorporarTrabajador = (workerId) => {
    const worker = workers.find(w => w.idWorker === workerId);
    if (!worker || worker.estadoActual !== 'BAJA_TEMPORAL') return;

    addLog(`Iniciando reincorporación de ${worker.nombre} (${worker.rol}).`, 'info');

    if (worker.rol === 'Operador A' || worker.rol === 'Averiero') {
      // --- CASO PUESTO FIJO ---
      // 1. Encontrar su puesto original (donde puesto.idWorkerOriginal === workerId)
      const puestoOriginal = puestos.find(p => p.idWorkerOriginal === workerId);
      
      if (puestoOriginal) {
        const reemplazoId = puestoOriginal.idWorkerAsignado;
        
        // Reasignar al titular en su puesto
        setPuestos(prev => prev.map(p => {
          if (p.idPuesto === puestoOriginal.idPuesto) {
            return { ...p, idWorkerAsignado: workerId };
          }
          return p;
        }));

        setWorkers(prev => prev.map(w => {
          if (w.idWorker === workerId) {
            return {
              ...w,
              estadoActual: 'ASIGNADO',
              lineaActualId: puestoOriginal.idLinea,
              puestoActualId: puestoOriginal.idPuesto
            };
          }
          return w;
        }));

        addLog(`Puesto Fijo: Titular ${worker.nombre} reasume su puesto original en ${puestoOriginal.nombreTarea}.`, 'success');

        // 2. Si había un reemplazo, liberarlo y ejecutar la redistribución en cascada por prioridad
        if (reemplazoId && reemplazoId !== workerId) {
          const reemplazo = workers.find(w => w.idWorker === reemplazoId);
          addLog(`Desalojando reemplazo temporal ${reemplazo.nombre}. Buscando vacante en planta...`, 'warning');

          const ordenPrio = ['L4', 'L1', 'L2', 'L6', 'L7', 'L5', 'L3', 'L8', 'L9', 'L10'];
          let vacanteEncontrada = false;
          
          for (let lineaId of ordenPrio) {
            if (lineaId === 'L8') continue;
            
            const linea = lines.find(l => l.idLinea === lineaId);
            if (linea && linea.estado === 'Operando') {
              const puestosVacios = puestos.filter(p => p.idLinea === lineaId && p.tipo === 'Vario' && !p.idWorkerAsignado);
              const puestoApto = puestosVacios.find(p => evaluarCompatibilidadPuesto(reemplazo, p) === true);

              if (puestoApto) {
                vacanteEncontrada = true;
                
                // Redirigir reemplazo en tránsito a esa línea
                setWorkers(prev => prev.map(w => {
                  if (w.idWorker === reemplazoId) {
                    return {
                      ...w,
                      estadoActual: 'EN_TRANSITO',
                      lineaActualId: null,
                      lineaDestinoId: lineaId,
                      puestoActualId: null
                    };
                  }
                  return w;
                }));

                crearAlertaEnTransito(reemplazoId, lineaId);
                addLog(`Redistribución: Reemplazo ${reemplazo.nombre} redirigido en tránsito a ${linea.nombre} (Vacante disponible).`, 'success');
                break;
              }
            }
          }

          if (!vacanteEncontrada) {
            // Regresa a la Línea 8
            setWorkers(prev => prev.map(w => {
              if (w.idWorker === reemplazoId) {
                return {
                  ...w,
                  estadoActual: 'DISPONIBLE_BOLSON',
                  lineaActualId: 'L8',
                  lineaDestinoId: null,
                  puestoActualId: null
                };
              }
              return w;
            }));

            setPuestos(prev => {
              const puestosL8Vacios = prev.filter(p => p.idLinea === 'L8' && !p.idWorkerAsignado);
              if (puestosL8Vacios.length > 0) {
                return prev.map(p => {
                  if (p.idPuesto === puestosL8Vacios[0].idPuesto) {
                    return { ...p, idWorkerAsignado: reemplazoId };
                  }
                  return p;
                });
              }
              return prev;
            });
            addLog(`Redistribución: Reemplazo ${reemplazo.nombre} enviado a la Línea 8 (Bolsón) por falta de vacantes prioritarias.`, 'info');
          }
        }
      } else {
        // Fallback si no tiene asignación original guardada
        setWorkers(prev => prev.map(w => {
          if (w.idWorker === workerId) return { ...w, estadoActual: 'POOL_ARRANQUE' };
          return w;
        }));
        addLog(`Trabajador técnico ${worker.nombre} ingresado al Pool de Arranque.`, 'info');
      }

    } else {
      // --- CASO PUESTO VARIO ---
      // Envía directamente a la Línea 8 en estado DISPONIBLE_BOLSON
      setWorkers(prev => prev.map(w => {
        if (w.idWorker === workerId) {
          return {
            ...w,
            estadoActual: 'DISPONIBLE_BOLSON',
            lineaActualId: 'L8',
            puestoActualId: null
          };
        }
        return w;
      }));

      setPuestos(prev => {
        const puestosL8Vacios = prev.filter(p => p.idLinea === 'L8' && !p.idWorkerAsignado);
        if (puestosL8Vacios.length > 0) {
          return prev.map(p => {
            if (p.idPuesto === puestosL8Vacios[0].idPuesto) {
              return { ...p, idWorkerAsignado: workerId };
            }
            return p;
          });
        }
        return prev;
      });

      addLog(`Puesto Vario: ${worker.nombre} enviado directamente a Línea 8 (Bolsón) en estado DISPONIBLE.`, 'success');
    }
  };

  // --- PAROS POR PREPARACIÓN DE EQUIPOS (FASE 5) ---
  const handleActivarPreparacion = (lineaId) => {
    // 1. Cambiar estado de la línea a "En Preparación"
    setLines(prev => prev.map(l => {
      if (l.idLinea === lineaId) return { ...l, estado: 'En Preparación' };
      return l;
    }));

    // 2. Liberar puestos varios de esa línea y mandarlos en tránsito a la Línea 8 (Bolsón)
    const puestosDeLinea = puestos.filter(p => p.idLinea === lineaId);
    
    // Los Operadores A se quedan en la máquina (puestos fijos se mantienen asignados)
    // Los puestos varios se desalojan
    const idsDesalojados = [];
    setPuestos(prev => prev.map(p => {
      if (p.idLinea === lineaId && p.tipo === 'Vario' && p.idWorkerAsignado) {
        idsDesalojados.push(p.idWorkerAsignado);
        return { ...p, idWorkerAsignado: null, timer: 120, rotacionIniciada: false };
      }
      return p;
    }));

    // Actualizar estado de operarios desalojados
    setWorkers(prev => prev.map(w => {
      if (idsDesalojados.includes(w.idWorker)) {
        return {
          ...w,
          estadoActual: 'EN_TRANSITO',
          lineaActualId: null,
          lineaDestinoId: 'L8',
          puestoActualId: null
        };
      }
      return w;
    }));

    // Generar alertas de tránsito hacia la Línea 8 para que su supervisor los reciba
    idsDesalojados.forEach(id => {
      crearAlertaEnTransito(id, 'L8');
    });

    addLog(`Línea ${lineaId} entra EN PREPARACIÓN. Operadores A se quedan a punto. Puestos Varios desalojados en tránsito a L8.`, 'warning');
  };

  // Restablecer la línea a Operando
  const handleRestablecerLinea = (lineaId) => {
    setLines(prev => prev.map(l => {
      if (l.idLinea === lineaId) return { ...l, estado: 'Operando' };
      return l;
    }));
    addLog(`Línea ${lineaId} restablecida a OPERANDO. Puestos Varios listos para asignación.`, 'success');
  };

  // --- MOCK DE INGESTA DE GOOGLE SHEETS DESDE LA UI ---
  const simularCargaGoogleSheets = () => {
    handleIniciarTurno();
    setShowSheetsModal(false);
  };

  return (
    <div className="app-container">
      {/* HEADER DE LA APLICACIÓN */}
      <header className="app-header">
        <div className="brand-section">
          <Activity className="brand-icon" size={28} />
          <h1 className="brand-title">SmartAssign</h1>
          <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '4px', backgroundColor: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)' }}>
            v1.0 (Planta de Producción)
          </span>
        </div>

        {turnoIniciado && (
          <div className="global-stats">
            <div className="stat-item">
              <span className="stat-val">{workers.filter(w => w.estadoActual === 'POOL_ARRANQUE').length}</span>
              <span className="stat-label">Pool de Arranque</span>
            </div>
            <div className="stat-item">
              <span className="stat-val">{workers.filter(w => w.estadoActual === 'ASIGNADO').length}</span>
              <span className="stat-label">Personal Asignado</span>
            </div>
            <div className="stat-item">
              <span className="stat-val">{workers.filter(w => w.estadoActual === 'DISPONIBLE_BOLSON').length}</span>
              <span className="stat-label">Bolsón (L8)</span>
            </div>
            <div className="stat-item">
              <span className="stat-val" style={{ color: 'var(--color-warning)' }}>
                {workers.filter(w => w.estadoActual === 'EN_TRANSITO').length}
              </span>
              <span className="stat-label">En Tránsito</span>
            </div>
            <div className="stat-item">
              <span className="stat-val" style={{ color: 'var(--color-error)' }}>
                {workers.filter(w => w.estadoActual === 'BAJA_TEMPORAL').length}
              </span>
              <span className="stat-label">Bajas Medicas</span>
            </div>
          </div>
        )}
      </header>

      {/* CUERPO PRINCIPAL */}
      <div className="main-layout">
        
        {/* SIDEBAR DE CONTROL */}
        <aside className="sidebar">
          <div className="nav-links">
            <button 
              className={`nav-btn ${activeTab === 'coordinador' ? 'active' : ''}`}
              onClick={() => setActiveTab('coordinador')}
            >
              <Users size={18} />
              Panel Coordinador
            </button>
            <button 
              className={`nav-btn ${activeTab === 'supervisor' ? 'active' : ''}`}
              onClick={() => setActiveTab('supervisor')}
              disabled={!turnoIniciado}
            >
              <QrCode size={18} />
              Panel Supervisor
            </button>
          </div>

          {/* SIMULADOR DE TIEMPO ACELERADO */}
          <div className="simulator-panel">
            <div className="sim-title">
              <Settings size={12} />
              Simulador de Tiempo
            </div>
            <div className="sim-time">
              {String(simTime.hour).padStart(2, '0')}:
              {String(simTime.minute).padStart(2, '0')}:
              {String(simTime.second).padStart(2, '0')}
            </div>
            <div className="sim-controls">
              <button 
                className="sim-btn" 
                onClick={() => setSimSpeed(0)}
                style={{ color: simSpeed === 0 ? 'var(--color-error)' : 'inherit' }}
              >
                <Pause size={12} />
                Pausa
              </button>
              <button 
                className="sim-btn" 
                onClick={() => setSimSpeed(1)}
                style={{ color: simSpeed === 1 ? 'var(--color-success)' : 'inherit' }}
              >
                <Play size={12} />
                1x
              </button>
              <button 
                className="sim-btn" 
                onClick={() => setSimSpeed(20)}
                style={{ color: simSpeed === 20 ? 'var(--color-warning)' : 'inherit' }}
              >
                <FastForward size={12} />
                20x
              </button>
            </div>
            {turnoIniciado && (
              <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginTop: '8px', textAlign: 'center' }}>
                Temporizadores acelerados para pruebas (2 min / puesto)
              </div>
            )}
          </div>
        </aside>

        {/* CONTENIDO INTERACTIVO */}
        <main className="content-area">
          
          {!turnoIniciado ? (
            /* PANTALLA INICIAL SIN TURNO */
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', textAlign: 'center' }}>
              <Activity size={64} style={{ color: 'var(--color-primary)', marginBottom: '1.5rem', opacity: 0.8 }} />
              <h2 style={{ fontSize: '2rem', marginBottom: '1rem', fontFamily: 'var(--font-display)' }}>SmartAssign Real-Time</h2>
              <p style={{ color: 'var(--text-secondary)', maxWidth: '480px', marginBottom: '2rem' }}>
                Sistema reactivo de gestión de personal, asignación de puestos y rotaciones automáticas en tiempo real para plantas industriales de alta cadencia.
              </p>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <button className="btn btn-secondary" onClick={() => setShowSheetsModal(true)}>
                  Cargar Google Sheets
                </button>
                <button className="btn btn-primary" onClick={handleIniciarTurno}>
                  Iniciar Turno Directo (Simulado)
                </button>
              </div>
            </div>
          ) : (
            
            /* TABS PRINCIPALES (COORDINADOR / SUPERVISOR) */
            <>
              {activeTab === 'coordinador' && (
                <div className="coordinator-grid">
                  
                  {/* COLUMNA IZQUIERDA: LINEAS DE PRODUCCION Y MONITOREO */}
                  <div>
                    <h2 style={{ fontSize: '1.25rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Activity size={20} style={{ color: 'var(--color-primary)' }} />
                      Monitoreo de Líneas de Producción
                    </h2>

                    <div className="lines-grid">
                      {lines.map(l => {
                        const puestosDeLinea = puestos.filter(p => p.idLinea === l.idLinea);
                        const cubiertos = puestosDeLinea.filter(p => p.idWorkerAsignado).length;
                        const requeridos = puestosDeLinea.length;
                        const pct = requeridos > 0 ? (cubiertos / requeridos) * 100 : 0;
                        const esPrio = l.prioridad <= 3; // L4, L1, L2 son prioritarias

                        return (
                          <div 
                            key={l.idLinea} 
                            className={`glass-panel line-card ${esPrio ? 'high-priority' : ''} ${l.estado === 'En Preparación' ? 'prep' : ''}`}
                          >
                            <div className="line-header">
                              <div>
                                <h3 style={{ fontSize: '0.95rem' }}>{l.nombre}</h3>
                                <span className="line-sku">{l.skuActual}</span>
                              </div>
                              <span className="line-prio">
                                {esPrio ? `PRIO ${l.prioridad}` : `Prio ${l.prioridad}`}
                              </span>
                            </div>

                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                              Estado: <span style={{ color: l.estado === 'En Preparación' ? 'var(--color-warning)' : 'var(--color-success)', fontWeight: 600 }}>{l.estado}</span>
                            </div>

                            <div className="line-coverage">
                              <div className="coverage-bar">
                                <div 
                                  className={`coverage-fill ${pct === 100 ? 'complete' : pct < 50 ? 'warning' : ''}`} 
                                  style={{ width: `${pct}%` }}
                                ></div>
                              </div>
                              <div className="coverage-text">
                                <span>Cobertura</span>
                                <span>{cubiertos}/{requeridos} Puestos</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* EVENT FEED (LOG EN VIVO) */}
                    <div className="glass-panel" style={{ padding: '1.25rem', marginTop: '2rem' }}>
                      <h3 style={{ fontSize: '0.95rem', marginBottom: '0.75rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                        Bitácora de Eventos en Tiempo Real
                      </h3>
                      <div style={{ height: '180px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem', fontFamily: 'monospace', fontSize: '0.75rem' }}>
                        {logs.length === 0 ? (
                          <div style={{ color: 'var(--text-muted)', textAlign: 'center', marginTop: '3rem' }}>Esperando eventos del sistema...</div>
                        ) : (
                          logs.map((log, index) => (
                            <div key={index} style={{ color: log.type === 'success' ? 'var(--color-success)' : log.type === 'warning' ? 'var(--color-warning)' : log.type === 'error' ? 'var(--color-error)' : 'var(--text-secondary)' }}>
                              [{log.timestamp}] {log.message}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>

                  {/* COLUMNA DERECHA: BAJAS, REINCORPORACIONES Y POOL */}
                  <div className="side-panel">
                    
                    {/* ALERTAS ACTIVAS DEL SISTEMA */}
                    <div className="glass-panel" style={{ padding: '1.25rem' }}>
                      <div className="panel-header">
                        <span className="panel-title">Notificaciones de Planta</span>
                        <span style={{ fontSize: '0.7rem', padding: '2px 6px', backgroundColor: 'rgba(239, 68, 68, 0.1)', color: 'var(--color-error)', borderRadius: '4px', fontWeight: 600 }}>
                          {alerts.length} ALERTAS
                        </span>
                      </div>
                      
                      <div className="alerts-list">
                        {alerts.length === 0 ? (
                          <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                            <CheckCircle size={24} style={{ color: 'var(--color-success)', marginBottom: '0.5rem', opacity: 0.5 }} />
                            <div>Planta balanceada. Sin alertas de rotación.</div>
                          </div>
                        ) : (
                          alerts.map(a => (
                            <div key={a.id} className={`alert-card ${a.type === 'solicitud_rotacion' ? 'warning' : ''}`}>
                              <div className="alert-header">
                                <span>{a.title}</span>
                                <AlertTriangle size={14} style={{ color: 'var(--color-warning)' }} />
                              </div>
                              <div className="alert-body">{a.message}</div>
                              
                              <div className="alert-actions">
                                {a.type === 'solicitud_rotacion' ? (
                                  <>
                                    <button className="action-btn approve" onClick={() => handleAprobarDespachoL8(a)}>
                                      Aprobar Despacho
                                    </button>
                                    <button className="action-btn reject" onClick={() => setAlerts(prev => prev.filter(x => x.id !== a.id))}>
                                      Rechazar
                                    </button>
                                  </>
                                ) : a.type === 'esperando_recepcion' ? (
                                  <button className="action-btn approve" onClick={() => handleCompletarRotacion(a)}>
                                    Simular Escaneo al Llegar
                                  </button>
                                ) : (
                                  <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>Esperando escaneo QR...</span>
                                )}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* REINCORPORACIONES (BAJA TEMPORAL) */}
                    <div className="glass-panel" style={{ padding: '1.25rem' }}>
                      <div className="panel-header">
                        <span className="panel-title">Altas / Bajas Médicas</span>
                      </div>
                      
                      <div className="worker-list">
                        {workers.filter(w => w.estadoActual === 'BAJA_TEMPORAL').length === 0 ? (
                          <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                            Sin personal con licencia médica hoy.
                          </div>
                        ) : (
                          workers.filter(w => w.estadoActual === 'BAJA_TEMPORAL').map(w => (
                            <div key={w.idWorker} className="worker-item">
                              <div className="worker-info">
                                <span className="worker-name">{w.nombre}</span>
                                <span className="worker-sub" style={{ color: 'var(--color-error)' }}>{w.rol} ({w.restriccionesMedicas.join(', ') || 'Licencia'})</span>
                              </div>
                              <button 
                                className="btn btn-secondary" 
                                style={{ padding: '4px 8px', fontSize: '0.75rem', color: 'var(--color-success)', borderColor: 'rgba(16, 185, 129, 0.2)' }}
                                onClick={() => handleReincorporarTrabajador(w.idWorker)}
                              >
                                Reincorporar
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* POOL DE ARRANQUE (SALA DE ESPERA) */}
                    <div className="glass-panel" style={{ padding: '1.25rem' }}>
                      <div className="panel-header">
                        <span className="panel-title">Pool de Arranque ({workers.filter(w => w.estadoActual === 'POOL_ARRANQUE').length})</span>
                      </div>
                      
                      <div className="worker-list" style={{ maxHeight: '200px' }}>
                        {workers.filter(w => w.estadoActual === 'POOL_ARRANQUE').length === 0 ? (
                          <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                            Pool de arranque vacío. Todo el personal distribuido.
                          </div>
                        ) : (
                          workers.filter(w => w.estadoActual === 'POOL_ARRANQUE').map(w => (
                            <div key={w.idWorker} className="worker-item">
                              <div className="worker-info">
                                <span className="worker-name">{w.nombre}</span>
                                <span className="worker-sub">{w.rol} • {w.sexo}</span>
                              </div>
                              <span className="badge badge-pool" style={{ fontSize: '0.6rem' }}>Huella</span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                  </div>
                </div>
              )}

              {activeTab === 'supervisor' && (
                <div className="supervisor-view">
                  
                  {/* SELECTOR DE LINEAS (PARA EL PROTOTIPO SIMULADO) */}
                  <div className="lines-selector">
                    <h3 style={{ fontSize: '0.85rem', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '0.75rem', paddingLeft: '0.5rem' }}>
                      Vista de Supervisor
                    </h3>
                    {lines.map(l => {
                      const alertasDeLinea = alerts.filter(a => a.lineaDestinoId === l.idLinea || a.lineaPrioId === l.idLinea || (l.idLinea === 'L8' && a.type === 'solicitud_rotacion'));
                      return (
                        <button
                          key={l.idLinea}
                          className={`line-select-btn ${selectedLineId === l.idLinea ? 'active' : ''}`}
                          onClick={() => {
                            setSelectedLineId(l.idLinea);
                            setQrError('');
                            setQrSuccess('');
                            setQrWarning('');
                          }}
                        >
                          <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Activity size={14} />
                            {l.nombre}
                          </span>
                          {alertasDeLinea.length > 0 && (
                            <span style={{ width: '8px', height: '8px', borderRadius: '999px', backgroundColor: 'var(--color-warning)' }}></span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* VISTA EN DETALLE DE LA LÍNEA SELECCIONADA */}
                  <div className="line-detail-panel">
                    
                    {/* BARRA DE ESTADO DE LÍNEA */}
                    {lines.filter(l => l.idLinea === selectedLineId).map(linea => (
                      <div key={linea.idLinea} className="line-summary-bar glass-panel">
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <h2 style={{ fontSize: '1.25rem' }}>{linea.nombre}</h2>
                            {linea.idLinea === 'L8' ? (
                              <span className="badge badge-bolson">Pulmón de Planta</span>
                            ) : (
                              <span className="badge badge-asignado">Prioridad {linea.prioridad}</span>
                            )}
                          </div>
                          <span className="line-sku" style={{ margin: 0 }}>SKU: {linea.skuActual}</span>
                        </div>

                        <div style={{ display: 'flex', gap: '1rem' }}>
                          {linea.estado === 'Operando' ? (
                            <button className="btn btn-danger" style={{ padding: '0.5rem 1rem' }} onClick={() => handleActivarPreparacion(linea.idLinea)}>
                              Modo "En Preparación" (Paro)
                            </button>
                          ) : (
                            <button className="btn btn-primary" style={{ padding: '0.5rem 1rem', backgroundColor: 'var(--color-success)' }} onClick={() => handleRestablecerLinea(linea.idLinea)}>
                              Restablecer Operación
                            </button>
                          )}
                          <button className="btn btn-primary" style={{ padding: '0.5rem 1rem' }} onClick={() => setShowQrModal(true)}>
                            Escaneo QR Móvil
                          </button>
                        </div>
                      </div>
                    ))}

                    {/* ALERTAS ESPECÍFICAS DE ESTA LÍNEA */}
                    {alerts.filter(a => a.lineaDestinoId === selectedLineId || a.lineaPrioId === selectedLineId || (selectedLineId === 'L8' && a.type === 'solicitud_rotacion')).map(alerta => (
                      <div key={alerta.id} className="alert-card warning glass-panel" style={{ padding: '1rem' }}>
                        <div className="alert-header">
                          <span>{alerta.title}</span>
                          <AlertTriangle size={18} style={{ color: 'var(--color-warning)' }} />
                        </div>
                        <div className="alert-body" style={{ margin: '0.5rem 0' }}>{alerta.message}</div>
                        <div className="alert-actions">
                          {alerta.type === 'solicitud_rotacion' && selectedLineId === 'L8' && (
                            <>
                              <button className="action-btn approve" onClick={() => handleAprobarDespachoL8(alerta)}>
                                Aprobar y Despachar a {workers.find(w => w.idWorker === alerta.workerEntranteId).nombre}
                              </button>
                              <button className="action-btn reject" onClick={() => setAlerts(prev => prev.filter(a => a.id !== alerta.id))}>
                                Rechazar
                              </button>
                            </>
                          )}
                          {alerta.type === 'esperando_recepcion' && selectedLineId === alerta.lineaPrioId && (
                            <button className="action-btn approve" onClick={() => handleCompletarRotacion(alerta)}>
                              Registrar Llegada (Escanear QR de Relevista)
                            </button>
                          )}
                          {alerta.type === 'transito' && selectedLineId === alerta.lineaDestinoId && (
                            <button className="action-btn approve" onClick={() => handleEscanearQR(alerta.workerId, selectedLineId)}>
                              Registrar Entrada del Trabajador
                            </button>
                          )}
                        </div>
                      </div>
                    ))}

                    {/* GRID DE PUESTOS */}
                    <div className="puestos-container">
                      {puestos.filter(p => p.idLinea === selectedLineId).map(puesto => {
                        const worker = workers.find(w => w.idWorker === puesto.idWorkerAsignado);
                        const isFijo = puesto.tipo === 'Fijo';

                        return (
                          <div key={puesto.idPuesto} className="puesto-card glass-panel">
                            <div className="puesto-header">
                              <span className="puesto-title">{puesto.nombreTarea}</span>
                              <span className={`puesto-tipo ${puesto.tipo === 'Fijo' ? 'fijo' : ''}`}>
                                {puesto.tipo}
                              </span>
                            </div>

                            {worker ? (
                              <div className="puesto-worker assigned">
                                <div style={{ width: '8px', height: '8px', borderRadius: '999px', backgroundColor: 'var(--color-success)' }}></div>
                                <div className="worker-info">
                                  <span className="worker-name">{worker.nombre}</span>
                                  <span className="worker-sub">{worker.rol}</span>
                                </div>
                              </div>
                            ) : (
                              <div className="puesto-worker" style={{ color: 'var(--text-muted)', justifyContent: 'center' }}>
                                Vacante disponible
                              </div>
                            )}

                            {!isFijo && worker && (
                              <div className="puesto-timer">
                                <span>Relevo en:</span>
                                <span className={puesto.timer <= 30 ? 'timer-running' : ''}>
                                  {Math.floor(puesto.timer / 60)}:
                                  {String(puesto.timer % 60).padStart(2, '0')} min
                                </span>
                              </div>
                            )}

                            {isFijo && (
                              <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <CheckCircle size={10} style={{ color: 'var(--color-primary)' }} />
                                Puesto técnico congelado
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                  </div>
                </div>
              )}
            </>
          )}

        </main>
      </div>

      {/* --- MODAL PARA ESCANEO QR SIMULADO --- */}
      {showQrModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3 style={{ fontSize: '1.15rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <QrCode size={20} style={{ color: 'var(--color-primary)' }} />
              Escáner QR del Supervisor
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
              Simula el escaneo del código QR de un trabajador que ha llegado a la <strong>{lines.find(l => l.idLinea === selectedLineId).nombre}</strong>.
            </p>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                Selecciona al Trabajador en Sala de Espera / Tránsito:
              </label>
              <select
                style={{ width: '100%', padding: '0.6rem', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: '#fff', fontSize: '0.85rem' }}
                value={selectedWorkerQR}
                onChange={(e) => {
                  setSelectedWorkerQR(e.target.value);
                  setQrError('');
                  setQrSuccess('');
                  setQrWarning('');
                }}
              >
                <option value="">-- Elegir trabajador --</option>
                <optgroup label="Pool de Arranque (Registrados por Huella)">
                  {workers.filter(w => w.estadoActual === 'POOL_ARRANQUE').map(w => (
                    <option key={w.idWorker} value={w.idWorker}>{w.nombre} ({w.rol})</option>
                  ))}
                </optgroup>
                <optgroup label="Trabajadores en Tránsito a esta Línea">
                  {workers.filter(w => w.estadoActual === 'EN_TRANSITO' && w.lineaDestinoId === selectedLineId).map(w => (
                    <option key={w.idWorker} value={w.idWorker}>{w.nombre} ({w.rol})</option>
                  ))}
                </optgroup>
                <optgroup label="Otros en Tránsito General / Sala de Espera">
                  {workers.filter(w => w.estadoActual === 'EN_TRANSITO' && w.lineaDestinoId !== selectedLineId).map(w => (
                    <option key={w.idWorker} value={w.idWorker}>{`${w.nombre} (${w.rol}) ➜ Dir. a L${w.lineaDestinoId}`}</option>
                  ))}
                </optgroup>
                <optgroup label="Disponibles en Línea 8 (Bolsón)">
                  {workers.filter(w => w.estadoActual === 'DISPONIBLE_BOLSON').map(w => (
                    <option key={w.idWorker} value={w.idWorker}>{w.nombre} ({w.rol}) - L8</option>
                  ))}
                </optgroup>
              </select>
            </div>

            {qrError && (
              <div style={{ padding: '0.75rem', backgroundColor: 'var(--color-error-bg)', color: 'var(--color-error)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '6px', fontSize: '0.8rem', display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '1rem' }}>
                <AlertCircle size={16} />
                <span>{qrError}</span>
              </div>
            )}

            {qrWarning && (
              <div style={{ padding: '0.75rem', backgroundColor: 'var(--color-warning-bg)', color: 'var(--color-warning)', border: '1px solid rgba(245, 158, 11, 0.2)', borderRadius: '6px', fontSize: '0.8rem', display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '1rem' }}>
                <AlertTriangle size={16} />
                <span>{qrWarning}</span>
              </div>
            )}

            {qrSuccess && (
              <div style={{ padding: '0.75rem', backgroundColor: 'var(--color-success-bg)', color: 'var(--color-success)', border: '1px solid rgba(16, 185, 129, 0.2)', borderRadius: '6px', fontSize: '0.8rem', display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '1rem' }}>
                <CheckCircle size={16} />
                <span>{qrSuccess}</span>
              </div>
            )}

            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => {
                setShowQrModal(false);
                setSelectedWorkerQR('');
                setQrError('');
                setQrSuccess('');
                setQrWarning('');
              }}>
                Cerrar
              </button>
              <button 
                className="btn btn-primary" 
                disabled={!selectedWorkerQR}
                onClick={() => handleEscanearQR(selectedWorkerQR, selectedLineId)}
              >
                Escanear QR
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL PARA CARGAR GOOGLE SHEETS --- */}
      {showSheetsModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ width: '480px' }}>
            <h3 style={{ fontSize: '1.15rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Activity size={20} style={{ color: 'var(--color-primary)' }} />
              Ingesta desde Google Sheets
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
              Simula la descarga de datos del programa diario de producción.
            </p>

            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', backgroundColor: 'rgba(0,0,0,0.2)', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Hoja activa:</span>
                <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>Plan_Produccion_Hoy</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Líneas declaradas:</span>
                <span>10 líneas configuradas</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>SKUs identificados:</span>
                <span>SKU-PREMIUM-04, SKU-BEBIDA-01...</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Dotación técnica mínima:</span>
                <span>12 operarios congelados</span>
              </div>
            </div>

            <p style={{ fontSize: '0.8rem', color: 'var(--color-warning)', display: 'flex', gap: '4px', alignItems: 'center' }}>
              <AlertTriangle size={14} />
              Al importar, los técnicos fijos serán asignados automáticamente.
            </p>

            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowSheetsModal(false)}>
                Cancelar
              </button>
              <button className="btn btn-primary" onClick={simularCargaGoogleSheets}>
                Importar y Procesar
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default App;
