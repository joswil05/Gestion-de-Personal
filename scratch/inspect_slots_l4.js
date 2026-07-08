import { initializeApp } from "firebase/app";
import { getFirestore, getDocs, collection, query, where } from "firebase/firestore";

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

async function inspect() {
  console.log("--- PUESTOS DE LA LÍNEA 4 (L4) EN FIRESTORE ---");
  const q = query(collection(db, "puestos"), where("lineId", "==", "L4"));
  const snap = await getDocs(q);
  
  const list = [];
  snap.forEach(d => {
    list.push({ id: d.id, ...d.data() });
  });

  list.sort((a, b) => a.id.localeCompare(b.id));

  list.forEach(s => {
    console.log(`- ID: ${s.id} | Nombre: ${s.puestoName} | Tipo: ${s.tipoPuesto} | Estado: ${s.status} | WorkerCurrent: ${s.idWorkerCurrent} | SexoPref: ${s.sexoPreferente || 'Indistinto'} | Reqs: ${JSON.stringify(s.requiredCapabilities || [])}`);
  });

  process.exit(0);
}

inspect().catch(console.error);
