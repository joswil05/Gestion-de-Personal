import "./loadEnv.js";
import { getDoc, doc } from "firebase/firestore";
import { db } from "../src/services/firebaseService.js";

async function inspectSku() {
  const lineL4Doc = await getDoc(doc(db, "config", "line_L4"));
  console.log("=== line_L4 config ===");
  if (lineL4Doc.exists()) {
    console.log(JSON.stringify(lineL4Doc.data(), null, 2));
  } else {
    console.log("No config/line_L4 found");
  }

  const shiftStatusDoc = await getDoc(doc(db, "config", "shift_status"));
  console.log("=== config/shift_status ===");
  if (shiftStatusDoc.exists()) {
    console.log(JSON.stringify(shiftStatusDoc.data(), null, 2));
  } else {
    console.log("No config/shift_status found");
  }
}

inspectSku().catch(console.error);
