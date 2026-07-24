import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname, '../dist');

console.log('🔍 Auditando paquete de producción en dist/ contra fugas de DevConsole y handleResetDB...');

if (!fs.existsSync(distDir)) {
  console.error('❌ Error: El directorio dist/ no existe. Ejecute el build primero.');
  process.exit(1);
}

let hasForbiddenReferences = false;

function scanDirectory(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      scanDirectory(fullPath);
    } else if (file.endsWith('.js') || file.endsWith('.html') || file.endsWith('.css')) {
      const content = fs.readFileSync(fullPath, 'utf8');

      const matches = [];
      if (content.includes('DevConsole')) matches.push('DevConsole');
      if (content.includes('handleResetDB')) matches.push('handleResetDB');

      if (matches.length > 0) {
        console.error(`❌ ALERTA DE SEGURIDAD CRÍTICA: Se encontró referencia prohibida ${matches.join(', ')} en el paquete de producción: ${fullPath}`);
        hasForbiddenReferences = true;
      }
    }
  }
}

scanDirectory(distDir);

if (hasForbiddenReferences) {
  console.error('💥 EL BUILD DE PRODUCCIÓN HA FALLADO: Se detectaron herramientas internas de QA/DevConsole en el paquete final dist/.');
  process.exit(1);
} else {
  console.log('✅ AUDITORÍA DE BUILD EXITOSA: dist/ verificado. Cero referencias a DevConsole o handleResetDB en el bundle de producción.');
}
