// Mock de Datos de la Planta de Producción para la Fase 1
// Este archivo contiene los datos de prueba iniciales para las 10 líneas de producción y 25 trabajadores

export const LINEAS_MOCK = [
  { idLinea: "L4", nombre: "Línea 4", prioridad: 1, estado: "Operando", skuActual: "SKU-PREMIUM-04", reqPersonalMinimo: 4, puestoFijoAsignado: true },
  { idLinea: "L1", nombre: "Línea 1", prioridad: 2, estado: "Operando", skuActual: "SKU-BEBIDA-01", reqPersonalMinimo: 4, puestoFijoAsignado: true },
  { idLinea: "L2", nombre: "Línea 2", prioridad: 3, estado: "Operando", skuActual: "SKU-JUGOS-02", reqPersonalMinimo: 3, puestoFijoAsignado: true },
  { idLinea: "L6", nombre: "Línea 6", prioridad: 4, estado: "Operando", skuActual: "SKU-PET-06", reqPersonalMinimo: 3, puestoFijoAsignado: true },
  { idLinea: "L7", nombre: "Línea 7", prioridad: 5, estado: "Operando", skuActual: "SKU-LATAS-07", reqPersonalMinimo: 3, puestoFijoAsignado: true },
  { idLinea: "L5", nombre: "Línea 5", prioridad: 6, estado: "Operando", skuActual: "SKU-AGUA-05", reqPersonalMinimo: 3, puestoFijoAsignado: true },
  { idLinea: "L3", nombre: "Línea 3", prioridad: 7, estado: "Operando", skuActual: "SKU-BEBIDA-03", reqPersonalMinimo: 3, puestoFijoAsignado: true },
  { idLinea: "L8", nombre: "Línea 8 (Bolsón)", prioridad: 8, estado: "Operando", skuActual: "SKU-ENSAMBLE-MANUAL", reqPersonalMinimo: 2, puestoFijoAsignado: true },
  { idLinea: "L9", nombre: "Línea 9", prioridad: 9, estado: "Operando", skuActual: "SKU-CARTON-09", reqPersonalMinimo: 2, puestoFijoAsignado: true },
  { idLinea: "L10", nombre: "Línea 10", prioridad: 10, estado: "Operando", skuActual: "SKU-SACOS-10", reqPersonalMinimo: 2, puestoFijoAsignado: true }
];

export const TRABAJADORES_MOCK = [
  // --- COORDINADORES (2) ---
  {
    idWorker: "W01",
    nombre: "Ing. Marcos Rivas",
    rol: "Coordinador",
    sexo: "M",
    restriccionesMedicas: [],
    ultimaActividadAyer: "Supervisión General",
    estadoActual: "ASIGNADO",
    lineaActualId: "PLANTA",
    puestoActualId: "COORDINADOR_1"
  },
  {
    idWorker: "W02",
    nombre: "Ing. Valeria Soria",
    rol: "Coordinador",
    sexo: "F",
    restriccionesMedicas: [],
    ultimaActividadAyer: "Supervisión General",
    estadoActual: "ASIGNADO",
    lineaActualId: "PLANTA",
    puestoActualId: "COORDINADOR_2"
  },

  // --- SUPERVISORES (10, uno para cada línea) ---
  { idWorker: "S01", nombre: "Oscar Peralta", rol: "Supervisor", sexo: "M", restriccionesMedicas: [], ultimaActividadAyer: "Supervisión L1", estadoActual: "ASIGNADO", lineaActualId: "L1", puestoActualId: "SUPERVISOR" },
  { idWorker: "S02", nombre: "Guillermo Nova", rol: "Supervisor", sexo: "M", restriccionesMedicas: [], ultimaActividadAyer: "Supervisión L2", estadoActual: "ASIGNADO", lineaActualId: "L2", puestoActualId: "SUPERVISOR" },
  { idWorker: "S03", nombre: "Diana Restrepo", rol: "Supervisor", sexo: "F", restriccionesMedicas: [], ultimaActividadAyer: "Supervisión L3", estadoActual: "ASIGNADO", lineaActualId: "L3", puestoActualId: "SUPERVISOR" },
  { idWorker: "S04", nombre: "Carlos Méndez", rol: "Supervisor", sexo: "M", restriccionesMedicas: [], ultimaActividadAyer: "Supervisión L4", estadoActual: "ASIGNADO", lineaActualId: "L4", puestoActualId: "SUPERVISOR" },
  { idWorker: "S05", nombre: "Héctor Castro", rol: "Supervisor", sexo: "M", restriccionesMedicas: [], ultimaActividadAyer: "Supervisión L5", estadoActual: "ASIGNADO", lineaActualId: "L5", puestoActualId: "SUPERVISOR" },
  { idWorker: "S06", nombre: "Patricia Medina", rol: "Supervisor", sexo: "F", restriccionesMedicas: [], ultimaActividadAyer: "Supervisión L6", estadoActual: "ASIGNADO", lineaActualId: "L6", puestoActualId: "SUPERVISOR" },
  { idWorker: "S07", nombre: "Raúl Ibáñez", rol: "Supervisor", sexo: "M", restriccionesMedicas: [], ultimaActividadAyer: "Supervisión L7", estadoActual: "ASIGNADO", lineaActualId: "L7", puestoActualId: "SUPERVISOR" },
  { idWorker: "S08", nombre: "Lucía Fernández", rol: "Supervisor", sexo: "F", restriccionesMedicas: [], ultimaActividadAyer: "Supervisión L8", estadoActual: "ASIGNADO", lineaActualId: "L8", puestoActualId: "SUPERVISOR" },
  { idWorker: "S09", nombre: "Francisco Sosa", rol: "Supervisor", sexo: "M", restriccionesMedicas: [], ultimaActividadAyer: "Supervisión L9", estadoActual: "ASIGNADO", lineaActualId: "L9", puestoActualId: "SUPERVISOR" },
  { idWorker: "S10", nombre: "Gabriela Muñoz", rol: "Supervisor", sexo: "F", restriccionesMedicas: [], ultimaActividadAyer: "Supervisión L10", estadoActual: "ASIGNADO", lineaActualId: "L10", puestoActualId: "SUPERVISOR" },

  // --- OPERADORES A (Puestos Fijos Técnicos) (5) ---
  {
    idWorker: "W03",
    nombre: "Juan Pérez",
    rol: "Operador A",
    sexo: "M",
    restriccionesMedicas: [],
    ultimaActividadAyer: "Operación de Calandra L4",
    estadoActual: "INACTIVO" // Simula que aún no marca huella
  },
  {
    idWorker: "W04",
    nombre: "Ana Gómez",
    rol: "Operador A",
    sexo: "F",
    restriccionesMedicas: [],
    ultimaActividadAyer: "Control Extrusora L1",
    estadoActual: "POOL_ARRANQUE" // En sala de espera
  },
  {
    idWorker: "W05",
    nombre: "Roberto Silva",
    rol: "Operador A",
    sexo: "M",
    restriccionesMedicas: [],
    ultimaActividadAyer: "Soplado Automático L2",
    estadoActual: "POOL_ARRANQUE"
  },
  {
    idWorker: "W06",
    nombre: "Elena Vázquez",
    rol: "Operador A",
    sexo: "F",
    restriccionesMedicas: [],
    ultimaActividadAyer: "Panel Central L6",
    estadoActual: "BAJA_TEMPORAL" // En consulta médica
  },
  {
    idWorker: "W07",
    nombre: "Javier Sánchez",
    rol: "Operador A",
    sexo: "M",
    restriccionesMedicas: [],
    ultimaActividadAyer: "Dosificadora L7",
    estadoActual: "POOL_ARRANQUE"
  },

  // --- AVERIEROS (Puestos Fijos de Soporte) (4) ---
  {
    idWorker: "W08",
    nombre: "Carlos López",
    rol: "Averiero",
    sexo: "M",
    restriccionesMedicas: [],
    ultimaActividadAyer: "Resolución Fallas Mecánicas L4",
    estadoActual: "POOL_ARRANQUE"
  },
  {
    idWorker: "W09",
    nombre: "María Rodríguez",
    rol: "Averiero",
    sexo: "F",
    restriccionesMedicas: ["Esfuerzo Lumbar"], // Constancia médica
    ultimaActividadAyer: "Diagnóstico Eléctrico L1",
    estadoActual: "POOL_ARRANQUE"
  },
  {
    idWorker: "W10",
    nombre: "Miguel Ángel",
    rol: "Averiero",
    sexo: "M",
    restriccionesMedicas: [],
    ultimaActividadAyer: "Ajuste de Neumática L2",
    estadoActual: "POOL_ARRANQUE"
  },
  {
    idWorker: "W11",
    nombre: "Laura Torres",
    rol: "Averiero",
    sexo: "F",
    restriccionesMedicas: [],
    ultimaActividadAyer: "Ajuste Sensor Óptico L6",
    estadoActual: "BAJA_TEMPORAL" // Permiso de Coordinador
  },

  // --- OPERADORES C EN ENTRENAMIENTO (Fijos Congelados) (3) ---
  {
    idWorker: "W12",
    nombre: "Pedro Martínez",
    rol: "Operador C (En entrenamiento)",
    sexo: "M",
    restriccionesMedicas: ["Trabajo en Alturas"],
    ultimaActividadAyer: "Apoyo Soplado L4",
    estadoActual: "POOL_ARRANQUE"
  },
  {
    idWorker: "W13",
    nombre: "Sofía Hernández",
    rol: "Operador C (En entrenamiento)",
    sexo: "F",
    restriccionesMedicas: [],
    ultimaActividadAyer: "Apoyo Extrusora L1",
    estadoActual: "POOL_ARRANQUE"
  },
  {
    idWorker: "W14",
    nombre: "Diego Ruiz",
    rol: "Operador C (En entrenamiento)",
    sexo: "M",
    restriccionesMedicas: [],
    ultimaActividadAyer: "Apoyo Empaque L2",
    estadoActual: "POOL_ARRANQUE"
  },

  // --- OPERADORES B (Puestos Varios Calificados) (5) ---
  {
    idWorker: "W15",
    nombre: "Luis Díaz",
    rol: "Operador B",
    sexo: "M",
    restriccionesMedicas: ["Lumbalgia"],
    ultimaActividadAyer: "Giro de Botellas L4", // No repetición hoy en Giro de Botellas
    estadoActual: "POOL_ARRANQUE"
  },
  {
    idWorker: "W16",
    nombre: "Carmen Morales",
    rol: "Operador B",
    sexo: "F",
    restriccionesMedicas: ["Túnel Carpiano"], // No tareas de empaque repetitivo
    ultimaActividadAyer: "Alimentación de Tolva L1",
    estadoActual: "POOL_ARRANQUE"
  },
  {
    idWorker: "W17",
    nombre: "Manuel Castro",
    rol: "Operador B",
    sexo: "M",
    restriccionesMedicas: [],
    ultimaActividadAyer: "Etiquetado Manual L2",
    estadoActual: "POOL_ARRANQUE"
  },
  {
    idWorker: "W18",
    nombre: "Isabel Romero",
    rol: "Operador B",
    sexo: "F",
    restriccionesMedicas: [],
    ultimaActividadAyer: "Enjuague L6",
    estadoActual: "POOL_ARRANQUE"
  },
  {
    idWorker: "W19",
    nombre: "Alejandro Gómez",
    rol: "Operador B",
    sexo: "M",
    restriccionesMedicas: [],
    ultimaActividadAyer: "Paletizado Manual L7",
    estadoActual: "POOL_ARRANQUE"
  },

  // --- OPERADORES C ENTRENADOS (Puestos Varios) (3) ---
  {
    idWorker: "W20",
    nombre: "Beatriz Ortiz",
    rol: "Operador C (Entrenado)",
    sexo: "F",
    restriccionesMedicas: [],
    ultimaActividadAyer: "Sellado de Cajas L4",
    estadoActual: "POOL_ARRANQUE"
  },
  {
    idWorker: "W21",
    nombre: "Ricardo Méndez",
    rol: "Operador C (Entrenado)",
    sexo: "M",
    restriccionesMedicas: [],
    ultimaActividadAyer: "Dosificado Manual L1",
    estadoActual: "POOL_ARRANQUE"
  },
  {
    idWorker: "W22",
    nombre: "Lucía Vargas",
    rol: "Operador C (Entrenado)",
    sexo: "F",
    restriccionesMedicas: [],
    ultimaActividadAyer: "Limpieza de Boquillas L2",
    estadoActual: "POOL_ARRANQUE"
  },

  // --- OPERARIOS (Puestos Varios Generales / Bolsón) (8) ---
  {
    idWorker: "W23",
    nombre: "Patricia Flores",
    rol: "Operario",
    sexo: "F",
    restriccionesMedicas: ["Embarazo"], // Restricciones de Carga Pesada y Bipedestación Prolongada
    ultimaActividadAyer: "Ensamble Manual L8",
    estadoActual: "POOL_ARRANQUE"
  },
  {
    idWorker: "W24",
    nombre: "Roberto Carlos",
    rol: "Operario",
    sexo: "M",
    restriccionesMedicas: [],
    ultimaActividadAyer: "Carga de Pallets L8",
    estadoActual: "POOL_ARRANQUE"
  },
  {
    idWorker: "W25",
    nombre: "Elena Torres",
    rol: "Operario",
    sexo: "F",
    restriccionesMedicas: [],
    ultimaActividadAyer: "Ensamble Manual L8",
    estadoActual: "POOL_ARRANQUE"
  },
  {
    idWorker: "W26",
    nombre: "Santiago Soler",
    rol: "Operario",
    sexo: "M",
    restriccionesMedicas: ["Asma Ocupacional"], // Evitar zonas de polvo/vapores
    ultimaActividadAyer: "Ensamble Manual L8",
    estadoActual: "POOL_ARRANQUE"
  },
  {
    idWorker: "W27",
    nombre: "Estela Ríos",
    rol: "Operario",
    sexo: "F",
    restriccionesMedicas: [],
    ultimaActividadAyer: "Inspección de Tapas L8",
    estadoActual: "POOL_ARRANQUE"
  },
  {
    idWorker: "W28",
    nombre: "Mariano Rajoy",
    rol: "Operario",
    sexo: "M",
    restriccionesMedicas: [],
    ultimaActividadAyer: "Ensamble Bolsón L8",
    estadoActual: "POOL_ARRANQUE"
  },
  {
    idWorker: "W29",
    nombre: "Sofía Vergara",
    rol: "Operario",
    sexo: "F",
    restriccionesMedicas: [],
    ultimaActividadAyer: "Ensamble Bolsón L8",
    estadoActual: "POOL_ARRANQUE"
  },
  {
    idWorker: "W30",
    nombre: "Lionel Messi",
    rol: "Operario",
    sexo: "M",
    restriccionesMedicas: [],
    ultimaActividadAyer: "Ensamble Bolsón L8",
    estadoActual: "POOL_ARRANQUE"
  }
];

// Definición de Puestos de cada línea
// Fijos: Operador A, Averiero, Operador C en Entrenamiento
// Varios: Operador B, Operador C Entrenado, Operario
export const PUESTOS_PLANTILLA = {
  // Puestos fijos técnicos de la planta
  fijos: [
    { tipoPuesto: "OPERADOR_A", nombreTarea: "Operación Principal de Línea", rolRequerido: "Operador A" },
    { tipoPuesto: "AVERIERO", nombreTarea: "Mantenimiento Técnico / Averías", rolRequerido: "Averiero" },
    { tipoPuesto: "OPERADOR_C_ENTRENAMIENTO", nombreTarea: "Operación Técnica Supervisada", rolRequerido: "Operador C (En entrenamiento)" }
  ],
  // Puestos varios por línea
  varios: {
    L4: [
      { idPuesto: "L4_V1", nombreTarea: "Giro de Botellas L4", sexoRequerido: "Indiferente", restriccionesProhibidas: ["Lumbalgia"] },
      { idPuesto: "L4_V2", nombreTarea: "Carga Pesada L4", sexoRequerido: "M", restriccionesProhibidas: ["Lumbalgia", "Hernia"] },
      { idPuesto: "L4_V3", nombreTarea: "Sellado de Cajas L4", sexoRequerido: "Indiferente", restriccionesProhibidas: ["Túnel Carpiano"] }
    ],
    L1: [
      { idPuesto: "L1_V1", nombreTarea: "Alimentación de Tolva L1", sexoRequerido: "M", restriccionesProhibidas: ["Lumbalgia"] },
      { idPuesto: "L1_V2", nombreTarea: "Dosificado Manual L1", sexoRequerido: "Indiferente", restriccionesProhibidas: [] },
      { idPuesto: "L1_V3", nombreTarea: "Inspección de Tapas L1", sexoRequerido: "F", restriccionesProhibidas: [] }
    ],
    L2: [
      { idPuesto: "L2_V1", nombreTarea: "Etiquetado Manual L2", sexoRequerido: "Indiferente", restriccionesProhibidas: ["Túnel Carpiano"] },
      { idPuesto: "L2_V2", nombreTarea: "Limpieza de Boquillas L2", sexoRequerido: "Indiferente", restriccionesProhibidas: ["Asma Ocupacional"] },
      { idPuesto: "L2_V3", nombreTarea: "Estibado de Cajas L2", sexoRequerido: "M", restriccionesProhibidas: ["Lumbalgia"] }
    ],
    L6: [
      { idPuesto: "L6_V1", nombreTarea: "Enjuague de Botellas L6", sexoRequerido: "Indiferente", restriccionesProhibidas: [] },
      { idPuesto: "L6_V2", nombreTarea: "Envasado L6", sexoRequerido: "Indiferente", restriccionesProhibidas: [] },
      { idPuesto: "L6_V3", nombreTarea: "Paletizado L6", sexoRequerido: "M", restriccionesProhibidas: ["Lumbalgia"] }
    ],
    L7: [
      { idPuesto: "L7_V1", nombreTarea: "Paletizado Manual L7", sexoRequerido: "M", restriccionesProhibidas: ["Lumbalgia", "Hernia"] },
      { idPuesto: "L7_V2", nombreTarea: "Inspección de Latas L7", sexoRequerido: "F", restriccionesProhibidas: [] }
    ],
    L5: [
      { idPuesto: "L5_V1", nombreTarea: "Alimentación de Preformas L5", sexoRequerido: "Indiferente", restriccionesProhibidas: [] },
      { idPuesto: "L5_V2", nombreTarea: "Carga de Tapas L5", sexoRequerido: "M", restriccionesProhibidas: ["Lumbalgia"] }
    ],
    L3: [
      { idPuesto: "L3_V1", nombreTarea: "Limpieza L3", sexoRequerido: "Indiferente", restriccionesProhibidas: [] },
      { idPuesto: "L3_V2", nombreTarea: "Inspección Visual L3", sexoRequerido: "Indiferente", restriccionesProhibidas: [] }
    ],
    L8: [ // Línea Bolsón de ensamble manual - Fuente de rotación
      { idPuesto: "L8_V1", nombreTarea: "Ensamble Bolsón A", sexoRequerido: "Indiferente", restriccionesProhibidas: [] },
      { idPuesto: "L8_V2", nombreTarea: "Ensamble Bolsón B", sexoRequerido: "Indiferente", restriccionesProhibidas: [] },
      { idPuesto: "L8_V3", nombreTarea: "Ensamble Bolsón C", sexoRequerido: "Indiferente", restriccionesProhibidas: [] },
      { idPuesto: "L8_V4", nombreTarea: "Ensamble Bolsón D", sexoRequerido: "Indiferente", restriccionesProhibidas: [] },
      { idPuesto: "L8_V5", nombreTarea: "Carga Bolsón E", sexoRequerido: "M", restriccionesProhibidas: ["Lumbalgia"] }
    ],
    L9: [
      { idPuesto: "L9_V1", nombreTarea: "Armado de Cajas L9", sexoRequerido: "Indiferente", restriccionesProhibidas: [] },
      { idPuesto: "L9_V2", nombreTarea: "Grupaje L9", sexoRequerido: "Indiferente", restriccionesProhibidas: [] }
    ],
    L10: [
      { idPuesto: "L10_V1", nombreTarea: "Llenado de Sacos L10", sexoRequerido: "M", restriccionesProhibidas: ["Lumbalgia", "Hernia"] },
      { idPuesto: "L10_V2", nombreTarea: "Cerrado de Sacos L10", sexoRequerido: "Indiferente", restriccionesProhibidas: ["Túnel Carpiano"] }
    ]
  }
};
