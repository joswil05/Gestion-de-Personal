import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import { assignWorkerTransaction } from "../src/services/firebaseService.js";

const firebaseConfig = {
  apiKey: "AIzaSyDpWDghWDwzvxwqC_rsMpyg9R4cVu9N6FU",
  authDomain: "gestion-de-personal-9041a.firebaseapp.com",
  projectId: "gestion-de-personal-9041a",
  storageBucket: "gestion-de-personal-9041a.firebasestorage.app",
  messagingSenderId: "961928077384",
  appId: "1:961928077384:web:f2258c0cbb6cd0b35e387d"
};

async function runTest() {
  console.log("=== SIMULANDO ASIGNACIÓN ATÓMICA ===");
  try {
    const res = await assignWorkerTransaction("WORKER_351502", "SLOT_L5_008", "L5");
    console.log("SUCCESS:", res);
  } catch (error) {
    console.error("FAILED WITH ERROR:", error.message);
    console.error(error);
  }
  process.exit(0);
}

runTest();
