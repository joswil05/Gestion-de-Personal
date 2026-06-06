import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, doc, getDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDpWDghWDwzvxwqC_rsMpyg9R4cVu9N6FU",
  authDomain: "gestion-de-personal-9041a.firebaseapp.com",
  projectId: "gestion-de-personal-9041a",
  storageBucket: "gestion-de-personal-9041a.firebasestorage.app",
  messagingSenderId: "961928077384",
  appId: "1:961928077384:web:f2258c0cbb6cd0b35e387d"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function runAudit() {
  console.log("=== INICIANDO AUDITORÍA DE FIRESTORE ===");

  // 1. Audit config/global_priority
  try {
    const globalPriorityDoc = await getDoc(doc(db, "config", "global_priority"));
    if (globalPriorityDoc.exists()) {
      console.log("Config Global Priority:", globalPriorityDoc.data());
    } else {
      console.log("Alerta: El documento 'config/global_priority' NO existe.");
    }
  } catch (err) {
    console.error("Error leyendo global_priority:", err.message);
  }

  // 2. Audit config/shift_status
  try {
    const shiftStatusDoc = await getDoc(doc(db, "config", "shift_status"));
    if (shiftStatusDoc.exists()) {
      console.log("Shift Status:", shiftStatusDoc.data());
    } else {
      console.log("Alerta: El documento 'config/shift_status' NO existe.");
    }
  } catch (err) {
    console.error("Error leyendo shift_status:", err.message);
  }

  // 3. Audit Trabajadores
  try {
    const trabajadoresSnap = await getDocs(collection(db, "trabajadores"));
    console.log(`Total Trabajadores Sembrados: ${trabajadoresSnap.size}`);
    
    const statusCounts = {};
    const roleCounts = {};
    trabajadoresSnap.forEach(docSnap => {
      const data = docSnap.data();
      statusCounts[data.status] = (statusCounts[data.status] || 0) + 1;
      roleCounts[data.role] = (roleCounts[data.role] || 0) + 1;
    });
    console.log("Distribución de Estados de Trabajadores:", statusCounts);
    console.log("Distribución de Roles de Trabajadores:", roleCounts);
  } catch (err) {
    console.error("Error leyendo trabajadores:", err.message);
  }

  // 4. Audit Puestos
  try {
    const puestosSnap = await getDocs(collection(db, "puestos"));
    console.log(`Total Puestos Sembrados: ${puestosSnap.size}`);

    const slotStatusCounts = {};
    const slotsByLine = {};
    puestosSnap.forEach(docSnap => {
      const data = docSnap.data();
      slotStatusCounts[data.status] = (slotStatusCounts[data.status] || 0) + 1;
      if (!slotsByLine[data.lineId]) {
        slotsByLine[data.lineId] = [];
      }
      slotsByLine[data.lineId].push({ id: docSnap.id, ...data });
    });
    console.log("Distribución de Estados de Puestos:", slotStatusCounts);
    
    console.log("Detalle de Puestos por Línea:");
    Object.keys(slotsByLine).sort().forEach(lineId => {
      const lineSlots = slotsByLine[lineId];
      const statuses = lineSlots.map(s => `${s.id.split('_').pop()}:${s.status}(${s.idWorkerCurrent || 'VACANTE'})`);
      console.log(` - Línea ${lineId} (${lineSlots.length} puestos):`, statuses.join(" | "));
    });

  } catch (err) {
    console.error("Error leyendo puestos:", err.message);
  }

  console.log("=== FIN DE LA AUDITORÍA ===");
}

runAudit();
