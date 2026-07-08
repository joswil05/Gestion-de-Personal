import "./loadEnv.js";
import { getDocs, query, where, collection } from "firebase/firestore";
import { db, trabajadoresColl, puestosColl, canWorkerOccupiedSlot } from "../src/services/firebaseService.js";

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

async function testCompat() {
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

  const vacantSlots = slots.filter(s => s.status === 'VACANTE' || s.status === 'ALERTA_VACANTE');
  console.log(`=== PUESTOS VACANTES EN L4 (${vacantSlots.length}) ===`);
  vacantSlots.forEach(s => {
    console.log(`Slot: ${s.id} - ${s.puestoName} (${s.tipoPuesto}) - Sexo: ${s.sexoPreferente || 'Indistinto'} - Reqs: ${JSON.stringify(s.requiredCapabilities || [])}`);
  });

  const eligibleWorkers = workers.filter(w => (w.status === "POOL_ARRANQUE" || w.status === "DISPONIBLE_BOLSON") && !w.currentSlotId);
  console.log(`\n=== OPERARIOS ELIGIBLES EN POOL/BOLSÓN (${eligibleWorkers.length}) ===`);

  eligibleWorkers.forEach(w => {
    console.log(`Worker: ${w.id} - ${w.name} - Role: ${w.role} - Sexo: ${w.sexo} - Restrictions: ${JSON.stringify(w.medicalRestrictions || [])}`);
    vacantSlots.forEach(s => {
      const roleCompat = isWorkerRoleCompatibleWithSlot(w.role, s.tipoPuesto);
      const genderMedicalCompat = canWorkerOccupiedSlot(w, s);
      const fullyCompat = roleCompat && genderMedicalCompat;
      if (fullyCompat) {
        console.log(`  -> COMPATIBLE con ${s.puestoName} (${s.id})`);
      } else {
        const reasons = [];
        if (!roleCompat) reasons.push("Role Incompatible");
        if (!genderMedicalCompat) reasons.push("Gender/Medical Incompatible");
        console.log(`  x Incompatible con ${s.puestoName} (${s.id}) [${reasons.join(", ")}]`);
      }
    });
  });
}

testCompat().catch(console.error);
