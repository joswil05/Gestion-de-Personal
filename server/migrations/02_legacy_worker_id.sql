-- =========================================
-- Script de Migración 02: LegacyWorkerId (trazabilidad Firebase → SQL Server)
-- =========================================
-- Estas columnas ya existen en la base real porque migrate_supervisors.js,
-- migrate_coordinators.js y migrate_operarios_fase1.js las crean en caliente
-- (ALTER TABLE inline) al ejecutarse. Este script solo documenta y deja
-- reproducible ese estado en el esquema versionado del repositorio.
USE SmartAssignDB;
GO

IF COL_LENGTH('Usuarios', 'LegacyWorkerId') IS NULL
BEGIN
    ALTER TABLE Usuarios ADD LegacyWorkerId NVARCHAR(50) NULL;
END
GO

IF COL_LENGTH('Operarios', 'LegacyWorkerId') IS NULL
BEGIN
    ALTER TABLE Operarios ADD LegacyWorkerId NVARCHAR(50) NULL;
END
GO
