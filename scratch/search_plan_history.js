import fs from 'fs';
import readline from 'readline';

async function search() {
  const fileStream = fs.createReadStream('C:/Users/espin/.gemini/antigravity/brain/d840a7af-aeea-46ee-a01e-13fadfba0487/.system_generated/logs/transcript.jsonl');
  
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  console.log("=== BÚSQUEDA DE PLANES Y MEJORAS EN TRANSCRIPT ===");
  let index = 0;
  for await (const line of rl) {
    try {
      const step = JSON.parse(line);
      const content = step.content || "";
      if (content.includes("implementation_plan.md") || content.includes("mejora") || content.includes("cambio") || content.includes("Fase")) {
        index++;
        if (step.type === 'USER_INPUT' || step.source === 'USER_EXPLICIT') {
          console.log(`\n--- Match ${index} (USER) ---`);
          console.log(content.substring(0, 1000));
        } else if (step.type === 'PLANNER_RESPONSE' && content.length > 50) {
          console.log(`\n--- Match ${index} (MODEL) ---`);
          console.log(content.substring(0, 1000));
        }
      }
    } catch (e) {
      // Ignorar
    }
  }
}

search().catch(console.error);
