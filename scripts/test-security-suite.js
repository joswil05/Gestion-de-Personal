import { initializeApp } from "firebase/app";
import { 
  getFirestore, 
  connectFirestoreEmulator, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc 
} from "firebase/firestore";
import { getAuth, connectAuthEmulator, signInAnonymously, signOut } from "firebase/auth";
import { getFunctions, connectFunctionsEmulator, httpsCallable } from "firebase/functions";

// Configuración de prueba local para emuladores
const firebaseConfig = {
  apiKey: "demo-api-key",
  authDomain: "demo-project.firebaseapp.com",
  projectId: "gestion-personal-demo",
  storageBucket: "demo-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:demo"
};

const app = initializeApp(firebaseConfig, "security-test-app");
const db = getFirestore(app);
const auth = getAuth(app);
const functions = getFunctions(app);

connectFirestoreEmulator(db, "localhost", 8080);
connectAuthEmulator(auth, "http://localhost:9099", { disableWarnings: true });
connectFunctionsEmulator(functions, "localhost", 5001);

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function runSecurityTests() {
  console.log("=================================================");
  console.log("🛡️ INICIANDO SUITE DE PRUEBAS DE SEGURIDAD (7 ESCENARIOS)");
  console.log("=================================================\n");

  let totalPassed = 0;
  let totalFailed = 0;

  function assertResult(testName, success, details) {
    if (success) {
      console.log(`✅ [PASS] ${testName}`);
      if (details) console.log(`   └─ ${details}`);
      totalPassed++;
    } else {
      console.error(`❌ [FAIL] ${testName}`);
      if (details) console.error(`   └─ ${details}`);
      totalFailed++;
    }
  }

  try {
    // -------------------------------------------------------------
    // Escenario 1: Cliente anónimo sin autenticar intenta escribir
    // -------------------------------------------------------------
    await signOut(auth);
    try {
      await setDoc(doc(db, "puestos", "SLOT_TEST_UNAUTH"), {
        lineId: "L1",
        status: "VACANTE"
      });
      assertResult("Escenario 1: Escritura Anónima sin Autenticar", false, "Debería haber sido denegado pero la escritura tuvo éxito.");
    } catch (err) {
      const isDenied = err.code === "permission-denied" || err.message.includes("permission");
      assertResult("Escenario 1: Escritura Anónima sin Autenticar", isDenied, `Rechazado correctamente: ${err.message}`);
    }

    // -------------------------------------------------------------
    // Escenario 2: Supervisor L2 intenta escribir en puesto de L4
    // -------------------------------------------------------------
    await signInAnonymously(auth);
    const assignClaimsFn = httpsCallable(functions, "assignUserClaims");

    // Otorgar claims de Supervisor L2
    await assignClaimsFn({
      role: "SUPERVISOR",
      lineId: "L2",
      supervisorName: "WORKER_002" // María López
    });
    await auth.currentUser.getIdToken(true);

    try {
      await updateDoc(doc(db, "puestos", "SLOT_L4_001"), {
        status: "ASIGNADO",
        lineId: "L4"
      });
      assertResult("Escenario 2: Aislamiento por Línea (Supervisor L2 escribe en L4)", false, "Debería haber sido denegado.");
    } catch (err) {
      const isDenied = err.code === "permission-denied" || err.message.includes("permission");
      assertResult("Escenario 2: Aislamiento por Línea (Supervisor L2 escribe en L4)", isDenied, `Rechazado correctamente: ${err.message}`);
    }

    // -------------------------------------------------------------
    // Escenario 3: Supervisor L2 intenta escribir en config/supervisors_assignment
    // -------------------------------------------------------------
    try {
      await setDoc(doc(db, "config", "supervisors_assignment"), {
        L4: { workerId: "WORKER_002", name: "María López" }
      });
      assertResult("Escenario 3: Prevención de Confianza Circular (Supervisor escribe supervisors_assignment)", false, "Debería haber sido denegado.");
    } catch (err) {
      const isDenied = err.code === "permission-denied" || err.message.includes("permission");
      assertResult("Escenario 3: Prevención de Confianza Circular (Supervisor escribe supervisors_assignment)", isDenied, `Rechazado correctamente: ${err.message}`);
    }

    // -------------------------------------------------------------
    // Escenario 4: Supervisor L2 escribe en puesto de L2 / config/production_reports
    // -------------------------------------------------------------
    try {
      await updateDoc(doc(db, "puestos", "SLOT_L2_001"), {
        status: "VACANTE"
      });
      assertResult("Escenario 4: Permitido Supervisor L2 escribe en Puesto L2", true, "Escritura autorizada ejecutada con éxito.");
    } catch (err) {
      assertResult("Escenario 4: Permitido Supervisor L2 escribe en Puesto L2", false, `Fallo inesperado: ${err.message}`);
    }

    // -------------------------------------------------------------
    // Escenario 5: Coordinador escribe en cualquier puesto y config
    // -------------------------------------------------------------
    await signOut(auth);
    await signInAnonymously(auth);
    await assignClaimsFn({
      role: "COORDINADOR",
      lineId: "ALL",
      supervisorName: "Ing. Sofía Reyes",
      pin: "9900"
    });
    await auth.currentUser.getIdToken(true);

    try {
      await updateDoc(doc(db, "puestos", "SLOT_L4_001"), {
        status: "VACANTE"
      });
      await setDoc(doc(db, "config", "supervisors_assignment"), {
        L2: { workerId: "WORKER_002", name: "María López", shortName: "María L." }
      }, { merge: true });
      assertResult("Escenario 5: Permisos Ampliados de Coordinador (Escribe en L4 y supervisors_assignment)", true, "Operaciones de Coordinador ejecutadas con éxito.");
    } catch (err) {
      assertResult("Escenario 5: Permisos Ampliados de Coordinador", false, `Fallo inesperado: ${err.message}`);
    }

    // -------------------------------------------------------------
    // Escenario 6: Privilege Escalation con PIN inválido + Throttling
    // -------------------------------------------------------------
    await signOut(auth);
    await signInAnonymously(auth);
    let escalationBlocked = false;
    try {
      await assignClaimsFn({
        role: "COORDINADOR",
        lineId: "ALL",
        supervisorName: "Atacante Anónimo",
        pin: "0000" // PIN Incorrecto
      });
    } catch (err) {
      escalationBlocked = err.message.includes("permission-denied") || err.message.includes("PIN");
    }
    assertResult("Escenario 6: Rechazo de Privilege Escalation a Coordinador con PIN incorrecto", escalationBlocked, "Solicitud rechazada con error de autenticación.");

    // -------------------------------------------------------------
    // Escenario 7 (NUEVO): Asignación de Supervisor con Identidad Inventada (No Autorizada)
    // -------------------------------------------------------------
    await signOut(auth);
    await signInAnonymously(auth);
    let fakeSupBlocked = false;
    try {
      await assignClaimsFn({
        role: "SUPERVISOR",
        lineId: "L2",
        supervisorName: "SUPERVISOR_INVENTADO_HACKER"
      });
    } catch (err) {
      fakeSupBlocked = err.message.includes("permission-denied") || err.message.includes("no autorizado");
    }
    assertResult("Escenario 7 (NUEVO): Rechazo de Supervisor Inventado/No Autorizado para L2", fakeSupBlocked, "Solicitud rechazada herméticamente en backend antes de setCustomUserClaims.");

  } catch (globalErr) {
    console.error("💥 ERROR GLOBAL EN SUITE DE SEGURIDAD:", globalErr.message);
  }

  console.log("\n=================================================");
  console.log(`📊 RESUMEN DE SEGURIDAD: ${totalPassed} PASADOS | ${totalFailed} FALLADOS`);
  console.log("=================================================");

  if (totalFailed > 0) {
    process.exit(1);
  }
}

runSecurityTests();
