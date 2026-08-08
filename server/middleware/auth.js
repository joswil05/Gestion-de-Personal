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

// Middleware para verificar la propiedad de la línea
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

        const pool = req.app.locals.pool;
        if (!pool) {
            return res.status(500).json({ error: 'Error interno de DB.' });
        }

        try {
            // Verificar cada slot en la base de datos
            for (let slotId of slotIdsToCheck) {
                const result = await pool.request()
                    .input('PuestoId', sql.Int, slotId)
                    .query('SELECT LineId FROM Puestos WHERE Id = @PuestoId');
                
                if (result.recordset.length === 0) {
                    return res.status(404).json({ error: `Puesto con ID ${slotId} no encontrado.` });
                }

                const actualLineId = result.recordset[0].LineId;
                if (actualLineId !== req.user.lineId) {
                    return res.status(403).json({ 
                        error: `Prohibido. No tienes permisos sobre la línea ${actualLineId} asociada al puesto ${slotId}. Tu línea asignada es ${req.user.lineId}.` 
                    });
                }
            }

            return next();
        } catch (err) {
            return res.status(500).json({ error: 'Error interno verificando permisos.', detail: err.message });
        }
    }

    return res.status(403).json({ error: 'Prohibido.' });
}

module.exports = {
    requireAuth,
    requireRole,
    requireLineOwnership
};
