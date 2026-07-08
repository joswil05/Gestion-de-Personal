import "./loadEnv.js";
import { getDocs } from "firebase/firestore";
import { trabajadoresColl } from "../src/services/firebaseService.js";

async function inspectRoles() {
  const snap = await getDocs(trabajadoresColl);
  const roles = new Set();
  snap.forEach(docSnap => {
    const data = docSnap.data();
    if (data.role) roles.add(data.role);
  });
  console.log("=== UNIQUE ROLES IN DATABASE ===");
  console.log(Array.from(roles));
}

inspectRoles().catch(console.error);
