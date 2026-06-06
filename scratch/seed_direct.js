import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, doc, setDoc, deleteDoc, writeBatch } from "firebase/firestore";
import { REAL_PUESTOS, REAL_TRABAJADORES, REAL_PROGRAMA } from "../src/dev/realDataSeed.js";

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

const trabajadoresColl = collection(db, "trabajadores");
const puestosColl = collection(db, "puestos");
const programaColl = collection(db, "programa_produccion");

async function seedDatabase() {
  console.log("=== INICIANDO PURGA Y SEMBRADO DIRECTO DE BASE DE DATOS ===");

  try {
    // 1. Purge Puestos
    console.log("Purgando puestos...");
    const snapPuestos = await getDocs(puestosColl);
    let batch = writeBatch(db);
    let count = 0;
    snapPuestos.forEach(docSnap => {
      batch.delete(docSnap.ref);
      count++;
    });
    if (count > 0) {
      await batch.commit();
      console.log(`Eliminados ${count} puestos antiguos.`);
    } else {
      console.log("No había puestos que eliminar.");
    }

    // 2. Purge Trabajadores
    console.log("Purgando trabajadores...");
    const snapTrabajadores = await getDocs(trabajadoresColl);
    batch = writeBatch(db);
    count = 0;
    snapTrabajadores.forEach(docSnap => {
      batch.delete(docSnap.ref);
      count++;
    });
    if (count > 0) {
      await batch.commit();
      console.log(`Eliminados ${count} trabajadores antiguos.`);
    } else {
      console.log("No había trabajadores que eliminar.");
    }

    // 3. Purge Programa Produccion
    console.log("Purgando programa_produccion...");
    const snapPrograma = await getDocs(programaColl);
    batch = writeBatch(db);
    count = 0;
    snapPrograma.forEach(docSnap => {
      batch.delete(docSnap.ref);
      count++;
    });
    if (count > 0) {
      await batch.commit();
      console.log(`Eliminados ${count} registros antiguos de programa_produccion.`);
    } else {
      console.log("No había registros de programa que eliminar.");
    }

    // 4. Write Puestos in batches (Firestore allows up to 500 writes per batch)
    console.log(`Sembrando ${REAL_PUESTOS.length} puestos reales...`);
    batch = writeBatch(db);
    let operationCount = 0;
    for (const puesto of REAL_PUESTOS) {
      const docRef = doc(db, "puestos", puesto.id);
      batch.set(docRef, puesto);
      operationCount++;
      if (operationCount >= 400) {
        await batch.commit();
        console.log(`Escritos ${operationCount} puestos...`);
        batch = writeBatch(db);
        operationCount = 0;
      }
    }
    if (operationCount > 0) {
      await batch.commit();
      console.log("Puestos sembrados con éxito.");
    }

    // 5. Write Trabajadores in batches
    console.log(`Sembrando ${REAL_TRABAJADORES.length} trabajadores reales...`);
    batch = writeBatch(db);
    operationCount = 0;
    for (const trabajador of REAL_TRABAJADORES) {
      const docRef = doc(db, "trabajadores", trabajador.id);
      batch.set(docRef, trabajador);
      operationCount++;
      if (operationCount >= 400) {
        await batch.commit();
        console.log(`Escritos ${operationCount} trabajadores...`);
        batch = writeBatch(db);
        operationCount = 0;
      }
    }
    if (operationCount > 0) {
      await batch.commit();
      console.log("Trabajadores sembrados con éxito.");
    }

    // 6. Write Programa Produccion in batches
    console.log(`Sembrando ${REAL_PROGRAMA.length} órdenes reales del Programa de Producción...`);
    batch = writeBatch(db);
    operationCount = 0;
    for (const orden of REAL_PROGRAMA) {
      const docRef = doc(db, "programa_produccion", orden.id);
      batch.set(docRef, orden);
      operationCount++;
      if (operationCount >= 400) {
        await batch.commit();
        console.log(`Escritas ${operationCount} órdenes de producción...`);
        batch = writeBatch(db);
        operationCount = 0;
      }
    }
    if (operationCount > 0) {
      await batch.commit();
      console.log("Órdenes de producción sembradas con éxito.");
    }

    // 7. Initialize config documents to preparation mode
    console.log("Restableciendo configuraciones de turno...");
    await setDoc(doc(db, "config", "shift_status"), {
      status: "PREPARACION",
      shiftStartTimestamp: null
    });

    const allLines = ["L1", "L2", "L3", "L4", "L5", "L6", "L7", "L8", "L9", "L10"];
    for (const lineId of allLines) {
      console.log(`Inicializando config/line_${lineId} en PREPARACION...`);
      await setDoc(doc(db, "config", `line_${lineId}`), {
        status: "PREPARACION",
        sku: "850EC0832L35",
        updatedAt: new Date()
      });
    }

    await setDoc(doc(db, "config", "global_priority"), {
      activeLines: ["L4", "L1", "L2", "L6", "L7", "L5", "L3", "L8"],
      priorityOrder: ["L4", "L1", "L2", "L6", "L7", "L5", "L3", "L8"],
      skuAssigned: "850EC0832L35", // Usar un SKU real del programa como default
      skuPlan: {
        L1: "850EC0832L35",
        L2: "850EC0832L35",
        L3: "850EC0832L35",
        L4: "850EC0832L35",
        L5: "INACTIVO",
        L6: "850EC0832L35",
        L7: "INACTIVO",
        L8: "850EC0832L35",
        L9: "INACTIVO",
        L10: "INACTIVO"
      }
    });

    console.log("Purgando plan de mañana (next_day_plan)...");
    await deleteDoc(doc(db, "config", "next_day_plan"));

    console.log("=== SEMBRADO DE BASE DE DATOS COMPLETADO CON ÉXITO ===");
  } catch (error) {
    console.error("Error crítico durante el sembrado:", error);
  }
}

seedDatabase();
