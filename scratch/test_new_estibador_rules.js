const isWorkerRoleCompatibleWithSlot = (workerRole, slotTipo, slotName) => {
  if (!workerRole || !slotTipo) return false;
  const wRole = workerRole.trim().toLowerCase();
  const sTipo = slotTipo.trim().toLowerCase();
  const sName = slotName ? slotName.trim().toLowerCase() : "";

  // En casos críticos, permitir que personal administrativo o de liderazgo cubra vacantes
  const leadershipRoles = ["supervisor", "jefe", "coordinador", "coordinadora", "analista", "analista de procesos", "jefe de turno"];
  if (leadershipRoles.includes(wRole)) {
    return true;
  }

  // Estibadores: Ningún rol de operador técnico (A, B, C, Averiero, Calderas, etc.) es compatible con Estibador/Estivador
  const isEstibador = sName.includes("estibador") || sName.includes("estivador");
  const isTechnicalOperator = wRole.includes("operador") || wRole.includes("averiero");
  if (isEstibador && isTechnicalOperator) {
    return false;
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
    return ["operario", "operario varios", "auxiliar materiales", "limpieza", "soporte", "nuevos ingresos", "asistente", "rotativo", "operario de patio", "operador b"].includes(wRole);
  }
  return wRole === sTipo;
};

// Test matrix
const testCases = [
  // Technical operators vs Estibador
  { role: "Operador A", slotTipo: "Puesto Vario", slotName: "Estibador 1", expected: false },
  { role: "Operador B", slotTipo: "Puesto Vario", slotName: "Estibador 2", expected: false },
  { role: "Operador Calderas", slotTipo: "Puesto Vario", slotName: "Estibador 3", expected: false },
  { role: "Averiero", slotTipo: "Puesto Vario", slotName: "Estibador", expected: false },

  // Technical operators vs Estivador (misspelled)
  { role: "Operador A", slotTipo: "Puesto Vario", slotName: "Estivador 1", expected: false },
  { role: "Operador B", slotTipo: "Puesto Vario", slotName: "Estivador 2", expected: false },

  // General workers vs Estibador
  { role: "Operario", slotTipo: "Puesto Vario", slotName: "Estibador 1", expected: true },
  { role: "Operario Varios", slotTipo: "Puesto Vario", slotName: "Estibador 2", expected: true },
  
  // Leadership vs Estibador (critical bypass)
  { role: "Supervisor", slotTipo: "Puesto Vario", slotName: "Estibador 1", expected: true },
  
  // Regular slots
  { role: "Operador B", slotTipo: "Puesto Vario", slotName: "Lampara 1", expected: true },
  { role: "Operador A", slotTipo: "Puesto Vario", slotName: "Lampara 1", expected: false },
  { role: "Operador A", slotTipo: "Operador A", slotName: "Sopladora", expected: true },
  { role: "Operador B", slotTipo: "Operador A", slotName: "Sopladora", expected: true },
];

console.log("=== EJECUTANDO PRUEBAS DE COMPATIBILIDAD DE ESTIBADORES ===");
let passedCount = 0;
testCases.forEach((tc, idx) => {
  const result = isWorkerRoleCompatibleWithSlot(tc.role, tc.slotTipo, tc.slotName);
  const passed = result === tc.expected;
  if (passed) {
    passedCount++;
    console.log(`✅ Case ${idx + 1} Passed: Rol "${tc.role}" vs "${tc.slotName}" (${tc.slotTipo}) -> Result: ${result} (Expected: ${tc.expected})`);
  } else {
    console.log(`❌ Case ${idx + 1} FAILED: Rol "${tc.role}" vs "${tc.slotName}" (${tc.slotTipo}) -> Result: ${result} (Expected: ${tc.expected})`);
  }
});

console.log(`\nResultados: ${passedCount}/${testCases.length} pasaron.`);
process.exit(passedCount === testCases.length ? 0 : 1);
