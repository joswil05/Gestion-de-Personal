import React, { useState, useEffect, useRef } from 'react';
import { 
  dbEmulator,
  firebaseInicializarTurno,
  firebaseEscanearQR,
  firebaseAprobarDespachoRotacion,
  firebaseCompletarRotacionYCascada,
  firebaseReincorporarTrabajador,
  firebaseActivarPreparacion,
  firebaseRestablecerLinea,
  ORDEN_PRIORIDADES
} from './services/firebaseService';
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
  Settings
} from 'lucide-react';
import './App.css';

function App() {
  // --- ESTADOS DE LA APLICACIÓN (Sincronizados en tiempo real con Firestore) ---
  const [workers, setWorkers] = useState([]);
  const [lines, setLines] = useState([]);
  const [puestos, setPuestos] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [logs, setLogs] = useState([]);

  // --- ESTADOS LOCALES DE INTERFAZ ---
  const [activeTab, setActiveTab] = useState('coordinador');
  const [selectedLineId, setSelectedLineId] = useState('L4');
  const [turnoIniciado, setTurnoIniciado] = useState(false);
  const [selectedWorkerQR, setSelectedWorkerQR] = useState('');
  const [qrError, setQrError] = useState('');
  const [qrSuccess, setQrSuccess] = useState('');
  const [qrWarning, setQrWarning] = useState('');
  const [showQrModal, setShowQrModal] = useState(false);
  const [showSheetsModal, setShowSheetsModal] = useState(false);

  // --- ESTADO DEL SIMULADOR DE TIEMPO ---
  const [simTime, setSimTime] = useState({ hour: 6, minute: 0, second: 0 });
  const [simSpeed, setSimSpeed] = useState(1); // 0: Pausado, 1: Normal, 20: Rápido
  const timerRef = useRef(null);

  // 1. SUSCRIPCIÓN EN TIEMPO REAL A FIRESTORE (Patrón de diseño reactivo corporativo)
  useEffect(() => {
    const unsubscribe = dbEmulator.subscribe(state => {
      setWorkers(state.workers);
      setLines(state.lines);
      setPuestos(state.puestos);
      setAlerts(state.alerts);
      setLogs(state.logs);
      
      // Activar flag de turno si hay puestos cargados en la base de datos
      if (state.puestos.length > 0) {
        setTurnoIniciado(true);
      }
    });

    return () => unsubscribe();
  }, []);

  // 2. RELOJ DE SIMULACIÓN Y DECREMENTO DE TEMPORIZADORES EN FIRESTORE
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

        // Actualizar temporizadores de puestos directamente en la base de datos mediante transacciones
        if (turnoIniciado) {
          dbEmulator.runTransaction(async (transaction) => {
            const todosLosPuestos = transaction.query('puestos', p => p.tipo === 'Vario' && p.idWorkerAsignado !== null);
            
            todosLosPuestos.forEach(p => {
              if (p.timer > 0) {
                const nuevoTiempo = Math.max(0, p.timer - 1 * simSpeed);
                transaction.update('puestos', p.idPuesto, { timer: nuevoTiempo });

                // Al llegar a menos de 30 segundos, el motor detecta la necesidad de rotación
                if (nuevoTiempo <= 30 && nuevoTiempo > 0 && !p.rotacionIniciada) {
                  transaction.update('puestos', p.idPuesto, { rotacionIniciada: true });
                  
                  // Lanzar rotación
                  const workerSaliente = transaction.get('workers', p.idWorkerAsignado);
                  
                  // Buscar operario compatible en Línea 8
                  const candidatosL8 = transaction.query('workers', w => 
                    w.lineaActualId === 'L8' && 
                    w.estadoActual === 'DISPONIBLE_BOLSON' &&
                    evaluarFiltrosSimples(w, p) === true
                  );

                  if (candidatosL8.length > 0) {
                    const relevo = candidatosL8[0];
                    const alertaId = `ALERTA_ROT_${p.idPuesto}_${relevo.idWorker}_${Date.now()}`;
                    
                    transaction.set('alerts', alertaId, {
                      id: alertaId,
                      type: 'solicitud_rotacion',
                      title: `ROTACIÓN REQUERIDA (L8 ➜ ${p.idLinea})`,
                      message: `Línea prioritaria ${p.idLinea} solicita a ${relevo.nombre} para relevar a ${workerSaliente.nombre} en ${p.nombreTarea}.`,
                      workerSalienteId: workerSaliente.idWorker,
                      workerEntranteId: relevo.idWorker,
                      puestoId: p.idPuesto,
                      lineaPrioId: p.idLinea,
                      lineaL8Id: 'L8'
                    });
                    
                    dbEmulator.addLog(`Servicio Rotación: Alerta emitida. Solicitando relevo de L8 para ${p.nombreTarea}.`, 'warning');
                  } else {
                    // Si no hay candidatos, retrasamos levemente el timer para reintentar después
                    transaction.update('puestos', p.idPuesto, { timer: 30, rotacionIniciada: false });
                  }
                }
              }
            });
          });
        }

        return { hour: newHour, minute: newMin, second: newSec };
      });
    }, 1000);

    return () => clearInterval(timerRef.current);
  }, [simSpeed, turnoIniciado]);

  // Función de evaluación simple de filtros para el cron en background
  const evaluarFiltrosSimples = (worker, puesto) => {
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

  // --- INTERACCIONES DE INTERFAZ QUE LLAMAN AL CEREBRO DE FIREBASE ---

  const handleIniciarTurno = async () => {
    try {
      await firebaseInicializarTurno();
    } catch (e) {
      console.error(e);
    }
  };

  const handleEscanearQRSupervisor = async () => {
    setQrError('');
    setQrSuccess('');
    setQrWarning('');

    try {
      const result = await firebaseEscanearQR(selectedWorkerQR, selectedLineId);
      if (result.status === 'redirigido') {
        setQrWarning(result.msg);
      } else {
        setQrSuccess(`Asignación Exitosa: Trabajador asignado a ${result.puesto}.`);
        // Ocultar modal tras éxito
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

  const handleAprobarDespacho = async (alerta) => {
    try {
      await firebaseAprobarDespachoRotacion(alerta.id);
    } catch (error) {
      dbEmulator.addLog(`Error en despacho: ${error.message}`, 'error');
    }
  };

  const handleCompletarRotacion = async (alerta) => {
    try {
      await firebaseCompletarRotacionYCascada(alerta.id);
    } catch (error) {
      dbEmulator.addLog(`Error al rotar: ${error.message}`, 'error');
    }
  };

  const handleReincorporar = async (workerId) => {
    try {
      await firebaseReincorporarTrabajador(workerId);
    } catch (error) {
      dbEmulator.addLog(`Error en reincorporación: ${error.message}`, 'error');
    }
  };

  const handleActivarParo = async (lineaId) => {
    try {
      await firebaseActivarPreparacion(lineaId);
    } catch (error) {
      dbEmulator.addLog(`Error en paro: ${error.message}`, 'error');
    }
  };

  const handleRestablecerOperacion = async (lineaId) => {
    try {
      await firebaseRestablecerLinea(lineaId);
    } catch (error) {
      dbEmulator.addLog(`Error al restablecer: ${error.message}`, 'error');
    }
  };

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
            v2.0 (Firestore Engine)
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
              <span className="stat-label">Bajas Médicas</span>
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
                Simulando transacciones atómicas a 20x en Firestore
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
                Motor transaccional de Firebase. Valida la compatibilidad técnica, restricciones médicas, regla de no repetición y cascada de prioridades a nivel de base de datos.
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
            
            /* TABS PRINCIPALES */
            <>
              {activeTab === 'coordinador' && (
                <div className="coordinator-grid">
                  
                  {/* COLUMNA IZQUIERDA: LINEAS DE PRODUCCION */}
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
                        const esPrio = l.prioridad <= 3;

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

                    {/* EVENT FEED DE FIRESTORE */}
                    <div className="glass-panel" style={{ padding: '1.25rem', marginTop: '2rem' }}>
                      <h3 style={{ fontSize: '0.95rem', marginBottom: '0.75rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                        Servidor de Transacciones de Firestore (En vivo)
                      </h3>
                      <div style={{ height: '180px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem', fontFamily: 'monospace', fontSize: '0.75rem' }}>
                        {logs.length === 0 ? (
                          <div style={{ color: 'var(--text-muted)', textAlign: 'center', marginTop: '3rem' }}>Esperando transacciones de base de datos...</div>
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

                  {/* COLUMNA DERECHA: ALERTAS Y ACCIONES DE COORDINADOR */}
                  <div className="side-panel">
                    
                    {/* VISOR DE NOTIFICACIONES */}
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
                            <div>Base de datos consistente. Sin rotaciones pendientes.</div>
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
                                    <button className="action-btn approve" onClick={() => handleAprobarDespacho(a)}>
                                      Aprobar Despacho
                                    </button>
                                    <button className="action-btn reject" onClick={() => dbEmulator.runTransaction(async t => t.delete('alerts', a.id))}>
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

                    {/* CONTROL DE LICENCIAS / REINCORPORACIONES */}
                    <div className="glass-panel" style={{ padding: '1.25rem' }}>
                      <div className="panel-header">
                        <span className="panel-title">Altas / Bajas Médicas</span>
                      </div>
                      
                      <div className="worker-list">
                        {workers.filter(w => w.estadoActual === 'BAJA_TEMPORAL').length === 0 ? (
                          <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                            Sin personal en BAJA_TEMPORAL hoy.
                          </div>
                        ) : (
                          workers.filter(w => w.estadoActual === 'BAJA_TEMPORAL').map(w => (
                            <div key={w.idWorker} className="worker-item">
                              <div className="worker-info">
                                <span className="worker-name">{w.nombre}</span>
                                <span className="worker-sub" style={{ color: 'var(--color-error)' }}>{w.rol} • {w.restriccionesMedicas.join(', ') || 'Licencia'}</span>
                              </div>
                              <button 
                                className="btn btn-secondary" 
                                style={{ padding: '4px 8px', fontSize: '0.75rem', color: 'var(--color-success)', borderColor: 'rgba(16, 185, 129, 0.2)' }}
                                onClick={() => handleReincorporar(w.idWorker)}
                              >
                                Reincorporar
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* POOL DE ARRANQUE */}
                    <div className="glass-panel" style={{ padding: '1.25rem' }}>
                      <div className="panel-header">
                        <span className="panel-title">Pool de Arranque ({workers.filter(w => w.estadoActual === 'POOL_ARRANQUE').length})</span>
                      </div>
                      
                      <div className="worker-list" style={{ maxHeight: '200px' }}>
                        {workers.filter(w => w.estadoActual === 'POOL_ARRANQUE').length === 0 ? (
                          <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                            Pool de arranque vacío. Personal asignado.
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
                  
                  {/* SELECTOR DE LINEAS */}
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

                  {/* VISTA EN DETALLE DE LINEA */}
                  <div className="line-detail-panel">
                    
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
                            <button className="btn btn-danger" style={{ padding: '0.5rem 1rem' }} onClick={() => handleActivarParo(linea.idLinea)}>
                              Modo "En Preparación" (Paro)
                            </button>
                          ) : (
                            <button className="btn btn-primary" style={{ padding: '0.5rem 1rem', backgroundColor: 'var(--color-success)' }} onClick={() => handleRestablecerOperacion(linea.idLinea)}>
                              Restablecer Operación
                            </button>
                          )}
                          <button className="btn btn-primary" style={{ padding: '0.5rem 1rem' }} onClick={() => setShowQrModal(true)}>
                            Escaneo QR Móvil
                          </button>
                        </div>
                      </div>
                    ))}

                    {/* ALERTAS EN LA VISTA DE SUPERVISOR */}
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
                              <button className="action-btn approve" onClick={() => handleAprobarDespacho(alerta)}>
                                Aprobar y Despachar a {workers.find(w => w.idWorker === alerta.workerEntranteId).nombre}
                              </button>
                              <button className="action-btn reject" onClick={() => dbEmulator.runTransaction(async t => t.delete('alerts', alerta.id))}>
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
                            <button className="action-btn approve" onClick={() => {
                              setSelectedWorkerQR(alerta.workerId);
                              setShowQrModal(true);
                            }}>
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
              Simula el escaneo de un código QR en la <strong>{lines.find(l => l.idLinea === selectedLineId).nombre}</strong>.
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
                <optgroup label="Otros en Tránsito General">
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
                onClick={handleEscanearQRSupervisor}
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
