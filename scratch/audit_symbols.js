import fs from 'fs';
import path from 'path';

const rootDir = 'src';
const serviceFile = path.join(rootDir, 'services', 'firebaseService.js');

// Read exports from firebaseService.js
const serviceContent = fs.readFileSync(serviceFile, 'utf-8');
const exportRegex = /export\s+(async\s+)?(function|const|let|var)\s+([a-zA-Z0-9_]+)/g;
const exports = new Set();
let match;
while ((match = exportRegex.exec(serviceContent)) !== null) {
  exports.add(match[3]);
}

console.log(`Found ${exports.size} exports in firebaseService.js:`);
console.log(Array.from(exports).sort().join(', '));
console.log('\nAuditing components...');

let errorsCount = 0;

function checkImportsAndUsage(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      checkImportsAndUsage(fullPath);
    } else if (file.endsWith('.js') || file.endsWith('.jsx')) {
      const content = fs.readFileSync(fullPath, 'utf-8');
      
      // 1. Find all imported symbols from firebaseService
      const importedSymbols = new Set();
      const importRegex = /import\s+{[^}]+}\s+from\s+['"].*firebaseService['"]/g;
      let importMatch;
      while ((importMatch = importRegex.exec(content)) !== null) {
        const block = importMatch[0];
        const symbolsMatch = /import\s+{([^}]+)}/.exec(block);
        if (symbolsMatch) {
          const symbols = symbolsMatch[1].split(',')
            .map(s => s.trim().split(/\s+as\s+/)[0].trim())
            .filter(Boolean);
          symbols.forEach(s => importedSymbols.add(s));
        }
      }

      // 2. Check if any exported firebaseService function is used in the file
      for (const exp of exports) {
        // Simple word-boundary check
        const wordRegex = new RegExp(`\\b${exp}\\b`, 'g');
        const count = (content.match(wordRegex) || []).length;
        if (count > 0) {
          // If it is used, it MUST be imported
          if (!importedSymbols.has(exp)) {
            // Wait, is it the serviceFile itself?
            if (fullPath === serviceFile) continue;
            
            console.error(`❌ ERROR: "${exp}" is used in "${fullPath}" but is NOT imported!`);
            errorsCount++;
          }
        }
      }
    }
  }
}

checkImportsAndUsage(rootDir);
if (errorsCount > 0) {
  console.log(`\n❌ Audit FAILED: Found ${errorsCount} unresolved references!`);
  process.exitCode = 1;
} else {
  console.log('\n✅ Audit SUCCESS: All references to firebaseService exports are correctly imported!');
}
