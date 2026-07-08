import "./loadEnv.js";
import { getDoc, doc } from "firebase/firestore";
import { db } from "../src/services/firebaseService.js";

async function inspectShift() {
  const shiftDoc = await getDoc(doc(db, "config", "shift_status"));
  if (shiftDoc.exists()) {
    console.log("=== SHIFT STATUS ===");
    const data = shiftDoc.data();
    console.log(JSON.stringify(data, null, 2));
    if (data.shiftStartTimestamp) {
      const shiftStartTime = data.shiftStartTimestamp.toDate().getTime();
      const elapsed = (Date.now() - shiftStartTime) / (60 * 1000);
      console.log(`Elapsed minutes since shift start: ${elapsed.toFixed(2)} mins`);
    }
  } else {
    console.log("No shift_status doc found!");
  }
}

inspectShift().catch(console.error);
