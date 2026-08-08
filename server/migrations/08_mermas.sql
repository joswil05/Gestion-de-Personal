-- =========================================
-- Script de Migración 08: Mermas reales por línea
-- El formulario de mermas de LineaSku.jsx nunca persistía nada (el mock de
-- Firestore ignoraba silenciosamente los updateDoc contra "config"). Se
-- agrega el estado del turno en curso directamente sobre Lineas -mismo
-- criterio que activeParo, que tampoco vive en una tabla propia sino que se
-- deriva de Paros- y se resetea al cerrar turno.
-- =========================================
USE SmartAssignDB;
GO

IF COL_LENGTH('Lineas', 'MermasJson') IS NULL
BEGIN
    ALTER TABLE Lineas ADD MermasJson NVARCHAR(MAX) NULL;
END
GO

IF COL_LENGTH('Lineas', 'MermaJustification') IS NULL
BEGIN
    ALTER TABLE Lineas ADD MermaJustification NVARCHAR(1000) NULL;
END
GO
