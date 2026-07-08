import { REAL_TRABAJADORES, REAL_PUESTOS } from "../src/dev/realDataSeed.js";

console.log("Total trabajadores:", REAL_TRABAJADORES.length);
console.log("Total puestos:", REAL_PUESTOS.length);

const mujeres = REAL_TRABAJADORES.filter(w => w.sexo === "Femenino");
console.log("Total mujeres:", mujeres.length);

// Puestos con sexoPreferente Femenino
const puestosFemeninos = REAL_PUESTOS.filter(p => p.sexoPreferente === "Femenino");
console.log("Puestos con sexo preferente femenino:", puestosFemeninos.length);
puestosFemeninos.forEach(p => {
  console.log(`  Puesto: ${p.puestoName} (${p.lineId}), ID: ${p.id}, Titular Original: ${p.idWorkerOriginal}`);
});

// Ver las mujeres que no tienen asignación fija o que no son titulares de ningún puesto
const mujeresSinPuestoFijo = mujeres.filter(m => {
  const esTitular = REAL_PUESTOS.some(p => p.idWorkerOriginal === m.id);
  return !esTitular;
});
console.log("Mujeres que no son titulares de ningún puesto:", mujeresSinPuestoFijo.length);
mujeresSinPuestoFijo.forEach(m => {
  console.log(`  Nombre: ${m.name}, ID: ${m.id}, Restricciones: ${m.medicalRestrictions}`);
});
