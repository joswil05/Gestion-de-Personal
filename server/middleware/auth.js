const jwt = require('jsonwebtoken');
const sql = require('mssql/msnodesqlv8');

// Middleware para verificar JWT
function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No autorizado. Token faltante o formato inválido.' });
    }

    const token = authHeader.split(' ')[1];
    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        req.user = payload; // { userId, role, lineId, supervisorName, username }
        next();
    } catch (err) {
        return res.status(401).json({ error: 'No autorizado. Token expirado o inválido.' });
    }
}

// Middleware de roles configurables
function requireRole(...allowedRoles) {
    return (req, res, next) => {
        if (!req.user || !req.user.role) {
            return res.status(401).json({ error: 'No autorizado. Usuario sin rol.' });
        }
        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Prohibido. Rol insuficiente para esta acción.' });
        }
        next();
    };
}

// Middleware para verificar la propiedad de la línea.
// Antes: una consulta SELECT por cada slotId a validar (N+1) dentro de un
// bucle secuencial de awaits (AUDIT_REPORT.md M-12). Ahora: una sola
// consulta con IN, y trata el caso de un supervisor sin línea asignada
// (req.user.lineId nulo/"Sin Asignar" — ver paso 3.5) antes de tocar la DB.
async function requireLineOwnership(req, res, next) {
    if (!req.user) {
        return res.status(401).json({ error: 'No autorizado.' });
    }

    // Coordinador tiene acceso total
    if (req.user.role === 'COORDINADOR') {
        return next();
    }

    // Si es SUPERVISOR, validamos a nivel de base de datos
    if (req.user.role === 'SUPERVISOR') {
        if (!req.user.lineId || req.user.lineId === 'Sin Asignar') {
            return res.status(403).json({ error: 'No tienes una línea asignada.' });
        }

        let slotIdsToCheck = [];

        // /api/puestos/asignar -> req.body.assignments = [{ slotId, workerId }]
        if (req.body.assignments && Array.isArray(req.body.assignments)) {
            slotIdsToCheck = req.body.assignments.map(a => a.slotId);
        }
        // /api/puestos/relevo -> req.body.slotId
        else if (req.body.slotId) {
            slotIdsToCheck.push(req.body.slotId);
        }

        if (slotIdsToCheck.length === 0) {
            return res.status(400).json({ error: 'No se encontraron puestos para validar en el request.' });
        }

        // Los ids deben ser enteros antes de interpolarlos en el IN (...):
        // la interpolación es segura PORQUE se filtró a enteros justo aquí,
        // no porque venga saneada de otro lado — no leer esto como una
        // inyección SQL en una futura revisión.
        const ids = slotIdsToCheck.map(Number).filter(Number.isInteger);
        if (ids.length !== slotIdsToCheck.length) {
            return res.status(400).json({ error: 'Identificadores de puesto inválidos.' });
        }

        const pool = req.app.locals.pool;
        if (!pool) {
            return res.status(500).json({ error: 'Error interno de DB.' });
        }

        try {
            const result = await pool.request()
                .query(`SELECT Id, LineId FROM Puestos WHERE Id IN (${ids.join(',')})`);

            // El driver (msnodesqlv8) devuelve Puestos.Id como string aunque
            // la columna sea INT; Number(...) en ambos lados evita un falso
            // "puesto no encontrado" por comparar '5' (driver) contra 5 (ids,
            // ya normalizado arriba) como claves de Map distintas.
            const encontrados = new Map(result.recordset.map(r => [Number(r.Id), r.LineId]));
            for (const id of ids) {
                const actualLineId = encontrados.get(id);
                if (actualLineId === undefined) {
                    return res.status(404).json({ error: `Puesto con ID ${id} no encontrado.` });
                }
                if (actualLineId !== req.user.lineId) {
                    return res.status(403).json({
                        error: `Prohibido. No tienes permisos sobre la línea ${actualLineId} asociada al puesto ${id}. Tu línea asignada es ${req.user.lineId}.`
                    });
                }
            }

            return next();
        } catch (err) {
            console.error('[requireLineOwnership]', err);
            return res.status(500).json({ error: 'Error interno verificando permisos.' });
        }
    }

    return res.status(403).json({ error: 'Prohibido.' });
}

module.exports = {
    requireAuth,
    requireRole,
    requireLineOwnership
};
