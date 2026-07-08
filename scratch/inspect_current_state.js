import "./loadEnv.js";
import { getDocs, query, where } from "firebase/firestore";
import { trabajadoresColl, puestosColl } from "../src/services/firebaseService.js";

async function inspect() {
  console.log("=== PUESTOS DE LA LÍNEA L4 ===");
  const slotsSnap = await getDocs(query(puestosColl, where("lineId", "==", "L4")));
  const slots = [];
  slotsSnap.forEach(docSnap => {
    slots.push({ id: docSnap.id, ...docSnap.data() });
  });
  console.log(JSON.stringify(slots.map(s => ({
    id: s.id,
    puestoName: s.puestoName,
    tipoPuesto: s.tipoPuesto,
    status: s.status,
    idWorkerCurrent: s.idWorkerCurrent,
    sexoPreferente: s.sexoPreferente,
    requiredCapabilities: s.requiredCapabilities
  })), null, 2));

  console.log("\n=== TRABAJADORES DISPONIBLES O EN BOLSÓN L8 ===");
  const workersSnap = await getDocs(trabajadoresColl);
  const workers = [];
  workersSnap.forEach(docSnap => {
    workers.push({ id: docSnap.id, ...docSnap.data() });
  });

  const availableWorkers = workers.filter(w => w.status === "DISPONIBLE" || w.status === "DISPONIBLE_BOLSON" || w.status === "BOLSÓN" || w.status === "BOLSON" || !w.currentSlotId);
  console.log(JSON.stringify(availableWorkers.map(w => ({
    id: w.id,
    name: w.name,
    role: w.role,
    status: w.status,
    sexo: w.sexo,
    medicalRestrictions: w.medicalRestrictions,
    currentSlotId: w.currentSlotId
  })), null, 2));
}

inspect().catch(console.error);
