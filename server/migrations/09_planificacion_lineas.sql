-- =========================================
-- Script de Migración 09: Planificación T+1 real
-- Reemplaza el doc "config/next_day_plan" (Firestore huérfano, nunca
-- funcional tras la migración a SQL Server: coordinatorApi.js exporta
-- db={} y el endpoint que el frontend llamaba, /api/turno/programar-
-- siguiente, nunca existió) por una tabla real: una fila por (Fecha, Línea)
-- con el SKU planificado (vinculado a una orden real cuando existe) y el
-- supervisor asignado para ese turno. Se activa sola al llegar la fecha
-- (ver ensureTodayPlanApplied en server.js) reutilizando la misma lógica
-- transaccional de Motor 1.
-- =========================================
USE SmartAssignDB;
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'PlanificacionLineas')
BEGIN
    CREATE TABLE PlanificacionLineas (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        Fecha DATE NOT NULL,
        LineId NVARCHAR(50) NOT NULL FOREIGN KEY REFERENCES Lineas(LineId),
        Sku NVARCHAR(100) NULL,                 -- NULL = línea inactiva ese día
        OrdenProduccionId INT NULL FOREIGN KEY REFERENCES OrdenesProduccion(Id),
        SupervisorUsuarioId INT NULL FOREIGN KEY REFERENCES Usuarios(Id),
        Status NVARCHAR(20) NOT NULL DEFAULT 'BORRADOR',   -- BORRADOR | CONFIRMADO
        AplicadoEn DATETIME2 NULL,              -- se llena cuando se activa de verdad
        CreatedBy INT NULL FOREIGN KEY REFERENCES Usuarios(Id),
        UpdatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_PlanificacionLineas_Fecha_Linea UNIQUE (Fecha, LineId)
    );
    PRINT 'Tabla PlanificacionLineas creada correctamente.';
END
GO
