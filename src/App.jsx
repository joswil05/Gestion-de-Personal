import { useState, useEffect, useRef } from 'react';
import { 
  suscribirEstadoPlanta,
  firebaseInicializarTurno,
  firebaseEscanearQR,
  firebaseAprobarDespachoRotacion,
  firebaseCompletarRotacionYCascada,
  firebaseActivarPreparacion,
  firebaseRestablecerLinea,
  firebaseRegistrarBajaTemporal,
  firebaseTriggerRotacionAutomatica,
  firebaseRegistrarLlegadaDirectaL8,
  evaluarFiltrosCompatibilidad
} from './services/firebaseService';
import { 
  QrCode, 
  AlertTriangle, 
  CheckCircle, 
  AlertCircle,
  Play, 
  Camera,
  ChevronRight,
  Search,
  Zap,
  Clock,
  Check,
  UserX,
  RefreshCw,
  LogOut,
  X,
  ArrowLeft,
  Calendar,
  Layers
} from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import { Capacitor } from '@capacitor/core';
import { BarcodeScanner, BarcodeFormat } from '@capacitor-mlkit/barcode-scanning';
import './App.css';

const LINE_PRIORITY_ORDER = ['L4', 'L1', 'L2', 'L6', 'L7', 'L5', 'L3', 'L8', 'L9', 'L10'];

function App() {
  // --- ESTADOS SINCRONIZADOS DE BASE DE DATOS ---
  const [workers, setWorkers] = useState([]);
  const [lines, setLines] = useState([]);
  const [puestos, setPuestos] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [logs, setLogs] = useState([]);

  // --- NAVEGACIÓN, TURNOS Y DRAWERS ---
  const [viewMode, setViewMode] = useState('plant'); // 'plant' (Control de Planta), 'supervisor' (Gestión de Línea)
  const [selectedLineId, setSelectedLineId] = useState(null); // Línea seleccionada dinámicamente
  const [selectedShift, setSelectedShift] = useState('A'); // 'A' (Matutino), 'B' (Vespertino), 'C' (Nocturno)
  const [showShiftDrawer, setShowShiftDrawer] = useState(false); // Drawer de configuración de turnos

  // --- TIEMPO REAL OPERATIVO DE PLANTA ---
  const [currentTime, setCurrentTime] = useState(() => Date.now());

  // --- CAJÓN INTERACTIVO (BOTTOM DRAWER) DE ACCIONES DE PUESTO ---
  const [activeDrawerPuesto, setActiveDrawerPuesto] = useState(null); 
  const [showGeneralScanner, setShowGeneralScanner] = useState(false); 
  const [scannedWorker, setScannedWorker] = useState(null); 
  
  // --- BÚSQUEDAS Y CONTINGENCIA ---
  const [searchQuery, setSearchQuery] = useState('');
  const [qrError, setQrError] = useState('');
  const [qrSuccess, setQrSuccess] = useState('');
  const [qrWarning, setQrWarning] = useState('');
  const [usandoCamaraHardware, setUsandoCamaraHardware] = useState(false);
  const [showLogsConsole, setShowLogsConsole] = useState(false);

  const qrScannerRef = useRef(null);

  // --- CÁLCULO DE TIEMPO REAL RESTANTE (SANINIZADO) ---
  const getPuestoTimeRemaining = (p) => {
    if (!p.idWorkerAsignado || p.tipo === 'Fijo' || p.asignadoEnSegundoVirtual === null) return null;
    const asignado = p.asignadoEnSegundoVirtual < 1000000000000 ? currentTime : p.asignadoEnSegundoVirtual;
    const elapsedMs = currentTime - asignado;
    const elapsedSeconds = Math.floor(elapsedMs / 1000);
    const remaining = (p.maxHorasPermitidas * 3600) - elapsedSeconds;
    return Math.max(0, remaining);
  };

  const formatRemainingTime = (seconds) => {
    if (seconds === null || seconds === undefined) return '';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    
    if (h > 0) {
      return `${h}h ${m}m`;
    }
    return `${m}:${String(s).padStart(2, '0')} min`;
  };

  // --- CERRAR CAJÓN Y REINICIAR ---
  const closeDrawer = () => {
    setActiveDrawerPuesto(null);
    setShowGeneralScanner(false);
    setScannedWorker(null);
    setSearchQuery('');
    setQrError('');
    setQrSuccess('');
    setQrWarning('');
  };

  // --- GESTIÓN DE ACCIONES POR PUESTO ---
  const handlePuestoCardClick = (puesto) => {
    if (currentLine?.estado === 'En Preparación' && puesto.tipo === 'Vario' && !puesto.idWorkerAsignado) {
      alert("Operación bloqueada. La línea está en Preparación / Paro Activo. No se admiten asignaciones de puestos varios.");
      return;
    }
    const worker = workers.find(w => w.idWorker === puesto.idWorkerAsignado);
    if (worker) {
      setActiveDrawerPuesto({ puesto, worker, action: 'manage' });
    } else {
      setActiveDrawerPuesto({ puesto, action: 'assign' });
    }
  };

  // Asignar directo a un puesto específico
  const handleAsignarTrabajadorDirecto = async (workerId, puesto) => {
    setQrError('');
    setQrSuccess('');
    setQrWarning('');

    const workerObj = workers.find(w => w.idWorker === workerId);
    if (!workerObj) {
      setQrError("Ficha de nómina / QR no encontrado.");
      return;
    }

    // Validar restricciones en caliente antes de asignación directa
    const comp = evaluarFiltrosCompatibilidad(workerObj, puesto);
    if (comp !== true) {
      setQrError(`Restricción: ${comp}`);
      return;
    }

    try {
      const result = await firebaseEscanearQR(workerId, selectedLineId, Date.now());
      
      if (result.status === 'redirigido') {
        setQrWarning(result.msg);
        setTimeout(() => {
          closeDrawer();
        }, 3500);
      } else {
        setQrSuccess(`¡ASIGNACIÓN EXITOSA!`);
        setTimeout(() => {
          closeDrawer();
        }, 1200);
      }
    } catch (error) {
      setQrError(error.message);
    }
  };

  // Escaneo General (FAB): Carga al operario y espera elección de vacante
  const handleGeneralQrScanned = (workerId) => {
    setQrError('');
    setQrSuccess('');
    setQrWarning('');

    const workerObj = workers.find(w => w.idWorker === workerId);
    if (!workerObj) {
      setQrError("Operario no registrado en base de datos.");
      return;
    }
    
    // Verificar si el operario está libre
    const isFree = workerObj.estadoActual === 'POOL_ARRANQUE' || 
                   workerObj.estadoActual === 'DISPONIBLE_BOLSON' || 
                   (workerObj.estadoActual === 'EN_TRANSITO' && workerObj.lineaDestinoId === selectedLineId);

    if (!isFree) {
      setQrError(`${workerObj.nombre} ya tiene la tarea: ${workerObj.puestoActualId || 'Asignado'}.`);
      return;
    }

    setScannedWorker(workerObj);
  };

  // Asignación general al presionar el botón de vacante compatible
  const handleAsignarEscaneoGeneralPuesto = async () => {
    if (!scannedWorker) return;
    setQrError('');
    setQrSuccess('');

    try {
      const result = await firebaseEscanearQR(scannedWorker.idWorker, selectedLineId, currentTime);
      if (result.status === 'redirigido') {
        setQrWarning(result.msg);
        setTimeout(() => {
          closeDrawer();
        }, 3500);
      } else {
        setQrSuccess(`Operario asignado a ${result.puesto}`);
        setTimeout(() => {
          closeDrawer();
        }, 1200);
      }
    } catch (e) {
      setQrError(e.message);
    }
  };

  // Acciones de liberación rápida
  const handleLiberarPuesto = async (workerId) => {
    if (window.confirm("¿Enviar al operario de regreso al Bolsón de la Línea 8?")) {
      try {
        await firebaseRegistrarLlegadaDirectaL8(workerId, Date.now());
        closeDrawer();
      } catch (e) {
        alert(e.message);
      }
    }
  };

  const handleSolicitarRotacionManual = async (puestoId) => {
    try {
      await firebaseTriggerRotacionAutomatica(puestoId, Date.now());
      alert("Solicitud de rotación ergonómica enviada a Línea 8.");
      closeDrawer();
    } catch (e) {
      alert("Error: " + e.message);
    }
  };

  const handleReportarBajaMedica = async (workerId) => {
    if (window.confirm("¿Reportar BAJA MÉDICA de este operario? Se liberará el puesto y se ejecutará el cascadeo de reemplazo.")) {
      try {
        await firebaseRegistrarBajaTemporal(workerId, Date.now());
        alert("Baja médica inyectada. Cascada completada.");
        closeDrawer();
      } catch (e) {
        alert(e.message);
      }
    }
  };

  // --- CAMBIAR ESTADO OPERATIVO (MARCHA / PARO) ---
  const handleToggleParoPreparacion = async (line) => {
    if (!line) return;
    try {
      if (line.estado === 'Operando') {
        if (window.confirm(`¿Activar PARO DE LÍNEA para la Línea ${line.idLinea}? Esto desalojará masivamente a todos los operarios varios y los enviará al bolsón de la Línea 8.`)) {
          await firebaseActivarPreparacion(line.idLinea);
        }
      } else {
        await firebaseRestablecerLinea(line.idLinea);
      }
    } catch (e) {
      console.error("Error al cambiar estado de línea:", e);
      alert("Error al cambiar estado de línea: " + e.message);
    }
  };

  // --- ESCÁNER DE HARDWARE NATIVO (CAPACITOR + ML KIT) ---
  const startNativeScanForPuesto = async (puesto) => {
    setQrError('');
    setQrSuccess('');
    setQrWarning('');
    try {
      const perm = await BarcodeScanner.requestPermissions();
      if (perm.camera !== 'granted') {
        setQrError("Permiso de cámara rechazado.");
        return;
      }
      
      const { barcodes } = await BarcodeScanner.scan({
        formats: [BarcodeFormat.QrCode]
      });
      
      if (barcodes && barcodes.length > 0) {
        const code = barcodes[0].rawValue;
        if (code) {
          handleAsignarTrabajadorDirecto(code, puesto);
        }
      }
    } catch (err) {
      console.error("Error en escaneo nativo:", err);
      setQrError("Error en escáner nativo: " + err.message);
    }
  };

  const startNativeGeneralScan = async () => {
    setQrError('');
    setQrSuccess('');
    setQrWarning('');
    try {
      const perm = await BarcodeScanner.requestPermissions();
      if (perm.camera !== 'granted') {
        alert("Permiso de cámara rechazado.");
        return;
      }
      
      const { barcodes } = await BarcodeScanner.scan({
        formats: [BarcodeFormat.QrCode]
      });
      
      if (barcodes && barcodes.length > 0) {
        const code = barcodes[0].rawValue;
        if (code) {
          const workerObj = workers.find(w => w.idWorker === code);
          if (!workerObj) {
            alert("Operario no registrado en base de datos.");
            return;
          }
          const isFree = workerObj.estadoActual === 'POOL_ARRANQUE' || 
                         workerObj.estadoActual === 'DISPONIBLE_BOLSON' || 
                         (workerObj.estadoActual === 'EN_TRANSITO' && workerObj.lineaDestinoId === selectedLineId);

          if (!isFree) {
            alert(`${workerObj.nombre} ya tiene la tarea: ${workerObj.puestoActualId || 'Asignado'}.`);
            return;
          }
          setScannedWorker(workerObj);
          setShowGeneralScanner(true);
        }
      }
    } catch (err) {
      console.error("Error en escaneo general nativo:", err);
      alert("Error en escáner nativo: " + err.message);
    }
  };

  // --- ACCIONES TÁCTILES DEL HUD SUPERIOR ---
  const handleAprobarSalidaRapida = async (alertaId) => {
    try {
      await firebaseAprobarDespachoRotacion(alertaId);
    } catch (e) {
      console.error(e);
    }
  };

  const handleRegistrarLlegadaRapida = async (alertaId) => {
    try {
      await firebaseCompletarRotacionYCascada(alertaId, Date.now());
    } catch (e) {
      console.error(e);
    }
  };

  // --- INICIALIZAR Y ARRANCAR JORNADA CON ASISTENCIA ---
  const handleArrancarJornada = async () => {
    const duracion = selectedShift === 'C' ? '12 horas' : '8 horas';
    if (window.confirm(`¿Arrancar la jornada para el Turno ${selectedShift} (${duracion})? Esto reiniciará la base de datos de planta, pasará asistencia completa y congelará atómicamente a los técnicos fijos en sus puestos.`)) {
      try {
        await firebaseInicializarTurno();
        setShowShiftDrawer(false);
        alert("¡Turno iniciado con asistencia exitosamente! Personal pre-llenado en puestos técnicos.");
      } catch (err) {
        alert("Error al arrancar turno: " + err.message);
      }
    }
  };

  // --- GESTIÓN DE SELECCIÓN DE LÍNEA ---
  const handleSelectLine = (lineId) => {
    setSelectedLineId(lineId);
    setViewMode('supervisor');
  };

  const handleBackToPlant = () => {
    setSelectedLineId(null);
    setViewMode('plant');
    closeDrawer();
  };

  // --- PROCESAMIENTO Y FILTRADOS ---
  const sortedLines = [...lines].sort((a, b) => {
    return LINE_PRIORITY_ORDER.indexOf(a.idLinea) - LINE_PRIORITY_ORDER.indexOf(b.idLinea);
  });

  const currentLine = lines.find(l => l.idLinea === selectedLineId);
  const puestosDeLinea = puestos.filter(p => p.idLinea === selectedLineId);

  // Alertas filtradas para el supervisor actual (incluyendo alertas de espera ergonómica en L4)
  const alertasSupervisor = alerts.filter(a => {
    if (selectedLineId === 'L8') {
      return a.type === 'solicitud_rotacion' || (a.lineaDestinoId === 'L8' && a.type === 'transito');
    } else {
      return (a.lineaPrioId === selectedLineId && a.type === 'esperando_recepcion') || 
             (a.lineaPrioId === selectedLineId && a.type === 'solicitud_rotacion') || 
             (a.lineaDestinoId === selectedLineId && a.type === 'transito');
    }
  });

  const getCompatibleWorkersForPuesto = (puesto) => {
    return workers.filter(w => {
      const isAvailable = w.estadoActual === 'POOL_ARRANQUE' || 
                          w.estadoActual === 'DISPONIBLE_BOLSON' || 
                          (w.estadoActual === 'EN_TRANSITO' && w.lineaDestinoId === selectedLineId);
      if (!isAvailable) return false;
      if (evaluarFiltrosCompatibilidad(w, puesto) !== true) return false;

      const query = searchQuery.toLowerCase().trim();
      if (!query) return true;
      return w.nombre.toLowerCase().includes(query) || 
             w.idWorker.toLowerCase().includes(query) || 
             w.rol.toLowerCase().includes(query);
    });
  };

  const generalSearchResults = workers.filter(w => {
    const isAvailable = w.estadoActual === 'POOL_ARRANQUE' || 
                        w.estadoActual === 'DISPONIBLE_BOLSON' || 
                        (w.estadoActual === 'EN_TRANSITO' && w.lineaDestinoId === selectedLineId);
    if (!isAvailable) return false;
    const query = searchQuery.toLowerCase().trim();
    if (!query) return true;
    return w.nombre.toLowerCase().includes(query) || 
           w.idWorker.toLowerCase().includes(query);
  });

  // Información de turnos
  const shiftsDetails = {
    'A': { nombre: 'Turno A (Matutino)', horas: '8h', horario: '06:00 - 14:00' },
    'B': { nombre: 'Turno B (Vespertino)', horas: '8h', horario: '14:00 - 22:00' },
    'C': { nombre: 'Turno C (Nocturno)', horas: '12h', horario: '22:00 - 06:00' }
  };

  // --- REGISTRAR RETORNO EN BOLSÓN DIRECTO DESDE ALERTA DE TRANSITO ---
  const handleRegistrarLlegadaDirectaL8 = async (workerId) => {
    try {
      await firebaseRegistrarLlegadaDirectaL8(workerId, Date.now());
      alert("Operario registrado de retorno en Bolsón con éxito.");
    } catch (e) {
      console.error("Error registrando retorno:", e);
      alert("Error al registrar retorno: " + e.message);
    }
  };

  // --- EFECTOS DE TIEMPO REAL Y SUSCRIPCIÓN (DECLARACIÓN AL FINAL PARA EVITAR ERRORES DE HOISTING) ---
  
  // 1. SUSCRIPCIÓN EN CALIENTE AL ESTADO DE PLANTA
  useEffect(() => {
    firebaseInicializarTurno().catch(() => {
      console.warn("Base de datos ya estructurada o activa.");
    });

    const unsubscribe = suscribirEstadoPlanta(state => {
      if (state.workers) setWorkers(state.workers);
      if (state.lines) setLines(state.lines);
      if (state.puestos) setPuestos(state.puestos);
      if (state.alerts) setAlerts(state.alerts);
      if (state.logs) setLogs(state.logs);
    });

    return () => unsubscribe();
  }, []);

  // 2. RELOJ DE TIEMPO REAL OPERATIVO
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // 3. EFECTO ERGONÓMICO: DISPARAR ROTACIÓN AL VOLAR
  useEffect(() => {
    const lineasPrio = ['L4', 'L1', 'L2', 'L6', 'L7', 'L5', 'L3', 'L9', 'L10'];
    puestos.forEach(p => {
      if (p.tipo === 'Vario' && p.idWorkerAsignado && !p.rotacionIniciada && lineasPrio.includes(p.idLinea)) {
        const remaining = getPuestoTimeRemaining(p);
        if (remaining !== null && remaining <= 300) { // Menos de 5 minutos reales
          firebaseTriggerRotacionAutomatica(p.idPuesto, Date.now()).catch(() => {});
        }
      }
    });
  }, [currentTime, puestos]);

  // 4. INICIALIZADOR DE CÁMARA QR DENTRO DE BOTTOM DRAWERS (SÓLO WEB)
  useEffect(() => {
    if (Capacitor.isNativePlatform()) return;
    const showCamera = activeDrawerPuesto?.action === 'assign' || showGeneralScanner;
    
    if (!showCamera) {
      if (qrScannerRef.current && qrScannerRef.current.isScanning) {
        qrScannerRef.current.stop().then(() => {
          setUsandoCamaraHardware(false);
        }).catch(err => console.error("Error apagando cámara web:", err));
      }
      return;
    }

    const scanner = new Html5Qrcode("reader");
    qrScannerRef.current = scanner;

    const config = { 
      fps: 15, 
      qrbox: (width, height) => {
        const size = Math.min(width, height) * 0.70;
        return { width: size, height: size };
      }
    };

    scanner.start(
      { facingMode: "environment" },
      config,
      (decodedText) => {
        if (navigator.vibrate) navigator.vibrate(100);
        if (showGeneralScanner) {
          handleGeneralQrScanned(decodedText);
        } else {
          handleAsignarTrabajadorDirecto(decodedText, activeDrawerPuesto.puesto);
        }
      },
      () => {}
    ).then(() => {
      setUsandoCamaraHardware(true);
    }).catch(() => {
      setUsandoCamaraHardware(false);
    });

    return () => {
      if (scanner.isScanning) {
        scanner.stop().catch(err => console.error("Falla limpiando cámara web:", err));
      }
    };
  }, [activeDrawerPuesto, showGeneralScanner]);

  return (
    <div className="app-container">

      {/* ==================================================================== */}
      {/* 1. VISTA: PANEL GENERAL DE LA PLANTA (CENTRO DE CONTROL INDUSTRIAL)  */}
      {/* ==================================================================== */}
      {viewMode === 'plant' && (
        <div className="plant-dashboard-view">
          
          {/* HEADER PREMIUM DE CONTROL DE PLANTA */}
          <header className="plant-header">
            <div className="plant-header-top">
              <div className="plant-brand">
                <Layers className="plant-logo" size={24} />
                <h1 className="plant-title">SmartAssign</h1>
              </div>

              <div className="plant-header-actions">
                {/* Micro-badge de Turno Interactivo (Ahorro Masivo de Espacio) */}
                <button className="plant-shift-badge-trigger" onClick={() => setShowShiftDrawer(true)}>
                  <Calendar size={11} style={{ color: 'var(--color-primary)' }} />
                  <span>Turno {selectedShift} • {shiftsDetails[selectedShift].horas} ⚙️</span>
                </button>

                <div className="plant-reloj">
                  <Clock size={11} style={{ color: 'var(--color-primary)', marginRight: '4px' }} />
                  <span>{new Date(currentTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              </div>
            </div>
          </header>

          {/* LISTADO EJECUTIVO DE LÍNEAS DE PRODUCCIÓN */}
          <main className="plant-body">
            <div className="section-title-row">
              <h2>LÍNEAS DE PRODUCCIÓN ({lines.length})</h2>
              <small>Orden de Prioridad Global</small>
            </div>

            <div className="plant-lines-grid">
              {sortedLines.map((l, index) => {
                const puestosLinea = puestos.filter(p => p.idLinea === l.idLinea);
                const totalPuestos = puestosLinea.length;
                const puestosLlenos = puestosLinea.filter(p => p.idWorkerAsignado !== null).length;
                const pctAsignacion = totalPuestos > 0 ? Math.round((puestosLlenos / totalPuestos) * 100) : 0;
                
                // Buscar si hay alertas activas de tránsitos o rotaciones para esta línea
                const lineAlerts = alerts.filter(a => a.lineaDestinoId === l.idLinea || a.lineaPrioId === l.idLinea);

                return (
                  <div 
                    key={l.idLinea} 
                    className={`plant-line-card clickable ${l.estado === 'Operando' ? '' : 'en-paro'}`}
                    onClick={() => handleSelectLine(l.idLinea)}
                  >
                    <div className="card-prio-tag">PRIO {index + 1}</div>
                    
                    <div className="card-top-row">
                      <div className="line-identity">
                        <h3>{l.nombre.replace('Línea L', 'Línea ')}</h3>
                        <span className="line-desc">{l.idLinea === 'L8' ? 'Pulmón de Personal' : `Estación Técnica: ${l.idLinea}`}</span>
                      </div>
                      <span className={`status-badge-mini ${l.estado.toLowerCase().replace(" ", "-")}`}>
                        {l.estado}
                      </span>
                    </div>

                    <div className="card-sku-row">
                      <span className="sku-label">SKU ACTIVO</span>
                      <span className="sku-value">{l.skuActual || 'Ninguno'}</span>
                    </div>

                    {/* Barra de progreso de cobertura de personal */}
                    <div className="coverage-section">
                      <div className="coverage-label-row">
                        <span>Cobertura de Personal</span>
                        <span className="coverage-fraction">{puestosLlenos}/{totalPuestos}</span>
                      </div>
                      <div className="progress-bg">
                        <div 
                          className={`progress-bar ${pctAsignacion === 100 ? 'full' : pctAsignacion > 50 ? 'half' : 'empty'}`}
                          style={{ width: `${pctAsignacion}%` }}
                        ></div>
                      </div>
                    </div>

                    {/* Notificador de tránsitos en la tarjeta */}
                    {lineAlerts.length > 0 && (
                      <div className="card-alert-badge-micro">
                        <AlertTriangle size={10} />
                        <span>{lineAlerts.length} Evento(s) en Camino</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </main>

          {/* TAB DE CONSOLA DE LOGS EN VIVO (ESTILO FACTORY CONSOLE) */}
          <footer className={`plant-logs-console ${showLogsConsole ? 'expanded' : ''}`}>
            <button className="console-toggle-btn" onClick={() => setShowLogsConsole(!showLogsConsole)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div className="live-dot animate"></div>
                <span>CONSOLA OPERATIVA DE PLANTA (HISTORIAL DE LOGS)</span>
              </div>
              <span className="arrow">{showLogsConsole ? '▼' : '▲'}</span>
            </button>
            
            {showLogsConsole && (
              <div className="console-body">
                {logs.length === 0 ? (
                  <div className="console-empty">No se han registrado eventos operativos aún.</div>
                ) : (
                  logs.map((log, idx) => (
                    <div key={idx} className={`console-row ${log.type || 'info'}`}>
                      <span className="log-time">[{log.timeFormatted || new Date(log.timestamp).toLocaleTimeString()}]</span>
                      <span className="log-msg">{log.message}</span>
                    </div>
                  ))
                )}
              </div>
            )}
          </footer>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 2. VISTA: GESTIÓN DE LÍNEA INDIVIDUAL (SUPERVISOR PANEL)             */}
      {/* ==================================================================== */}
      {viewMode === 'supervisor' && (
        <div className="supervisor-dashboard-view">
          
          <header className="mobile-header">
            <button className="btn-back-to-plant" onClick={handleBackToPlant}>
              <ArrowLeft size={16} />
              <span>Volver</span>
            </button>

            <div className="header-title-block">
              <h2 className="header-line-name">
                {(currentLine?.nombre || `Línea ${currentLine?.idLinea || ''}`).replace('Línea L', 'Línea ')}
              </h2>
              <span className="header-sku">{currentLine?.skuActual || 'Sin SKU'}</span>
            </div>
            
            <div className="header-actions">
              <span className={`header-status-badge ${currentLine?.estado === 'Operando' ? 'active' : 'prep'}`}>
                <span className="status-dot"></span>
                <span>{currentLine?.estado === 'Operando' ? 'OPERA' : 'PARO'}</span>
              </span>
              
              <button
                className={`btn-action-status ${currentLine?.estado === 'Operando' ? 'paro' : 'marcha'}`}
                onClick={() => handleToggleParoPreparacion(currentLine)}
              >
                {currentLine?.estado === 'Operando' ? <Zap size={11} /> : <Play size={11} />}
                <span>{currentLine?.estado === 'Operando' ? 'PARAR' : 'ACTIVAR'}</span>
              </button>
            </div>
          </header>

          {/* HUD SUPERIOR DE NOTIFICACIONES CRÍTICAS (1/3 SCREEN) */}
          <div className="hud-alerts-deck">
            {alertasSupervisor.length > 0 ? (
              alertasSupervisor.slice(0, 1).map(a => (
                <div key={a.id} className={`hud-alert-giant ${a.type}`}>
                  <div className="hud-alert-badge">
                    <AlertTriangle size={12} />
                    <span>EVENTO DE PISO DE PLANTA</span>
                  </div>
                  
                  <h3 className="hud-alert-title">{a.title}</h3>
                  <p className="hud-alert-desc">{a.message}</p>

                  <div className="hud-alert-giant-action-container">
                    {a.type === 'solicitud_rotacion' && selectedLineId === 'L8' && (
                      <button 
                        className="hud-giant-btn success"
                        onClick={() => handleAprobarSalidaRapida(a.id)}
                      >
                        ✓ APROBAR Y DESPACHAR RELEVO
                      </button>
                    )}

                    {a.type === 'solicitud_rotacion' && selectedLineId !== 'L8' && (
                      <div className="hud-giant-info-badge" style={{ padding: '0.85rem', backgroundColor: 'rgba(245, 158, 11, 0.08)', borderRadius: '10px', border: '1px solid rgba(245, 158, 11, 0.2)', textAlign: 'center', fontSize: '0.75rem', fontWeight: 800, color: 'var(--color-warning)' }}>
                        AGUARDANDO DESPACHO DE RELEVISTA DESDE LÍNEA 8
                      </div>
                    )}
                    
                    {a.type === 'esperando_recepcion' && (
                      <button 
                        className="hud-giant-btn info"
                        onClick={() => handleRegistrarLlegadaRapida(a.id)}
                      >
                        ➜ REGISTRAR LLEGADA DE RELEVISTA
                      </button>
                    )}

                    {a.type === 'transito' && selectedLineId === 'L8' && (
                      <button 
                        className="hud-giant-btn success"
                        onClick={() => handleRegistrarLlegadaDirectaL8(a.workerId)}
                      >
                        ➜ REGISTRAR RETORNO EN BOLSÓN
                      </button>
                    )}

                    {a.type === 'transito' && selectedLineId !== 'L8' && (
                      <button 
                        className="hud-giant-btn info"
                        onClick={() => handleAsignarTrabajadorDirecto(a.workerId, puestos.find(p => p.idPuesto === a.puestoId) || puestosDeLinea.find(p => p.tipo === 'Vario' && p.idWorkerAsignado === null))}
                      >
                        ➜ REGISTRAR RECEPCIÓN EN PUESTO
                      </button>
                    )}
                  </div>
                </div>
              ))
            ) : (
              // ESTADO LIMPIO: BALANCEADO (MICRO-INDICADOR PREMIUM)
              <div className="hud-state-balanced-compact">
                <Check size={14} className="icon-balanced-compact" />
                <span>OPERACIÓN ESTABLE • LÍNEA BALANCEADA SIN TRÁNSITOS PENDIENTES</span>
              </div>
            )}
          </div>

          {/* MATRIZ VERTICAL DE PUESTOS INTERACTIVOS */}
          <div className="mobile-content-scroll rugged-grid">
            <span style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 700, paddingLeft: '4px' }}>
              Puestos de Trabajo ({puestosDeLinea.length})
            </span>
            
            {puestosDeLinea.map(p => {
              const worker = workers.find(w => w.idWorker === p.idWorkerAsignado);
              const isFijo = p.tipo === 'Fijo';
              const remaining = getPuestoTimeRemaining(p);
              const isParoVario = currentLine?.estado === 'En Preparación' && !isFijo && !worker;

              return (
                <div 
                  key={p.idPuesto} 
                  className={`rugged-puesto-card ${isFijo ? 'fijo' : 'vario'} ${worker ? 'filled' : 'empty'} ${isParoVario ? 'en-paro' : ''} clickable`}
                  onClick={() => handlePuestoCardClick(p)}
                >
                  <div className="rugged-puesto-left">
                    <span className="rugged-task">
                      {p.nombreTarea.replace(/\s*\(\s*Línea\s*\d+\s*\)/gi, '').replace(/\s+L\d+$/gi, '')}
                    </span>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <span className={`puesto-badge-micro ${isFijo ? 'fijo' : 'vario'} ${isFijo && worker ? 'congelado' : ''}`}>
                        {isFijo && worker ? 'CONGELADO' : isFijo ? 'Fijo Técnico' : 'Vario / Rotativo'}
                      </span>
                      {!isFijo && worker && (
                        <span className={`rugged-timer ${remaining <= 300 ? 'urgent' : ''}`}>
                          Restan: {formatRemainingTime(remaining)}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="rugged-puesto-right">
                    {worker ? (
                      <div className="rugged-worker-box">
                        <span className="rugged-worker-name">{worker.nombre}</span>
                        <span className="rugged-worker-id">{worker.idWorker} • {worker.rol}</span>
                      </div>
                    ) : isParoVario ? (
                      <div className="rugged-puesto-lock-badge">
                        PARO ACTIVO
                      </div>
                    ) : (
                      <div className="rugged-puesto-assign-trigger">
                        <span>+ Asignar</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* FAB DE ESCANEO GENERAL (PULGAR ACCESIBLE) */}
          <div className="rugged-fab-container">
            <button 
              className="rugged-btn-fab-qr" 
              onClick={() => {
                if (Capacitor.isNativePlatform()) {
                  startNativeGeneralScan();
                } else {
                  setShowGeneralScanner(true);
                }
              }}
            >
              <QrCode size={24} />
            </button>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 3. CAJÓN DESLIZABLE DE CONFIGURACIÓN DE TURNO (SHIFT DRAWER)         */}
      {/* ==================================================================== */}
      {showShiftDrawer && (
        <div className="bottom-drawer-overlay" onClick={() => setShowShiftDrawer(false)}>
          <div className="bottom-drawer-sheet" onClick={(e) => e.stopPropagation()}>
            
            <div className="drawer-header">
              <div>
                <h3 className="drawer-title">Configuración de Jornada</h3>
                <span className="drawer-subtitle">Especifique el turno variable cargado de Google Sheets.</span>
              </div>
              <button className="drawer-btn-close" onClick={() => setShowShiftDrawer(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="drawer-body">
              <div className="shift-selector-panel">
                <div className="shift-selector-row">
                  {Object.keys(shiftsDetails).map(key => (
                    <button
                      key={key}
                      className={`shift-pill-btn ${selectedShift === key ? 'active' : ''}`}
                      onClick={() => setSelectedShift(key)}
                    >
                      {key}
                    </button>
                  ))}
                </div>

                <div className="shift-info-row" style={{ marginTop: '0.5rem', marginBottom: '0.5rem' }}>
                  <div className="info-item">
                    <small>Horario Operativo</small>
                    <span style={{ fontSize: '0.9rem', color: '#fff' }}>{shiftsDetails[selectedShift].horario}</span>
                  </div>
                  <div className="info-item" style={{ alignItems: 'flex-end' }}>
                    <small>Duración de Rotación</small>
                    <span style={{ fontSize: '0.9rem', color: 'var(--color-warning)' }}>Max: 2 Horas</span>
                  </div>
                </div>

                {/* Botón de Arranque de Turno (Motor 1) */}
                <button className="btn-arrancar-jornada" style={{ width: '100%', marginTop: '0.5rem' }} onClick={handleArrancarJornada}>
                  <Play size={14} style={{ marginRight: '6px' }} />
                  ARRANCAR JORNADA Y PASAR ASISTENCIA
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 4. CAJÓN INFERIOR CONTEXTUAL (BOTTOM DRAWER SHEET)                  */}
      {/* ==================================================================== */}
      {(activeDrawerPuesto || showGeneralScanner) && (
        <div className="bottom-drawer-overlay" onClick={closeDrawer}>
          <div className="bottom-drawer-sheet" onClick={(e) => e.stopPropagation()}>
            
            {/* Cabecera del Cajón */}
            <div className="drawer-header">
              <div>
                <h3 className="drawer-title">
                  {showGeneralScanner 
                    ? "Escaneo General de Personal" 
                    : activeDrawerPuesto.action === 'assign' 
                      ? `Asignar Puesto: ${activeDrawerPuesto.puesto.nombreTarea.replace(/\s*\(\s*Línea\s*\d+\s*\)/gi, '').replace(/\s+L\d+$/gi, '')}`
                      : `Operario: ${activeDrawerPuesto.worker.nombre}`
                  }
                </h3>
                <span className="drawer-subtitle">
                  {showGeneralScanner 
                    ? "Registre cualquier operario en planta para enrutarlo." 
                    : activeDrawerPuesto.action === 'assign'
                      ? "Escanee el gafete QR o asigne de forma manual."
                      : `Ficha: ${activeDrawerPuesto.worker.idWorker} • Rol: ${activeDrawerPuesto.worker.rol}`
                  }
                </span>
              </div>
              <button className="drawer-btn-close" onClick={closeDrawer}>
                <X size={18} />
              </button>
            </div>

            {/* A. CASO: ASIGNAR PUESTO VACANTE DIRECTO */}
            {activeDrawerPuesto?.action === 'assign' && (
              <div className="drawer-body">
                
                {/* Lector de Escaneo QR (Híbrido) */}
                {Capacitor.isNativePlatform() ? (
                  <div 
                    className="scanner-native-trigger-box" 
                    onClick={() => startNativeScanForPuesto(activeDrawerPuesto.puesto)}
                  >
                    <Camera size={32} className="native-scan-icon" />
                    <span>TAP PARA ABRIR CÁMARA Y ESCANEAR QR</span>
                    <small>Utiliza el escáner de alta velocidad integrado del teléfono</small>
                  </div>
                ) : (
                  <div className="scanner-industrial-box small">
                    <div id="reader" className="scanner-camera-view">
                      {!usandoCamaraHardware && (
                        <div className="camera-connecting-text">
                          Inicializando cámara... contingencia manual disponible abajo.
                        </div>
                      )}
                    </div>
                    <div className="scanner-visor-overlay">
                      <div className="reticle-corner tl"></div>
                      <div className="reticle-corner tr"></div>
                      <div className="reticle-corner bl"></div>
                      <div className="reticle-corner br"></div>
                      <div className="laser-sweep-line"></div>
                    </div>
                  </div>
                )}

                {/* Contingencia Manual Autocompletable Filtrada */}
                <div className="rugged-search-box">
                  <div className="rugged-search-header-row">
                    <Search size={18} style={{ color: 'var(--text-secondary)' }} />
                    <input
                      type="text"
                      className="manual-search-input-field"
                      placeholder="Filtrar por nombre o ficha ID..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>

                  <div className="rugged-candidates-list">
                    {getCompatibleWorkersForPuesto(activeDrawerPuesto.puesto).length === 0 ? (
                      <div className="no-candidates-card">
                        <AlertCircle size={20} style={{ color: 'var(--text-muted)', marginBottom: '4px' }} />
                        <span>Sin candidatos libres compatibles en este momento.</span>
                      </div>
                    ) : (
                      getCompatibleWorkersForPuesto(activeDrawerPuesto.puesto).map(w => (
                        <div 
                          key={w.idWorker} 
                          className="rugged-candidate-card"
                          onClick={() => handleAsignarTrabajadorDirecto(w.idWorker, activeDrawerPuesto.puesto)}
                        >
                          <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'left' }}>
                            <span className="cand-name">{w.nombre}</span>
                            <span className="cand-meta">{w.idWorker} • {w.rol} • <span style={{ color: 'var(--color-primary)' }}>Disponible</span></span>
                          </div>
                          <CheckCircle size={16} style={{ color: 'var(--color-success)' }} />
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* B. CASO: GESTIONAR PUESTO OCUPADO */}
            {activeDrawerPuesto?.action === 'manage' && (
              <div className="drawer-body rugged-action-sheet">
                
                {/* Ficha rápida de restricciones */}
                <div className="rugged-worker-medical-box">
                  <span style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 700 }}>Restricciones Médicas / Salud:</span>
                  <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: '#fff', fontWeight: 600 }}>
                    {activeDrawerPuesto.worker.restriccionesMedicas.join(', ') || 'Sin restricciones médicas registradas'}
                  </p>
                </div>

                <div className="hud-alert-giant-action-container flex-col">
                  {/* Botón 1: Solicitar Rotación / Relevo */}
                  {activeDrawerPuesto.puesto.tipo === 'Vario' && (
                    <button 
                      className="rugged-sheet-action-btn warning"
                      onClick={() => handleSolicitarRotacionManual(activeDrawerPuesto.puesto.idPuesto)}
                    >
                      <RefreshCw size={16} />
                      SOLICITAR ROTACIÓN ERGONÓMICA MANUAL
                    </button>
                  )}

                  {/* Botón 2: Liberar y Enviar a Bolsón */}
                  <button 
                    className="rugged-sheet-action-btn secondary"
                    onClick={() => handleLiberarPuesto(activeDrawerPuesto.worker.idWorker)}
                  >
                    <LogOut size={16} />
                    LIBERAR PUESTO (ENVIAR A BOLSÓN L8)
                  </button>

                  {/* Botón 3: Reportar Baja Médica */}
                  <button 
                    className="rugged-sheet-action-btn danger"
                    onClick={() => handleReportarBajaMedica(activeDrawerPuesto.worker.idWorker)}
                  >
                    <UserX size={16} />
                    REPORTAR BAJA MÉDICA URGENTE
                  </button>
                </div>
              </div>
            )}

            {/* C. CASO: ESCANEO GENERAL (FAB) */}
            {showGeneralScanner && (
              <div className="drawer-body">
                {!scannedWorker ? (
                  <>
                    {Capacitor.isNativePlatform() ? (
                      <div 
                        className="scanner-native-trigger-box" 
                        onClick={startNativeGeneralScan}
                      >
                        <Camera size={32} className="native-scan-icon" />
                        <span>TAP PARA ABRIR CÁMARA Y ESCANEAR QR</span>
                        <small>Utiliza el escáner de alta velocidad integrado del teléfono</small>
                      </div>
                    ) : (
                      <div className="scanner-industrial-box small">
                        <div id="reader" className="scanner-camera-view">
                          {!usandoCamaraHardware && (
                            <div className="camera-connecting-text">
                              Inicializando cámara... contingencia manual disponible abajo.
                            </div>
                          )}
                        </div>
                        <div className="scanner-visor-overlay">
                          <div className="reticle-corner tl"></div>
                          <div className="reticle-corner tr"></div>
                          <div className="reticle-corner bl"></div>
                          <div className="reticle-corner br"></div>
                          <div className="laser-sweep-line"></div>
                        </div>
                      </div>
                    )}

                    <div className="rugged-search-box">
                      <div className="rugged-search-header-row">
                        <Search size={18} style={{ color: 'var(--text-secondary)' }} />
                        <input
                          type="text"
                          className="manual-search-input-field"
                          placeholder="Buscar operario por nómina..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                        />
                      </div>

                      <div className="rugged-candidates-list">
                        {generalSearchResults.map(w => (
                          <div 
                            key={w.idWorker} 
                            className="rugged-candidate-card"
                            onClick={() => handleGeneralQrScanned(w.idWorker)}
                          >
                            <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'left' }}>
                              <span className="cand-name">{w.nombre}</span>
                              <span className="cand-meta">{w.idWorker} • {w.rol}</span>
                            </div>
                            <ChevronRight size={16} />
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                ) : (
                  // MOSTRAR PUESTOS VACANTES COMPATIBLES PARA ASIGNACIÓN GENERAL
                  <div className="general-scan-results-box">
                    <div className="rugged-worker-medical-box success">
                      <h4 style={{ margin: 0 }}>{scannedWorker.nombre} ({scannedWorker.idWorker})</h4>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Operario listo para asignación. Elija la vacante física:</span>
                    </div>

                    <span style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 700, margin: '0.5rem 0', display: 'block' }}>
                      Vacantes Compatibles ({puestosDeLinea.filter(p => p.idWorkerAsignado === null && evaluarFiltrosCompatibilidad(scannedWorker, p) === true).length})
                    </span>

                    <div className="compatible-vacancies-list">
                      {puestosDeLinea
                        .filter(p => p.idWorkerAsignado === null)
                        .map(p => {
                          const comp = evaluarFiltrosCompatibilidad(scannedWorker, p);
                          const isCompatible = comp === true;
                          return (
                            <button
                              key={p.idPuesto}
                              className={`compatible-puesto-btn ${isCompatible ? 'yes' : 'no'}`}
                              disabled={!isCompatible}
                              onClick={() => handleAsignarEscaneoGeneralPuesto(p.idPuesto)}
                            >
                              <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'left' }}>
                                <span className="p-title">
                                  {p.nombreTarea.replace(/\s*\(\s*Línea\s*\d+\s*\)/gi, '').replace(/\s+L\d+$/gi, '')}
                                </span>
                                <span className="p-subtitle">
                                  {isCompatible ? "✓ Compatible (Sin restricciones)" : `✗ Incompatible: ${comp}`}
                                </span>
                              </div>
                              {isCompatible && <ChevronRight size={18} />}
                            </button>
                          );
                        })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* RETROALIMENTACIÓN DE ESTADO DENTRO DE LOS CAJONES */}
            {qrError && <div className="qr-feedback error"><AlertCircle size={16} /><span>{qrError}</span></div>}
            {qrWarning && <div className="qr-feedback warning"><AlertTriangle size={16} /><span>{qrWarning}</span></div>}
            {qrSuccess && <div className="qr-feedback success"><CheckCircle size={16} /><span>{qrSuccess}</span></div>}

          </div>
        </div>
      )}

    </div>
  );
}

export default App;
