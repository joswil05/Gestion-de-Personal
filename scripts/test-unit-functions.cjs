const admin = require("firebase-admin");

// Inicializar app de prueba local o mock de Firestore
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: "gestion-personal-demo"
  });
}

const functions = require("../functions/index.js");

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

  const handler = functions.assignUserClaims.__run || functions.assignUserClaims;

  // -------------------------------------------------------------
  // Test 1: Solicitud sin autenticación en context
  // -------------------------------------------------------------
  try {
    await handler({ role: "COORDINADOR", pin: "9900" }, { auth: null });
    assert("Test 1: Rechazo de solicitud sin context.auth", false, "Debería lanzar HttpsError('unauthenticated').");
  } catch (err) {
    const ok = err.code === "unauthenticated" || err.message.includes("autenticado");
    assert("Test 1: Rechazo de solicitud sin context.auth", ok, `Rechazado correctamente: ${err.message}`);
  }

  // -------------------------------------------------------------
  // Test 2: Coordinador con PIN incorrecto
  // -------------------------------------------------------------
  try {
    await handler(
      { role: "COORDINADOR", supervisorName: "Atacante", pin: "0000" },
      { auth: { uid: "test_uid_bad_pin" } }
    );
    assert("Test 2: Coordinador con PIN incorrecto", false, "Debería haber sido rechazado.");
  } catch (err) {
    const ok = err.code === "permission-denied" || err.message.includes("PIN");
    assert("Test 2: Coordinador con PIN incorrecto", ok, `Rechazado correctamente: ${err.message}`);
  }

  // -------------------------------------------------------------
  // Test 3: Supervisor INVENTADO no registrado en whitelist
  // -------------------------------------------------------------
  try {
    await handler(
      { role: "SUPERVISOR", lineId: "L2", supervisorName: "SUPERVISOR_INVENTADO_HACKER" },
      { auth: { uid: "test_uid_fake_sup" } }
    );
    assert("Test 3: Supervisor INVENTADO no registrado (Rechazo Hermético)", false, "Debería haber sido rechazado.");
  } catch (err) {
    const ok = err.code === "permission-denied" || err.message.includes("no autorizado");
    assert("Test 3: Supervisor INVENTADO no registrado (Rechazo Hermético)", ok, `Rechazado correctamente: ${err.message}`);
  }

  // -------------------------------------------------------------
  // Test 4: Supervisor legítimo autorizado en whitelist
  // -------------------------------------------------------------
  try {
    const res = await handler(
      { role: "SUPERVISOR", lineId: "L2", supervisorName: "WORKER_002" }, // María López
      { auth: { uid: "test_uid_valid_sup" } }
    );
    const ok = res && res.success && res.role === "supervisor" && res.lineId === "L2";
    assert("Test 4: Supervisor legítimo de Whitelist (WORKER_002 en L2)", ok, `Claims asignados: role=${res?.role}, lineId=${res?.lineId}`);
  } catch (err) {
    assert("Test 4: Supervisor legítimo de Whitelist", false, `Fallo inesperado: ${err.message}`);
  }

  // -------------------------------------------------------------
  // Test 5: Coordinador con PIN Correcto
  // -------------------------------------------------------------
  try {
    const res = await handler(
      { role: "COORDINADOR", supervisorName: "Ing. Sofía Reyes", pin: "9900" },
      { auth: { uid: "test_uid_coord" } }
    );
    const ok = res && res.success && res.role === "coordinador" && res.lineId === "ALL";
    assert("Test 5: Coordinador con PIN correcto (9900)", ok, `Claims asignados: role=${res?.role}, lineId=${res?.lineId}`);
  } catch (err) {
    assert("Test 5: Coordinador con PIN correcto", false, `Fallo inesperado: ${err.message}`);
  }

  console.log("\n=================================================");
  console.log(`📊 RESULTADO SUITE UNITARIA: ${passed} PASADOS | ${failed} FALLADOS`);
  console.log("=================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runUnitTests();
