import React, { useState, useEffect, useRef } from 'react';
import { 
  suscribirEstadoPlanta,
  firebaseInicializarTurno,
  firebaseEscanearQR,
  firebaseAprobarDespachoRotacion,
  firebaseCompletarRotacionYCascada,
  firebaseReincorporarTrabajador,
  firebaseActivarPreparacion,
  firebaseRestablecerLinea,
  firebaseDecrementarTemporizadores
} from './services/firebaseService';
import { 
  QrCode, 
  AlertTriangle, 
  CheckCircle, 
  AlertCircle,
  Play, 
  Pause, 
  FastForward, 
  LogOut,
  Activity,
  Camera
} from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import './App.css';

function App() {
  // --- ESTADOS DE BASE DE DATOS SINCRONIZADOS ---
  const [workers, setWorkers] = useState([]);
  const [lines, setLines] = useState([]);
  const [puestos, setPuestos] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [logs, setLogs] = useState([]);

  // --- ESTADOS DE PANTALLA EXCLUSIVA MÓVIL ---
  const [selectedLineId, setSelectedLineId] = useState(null); // NULL: Selector de línea inicial
  const [showQrModal, setShowQrModal] = useState(false);
  const [selectedWorkerQR, setSelectedWorkerQR] = useState('');
  const [qrError, setQrError] = useState('');
  const [qrSuccess, setQrSuccess] = useState('');
  const [qrWarning, setQrWarning] = useState('');
  const [usandoCamaraHardware, setUsandoCamaraHardware] = useState(false);

  // --- TEMPORIZADOR DE SIMULACIÓN ---
  const [simTime, setSimTime] = useState({ hour: 6, minute: 0, second: 0 });
  const [simSpeed, setSimSpeed] = useState(1); // 0: Pausado, 1: Normal, 20: Rápido
  const timerRef = useRef(null);
  const qrScannerRef = useRef(null);

  // 1. SUSCRIPCIÓN EN TIEMPO REAL A LA BASE DE DATOS (Nube o LocalStorage)
  useEffect(() => {
    // Inicializar base de datos de respaldo local al arranque
    firebaseInicializarTurno().catch(err => {
      console.warn("Base de datos ya inicializada.");
    });

    const unsubscribe = suscribirEstadoPlanta(state => {
      if (state.workers && state.workers.length > 0) setWorkers(state.workers);
      if (state.lines && state.lines.length > 0) setLines(state.lines);
      if (state.puestos && state.puestos.length > 0) setPuestos(state.puestos);
      setAlerts(state.alerts || []);
      setLogs(state.logs || []);
    });

    return () => unsubscribe();
  }, []);

  // 2. CRON DE SIMULACIÓN EN FIRESTORE EN NUBE / LOCAL
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

        // Decremento atómico
        if (puestos.length > 0) {
          firebaseDecrementarTemporizadores(simSpeed);
        }

        return { hour: newHour, minute: newMin, second: newSec };
      });
    }, 1000);

    return () => clearInterval(timerRef.current);
  }, [simSpeed, puestos.length]);

  // 3. INICIALIZADOR DE CÁMARA FÍSICA PARA ESCANEO QR EN CELULAR (Android/iOS)
  useEffect(() => {
    if (!showQrModal) {
      // Apagar cámara si el modal se cierra
      if (qrScannerRef.current && qrScannerRef.current.isScanning) {
        qrScannerRef.current.stop().then(() => {
          setUsandoCamaraHardware(false);
        }).catch(err => console.error("Error apagando cámara:", err));
      }
      return;
    }

    setQrError('');
    setQrSuccess('');
    setQrWarning('');
    
    // Crear instancia de Html5Qrcode
    const scanner = new Html5Qrcode("reader");
    qrScannerRef.current = scanner;

    const config = { 
      fps: 15, 
      qrbox: (width, height) => {
        const size = Math.min(width, height) * 0.65;
        return { width: size, height: size };
      }
    };

    // Encender la cámara trasera (facingMode: "environment")
    scanner.start(
      { facingMode: "environment" },
      config,
      (decodedText) => {
        // Callback al decodificar un código QR exitosamente
        // El código QR debe contener el ID del operario, ej: "W03", "W15", etc.
        handleEscanearDirectoQR(decodedText);
      },
      (errorMessage) => {
        // Silenciar errores de lectura continuos (ruido óptico)
      }
    ).then(() => {
      setUsandoCamaraHardware(true);
    }).catch(err => {
      console.warn("Cámara de hardware no disponible o permisos denegados. Activando selector manual.", err);
      setUsandoCamaraHardware(false);
    });

    return () => {
      if (scanner.isScanning) {
        scanner.stop().catch(err => console.error("Falla limpiando cámara:", err));
      }
    };
  }, [showQrModal]);

  // --- ACCIONES RÁPIDAS EN PISO ---

  // Procesa la asignación atómica tras leer el QR
  const handleEscanearDirectoQR = async (workerId) => {
    setQrError('');
    setQrSuccess('');
    setQrWarning('');

    try {
      const result = await firebaseEscanearQR(workerId, selectedLineId);
      
      if (result.status === 'redirigido') {
        setQrWarning(result.msg);
        // Apagar cámara
        if (qrScannerRef.current && qrScannerRef.current.isScanning) {
          await qrScannerRef.current.stop();
          setUsandoCamaraHardware(false);
        }
        setTimeout(() => {
          setShowQrModal(false);
          setSelectedWorkerQR('');
          setQrWarning('');
        }, 3000);
      } else {
        setQrSuccess(`¡ASIGNACIÓN CORRECTA!: ${result.puesto}`);
        // Apagar cámara
        if (qrScannerRef.current && qrScannerRef.current.isScanning) {
          await qrScannerRef.current.stop();
          setUsandoCamaraHardware(false);
        }
        setTimeout(() => {
          setShowQrModal(false);
          setSelectedWorkerQR('');
          setQrSuccess('');
        }, 1500);
      }
    } catch (error) {
      setQrError(error.message);
    }
  };

  const handleAprobarSalidaRapida = async (alertaId) => {
    try {
      await firebaseAprobarDespachoRotacion(alertaId);
    } catch (e) {
      console.error(e);
    }
  };

  const handleRegistrarLlegadaRapida = async (alertaId) => {
    try {
      await firebaseCompletarRotacionYCascada(alertaId);
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggleParoPreparacion = async (linea) => {
    if (linea.estado === 'Operando') {
      await firebaseActivarPreparacion(linea.idLinea);
    } else {
      await firebaseRestablecerLinea(linea.idLinea);
    }
  };

  const currentLine = lines.find(l => l.idLinea === selectedLineId);
  const puestosDeLinea = puestos.filter(p => p.idLinea === selectedLineId);

  // Alertas que corresponden a la línea del supervisor
  const alertasSupervisor = alerts.filter(a => {
    if (selectedLineId === 'L8') {
      return a.type === 'solicitud_rotacion';
    } else {
      return (a.lineaPrioId === selectedLineId && a.type === 'esperando_recepcion') || 
             (a.lineaDestinoId === selectedLineId && a.type === 'transito');
    }
  });

  return (
    <div className="app-container">
      
      {/* 1. PANTALLA INICIAL: SELECCIÓN DE LÍNEA DE TRABAJO */}
      {!selectedLineId ? (
        <div className="welcome-screen">
          <Activity className="welcome-logo" size={56} />
          <h2 className="welcome-title">SmartAssign PWA</h2>
          <p className="welcome-subtitle">
            Selecciona tu línea de producción para iniciar como Supervisor en Piso.
          </p>

          <div className="line-grid-selector">
            {lines.length === 0 ? (
              <div style={{ gridColumn: 'span 2', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                Cargando base de datos en tiempo real...
              </div>
            ) : (
              lines.map(l => {
                const esPrio = l.prioridad <= 3;
                return (
                  <button
                    key={l.idLinea}
                    className={`line-btn-large ${esPrio ? 'priority' : ''}`}
                    onClick={() => setSelectedLineId(l.idLinea)}
                  >
                    <span>{esPrio ? "Línea Prioritaria" : "Línea Estándar"}</span>
                    <h3>{l.nombre}</h3>
                    <span style={{ fontSize: '0.65rem', opacity: 0.7, marginTop: '4px' }}>
                      SKU: {l.skuActual}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      ) : (
        
        /* 2. INTERFAZ MÓVIL DEL SUPERVISOR EN PISO */
        <>
          {/* HEADER MÓVIL */}
          <header className="mobile-header">
            <div className="header-title-sec">
              <span className="header-line-name">{currentLine?.nombre}</span>
              <span className="header-sku">SKU: {currentLine?.skuActual}</span>
            </div>
            
            <div className="header-actions">
              {/* Toggle de velocidad de simulación */}
              <button 
                className="icon-btn"
                onClick={() => setSimSpeed(prev => prev === 20 ? 1 : 20)}
                title="Acelerar Tiempo"
                style={{ color: simSpeed === 20 ? 'var(--color-warning)' : 'var(--text-secondary)' }}
              >
                <FastForward size={18} />
              </button>
              
              {/* Cambiar de línea */}
              <button 
                className="icon-btn" 
                onClick={() => {
                  setSelectedLineId(null);
                  setQrError('');
                  setQrSuccess('');
                  setQrWarning('');
                }}
              >
                <LogOut size={18} />
              </button>
            </div>
          </header>

          {/* BARRA DE ESTADO Y PAROS */}
          <div className="line-status-bar">
            <div className="status-indicator">
              <div className={`status-dot ${currentLine?.estado === 'Operando' ? 'active' : 'prep'}`}></div>
              <span>Línea {currentLine?.estado}</span>
            </div>

            <button
              className={`btn ${currentLine?.estado === 'Operando' ? 'btn-secondary' : 'btn-primary'}`}
              style={{ padding: '4px 10px', fontSize: '0.75rem', borderRadius: '6px' }}
              onClick={() => handleToggleParoPreparacion(currentLine)}
            >
              {currentLine?.estado === 'Operando' ? 'Detener Línea (Paro)' : 'Arrancar Operación'}
            </button>
          </div>

          {/* NOTIFICACIONES Y ALERTAS EN LA PARTE SUPERIOR */}
          <div className="mobile-alerts-container">
            {alertasSupervisor.length === 0 ? (
              <div style={{ padding: '0.5rem', backgroundColor: 'rgba(255,255,255,0.01)', border: '1px dashed var(--border-color)', borderRadius: '10px', textAlign: 'center', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                Sin notificaciones operativas en curso.
              </div>
            ) : (
              alertasSupervisor.map(a => (
                <div key={a.id} className="mobile-alert-card">
                  <div className="mobile-alert-header">
                    <span>{a.title}</span>
                    <AlertTriangle size={14} style={{ color: 'var(--color-warning)' }} />
                  </div>
                  <div className="mobile-alert-body">{a.message}</div>
                  
                  {/* ACCIONES DIRECTAS EN UN SOLO CLIC */}
                  {a.type === 'solicitud_rotacion' && selectedLineId === 'L8' && (
                    <button 
                      className="mobile-alert-btn success"
                      onClick={() => handleAprobarSalidaRapida(a.id)}
                    >
                      ✓ APROBAR Y DESPACHAR TRABAJADOR
                    </button>
                  )}
                  
                  {(a.type === 'esperando_recepcion' || a.type === 'transito') && (
                    <button 
                      className="mobile-alert-btn"
                      onClick={() => handleRegistrarLlegadaRapida(a.id)}
                    >
                      ➜ REGISTRAR LLEGADA DE RELEVISTA
                    </button>
                  )}
                </div>
              ))
            )}
          </div>

          {/* LISTADO DE PUESTOS EN PISO */}
          <div className="mobile-content-scroll">
            <h3 style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '0.25rem', paddingLeft: '4px' }}>
              Puestos de Trabajo ({puestosDeLinea.length})
            </h3>
            
            {puestosDeLinea.map(p => {
              const worker = workers.find(w => w.idWorker === p.idWorkerAsignado);
              const isFijo = p.tipo === 'Fijo';

              return (
                <div key={p.idPuesto} className="puesto-card-mobile">
                  <div className="puesto-meta">
                    <span className="puesto-badge-micro fijo">
                      {isFijo ? 'Fijo Técnico' : `Vario • Relevo`}
                    </span>
                    <span className="puesto-task-name">{p.nombreTarea}</span>
                    
                    {!isFijo && worker && (
                      <span className={`puesto-time-left ${p.timer <= 30 ? 'urgent' : ''}`}>
                        Relevo en {Math.floor(p.timer / 60)}:{String(p.timer % 60).padStart(2, '0')} min
                      </span>
                    )}
                  </div>

                  {worker ? (
                    <div className="puesto-user-box filled">
                      <div className="puesto-user-info">
                        <span className="puesto-user-name">{worker.nombre}</span>
                        <span className="puesto-user-role">{worker.rol}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="puesto-user-box" style={{ borderStyle: 'dashed' }}>
                      <span className="puesto-user-empty">Vacante</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* BOTÓN FLOTANTE PRINCIPAL (FAB) - ACCIÓN DE ESCANEO DE QR */}
          <div className="mobile-fab-container">
            <button 
              className="btn-fab-qr"
              onClick={() => setShowQrModal(true)}
            >
              <QrCode size={20} />
              ESCANEAR QR EN PISO
            </button>
          </div>

          {/* MINI FEED DE LOGS AL PIE */}
          <div className="mini-log-bar">
            {logs.length > 0 ? `[${logs[0].timeFormatted || ''}] ${logs[0].message}` : 'SmartAssign: Sistema de planta activo.'}
          </div>
        </>
      )}

      {/* --- MODAL DE ESCANEO CON CÁMARA QR DE DISPOSITIVO MÓVIL --- */}
      {showQrModal && (
        <div className="modal-overlay-mobile">
          <div className="modal-content-mobile" style={{ maxHeight: '90%' }}>
            <div className="modal-mobile-header">
              <span className="modal-mobile-title" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Camera size={18} style={{ color: 'var(--color-primary)' }} />
                Escáner Cámara Trasera
              </span>
              <button 
                className="icon-btn" 
                onClick={() => {
                  setShowQrModal(false);
                  setSelectedWorkerQR('');
                  setQrError('');
                  setQrSuccess('');
                  setQrWarning('');
                }}
              >
                ✕
              </button>
            </div>

            {/* VISOR DE CÁMARA POR HARDWARE (HTML5 QR CODE) */}
            <div 
              id="reader" 
              style={{ 
                width: '100%', 
                maxWidth: '350px', 
                margin: '0 auto', 
                borderRadius: '16px', 
                overflow: 'hidden', 
                border: '2px solid var(--border-color)',
                backgroundColor: '#000',
                position: 'relative'
              }}
            >
              {!usandoCamaraHardware && (
                <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                  Enciando lente de la cámara del teléfono...
                </div>
              )}
            </div>

            {/* SELECTOR MOCK DE FALLBACK (Para simular en navegadores de PC sin cámara física) */}
            {!usandoCamaraHardware && (
              <div style={{ margin: '0.5rem 0', border: '1px dashed var(--border-color)', padding: '0.75rem', borderRadius: '12px' }}>
                <span style={{ fontSize: '0.7rem', color: 'var(--color-warning)', fontWeight: 600, display: 'block', marginBottom: '0.5rem' }}>
                  ⚠ SIMULADOR DE CÁMARA MÓVIL (PC/Fallback):
                </span>
                <select
                  style={{ width: '100%', padding: '0.65rem', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '10px', color: '#fff', fontSize: '0.8rem' }}
                  value={selectedWorkerQR}
                  onChange={(e) => {
                    setSelectedWorkerQR(e.target.value);
                    setQrError('');
                    setQrSuccess('');
                    setQrWarning('');
                  }}
                >
                  <option value="">-- Seleccionar Trabajador Físico --</option>
                  <optgroup label="Pool de Arranque (Registrados por Huella)">
                    {workers.filter(w => w.estadoActual === 'POOL_ARRANQUE').map(w => (
                      <option key={w.idWorker} value={w.idWorker}>{w.nombre} ({w.rol})</option>
                    ))}
                  </optgroup>
                  <optgroup label="Operarios en Tránsito a esta Línea">
                    {workers.filter(w => w.estadoActual === 'EN_TRANSITO' && w.lineaDestinoId === selectedLineId).map(w => (
                      <option key={w.idWorker} value={w.idWorker}>{w.nombre} ({w.rol})</option>
                    ))}
                  </optgroup>
                  <optgroup label="Disponibles en Línea 8 (Bolsón)">
                    {workers.filter(w => w.estadoActual === 'DISPONIBLE_BOLSON').map(w => (
                      <option key={w.idWorker} value={w.idWorker}>{w.nombre} ({w.rol}) - L8</option>
                    ))}
                  </optgroup>
                </select>
                
                <button 
                  className="btn btn-primary" 
                  style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', fontSize: '0.8rem', marginTop: '0.5rem' }}
                  disabled={!selectedWorkerQR}
                  onClick={() => handleEscanearDirectoQR(selectedWorkerQR)}
                >
                  Simular Lectura QR Físico
                </button>
              </div>
            )}

            {qrError && (
              <div style={{ padding: '0.75rem', backgroundColor: 'var(--color-error-bg)', color: 'var(--color-error)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '10px', fontSize: '0.8rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <AlertCircle size={16} />
                <span>{qrError}</span>
              </div>
            )}

            {qrWarning && (
              <div style={{ padding: '0.75rem', backgroundColor: 'var(--color-warning-bg)', color: 'var(--color-warning)', border: '1px solid rgba(245, 158, 11, 0.2)', borderRadius: '10px', fontSize: '0.8rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <AlertTriangle size={16} />
                <span>{qrWarning}</span>
              </div>
            )}

            {qrSuccess && (
              <div style={{ padding: '0.75rem', backgroundColor: 'var(--color-success-bg)', color: 'var(--color-success)', border: '1px solid rgba(16, 185, 129, 0.2)', borderRadius: '10px', fontSize: '0.8rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <CheckCircle size={16} />
                <span>{qrSuccess}</span>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}

export default App;
