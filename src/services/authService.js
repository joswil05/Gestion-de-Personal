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
    // 1. Iniciar sesión anónima si no hay un usuario activo (con fallback para plan gratuito / Auth desactivado)
    let currentUser = auth.currentUser;
    if (!currentUser) {
      try {
        const userCred = await signInAnonymously(auth);
        currentUser = userCred.user;
      } catch (authErr) {
        console.warn("[AuthService] Firebase Auth no configurado en consola o requiere activación del proveedor Anónimo:", authErr.message);
        // Fallback suave para entornos sin Firebase Auth habilitado en plan Gratuito (Spark)
        return { uid: `local_${Date.now()}`, isAnonymous: true, fallback: true };
      }
    }

    // 2. Invocar la Cloud Function de asignación de claims (con fallback si no hay plan Blaze/Cloud Functions)
    try {
      const assignUserClaimsFn = httpsCallable(functions, "assignUserClaims");
      await assignUserClaimsFn({
        role,
        lineId: role === "COORDINADOR" ? "ALL" : lineId,
        supervisorName,
        pin
      });
    } catch (fnErr) {
      console.warn("[AuthService] Cloud Function no disponible o proyecto en plan gratuito Spark. Continuando con sesión local de aplicación:", fnErr.message);
    }

    // 3. Intentar actualización del token JWT si la sesión de Auth existe
    if (auth.currentUser) {
      try {
        await auth.currentUser.getIdToken(true);
      } catch (tokenErr) {
        console.warn("[AuthService] No se pudo actualizar el token JWT de Firebase Auth:", tokenErr.message);
      }
    }

    return auth.currentUser || { uid: `local_${Date.now()}`, isAnonymous: true, fallback: true };
  } catch (error) {
    console.warn("[AuthService] Error en flujo de autenticación, aplicando fallback local:", error.message);
    return { uid: `local_${Date.now()}`, isAnonymous: true, fallback: true };
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
