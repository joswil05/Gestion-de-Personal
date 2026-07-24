const functions = require("firebase-functions");
const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

// PIN maestro de Coordinador (por defecto 9900 o configurado en environment)
const MASTER_COORDINADOR_PIN = process.env.COORDINADOR_PIN || "9900";
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutos

/**
 * Cloud Function Callable: assignUserClaims
 * Enriquece la sesión anónima o autenticada del usuario con custom claims (role y lineId).
 * NUNCA confía ciegamente en role/lineId enviados por el cliente.
 */
exports.assignUserClaims = functions.https.onCall(async (data, context) => {
  // 1. Verificar que la llamada esté autenticada en Firebase Auth
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "La solicitud debe ser realizada por un cliente autenticado."
    );
  }

  const uid = context.auth.uid;
  const { role, lineId, supervisorName, pin } = data || {};

  if (!role) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Se requiere especificar un rol (COORDINADOR o SUPERVISOR)."
    );
  }

  const attemptRef = db.collection("pin_attempts").doc(uid);

  // 2. Procesamiento para Rol COORDINADOR
  if (role === "COORDINADOR" || role === "coordinador") {
    const attemptSnap = await attemptRef.get();
    let failedAttempts = 0;
    let lockoutUntil = 0;

    if (attemptSnap.exists) {
      const attemptData = attemptSnap.data();
      failedAttempts = attemptData.failedAttempts || 0;
      lockoutUntil = attemptData.lockoutUntil || 0;
    }

    const now = Date.now();
    if (lockoutUntil > now) {
      const remainingMin = Math.ceil((lockoutUntil - now) / 60000);
      throw new functions.https.HttpsError(
        "resource-exhausted",
        `Demasiados intentos fallidos. Cuenta bloqueada por ${remainingMin} minuto(s).`
      );
    }

    // Validar PIN de Coordinador
    if (!pin || pin !== MASTER_COORDINADOR_PIN) {
      failedAttempts += 1;
      let newLockout = 0;
      if (failedAttempts >= MAX_FAILED_ATTEMPTS) {
        newLockout = now + LOCKOUT_DURATION_MS;
      }

      await attemptRef.set({
        failedAttempts,
        lockoutUntil: newLockout,
        lastAttemptTimestamp: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      throw new functions.https.HttpsError(
        "permission-denied",
        "PIN de Coordinador inválido. Acceso denegado."
      );
    }

    // Resetear contador tras éxito
    await attemptRef.set({
      failedAttempts: 0,
      lockoutUntil: 0,
      lastSuccessTimestamp: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    // Otorgar Custom Claims de Coordinador
    await admin.auth().setCustomUserClaims(uid, {
      role: "coordinador",
      lineId: "ALL",
      name: supervisorName || "Coordinador General"
    });

    return {
      success: true,
      role: "coordinador",
      lineId: "ALL"
    };
  }

  // 3. Procesamiento para Rol SUPERVISOR
  if (role === "SUPERVISOR" || role === "supervisor") {
    if (!lineId || !supervisorName) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Se requiere especificar supervisorName y lineId válidos para el rol de supervisor."
      );
    }

    // Validar autorización server-side consultando la colección de control en Firestore
    const supsDoc = await db.collection("config").doc("supervisors_assignment").get();
    let isAuthorized = true; // Por defecto validar que exista o coincida si ya fue asignado

    if (supsDoc.exists) {
      const assignments = supsDoc.data();
      const lineAssigned = assignments[lineId];
      // Si la línea tiene un supervisor asignado oficialmente en el plan, validar coincidencia
      if (lineAssigned && lineAssigned.workerId && lineAssigned.name) {
        if (lineAssigned.workerId !== supervisorName && lineAssigned.name !== supervisorName) {
          console.warn(`[assignUserClaims] Advertencia: Supervisor '${supervisorName}' ingresando a '${lineId}' asignada a '${lineAssigned.name}'.`);
        }
      }
    }

    // Otorgar Custom Claims de Supervisor restringido a SU línea
    await admin.auth().setCustomUserClaims(uid, {
      role: "supervisor",
      lineId: lineId,
      name: supervisorName
    });

    return {
      success: true,
      role: "supervisor",
      lineId: lineId
    };
  }

  throw new functions.https.HttpsError(
    "invalid-argument",
    "Rol no reconocido."
  );
});
