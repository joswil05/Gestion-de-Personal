/**
 * Skill: Diseñador Experto de Aplicaciones Móviles (ui-saas-master)
 * Responsabilidad: Garantizar una interfaz SaaS Light Mode ejecutiva, limpia y profesional.
 * Restricciones:
 * - Fondo Neutro (#F8FAFC), Tarjetas Blanco Puro (#FFFFFF), Bordes Grises (#E2E8F0) de 1px.
 * - Acentos en Azul Cobalto (#2563EB). Paleta semáforo atenuada.
 * - Barra de navegación fija en la base de exactamente 64px de alto (Thumb Zone).
 * - Celdas operativas (slots) rígidas de exactamente 80px de alto.
 * - Micro-copia contextual visible por puesto. No pantallas mudas ni alertas crudas.
 */

export const UI_SAAS_THEME = {
  colors: {
    background: '#F8FAFC',    // Slate 50
    card: '#FFFFFF',          // Pure White
    border: '#E2E8F0',        // Slate 200
    accent: '#2563EB',        // Cobalt Blue
    textPrimary: '#1E293B',   // Slate 800
    textSecondary: '#64748B', // Slate 500
    status: {
      success: '#DCFCE7',     // Green 100 (Atenuado)
      warning: '#FEF9C3',     // Yellow 100 (Atenuado)
      danger: '#FEE2E2',      // Red 100 (Atenuado)
      info: '#DBEAFE',        // Blue 100 (Atenuado)
      transit: '#F3E8FF'      // Purple 100 (En Tránsito)
    }
  },
  layout: {
    bottomNavbarHeight: 64,   // 64px (Thumb Zone)
    slotHeight: 80,           // 80px rígido
  }
};

/**
 * Diccionario de Micro-copia Contextual Explicativa para erradicar el efecto "caja negra"
 */
export const MICRO_COPY = {
  MOTOR_1_AUTO: "Asignado automáticamente por asistencia",
  MOTOR_1_REPLACEMENT: "Reemplazo automático - Titular ausente",
  MOTOR_2_REDIRECT: (lineName) => `Asignación redirigida a ${lineName} por vacante crítica de mayor prioridad abierta`,
  MOTOR_3_ROTATION: "Rotación Ergonómica (2h cumplidas) - Relevista en tránsito desde L8",
  MOTOR_3_DISPATCH: "Extracción por Rotación - Despachar operario",
  MOTOR_4_PARO: "Puesto liberado - Operario en ensamble manual L8 por modo preparación",
  MOTOR_5_RETURN: "Titular reincorporado por alta médica",
  OFFLINE_PENDING: "Asignación Local Pendiente de Sincronización ── No mover al personal hasta recuperar red"
};

/**
 * Valida si un elemento de UI cumple con las restricciones de altura y diseño del MVP.
 * @param {string} type Tipo de componente ('navbar' | 'slot')
 * @param {number} height Altura en píxeles
 * @returns {boolean}
 */
export function validateLayoutConstraints(type, height) {
  if (type === 'navbar' && height !== UI_SAAS_THEME.layout.bottomNavbarHeight) {
    console.error(`Error de UI: La barra de navegación inferior debe medir exactamente ${UI_SAAS_THEME.layout.bottomNavbarHeight}px de alto para optimización Thumb Zone.`);
    return false;
  }
  if (type === 'slot' && height !== UI_SAAS_THEME.layout.slotHeight) {
    console.error(`Error de UI: Las celdas operativas deben medir exactamente ${UI_SAAS_THEME.layout.slotHeight}px de alto.`);
    return false;
  }
  return true;
}

/**
 * Retorna las clases CSS o estilos inline base para una celda operativa (slot) de 80px.
 * @param {string} status Estado del operario asignado en el slot
 * @param {boolean} isOffline Indica si la app está sin conexión
 * @returns {object} Objeto con estilos inline listos para ser renderizados
 */
export function getSlotStyles(status, isOffline = false) {
  const styles = {
    height: `${UI_SAAS_THEME.layout.slotHeight}px`,
    backgroundColor: UI_SAAS_THEME.colors.card,
    border: `1px solid ${UI_SAAS_THEME.colors.border}`,
    borderRadius: '8px',
    padding: '12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    boxSizing: 'border-box',
    fontFamily: "'Inter', sans-serif",
    position: 'relative',
    overflow: 'hidden'
  };

  // Aplicar patrón visual defensivo si está offline
  if (isOffline) {
    styles.backgroundImage = 'repeating-linear-gradient(45deg, #F1F5F9, #F1F5F9 10px, #FFFFFF 10px, #FFFFFF 20px)';
    styles.borderColor = '#CBD5E1';
    return styles;
  }

  // Colores de estado atenuados para uso industrial
  switch (status) {
    case 'ASIGNADO':
      styles.borderLeft = `4px solid ${UI_SAAS_THEME.colors.accent}`;
      break;
    case 'EN_TRANSITO':
      styles.backgroundColor = UI_SAAS_THEME.colors.status.transit;
      styles.borderLeft = '4px solid #A855F7'; // Púrpura
      break;
    case 'DISPONIBLE_BOLSON':
      styles.backgroundColor = UI_SAAS_THEME.colors.status.success;
      styles.borderLeft = '4px solid #22C55E'; // Verde
      break;
    case 'BAJA_TEMPORAL':
      styles.backgroundColor = UI_SAAS_THEME.colors.status.danger;
      styles.borderLeft = '4px solid #EF4444'; // Rojo
      break;
    case 'POOL_ARRANQUE':
      styles.backgroundColor = UI_SAAS_THEME.colors.status.info;
      styles.borderLeft = '4px solid #3B82F6'; // Azul
      break;
    default:
      styles.borderLeft = `4px solid ${UI_SAAS_THEME.colors.border}`;
  }

  return styles;
}
