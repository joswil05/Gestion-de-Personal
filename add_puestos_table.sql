USE SmartAssignDB;
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Puestos')
BEGIN
    CREATE TABLE Puestos (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        LineId NVARCHAR(100) NOT NULL,
        NombrePuesto NVARCHAR(150) NOT NULL,
        OperarioAsignadoId INT NULL FOREIGN KEY REFERENCES Operarios(Id),
        Estado NVARCHAR(50) DEFAULT 'disponible',
        NivelFatiga INT DEFAULT 0
    );
    PRINT 'Tabla Puestos creada correctamente.';
END
ELSE
BEGIN
    PRINT 'La tabla Puestos ya existe.';
END
GO
