const sql = require('mssql/msnodesqlv8');

const connectionString = `Server=localhost;Database=SmartAssignDB;Trusted_Connection=yes;Driver={ODBC Driver 17 for SQL Server};`;

async function runTests() {
  const pool = new sql.ConnectionPool({ connectionString });
  await pool.connect();
  
  console.log("=========================================");
  console.log("PRUEBA 1: RBAC cruzado (Supervisor L1 -> Slot L2)");
  console.log("=========================================");
  
  // 1. Get supervisor L1
  const supL1Res = await pool.request().query("SELECT TOP 1 u.Username FROM Usuarios u INNER JOIN Supervisores s ON u.Id = s.UsuarioId WHERE u.Rol = 'Supervisor' AND s.LineaAsignadaActual = 'L1'");
  const supL1Username = supL1Res.recordset[0].Username;
  
  // Login to get token
  let loginRes = await fetch('http://localhost:3001/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: supL1Username, password: '123456' })
  });
  let loginData = await loginRes.json();
  console.log("Login Data:", loginData);
  const tokenL1 = loginData.token;
  
  // Get a slot from L2
  await pool.request().query("IF NOT EXISTS (SELECT 1 FROM Puestos WHERE LineId = 'L2') INSERT INTO Puestos (LineId, NombrePuesto, Estado) VALUES ('L2', 'Slot L2 Test', 'disponible')");
  const slotL2Res = await pool.request().query("SELECT TOP 1 Id FROM Puestos WHERE LineId = 'L2'");
  const slotL2Id = slotL2Res.recordset[0].Id;
  
  // Try assigning slot L2 with token from L1
  let assignRes = await fetch('http://localhost:3001/api/puestos/relevo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenL1}` },
    body: JSON.stringify({ action: 'asignar', slotId: slotL2Id, newWorkerId: 1 })
  });
  
  console.log("HTTP Status:", assignRes.status);
  console.log("Response Body:", await assignRes.text());
  
  if (assignRes.status !== 403) {
      console.log("Test 1 FAILED! Expected 403.");
      process.exit(1);
  }

  console.log("\n=========================================");
  console.log("PRUEBA 2: Salud ocupacional y rollback");
  console.log("=========================================");
  
  // Get Worker 1 and an empty Slot of L1 dynamically
  const worker1Res = await pool.request().query("SELECT TOP 1 Id FROM Operarios ORDER BY Id ASC");
  const worker1Id = worker1Res.recordset[0].Id;
  const slotL1Res = await pool.request().query("SELECT TOP 1 Id FROM Puestos WHERE LineId = 'L1' AND OperarioAsignadoId IS NULL ORDER BY Id ASC");
  const slotL1Id = slotL1Res.recordset[0].Id;
  
  // Update worker and slot
  await pool.request().query(`
    UPDATE Operarios SET MedicalRestrictions = '["ESFUERZO_FISICO"]' WHERE Id = ${worker1Id};
    UPDATE Puestos SET RequiredCapabilities = '["ESFUERZO_FISICO"]', LineId = 'L1' WHERE Id = ${slotL1Id};
  `);
  
  // State BEFORE
  const stateBefore = await pool.request().query(`
    SELECT o.Id as WorkerId, o.MedicalRestrictions, p.Id as SlotId, p.RequiredCapabilities, p.OperarioAsignadoId 
    FROM Operarios o, Puestos p WHERE o.Id = ${worker1Id} AND p.Id = ${slotL1Id}
  `);
  console.log("STATE BEFORE ATTEMPT:");
  console.log(stateBefore.recordset);
  
  // Attack! Assign Worker to Slot
  assignRes = await fetch('http://localhost:3001/api/puestos/asignar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenL1}` },
    body: JSON.stringify({ lineId: 'L1', assignments: [{ slotId: slotL1Id, workerId: worker1Id }] })
  });
  
  console.log("HTTP Status:", assignRes.status);
  console.log("Response Body:", await assignRes.text());
  
  // State AFTER
  const stateAfter = await pool.request().query(`
    SELECT o.Id as WorkerId, o.MedicalRestrictions, p.Id as SlotId, p.RequiredCapabilities, p.OperarioAsignadoId 
    FROM Operarios o, Puestos p WHERE o.Id = ${worker1Id} AND p.Id = ${slotL1Id}
  `);
  console.log("STATE AFTER ATTEMPT (should be identical to BEFORE):");
  console.log(stateAfter.recordset);

  console.log("\n=========================================");
  console.log("PRUEBA 3: Coordinador bypasses RBAC");
  console.log("=========================================");
  
  // Get Coordinador
  const coordRes = await pool.request().query("SELECT TOP 1 Username FROM Usuarios WHERE Rol = 'Coordinador' OR Rol = 'COORDINADOR'");
  const coordUsername = coordRes.recordset[0].Username;
  
  // Get Worker 2
  const worker2Res = await pool.request().query("SELECT TOP 1 Id FROM Operarios WHERE Id > " + worker1Id + " ORDER BY Id ASC");
  const worker2Id = worker2Res.recordset[0].Id;
  
  // Login
  loginRes = await fetch('http://localhost:3001/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: coordUsername, password: '123456' })
  });
  loginData = await loginRes.json();
  const tokenCoord = loginData.token;
  
  // Try assigning slot L2 with token from Coordinator
  assignRes = await fetch('http://localhost:3001/api/puestos/relevo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenCoord}` },
    body: JSON.stringify({ action: 'asignar', slotId: slotL2Id, newWorkerId: worker2Id })
  });
  
  console.log("HTTP Status:", assignRes.status);
  console.log("Response Body:", await assignRes.text());
  
  pool.close();
}

runTests().catch(console.error);
