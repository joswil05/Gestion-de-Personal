import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Configuration for Vite and Stitches React build compilation
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      'firebase/firestore': path.resolve(__dirname, './src/mocks/firebase/firestore.js'),
      'firebase/auth': path.resolve(__dirname, './src/mocks/firebase/auth.js'),
      'firebase/app': path.resolve(__dirname, './src/mocks/firebase/app.js'),
      'firebase/functions': path.resolve(__dirname, './src/mocks/firebase/functions.js'),
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
});
