import "./loadEnv.js";
import { getDoc, doc } from "firebase/firestore";
import { canWorkerOccupiedSlot, db } from "../src/services/firebaseService.js";

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

async function check() {
  const workerDoc = await getDoc(doc(db, "trabajadores", "WORKER_11741"));
  const slotDoc = await getDoc(doc(db, "puestos", "SLOT_L4_004")); // Lampara 1 (Puesto Vario, Femenino)
  const slotEstibadorDoc = await getDoc(doc(db, "puestos", "SLOT_L4_010")); // Estibador 1 (Puesto Vario, Masculino, Esfuerzo Fisico)

  if (!workerDoc.exists() || !slotDoc.exists()) {
    console.error("Worker or slot doc not found!");
    process.exit(1);
  }

  const worker = { id: workerDoc.id, ...workerDoc.data() };
  const slot = { id: slotDoc.id, ...slotDoc.data() };
  const slotEstibador = { id: slotEstibadorDoc.id, ...slotEstibadorDoc.data() };

  console.log("=== TRABAJADOR ===");
  console.log(JSON.stringify(worker, null, 2));

  console.log("\n=== SLOT 004 (Lámpara 1) ===");
  console.log(JSON.stringify(slot, null, 2));

  console.log("\n=== EVALUANDO COMPATIBILIDAD CON SLOT 004 ===");
  const roleComp = isWorkerRoleCompatibleWithSlot(worker.role, slot.tipoPuesto);
  const healthComp = canWorkerOccupiedSlot(worker, slot);
  console.log(`Role Compatible: ${roleComp}`);
  console.log(`Health Compatible: ${healthComp}`);

  console.log("\n=== EVALUANDO COMPATIBILIDAD CON SLOT 010 (Estibador 1, Masculino, Esfuerzo Físico) ===");
  const roleCompEst = isWorkerRoleCompatibleWithSlot(worker.role, slotEstibador.tipoPuesto);
  const healthCompEst = canWorkerOccupiedSlot(worker, slotEstibador);
  console.log(`Role Compatible: ${roleCompEst}`);
  console.log(`Health Compatible: ${healthCompEst}`);

  process.exit(0);
}

check().catch(console.error);
