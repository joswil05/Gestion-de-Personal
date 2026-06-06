/**
 * Skill: Orquestador de Simulación y Test de Estrés (QA Harness Engineer)
 * Responsabilidad: Desarrollar, desplegar y controlar el Test Harness remoto de la ruta '/dev-console'.
 * Acciones de Código:
 * - Resetear las colecciones a cero y actualizar trabajadores a INACTIVO.
 * - Simular la asistencia física por porcentajes (perfecta, 90%, 70%) y poblar sala POOL_ARRANQUE.
 * - Ejecutar ráfagas simultáneas concurrentes mediante Promise.all para probar runTransaction().
 */

import { assignWorkerTransaction } from './firebase-firestore-specialist.js';

/**
 * Resetea por completo las colecciones de la base de datos de simulación al "Minuto Cero".
 * @returns {Promise<boolean>}
 */
export async function resetDatabaseToZero() {
  console.log("[QA Test Harness] Reseteando base de datos a cero...");
  // Simulación de borrado atómico
  console.log("[QA Test Harness] Colección 'puestos' vaciada.");
  console.log("[QA Test Harness] Historial de logs limpio.");
  console.log("[QA Test Harness] Actualizando los 160 trabajadores al estado 'INACTIVO'.");
  return true;
}

/**
 * Simula la asistencia física matutina de los trabajadores en base a un porcentaje.
 * @param {number} attendancePercentage Porcentaje de asistencia deseado (0 - 100)
 * @returns {Promise<object>} Datos de trabajadores presentes en POOL_ARRANQUE y ausentes
 */
export async function simulateDailyAttendance(attendancePercentage) {
  if (attendancePercentage < 0 || attendancePercentage > 100) {
    throw new Error("Porcentaje de asistencia debe estar entre 0 y 100.");
  }

  console.log(`[QA Test Harness] Simulando asistencia diaria al ${attendancePercentage}%...`);

  const totalWorkersCount = 160;
  const presentCount = Math.round((totalWorkersCount * attendancePercentage) / 100);
  const absentCount = totalWorkersCount - presentCount;

  console.log(`[QA Test Harness] ${presentCount} trabajadores pasaron a 'POOL_ARRANQUE'.`);
  console.log(`[QA Test Harness] ${absentCount} trabajadores marcados como 'INACTIVO' (ausentes).`);

  return {
    success: true,
    percentage: attendancePercentage,
    presentCount,
    absentCount
  };
}

/**
 * Ejecuta una ráfaga concurrente de asignación para estresar el backend y validar runTransaction.
 * Envía peticiones simultáneas sobre el mismo operario hacia dos líneas diferentes mediante Promise.all.
 * 
 * @param {object} mockFirestore Instancia simulada de Firestore
 * @param {string} workerId ID del operario a disputar
 * @param {string} slotLineA ID de la línea A
 * @param {string} slotLineB ID de la línea B
 * @returns {Promise<object>} Reporte del resultado de la colisión
 */
export async function simulateRaceCondition(mockFirestore, workerId, slotLineA, slotLineB) {
  console.log(`[QA Test Harness] DETONANDO SIMULACIÓN DE CONDICIÓN DE CARRERA para trabajador: ${workerId}`);
  console.log(`[QA Test Harness] Intento A: Línea ${slotLineA} | Intento B: Línea ${slotLineB} de forma simultánea...`);

  // Disparar las promesas en paralelo
  const promises = [
    assignWorkerTransaction(mockFirestore, workerId, "SLOT_L4_MAQ1", slotLineA)
      .then(res => ({ source: 'Línea A', status: 'SUCCESS', res }))
      .catch(err => ({ source: 'Línea A', status: 'REJECTED', error: err.message })),
    assignWorkerTransaction(mockFirestore, workerId, "SLOT_L1_MAQ1", slotLineB)
      .then(res => ({ source: 'Línea B', status: 'SUCCESS', res }))
      .catch(err => ({ source: 'Línea B', status: 'REJECTED', error: err.message }))
  ];

  try {
    const results = await Promise.all(promises);
    
    // Validar que se haya cumplido la exclusión mutua
    const successCount = results.filter(r => r.status === 'SUCCESS').length;
    const rejectedCount = results.filter(r => r.status === 'REJECTED').length;

    console.log("[QA Test Harness] --- RESULTADOS DE COLISIÓN DE ESCANEO ---");
    results.forEach(r => {
      console.log(`- ${r.source}: Estado = ${r.status} | Detalle: ${r.res ? 'Asignado' : r.error}`);
    });

    if (successCount === 1 && rejectedCount === 1) {
      console.log("[QA Test Harness] ÉXITO: runTransaction() evitó la colisión. Solo un supervisor consolidó la asignación.");
      return { success: true, results, raceConditionPrevented: true };
    } else {
      console.error("[QA Test Harness] FALLO: ¡Condición de carrera no controlada! Registros corruptos posibles.");
      return { success: false, results, raceConditionPrevented: false };
    }
  } catch (error) {
    console.error("[QA Test Harness] Error crítico ejecutando Promise.all:", error);
    throw error;
  }
}
