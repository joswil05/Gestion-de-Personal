const sql = require('mssql/msnodesqlv8');
const { REAL_TRABAJADORES } = require('../src/dev/realDataSeed.js');

const connectionString = `Server=localhost;Database=SmartAssignDB;Trusted_Connection=yes;Driver={ODBC Driver 17 for SQL Server};`;

async function migrateFase1() {
    let pool;
    try {
        pool = new sql.ConnectionPool({ connectionString });
        await pool.connect();
        console.log("Conectado a la base de datos.");

        // 1. Agregar LegacyWorkerId si no existe
        try {
            await pool.request().query(`
                IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[Operarios]') AND name = 'LegacyWorkerId')
                BEGIN
                    ALTER TABLE Operarios ADD LegacyWorkerId NVARCHAR(50) NULL;
                END
            `);
            console.log("Columna LegacyWorkerId asegurada.");
        } catch (e) {
            console.error("Error agregando columna LegacyWorkerId:", e);
        }

        // 2. Seleccionar 10 registros específicos
        // Criterios: 1 con medicalRestrictions, 1 de cada sexo, 2 cargos distintos.
        
        let batch = [];
        let hasMedical = false;
        let hasMale = false;
        let hasFemale = false;
        let roles = new Set();
        
        for (const worker of REAL_TRABAJADORES) {
            if (batch.length === 10) break;
            
            let include = false;
            
            // Queremos llenar los requisitos primero
            if (!hasMedical && worker.medicalRestrictions && worker.medicalRestrictions.length > 0) {
                include = true;
                hasMedical = true;
            }
            if (!hasMale && worker.sexo === 'Masculino') {
                include = true;
                hasMale = true;
            }
            if (!hasFemale && worker.sexo === 'Femenino') {
                include = true;
                hasFemale = true;
            }
            if (roles.size < 2 && !roles.has(worker.role)) {
                include = true;
            }
            
            // Si nos faltan para llegar a 10, seguimos agregando
            if (batch.length < 10 && (!include && batch.length >= 4)) { // Rellenar
                include = true;
            }
            
            if (include && !batch.find(b => b.id === worker.id)) {
                batch.push(worker);
                roles.add(worker.role);
            }
        }
        
        // Rellenar si no llegamos a 10 por alguna razón
        for (const worker of REAL_TRABAJADORES) {
            if (batch.length === 10) break;
            if (!batch.find(b => b.id === worker.id)) {
                batch.push(worker);
            }
        }
        
        console.log("Lote seleccionado:", batch.map(w => ({ id: w.id, name: w.name, role: w.role, res: w.medicalRestrictions, sexo: w.sexo })));

        // 3. Mapeo e Inserción en Transacción
        const transaction = new sql.Transaction(pool);
        await transaction.begin();
        console.log("Transacción iniciada.");

        try {
            const request = new sql.Request(transaction);
            
            for (const worker of batch) {
                // Normalizar EstadoActual
                let estado = 'POOL_ARRANQUE'; // Por defecto los mandamos al pool
                // Convertir medical restrictions a JSON
                let medStr = worker.medicalRestrictions && worker.medicalRestrictions.length > 0 
                                ? JSON.stringify(worker.medicalRestrictions) : null;
                
                request.input(`WorkerId_${worker.id}`, sql.NVarChar, worker.id);
                request.input(`Nombre_${worker.id}`, sql.NVarChar, worker.name);
                request.input(`Puesto_${worker.id}`, sql.NVarChar, worker.role);
                request.input(`Estado_${worker.id}`, sql.NVarChar, estado);
                request.input(`Med_${worker.id}`, sql.NVarChar, medStr);
                request.input(`Sexo_${worker.id}`, sql.NVarChar, worker.sexo || null);
                request.input(`Turno_${worker.id}`, sql.NVarChar, worker.turnoBase || 'Matutino'); // Default

                await request.query(`
                    INSERT INTO Operarios (NumeroNomina, LegacyWorkerId, NombreCompleto, PuestoBase, EstadoActual, MedicalRestrictions, Sexo, TurnoBase)
                    VALUES (@WorkerId_${worker.id}, @WorkerId_${worker.id}, @Nombre_${worker.id}, @Puesto_${worker.id}, @Estado_${worker.id}, @Med_${worker.id}, @Sexo_${worker.id}, @Turno_${worker.id})
                `);
            }
            
            await transaction.commit();
            console.log("Lote de prueba (10) migrado exitosamente (COMMIT).");
        } catch (err) {
            await transaction.rollback();
            console.error("Transacción fallida. ROLLBACK EJECUTADO.");
            console.error("Detalle del error:", err.message);
            return;
        }

    } catch (err) {
        console.error("Error general:", err);
    } finally {
        if (pool) pool.close();
    }
}

migrateFase1();
