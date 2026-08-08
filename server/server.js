const express = require('express');
const cors = require('cors');
const sql = require('mssql/msnodesqlv8');
const http = require('http');
const { Server } = require('socket.io');
require('dotenv').config();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { requireAuth, requireRole, requireLineOwnership } = require('./middleware/auth');
const { canWorkerOccupiedSlot } = require('./validations/canWorkerOccupiedSlot');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*', // En producción, cambiar por la URL del frontend
    methods: ['GET', 'POST']
  }
});

// Middlewares
app.use(cors());
app.use(express.json());

// Configuración de la conexión a SQL Server
const connectionString = `Server=${process.env.DB_SERVER || 'localhost'};Database=${process.env.DB_NAME || 'SmartAssignDB'};Trusted_Connection=yes;Driver={ODBC Driver 17 for SQL Server};`;

// Conectar a la base de datos
let pool;
async function connectDB() {
    try {
        pool = await sql.connect({ connectionString });
        app.locals.pool = pool;
        console.log('✅ Conectado a SQL Server (SmartAssignDB) vía Windows Auth');
    } catch (err) {
        console.error('❌ Error conectando a SQL Server:', err);
    }
}
connectDB();

// ==========================================
// ENDPOINTS DE LA API (REST)
// ==========================================

// Endpoint de prueba
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'API funcionando correctamente' });
});

// Login
app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        if (!username || !password) {
            return res.status(400).json({ error: 'Username y password requeridos' });
        }
        const result = await pool.request()
            .input('Username', sql.NVarChar, username)
            .query('SELECT * FROM Usuarios WHERE Username = @Username');
        
        if (result.recordset.length === 0) {
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }

        const user = result.recordset[0];
        if (!user.PasswordHash) {
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }

        const isValid = await bcrypt.compare(password, user.PasswordHash);
        if (!isValid) {
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }

        // Planificación T+1: si hay un plan CONFIRMADO para hoy que todavía no se
        // activó, este es uno de los dos puntos de entrada donde se activa solo
        // (ver ensureTodayPlanApplied más abajo) — así, si el plan reasignó a este
        // supervisor de línea, el lineId que se resuelve a continuación ya es el
        // correcto. Nunca debe tumbar el login: cualquier error queda solo logueado.
        await ensureTodayPlanApplied(pool);

        let lineId = null;
        let supervisorName = user.Nombre;

        if (user.Rol.toUpperCase() === 'SUPERVISOR') {
            const supResult = await pool.request()
                .input('UsuarioId', sql.Int, user.Id)
                .query('SELECT LineaAsignadaActual FROM Supervisores WHERE UsuarioId = @UsuarioId');
            if (supResult.recordset.length > 0) {
                lineId = supResult.recordset[0].LineaAsignadaActual;
            }
        }

        const token = jwt.sign(
            { 
                userId: user.Id, 
                role: user.Rol.toUpperCase(), // ej: 'COORDINADOR', 'SUPERVISOR'
                username: user.Username,
                lineId,
                supervisorName
            }, 
            process.env.JWT_SECRET,
            { expiresIn: '12h' }
        );

        res.json({
            token,
            user: { id: user.Id, role: user.Rol.toUpperCase(), username: user.Username },
            forcePasswordChange: user.MustChangePassword === 1
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Obtener operarios libres (Pool) - Accesible para cualquier rol autenticado
app.get('/api/operarios/pool', requireAuth, async (req, res) => {
    try {
        const selectCols = "Id, NombreCompleto, NumeroNomina, TurnoBase, PuestoBase, EstadoActual, LastActivity, Sexo, UpdatedAt, MedicalRestrictions, CurrentSlotId, PhysicalLineLocation, LineaDestinoId, TargetSlotId";
        const query = `
            SELECT ${selectCols} FROM Operarios
            WHERE EstadoActual IN ('POOL_ARRANQUE', 'DISPONIBLE_BOLSON') AND Activo = 1
        `;
        const result = await pool.request().query(query);
        // Formatear el id en string y agregar los alias camelCase que
        // apiService.js espera (heredados del esquema de documentos Firestore).
        const poolWorkers = result.recordset.map(w => {
            let medicalRestrictions = [];
            try { medicalRestrictions = w.MedicalRestrictions ? JSON.parse(w.MedicalRestrictions) : []; } catch (e) {}

            return {
                ...w,
                id: w.Id.toString(),
                name: w.NombreCompleto,
                role: w.PuestoBase,
                status: w.EstadoActual,
                sexo: w.Sexo,
                lastActivity: w.LastActivity,
                medicalRestrictions,
                currentSlotId: w.CurrentSlotId ? w.CurrentSlotId.toString() : null,
                physicalLineLocation: w.PhysicalLineLocation,
                lineaDestinoId: w.LineaDestinoId,
                targetSlotId: w.TargetSlotId ? w.TargetSlotId.toString() : null
            };
        });
        res.json(poolWorkers);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Obtener todos los operarios (o los asignados a la línea para supervisores)
app.get('/api/operarios', requireAuth, async (req, res) => {
    try {
        let query;
        let request = pool.request();
        
        // Columnas a devolver (EXCLUYENDO MedicalRestrictions por seguridad)
        const selectCols = "o.Id, o.NombreCompleto, o.NumeroNomina, o.TurnoBase, o.PuestoBase, o.EstadoActual, o.LastActivity, o.Sexo, o.UpdatedAt";

        if (req.user.role === 'COORDINADOR' || req.user.role === 'ADMIN') {
            query = `SELECT ${selectCols} FROM Operarios o WHERE o.Activo = 1`;
        } else if (req.user.role === 'SUPERVISOR') {
            query = `
                SELECT DISTINCT ${selectCols}
                FROM Operarios o
                INNER JOIN Puestos p ON o.Id = p.OperarioAsignadoId
                WHERE p.LineId = @lineId AND o.Activo = 1
            `;
            request.input('lineId', sql.NVarChar, req.user.lineId);
        } else {
            return res.status(403).json({ error: "Rol no válido para consultar operarios." });
        }

        const result = await request.query(query);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// GESTIÓN DE PERSONAL (Coordinador) — CRUD real de Operarios.
// Hasta esta ronda no existía ningún endpoint que escribiera datos maestros
// (NombreCompleto, NumeroNomina, TurnoBase, PuestoBase, Sexo,
// MedicalRestrictions): solo se poblaban desde scripts de migración. La
// pestaña "Ausencias" del Coordinador ya ofrecía un <select> de estado, pero
// escribía contra el shim muerto de Firestore (coordinatorApi.js db={}) —
// nunca persistía nada.
// ==========================================

// Endpoint aparte de GET /api/operarios (que también consumen los
// Supervisores, y excluye MedicalRestrictions a propósito): esta vista
// incluye a los dados de baja (Activo=0) y todas las columnas de ficha.
app.get('/api/operarios/gestion', requireAuth, requireRole('COORDINADOR'), async (req, res) => {
    try {
        const result = await pool.request().query(`
            SELECT Id, NombreCompleto, NumeroNomina, TurnoBase, PuestoBase, EstadoActual,
                   LastActivity, Sexo, MedicalRestrictions, LegacyWorkerId,
                   CurrentSlotId, PhysicalLineLocation, LineaDestinoId, TargetSlotId,
                   Activo, FechaBaja, MotivoBaja, UpdatedAt
            FROM Operarios
            ORDER BY Activo DESC, NombreCompleto ASC
        `);
        const operarios = result.recordset.map(o => {
            let medicalRestrictions = [];
            try { medicalRestrictions = o.MedicalRestrictions ? JSON.parse(o.MedicalRestrictions) : []; } catch (e) {}
            return {
                id: o.Id.toString(),
                nombreCompleto: o.NombreCompleto,
                numeroNomina: o.NumeroNomina,
                turnoBase: o.TurnoBase,
                puestoBase: o.PuestoBase,
                estadoActual: o.EstadoActual,
                lastActivity: o.LastActivity,
                sexo: o.Sexo,
                medicalRestrictions,
                legacyWorkerId: o.LegacyWorkerId,
                currentSlotId: o.CurrentSlotId ? o.CurrentSlotId.toString() : null,
                physicalLineLocation: o.PhysicalLineLocation,
                lineaDestinoId: o.LineaDestinoId,
                targetSlotId: o.TargetSlotId ? o.TargetSlotId.toString() : null,
                activo: !!o.Activo,
                fechaBaja: o.FechaBaja ? o.FechaBaja.toISOString() : null,
                motivoBaja: o.MotivoBaja,
                updatedAt: o.UpdatedAt ? o.UpdatedAt.toISOString() : null
            };
        });
        res.json(operarios);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/operarios', requireAuth, requireRole('COORDINADOR'), async (req, res) => {
    const { nombreCompleto, numeroNomina, turnoBase, puestoBase, estadoActual, sexo, medicalRestrictions } = req.body;
    if (!nombreCompleto || !numeroNomina || !turnoBase) {
        return res.status(400).json({ error: 'nombreCompleto, numeroNomina y turnoBase son requeridos.' });
    }
    if (puestoBase && !WORKER_PUESTO_BASE.includes(puestoBase)) {
        return res.status(400).json({ error: `Cargo inválido: "${puestoBase}". Valores permitidos: ${WORKER_PUESTO_BASE.join(', ')}.` });
    }
    const estadoFinal = estadoActual || 'POOL_ARRANQUE';
    if (!WORKER_STATES.includes(estadoFinal)) {
        return res.status(400).json({ error: `Estado inválido: "${estadoFinal}". Valores permitidos: ${WORKER_STATES.join(', ')}.` });
    }
    try {
        const result = await pool.request()
            .input('NombreCompleto', sql.NVarChar, nombreCompleto)
            .input('NumeroNomina', sql.NVarChar, numeroNomina)
            .input('TurnoBase', sql.NVarChar, turnoBase)
            .input('PuestoBase', sql.NVarChar, puestoBase || null)
            .input('EstadoActual', sql.NVarChar, estadoFinal)
            .input('Sexo', sql.NVarChar, sexo || null)
            .input('MedicalRestrictions', sql.NVarChar, medicalRestrictions ? JSON.stringify(medicalRestrictions) : null)
            .query(`INSERT INTO Operarios (NombreCompleto, NumeroNomina, TurnoBase, PuestoBase, EstadoActual, Sexo, MedicalRestrictions, Activo, UpdatedAt)
                    OUTPUT INSERTED.Id
                    VALUES (@NombreCompleto, @NumeroNomina, @TurnoBase, @PuestoBase, @EstadoActual, @Sexo, @MedicalRestrictions, 1, SYSUTCDATETIME())`);
        io.emit('trabajadores_updated');
        res.json({ success: true, id: result.recordset[0].Id.toString() });
    } catch (err) {
        if (/UNIQUE|duplicate key|violation of UNIQUE/i.test(err.message)) {
            return res.status(400).json({ error: `Ya existe un operario con el número de nómina "${numeroNomina}".` });
        }
        res.status(500).json({ error: err.message });
    }
});

app.patch('/api/operarios/:id', requireAuth, requireRole('COORDINADOR'), async (req, res) => {
    const { id } = req.params;
    const { nombreCompleto, numeroNomina, turnoBase, puestoBase, estadoActual, sexo, medicalRestrictions } = req.body;

    if (puestoBase !== undefined && puestoBase !== null && !WORKER_PUESTO_BASE.includes(puestoBase)) {
        return res.status(400).json({ error: `Cargo inválido: "${puestoBase}". Valores permitidos: ${WORKER_PUESTO_BASE.join(', ')}.` });
    }
    if (estadoActual !== undefined && !WORKER_STATES.includes(estadoActual)) {
        return res.status(400).json({ error: `Estado inválido: "${estadoActual}". Valores permitidos: ${WORKER_STATES.join(', ')}.` });
    }

    const transaction = new sql.Transaction(pool);
    try {
        await transaction.begin();

        const opResult = await transaction.request()
            .input('Id', sql.Int, id)
            .query('SELECT * FROM Operarios WITH (UPDLOCK, SERIALIZABLE) WHERE Id = @Id');
        if (opResult.recordset.length === 0) throw new Error('Operario no encontrado.');
        const operario = opResult.recordset[0];

        // Si el nuevo estado deja al operario no-asignable (pasa a un estado
        // de ausencia) y hoy ocupa un puesto, liberarlo en la misma
        // transacción -si no, el puesto quedaría ocupado por un fantasma-.
        let puestoLiberado = null;
        if (estadoActual !== undefined && estadoActual !== operario.EstadoActual &&
            NON_ASSIGNABLE_STATES.includes(estadoActual) && operario.CurrentSlotId) {
            await transaction.request()
                .input('PuestoId', sql.Int, operario.CurrentSlotId)
                .query(`UPDATE Puestos SET OperarioAsignadoId = NULL, Estado = 'VACANTE', AssignedAt = NULL, RelevoSolicitado = 0, RejectedWorkerIdsJson = NULL WHERE Id = @PuestoId`);
            puestoLiberado = operario.CurrentSlotId;
        }

        const fields = [];
        const updateReq = transaction.request().input('Id', sql.Int, id);
        if (nombreCompleto !== undefined) { fields.push('NombreCompleto = @NombreCompleto'); updateReq.input('NombreCompleto', sql.NVarChar, nombreCompleto); }
        if (numeroNomina !== undefined) { fields.push('NumeroNomina = @NumeroNomina'); updateReq.input('NumeroNomina', sql.NVarChar, numeroNomina); }
        if (turnoBase !== undefined) { fields.push('TurnoBase = @TurnoBase'); updateReq.input('TurnoBase', sql.NVarChar, turnoBase); }
        if (puestoBase !== undefined) { fields.push('PuestoBase = @PuestoBase'); updateReq.input('PuestoBase', sql.NVarChar, puestoBase); }
        if (sexo !== undefined) { fields.push('Sexo = @Sexo'); updateReq.input('Sexo', sql.NVarChar, sexo); }
        if (medicalRestrictions !== undefined) {
            fields.push('MedicalRestrictions = @MedicalRestrictions');
            updateReq.input('MedicalRestrictions', sql.NVarChar, medicalRestrictions ? JSON.stringify(medicalRestrictions) : null);
        }
        if (estadoActual !== undefined) {
            fields.push('EstadoActual = @EstadoActual');
            updateReq.input('EstadoActual', sql.NVarChar, estadoActual);
            if (puestoLiberado) fields.push('CurrentSlotId = NULL', 'PhysicalLineLocation = NULL');
        }

        if (fields.length > 0) {
            fields.push('UpdatedAt = SYSUTCDATETIME()');
            await updateReq.query(`UPDATE Operarios SET ${fields.join(', ')} WHERE Id = @Id`);
        }

        await transaction.commit();

        io.emit('trabajadores_updated');
        if (puestoLiberado) io.emit('puestos_updated', {});

        res.json({ success: true, puestoLiberado: puestoLiberado ? puestoLiberado.toString() : null });
    } catch (err) {
        if (transaction) {
            try { await transaction.rollback(); } catch (e) {}
        }
        if (/UNIQUE|duplicate key|violation of UNIQUE/i.test(err.message)) {
            return res.status(400).json({ error: `Ya existe un operario con ese número de nómina.` });
        }
        res.status(400).json({ error: err.message });
    }
});

// Baja lógica: NO es DELETE. Operarios(Id) tiene 4 FK entrantes sin cascada
// (Puestos.OperarioAsignadoId, Puestos.IdWorkerOriginal, Ausencias.OperarioId,
// LineasAsignacion.OperarioId) y un ciclo de FK Operarios<->Puestos -un
// borrado físico fallaría o perdería historial de OEE/asignaciones-.
app.post('/api/operarios/:id/baja', requireAuth, requireRole('COORDINADOR'), async (req, res) => {
    const { id } = req.params;
    const { motivo } = req.body;

    const transaction = new sql.Transaction(pool);
    try {
        await transaction.begin();

        const opResult = await transaction.request()
            .input('Id', sql.Int, id)
            .query('SELECT * FROM Operarios WITH (UPDLOCK, SERIALIZABLE) WHERE Id = @Id');
        if (opResult.recordset.length === 0) throw new Error('Operario no encontrado.');
        const operario = opResult.recordset[0];

        if (operario.CurrentSlotId) {
            await transaction.request()
                .input('PuestoId', sql.Int, operario.CurrentSlotId)
                .query(`UPDATE Puestos SET OperarioAsignadoId = NULL, Estado = 'VACANTE', AssignedAt = NULL, RelevoSolicitado = 0, RejectedWorkerIdsJson = NULL WHERE Id = @PuestoId`);
        }

        // Nulificar titularidad (Rastro Dual) donde sea titular: si no, Motor 1
        // seguiría "viéndolo" como dueño de esa máquina aunque esté fuera de nómina.
        await transaction.request()
            .input('OperarioId', sql.Int, id)
            .query(`UPDATE Puestos SET IdWorkerOriginal = NULL WHERE IdWorkerOriginal = @OperarioId`);

        await transaction.request()
            .input('Id', sql.Int, id)
            .input('Motivo', sql.NVarChar, motivo || null)
            .query(`UPDATE Operarios SET
                        Activo = 0,
                        FechaBaja = SYSUTCDATETIME(),
                        MotivoBaja = @Motivo,
                        EstadoActual = 'INACTIVO',
                        CurrentSlotId = NULL,
                        PhysicalLineLocation = NULL,
                        LineaDestinoId = NULL,
                        TargetSlotId = NULL,
                        UpdatedAt = SYSUTCDATETIME()
                    WHERE Id = @Id`);

        await transaction.commit();

        io.emit('trabajadores_updated');
        io.emit('puestos_updated', {});

        res.json({ success: true });
    } catch (err) {
        if (transaction) {
            try { await transaction.rollback(); } catch (e) {}
        }
        res.status(400).json({ error: err.message });
    }
});

app.post('/api/operarios/:id/reactivar', requireAuth, requireRole('COORDINADOR'), async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.request()
            .input('Id', sql.Int, id)
            .query(`UPDATE Operarios SET Activo = 1, FechaBaja = NULL, MotivoBaja = NULL, EstadoActual = 'INACTIVO', UpdatedAt = SYSUTCDATETIME() WHERE Id = @Id`);
        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ error: 'Operario no encontrado.' });
        }
        io.emit('trabajadores_updated');
        res.json({ success: true });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Obtener programa de producción para el Coordinador
// NOTA (fix): la versión anterior devolvía un arreglo hardcodeado ignorando
// cualquier fecha. Ahora lee OrdenesProduccion de verdad (22 órdenes reales
// sembradas por migrate_real_data_fase3.js) y mapea a los nombres de campo
// camelCase que PanelCoordinador.jsx ya consume (lineaId/item/fechaProd).
app.get('/api/programa', requireAuth, async (req, res) => {
    const { fecha } = req.query;
    try {
        const request = pool.request();
        let query = 'SELECT * FROM OrdenesProduccion';
        if (fecha) {
            request.input('Fecha', sql.Date, fecha);
            query += ' WHERE FechaPlaneada = @Fecha';
        }
        query += ' ORDER BY Linea ASC';

        const result = await request.query(query);
        const orders = result.recordset.map(o => ({
            id: o.Id.toString(),
            lineaId: o.Linea,
            item: o.SKU,
            fechaProd: o.FechaPlaneada ? o.FechaPlaneada.toISOString().split('T')[0] : null,
            producto: o.Descripcion,
            cajas: o.MetaCajas,
            botellas: o.MetaBotellas,
            estado: o.Estado
        }));

        res.json(orders);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Obtener historial / OEE de la planta para una fecha específica.
// NOTA (fix): la versión anterior consultaba columnas que no existen en el
// esquema (OEE_Porcentaje/DeficitsTotales/ParosMinutos -las reales son
// OEE_Global/TiempoParoMinutos, sin DeficitsTotales-) e ignoraba la fecha.
// NOTA (cierre de turno): el cierre de turno casi nunca va a tener una orden
// planificada coincidente en este entorno (las órdenes sembradas son de
// fechas pasadas), así que el JOIN contra OrdenesProduccion es LEFT y se usa
// HistoricoOEE.Linea (denormalizada) con fallback a la orden si existe.
app.get('/api/historial', requireAuth, async (req, res) => {
    const { fecha } = req.query;
    if (!fecha) {
        return res.status(400).json({ error: 'El parámetro fecha es requerido (YYYY-MM-DD).' });
    }
    try {
        const result = await pool.request()
            .input('Fecha', sql.Date, fecha)
            .query(`
                SELECT h.*, COALESCE(h.Linea, o.Linea) AS LineaResuelta
                FROM HistoricoOEE h
                LEFT JOIN OrdenesProduccion o ON h.OrdenProduccionId = o.Id
                WHERE h.Fecha = @Fecha
            `);

        if (result.recordset.length === 0) {
            return res.json(null);
        }

        const lineStats = {};
        let totalOee = 0, totalDowntime = 0, totalMermas = 0;

        result.recordset.forEach(row => {
            const oee = row.OEE_Global || 0;
            totalOee += oee;
            totalDowntime += row.TiempoParoMinutos || 0;
            totalMermas += row.Mermas || 0;

            lineStats[row.LineaResuelta] = {
                oeePct: oee,
                disponibilidad: row.Disponibilidad,
                rendimiento: row.Rendimiento,
                calidad: row.Calidad,
                sku: row.Sku,
                supervisor: row.Supervisor,
                mermas: row.Mermas || 0,
                tiempoParoMinutos: row.TiempoParoMinutos || 0,
                turno: row.Turno
            };
        });

        res.json({
            fecha,
            metrics: {
                avgOee: Math.round(totalOee / result.recordset.length),
                totalDowntimeMinutes: totalDowntime,
                totalMermasProcess: totalMermas
            },
            lineStats
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Asignar supervisor a una línea
// NOTA (fix): la versión anterior escribía en LineasAsignacion.SupervisorAsignado /
// LineasAsignacion.LineID, columnas que no existen en el esquema (ver database_schema.sql).
// El dato real de "línea actual de un supervisor" vive en Supervisores.LineaAsignadaActual.
app.post('/api/supervisores/asignar', requireAuth, requireRole('COORDINADOR'), async (req, res) => {
    const { lineId, supervisorId } = req.body;
    if (!lineId || !supervisorId) {
        return res.status(400).json({ error: 'lineId y supervisorId son requeridos.' });
    }
    try {
        const result = await pool.request()
            .input('LineaAsignadaActual', sql.NVarChar, lineId)
            .input('UsuarioId', sql.Int, supervisorId)
            .query('UPDATE Supervisores SET LineaAsignadaActual = @LineaAsignadaActual WHERE UsuarioId = @UsuarioId');

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ error: `No existe un registro de Supervisor para el usuario ${supervisorId}.` });
        }

        // Emitir evento a todos los clientes conectados para actualizar el UI
        io.emit('lineas_updated', { lineId, supervisorId });

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Asignar puestos a operarios (usado tanto para asignación individual por
// escaneo QR -array de 1- como para asignación masiva del Motor 1/Coordinador)
const OCCUPIED_WORKER_STATES = ['ASIGNADO', 'EN_TRANSITO', 'BAJA_TEMPORAL'];

// Vocabulario canónico de Operarios.EstadoActual y PuestoBase — hasta esta
// ronda solo estaban documentados en un comentario de
// 03_supervisor_workflow_columns.sql:66-68 (los 6 de flujo) y ningún lado
// enumeraba los 5 de ausencia que la UI ya venía ofreciendo en la pestaña
// "Ausencias". No hay CHECK constraint en la base -se valida aquí, en el
// único lugar que hoy escribe estas columnas-.
const WORKER_FLOW_STATES = ['INACTIVO', 'POOL_ARRANQUE', 'ASIGNADO', 'EN_TRANSITO', 'DISPONIBLE_BOLSON', 'BAJA_TEMPORAL'];
const WORKER_ABSENCE_STATES = ['VACACIONES', 'PERMISOS', 'CONSULTAS_MEDICAS', 'SUBSIDIOS', 'ACCIDENTE_LABORAL'];
const WORKER_STATES = [...WORKER_FLOW_STATES, ...WORKER_ABSENCE_STATES];
const WORKER_PUESTO_BASE = ['Operario', 'Operador A', 'Operador B', 'Averiero', 'Auxiliar Materiales', 'Operador Calderas', 'Operario Filtros'];

// FIX (Gestión de Personal): OCCUPIED_WORKER_STATES es una blacklist pensada
// solo para "ya está en otro lado ahora mismo" — nunca incluyó los estados de
// ausencia (VACACIONES, PERMISOS, ...), así que hasta esta ronda un operario
// de vacaciones se podía asignar a un puesto sin que nada lo impidiera.
// NON_ASSIGNABLE_STATES es el guard real para "¿puede este operario tomar un
// puesto ahora?". INACTIVO se deja fuera a propósito: es el estado normal de
// quien terminó el turno anterior y se presenta hoy — bloquearlo rompería el
// arranque por QR.
const NON_ASSIGNABLE_STATES = [...OCCUPIED_WORKER_STATES, ...WORKER_ABSENCE_STATES];

app.post('/api/puestos/asignar', requireAuth, requireRole('COORDINADOR', 'SUPERVISOR'), requireLineOwnership, async (req, res) => {
    const { assignments } = req.body;

    if (!Array.isArray(assignments) || assignments.length === 0) {
        return res.status(400).json({ error: 'Se requiere un array "assignments" con al menos un elemento.' });
    }

    const transaction = new sql.Transaction(pool);
    try {
        await transaction.begin();

        for (let assign of assignments) {
            const puestoReq = await transaction.request()
                .input('PuestoId', sql.Int, assign.slotId)
                .query('SELECT * FROM Puestos WITH (UPDLOCK, SERIALIZABLE) WHERE Id = @PuestoId');

            const operarioReq = await transaction.request()
                .input('OperarioId', sql.Int, assign.workerId)
                .query('SELECT * FROM Operarios WITH (UPDLOCK, SERIALIZABLE) WHERE Id = @OperarioId');

            if (puestoReq.recordset.length === 0 || operarioReq.recordset.length === 0) {
                throw new Error("Puesto u Operario no encontrado");
            }

            const puesto = puestoReq.recordset[0];
            const operario = operarioReq.recordset[0];

            if (puesto.OperarioAsignadoId !== null && puesto.OperarioAsignadoId !== assign.workerId) {
                throw new Error("Colisión: El puesto ya fue ocupado por otro operario.");
            }

            if (NON_ASSIGNABLE_STATES.includes(operario.EstadoActual)) {
                throw new Error("Colisión: El operario ya fue asignado a otro puesto o no está disponible.");
            }

            // Validar salud ocupacional (restricción médica, regla 24h, sexo preferente)
            const check = canWorkerOccupiedSlot(operario, puesto);
            if (!check.allowed) {
                throw new Error(check.reason);
            }

            await transaction.request()
                .input('PuestoId', sql.Int, assign.slotId)
                .input('OperarioId', sql.Int, assign.workerId)
                .query(`UPDATE Puestos SET
                            OperarioAsignadoId = @OperarioId,
                            Estado = 'ASIGNADO',
                            AssignedAt = SYSUTCDATETIME(),
                            RelevoSolicitado = 0,
                            RejectedWorkerIdsJson = NULL
                        WHERE Id = @PuestoId`);

            await transaction.request()
                .input('OperarioId', sql.Int, assign.workerId)
                .input('PuestoId', sql.Int, assign.slotId)
                .query(`UPDATE Operarios SET
                            EstadoActual = 'ASIGNADO',
                            CurrentSlotId = @PuestoId,
                            LineaDestinoId = NULL,
                            TargetSlotId = NULL
                        WHERE Id = @OperarioId`);
        }

        await transaction.commit();

        io.emit('puestos_updated', { assignments });
        io.emit('trabajadores_updated');
        res.json({ success: true });
    } catch (err) {
        if (transaction) {
            try { await transaction.rollback(); } catch(e) {}
        }
        res.status(400).json({ error: err.message });
    }
});

// Obtener Puestos
// NOTA (fix): la forma anterior (nombre/operarioId/estado) no coincide con los
// campos que apiService.js / HudPlanta.jsx / SlotCard.jsx realmente leen
// (puestoName/idWorkerCurrent/status/asignadoEnSegundoVirtual/tipoPuesto/
// relevoSolicitado), heredados del esquema de documentos de Firestore. Se
// mantienen también los alias antiguos (nombre/operarioId/estado/fatiga) por
// compatibilidad con cualquier código que aún los use.
app.get('/api/puestos', requireAuth, async (req, res) => {
    try {
        const result = await pool.request().query('SELECT * FROM Puestos');
        const puestos = result.recordset.map(p => {
            let rejectedWorkerIds = [];
            try { rejectedWorkerIds = p.RejectedWorkerIdsJson ? JSON.parse(p.RejectedWorkerIdsJson) : []; } catch (e) {}

            return {
                id: p.Id.toString(),
                lineId: p.LineId,
                puestoName: p.NombrePuesto,
                nombre: p.NombrePuesto, // alias retrocompatible
                tipoPuesto: p.TipoPuesto,
                idWorkerCurrent: p.OperarioAsignadoId ? p.OperarioAsignadoId.toString() : null,
                operarioId: p.OperarioAsignadoId ? p.OperarioAsignadoId.toString() : null, // alias retrocompatible
                status: p.Estado,
                estado: p.Estado, // alias retrocompatible
                asignadoEnSegundoVirtual: p.AssignedAt ? p.AssignedAt.toISOString() : null,
                relevoSolicitado: !!p.RelevoSolicitado,
                rejectedWorkerIds,
                fatiga: p.NivelFatiga
            };
        });
        res.json(puestos);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Gestión de relevos, liberaciones, bajas y tránsitos de personal.
// Despachador transaccional multi-acción: cada rama corre bajo el mismo bloqueo
// (UPDLOCK, SERIALIZABLE) que /api/puestos/asignar, así que dos supervisores
// operando sobre el mismo puesto/operario en paralelo ya no pueden pisarse
// (antes 'asignar' hacía dos UPDATE sueltos sin ninguna transacción).
//
// La pertenencia de línea se valida DENTRO de la misma transacción bloqueada
// (no con el middleware requireLineOwnership genérico) porque varias acciones
// están indexadas por workerId, no por slotId, y porque revalidar sobre la fila
// ya bloqueada evita la ventana de carrera entre el chequeo del middleware y la
// escritura real.
app.post('/api/puestos/relevo', requireAuth, requireRole('COORDINADOR', 'SUPERVISOR'), async (req, res) => {
    const { action, slotId, newWorkerId, workerId, targetLineId, targetSlotId, slotIdA, slotIdB, originalSlotId } = req.body;
    const isCoordinador = req.user.role === 'COORDINADOR';
    const userLineId = req.user.lineId;

    const forbidden = (msg) => Object.assign(new Error(msg), { statusCode: 403 });

    const lockPuesto = async (transaction, id) => {
        if (!id) throw new Error('slotId es requerido para esta acción.');
        const r = await transaction.request()
            .input('PuestoId', sql.Int, id)
            .query('SELECT * FROM Puestos WITH (UPDLOCK, SERIALIZABLE) WHERE Id = @PuestoId');
        if (r.recordset.length === 0) throw new Error(`Puesto ${id} no encontrado.`);
        return r.recordset[0];
    };
    const lockOperario = async (transaction, id) => {
        if (!id) throw new Error('El id de operario es requerido para esta acción.');
        const r = await transaction.request()
            .input('OperarioId', sql.Int, id)
            .query('SELECT * FROM Operarios WITH (UPDLOCK, SERIALIZABLE) WHERE Id = @OperarioId');
        if (r.recordset.length === 0) throw new Error(`Operario ${id} no encontrado.`);
        return r.recordset[0];
    };
    const assertLineOwnership = (lineId) => {
        if (!isCoordinador && lineId !== userLineId) {
            throw forbidden(`Prohibido. No tienes permisos sobre la línea ${lineId}.`);
        }
    };
    const clearSlot = async (transaction, id) => {
        await transaction.request()
            .input('PuestoId', sql.Int, id)
            .query(`UPDATE Puestos SET
                        OperarioAsignadoId = NULL,
                        Estado = 'VACANTE',
                        AssignedAt = NULL,
                        RelevoSolicitado = 0,
                        RejectedWorkerIdsJson = NULL
                    WHERE Id = @PuestoId`);
    };
    const occupySlot = async (transaction, puestoId, operarioId, lineId) => {
        await transaction.request()
            .input('PuestoId', sql.Int, puestoId)
            .input('OperarioId', sql.Int, operarioId)
            .query(`UPDATE Puestos SET
                        OperarioAsignadoId = @OperarioId,
                        Estado = 'ASIGNADO',
                        AssignedAt = SYSUTCDATETIME(),
                        RelevoSolicitado = 0,
                        RejectedWorkerIdsJson = NULL
                    WHERE Id = @PuestoId`);
        await transaction.request()
            .input('OperarioId', sql.Int, operarioId)
            .input('PuestoId', sql.Int, puestoId)
            .input('Linea', sql.NVarChar, lineId)
            .query(`UPDATE Operarios SET
                        EstadoActual = 'ASIGNADO',
                        CurrentSlotId = @PuestoId,
                        PhysicalLineLocation = @Linea,
                        LineaDestinoId = NULL,
                        TargetSlotId = NULL
                    WHERE Id = @OperarioId`);
    };

    const transaction = new sql.Transaction(pool);
    let result = { success: true };
    try {
        await transaction.begin();

        switch (action) {
            // Retro-compatibilidad: acción genérica heredada (usada por el shim de
            // Firestore para llamadas updateDoc que no distinguen entre relevo/QR).
            case 'asignar': {
                const puesto = await lockPuesto(transaction, slotId);
                assertLineOwnership(puesto.LineId);
                const operario = await lockOperario(transaction, newWorkerId);

                if (NON_ASSIGNABLE_STATES.includes(operario.EstadoActual)) {
                    throw new Error('Colisión: El operario ya fue asignado a otro puesto o no está disponible.');
                }
                const check = canWorkerOccupiedSlot(operario, puesto);
                if (!check.allowed) throw new Error(check.reason);

                await occupySlot(transaction, slotId, newWorkerId, puesto.LineId);
                break;
            }

            case 'liberar':
            case 'baja_temporal': {
                const puesto = await lockPuesto(transaction, slotId);
                assertLineOwnership(puesto.LineId);
                const operarioId = puesto.OperarioAsignadoId;

                await clearSlot(transaction, slotId);

                if (operarioId) {
                    const nuevoEstado = action === 'baja_temporal' ? 'BAJA_TEMPORAL' : 'DISPONIBLE_BOLSON';
                    const nuevaUbicacion = action === 'baja_temporal' ? null : 'L8';
                    await transaction.request()
                        .input('OperarioId', sql.Int, operarioId)
                        .input('Estado', sql.NVarChar, nuevoEstado)
                        .input('Ubicacion', sql.NVarChar, nuevaUbicacion)
                        .query(`UPDATE Operarios SET
                                    EstadoActual = @Estado,
                                    CurrentSlotId = NULL,
                                    PhysicalLineLocation = @Ubicacion
                                WHERE Id = @OperarioId`);
                }
                break;
            }

            case 'solicitar_relevo': {
                const puesto = await lockPuesto(transaction, slotId);
                assertLineOwnership(puesto.LineId);
                if (puesto.Estado !== 'ASIGNADO') {
                    throw new Error('Solo se puede solicitar relevo en un puesto ocupado.');
                }
                await transaction.request()
                    .input('PuestoId', sql.Int, slotId)
                    .query("UPDATE Puestos SET RelevoSolicitado = 1 WHERE Id = @PuestoId");
                break;
            }

            case 'aceptar_relevo': {
                const puesto = await lockPuesto(transaction, slotId);
                assertLineOwnership(puesto.LineId);
                const relevista = await lockOperario(transaction, newWorkerId);

                if (NON_ASSIGNABLE_STATES.includes(relevista.EstadoActual)) {
                    throw new Error('El relevista ya no está disponible.');
                }
                const check = canWorkerOccupiedSlot(relevista, puesto);
                if (!check.allowed) throw new Error(check.reason);

                const relievedWorkerId = puesto.OperarioAsignadoId;
                if (relievedWorkerId) {
                    await transaction.request()
                        .input('OperarioId', sql.Int, relievedWorkerId)
                        .query(`UPDATE Operarios SET
                                    EstadoActual = 'EN_TRANSITO',
                                    LineaDestinoId = 'L8',
                                    TargetSlotId = NULL,
                                    CurrentSlotId = NULL
                                WHERE Id = @OperarioId`);
                }

                await occupySlot(transaction, slotId, newWorkerId, puesto.LineId);
                result.relievedWorkerId = relievedWorkerId || null;
                break;
            }

            case 'rechazar_relevo': {
                const puesto = await lockPuesto(transaction, slotId);
                assertLineOwnership(puesto.LineId);

                let blacklist = [];
                try { blacklist = puesto.RejectedWorkerIdsJson ? JSON.parse(puesto.RejectedWorkerIdsJson) : []; } catch (e) {}
                if (!blacklist.includes(newWorkerId)) blacklist.push(newWorkerId);

                await transaction.request()
                    .input('PuestoId', sql.Int, slotId)
                    .input('Blacklist', sql.NVarChar, JSON.stringify(blacklist))
                    .query('UPDATE Puestos SET RejectedWorkerIdsJson = @Blacklist WHERE Id = @PuestoId');

                await transaction.request()
                    .input('OperarioId', sql.Int, newWorkerId)
                    .query(`UPDATE Operarios SET
                                EstadoActual = 'EN_TRANSITO',
                                LineaDestinoId = 'L8',
                                TargetSlotId = NULL,
                                CurrentSlotId = NULL
                            WHERE Id = @OperarioId`);
                break;
            }

            case 'despachar': {
                const operario = await lockOperario(transaction, workerId);
                if (!isCoordinador && operario.PhysicalLineLocation !== userLineId) {
                    throw forbidden('Prohibido. El operario no se encuentra físicamente en tu línea.');
                }
                const DISPATCHABLE_STATES = ['DISPONIBLE_BOLSON', 'POOL_ARRANQUE'];
                if (!DISPATCHABLE_STATES.includes(operario.EstadoActual)) {
                    throw new Error('Solo se puede despachar a un operario disponible en Bolsón o Pool de Arranque.');
                }
                if (!targetLineId) throw new Error('targetLineId es requerido para despachar.');

                await transaction.request()
                    .input('OperarioId', sql.Int, workerId)
                    .input('TargetLineId', sql.NVarChar, targetLineId)
                    .input('TargetSlotId', sql.Int, targetSlotId || null)
                    .query(`UPDATE Operarios SET
                                EstadoActual = 'EN_TRANSITO',
                                LineaDestinoId = @TargetLineId,
                                TargetSlotId = @TargetSlotId,
                                CurrentSlotId = NULL
                            WHERE Id = @OperarioId`);

                if (targetSlotId) {
                    await transaction.request()
                        .input('PuestoId', sql.Int, targetSlotId)
                        .query("UPDATE Puestos SET RelevoSolicitado = 0 WHERE Id = @PuestoId");
                }
                break;
            }

            case 'confirmar_llegada': {
                const operario = await lockOperario(transaction, workerId);
                if (operario.EstadoActual !== 'EN_TRANSITO') {
                    throw new Error('El operario no está en tránsito.');
                }
                if (!isCoordinador && operario.LineaDestinoId !== userLineId) {
                    throw forbidden('Prohibido. Este operario no viene en tránsito hacia tu línea.');
                }
                const destinoSlotId = targetSlotId || operario.TargetSlotId;
                if (!destinoSlotId) throw new Error('No hay un puesto destino definido para confirmar la llegada.');

                const puestoDestino = await lockPuesto(transaction, destinoSlotId);
                if (puestoDestino.OperarioAsignadoId !== null) {
                    throw new Error('El puesto destino ya fue ocupado.');
                }

                await occupySlot(transaction, destinoSlotId, workerId, puestoDestino.LineId);
                break;
            }

            case 'retorno_bolson': {
                const operario = await lockOperario(transaction, workerId);
                if (operario.EstadoActual !== 'EN_TRANSITO' || operario.LineaDestinoId !== 'L8') {
                    throw new Error('El operario no está en tránsito hacia el Bolsón (L8).');
                }
                if (!isCoordinador && userLineId !== 'L8') {
                    throw forbidden('Prohibido. Solo el supervisor de L8 puede confirmar retornos al Bolsón.');
                }
                await transaction.request()
                    .input('OperarioId', sql.Int, workerId)
                    .query(`UPDATE Operarios SET
                                EstadoActual = 'DISPONIBLE_BOLSON',
                                PhysicalLineLocation = 'L8',
                                LineaDestinoId = NULL,
                                TargetSlotId = NULL,
                                CurrentSlotId = NULL
                            WHERE Id = @OperarioId`);
                break;
            }

            // INTERCAMBIO LOCAL: rota los operarios de dos puestos ya ocupados
            // de la misma línea (sugerido por HudPlanta.jsx como resolución
            // ergonómica cuando hay un puesto fatigado y no conviene sacar a
            // nadie hacia el Bolsón). Ninguno de los dos operarios cambia de
            // línea ni de estado; solo cruzan de puesto.
            case 'intercambio_local': {
                if (!slotIdA || !slotIdB) throw new Error('slotIdA y slotIdB son requeridos para el intercambio local.');
                if (slotIdA === slotIdB) throw new Error('No se puede intercambiar un puesto consigo mismo.');

                const puestoA = await lockPuesto(transaction, slotIdA);
                const puestoB = await lockPuesto(transaction, slotIdB);
                assertLineOwnership(puestoA.LineId);
                assertLineOwnership(puestoB.LineId);

                if (puestoA.LineId !== puestoB.LineId) {
                    throw new Error('Los dos puestos deben pertenecer a la misma línea para un intercambio local.');
                }
                if (!puestoA.OperarioAsignadoId || !puestoB.OperarioAsignadoId) {
                    throw new Error('Ambos puestos deben tener un operario asignado para poder intercambiarlos.');
                }

                const CRITICAL_TIPOS_PUESTO = ['Operador A', 'Averiero', 'Operador C'];
                if (CRITICAL_TIPOS_PUESTO.includes(puestoA.TipoPuesto) || CRITICAL_TIPOS_PUESTO.includes(puestoB.TipoPuesto)) {
                    throw new Error('Los puestos fijos/críticos no rotan en un intercambio local.');
                }

                const operarioA = await lockOperario(transaction, puestoA.OperarioAsignadoId);
                const operarioB = await lockOperario(transaction, puestoB.OperarioAsignadoId);

                // Defensa en profundidad: el cliente ya filtra parejas compatibles
                // en findLocalSwapCandidates/localSwapPair, pero el servidor no
                // confía solo en eso (mismo criterio fail-closed que /puestos/asignar).
                const checkAtoB = canWorkerOccupiedSlot(operarioA, puestoB);
                if (!checkAtoB.allowed) throw new Error(checkAtoB.reason);
                const checkBtoA = canWorkerOccupiedSlot(operarioB, puestoA);
                if (!checkBtoA.allowed) throw new Error(checkBtoA.reason);

                await transaction.request()
                    .input('PuestoId', sql.Int, slotIdA)
                    .input('OperarioId', sql.Int, operarioB.Id)
                    .query(`UPDATE Puestos SET OperarioAsignadoId = @OperarioId, AssignedAt = SYSUTCDATETIME(), RelevoSolicitado = 0 WHERE Id = @PuestoId`);
                await transaction.request()
                    .input('PuestoId', sql.Int, slotIdB)
                    .input('OperarioId', sql.Int, operarioA.Id)
                    .query(`UPDATE Puestos SET OperarioAsignadoId = @OperarioId, AssignedAt = SYSUTCDATETIME(), RelevoSolicitado = 0 WHERE Id = @PuestoId`);

                await transaction.request()
                    .input('OperarioId', sql.Int, operarioA.Id)
                    .input('SlotId', sql.Int, slotIdB)
                    .query(`UPDATE Operarios SET CurrentSlotId = @SlotId WHERE Id = @OperarioId`);
                await transaction.request()
                    .input('OperarioId', sql.Int, operarioB.Id)
                    .input('SlotId', sql.Int, slotIdA)
                    .query(`UPDATE Operarios SET CurrentSlotId = @SlotId WHERE Id = @OperarioId`);

                result = {
                    success: true,
                    workerAName: operarioA.NombreCompleto,
                    workerBName: operarioB.NombreCompleto,
                    puestoAName: puestoA.NombrePuesto,
                    puestoBName: puestoB.NombrePuesto
                };
                break;
            }

            // APLICAR SUGERENCIA DE ROTACIÓN (Coordinador): asigna un operario
            // disponible (Pool/Bolsón) a un puesto con déficit, o -si viene
            // originalSlotId- lo rota atómicamente desde un puesto que ya
            // ocupaba en otra línea de menor prioridad. Contraparte real de
            // PanelCoordinador.jsx:deficitSuggestions (tipos POOL/BOLSON/ROTACION).
            case 'aplicar_sugerencia': {
                if (!slotId || !workerId) throw new Error('slotId y workerId son requeridos para aplicar la sugerencia.');

                const puestoDestino = await lockPuesto(transaction, slotId);
                assertLineOwnership(puestoDestino.LineId);
                if (puestoDestino.OperarioAsignadoId !== null) {
                    throw new Error('El puesto destino ya fue ocupado.');
                }

                const operario = await lockOperario(transaction, workerId);
                const CRITICAL_TIPOS_PUESTO = ['Operador A', 'Averiero', 'Operador C'];

                if (originalSlotId) {
                    const puestoOrigen = await lockPuesto(transaction, originalSlotId);
                    assertLineOwnership(puestoOrigen.LineId);
                    // NOTA: Operarios.Id vuelve como string del driver (msnodesqlv8) mientras
                    // que Puestos.OperarioAsignadoId (FK al mismo campo) vuelve como number —
                    // comparar con Number() en ambos lados evita un falso "los datos cambiaron".
                    if (Number(puestoOrigen.OperarioAsignadoId) !== Number(operario.Id)) {
                        throw new Error('El operario ya no está asignado al puesto de origen indicado (los datos pueden haber cambiado).');
                    }
                    if (CRITICAL_TIPOS_PUESTO.includes(puestoOrigen.TipoPuesto)) {
                        throw new Error('Los puestos fijos/críticos no rotan mediante sugerencias automáticas.');
                    }
                } else {
                    if (NON_ASSIGNABLE_STATES.includes(operario.EstadoActual)) {
                        throw new Error('El operario ya no está disponible (Pool/Bolsón) para esta sugerencia.');
                    }
                }

                const check = canWorkerOccupiedSlot(operario, puestoDestino);
                if (!check.allowed) throw new Error(check.reason);

                if (originalSlotId) {
                    await clearSlot(transaction, originalSlotId);
                }
                await occupySlot(transaction, slotId, workerId, puestoDestino.LineId);

                result = { success: true, workerName: operario.NombreCompleto, slotName: puestoDestino.NombrePuesto };
                break;
            }

            default:
                throw new Error(`Acción de relevo desconocida: "${action}"`);
        }

        await transaction.commit();

        io.emit('puestos_updated', { slotId, action });
        io.emit('trabajadores_updated');
        res.json(result);
    } catch (err) {
        if (transaction) {
            try { await transaction.rollback(); } catch (e) {}
        }
        res.status(err.statusCode || 400).json({ error: err.message });
    }
});

// ==========================================
// CONFIGURACIÓN DE PLANTA (Línea/SKU/Turno) Y MOTOR 1
// ==========================================

// Lee un "documento" de configuración por id, replicando el contrato que el
// mock de Firestore esperaba (config/global_priority, config/shift_status,
// config/line_{lineId}) pero contra tablas reales (Lineas, ConfiguracionGlobal).
app.get('/api/config/:docId', requireAuth, async (req, res) => {
    const { docId } = req.params;
    try {
        if (docId === 'global_priority') {
            // Segundo punto de entrada de la activación automática de la
            // Planificación T+1 (ver login y ensureTodayPlanApplied): este doc lo
            // consulta reactivamente el dashboard del Coordinador, así que cubre
            // el caso de una sesión ya abierta cuando cruza la medianoche.
            await ensureTodayPlanApplied(pool);

            const cfgResult = await pool.request().query('SELECT * FROM ConfiguracionGlobal WHERE Id = 1');
            if (cfgResult.recordset.length === 0) {
                return res.json({ exists: false, data: {} });
            }
            const lineasResult = await pool.request().query('SELECT LineId, Sku, Status FROM Lineas');
            const cfg = cfgResult.recordset[0];

            let priorityOrder = [];
            try { priorityOrder = JSON.parse(cfg.PriorityOrderJson); } catch (e) {}

            const skuPlan = {};
            const activeLines = [];
            lineasResult.recordset.forEach(l => {
                if (l.Sku) skuPlan[l.LineId] = l.Sku;
                if (l.Status !== 'INACTIVA') activeLines.push(l.LineId);
            });

            return res.json({ exists: true, data: { priorityOrder, skuPlan, activeLines } });
        }

        if (docId === 'shift_status') {
            const cfgResult = await pool.request().query('SELECT ShiftStatus, ShiftStartTimestamp FROM ConfiguracionGlobal WHERE Id = 1');
            if (cfgResult.recordset.length === 0) {
                return res.json({ exists: false, data: {} });
            }
            const cfg = cfgResult.recordset[0];
            return res.json({
                exists: true,
                data: {
                    status: cfg.ShiftStatus,
                    shiftStartTimestamp: cfg.ShiftStartTimestamp ? cfg.ShiftStartTimestamp.toISOString() : null
                }
            });
        }

        if (docId.startsWith('line_')) {
            const lineId = docId.substring('line_'.length);
            const result = await pool.request()
                .input('LineId', sql.NVarChar, lineId)
                .query('SELECT * FROM Lineas WHERE LineId = @LineId');
            if (result.recordset.length === 0) {
                return res.json({ exists: false, data: {} });
            }
            const l = result.recordset[0];

            let activeParo = null;
            if (l.Status === 'PARO') {
                const paroResult = await pool.request()
                    .input('LineId', sql.NVarChar, lineId)
                    .query(`SELECT TOP 1 * FROM Paros WHERE LineId = @LineId AND FinalizadoEn IS NULL ORDER BY IniciadoEn DESC`);
                if (paroResult.recordset.length > 0) {
                    const p = paroResult.recordset[0];
                    activeParo = {
                        category: p.Categoria,
                        cause: p.Causa,
                        symptoms: p.Sintomas,
                        startedAt: p.IniciadoEn.toISOString()
                    };
                }
            }

            let mermas = mermasVacias();
            if (l.MermasJson) {
                try { mermas = JSON.parse(l.MermasJson); } catch (e) {}
            }

            return res.json({
                exists: true,
                data: {
                    status: l.Status,
                    sku: l.Sku,
                    fijosAssigned: !!l.FijosAssigned,
                    turnStartTimestamp: l.TurnStartTimestamp ? l.TurnStartTimestamp.toISOString() : null,
                    activeParo,
                    mermas,
                    mermaJustification: l.MermaJustification || ""
                }
            });
        }

        // Documento de config desconocido: comportamiento neutro (no existe)
        return res.json({ exists: false, data: {} });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// MOTOR 1: Inyección de turno. Fija el SKU planificado por línea, suspende
// las líneas sin SKU hoy (liberando hacia el Bolsón L8 a quien tuvieran
// asignado), y auto-asigna a operarios disponibles en POOL_ARRANQUE a los
// puestos fijos/críticos vacantes de las líneas activas. Los puestos varios
// (rotativos) NO se tocan aquí: esos los llena el supervisor manualmente
// por QR (ver /api/puestos/asignar).
//
// Extraído a función reusable (antes vivía inline dentro del handler de
// POST /api/coordinador/inyectar-turno) para que la activación automática
// de la Planificación T+1 (ensureTodayPlanApplied, más abajo) reutilice
// exactamente la misma lógica transaccional en vez de duplicarla. Debe
// llamarse ya dentro de una transacción abierta por el caller; no hace
// begin/commit/rollback ni emite eventos socket -eso es responsabilidad del
// caller, que sabe si además necesita hacer más cosas en la misma transacción
// (como aplicar supervisores, en el caso de la activación automática)-.
async function ejecutarInyeccionDeTurno(transaction, skuData) {
    const lineasResult = await transaction.request()
        .query('SELECT * FROM Lineas WITH (UPDLOCK, SERIALIZABLE)');

    const lineasActivas = [];
    const lineasInactivas = [];
    let totalAsignados = 0;

    for (const linea of lineasResult.recordset) {
        const skuAsignado = skuData[linea.LineId];
        const seraActiva = !!skuAsignado && !['INACTIVO', 'SIN SKU', 'SIN PLANIFICAR'].includes(skuAsignado);

        if (seraActiva) {
            lineasActivas.push(linea.LineId);
            await transaction.request()
                .input('LineId', sql.NVarChar, linea.LineId)
                .input('Sku', sql.NVarChar, skuAsignado)
                .query(`UPDATE Lineas SET
                            Sku = @Sku,
                            Status = 'ARRANQUE',
                            TurnStartTimestamp = CASE WHEN TurnStartTimestamp IS NULL THEN SYSUTCDATETIME() ELSE TurnStartTimestamp END,
                            UpdatedAt = SYSUTCDATETIME()
                        WHERE LineId = @LineId`);
            continue;
        }

        lineasInactivas.push(linea.LineId);
        await transaction.request()
            .input('LineId', sql.NVarChar, linea.LineId)
            .query(`UPDATE Lineas SET Sku = NULL, Status = 'INACTIVA', UpdatedAt = SYSUTCDATETIME() WHERE LineId = @LineId`);

        // Línea sin SKU hoy: suspender todos sus puestos y liberar a quien
        // tuvieran asignado hacia el Bolsón (Línea 8).
        const puestosLinea = await transaction.request()
            .input('LineId', sql.NVarChar, linea.LineId)
            .query('SELECT * FROM Puestos WITH (UPDLOCK, SERIALIZABLE) WHERE LineId = @LineId');

        for (const puesto of puestosLinea.recordset) {
            if (puesto.OperarioAsignadoId) {
                await transaction.request()
                    .input('OperarioId', sql.Int, puesto.OperarioAsignadoId)
                    .query(`UPDATE Operarios SET
                                EstadoActual = 'DISPONIBLE_BOLSON',
                                CurrentSlotId = NULL,
                                PhysicalLineLocation = 'L8'
                            WHERE Id = @OperarioId`);
            }
            await transaction.request()
                .input('PuestoId', sql.Int, puesto.Id)
                .query(`UPDATE Puestos SET
                            OperarioAsignadoId = NULL,
                            Estado = 'SUSPENDIDO',
                            AssignedAt = NULL,
                            RelevoSolicitado = 0,
                            RejectedWorkerIdsJson = NULL
                        WHERE Id = @PuestoId`);
        }
    }

    // Auto-asignación de puestos fijos/críticos en las líneas activas.
    for (const lineId of lineasActivas) {
        const puestosCriticos = await transaction.request()
            .input('LineId', sql.NVarChar, lineId)
            .query(`SELECT * FROM Puestos WITH (UPDLOCK, SERIALIZABLE)
                    WHERE LineId = @LineId AND Estado = 'VACANTE' AND TipoPuesto IN ('Operador A','Averiero','Operador C')`);

        for (const puesto of puestosCriticos.recordset) {
            const candidatosResult = await transaction.request()
                .query(`SELECT * FROM Operarios WITH (UPDLOCK, SERIALIZABLE) WHERE EstadoActual = 'POOL_ARRANQUE' AND Activo = 1 ORDER BY Id`);

            // Elegibles = pasan salud/género/regla 24h (canWorkerOccupiedSlot).
            // Entre los elegibles, se prioriza a quien tenga PuestoBase igual al
            // TipoPuesto del puesto (match de rol); si nadie coincide -no es
            // infrecuente, la migración real deja PuestoBase en NULL-, se toma
            // cualquier elegible disponible (ver notas de alcance del plan).
            const elegibles = candidatosResult.recordset.filter(op => canWorkerOccupiedSlot(op, puesto).allowed);
            if (elegibles.length === 0) continue; // Sin candidato apto: queda VACANTE para el supervisor

            const candidato = elegibles.find(op => op.PuestoBase === puesto.TipoPuesto) || elegibles[0];

            await transaction.request()
                .input('PuestoId', sql.Int, puesto.Id)
                .input('OperarioId', sql.Int, candidato.Id)
                .query(`UPDATE Puestos SET
                            OperarioAsignadoId = @OperarioId,
                            Estado = 'ASIGNADO',
                            AssignedAt = SYSUTCDATETIME()
                        WHERE Id = @PuestoId`);

            await transaction.request()
                .input('OperarioId', sql.Int, candidato.Id)
                .input('PuestoId', sql.Int, puesto.Id)
                .input('Linea', sql.NVarChar, lineId)
                .query(`UPDATE Operarios SET
                            EstadoActual = 'ASIGNADO',
                            CurrentSlotId = @PuestoId,
                            PhysicalLineLocation = @Linea
                        WHERE Id = @OperarioId`);

            totalAsignados++;
        }

        await transaction.request()
            .input('LineId', sql.NVarChar, lineId)
            .query(`UPDATE Lineas SET FijosAssigned = 1 WHERE LineId = @LineId`);
    }

    // Marca el arranque global del turno (conserva el timestamp original si
    // esta es una reinyección, para no reiniciar el reloj de arranque aislado).
    await transaction.request()
        .query(`UPDATE ConfiguracionGlobal SET
                    ShiftStatus = 'ARRANQUE',
                    ShiftStartTimestamp = CASE WHEN ShiftStartTimestamp IS NULL THEN SYSUTCDATETIME() ELSE ShiftStartTimestamp END,
                    UpdatedAt = SYSUTCDATETIME()
                WHERE Id = 1`);

    return { totalAsignados, lineasActivas, lineasInactivas };
}

app.post('/api/coordinador/inyectar-turno', requireAuth, requireRole('COORDINADOR'), async (req, res) => {
    const { skuData } = req.body;
    if (!skuData || typeof skuData !== 'object') {
        return res.status(400).json({ error: 'Se requiere el objeto "skuData" ({ lineId: sku }).' });
    }

    const transaction = new sql.Transaction(pool);
    try {
        await transaction.begin();

        const resultado = await ejecutarInyeccionDeTurno(transaction, skuData);

        await transaction.commit();

        io.emit('puestos_updated', {});
        io.emit('trabajadores_updated');
        io.emit('config_updated', {});

        res.json({ success: true, ...resultado });
    } catch (err) {
        if (transaction) {
            try { await transaction.rollback(); } catch (e) {}
        }
        res.status(400).json({ error: err.message });
    }
});

// ==========================================
// PLANIFICACIÓN T+1 (Coordinador)
// Reemplaza el doc "config/next_day_plan" (Firestore huérfano desde la
// migración a SQL Server -coordinatorApi.js exporta db={}, y el endpoint
// que el frontend llamaba, /api/turno/programar-siguiente, nunca existió-)
// por PlanificacionLineas: una fila real por (Fecha, Línea) con el SKU
// planificado, la orden de producción vinculada si existe, y el supervisor
// asignado. Al llegar la fecha planificada se activa sola (ver
// ensureTodayPlanApplied) reutilizando ejecutarInyeccionDeTurno (Motor 1).
// ==========================================

app.get('/api/planificacion', requireAuth, async (req, res) => {
    const { fecha } = req.query;
    if (!fecha) return res.status(400).json({ error: 'fecha es requerida (YYYY-MM-DD).' });
    try {
        const isCoordinador = req.user.role === 'COORDINADOR';
        const request = pool.request().input('Fecha', sql.Date, fecha);
        let query = `
            SELECT p.*, u.Nombre AS SupervisorNombre,
                   o.Descripcion AS OrdenDescripcion, o.MetaCajas, o.MetaBotellas
            FROM PlanificacionLineas p
            LEFT JOIN Usuarios u ON u.Id = p.SupervisorUsuarioId
            LEFT JOIN OrdenesProduccion o ON o.Id = p.OrdenProduccionId
            WHERE p.Fecha = @Fecha`;

        // El Supervisor solo ve sus propias líneas ya SELLADAS de esa fecha -nunca
        // borradores ajenos, ni líneas de otros supervisores-.
        if (!isCoordinador) {
            query += ` AND p.Status = 'CONFIRMADO' AND p.SupervisorUsuarioId = @UsuarioId`;
            request.input('UsuarioId', sql.Int, req.user.userId);
        }
        query += ' ORDER BY p.LineId ASC';

        const result = await request.query(query);
        res.json(result.recordset.map(r => ({
            id: r.Id,
            fecha: r.Fecha.toISOString().split('T')[0],
            lineId: r.LineId,
            sku: r.Sku,
            ordenProduccionId: r.OrdenProduccionId,
            ordenDescripcion: r.OrdenDescripcion || null,
            metaCajas: r.MetaCajas ?? null,
            metaBotellas: r.MetaBotellas ?? null,
            supervisorUsuarioId: r.SupervisorUsuarioId,
            supervisorNombre: r.SupervisorNombre || null,
            status: r.Status,
            aplicadoEn: r.AplicadoEn ? r.AplicadoEn.toISOString() : null
        })));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/planificacion/guardar', requireAuth, requireRole('COORDINADOR'), async (req, res) => {
    const { fecha, lineas } = req.body;
    if (!fecha || !Array.isArray(lineas)) {
        return res.status(400).json({ error: 'fecha y lineas (array de {lineId, sku, ordenProduccionId, supervisorUsuarioId}) son requeridos.' });
    }

    const transaction = new sql.Transaction(pool);
    try {
        await transaction.begin();

        const aplicadoCheck = await transaction.request()
            .input('Fecha', sql.Date, fecha)
            .query(`SELECT TOP 1 1 AS x FROM PlanificacionLineas WITH (UPDLOCK, SERIALIZABLE) WHERE Fecha = @Fecha AND AplicadoEn IS NOT NULL`);
        if (aplicadoCheck.recordset.length > 0) {
            throw new Error('Este plan ya se activó; no se puede replanificar retroactivamente.');
        }

        for (const linea of lineas) {
            const { lineId, sku, ordenProduccionId, supervisorUsuarioId } = linea || {};
            if (!lineId) continue;

            const existe = await transaction.request()
                .input('Fecha', sql.Date, fecha)
                .input('LineId', sql.NVarChar, lineId)
                .query('SELECT Id FROM PlanificacionLineas WITH (UPDLOCK, SERIALIZABLE) WHERE Fecha = @Fecha AND LineId = @LineId');

            if (existe.recordset.length > 0) {
                await transaction.request()
                    .input('Id', sql.Int, existe.recordset[0].Id)
                    .input('Sku', sql.NVarChar, sku || null)
                    .input('OrdenProduccionId', sql.Int, ordenProduccionId || null)
                    .input('SupervisorUsuarioId', sql.Int, supervisorUsuarioId || null)
                    .query(`UPDATE PlanificacionLineas SET
                                Sku = @Sku,
                                OrdenProduccionId = @OrdenProduccionId,
                                SupervisorUsuarioId = @SupervisorUsuarioId,
                                Status = 'BORRADOR',
                                UpdatedAt = SYSUTCDATETIME()
                            WHERE Id = @Id`);
            } else {
                await transaction.request()
                    .input('Fecha', sql.Date, fecha)
                    .input('LineId', sql.NVarChar, lineId)
                    .input('Sku', sql.NVarChar, sku || null)
                    .input('OrdenProduccionId', sql.Int, ordenProduccionId || null)
                    .input('SupervisorUsuarioId', sql.Int, supervisorUsuarioId || null)
                    .input('CreatedBy', sql.Int, req.user.userId)
                    .query(`INSERT INTO PlanificacionLineas (Fecha, LineId, Sku, OrdenProduccionId, SupervisorUsuarioId, Status, CreatedBy)
                            VALUES (@Fecha, @LineId, @Sku, @OrdenProduccionId, @SupervisorUsuarioId, 'BORRADOR', @CreatedBy)`);
            }
        }

        // Cualquier guardado reabre el plan completo de esa fecha (no solo las
        // líneas que vinieron en este payload) — un sello previo queda invalidado.
        await transaction.request()
            .input('Fecha', sql.Date, fecha)
            .query(`UPDATE PlanificacionLineas SET Status = 'BORRADOR', UpdatedAt = SYSUTCDATETIME() WHERE Fecha = @Fecha AND Status = 'CONFIRMADO'`);

        await transaction.commit();
        io.emit('config_updated', {});
        res.json({ success: true });
    } catch (err) {
        if (transaction) {
            try { await transaction.rollback(); } catch (e) {}
        }
        res.status(400).json({ error: err.message });
    }
});

app.post('/api/planificacion/confirmar', requireAuth, requireRole('COORDINADOR'), async (req, res) => {
    const { fecha } = req.body;
    if (!fecha) return res.status(400).json({ error: 'fecha es requerida.' });

    const transaction = new sql.Transaction(pool);
    try {
        await transaction.begin();

        const filas = await transaction.request()
            .input('Fecha', sql.Date, fecha)
            .query('SELECT * FROM PlanificacionLineas WITH (UPDLOCK, SERIALIZABLE) WHERE Fecha = @Fecha');

        if (filas.recordset.length === 0) {
            throw new Error('No hay ninguna línea planificada para esa fecha.');
        }
        if (filas.recordset.some(f => f.AplicadoEn)) {
            throw new Error('Este plan ya se activó; no se puede volver a sellar.');
        }
        // Fail-closed: no se puede sellar una línea activa (con SKU) sin
        // supervisor asignado — es la función de negocio explícita del
        // Coordinador en esta pantalla.
        const sinSupervisor = filas.recordset.filter(f => f.Sku && !f.SupervisorUsuarioId);
        if (sinSupervisor.length > 0) {
            throw new Error(`Falta asignar supervisor a: ${sinSupervisor.map(f => f.LineId).join(', ')}.`);
        }

        await transaction.request()
            .input('Fecha', sql.Date, fecha)
            .query(`UPDATE PlanificacionLineas SET Status = 'CONFIRMADO', UpdatedAt = SYSUTCDATETIME() WHERE Fecha = @Fecha`);

        await transaction.commit();
        io.emit('config_updated', {});
        res.json({ success: true, lineasConfirmadas: filas.recordset.length });
    } catch (err) {
        if (transaction) {
            try { await transaction.rollback(); } catch (e) {}
        }
        res.status(400).json({ error: err.message });
    }
});

// Activación automática: si hay un plan CONFIRMADO para la fecha de hoy que
// todavía no se aplicó, lo aplica ahora reutilizando ejecutarInyeccionDeTurno
// (Motor 1) y además fija a cada supervisor planificado en su línea. Es
// idempotente (AplicadoEn) y nunca lanza -los dos call-sites (login y
// GET /api/config/global_priority) no deben romperse si esto falla-.
async function ensureTodayPlanApplied(pool) {
    try {
        const pendientes = await pool.request()
            .query(`SELECT TOP 1 1 AS x FROM PlanificacionLineas WHERE Fecha = CAST(SYSUTCDATETIME() AS DATE) AND Status = 'CONFIRMADO' AND AplicadoEn IS NULL`);
        if (pendientes.recordset.length === 0) return;

        const transaction = new sql.Transaction(pool);
        try {
            await transaction.begin();

            // Re-lee bajo lock: puede que otra request concurrente (otro login
            // casi simultáneo) ya lo haya aplicado entre el SELECT de arriba y este.
            const filas = await transaction.request()
                .query(`SELECT * FROM PlanificacionLineas WITH (UPDLOCK, SERIALIZABLE) WHERE Fecha = CAST(SYSUTCDATETIME() AS DATE) AND Status = 'CONFIRMADO' AND AplicadoEn IS NULL`);

            if (filas.recordset.length === 0) {
                await transaction.commit();
                return;
            }

            const skuData = {};
            filas.recordset.forEach(f => { if (f.Sku) skuData[f.LineId] = f.Sku; });

            await ejecutarInyeccionDeTurno(transaction, skuData);

            for (const fila of filas.recordset) {
                if (!fila.Sku || !fila.SupervisorUsuarioId) continue;

                const existeSup = await transaction.request()
                    .input('UsuarioId', sql.Int, fila.SupervisorUsuarioId)
                    .query('SELECT Id FROM Supervisores WHERE UsuarioId = @UsuarioId');

                if (existeSup.recordset.length > 0) {
                    await transaction.request()
                        .input('UsuarioId', sql.Int, fila.SupervisorUsuarioId)
                        .input('LineId', sql.NVarChar, fila.LineId)
                        .query('UPDATE Supervisores SET LineaAsignadaActual = @LineId WHERE UsuarioId = @UsuarioId');
                } else {
                    await transaction.request()
                        .input('UsuarioId', sql.Int, fila.SupervisorUsuarioId)
                        .input('LineId', sql.NVarChar, fila.LineId)
                        .query('INSERT INTO Supervisores (UsuarioId, LineaAsignadaActual) VALUES (@UsuarioId, @LineId)');
                }
            }

            await transaction.request()
                .query(`UPDATE PlanificacionLineas SET AplicadoEn = SYSUTCDATETIME() WHERE Fecha = CAST(SYSUTCDATETIME() AS DATE) AND Status = 'CONFIRMADO' AND AplicadoEn IS NULL`);

            await transaction.commit();

            io.emit('puestos_updated', {});
            io.emit('trabajadores_updated');
            io.emit('config_updated', {});
            console.log(`[Planificación T+1] Plan activado automáticamente para ${filas.recordset.length} línea(s).`);
        } catch (err) {
            try { await transaction.rollback(); } catch (e) {}
            console.error('[Planificación T+1] Error activando el plan del día:', err.message);
        }
    } catch (err) {
        console.error('[Planificación T+1] Error verificando plan pendiente:', err.message);
    }
}

// MOTOR 4: Paros técnicos. Al iniciar un paro, los puestos fijos/críticos
// permanecen anclados (el técnico se queda ejecutando el ajuste mecánico);
// los puestos varios ocupados se liberan en bloque hacia el Bolsón L8 para
// no perder tiempo productivo mientras la línea está detenida.
app.post('/api/lineas/:lineId/paro/iniciar', requireAuth, requireRole('COORDINADOR', 'SUPERVISOR'), async (req, res) => {
    const { lineId } = req.params;
    const { categoria, causa, sintomas } = req.body;
    const isCoordinador = req.user.role === 'COORDINADOR';

    if (!isCoordinador && lineId !== req.user.lineId) {
        return res.status(403).json({ error: `Prohibido. No tienes permisos sobre la línea ${lineId}.` });
    }
    if (!categoria || !causa) {
        return res.status(400).json({ error: 'categoria y causa son requeridos.' });
    }

    const transaction = new sql.Transaction(pool);
    try {
        await transaction.begin();

        const lineaResult = await transaction.request()
            .input('LineId', sql.NVarChar, lineId)
            .query('SELECT * FROM Lineas WITH (UPDLOCK, SERIALIZABLE) WHERE LineId = @LineId');
        if (lineaResult.recordset.length === 0) throw new Error(`Línea ${lineId} no encontrada.`);

        const linea = lineaResult.recordset[0];
        if (linea.Status === 'INACTIVA') throw new Error('La línea no está activa hoy; no se puede registrar un paro.');
        if (linea.Status === 'PARO') throw new Error('Ya hay un paro activo en esta línea.');

        const paroInsert = await transaction.request()
            .input('LineId', sql.NVarChar, lineId)
            .input('Categoria', sql.NVarChar, categoria)
            .input('Causa', sql.NVarChar, causa)
            .input('Sintomas', sql.NVarChar, sintomas || null)
            .query(`INSERT INTO Paros (LineId, Categoria, Causa, Sintomas)
                    OUTPUT INSERTED.Id, INSERTED.IniciadoEn
                    VALUES (@LineId, @Categoria, @Causa, @Sintomas)`);
        const nuevoParo = paroInsert.recordset[0];

        await transaction.request()
            .input('LineId', sql.NVarChar, lineId)
            .query(`UPDATE Lineas SET Status = 'PARO', UpdatedAt = SYSUTCDATETIME() WHERE LineId = @LineId`);

        // Liberar en bloque los puestos varios ocupados (los críticos quedan anclados)
        const puestosVarios = await transaction.request()
            .input('LineId', sql.NVarChar, lineId)
            .query(`SELECT * FROM Puestos WITH (UPDLOCK, SERIALIZABLE)
                    WHERE LineId = @LineId AND Estado = 'ASIGNADO'
                    AND (TipoPuesto IS NULL OR TipoPuesto NOT IN ('Operador A','Averiero','Operador C'))`);

        for (const puesto of puestosVarios.recordset) {
            if (puesto.OperarioAsignadoId) {
                await transaction.request()
                    .input('OperarioId', sql.Int, puesto.OperarioAsignadoId)
                    .query(`UPDATE Operarios SET
                                EstadoActual = 'DISPONIBLE_BOLSON',
                                CurrentSlotId = NULL,
                                PhysicalLineLocation = 'L8'
                            WHERE Id = @OperarioId`);
            }
            await transaction.request()
                .input('PuestoId', sql.Int, puesto.Id)
                .query(`UPDATE Puestos SET
                            OperarioAsignadoId = NULL,
                            Estado = 'VACANTE',
                            AssignedAt = NULL,
                            RelevoSolicitado = 0,
                            RejectedWorkerIdsJson = NULL
                        WHERE Id = @PuestoId`);
        }

        await transaction.commit();

        io.emit('puestos_updated', {});
        io.emit('trabajadores_updated');
        io.emit('config_updated', {});

        res.json({
            success: true,
            paro: { id: nuevoParo.Id, lineId, categoria, causa, sintomas: sintomas || null, iniciadoEn: nuevoParo.IniciadoEn.toISOString() },
            puestosLiberados: puestosVarios.recordset.length
        });
    } catch (err) {
        if (transaction) {
            try { await transaction.rollback(); } catch (e) {}
        }
        res.status(400).json({ error: err.message });
    }
});

app.post('/api/lineas/:lineId/paro/finalizar', requireAuth, requireRole('COORDINADOR', 'SUPERVISOR'), async (req, res) => {
    const { lineId } = req.params;
    const isCoordinador = req.user.role === 'COORDINADOR';

    if (!isCoordinador && lineId !== req.user.lineId) {
        return res.status(403).json({ error: `Prohibido. No tienes permisos sobre la línea ${lineId}.` });
    }

    const transaction = new sql.Transaction(pool);
    try {
        await transaction.begin();

        const lineaResult = await transaction.request()
            .input('LineId', sql.NVarChar, lineId)
            .query('SELECT * FROM Lineas WITH (UPDLOCK, SERIALIZABLE) WHERE LineId = @LineId');
        if (lineaResult.recordset.length === 0) throw new Error(`Línea ${lineId} no encontrada.`);
        const linea = lineaResult.recordset[0];

        if (linea.Status !== 'PARO') throw new Error('No hay un paro activo en esta línea.');

        const paroResult = await transaction.request()
            .input('LineId', sql.NVarChar, lineId)
            .query(`SELECT TOP 1 * FROM Paros WITH (UPDLOCK, SERIALIZABLE) WHERE LineId = @LineId AND FinalizadoEn IS NULL ORDER BY IniciadoEn DESC`);

        let paroFinalizado = null;
        let duracionSegundos = null;

        if (paroResult.recordset.length === 0) {
            // Self-heal: el status decía PARO pero no hay fila abierta -inconsistencia-.
            // Se corrige el status sin fallar la petición.
            console.warn(`[Paros] Inconsistencia detectada en línea ${lineId}: status PARO sin registro abierto. Autocorrigiendo.`);
        } else {
            const paro = paroResult.recordset[0];
            const finalizarResult = await transaction.request()
                .input('ParoId', sql.Int, paro.Id)
                .query(`UPDATE Paros SET
                            FinalizadoEn = SYSUTCDATETIME(),
                            DuracionSegundos = DATEDIFF(SECOND, IniciadoEn, SYSUTCDATETIME())
                        OUTPUT INSERTED.DuracionSegundos, INSERTED.FinalizadoEn
                        WHERE Id = @ParoId`);
            duracionSegundos = finalizarResult.recordset[0].DuracionSegundos;
            paroFinalizado = {
                id: paro.Id,
                lineId,
                categoria: paro.Categoria,
                causa: paro.Causa,
                sintomas: paro.Sintomas,
                iniciadoEn: paro.IniciadoEn.toISOString(),
                finalizadoEn: finalizarResult.recordset[0].FinalizadoEn.toISOString(),
                duracionSegundos
            };
        }

        await transaction.request()
            .input('LineId', sql.NVarChar, lineId)
            .query(`UPDATE Lineas SET Status = 'PRODUCCION', UpdatedAt = SYSUTCDATETIME() WHERE LineId = @LineId`);

        await transaction.commit();

        io.emit('puestos_updated', {});
        io.emit('trabajadores_updated');
        io.emit('config_updated', {});

        res.json({ success: true, paroFinalizado, duracionSegundos });
    } catch (err) {
        if (transaction) {
            try { await transaction.rollback(); } catch (e) {}
        }
        res.status(400).json({ error: err.message });
    }
});

const MERMA_MATERIALES = ['tapon', 'botella', 'estuche', 'etiqueta'];
const mermasVacias = () => MERMA_MATERIALES.reduce((acc, m) => { acc[m] = { inventario: 0, proceso: 0 }; return acc; }, {});

// MERMAS: guarda el snapshot actual del formulario de LineaSku.jsx (4
// materiales x inventario/proceso) para la línea en curso. Vive en
// Lineas.MermasJson -mismo criterio que activeParo: estado del turno, se
// resetea al cerrar turno- y alimenta tanto el cierre de turno (Calidad del
// OEE) como el gráfico de mermas de PanelCoordinador.jsx, ambos vía
// GET /api/config/line_{lineId}.
app.post('/api/lineas/:lineId/mermas', requireAuth, requireRole('COORDINADOR', 'SUPERVISOR'), async (req, res) => {
    const { lineId } = req.params;
    const isCoordinador = req.user.role === 'COORDINADOR';

    if (!isCoordinador && lineId !== req.user.lineId) {
        return res.status(403).json({ error: `Prohibido. No tienes permisos sobre la línea ${lineId}.` });
    }

    const mermasInput = req.body.mermas || {};
    const justification = (req.body.justification || '').trim();

    // Sanea a solo los 4 materiales conocidos, mismo casteo que el cliente
    // (LineaSku.jsx handleMermaChange): entero >= 0.
    const mermasSaneadas = {};
    let totalProcessWaste = 0;
    for (const material of MERMA_MATERIALES) {
        const entrada = mermasInput[material] || {};
        const inventario = Math.max(0, parseInt(entrada.inventario) || 0);
        const proceso = Math.max(0, parseInt(entrada.proceso) || 0);
        mermasSaneadas[material] = { inventario, proceso };
        totalProcessWaste += proceso;
    }

    try {
        const lineaResult = await pool.request()
            .input('LineId', sql.NVarChar, lineId)
            .query('SELECT * FROM Lineas WHERE LineId = @LineId');
        if (lineaResult.recordset.length === 0) throw new Error(`Línea ${lineId} no encontrada.`);
        const linea = lineaResult.recordset[0];

        if (linea.Status === 'INACTIVA') throw new Error('La línea no está activa; no se pueden registrar mermas.');
        if (!linea.TurnStartTimestamp) throw new Error('El turno de esta línea nunca inició formalmente (falta la inyección del Motor 1).');

        // Misma fórmula de producción estimada que el cierre de turno, para
        // validar server-side la regla del 5% (defensa en profundidad: el
        // cliente ya bloquea el botón, pero no hay que confiar solo en eso).
        const parosResult = await pool.request()
            .input('LineId', sql.NVarChar, lineId)
            .input('TurnStart', sql.DateTime2, linea.TurnStartTimestamp)
            .query(`SELECT ISNULL(SUM(DuracionSegundos), 0) AS TotalParoSegundos FROM Paros WHERE LineId = @LineId AND IniciadoEn >= @TurnStart AND FinalizadoEn IS NOT NULL`);
        const totalParoSeconds = parosResult.recordset[0].TotalParoSegundos;
        const totalElapsedSeconds = Math.max(60, Math.floor((Date.now() - linea.TurnStartTimestamp.getTime()) / 1000));
        const runSeconds = Math.max(0, totalElapsedSeconds - totalParoSeconds);

        const sku = linea.Sku || '';
        let speedPerMin = 100;
        if (sku.includes('BOST')) speedPerMin = 120;
        else if (sku.includes('LITE')) speedPerMin = 80;
        const estimatedProduction = Math.max(100, Math.round((runSeconds * speedPerMin) / 60));

        const wastePercentage = estimatedProduction > 0 ? (totalProcessWaste / estimatedProduction) * 100 : 0;
        if (wastePercentage > 5 && !justification) {
            throw new Error(`El desperdicio de proceso (${wastePercentage.toFixed(1)}%) supera el límite tolerado del 5%. Debe justificarlo.`);
        }

        await pool.request()
            .input('LineId', sql.NVarChar, lineId)
            .input('MermasJson', sql.NVarChar, JSON.stringify(mermasSaneadas))
            .input('MermaJustification', sql.NVarChar, wastePercentage > 5 ? justification : null)
            .query(`UPDATE Lineas SET MermasJson = @MermasJson, MermaJustification = @MermaJustification, UpdatedAt = SYSUTCDATETIME() WHERE LineId = @LineId`);

        io.emit('config_updated', {});

        res.json({ success: true, totalProcessWaste, wastePercentage: Math.round(wastePercentage * 10) / 10 });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// CIERRE DE TURNO: calcula el OEE real del turno (disponibilidad por paros,
// cobertura de puestos, calidad -con las mermas reales guardadas vía
// POST /lineas/:lineId/mermas-), lo persiste en HistoricoOEE (lo que finalmente alimenta
// GET /api/historial), resetea los puestos de la línea para el siguiente
// turno, y despacha a cada operario asignado a POOL_ARRANQUE (doble turno)
// o INACTIVO (fin de turno).
app.post('/api/lineas/:lineId/cerrar-turno', requireAuth, requireRole('COORDINADOR', 'SUPERVISOR'), async (req, res) => {
    const { lineId } = req.params;
    const workersDobleTurno = Array.isArray(req.body.workersDobleTurno) ? req.body.workersDobleTurno.map(Number) : [];
    const isCoordinador = req.user.role === 'COORDINADOR';

    if (!isCoordinador && lineId !== req.user.lineId) {
        return res.status(403).json({ error: `Prohibido. No tienes permisos sobre la línea ${lineId}.` });
    }

    const transaction = new sql.Transaction(pool);
    try {
        await transaction.begin();

        const lineaResult = await transaction.request()
            .input('LineId', sql.NVarChar, lineId)
            .query('SELECT * FROM Lineas WITH (UPDLOCK, SERIALIZABLE) WHERE LineId = @LineId');
        if (lineaResult.recordset.length === 0) throw new Error(`Línea ${lineId} no encontrada.`);
        const linea = lineaResult.recordset[0];

        if (linea.Status === 'INACTIVA') throw new Error('La línea no está activa; no hay turno que cerrar.');
        if (!linea.TurnStartTimestamp) throw new Error('El turno de esta línea nunca inició formalmente (falta la inyección del Motor 1).');

        // Si queda un paro abierto, se cierra en la misma transacción (evita
        // dejar un registro huérfano sin FinalizadoEn para siempre).
        const paroAbiertoResult = await transaction.request()
            .input('LineId', sql.NVarChar, lineId)
            .query(`SELECT TOP 1 * FROM Paros WITH (UPDLOCK, SERIALIZABLE) WHERE LineId = @LineId AND FinalizadoEn IS NULL ORDER BY IniciadoEn DESC`);
        if (paroAbiertoResult.recordset.length > 0) {
            await transaction.request()
                .input('ParoId', sql.Int, paroAbiertoResult.recordset[0].Id)
                .query(`UPDATE Paros SET FinalizadoEn = SYSUTCDATETIME(), DuracionSegundos = DATEDIFF(SECOND, IniciadoEn, SYSUTCDATETIME()) WHERE Id = @ParoId`);
        }

        // --- Cálculo de OEE (misma fórmula que la versión original) ---
        const parosResult = await transaction.request()
            .input('LineId', sql.NVarChar, lineId)
            .input('TurnStart', sql.DateTime2, linea.TurnStartTimestamp)
            .query(`SELECT ISNULL(SUM(DuracionSegundos), 0) AS TotalParoSegundos FROM Paros WHERE LineId = @LineId AND IniciadoEn >= @TurnStart AND FinalizadoEn IS NOT NULL`);
        const totalParoSeconds = parosResult.recordset[0].TotalParoSegundos;

        const totalElapsedSeconds = Math.max(60, Math.floor((Date.now() - linea.TurnStartTimestamp.getTime()) / 1000));
        const runSeconds = Math.max(0, totalElapsedSeconds - totalParoSeconds);
        const availability = runSeconds / totalElapsedSeconds;

        const puestosLineaResult = await transaction.request()
            .input('LineId', sql.NVarChar, lineId)
            .query(`SELECT * FROM Puestos WITH (UPDLOCK, SERIALIZABLE) WHERE LineId = @LineId`);
        const puestosLinea = puestosLineaResult.recordset;
        const totalSlots = puestosLinea.length || 8;
        const activeSlotsCount = puestosLinea.filter(p => p.Estado === 'ASIGNADO').length;
        const coverageFactor = totalSlots > 0 ? (activeSlotsCount / totalSlots) : 1;
        const performance = coverageFactor * 0.98;

        const sku = linea.Sku || '';
        let speedPerMin = 100;
        if (sku.includes('BOST')) speedPerMin = 120;
        else if (sku.includes('LITE')) speedPerMin = 80;
        const estimatedProduction = Math.max(100, Math.round((runSeconds * speedPerMin) / 60));
        // Mermas reales guardadas vía POST /lineas/:lineId/mermas durante el turno.
        let processWaste = 0;
        if (linea.MermasJson) {
            try {
                const mermasTurno = JSON.parse(linea.MermasJson);
                processWaste = Object.values(mermasTurno).reduce((acc, m) => acc + (parseInt(m?.proceso) || 0), 0);
            } catch (e) {}
        }
        const quality = estimatedProduction > 0 ? Math.max(0, Math.min(1, (estimatedProduction - processWaste) / estimatedProduction)) : 1;

        const finalOee = Math.round(availability * performance * quality * 100);

        const hourUtc = new Date().getUTCHours();
        const turno = (hourUtc >= 6 && hourUtc < 14) ? 'Matutino' : (hourUtc >= 14 && hourUtc < 22) ? 'Vespertino' : 'Nocturno';

        let supervisorNombre = null;
        if (!isCoordinador) {
            supervisorNombre = req.user.supervisorName || null;
        }

        // Intentar linkear una orden planificada real (línea+SKU+hoy); si no
        // existe -lo normal en este entorno-, queda NULL y se usa la
        // denormalización (Linea/Sku directamente en HistoricoOEE).
        const ordenMatch = await transaction.request()
            .input('LineId', sql.NVarChar, lineId)
            .input('Sku', sql.NVarChar, sku)
            .query(`SELECT TOP 1 Id FROM OrdenesProduccion WHERE Linea = @LineId AND SKU = @Sku AND FechaPlaneada = CAST(SYSUTCDATETIME() AS DATE)`);
        const ordenProduccionId = ordenMatch.recordset.length > 0 ? ordenMatch.recordset[0].Id : null;

        await transaction.request()
            .input('OrdenProduccionId', sql.Int, ordenProduccionId)
            .input('Linea', sql.NVarChar, lineId)
            .input('Sku', sql.NVarChar, sku || null)
            .input('Turno', sql.NVarChar, turno)
            .input('Supervisor', sql.NVarChar, supervisorNombre)
            .input('Disponibilidad', sql.Decimal(5, 2), Math.round(availability * 100))
            .input('Rendimiento', sql.Decimal(5, 2), Math.round(performance * 100))
            .input('Calidad', sql.Decimal(5, 2), Math.round(quality * 100))
            .input('OeeGlobal', sql.Decimal(5, 2), finalOee)
            .input('Mermas', sql.Int, processWaste)
            .input('TiempoParoMinutos', sql.Int, Math.round(totalParoSeconds / 60))
            .query(`INSERT INTO HistoricoOEE (OrdenProduccionId, Fecha, Turno, Linea, Sku, Supervisor, Disponibilidad, Rendimiento, Calidad, OEE_Global, Mermas, TiempoParoMinutos)
                    VALUES (@OrdenProduccionId, CAST(SYSUTCDATETIME() AS DATE), @Turno, @Linea, @Sku, @Supervisor, @Disponibilidad, @Rendimiento, @Calidad, @OeeGlobal, @Mermas, @TiempoParoMinutos)`);

        // --- Resetear puestos de la línea ---
        for (const puesto of puestosLinea) {
            const esCritico = ['Operador A', 'Averiero', 'Operador C'].includes(puesto.TipoPuesto);
            await transaction.request()
                .input('PuestoId', sql.Int, puesto.Id)
                .input('Estado', sql.NVarChar, esCritico ? 'ALERTA_VACANTE' : 'VACANTE')
                .query(`UPDATE Puestos SET
                            OperarioAsignadoId = NULL,
                            IdWorkerOriginal = NULL,
                            Estado = @Estado,
                            AssignedAt = NULL,
                            RelevoSolicitado = 0,
                            RejectedWorkerIdsJson = NULL
                        WHERE Id = @PuestoId`);
        }

        // --- Despachar a los operarios que estaban en la línea ---
        // (se usa el snapshot de puestosLinea capturado antes del reset de
        // arriba, ya que OperarioAsignadoId ya quedó limpiado en Puestos)
        const workerIdsEnLinea = puestosLinea.map(p => p.OperarioAsignadoId).filter(id => id !== null);

        for (const operarioId of workerIdsEnLinea) {
            const esDobleTurno = workersDobleTurno.includes(operarioId);
            await transaction.request()
                .input('OperarioId', sql.Int, operarioId)
                .input('Estado', sql.NVarChar, esDobleTurno ? 'POOL_ARRANQUE' : 'INACTIVO')
                .query(`UPDATE Operarios SET
                            EstadoActual = @Estado,
                            CurrentSlotId = NULL,
                            PhysicalLineLocation = NULL,
                            LineaDestinoId = NULL,
                            TargetSlotId = NULL
                        WHERE Id = @OperarioId`);
        }

        // --- Resetear la línea para el siguiente turno ---
        // NOTA: se usa 'INACTIVA' (no 'PREPARACION') a propósito -mismo
        // criterio que el Motor 1-: HudPlanta.jsx dispara una auto-asignación
        // heredada del mock cuando ve status "PREPARACION".
        await transaction.request()
            .input('LineId', sql.NVarChar, lineId)
            .query(`UPDATE Lineas SET Status = 'INACTIVA', Sku = NULL, FijosAssigned = 0, TurnStartTimestamp = NULL, MermasJson = NULL, MermaJustification = NULL, UpdatedAt = SYSUTCDATETIME() WHERE LineId = @LineId`);

        await transaction.commit();

        io.emit('puestos_updated', {});
        io.emit('trabajadores_updated');
        io.emit('config_updated', {});

        res.json({
            success: true,
            oee: {
                availabilityPct: Math.round(availability * 100),
                performancePct: Math.round(performance * 100),
                qualityPct: Math.round(quality * 100),
                oeeGlobalPct: finalOee
            },
            totalParoMinutos: Math.round(totalParoSeconds / 60),
            totalMermas: processWaste,
            workersDobleTurno: workerIdsEnLinea.filter(id => workersDobleTurno.includes(id)),
            workersInactivados: workerIdsEnLinea.filter(id => !workersDobleTurno.includes(id))
        });
    } catch (err) {
        if (transaction) {
            try { await transaction.rollback(); } catch (e) {}
        }
        res.status(400).json({ error: err.message });
    }
});

// ==========================================
// SUPERVISORES
// ==========================================

// Obtener lista pública de supervisores (solo para dropdown de login)
app.get('/api/supervisores/publico', async (req, res) => {
    try {
        const result = await pool.request()
            .query(`
                SELECT 
                    Id, 
                    Nombre, 
                    Username 
                FROM Usuarios 
                WHERE Rol = 'SUPERVISOR' OR Rol = 'Supervisor'
                ORDER BY Nombre ASC
            `);
            
        const formatted = result.recordset.map(u => ({
            id: String(u.Id),
            name: u.Nombre,
            username: u.Username
        }));
        
        res.json(formatted);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Obtener lista completa de supervisores para el Panel del Coordinador
app.get('/api/supervisores', requireAuth, requireRole('COORDINADOR'), async (req, res) => {
    try {
        const result = await pool.request()
            .query(`
                SELECT 
                    u.Id, 
                    u.Nombre, 
                    u.Username,
                    u.Rol,
                    s.LineaAsignadaActual
                FROM Usuarios u
                LEFT JOIN Supervisores s ON u.Id = s.UsuarioId
                WHERE u.Rol = 'SUPERVISOR' OR u.Rol = 'Supervisor'
                ORDER BY u.Nombre ASC
            `);
            
        const formatted = result.recordset.map(u => {
            // Derivar shortName como primer y último nombre (si hay más de 1 palabra)
            const parts = u.Nombre.split(' ');
            const shortName = parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1]}` : u.Nombre;
            
            return {
                id: String(u.Id),
                workerId: String(u.Id), // Backwards compatibility con PanelCoordinador
                name: u.Nombre,
                shortName: shortName,
                username: u.Username,
                role: u.Rol.toUpperCase(),
                assignedLine: u.LineaAsignadaActual,
                lineId: u.LineaAsignadaActual
            };
        });
        
        res.json(formatted);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// WEBSOCKETS (Tiempo Real)
// ==========================================
io.on('connection', (socket) => {
    console.log('🔌 Nuevo cliente conectado:', socket.id);

    socket.on('disconnect', () => {
        console.log('❌ Cliente desconectado:', socket.id);
    });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`🚀 Servidor backend corriendo en http://localhost:${PORT}`);
});
