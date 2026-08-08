-- =========================================
-- Script de Migración 07: Cierre de turno -> HistoricoOEE real
-- HistoricoOEE.OrdenProduccionId apunta a una orden *planificada*, pero en
-- este entorno las órdenes sembradas son de fechas pasadas -casi nunca va a
-- haber match para "hoy"-. Se agregan columnas denormalizadas para que el
-- cierre de turno no dependa de encontrar una orden planificada coincidente.
-- =========================================
USE SmartAssignDB;
GO

IF COL_LENGTH('HistoricoOEE', 'Linea') IS NULL
BEGIN
    ALTER TABLE HistoricoOEE ADD Linea NVARCHAR(50) NULL;
END
GO

IF COL_LENGTH('HistoricoOEE', 'Sku') IS NULL
BEGIN
    ALTER TABLE HistoricoOEE ADD Sku NVARCHAR(100) NULL;
END
GO

IF COL_LENGTH('HistoricoOEE', 'Supervisor') IS NULL
BEGIN
    ALTER TABLE HistoricoOEE ADD Supervisor NVARCHAR(150) NULL;
END
GO
