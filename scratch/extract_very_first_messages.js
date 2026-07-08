import fs from 'fs';
import readline from 'readline';

async function extract() {
  const fileStream = fs.createReadStream('C:/Users/espin/.gemini/antigravity/brain/d840a7af-aeea-46ee-a01e-13fadfba0487/.system_generated/logs/transcript.jsonl');
  
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  console.log("=== MENSAJES DEL USUARIO 1 A 20 (COMPLETOS) ===");
  let index = 0;
  for await (const line of rl) {
    try {
      const step = JSON.parse(line);
      if (step.type === 'USER_INPUT' || step.source === 'USER_EXPLICIT' || (step.content && step.content.includes("<USER_REQUEST>"))) {
        index++;
        if (index >= 1 && index <= 20) {
          console.log(`\n--- MENSAJE ${index} ---`);
          console.log(`Contenido:\n${step.content}`);
        }
      }
    } catch (e) {
      // Ignorar errores de parsing
    }
  }
}

extract().catch(console.error);
