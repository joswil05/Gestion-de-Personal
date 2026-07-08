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
      background: '#F1F5F9',       // Gris Slate 100 (Da más contraste a las tarjetas blancas)
      card: '#FFFFFF',             // Blanco Puro
      border: '#E2E8F0',           // Slate 200
      accent: '#2563EB',           // Azul Cobalto Premium
      textPrimary: '#0F172A',      // Slate 900 (Mayor peso y seriedad)
      textSecondary: '#475569',    // Slate 600

      // Paleta semáforo basada en HSL para mayor viveza y consistencia
      successBg: 'hsl(142, 70%, 96%)',      // Green 50
      successBorder: 'hsl(142, 72%, 29%)',  // Green 700 (Legible y fuerte)
      warningBg: 'hsl(45, 100%, 95%)',      // Amber 50
      warningBorder: 'hsl(35, 92%, 40%)',   // Amber 800 (Fuerte y visible)
      dangerBg: 'hsl(0, 100%, 96%)',        // Red 50
      dangerBorder: 'hsl(0, 84%, 44%)',     // Red 700
      infoBg: 'hsl(217, 91%, 95%)',         // Blue 50
      infoBorder: 'hsl(217, 91%, 45%)',     // Blue 700
      transitBg: 'hsl(271, 91%, 96%)',      // Purple 50
      transitBorder: 'hsl(271, 91%, 55%)',  // Purple 700
      offlineBg: 'repeating-linear-gradient(45deg, #F1F5F9, #F1F5F9 10px, #FFFFFF 10px, #FFFFFF 20px)',

      // NUEVOS TOKENS DE COLOR
      statusOk: 'hsl(142, 72%, 29%)',
      statusOkDot: 'hsl(142, 70%, 45%)',
      statusAlert: 'hsl(0, 84%, 44%)',
      statusAlertDot: 'hsl(0, 84%, 55%)',
      statusWarningDot: 'hsl(35, 92%, 50%)',
      chipSuccessBg: 'hsl(142, 70%, 94%)',
      chipSuccessText: 'hsl(142, 72%, 25%)',
      chipDangerBg: 'hsl(0, 100%, 94%)',
      chipDangerText: 'hsl(0, 84%, 38%)',
      chipNeutralBg: '#F1F5F9',
      chipNeutralText: '#475569',
      chipAccentBg: 'hsl(217, 91%, 93%)',
      chipAccentText: 'hsl(217, 91%, 38%)',
      listDivider: '#E2E8F0',
      surfaceHover: '#F8FAFC'
    },
    sizes: {
      navbarHeight: '64px',        // Rigidez Thumb Zone
      slotHeight: '80px',          // Rigidez HUD slots
      listItemHeight: '64px',
      listItemHeightCompact: '48px',  
      headerHeight: '48px',
      avatarSize: '36px',
      chipHeight: '24px',
      dotSize: '8px',
      statusBorderWidth: '3px'
    },
    fonts: {
      sans: "'Outfit', 'Inter', sans-serif", // Outfit da una estética móvil premium redondeada
      sizeTitleScreen: '20px',
      sizeTitleCard: '16px',
      sizeBody: '14px',
      sizeSecondary: '13px',
      sizeMeta: '11px',
      weightBold: '700',
      weightSemibold: '600',
      weightRegular: '400'
    },
    shadows: {
      subtle: '0 2px 4px rgba(15, 23, 42, 0.02)',
      elevation1: '0 2px 8px rgba(15, 23, 42, 0.05), 0 1px 3px rgba(15, 23, 42, 0.02)',
      elevation2: '0 8px 24px rgba(15, 23, 42, 0.07), 0 2px 6px rgba(15, 23, 42, 0.04)',
      elevation3: '0 16px 40px rgba(15, 23, 42, 0.12), 0 4px 12px rgba(15, 23, 42, 0.08)',
      listSeparator: 'inset 0 -1px 0 #E2E8F0',
      none: 'none'
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
