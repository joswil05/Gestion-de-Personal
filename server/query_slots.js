const sql = require('mssql/msnodesqlv8');
const connectionString = 'Server=localhost;Database=SmartAssignDB;Trusted_Connection=yes;Driver={ODBC Driver 17 for SQL Server};';
async function run() {
    const pool = await sql.connect({ connectionString });
    const slotsReq = await pool.request().query("SELECT Id, OperarioAsignadoId FROM Puestos WHERE OperarioAsignadoId = 4");
    console.log(slotsReq.recordset);
    process.exit(0);
}
run().catch(console.error);
