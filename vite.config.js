import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Configuration for Vite and Stitches React build compilation
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // firebase/auth, firebase/app y firebase/functions se retiraron (ver
      // AUDIT_REPORT.md B-2): nada en src/ los importa ya. firebase/firestore
      // sigue alias-eado al shim REST real (src/mocks/firebase/firestore.js),
      // que sí sostiene el HUD del Supervisor.
      'firebase/firestore': path.resolve(__dirname, './src/mocks/firebase/firestore.js'),
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
});
