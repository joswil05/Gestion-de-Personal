import { createStitches } from "@stitches/react";

/**
 * Stitches CSS-in-JS Theme Configuration
 * Estilo: SaaS Light Mode profesional e industrial.
 * Restricciones inmutables:
 * - Altura de Navbar fija: 64px
 * - Altura de Celdas (Slots) fija: 80px
 * - Colores claros neutros (#F8FAFC, #FFFFFF, #E2E8F0, #2563EB)
 */
export const {
  styled,
  css,
  globalCss,
  keyframes,
  theme,
  createTheme,
  config
} = createStitches({
  theme: {
    colors: {
      background: '#F8FAFC',       // Fondo Slate 50
      card: '#FFFFFF',             // Blanco Puro
      border: '#E2E8F0',           // Borde Slate 200
      accent: '#2563EB',           // Azul Cobalto
      textPrimary: '#1E293B',      // Slate 800
      textSecondary: '#64748B',    // Slate 500

      // Paleta semáforo atenuada para estados industriales
      successBg: '#DCFCE7',        // Green 100
      successBorder: '#22C55E',    // Green 500
      warningBg: '#FEF9C3',        // Yellow 100
      warningBorder: '#EAB308',    // Yellow 500
      dangerBg: '#FEE2E2',         // Red 100
      dangerBorder: '#EF4444',     // Red 500
      infoBg: '#DBEAFE',           // Blue 100
      infoBorder: '#3B82F6',       // Blue 500
      transitBg: '#F3E8FF',        // Purple 100
      transitBorder: '#A855F7',    // Purple 500
      offlineBg: 'repeating-linear-gradient(45deg, #F1F5F9, #F1F5F9 10px, #FFFFFF 10px, #FFFFFF 20px)'
    },
    sizes: {
      navbarHeight: '64px',        // Rigidez Thumb Zone
      slotHeight: '80px'           // Rigidez HUD slots
    },
    fonts: {
      sans: "'Inter', sans-serif"
    },
    shadows: {
      subtle: '0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px 0 rgba(0, 0, 0, 0.03)',
      elevation1: '0 1px 2px 0 rgba(15, 23, 42, 0.06), 0 1px 3px 0 rgba(15, 23, 42, 0.1)',
      elevation2: '0 4px 6px -1px rgba(15, 23, 42, 0.08), 0 2px 4px -2px rgba(15, 23, 42, 0.08)',
      elevation3: '0 10px 15px -3px rgba(15, 23, 42, 0.08), 0 4px 6px -4px rgba(15, 23, 42, 0.08)'
    }
  },
  media: {
    tablet: '(max-width: 1024px)',
    mobile: '(max-width: 768px)'
  }
});

/**
 * Estilos Globales para asegurar el cumplimiento del Modo Claro SaaS
 */
export const injectGlobalStyles = globalCss({
  '*': {
    boxSizing: 'border-box',
    margin: 0,
    padding: 0
  },
  'body': {
    backgroundColor: '$background',
    color: '$textPrimary',
    fontFamily: '$sans',
    '-webkit-font-smoothing': 'antialiased',
    '-moz-osx-font-smoothing': 'grayscale'
  }
});
