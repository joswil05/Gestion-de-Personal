/**
 * Validaciones puras de Salud Ocupacional (Hallazgo #6).
 * Esta función es la fuente de verdad server-side para proteger la seguridad
 * industrial de la planta.
 */

function canWorkerOccupiedSlot(workerData, puestoData) {
    // 1. Restricción médica dura
    let requiredCaps = [];
    try {
        if (puestoData.RequiredCapabilities) {
            requiredCaps = JSON.parse(puestoData.RequiredCapabilities);
        }
    } catch (e) {
        console.error("Error parseando RequiredCapabilities:", e);
    }

    let medicalRestrictions = [];
    try {
        if (workerData.MedicalRestrictions) {
            medicalRestrictions = JSON.parse(workerData.MedicalRestrictions);
        }
    } catch (e) {
        console.error("Error parseando MedicalRestrictions:", e);
    }

    if (requiredCaps.includes('ESFUERZO_FISICO') && medicalRestrictions.includes('ESFUERZO_FISICO')) {
        return { 
            allowed: false, 
            reason: "Restricción Médica: El operario no puede realizar esfuerzo físico." 
        };
    }

    // 2. Bloqueo por fatiga ergonómica 24h
    if (puestoData.ActivityName && workerData.LastActivity && puestoData.ActivityName === workerData.LastActivity) {
        return { 
            allowed: false, 
            reason: "Regla 24h: El operario finalizó su jornada anterior en esta misma actividad desgastante." 
        };
    }

    // 3. Validación de género
    // NOTA (limpieza Fase 3): se quitó el fallback que adivinaba el sexo por
    // una lista fija de nombres femeninos comunes cuando Sexo venía vacío.
    // Los 153 operarios reales sembrados ya tienen Sexo poblado (ver
    // migrate_real_data_fase3.js), así que esa rama nunca se ejecutaba con
    // datos reales; si algún registro futuro llega sin Sexo, es más honesto
    // no aplicar la restricción de sexo preferente que adivinarlo.
    const sexoPreferente = puestoData.SexoPreferente;
    if (sexoPreferente === 'Masculino' || sexoPreferente === 'Femenino') {
        const workerSexo = workerData.Sexo;
        if (workerSexo && workerSexo !== sexoPreferente) {
            return {
                allowed: false,
                reason: `Requisito Técnico: Este puesto requiere perfil preferente ${sexoPreferente}.`
            };
        }
    }

    return { allowed: true };
}

module.exports = { canWorkerOccupiedSlot };
