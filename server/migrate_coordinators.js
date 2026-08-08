const sql = require('mssql/msnodesqlv8');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
require('dotenv').config();

const connectionString = `Server=${process.env.DB_SERVER || 'localhost'};Database=${process.env.DB_NAME || 'SmartAssignDB'};Trusted_Connection=yes;Driver={ODBC Driver 17 for SQL Server};TrustServerCertificate=yes;`;

const REAL_COORDINATORS = [
  {
    "id": "WORKER_98495",
    "name": "Vladimir Moisés Navas Vanegas",
    "sexo": "Masculino",
    "role": "Coordinador",
    "status": "POOL_ARRANQUE",
    "medicalRestrictions": [],
    "lastActivity": "Empacadora",
    "physicalLineLocation": null,
    "currentSlotId": null
  },
  {
    "id": "WORKER_98486",
    "name": "José Antonio Hernández Jímenez",
    "sexo": "Masculino",
    "role": "Coordinador",
    "status": "VACACIONES",
    "medicalRestrictions": [
      "CARGA_PESADA"
    ],
    "lastActivity": "Encajonadora",
    "physicalLineLocation": null,
    "currentSlotId": null
  }
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

async function confirmCoordinator(coord) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    console.log(`\n======================================================`);
    console.log(`🛡️  PREPARANDO CUENTA DE MÁXIMO PRIVILEGIO (COORDINADOR) 🛡️`);
    console.log(`======================================================`);
    console.log(`ID Original: ${coord.id}`);
    console.log(`Nombre a registrar: ${coord.name}`);
    console.log(`Rol: ${coord.role}`);
    console.log(`======================================================\n`);
    
    rl.question(`Para confirmar la creación de esta cuenta, escriba exactamente el nombre completo ("${coord.name}"): `, (answer) => {
      rl.close();
      if (answer.trim() === coord.name) {
        resolve(true);
      } else {
        console.log(`\n❌ Nombre incorrecto. Se cancela la migración para ${coord.name}.\n`);
        resolve(false);
      }
    });
  });
}

async function runMigration() {
  // Carpeta ignorada para volcar las contraseñas
  if (!fs.existsSync(credentialsDir)) fs.mkdirSync(credentialsDir, { recursive: true });
  if (fs.existsSync(gitignorePath)) {
    const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
    if (!gitignoreContent.includes('credentials/')) {
      fs.appendFileSync(gitignorePath, '\n# Ignorar credenciales temporales generadas\nserver/credentials/\n');
    }
  }
  
  const reportPath = path.join(credentialsDir, `coordinators_credentials_${Date.now()}.txt`);
  let reportContent = "CREDENCIALES TEMPORALES GENERADAS PARA COORDINADORES (MÁXIMO PRIVILEGIO)\n";
  reportContent += "========================================================================\n";
  reportContent += "Instrucción para TI/RRHH: Entregue estas credenciales en persona con verificación de identidad y BORRE ESTE ARCHIVO inmediatamente después.\n\n";

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

    for (const coord of REAL_COORDINATORS) {
      const confirmed = await confirmCoordinator(coord);
      if (!confirmed) continue;

      let cleanName = coord.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
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
          .input('Nombre', sql.NVarChar, coord.name)
          .input('Username', sql.NVarChar, finalUsername)
          .input('PasswordHash', sql.NVarChar, hashedPassword)
          .input('Rol', sql.NVarChar, 'COORDINADOR')
          .input('MustChangePassword', sql.Bit, 1)
          .input('LegacyWorkerId', sql.NVarChar, coord.id)
          .query(`
            INSERT INTO Usuarios (Nombre, Username, PasswordHash, Rol, MustChangePassword, LegacyWorkerId)
            OUTPUT INSERTED.Id
            VALUES (@Nombre, @Username, @PasswordHash, @Rol, @MustChangePassword, @LegacyWorkerId)
          `);
        
        // No se inserta en la tabla Supervisores porque son Coordinadores.
        // Si el esquema requiere insertar en otra tabla para Coordinadores, se haría aquí.
        
        await transaction.commit();
        console.log(`✅ Cuenta de COORDINADOR migrada: ${coord.name} -> Username: ${finalUsername}`);

        reportContent += `Nombre: ${coord.name}\nUsername: ${finalUsername}\nPassword Temporal: ${tempPassword}\n\n`;
      } catch (err) {
        console.error(`❌ Error migrando ${coord.name}:`, err);
        await transaction.rollback();
      }
    }

    // Escribir el reporte solo si se procesó al menos uno
    fs.writeFileSync(reportPath, reportContent);
    console.log(`\n🎉 Migración de coordinadores finalizada. Credenciales de alto privilegio escritas en: ${reportPath}`);
    await pool.close();
  } catch (err) {
    console.error("Error global en la migración:", err);
  }
}

runMigration();
