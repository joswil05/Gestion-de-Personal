-- =========================================
-- Script de Migración 06: Paros técnicos (Motor 4)
-- Una fila por evento de paro. Deja la puerta abierta a que el futuro
-- cierre de turno calcule TiempoParoMinutos real para HistoricoOEE.
-- =========================================
USE SmartAssignDB;
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Paros')
BEGIN
    CREATE TABLE Paros (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        LineId NVARCHAR(50) NOT NULL FOREIGN KEY REFERENCES Lineas(LineId),
        Categoria NVARCHAR(50) NOT NULL,
        Causa NVARCHAR(100) NOT NULL,
        Sintomas NVARCHAR(MAX) NULL,
        IniciadoEn DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        FinalizadoEn DATETIME2 NULL,
        DuracionSegundos INT NULL
    );
    PRINT 'Tabla Paros creada correctamente.';
END
GO
