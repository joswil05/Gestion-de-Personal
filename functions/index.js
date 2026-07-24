const functions = require("firebase-functions");
const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp();
}

// PIN maestro de Coordinador (por defecto 9900 o configurado en environment)
const MASTER_COORDINADOR_PIN = process.env.COORDINADOR_PIN || "9900";
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutos

/**
 * Lógica interna de la Cloud Function Callable assignUserClaims.
 * NUNCA confía ciegamente en role/lineId/supervisorName enviados por el cliente.
 * Implementa seguridad FAIL-CLOSED y consulta dinámica en Firestore.
 */
async function assignUserClaimsHandler(data, context) {
  const db = admin.firestore();

  // 1. Verificar que la llamada esté autenticada en Firebase Auth
  if (!context || !context.auth) {
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

  // 2. Procesamiento para Rol COORDINADOR
  if (role === "COORDINADOR" || role === "coordinador") {
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

  // 3. Procesamiento para Rol SUPERVISOR (Lógica FAIL-CLOSED Estricta)
  if (role === "SUPERVISOR" || role === "supervisor") {
    if (!lineId || !supervisorName) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Se requiere especificar supervisorName y lineId válidos para el rol de supervisor."
      );
    }

    // A. ÚNICA FUENTE DE VERDAD: Consultar la colección personal_autorizado en Firestore (administrada solo por el Coordinador)
    let isAuthorizedSupervisor = false;
    const personalDoc = await db.collection("personal_autorizado").doc(supervisorName).get();
    if (personalDoc.exists) {
      isAuthorizedSupervisor = true;
    } else {
      // Búsqueda alternativa por workerId o nombre corto dentro de personal_autorizado
      const personalQuery = await db.collection("personal_autorizado")
        .where("workerId", "==", supervisorName)
        .limit(1)
        .get();
      if (!personalQuery.empty) {
        isAuthorizedSupervisor = true;
      }
    }

    if (!isAuthorizedSupervisor) {
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
        "Supervisor no registrado en la lista de personal autorizado."
      );
    }

    // B. LÓGICA FAIL-CLOSED ESTRICTA PARA LA LÍNEA SOLICITADA:
    // Consultar el plan oficial registrado en config/supervisors_assignment
    const supsDoc = await db.collection("config").doc("supervisors_assignment").get();
    let isLineAuthorized = false;

    if (supsDoc.exists) {
      const assignments = supsDoc.data();
      const lineAssigned = assignments[lineId];

      // Si la línea tiene un supervisor asignado en el plan del coordinador:
      if (lineAssigned && (lineAssigned.workerId || lineAssigned.name)) {
        const matchesAssignment = 
          lineAssigned.workerId === supervisorName ||
          lineAssigned.name === supervisorName ||
          lineAssigned.shortName === supervisorName;
        
        if (matchesAssignment) {
          isLineAuthorized = true;
        }
      }
    }

    // FAIL-CLOSED: Si la línea NO tiene asignación registrada o el supervisor no coincide -> DENEGAR
    if (!isLineAuthorized) {
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
        `Acceso denegado: La línea ${lineId} no está asignada oficialmente a ${supervisorName}. El coordinador debe autorizar el plan de la línea.`
      );
    }

    // Resetear contador tras éxito
    await attemptRef.set({
      failedAttempts: 0,
      lockoutUntil: 0,
      lastSuccessTimestamp: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    // Otorgar Custom Claims de Supervisor
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
}

exports.assignUserClaimsHandler = assignUserClaimsHandler;
exports.assignUserClaims = functions.https.onCall(assignUserClaimsHandler);
