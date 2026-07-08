import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { 
  getBestSuggestionsForSlot, 
  getRelocationDestination, 
  getRelocationDestinationSimple 
} from "../src/services/firebaseService.js";



// Helper local para emular la función de compatibilidad de roles de HudPlanta.jsx
const isWorkerRoleCompatibleWithSlotClient = (workerRole, slotTipo) => {
  if (!workerRole || !slotTipo) return false;
  const wRole = workerRole.trim().toLowerCase();
  const sTipo = slotTipo.trim().toLowerCase();

  // En casos críticos, permitir que personal administrativo o de liderazgo cubra vacantes (Bypass)
  const leadershipRoles = ["supervisor", "jefe", "coordinador", "coordinadora", "analista", "analista de procesos", "jefe de turno"];
  if (leadershipRoles.includes(wRole)) {
    return true;
  }

  if (sTipo === "operador a") {
    return wRole === "operador a" || wRole === "operador b";
  }
  if (sTipo === "averiero") {
    return wRole === "averiero" || wRole === "operador b";
  }
  if (sTipo === "operador c") {
    return wRole === "operador c" || wRole === "operador b" || wRole === "operador a";
  }
  if (sTipo === "puesto vario") {
    return ["operario", "operario varios", "auxiliar materiales", "limpieza", "soporte", "nuevos ingresos", "asistente", "rotativo", "operario de patio"].includes(wRole);
  }
  return wRole === sTipo;
};

// Helper para emular findBestSlotForWorker de HudPlanta.jsx
const findBestSlotForWorkerClient = (worker, slots) => {
  if (!worker) return null;

  // Si el operario tiene un rol de liderazgo/administrativo, no debe ser sugerido/auto-asignado automáticamente
  const wRole = (worker.role || "").trim().toLowerCase();
  const leadershipRoles = ["supervisor", "jefe", "coordinador", "coordinadora", "analista", "analista de procesos", "jefe de turno"];
  if (leadershipRoles.includes(wRole)) {
    return null;
  }

  // Filtrar puestos vacantes de esta línea
  const vacantSlots = slots.filter(s => s.status === 'VACANTE' || s.status === 'ALERTA_VACANTE');
  if (vacantSlots.length === 0) return null;

  // Prioridad 1: Si hay una vacante en esta línea cuyo titular planificado es el operario
  const titularSlot = vacantSlots.find(s => s.idWorkerOriginal === worker.id);
  if (titularSlot && isWorkerRoleCompatibleWithSlotClient(worker.role, titularSlot.tipoPuesto)) {
    return titularSlot;
  }

  // Prioridad 2: Buscar cualquier otra vacante compatible de forma algorítmica
  const compatibleSlot = vacantSlots.find(s => isWorkerRoleCompatibleWithSlotClient(worker.role, s.tipoPuesto));
  if (compatibleSlot) {
    return compatibleSlot;
  }

  return null;
};

async function runTests() {
  console.log("=== INICIANDO SUITE DE PRUEBAS PARA REGLAS DE ROLES Y EXCLUSIÓN DE FATIGADOS ===\n");
  let passed = 0;
  let failed = 0;

  const assert = (condition, message) => {
    if (condition) {
      console.log(`\x1b[32m✅ [PASÓ]\x1b[0m - ${message}`);
      passed++;
    } else {
      console.error(`\x1b[31m❌ [FALLÓ]\x1b[0m - ${message}`);
      failed++;
    }
  };

  // --- SET DE DATOS DE PRUEBA (MOCKS) ---

  const mockWorkers = [
    { id: "W_OPERARIO_1", name: "Juan Pérez", role: "operario", status: "DISPONIBLE_BOLSON", currentSlotId: null },
    { id: "W_OPERARIO_2", name: "Maria Gómez", role: "operador a", status: "DISPONIBLE_BOLSON", currentSlotId: null },
    { id: "W_SUPERVISOR", name: "Carlos Jefe", role: "supervisor", status: "DISPONIBLE_BOLSON", currentSlotId: null },
    { id: "W_ANALISTA", name: "Ana Analista", role: "analista de procesos", status: "DISPONIBLE_BOLSON", currentSlotId: null },
    { id: "W_FATIGADO_L2", name: "Pedro Fatiga", role: "operario", status: "ASIGNADO", currentSlotId: "SLOT_L2_01" }
  ];

  const mockSlots = [
    { id: "SLOT_L4_VACANTE", lineId: "L4", status: "VACANTE", tipoPuesto: "puesto vario", puestoName: "Estibador 1" },
    { id: "SLOT_L4_OP_A", lineId: "L4", status: "VACANTE", tipoPuesto: "operador a", puestoName: "Operador de Llenadora" },
    { id: "SLOT_L2_01", lineId: "L2", status: "ASIGNADO", idWorkerCurrent: "W_FATIGADO_L2", tipoPuesto: "puesto vario", puestoName: "Estibador 2", asignadoEnSegundoVirtual: { seconds: Math.floor((Date.now() - 120 * 60000) / 1000) }, relevoSolicitado: true }
  ];

  // ==========================================
  // PRUEBA 1: getBestSuggestionsForSlot no debe incluir candidatos de rotación (puestos fatigados de otras líneas)
  // ==========================================
  try {
    const suggestions = getBestSuggestionsForSlot(
      mockSlots[0], // slot de L4
      mockSlots, 
      mockWorkers, 
      ["L4", "L1", "L2"]
    );

    const hasRotationCandidates = suggestions.some(s => s.type === "ROTACION");
    const bolsonCandidates = suggestions.filter(s => s.type === "BOLSON");

    assert(
      !hasRotationCandidates,
      "getBestSuggestionsForSlot NO sugiere operarios de rotación (fatigados de otras líneas)"
    );
    assert(
      bolsonCandidates.length > 0 && bolsonCandidates.some(c => c.worker.id === "W_OPERARIO_1"),
      "getBestSuggestionsForSlot sugiere correctamente operarios del Bolsón L8"
    );
  } catch (err) {
    console.error("Error en Prueba 1:", err);
    failed++;
  }

  // ==========================================
  // PRUEBA 2: getRelocationDestination y getRelocationDestinationSimple deben enviar a la persona directamente al Bolsón L8
  // ==========================================
  try {
    const workerRelieved = mockWorkers.find(w => w.id === "W_FATIGADO_L2");
    const slotRelievedFrom = mockSlots.find(s => s.id === "SLOT_L2_01");

    const destSimple = getRelocationDestinationSimple(
      workerRelieved,
      slotRelievedFrom,
      mockSlots,
      mockWorkers,
      ["L4", "L1", "L2"]
    );

    const destFull = getRelocationDestination(
      workerRelieved,
      slotRelievedFrom,
      mockSlots,
      mockWorkers,
      ["L4", "L1", "L2"]
    );

    assert(
      destSimple.type === "bolson",
      "getRelocationDestinationSimple envía al trabajador relevado directamente al Bolsón (sin saltos cruzados a otras líneas)"
    );
    assert(
      destFull.type === "bolson",
      "getRelocationDestination envía al trabajador relevado directamente al Bolsón (sin transit chains)"
    );
  } catch (err) {
    console.error("Error en Prueba 2:", err);
    failed++;
  }

  // ==========================================
  // PRUEBA 3: findBestSlotForWorkerClient no debe auto-asignar roles de liderazgo si se escanean sin celda seleccionada
  // ==========================================
  try {
    const supervisorWorker = mockWorkers.find(w => w.role === "supervisor");
    const normalWorker = mockWorkers.find(w => w.id === "W_OPERARIO_1");

    const bestSlotForSupervisor = findBestSlotForWorkerClient(supervisorWorker, mockSlots);
    const bestSlotForNormal = findBestSlotForWorkerClient(normalWorker, mockSlots);

    assert(
      bestSlotForSupervisor === null,
      "findBestSlotForWorker retorna null para rol de liderazgo (evita auto-asignación por QR general)"
    );
    assert(
      bestSlotForNormal !== null && bestSlotForNormal.id === "SLOT_L4_VACANTE",
      "findBestSlotForWorker auto-asigna correctamente a un operario normal compatible"
    );
  } catch (err) {
    console.error("Error en Prueba 3:", err);
    failed++;
  }

  // ==========================================
  // PRUEBA 4: isWorkerRoleCompatibleWithSlotClient permite bypass de rol para personal administrativo en casos críticos (puesto seleccionado)
  // ==========================================
  try {
    const supervisorCompatibleWithOpA = isWorkerRoleCompatibleWithSlotClient("supervisor", "operador a");
    const analistaCompatibleWithVario = isWorkerRoleCompatibleWithSlotClient("analista de procesos", "puesto vario");
    const operarioCompatibleWithOpA = isWorkerRoleCompatibleWithSlotClient("operario", "operador a"); // Debería ser falso

    assert(
      supervisorCompatibleWithOpA === true,
      "Bypass correcto: Supervisor es compatible con puesto 'operador a' en caso crítico"
    );
    assert(
      analistaCompatibleWithVario === true,
      "Bypass correcto: Analista de procesos es compatible con 'puesto vario' en caso crítico"
    );
    assert(
      operarioCompatibleWithOpA === false,
      "Seguridad normal intacta: Operario común no es compatible con 'operador a' por restricciones de categoría técnica"
    );
  } catch (err) {
    console.error("Error en Prueba 4:", err);
    failed++;
  }

  // ==========================================
  // RESUMEN DE LA SUITE
  // ==========================================
  console.log("\n=================== RESUMEN ===================");
  console.log(`Pruebas Exitosas: ${passed}`);
  console.log(`Pruebas Fallidas: ${failed}`);
  if (failed === 0) {
    console.log("\x1b[32m🎉 ¡TODAS LAS PRUEBAS PASARON CON ÉXITO!\x1b[0m");
    process.exit(0);
  } else {
    console.error("\x1b[31m❌ EXISTEN FALLAS EN LA LÓGICA REVISADA.\x1b[0m");
    process.exit(1);
  }
}

runTests().catch(console.error);
