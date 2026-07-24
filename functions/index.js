const functions = require("firebase-functions");
const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp();
}

// PIN maestro de Coordinador (por defecto 9900 o configurado en environment)
const MASTER_COORDINADOR_PIN = process.env.COORDINADOR_PIN || "9900";
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutos

// Lista oficial de IDs y nombres de supervisores autorizados en planta
const AUTHORIZED_SUPERVISORS_WHITELIST = [
  { id: "WORKER_001", name: "Juan Pérez", shortName: "Juan P." },
  { id: "WORKER_002", name: "María López", shortName: "María L." },
  { id: "WORKER_003", name: "Carlos Ruiz", shortName: "Carlos R." },
  { id: "WORKER_004", name: "Ana Martínez", shortName: "Ana M." },
  { id: "WORKER_005", name: "Luis Gómez", shortName: "Luis G." },
  { id: "WORKER_006", name: "Elena Torres", shortName: "Elena T." },
  { id: "WORKER_007", name: "Roberto Diaz", shortName: "Roberto D." },
  { id: "WORKER_008", name: "Patricia Hernandez", shortName: "Patricia H." },
  { id: "WORKER_009", name: "Fernando Castro", shortName: "Fernando C." },
  { id: "WORKER_010", name: "Sofia Morales", shortName: "Sofia M." }
];

/**
 * Lógica interna de la Cloud Function Callable assignUserClaims.
 * NUNCA confía ciegamente en role/lineId/supervisorName enviados por el cliente.
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

    // A. Verificar que el supervisorName sea un supervisor reconocido en la lista blanca
    const isRecognizedSupervisor = AUTHORIZED_SUPERVISORS_WHITELIST.some(s => 
      s.id === supervisorName || s.name === supervisorName || s.shortName === supervisorName
    );

    let isAuthorized = isRecognizedSupervisor;

    // B. Consultar asignación oficial en Firestore (config/supervisors_assignment)
    const supsDoc = await db.collection("config").doc("supervisors_assignment").get();
    if (supsDoc.exists && isAuthorized) {
      const assignments = supsDoc.data();
      const lineAssigned = assignments[lineId];
      // Si la línea tiene un supervisor asignado oficialmente en el plan, validar coincidencia estricta
      if (lineAssigned && (lineAssigned.workerId || lineAssigned.name)) {
        const matchesAssignment = 
          lineAssigned.workerId === supervisorName ||
          lineAssigned.name === supervisorName ||
          lineAssigned.shortName === supervisorName;
        
        if (!matchesAssignment) {
          isAuthorized = false;
        }
      }
    }

    // C. Rechazo estricto si no pasa la autorización server-side
    if (!isAuthorized) {
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
        "Supervisor no autorizado para esta línea."
      );
    }

    // Resetear contador tras éxito de autorización
    await attemptRef.set({
      failedAttempts: 0,
      lockoutUntil: 0,
      lastSuccessTimestamp: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

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
}

exports.assignUserClaimsHandler = assignUserClaimsHandler;
exports.assignUserClaims = functions.https.onCall(assignUserClaimsHandler);
