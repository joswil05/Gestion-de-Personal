const sql = require('mssql/msnodesqlv8');
const connectionString = 'Server=localhost;Database=SmartAssignDB;Trusted_Connection=yes;Driver={ODBC Driver 17 for SQL Server};';

async function testRaceCondition() {
    let pool;
    try {
        pool = await sql.connect({ connectionString });
        await pool.request().query("UPDATE Puestos SET Estado = 'disponible', OperarioAsignadoId = NULL WHERE Id IN (1, 2)");
        await pool.request().query("UPDATE Operarios SET EstadoActual = 'POOL_ARRANQUE' WHERE Id = 4");
        
        const workersReq = await pool.request().query("SELECT TOP 1 Id FROM Operarios WHERE EstadoActual = 'POOL_ARRANQUE' AND (MedicalRestrictions IS NULL OR MedicalRestrictions = '[]')");
        const workerId = workersReq.recordset[0]?.Id;
        
        const slotsReq = await pool.request().query("SELECT TOP 2 Id FROM Puestos WHERE Estado = 'disponible'");
        const slot1Id = slotsReq.recordset[0]?.Id;
        const slot2Id = slotsReq.recordset[1]?.Id;
        
        console.log(`Testing with Worker ID: ${workerId}`);
        console.log(`Target Slots: ${slot1Id} and ${slot2Id}`);

        if (!workerId || !slot1Id || !slot2Id) {
            console.log("Missing test data");
            process.exit(1);
        }

        // Login para obtener token
        const loginRes = await fetch('http://localhost:3001/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: 'coordinador.general', password: '123456' })
        });
        const loginData = await loginRes.json();
        const token = loginData.token;
        console.log("Login data:", loginData);

        // Preparar las peticiones simultáneas
        const req1 = fetch('http://localhost:3001/api/puestos/asignar', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                assignments: [
                    { workerId: workerId, slotId: slot1Id }
                ]
            })
        });

        const req2 = fetch('http://localhost:3001/api/puestos/asignar', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                assignments: [
                    { workerId: workerId, slotId: slot2Id }
                ]
            })
        });

        console.log("Disparando requests simultáneos...");
        const [res1, res2] = await Promise.all([req1, req2]);

        const data1 = await res1.json();
        const data2 = await res2.json();

        console.log("Status 1:", res1.status, data1);
        console.log("Status 2:", res2.status, data2);

        // Limpiar
        await pool.request().input('workerId', sql.Int, workerId).query("UPDATE Operarios SET EstadoActual = 'POOL_ARRANQUE' WHERE Id = @workerId");
        await pool.request().input('slot1Id', sql.Int, slot1Id).input('slot2Id', sql.Int, slot2Id).query("UPDATE Puestos SET OperarioAsignadoId = NULL, Estado = 'disponible' WHERE Id IN (@slot1Id, @slot2Id)");

    } catch (err) {
        console.error(err);
    } finally {
        if (pool) pool.close();
    }
}

testRaceCondition();
