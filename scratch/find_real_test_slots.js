import { REAL_PUESTOS } from "../src/dev/realDataSeed.js";

function find_slots(line_id) {
    const slots = REAL_PUESTOS.filter(p => p.lineId === line_id);
    console.log(`\nSlots for ${line_id}:`);
    slots.forEach(s => {
        console.log(`  ID: ${s.id}, Name: ${s.puestoName}, Type: ${s.tipoPuesto}, Titular: ${s.idWorkerOriginal}`);
    });
}

find_slots("L1");
find_slots("L4");
find_slots("L6");
