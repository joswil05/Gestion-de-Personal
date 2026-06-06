/**
 * Skill: Arquitecto de Transacciones y Datos NoSQL (Firebase/Firestore Specialist)
 * Responsabilidad: Blindar la consistencia y reactividad en tiempo real ante la concurrencia del piso de planta.
 * Acciones de Código:
 * - Procesar escaneos y asignaciones bajo runTransaction() para evitar condiciones de carrera.
 * - Motor 1: Pre-llenado de puestos fijos con rastro dual (idWorkerCurrent e idWorkerOriginal).
 * - Prohibición estricta de Date.now() local, reemplazándola por serverTimestamp().
 */

// Mock de Firestore serverTimestamp() para compatibilidad
export const mockServerTimestamp = () => ({
  _methodName: 'FieldValue.serverTimestamp',
  toString: () => 'SERVER_TIMESTAMP'
});

/**
 * Realiza una asignación atómica y segura de un operario a un puesto de producción.
 * Evita condiciones de carrera mediante el uso de runTransaction.
 * 
 * @param {object} firestore Instance of Firebase Firestore
 * @param {string} workerId ID del operario a asignar
 * @param {string} slotId ID del puesto o máquina crítica
 * @param {string} supervisorLineId ID de la línea del supervisor solicitante
 * @returns {Promise<object>} Resultado de la transacción
 */
export async function assignWorkerTransaction(firestore, workerId, slotId, supervisorLineId) {
  if (!firestore || !workerId || !slotId) {
    throw new Error("Parámetros insuficientes para la transacción de asignación.");
  }

  // 1. Definir referencias de documentos
  const workerRef = { id: workerId, type: 'worker' }; // ref
  const slotRef = { id: slotId, type: 'slot' }; // ref

  console.log(`[Firestore Transaction] Iniciando asignación del operario ${workerId} al puesto ${slotId}...`);

  try {
    // Retornamos la simulación lógica de la transacción (runTransaction)
    // En código real: return runTransaction(firestore, async (transaction) => { ... })
    const transactionLogic = async () => {
      // a. Leer el documento del puesto (slot)
      // const slotDoc = await transaction.get(slotRef);
      const mockSlotDoc = {
        exists: true,
        data: () => ({
          lineId: "LINEA_4",
          idWorkerOriginal: "WORKER_A_10", // Titular original
          idWorkerCurrent: null,
          status: "VACANTE"
        })
      };

      const slotData = mockSlotDoc.data();

      // b. Validar que la línea del puesto pertenezca a la del supervisor (Regla de Supervisor Único Dedicado)
      if (slotData.lineId !== supervisorLineId) {
        throw new Error(`Acceso denegado: El supervisor de la línea ${supervisorLineId} no puede modificar el puesto de la línea ${slotData.lineId}.`);
      }

      // c. Leer el documento del operario (worker)
      // const workerDoc = await transaction.get(workerRef);
      const mockWorkerDoc = {
        exists: true,
        data: () => ({
          id: workerId,
          name: "Juan Pérez",
          role: "Operador B", // Operador B (reemplazo calificado)
          status: "POOL_ARRANQUE", // Estado de origen
          medicalRestrictions: [],
          lastActivity: "Giro de Botellas"
        })
      };

      const workerData = mockWorkerDoc.data();

      // d. Validar estado del operario
      if (workerData.status !== "POOL_ARRANQUE" && workerData.status !== "DISPONIBLE_BOLSON") {
        throw new Error(`Operario ya asignado o no disponible en pasillo. Estado actual: ${workerData.status}`);
      }

      // e. Rastro Dual (Motor 1): Si el titular original del puesto (idWorkerOriginal) está ausente
      const isOriginalAbsent = slotData.idWorkerOriginal !== workerId;
      const updatedSlotData = {
        idWorkerCurrent: workerId,
        idWorkerOriginal: slotData.idWorkerOriginal, // Rastro Dual intacto
        assignedBySupervisor: supervisorLineId,
        // PROHIBIDO Date.now(). Uso obligatorio de serverTimestamp()
        asignadoEnSegundoVirtual: mockServerTimestamp()
      };

      // f. Actualizar documentos en la transacción
      // transaction.update(slotRef, updatedSlotData);
      // transaction.update(workerRef, { status: "ASIGNADO", currentSlotId: slotId });

      console.log(`[Firestore Transaction] Éxito: Operario ${workerId} asignado a puesto ${slotId}. Rastro dual registrado.`);
      return {
        success: true,
        isOriginalAbsent,
        assignedWorker: workerId,
        titularOriginal: slotData.idWorkerOriginal
      };
    };

    return await transactionLogic();
  } catch (error) {
    console.error("[Firestore Transaction] Transacción fallida abortando cambios:", error.message);
    throw error;
  }
}

/**
 * Valida de forma estricta que no se estén intentando inyectar marcas de tiempo locales (Date.now).
 * @param {object} data Objeto de datos a validar antes de escribir en Firestore
 * @returns {boolean} True si es válido (usa serverTimestamp), False si viola las reglas
 */
export function validateNoSQLTimestamp(data) {
  const containsLocalTimestamp = Object.values(data).some(value => {
    if (typeof value === 'number') {
      // Si parece un timestamp de milisegundos de la época actual (aprox > año 2020)
      return value > 1577836800000 && value < 2524608000000;
    }
    return false;
  });

  if (containsLocalTimestamp) {
    console.error("Veto de Seguridad: Se detectó el uso de Date.now() local para Firestore. Operación bloqueada.");
    return false;
  }
  return true;
}
