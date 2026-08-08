const sql = require('mssql/msnodesqlv8');
const connectionString = 'Server=localhost;Database=SmartAssignDB;Trusted_Connection=yes;Driver={ODBC Driver 17 for SQL Server};';

async function update() {
  const pool = new sql.ConnectionPool({ connectionString });
  await pool.connect();
  await pool.request().query("UPDATE Usuarios SET PasswordHash = '$2b$12$fXd8HzCm1lsoS3RXyP.bQe1XxUsm/jYcjXoEGtfarlcGrdgbwiDB.'");
  console.log("Updated");
  pool.close();
}
update();
