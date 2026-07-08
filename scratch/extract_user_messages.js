import fs from 'fs';
import readline from 'readline';

async function extract() {
  const fileStream = fs.createReadStream('C:/Users/espin/.gemini/antigravity/brain/d840a7af-aeea-46ee-a01e-13fadfba0487/.system_generated/logs/transcript.jsonl');
  
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  console.log("=== TODOS LOS MENSAJES DEL USUARIO (DE PRINCIPIO A FIN) ===");
  let index = 0;
  for await (const line of rl) {
    try {
      const step = JSON.parse(line);
      if (step.type === 'USER_INPUT' || step.source === 'USER_EXPLICIT' || (step.content && step.content.includes("<USER_REQUEST>"))) {
        index++;
        // Imprimir los primeros 30 mensajes y los últimos 50
        if (index <= 50 || index >= 180) {
          console.log(`\n--- MENSAJE ${index} ---`);
          console.log(`Contenido: ${step.content.substring(0, 1000)}`);
        }
      }
    } catch (e) {
      // Ignorar errores de parsing
    }
  }
}

extract().catch(console.error);
