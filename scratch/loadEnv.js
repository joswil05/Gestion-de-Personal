import fs from "fs";
import path from "path";

if (!process.env.VITE_FIREBASE_API_KEY) {
  try {
    const envPath = path.resolve(process.cwd(), "./.env");
    if (fs.existsSync(envPath)) {
      const envFile = fs.readFileSync(envPath, "utf-8");
      envFile.split("\n").forEach(line => {
        const parts = line.split("=");
        if (parts.length === 2) {
          const key = parts[0].trim();
          const val = parts[1].trim();
          process.env[key] = val;
        }
      });
    }
  } catch (e) {
    console.warn("Could not read .env file:", e.message);
  }
}
