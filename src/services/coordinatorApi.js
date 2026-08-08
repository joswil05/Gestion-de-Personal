import { io } from 'socket.io-client';
import { getToken, logoutUser } from './authService';

const API_URL = 'http://localhost:3001/api';
export const socket = io('http://localhost:3001');

async function fetchWithAuth(url, options = {}) {
  const token = getToken();
  const headers = {
    ...options.headers,
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, { ...options, headers });
  
  if (response.status === 401 || response.status === 403) {
    console.error("Authentication Error: Token expirado o acceso denegado. Forzando logout.");
    await logoutUser();
    window.location.reload(); // Simple redirect a login
    throw new Error("Sesión expirada o acceso denegado.");
  }
  
  return response;
}

// Mocks variables if they are used as references
export const db = {};
export const puestosColl = 'puestos';
export const trabajadoresColl = 'trabajadores';

// Escuchar eventos globales de conexión
socket.on('connect', () => console.log('🟢 Conectado al servidor de WebSockets (Node.js)'));
socket.on('disconnect', () => console.log('🔴 Desconectado del servidor'));

export function subscribeToPuestos(callback) {
  const fetchPuestos = async () => {
    try {
      const response = await fetchWithAuth(`${API_URL}/puestos`);
      if (response.ok) {
        const data = await response.json();
        callback(data);
      }
    } catch(e) {}
  };
  
  fetchPuestos();
  const handleUpdate = () => fetchPuestos();
  
  socket.on('puestos_updated', handleUpdate);
  return () => socket.off('puestos_updated', handleUpdate);
}

export function subscribeToTrabajadores(callback) {
  const fetchWorkers = async () => {
    try {
      const response = await fetchWithAuth(`${API_URL}/operarios`); // all workers
      if (response.ok) {
        const data = await response.json();
        // format data
        const formatted = data.map(w => ({
            ...w,
            id: w.Id.toString(),
            name: w.NombreCompleto,
            role: w.PuestoBase,
            status: w.EstadoActual,
            medicalRestrictions: w.MedicalRestrictions ? JSON.parse(w.MedicalRestrictions) : []
        }));
        callback(formatted);
      }
    } catch(e) {}
  };
  
  fetchWorkers(); // initial fetch
  const handleUpdate = () => fetchWorkers(); // fetch on socket update
  
  socket.on('trabajadores_updated', handleUpdate);
  return () => socket.off('trabajadores_updated', handleUpdate);
}
export function subscribeToLineas(callback) {
  socket.on('lineas_updated', callback);
  return () => socket.off('lineas_updated', callback);
}

export async function getSupervisorsFromApi() {
  try {
    const response = await fetchWithAuth(`${API_URL}/supervisores`);
    if (!response.ok) throw new Error("Error obteniendo supervisores");
    return await response.json();
  } catch (error) {
    console.error("Error en getSupervisorsFromApi:", error);
    return [];
  }
}

/**
 * Obtiene el historial del día (Mock/API)
 */
export async function getHistorialDia(fecha) {
  try {
    const response = await fetchWithAuth(`${API_URL}/historial?fecha=${fecha}`);
    if (response.ok) {
      return await response.json();
    }
    return null;
  } catch (error) {
    console.error("Error en getHistorialDia:", error);
    return null;
  }
}

/**
 * Guarda el historial del día (Mock/API)
 */
export async function saveHistorialDia(fecha, data) {
  try {
    const response = await fetchWithAuth(`${API_URL}/historial`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fecha, data })
    });
    return response.ok;
  } catch (error) {
    console.error("Error en saveHistorialDia:", error);
    return false;
  }
}

/**
 * Obtiene el programa de producción (Mock/API)
 */
export async function getProgramaProduccionPorFecha(fecha) {
  try {
    const response = await fetchWithAuth(`${API_URL}/programa?fecha=${fecha}`);
    if (response.ok) {
      return await response.json();
    }
    return null;
  } catch (error) {
    console.error("Error en getProgramaProduccionPorFecha:", error);
    return null;
  }
}

/**
 * Asigna puestos en vivo (Mock/API)
 */
export async function assignPuestosLive(lineId, assignments) {
  try {
    const response = await fetchWithAuth(`${API_URL}/puestos/asignar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lineId, assignments })
    });
    return response.ok;
  } catch (error) {
    console.error("Error en assignPuestosLive:", error);
    return false;
  }
}

/**
 * Inicializa el turno con Sheets (Mock/API)
 */
export async function initializeTurnoWithSheets(lineId, config) {
  try {
    const response = await fetchWithAuth(`${API_URL}/turno/inicializar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lineId, config })
    });
    return response.ok;
  } catch (error) {
    console.error("Error en initializeTurnoWithSheets:", error);
    return false;
  }
}

/**
 * Helper genérico de fetch autenticado que, a diferencia del resto de este
 * archivo, propaga el error real del servidor en vez de tragárselo como
 * `false` — lo usan las funciones de Planificación T+1 y de Gestión de
 * Personal, donde el Coordinador necesita ver por qué falló algo (falta un
 * supervisor, cargo inválido, nómina duplicada, etc.), no solo que falló.
 */
async function apiJsonFetch(path, options = {}) {
  const response = await fetchWithAuth(`${API_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || `Error de red (HTTP ${response.status})`);
  }
  return payload;
}

/**
 * PLANIFICACIÓN T+1 (real, SQL Server): reemplaza el flujo roto de
 * config/next_day_plan (ver programNextDayShift más abajo, que sigue viva
 * solo porque DevConsole.jsx todavía la importa, pero no se usa desde
 * PanelCoordinador.jsx). Pegan contra PlanificacionLineas (server/server.js).
 */
export async function getPlanificacion(fecha) {
  return apiJsonFetch(`/planificacion?fecha=${encodeURIComponent(fecha)}`);
}

export async function guardarPlanificacion(fecha, lineas) {
  return apiJsonFetch('/planificacion/guardar', {
    method: 'POST',
    body: JSON.stringify({ fecha, lineas })
  });
}

export async function confirmarPlanificacion(fecha) {
  return apiJsonFetch('/planificacion/confirmar', {
    method: 'POST',
    body: JSON.stringify({ fecha })
  });
}

/**
 * GESTIÓN DE PERSONAL (real, SQL Server): CRUD de Operarios para el
 * Coordinador — reemplaza el <select> de la pestaña "Ausencias" que
 * escribía contra el shim muerto de Firestore (db={} de este mismo
 * archivo) y nunca persistía nada. Pegan contra server/server.js
 * (GET/POST/PATCH /api/operarios...).
 */
export async function getOperariosGestion() {
  return apiJsonFetch('/operarios/gestion');
}

export async function crearOperario(data) {
  return apiJsonFetch('/operarios', { method: 'POST', body: JSON.stringify(data) });
}

export async function actualizarOperario(id, data) {
  return apiJsonFetch(`/operarios/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export async function darBajaOperario(id, motivo) {
  return apiJsonFetch(`/operarios/${id}/baja`, { method: 'POST', body: JSON.stringify({ motivo }) });
}

export async function reactivarOperario(id) {
  return apiJsonFetch(`/operarios/${id}/reactivar`, { method: 'POST' });
}

/**
 * Programa el turno del siguiente día (Mock/API)
 * NOTA: rota (apunta a /api/turno/programar-siguiente, que no existe en
 * server.js). Ya no se usa desde PanelCoordinador.jsx -reemplazada por
 * guardarPlanificacion/confirmarPlanificacion, arriba-; sigue exportada
 * únicamente porque src/dev/DevConsole.jsx (herramienta de desarrollo,
 * excluida del build de producción) todavía la importa.
 */
export async function programNextDayShift(lineId, config) {
  try {
    const response = await fetchWithAuth(`${API_URL}/turno/programar-siguiente`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lineId, config })
    });
    return response.ok;
  } catch (error) {
    console.error("Error en programNextDayShift:", error);
    return false;
  }
}

// NOTA: executeCoordinatorSuggestion vivía aquí apuntando a
// POST /api/sugerencias/ejecutar (ruta que nunca existió en server.js) con
// una firma (un solo objeto) incompatible con cómo la llama
// PanelCoordinador.jsx (3 argumentos posicionales). Se eliminó: la versión
// real vive en apiService.js, sobre la acción 'aplicar_sugerencia' del
// despachador POST /puestos/relevo.

/**
 * Verifica si el trabajador puede ocupar el puesto (Reglas de Salud Ocupacional).
 * Duplicado del servidor para mantener UI optimista.
 */
export function canWorkerOccupiedSlot(workerData, puestoData) {
    if(!workerData || !puestoData) return true;
    
    // 1. Restricción médica
    let requiredCaps = [];
    try { if (puestoData.RequiredCapabilities) requiredCaps = JSON.parse(puestoData.RequiredCapabilities); } catch (e) {}
    
    let medicalRestrictions = [];
    try { if (workerData.MedicalRestrictions) medicalRestrictions = JSON.parse(workerData.MedicalRestrictions); } catch (e) {}
    
    if (requiredCaps.includes('ESFUERZO_FISICO') && medicalRestrictions.includes('ESFUERZO_FISICO')) {
        return false;
    }

    // 2. Fatiga 24h
    if (puestoData.ActivityName && workerData.LastActivity && puestoData.ActivityName === workerData.LastActivity) {
        return false;
    }

    // 3. Género
    // NOTA (limpieza Fase 3): se quitó el fallback que adivinaba el sexo por
    // nombre cuando Sexo venía vacío (los 153 operarios reales sembrados ya
    // lo tienen poblado). Si falta, no se aplica la restricción.
    const sexoPreferente = puestoData.SexoPreferente;
    if (sexoPreferente === 'Masculino' || sexoPreferente === 'Femenino') {
        const workerSexo = workerData.Sexo;
        if (workerSexo && workerSexo !== sexoPreferente) return false;
    }
    return true;
}

/**
 * Asigna supervisor a una línea (Mock/API)
 */
export async function assignSupervisorToLine(lineId, supervisorId) {
  try {
    const response = await fetchWithAuth(`${API_URL}/supervisores/asignar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lineId, supervisorId })
    });
    return response.ok;
  } catch (error) {
    console.error("Error en assignSupervisorToLine:", error);
    return false;
  }
}
