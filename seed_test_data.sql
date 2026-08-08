USE SmartAssignDB;
GO

-- Limpiar tablas para tener un estado conocido
DELETE FROM Puestos;
DELETE FROM LineasAsignacion;
DELETE FROM Operarios;

-- Crear Operarios de prueba
INSERT INTO Operarios (NombreCompleto, NumeroNomina, TurnoBase) VALUES 
('Operario Alfa', 'EMP-001', 'Matutino'), 
('Operario Beta', 'EMP-002', 'Matutino'), 
('Operario Gamma', 'EMP-003', 'Matutino'), 
('Relevista Delta', 'EMP-004', 'Matutino');

-- Crear Puestos de prueba para L1
INSERT INTO Puestos (LineId, NombrePuesto, OperarioAsignadoId, Estado, NivelFatiga)
VALUES 
('L1', 'Ensamblaje A', (SELECT Id FROM Operarios WHERE NombreCompleto = 'Operario Alfa'), 'ocupado', 0),
('L1', 'Ensamblaje B', NULL, 'disponible', 0),
('L1', 'Empaque', (SELECT Id FROM Operarios WHERE NombreCompleto = 'Operario Beta'), 'ocupado', 20),
('L2', 'Slot L2 Test', NULL, 'disponible', 0);

PRINT 'Datos de prueba insertados con éxito.';
GO
