const admin = require("firebase-admin");

let attemptStore = {};
let customClaimsStore = {};

const mockFirestore = () => ({
  collection: (collName) => ({
    doc: (docId) => ({
      get: async () => {
        if (collName === "config" && docId === "supervisors_assignment") {
          return {
            exists: true,
            data: () => ({
              L2: { workerId: "WORKER_365515", name: "Axel Javier Antonio Tercero Lola", shortName: "Axel Tercero" },
              L4: { workerId: "WORKER_99590",  name: "Jairo De Jesus Carrion Puerto",   shortName: "Jairo Carrión" }
            })
          };
        }
        if (collName === "personal_autorizado") {
          // ÚNICA FUENTE DE VERDAD: Colección personal_autorizado en Firestore
          const validSups = ["WORKER_365515", "WORKER_99590", "WORKER_359224", "Axel Tercero"];
          return {
            exists: validSups.includes(docId),
            data: () => ({ workerId: docId, role: "Supervisor" })
          };
        }
        if (collName === "pin_attempts") {
          return {
            exists: !!attemptStore[docId],
            data: () => attemptStore[docId] || {}
          };
        }
        return { exists: false, data: () => ({}) };
      },
      set: async (data, opts) => {
        if (collName === "pin_attempts") {
          attemptStore[docId] = { ...(attemptStore[docId] || {}), ...data };
        }
        return true;
      }
    }),
    where: () => ({
      limit: () => ({
        get: async () => ({ empty: true })
      })
    })
  })
});

mockFirestore.FieldValue = {
  serverTimestamp: () => new Date().toISOString()
};

const mockAuth = () => ({
  setCustomUserClaims: async (uid, claims) => {
    customClaimsStore[uid] = claims;
    return true;
  }
});

Object.defineProperty(admin, 'firestore', {
  value: mockFirestore,
  writable: true,
  configurable: true
});

Object.defineProperty(admin, 'auth', {
  value: mockAuth,
  writable: true,
  configurable: true
});

const { assignUserClaimsHandler } = require("./index.js");

async function runUnitTests() {
  console.log("=================================================");
  console.log("🧪 SUITE DE PRUEBAS UNITARIAS: CLOUD FUNCTION assignUserClaims");
  console.log("=================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(name, condition, details) {
    if (condition) {
      console.log(`✅ [PASS] ${name}`);
      if (details) console.log(`   └─ ${details}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${name}`);
      if (details) console.error(`   └─ ${details}`);
      failed++;
    }
  }

  // -------------------------------------------------------------
  // Test 1: Solicitud sin autenticación en context
  // -------------------------------------------------------------
  try {
    await assignUserClaimsHandler({ role: "COORDINADOR", pin: "9900" }, null);
    assert("Test 1: Rechazo de solicitud sin context.auth", false, "Debería lanzar HttpsError('unauthenticated').");
  } catch (err) {
    const ok = err.code === "unauthenticated" || err.message.includes("autenticado");
    assert("Test 1: Rechazo de solicitud sin context.auth", ok, `Rechazado correctamente: ${err.message}`);
  }

  // -------------------------------------------------------------
  // Test 2: Coordinador con PIN incorrecto
  // -------------------------------------------------------------
  try {
    await assignUserClaimsHandler(
      { role: "COORDINADOR", supervisorName: "Atacante", pin: "0000" },
      { auth: { uid: "test_uid_bad_pin" } }
    );
    assert("Test 2: Coordinador con PIN incorrecto", false, "Debería haber sido rechazado.");
  } catch (err) {
    const ok = err.code === "permission-denied" || err.message.includes("PIN");
    assert("Test 2: Coordinador con PIN incorrecto", ok, `Rechazado correctamente: ${err.message}`);
  }

  // -------------------------------------------------------------
  // Test 3: Supervisor INVENTADO no registrado en personal_autorizado (Colección Firestore)
  // -------------------------------------------------------------
  try {
    await assignUserClaimsHandler(
      { role: "SUPERVISOR", lineId: "L2", supervisorName: "SUPERVISOR_INVENTADO_HACKER" },
      { auth: { uid: "test_uid_fake_sup" } }
    );
    assert("Test 3: Supervisor INVENTADO no registrado (Rechazo por personal_autorizado)", false, "Debería haber sido rechazado.");
  } catch (err) {
    const ok = err.code === "permission-denied" && err.message.includes("personal autorizado");
    assert("Test 3: Supervisor INVENTADO no registrado (Rechazo por personal_autorizado)", ok, `Rechazado correctamente: ${err.message}`);
  }

  // -------------------------------------------------------------
  // Test 4: Supervisor legítimo en personal_autorizado y línea asignada (WORKER_365515 en L2)
  // -------------------------------------------------------------
  try {
    const res = await assignUserClaimsHandler(
      { role: "SUPERVISOR", lineId: "L2", supervisorName: "WORKER_365515" }, // Axel Tercero
      { auth: { uid: "test_uid_valid_sup" } }
    );
    const claims = customClaimsStore["test_uid_valid_sup"];
    const ok = res && res.success && res.role === "supervisor" && res.lineId === "L2" && claims && claims.role === "supervisor" && claims.lineId === "L2";
    assert("Test 4: Supervisor legítimo en personal_autorizado y línea asignada", ok, `Claims estampados: role=${claims?.role}, lineId=${claims?.lineId}`);
  } catch (err) {
    assert("Test 4: Supervisor legítimo en personal_autorizado y línea asignada", false, `Fallo inesperado: ${err.message}`);
  }

  // -------------------------------------------------------------
  // Test 5: Coordinador con PIN Correcto (9900)
  // -------------------------------------------------------------
  try {
    const res = await assignUserClaimsHandler(
      { role: "COORDINADOR", supervisorName: "Ing. Sofía Reyes", pin: "9900" },
      { auth: { uid: "test_uid_coord" } }
    );
    const claims = customClaimsStore["test_uid_coord"];
    const ok = res && res.success && res.role === "coordinador" && res.lineId === "ALL" && claims && claims.role === "coordinador" && claims.lineId === "ALL";
    assert("Test 5: Coordinador con PIN correcto (9900)", ok, `Claims estampados: role=${claims?.role}, lineId=${claims?.lineId}`);
  } catch (err) {
    assert("Test 5: Coordinador con PIN correcto", false, `Fallo inesperado: ${err.message}`);
  }

  // -------------------------------------------------------------
  // Test 6: Rate Limiting / Bloqueo tras 5 intentos fallidos
  // -------------------------------------------------------------
  try {
    const uidRate = "test_uid_rate_limit";
    for (let i = 1; i <= 5; i++) {
      try {
        await assignUserClaimsHandler(
          { role: "COORDINADOR", supervisorName: "Atacante", pin: "0000" },
          { auth: { uid: uidRate } }
        );
      } catch (err) {}
    }
    // El 6to intento debe fallar con 'resource-exhausted'
    await assignUserClaimsHandler(
      { role: "COORDINADOR", supervisorName: "Atacante", pin: "9900" },
      { auth: { uid: uidRate } }
    );
    assert("Test 6: Rate Limiting (Bloqueo tras 5 intentos fallidos)", false, "Debería haber sido bloqueado por resource-exhausted.");
  } catch (err) {
    const ok = err.code === "resource-exhausted" || err.message.includes("bloqueada");
    assert("Test 6: Rate Limiting (Bloqueo tras 5 intentos fallidos)", ok, `Bloqueado correctamente: ${err.message}`);
  }

  // -------------------------------------------------------------
  // Test 7: Lógica FAIL-CLOSED para línea SIN entrada en supervisors_assignment (ej. L9)
  // -------------------------------------------------------------
  try {
    await assignUserClaimsHandler(
      { role: "SUPERVISOR", lineId: "L9", supervisorName: "WORKER_365515" },
      { auth: { uid: "test_uid_unassigned_line" } }
    );
    assert("Test 7: FAIL-CLOSED en línea L9 sin asignación previa en config", false, "Debería haber sido rechazado por permission-denied.");
  } catch (err) {
    const ok = err.code === "permission-denied" && err.message.includes("no está asignada oficialmente");
    assert("Test 7: FAIL-CLOSED en línea L9 sin asignación previa en config", ok, `Rechazado correctamente: ${err.message}`);
  }

  console.log("\n=================================================");
  console.log(`📊 RESULTADO SUITE UNITARIA: ${passed} PASADOS | ${failed} FALLADOS`);
  console.log("=================================================");

  if (failed > 0) {
    process.exit(1);
  }

  process.exit(0);
}

runUnitTests();
