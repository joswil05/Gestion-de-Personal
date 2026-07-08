import "./loadEnv.js";
import { getDocs, query, where } from "firebase/firestore";
import { trabajadoresColl, puestosColl, canWorkerOccupiedSlot } from "../src/services/firebaseService.js";

const isWorkerRoleCompatibleWithSlot = (workerRole, slotTipo) => {
  if (!workerRole || !slotTipo) return false;
  const wRole = workerRole.trim().toLowerCase();
  const sTipo = slotTipo.trim().toLowerCase();

  const leadershipRoles = ["supervisor", "jefe", "coordinador", "coordinadora", "analista", "analista de procesos", "jefe de turno"];
  if (leadershipRoles.includes(wRole)) {
    return true;
  }

  if (sTipo === "operador a") {
    return wRole === "operador a" || wRole === "operador b";
  }
  if (sTipo === "averiero") {
    return wRole === "averiero" || wRole === "operador b";
  }
  if (sTipo === "operador c") {
    return wRole === "operador c" || wRole === "operador b" || wRole === "operador a";
  }
  if (sTipo === "puesto vario") {
    return ["operario", "operario varios", "auxiliar materiales", "limpieza", "soporte", "nuevos ingresos", "asistente", "rotativo", "operario de patio"].includes(wRole);
  }
  return wRole === sTipo;
};

const findBestSlotForWorker = (worker, slots) => {
  if (!worker) return null;

  const wRole = (worker.role || "").trim().toLowerCase();
  const leadershipRoles = ["supervisor", "jefe", "coordinador", "coordinadora", "analista", "analista de procesos", "jefe de turno"];
  if (leadershipRoles.includes(wRole)) {
    return null;
  }
  
  const vacantSlots = slots.filter(s => s.status === 'VACANTE' || s.status === 'ALERTA_VACANTE');
  if (vacantSlots.length === 0) return null;

  const titularSlot = vacantSlots.find(s => s.idWorkerOriginal === worker.id);
  if (titularSlot && isWorkerRoleCompatibleWithSlot(worker.role, titularSlot.tipoPuesto) && canWorkerOccupiedSlot(worker, titularSlot)) {
    return titularSlot;
  }

  const compatibleSlot = vacantSlots.find(s => isWorkerRoleCompatibleWithSlot(worker.role, s.tipoPuesto) && canWorkerOccupiedSlot(worker, s));
  if (compatibleSlot) {
    return compatibleSlot;
  }

  return null;
};

async function testMatching() {
  const slotsSnap = await getDocs(query(puestosColl, where("lineId", "==", "L4")));
  const slots = [];
  slotsSnap.forEach(docSnap => {
    slots.push({ id: docSnap.id, ...docSnap.data() });
  });

  const workersSnap = await getDocs(trabajadoresColl);
  const workers = [];
  workersSnap.forEach(docSnap => {
    workers.push({ id: docSnap.id, ...docSnap.data() });
  });

  console.log(`--- SIMULANDO BÚSQUEDA PARA CADA TRABAJADOR EN POOL/BOLSON PARA L4 ---`);
  const poolOrBolsonWorkers = workers.filter(w => w.status === "POOL_ARRANQUE" || w.status === "DISPONIBLE_BOLSON");
  
  for (const w of poolOrBolsonWorkers) {
    const matchedSlot = findBestSlotForWorker(w, slots);
    if (matchedSlot) {
      console.log(`🟢 MATCH: Worker ${w.id} (${w.name}, Rol: ${w.role}, Sexo: ${w.sexo}, MedRestrictions: ${JSON.stringify(w.medicalRestrictions)}) -> Slot: ${matchedSlot.id} (${matchedSlot.puestoName}, SexoPref: ${matchedSlot.sexoPreferente})`);
    } else {
      console.log(`❌ NO MATCH: Worker ${w.id} (${w.name}, Rol: ${w.role}, Sexo: ${w.sexo}, MedRestrictions: ${JSON.stringify(w.medicalRestrictions)})`);
    }
  }
}

testMatching().catch(console.error);
