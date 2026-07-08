/**
 * Skill: Gobernador de Estado Local y Resiliencia Offline (State & Connectivity Guard)
 * Responsabilidad: Controlar la UI Defensiva Offline ante zonas muertas de Wi-Fi en la fábrica.
 * Acciones de Código:
 * - Monitorear los listeners de red de Capacitor.
 * - Al perder conexión, congelar inmediatamente los flujos de transferencia inter-líneas.
 * - Forzar a las celdas a mutar su estado visual al patrón texturizado de líneas diagonales.
 */

import { Network } from '@capacitor/network';

// Estado global de conectividad local
let isNetworkOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
let networkStatusListeners = [];

// Función para obtener estado actual de conexión
export function isAppOnline() {
  return isNetworkOnline;
}

/**
 * Simula y envuelve el listener nativo de Capacitor Network
 */
export const CapacitorNetworkMock = {
  addListener: (event, callback) => {
    if (event === 'networkStatusChange') {
      networkStatusListeners.push(callback);
    }
  },
  getStatus: async () => {
    try {
      if (typeof window !== 'undefined' && window.Capacitor && window.Capacitor.isNativePlatform()) {
        const status = await Network.getStatus();
        return status;
      }
    } catch (e) {
      console.warn("[Connectivity Guard] Error leyendo Capacitor Network status, usando fallback:", e);
    }
    return {
      connected: isNetworkOnline,
      connectionType: isNetworkOnline ? 'wifi' : 'none'
    };
  },
  // Método de simulación para QA/Test desde /dev-console
  toggleNetwork: (online) => {
    isNetworkOnline = online;
    console.log(`[Capacitor Network] Cambio de conectividad forzado en hardware: ${online ? 'ONLINE' : 'OFFLINE'}`);
    networkStatusListeners.forEach(listener => listener({ connected: online, connectionType: online ? 'wifi' : 'none' }));
  }
};

/**
 * Inicializa el guardián de conectividad
 * @param {function} onStateChangeCallback Callback invocado cuando la red cambia de estado
 */
export function initializeConnectivityGuard(onStateChangeCallback) {
  // 1. Escuchar mediante Capacitor Network si es plataforma nativa
  try {
    Network.addListener('networkStatusChange', (status) => {
      isNetworkOnline = status.connected;
      console.log(`[Capacitor Network Listener] Conectividad nativa: ${isNetworkOnline ? 'ONLINE' : 'OFFLINE'}`);
      if (onStateChangeCallback) {
        onStateChangeCallback(isNetworkOnline);
      }
      // Replicar a listeners del mock/QA
      networkStatusListeners.forEach(listener => listener(status));
    });
  } catch (e) {
    console.log("[Connectivity Guard] Capacitor Network no disponible en este entorno, usando fallback Web.");
  }

  // 2. Escuchar mediante navegador estándar (fallback para emulación Web)
  if (typeof window !== 'undefined') {
    const handleWebStatusChange = () => {
      isNetworkOnline = window.navigator.onLine;
      console.log(`[Web Network Listener] Conectividad web: ${isNetworkOnline ? 'ONLINE' : 'OFFLINE'}`);
      if (onStateChangeCallback) {
        onStateChangeCallback(isNetworkOnline);
      }
      networkStatusListeners.forEach(listener => listener({
        connected: isNetworkOnline,
        connectionType: isNetworkOnline ? 'wifi' : 'none'
      }));
    };

    window.addEventListener('online', handleWebStatusChange);
    window.addEventListener('offline', handleWebStatusChange);
  }

  // 3. Listener del mock para compatibilidad con la /dev-console
  CapacitorNetworkMock.addListener('networkStatusChange', (status) => {
    isNetworkOnline = status.connected;
    if (onStateChangeCallback) {
      onStateChangeCallback(isNetworkOnline);
    }
  });
}

/**
 * Valida si se permite realizar una acción de transferencia en caliente de operarios.
 * Bloquea de inmediato las transferencias si la app está offline.
 * 
 * @param {string} actionType Tipo de acción ('INTER_LINE_TRANSFER' | 'LOCAL_ASSIGN')
 * @returns {boolean} True si la acción está permitida, False si está congelada
 */
export function verifyActionAvailability(actionType) {
  if (!isNetworkOnline) {
    if (actionType === 'INTER_LINE_TRANSFER') {
      console.error("[Connectivity Guard] BLOQUEO CRÍTICO: Los traslados de personal inter-líneas están totalmente suspendidos en modo offline.");
      return false;
    }
    console.log("[Connectivity Guard] Asignación local permitida offline de forma transicional.");
  }
  return true;
}

/**
 * Retorna la micro-copia y la configuración visual defensiva correspondiente al estado de conexión.
 * @param {boolean} isOnline Estado actual de red
 * @returns {object} Objeto con advertencias y estilos
 */
export function getOfflineVisualMetadata(isOnline) {
  if (isOnline) {
    return {
      isDefensiveMode: false,
      microCopy: "",
      className: "status-online"
    };
  }

  return {
    isDefensiveMode: true,
    microCopy: "Asignación Local Pendiente de Sincronización ── No mover al personal hasta recuperar red",
    style: {
      backgroundImage: 'repeating-linear-gradient(45deg, #F1F5F9, #F1F5F9 10px, #FFFFFF 10px, #FFFFFF 20px)',
      color: '#64748B',
      border: '1px dashed #94A3B8',
      animation: 'pulse 2s infinite'
    }
  };
}
