import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Configuration for Vite and Stitches React build compilation
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
});
