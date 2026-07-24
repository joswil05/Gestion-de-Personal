/**
 * Service: Authentication & Custom Claims Manager (authService.js)
 * Responsabilidad: Controlar el ciclo de vida de sesiones Firebase Auth y la asignación
 * de custom claims (role y lineId) sin comprometer las reglas de seguridad.
 */

import { 
  getAuth, 
  signInAnonymously, 
  signOut, 
  onAuthStateChanged 
} from "firebase/auth";
import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "./firebaseService.js";

export const auth = getAuth(app);
export const functions = getFunctions(app);

/**
 * Autentica al usuario anónimamente en Firebase Auth y solicita la asignación
 * de custom claims (role, lineId) mediante la Cloud Function `assignUserClaims`.
 * 
 * @param {object} params { role: 'COORDINADOR'|'SUPERVISOR', lineId: string, supervisorName: string, pin?: string }
 */
export async function loginWithRoleAndLine({ role, lineId, supervisorName, pin }) {
  try {
    // 1. Iniciar sesión anónima si no hay un usuario activo
    let currentUser = auth.currentUser;
    if (!currentUser) {
      const userCred = await signInAnonymously(auth);
      currentUser = userCred.user;
    }

    // 2. Invocar la Cloud Function de asignación de claims
    try {
      const assignUserClaimsFn = httpsCallable(functions, "assignUserClaims");
      await assignUserClaimsFn({
        role,
        lineId: role === "COORDINADOR" ? "ALL" : lineId,
        supervisorName,
        pin
      });
    } catch (fnErr) {
      console.warn("[AuthService] Cloud Function assignUserClaims no disponible o rechazó la solicitud:", fnErr.message);
      
      // Fallback para emuladores/desarrollo local cuando VITE_USE_EMULATORS está activo
      if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_USE_EMULATORS === 'true') {
        console.log("[AuthService] Entorno de emulador local detectado. Continuando sesión de desarrollo.");
      } else {
        throw fnErr;
      }
    }

    // 3. Forzar actualización del token JWT para cargar los nuevos Custom Claims
    if (auth.currentUser) {
      await auth.currentUser.getIdToken(true);
    }

    return auth.currentUser;
  } catch (error) {
    console.error("[AuthService] Error al autenticar usuario con rol:", error);
    throw error;
  }
}

/**
 * Cierra la sesión activa en Firebase Auth, revocando el token JWT del cliente.
 */
export async function logoutUser() {
  try {
    await signOut(auth);
    console.log("[AuthService] Sesión revocada exitosamente.");
  } catch (error) {
    console.error("[AuthService] Error al cerrar sesión:", error);
    throw error;
  }
}

/**
 * Suscriptor al cambio de estado de autenticación.
 */
export function onAuthStatusChange(callback) {
  return onAuthStateChanged(auth, callback);
}
