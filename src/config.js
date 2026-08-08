// Fuente única de la URL del backend. Antes 'http://localhost:3001' vivía
// incrustado en seis archivos (src/services/apiService.js,
// coordinatorApi.js, authService.js; src/components/LoginScreen.jsx;
// src/mocks/firebase/firestore.js x2); la app no se podía desplegar fuera
// de la máquina de desarrollo sin editar código (AUDIT_REPORT.md M-3).
// Vite ya soporta import.meta.env.VITE_*; VITE_API_URL se documenta en
// .env.example.
export const API_BASE = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_URL)
    || 'http://localhost:3001';
export const API_URL = `${API_BASE}/api`;
