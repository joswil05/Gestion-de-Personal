/**
 * Service: Mock Authentication Manager (authService.js)
 * Responsabilidad: Simular una sesión local para la migración a SQL Server,
 * dado que TI se encargará de la autenticación real más adelante.
 */

import { API_URL } from '../config';

let currentUser = null;
const listeners = [];

function notifyListeners() {
  listeners.forEach(callback => callback(currentUser));
}

/**
 * Autentica al usuario contra el backend Node.js.
 * Acepta `username` (Coordinador, derivado del nombre tecleado) o
 * `supervisorId` (Supervisor, elegido de un desplegable que ya no expone
 * Username — ver LoginScreen.jsx y AUDIT_REPORT.md C-6 parte 2 / paso 2.3).
 * @param {object} params { username?, supervisorId?, password }
 */
export async function loginWithRoleAndLine({ username, supervisorId, password }) {
  const response = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, supervisorId, password })
  });

  if (!response.ok) {
    let errorMsg = 'Error de autenticación';
    try {
      const data = await response.json();
      errorMsg = data.error || errorMsg;
    } catch(e) {}
    // NO SILENT FALLBACK. Throw exception explicitly.
    throw new Error(errorMsg);
  }

  const data = await response.json();
  
  currentUser = {
    uid: data.user.id.toString(),
    isAnonymous: false,
    role: data.user.role,
    lineId: data.user.role === "COORDINADOR" ? "ALL" : data.user.lineId,
    displayName: data.user.username,
    token: data.token,
    forcePasswordChange: data.forcePasswordChange
  };
  
  sessionStorage.setItem('smartassign_mock_user', JSON.stringify(currentUser));
  
  notifyListeners();
  return currentUser;
}

/**
 * Cierra la sesión
 */
export async function logoutUser() {
  currentUser = null;
  sessionStorage.removeItem('smartassign_mock_user');
  // Sin esto, App.jsx sigue viendo una sesión válida en localStorage tras el
  // logout y vuelve a montar el panel → 401 → logout → reload, en bucle (C-5).
  localStorage.removeItem('supervisorName');
  localStorage.removeItem('supervisorLineId');
  localStorage.removeItem('userRole');
  notifyListeners();
  return true;
}

/**
 * Suscriptor al cambio de estado
 */
export function onAuthStatusChange(callback) {
  if (!currentUser) {
    const saved = sessionStorage.getItem('smartassign_mock_user');
    if (saved) {
      try {
        currentUser = JSON.parse(saved);
      } catch(e){}
    }
  }
  
  listeners.push(callback);
  callback(currentUser);
  
  return () => {
    const index = listeners.indexOf(callback);
    if (index > -1) listeners.splice(index, 1);
  };
}

export function getToken() {
  if (!currentUser) {
    const saved = sessionStorage.getItem('smartassign_mock_user');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return parsed.token;
      } catch(e){}
    }
    return null;
  }
  return currentUser.token;
}
