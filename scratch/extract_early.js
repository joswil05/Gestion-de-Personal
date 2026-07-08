import fs from 'fs';
import readline from 'readline';

async function extract() {
  const fileStream = fs.createReadStream('C:/Users/espin/.gemini/antigravity/brain/d840a7af-aeea-46ee-a01e-13fadfba0487/.system_generated/logs/transcript.jsonl');
  
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  console.log("=== MENSAJES DEL USUARIO (RANGO 1 A 60) ===");
  let index = 0;
  for await (const line of rl) {
    try {
      const step = JSON.parse(line);
      if (step.type === 'USER_INPUT' || step.source === 'USER_EXPLICIT' || (step.content && step.content.includes("<USER_REQUEST>"))) {
        index++;
        if (index >= 1 && index <= 60) {
          console.log(`\n--- MENSAJE ${index} ---`);
          console.log(`Contenido: ${step.content}`);
        }
      }
    } catch (e) {
      // Ignorar errores de parsing
    }
  }
}

extract().catch(console.error);
