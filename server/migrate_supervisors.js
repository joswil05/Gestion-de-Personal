const sql = require('mssql/msnodesqlv8');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
require('dotenv').config();

const connectionString = `Server=${process.env.DB_SERVER || 'localhost'};Database=${process.env.DB_NAME || 'SmartAssignDB'};Trusted_Connection=yes;Driver={ODBC Driver 17 for SQL Server};TrustServerCertificate=yes;`;

const REAL_SUPERVISORS = [
  { id: "WORKER_365515", name: "Axel Javier Antonio Tercero Lola", shortName: "Axel Tercero" },
  { id: "WORKER_99590",  name: "Jairo De Jesus Carrion Puerto",   shortName: "Jairo Carrión" },
  { id: "WORKER_359224", name: "Nubia Haydee Luna",               shortName: "Nubia Luna" },
  { id: "WORKER_10432",  name: "Roberto Daniel Lira Munguia",     shortName: "Roberto Lira" },
  { id: "WORKER_351516", name: "Anielka Lizeth Cruz Blandon",     shortName: "Anielka Cruz" },
  { id: "WORKER_99708",  name: "Fabricio Antonio Espinoza",       shortName: "Fabricio Espinoza" }
];

// Generar contraseña segura e impredecible
function generateSecurePassword() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+';
  let password = '';
  for (let i = 0; i < 16; i++) {
    password += chars[crypto.randomInt(0, chars.length)];
  }
  return password;
}

const credentialsDir = path.join(__dirname, 'credentials');
const gitignorePath = path.join(__dirname, '../.gitignore');

async function confirmExecution() {
  console.log("\n=======================================");
  console.log("⚠️  CONFIRMACIÓN DE ENTORNO REQUERIDA ⚠️");
  console.log("=======================================");
  console.log(`Servidor SQL: ${process.env.DB_SERVER || 'localhost'}`);
  console.log(`Base de Datos: ${process.env.DB_NAME || 'SmartAssignDB'}`);
  console.log("=======================================\n");
  
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question('¿Confirmas que deseas ejecutar la migración en este entorno? (escribe "SI" para continuar): ', (answer) => {
      rl.close();
      resolve(answer.trim() === 'SI');
    });
  });
}

async function runMigration() {
  if (!(await confirmExecution())) {
    console.log("Migración cancelada por el usuario.");
    return;
  }

  // Carpeta ignorada para volcar las contraseñas
  if (!fs.existsSync(credentialsDir)) fs.mkdirSync(credentialsDir, { recursive: true });
  if (fs.existsSync(gitignorePath)) {
    const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
    if (!gitignoreContent.includes('credentials/')) {
      fs.appendFileSync(gitignorePath, '\n# Ignorar credenciales temporales generadas\nserver/credentials/\n');
    }
  }
  
  const reportPath = path.join(credentialsDir, `supervisors_credentials_${Date.now()}.txt`);
  let reportContent = "CREDENCIALES TEMPORALES GENERADAS PARA SUPERVISORES\n";
  reportContent += "===================================================\n";
  reportContent += "Instrucción para TI/RRHH: Entregue estas credenciales de forma segura y BORRE ESTE ARCHIVO inmediatamente después.\n\n";

  try {
    console.log("\nConectando a la base de datos...");
    const pool = await sql.connect({ connectionString });

    // Trazabilidad: Agregar columna LegacyWorkerId
    const checkColumn = await pool.request().query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'Usuarios' AND COLUMN_NAME = 'LegacyWorkerId'
    `);
    
    if (checkColumn.recordset.length === 0) {
      console.log("Añadiendo columna LegacyWorkerId a Usuarios para trazabilidad...");
      await pool.request().query(`ALTER TABLE Usuarios ADD LegacyWorkerId NVARCHAR(50) NULL`);
    }

    for (const sup of REAL_SUPERVISORS) {
      let cleanName = sup.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      let baseUsername = cleanName.toLowerCase().trim().replace(/\s+/g, '.');
      let finalUsername = baseUsername;

      const transaction = new sql.Transaction(pool);
      await transaction.begin();

      try {
        // Manejo de Colisión
        let counter = 1;
        while (true) {
          const checkUser = await transaction.request()
            .input('Username', sql.NVarChar, finalUsername)
            .query(`SELECT Id FROM Usuarios WHERE Username = @Username`);
          
          if (checkUser.recordset.length === 0) break;
          counter++;
          finalUsername = `${baseUsername}${counter}`;
        }
        
        if (finalUsername !== baseUsername) {
          console.log(`⚠️ Colisión resuelta: El usuario base existía. Asignado a: ${finalUsername}`);
        }

        const tempPassword = generateSecurePassword();
        const hashedPassword = await bcrypt.hash(tempPassword, 12);

        const insertResult = await transaction.request()
          .input('Nombre', sql.NVarChar, sup.name)
          .input('Username', sql.NVarChar, finalUsername)
          .input('PasswordHash', sql.NVarChar, hashedPassword)
          .input('Rol', sql.NVarChar, 'SUPERVISOR')
          .input('MustChangePassword', sql.Bit, 1)
          .input('LegacyWorkerId', sql.NVarChar, sup.id)
          .query(`
            INSERT INTO Usuarios (Nombre, Username, PasswordHash, Rol, MustChangePassword, LegacyWorkerId)
            OUTPUT INSERTED.Id
            VALUES (@Nombre, @Username, @PasswordHash, @Rol, @MustChangePassword, @LegacyWorkerId)
          `);
        
        const userId = insertResult.recordset[0].Id;

        await transaction.request()
          .input('UsuarioId', sql.Int, userId)
          .query(`
            INSERT INTO Supervisores (UsuarioId, LineaAsignadaActual)
            VALUES (@UsuarioId, 'Sin Asignar')
          `);
        
        await transaction.commit();
        console.log(`✅ Migrado: ${sup.name} -> Username: ${finalUsername}`);

        reportContent += `Nombre: ${sup.name}\nUsername: ${finalUsername}\nPassword Temporal: ${tempPassword}\n\n`;
      } catch (err) {
        console.error(`❌ Error migrando ${sup.name}:`, err);
        await transaction.rollback();
      }
    }

    // Escribir el reporte solo si se procesó al menos uno
    fs.writeFileSync(reportPath, reportContent);
    console.log(`\n🎉 Migración completada. Credenciales escritas en: ${reportPath}`);
    await pool.close();
  } catch (err) {
    console.error("Error global en la migración:", err);
  }
}

runMigration();
