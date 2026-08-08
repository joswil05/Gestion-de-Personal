-- =========================================
-- Script de Migración: SmartAssignDB
-- De Firebase (NoSQL) a SQL Server (Relacional)
-- =========================================

-- 1. Crear la base de datos si no existe
IF NOT EXISTS (SELECT * FROM sys.databases WHERE name = 'SmartAssignDB')
BEGIN
    CREATE DATABASE SmartAssignDB;
END
GO

USE SmartAssignDB;
GO

-- 2. Crear las Tablas (Esquema Relacional)

-- Usuarios (Mock temporal para manejar roles)
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Usuarios' and xtype='U')
BEGIN
    CREATE TABLE Usuarios (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        Nombre NVARCHAR(100) NOT NULL,
        Rol NVARCHAR(50) NOT NULL CHECK (Rol IN ('Coordinador', 'Supervisor', 'Admin')),
        -- La autenticación real (passwords) la manejará TI después.
        CreatedAt DATETIME DEFAULT GETDATE()
    );
END

-- Supervisores (Extensión de Usuarios)
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Supervisores' and xtype='U')
BEGIN
    CREATE TABLE Supervisores (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        UsuarioId INT FOREIGN KEY REFERENCES Usuarios(Id),
        LineaAsignadaActual NVARCHAR(50),
        TurnoActual NVARCHAR(50)
    );
END

-- Operarios (Ficha técnica del personal de planta)
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Operarios' and xtype='U')
BEGIN
    CREATE TABLE Operarios (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        NombreCompleto NVARCHAR(150) NOT NULL,
        NumeroNomina NVARCHAR(50) UNIQUE NOT NULL,
        TurnoBase NVARCHAR(50) NOT NULL,
        PuestoBase NVARCHAR(100),
        EstadoActual NVARCHAR(50) DEFAULT 'Activo'
    );
END

-- OrdenesProduccion (Carga de metas del Excel)
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='OrdenesProduccion' and xtype='U')
BEGIN
    CREATE TABLE OrdenesProduccion (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        SKU NVARCHAR(100) NOT NULL,
        Descripcion NVARCHAR(255),
        MetaCajas INT NOT NULL,
        MetaBotellas INT NOT NULL,
        FechaPlaneada DATE NOT NULL,
        Linea NVARCHAR(50) NOT NULL,
        Estado NVARCHAR(50) DEFAULT 'Pendiente'
    );
END

-- LineasAsignacion (Asignación diaria de operarios a puestos/líneas)
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='LineasAsignacion' and xtype='U')
BEGIN
    CREATE TABLE LineasAsignacion (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        Fecha DATE NOT NULL,
        Turno NVARCHAR(50) NOT NULL,
        Linea NVARCHAR(50) NOT NULL,
        OperarioId INT FOREIGN KEY REFERENCES Operarios(Id),
        SupervisorId INT FOREIGN KEY REFERENCES Supervisores(Id),
        PuestoAsignado NVARCHAR(100) NOT NULL,
        -- Permite saber si el operario fue prestado de otra línea (común en ausencias)
        EsReasignacion BIT DEFAULT 0
    );
END

-- Ausencias (Historial de inasistencias)
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Ausencias' and xtype='U')
BEGIN
    CREATE TABLE Ausencias (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        OperarioId INT FOREIGN KEY REFERENCES Operarios(Id),
        Fecha DATE NOT NULL,
        TipoAusencia NVARCHAR(50) NOT NULL, -- Ej: Falta, Incapacidad, Vacaciones
        Justificada BIT DEFAULT 0,
        RegistradoPorId INT FOREIGN KEY REFERENCES Usuarios(Id),
        Comentarios NVARCHAR(MAX)
    );
END

-- HistoricoOEE (Métricas de planta consolidadas)
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='HistoricoOEE' and xtype='U')
BEGIN
    CREATE TABLE HistoricoOEE (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        OrdenProduccionId INT FOREIGN KEY REFERENCES OrdenesProduccion(Id),
        Fecha DATE NOT NULL,
        Turno NVARCHAR(50) NOT NULL,
        Disponibilidad DECIMAL(5,2),
        Rendimiento DECIMAL(5,2),
        Calidad DECIMAL(5,2),
        OEE_Global DECIMAL(5,2),
        Mermas INT DEFAULT 0,
        TiempoParoMinutos INT DEFAULT 0,
        RegistradoEn DATETIME DEFAULT GETDATE()
    );
END
GO

-- 3. Insertar datos semilla (Mock) para pruebas
IF NOT EXISTS (SELECT * FROM Usuarios)
BEGIN
    INSERT INTO Usuarios (Nombre, Rol) VALUES 
    ('Admin Sistema', 'Admin'),
    ('Coordinador General', 'Coordinador'),
    ('Supervisor Linea A', 'Supervisor'),
    ('Supervisor Linea B', 'Supervisor');
END

IF NOT EXISTS (SELECT * FROM Supervisores)
BEGIN
    INSERT INTO Supervisores (UsuarioId, LineaAsignadaActual, TurnoActual) VALUES
    ((SELECT Id FROM Usuarios WHERE Nombre = 'Supervisor Linea A'), 'L1', 'Matutino'),
    ((SELECT Id FROM Usuarios WHERE Nombre = 'Supervisor Linea B'), 'L2', 'Matutino');
END

IF NOT EXISTS (SELECT * FROM Operarios)
BEGIN
    INSERT INTO Operarios (NombreCompleto, NumeroNomina, TurnoBase, PuestoBase) VALUES 
    ('Juan Pérez', 'NOM-001', 'Matutino', 'Operador de Llenadora'),
    ('María Gómez', 'NOM-002', 'Vespertino', 'Empacadora');
END
GO
