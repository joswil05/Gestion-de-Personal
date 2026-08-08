const sql = require('mssql/msnodesqlv8');
const connectionString = `Server=localhost;Database=SmartAssignDB;Trusted_Connection=yes;Driver={ODBC Driver 17 for SQL Server};`;

async function testAsignar() {
  const pool = new sql.ConnectionPool({ connectionString });
  await pool.connect();
  
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
  const tokenL1 = loginData.token;

  // Try assigning worker 8 (Juan Carlos - ESFUERZO FISICO restriction) to slot 2 (requires ESFUERZO FISICO)
  let assignRes = await fetch('http://localhost:3001/api/puestos/asignar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenL1}` },
    body: JSON.stringify({ lineId: 'L1', assignments: [{ slotId: 2, workerId: 8 }] })
  });
  
  console.log("HTTP Status:", assignRes.status);
  console.log("Response:", await assignRes.text());
  
  pool.close();
}

testAsignar().catch(console.error);
