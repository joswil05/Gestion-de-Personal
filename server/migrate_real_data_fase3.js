/**
 * Migración Fase 3: siembra COMPLETA de datos reales de planta.
 * Extiende lo que migrate_operarios_fase1.js hizo solo con una muestra de 10
 * trabajadores. Lee src/dev/realDataSeed.js (generado a partir de
 * "Base de Datos.xlsx") y siembra:
 *   - Operarios: 153 trabajadores de piso (excluye roles de oficina/supervisión,
 *     que ya viven en Usuarios/Supervisores).
 *   - Puestos: 90 puestos fijos reales + 9 puestos varios SKU-dependientes.
 *   - OrdenesProduccion: 22 órdenes de producción reales.
 *   - Resuelve Puestos.IdWorkerOriginal (titular persistente de cada máquina).
 *
 * Idempotente: se puede correr más de una vez sin duplicar filas
 * (Operarios por LegacyWorkerId, Puestos por LegacyPuestoId, OrdenesProduccion
 * por SKU+FechaPlaneada+Linea).
 */
const sql = require('mssql/msnodesqlv8');
const { REAL_TRABAJADORES, REAL_PUESTOS, REAL_SKU_SLOTS, REAL_PROGRAMA } = require('../src/dev/realDataSeed.js');

const connectionString = `Server=localhost;Database=SmartAssignDB;Trusted_Connection=yes;Driver={ODBC Driver 17 for SQL Server};`;

// Roles de oficina/supervisión: ya están modelados en Usuarios/Supervisores
// (ver migrate_supervisors.js / migrate_coordinators.js). No son personal de
// piso asignable a Puestos, así que se excluyen de Operarios.
const NON_FLOOR_ROLES = new Set(['Supervisor', 'Coordinador', 'Asistente', 'Analista', 'Jefe']);

async function migrateOperarios(pool) {
    const floorWorkers = REAL_TRABAJADORES.filter(w => !NON_FLOOR_ROLES.has(w.role));
    console.log(`[Operarios] ${floorWorkers.length} trabajadores de piso a sembrar (de ${REAL_TRABAJADORES.length} totales, ${REAL_TRABAJADORES.length - floorWorkers.length} excluidos por rol de oficina/supervisión).`);

    let inserted = 0, skipped = 0;
    for (const w of floorWorkers) {
        const existing = await pool.request()
            .input('LegacyWorkerId', sql.NVarChar, w.id)
            .query('SELECT Id FROM Operarios WHERE LegacyWorkerId = @LegacyWorkerId');
        if (existing.recordset.length > 0) { skipped++; continue; }

        const medStr = (w.medicalRestrictions && w.medicalRestrictions.length > 0)
            ? JSON.stringify(w.medicalRestrictions) : null;

        await pool.request()
            .input('NumeroNomina', sql.NVarChar, w.id)
            .input('LegacyWorkerId', sql.NVarChar, w.id)
            .input('NombreCompleto', sql.NVarChar, w.name)
            .input('PuestoBase', sql.NVarChar, w.role || null)
            .input('EstadoActual', sql.NVarChar, w.status || 'POOL_ARRANQUE')
            .input('MedicalRestrictions', sql.NVarChar, medStr)
            .input('Sexo', sql.NVarChar, w.sexo || null)
            .input('TurnoBase', sql.NVarChar, 'Matutino')
            .input('LastActivity', sql.NVarChar, w.lastActivity || null)
            .query(`INSERT INTO Operarios
                        (NumeroNomina, LegacyWorkerId, NombreCompleto, PuestoBase, EstadoActual, MedicalRestrictions, Sexo, TurnoBase, LastActivity)
                    VALUES
                        (@NumeroNomina, @LegacyWorkerId, @NombreCompleto, @PuestoBase, @EstadoActual, @MedicalRestrictions, @Sexo, @TurnoBase, @LastActivity)`);
        inserted++;
    }
    console.log(`[Operarios] ${inserted} insertados, ${skipped} ya existían (omitidos).`);
}

async function migratePuestos(pool) {
    const allPuestos = [...REAL_PUESTOS, ...REAL_SKU_SLOTS];
    console.log(`[Puestos] ${allPuestos.length} puestos a sembrar (${REAL_PUESTOS.length} fijos + ${REAL_SKU_SLOTS.length} SKU-dependientes).`);

    let inserted = 0, skipped = 0;
    for (const p of allPuestos) {
        const existing = await pool.request()
            .input('LegacyPuestoId', sql.NVarChar, p.id)
            .query('SELECT Id FROM Puestos WHERE LegacyPuestoId = @LegacyPuestoId');
        if (existing.recordset.length > 0) { skipped++; continue; }

        const reqCapsStr = (p.requiredCapabilities && p.requiredCapabilities.length > 0)
            ? JSON.stringify(p.requiredCapabilities) : null;
        const reqSkusStr = (p.requiredSkus && p.requiredSkus.length > 0)
            ? JSON.stringify(p.requiredSkus) : null;

        await pool.request()
            .input('LegacyPuestoId', sql.NVarChar, p.id)
            .input('LineId', sql.NVarChar, p.lineId)
            .input('NombrePuesto', sql.NVarChar, p.puestoName)
            .input('TipoPuesto', sql.NVarChar, p.tipoPuesto || null)
            .input('Estado', sql.NVarChar, p.status || 'VACANTE')
            .input('RequiredCapabilities', sql.NVarChar, reqCapsStr)
            .input('SexoPreferente', sql.NVarChar, p.sexoPreferente || null)
            .input('ActivityName', sql.NVarChar, p.puestoName) // Para la regla de no-repetición 24h (LastActivity)
            .input('IsSkuDependent', sql.Bit, !!p.isSkuDependent)
            .input('RequiredSkusJson', sql.NVarChar, reqSkusStr)
            .query(`INSERT INTO Puestos
                        (LegacyPuestoId, LineId, NombrePuesto, TipoPuesto, Estado, RequiredCapabilities, SexoPreferente, ActivityName, IsSkuDependent, RequiredSkusJson)
                    VALUES
                        (@LegacyPuestoId, @LineId, @NombrePuesto, @TipoPuesto, @Estado, @RequiredCapabilities, @SexoPreferente, @ActivityName, @IsSkuDependent, @RequiredSkusJson)`);
        inserted++;
    }
    console.log(`[Puestos] ${inserted} insertados, ${skipped} ya existían (omitidos).`);
}

async function resolveIdWorkerOriginal(pool) {
    const allPuestos = [...REAL_PUESTOS, ...REAL_SKU_SLOTS].filter(p => p.idWorkerOriginal);
    let resolved = 0, unresolved = 0;
    for (const p of allPuestos) {
        const result = await pool.request()
            .input('LegacyPuestoId', sql.NVarChar, p.id)
            .input('LegacyWorkerId', sql.NVarChar, p.idWorkerOriginal)
            .query(`UPDATE Puestos SET IdWorkerOriginal = (SELECT Id FROM Operarios WHERE LegacyWorkerId = @LegacyWorkerId)
                    WHERE LegacyPuestoId = @LegacyPuestoId AND IdWorkerOriginal IS NULL`);
        if (result.rowsAffected[0] > 0) resolved++; else unresolved++;
    }
    console.log(`[Puestos] IdWorkerOriginal resuelto para ${resolved} puestos (${unresolved} ya estaban resueltos o el titular no se encontró -por ejemplo, si era un rol de oficina excluido-).`);
}

async function migrateOrdenesProduccion(pool) {
    console.log(`[OrdenesProduccion] ${REAL_PROGRAMA.length} órdenes a sembrar.`);
    let inserted = 0, skipped = 0;
    for (const o of REAL_PROGRAMA) {
        const existing = await pool.request()
            .input('SKU', sql.NVarChar, o.item)
            .input('FechaPlaneada', sql.Date, o.fechaProd)
            .input('Linea', sql.NVarChar, o.lineaId)
            .query('SELECT Id FROM OrdenesProduccion WHERE SKU = @SKU AND FechaPlaneada = @FechaPlaneada AND Linea = @Linea');
        if (existing.recordset.length > 0) { skipped++; continue; }

        await pool.request()
            .input('SKU', sql.NVarChar, o.item)
            .input('Descripcion', sql.NVarChar, o.producto || null)
            .input('MetaCajas', sql.Int, o.cajas || 0)
            .input('MetaBotellas', sql.Int, o.botellas || 0)
            .input('FechaPlaneada', sql.Date, o.fechaProd)
            .input('Linea', sql.NVarChar, o.lineaId)
            .query(`INSERT INTO OrdenesProduccion (SKU, Descripcion, MetaCajas, MetaBotellas, FechaPlaneada, Linea, Estado)
                    VALUES (@SKU, @Descripcion, @MetaCajas, @MetaBotellas, @FechaPlaneada, @Linea, 'Pendiente')`);
        inserted++;
    }
    console.log(`[OrdenesProduccion] ${inserted} insertadas, ${skipped} ya existían (omitidas).`);
}

async function main() {
    let pool;
    try {
        pool = new sql.ConnectionPool({ connectionString });
        await pool.connect();
        console.log('Conectado a la base de datos.\n');

        await migrateOperarios(pool);
        await migratePuestos(pool);
        await resolveIdWorkerOriginal(pool);
        await migrateOrdenesProduccion(pool);

        console.log('\nSiembra de datos reales completada.');
    } catch (err) {
        console.error('Error general:', err);
        process.exitCode = 1;
    } finally {
        if (pool) await pool.close();
    }
}

main();
