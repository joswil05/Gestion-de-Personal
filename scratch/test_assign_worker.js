import "./loadEnv.js";
import { assignWorkerTransaction } from "../src/services/firebaseService.js";

async function run() {
  console.log("=== PROBANDO ASIGNACIÓN EN FIRESTORE ===");
  try {
    const res = await assignWorkerTransaction("WORKER_11741", "SLOT_L4_004", "L4");
    console.log("Resultado de la Asignación:", JSON.stringify(res, null, 2));
  } catch (err) {
    console.error("❌ ERROR EN LA TRANSACCIÓN:", err.message);
  }
  process.exit(0);
}

run().catch(console.error);
