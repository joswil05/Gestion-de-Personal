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
  UserCheck,
  RefreshCw
} from 'lucide-react';
import './App.css';

function App() {
  // --- ESTADOS DE BASE DE DATOS SINCRONIZADOS ---
  const [workers, setWorkers] = useState([]);
  const [lines, setLines] = useState([]);
  const [puestos, setPuestos] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [logs, setLogs] = useState([]);

  // --- ESTADOS DE PANTALLA EXCLUSIVA MÓVIL ---
  const [selectedLineId, setSelectedLineId] = useState(null); // NULL: Muestra selector de línea inicial
  const [showQrModal, setShowQrModal] = useState(false);
  const [selectedWorkerQR, setSelectedWorkerQR] = useState('');
  const [qrError, setQrError] = useState('');
  const [qrSuccess, setQrSuccess] = useState('');
  const [qrWarning, setQrWarning] = useState('');

  // --- TEMPORIZADOR DE SIMULACIÓN ---
  const [simTime, setSimTime] = useState({ hour: 6, minute: 0, second: 0 });
  const [simSpeed, setSimSpeed] = useState(1); // 0: Pausado, 1: Normal, 20: Rápido
  const timerRef = useRef(null);

  // 1. SUSCRIPCIÓN EN TIEMPO REAL A FIRESTORE REAL
  useEffect(() => {
    // Inicializar el turno y la base de datos automáticamente en Firestore real al arrancar
    firebaseInicializarTurno().catch(err => {
      console.warn("Base de datos ya inicializada o sin conexión en la nube.");
    });

    const unsubscribe = suscribirEstadoPlanta(state => {
      if (state.workers.length > 0) setWorkers(state.workers);
      if (state.lines.length > 0) setLines(state.lines);
      if (state.puestos.length > 0) setPuestos(state.puestos);
      setAlerts(state.alerts || []);
      setLogs(state.logs || []);
      
      if (state.puestos.length > 0) {
        setTurnoIniciado(true);
      }
    });

    return () => unsubscribe();
  }, []);

  // 2. CRON DE SIMULACIÓN EN FIRESTORE EN NUBE
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

        // Decremento atómico de temporizadores en Firestore real
        if (turnoIniciado) {
          firebaseDecrementarTemporizadores(simSpeed);
        }

        return { hour: newHour, minute: newMin, second: newSec };
      });
    }, 1000);

    return () => clearInterval(timerRef.current);
  }, [simSpeed, turnoIniciado]);

  const evaluarFiltrosBasicos = (worker, puesto) => {
    if (puesto.sexoRequerido !== 'Indiferente' && worker.sexo !== puesto.sexoRequerido) return false;
    if (worker.restriccionesMedicas && worker.restriccionesMedicas.length > 0) {
      const tieneRestriccion = puesto.restriccionesProhibidas && puesto.restriccionesProhibidas.some(r => 
        worker.restriccionesMedicas.includes(r)
      );
      if (tieneRestriccion) return false;
    }
    if (worker.ultimaActividadAyer && worker.ultimaActividadAyer.toLowerCase().trim() === puesto.nombreTarea.toLowerCase().trim()) return false;
    return true;
  };

  // --- ACCIONES RÁPIDAS MÓVILES EN PISO ---

  const handleEscanearDirecto = async () => {
    setQrError('');
    setQrSuccess('');
    setQrWarning('');

    try {
      const result = await firebaseEscanearQR(selectedWorkerQR, selectedLineId);
      
      if (result.status === 'redirigido') {
        setQrWarning(result.msg);
        setTimeout(() => {
          setShowQrModal(false);
          setSelectedWorkerQR('');
          setQrWarning('');
        }, 2000);
      } else {
        setQrSuccess(`¡ASIGNADO! ${result.puesto}`);
        setTimeout(() => {
          setShowQrModal(false);
          setSelectedWorkerQR('');
          setQrSuccess('');
        }, 1200);
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

  // Alertas específicas que incumben al supervisor de esta línea
  // - Si es L8: ve solicitudes de rotación para despachar gente
  // - Si es prioritaria: ve recepciones pendientes de relevistas en tránsito
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
            Selecciona tu línea de producción asignada para bloquear el dispositivo en el piso de la planta.
          </p>

          <div className="line-grid-selector">
            {lines.map(l => {
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
            })}
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
              {/* Selector de velocidad del simulador en esquina (sutil para pruebas) */}
              <button 
                className="icon-btn"
                onClick={() => setSimSpeed(prev => prev === 20 ? 1 : 20)}
                title="Acelerar Tiempo"
                style={{ color: simSpeed === 20 ? 'var(--color-warning)' : 'var(--text-secondary)' }}
              >
                <FastForward size={18} />
              </button>
              
              {/* Cambiar de línea (Volver) */}
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
                <div key={a.id} className={`mobile-alert-card ${a.type === 'esperando_recepcion' ? 'info' : ''}`}>
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
              onClick={() => {
                setQrError('');
                setQrSuccess('');
                setQrWarning('');
                setShowQrModal(true);
              }}
            >
              <QrCode size={20} />
              ESCANEAR QR EN PISO
            </button>
          </div>

          {/* MINI FEED DE LOGS AL PIE */}
          <div className="mini-log-bar">
            {logs.length > 0 ? `[${logs[0].timestamp}] ${logs[0].message}` : 'SmartAssign: Sistema de planta activo.'}
          </div>
        </>
      )}

      {/* --- MODAL DE ESCANEO QR SIMULADO OPTIMIZADO PARA MÓVIL --- */}
      {showQrModal && (
        <div className="modal-overlay-mobile">
          <div className="modal-content-mobile">
            <div className="modal-mobile-header">
              <span className="modal-mobile-title">Registrar Trabajador (QR)</span>
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

            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Apunta la cámara del celular al código QR del operario para validarlo en milisegundos con Firebase.
            </p>

            <div style={{ margin: '0.5rem 0' }}>
              <label style={{ display: 'block', fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                Seleccionar Operario Escaneado:
              </label>
              <select
                style={{ width: '100%', padding: '0.75rem', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '10px', color: '#fff', fontSize: '0.85rem' }}
                value={selectedWorkerQR}
                onChange={(e) => {
                  setSelectedWorkerQR(e.target.value);
                  setQrError('');
                  setQrSuccess('');
                  setQrWarning('');
                }}
              >
                <option value="">-- Escoger Trabajador --</option>
                <optgroup label="Pool de Arranque (Sala de Espera)">
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
            </div>

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

            <button 
              className="btn btn-primary" 
              style={{ width: '100%', padding: '0.85rem', borderRadius: '12px', fontSize: '0.9rem' }}
              disabled={!selectedWorkerQR}
              onClick={handleEscanearDirecto}
            >
              ✓ CONFIRMAR ESCANEO QR
            </button>
          </div>
        </div>
      )}

    </div>
  );
}

export default App;
