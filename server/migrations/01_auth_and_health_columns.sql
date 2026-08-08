-- =========================================
-- Script de Migración 01: Auth & Health Columns
-- =========================================
USE SmartAssignDB;
GO

-- =========================================================================
-- ADVERTENCIA CRÍTICA:
-- El campo PasswordHash configurado por defecto a un hash '123456' es
-- ESTRICTAMENTE PARA ENTORNO DE PRUEBAS. 
-- En producción, los usuarios deben tener passwords seguros y el flag 
-- MustChangePassword obligará al cambio en el primer inicio de sesión.
-- =========================================================================

-- 1. Tabla Usuarios (Autenticación)
IF COL_LENGTH('Usuarios', 'Username') IS NULL
BEGIN
    ALTER TABLE Usuarios ADD Username NVARCHAR(100) NULL;
END
GO

IF COL_LENGTH('Usuarios', 'PasswordHash') IS NULL
BEGIN
    -- Hash bcrypt con cost=12 del texto '123456'
    ALTER TABLE Usuarios ADD PasswordHash NVARCHAR(255) NULL;
END
GO

IF COL_LENGTH('Usuarios', 'MustChangePassword') IS NULL
BEGIN
    ALTER TABLE Usuarios ADD MustChangePassword BIT DEFAULT 1 NOT NULL;
END
GO

-- Actualizar usuarios existentes (Mock para pruebas)
UPDATE Usuarios SET 
    Username = REPLACE(LOWER(Nombre), ' ', '.'), 
    PasswordHash = '$2b$12$fXd8HzCm1lsoS3RXyP.bQe1XxUsm/jYcjXoEGtfarlcGrdgbwiDB.' 
WHERE Username IS NULL;
GO

-- Agregar el constraint UNIQUE después de poblar los datos
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'UQ_Username')
BEGIN
    ALTER TABLE Usuarios ADD CONSTRAINT UQ_Username UNIQUE (Username);
END
GO

-- 2. Tabla Operarios (Filtros de Salud)
IF COL_LENGTH('Operarios', 'MedicalRestrictions') IS NULL
BEGIN
    ALTER TABLE Operarios ADD MedicalRestrictions NVARCHAR(MAX) NULL;
END
GO

IF COL_LENGTH('Operarios', 'LastActivity') IS NULL
BEGIN
    ALTER TABLE Operarios ADD LastActivity NVARCHAR(255) NULL;
END
GO

IF COL_LENGTH('Operarios', 'Sexo') IS NULL
BEGIN
    ALTER TABLE Operarios ADD Sexo NVARCHAR(50) NULL;
END
GO

-- 3. Tabla Puestos (Requisitos Ergonómicos)
IF COL_LENGTH('Puestos', 'RequiredCapabilities') IS NULL
BEGIN
    ALTER TABLE Puestos ADD RequiredCapabilities NVARCHAR(MAX) NULL;
END
GO

IF COL_LENGTH('Puestos', 'ActivityName') IS NULL
BEGIN
    ALTER TABLE Puestos ADD ActivityName NVARCHAR(255) NULL;
END
GO

IF COL_LENGTH('Puestos', 'SexoPreferente') IS NULL
BEGIN
    ALTER TABLE Puestos ADD SexoPreferente NVARCHAR(50) NULL;
END
GO
