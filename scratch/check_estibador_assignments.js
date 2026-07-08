import "./loadEnv.js";
import { getDocs, collection } from "firebase/firestore";
import { db } from "../src/services/firebaseService.js";

async function run() {
  const puestosSnap = await getDocs(collection(db, "puestos"));
  const trabajadoresSnap = await getDocs(collection(db, "trabajadores"));
  
  const workersMap = {};
  trabajadoresSnap.forEach(d => {
    workersMap[d.id] = { id: d.id, ...d.data() };
  });

  const slots = [];
  puestosSnap.forEach(d => {
    slots.push({ id: d.id, ...d.data() });
  });

  console.log("=== ANÁLISIS DE ASIGNACIONES EN ESTIBADORES ===");
  slots.forEach(s => {
    const sName = (s.puestoName || "").trim().toLowerCase();
    if (sName.includes("estibador")) {
      const currentWorkerId = s.idWorkerCurrent;
      if (currentWorkerId) {
        const w = workersMap[currentWorkerId];
        console.log(`Puesto Estibador: ${s.puestoName} (${s.id}) en Línea ${s.lineId}`);
        console.log(`  Asignado a: ${w ? w.name : 'Unknown'} (${currentWorkerId})`);
        console.log(`  Rol del trabajador: ${w ? w.role : 'N/A'}`);
      } else {
        console.log(`Puesto Estibador: ${s.puestoName} (${s.id}) en Línea ${s.lineId} está VACANTE`);
      }
    }
  });

  process.exit(0);
}

run().catch(console.error);
