import React, { useState, useEffect, lazy, Suspense } from 'react';
import { injectGlobalStyles, styled, keyframes } from './styles/theme';
import TabBar from './components/TabBar';
import LineaSku from './components/LineaSku';
import { initializeConnectivityGuard } from './skills/state-connectivity-guard';
import { triggerNativeHapticFeedback } from './skills/capacitor-android-bridge';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db, endLineParoTransaction, syncServerTimeOffset } from './services/apiService';
import { logoutUser, getToken } from './services/authService';

import LoginScreen from './components/LoginScreen';
import RelevosNotificaciones from './components/RelevosNotificaciones';
import { StopTimerProvider, useStopTimer } from './components/StopTimerContext';

// Tree-shaking de DevConsole en build de producción
const DevConsole = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV)
  ? lazy(() => import('./dev/DevConsole'))
  : null;

// División del bundle (AUDIT_REPORT.md B-8): PanelCoordinador y HudPlanta
// nunca se renderizan a la vez -dependen de userRole, mutuamente
// excluyente-, así que no hace falta que ambos vayan en el chunk inicial.
// Un Supervisor nunca descarga el código del panel del Coordinador y
// viceversa.
const PanelCoordinador = lazy(() => import('./components/PanelCoordinador'));
const HudPlanta = lazy(() => import('./components/HudPlanta'));

// Fallback de carga mientras se descarga el chunk perezoso de PanelCoordinador
// o HudPlanta (solo se ve una vez por sesión, mientras dura la descarga).
function LazyLoadFallback() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '40vh', color: '#64748B', fontFamily: 'sans-serif', fontSize: '13px' }}>
      Cargando…
    </div>
  );
}

// --- STITCHES STYLED LAYOUT CONTAINERS ---

// Contenedor principal de la aplicación con padding superior para barra de estado del sistema (Notch)
const AppViewport = styled('div', {
  minHeight: '100vh',
  backgroundColor: '$background',
  position: 'relative',
  boxSizing: 'border-box',
  overflowX: 'hidden',
  paddingTop: 'env(safe-area-inset-top, 0px)'
});

// Contenedor de contenido scrollable arriba de la TabBar (64px + safe area bottom)
const MainContent = styled('main', {
  width: '100%',
  maxWidth: '800px', // Ergonomía móvil/tableta
  margin: '0 auto',
  minHeight: 'calc(100vh - (64px + env(safe-area-inset-bottom, 0px)))',
  paddingBottom: 'calc(64px + env(safe-area-inset-bottom, 0px) + 24px)', // Reserve safe space so scrollable content doesn't collide with the fixed TabBar
  boxSizing: 'border-box'
});

const StickyBannerContainer = styled('div', {
  position: 'sticky',
  top: 0,
  zIndex: 1500,
  display: 'flex',
  flexDirection: 'column',
  width: '100%'
});

// Keyframes y componentes para la UX e indicadores de estado
const pulseDotGreen = keyframes({
  '0%, 100%': { transform: 'scale(1)', opacity: 1 },
  '50%': { transform: 'scale(1.25)', opacity: 0.6 }
});

const pulseDotRed = keyframes({
  '0%, 100%': { transform: 'scale(1)', opacity: 1 },
  '50%': { transform: 'scale(1.3)', opacity: 0.5 }
});

const pulseBlinkRed = keyframes({
  '0%, 100%': { backgroundColor: '#DC2626' },
  '50%': { backgroundColor: '#EF4444' }
});

const ConnectivityIndicator = styled('div', {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '5px',
  fontSize: '10px',
  fontWeight: 600,
  padding: '2px 8px',
  borderRadius: '6px',
  fontFamily: '$sans',
  border: '1px solid',
  transition: 'all 0.25s ease',
  
  variants: {
    offline: {
      true: {
        color: '#EF4444',
        backgroundColor: '#FEE2E2',
        borderColor: '#FCA5A5'
      },
      false: {
        color: '#16A34A',
        backgroundColor: '#DCFCE7',
        borderColor: '#86EFAC'
      }
    }
  }
});

const StatusDot = styled('span', {
  width: '6px',
  height: '6px',
  borderRadius: '50%',
  display: 'inline-block',
  flexShrink: 0,
  
  variants: {
    offline: {
      true: {
        backgroundColor: '#EF4444'
      },
      false: {
        backgroundColor: '#16A34A'
      }
    }
  }
});

const ConfirmationOverlay = styled('div', {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(15, 23, 42, 0.6)',
  backdropFilter: 'blur(6px)',
  zIndex: 2000, // Por encima de todo
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '20px'
});

const ConfirmationContent = styled('div', {
  width: '100%',
  maxWidth: '360px',
  backgroundColor: '$card',
  borderRadius: '16px',
  boxShadow: '0 12px 48px rgba(15, 23, 42, 0.2)',
  padding: '24px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  textAlign: 'center',
  gap: '16px',
  boxSizing: 'border-box',
  fontFamily: '$sans'
});

const AlertTitle = styled('h3', {
  fontSize: '16px',
  fontWeight: 700,
  color: '$textPrimary',
  marginTop: '2px'
});

const AlertMessage = styled('p', {
  fontSize: '13px',
  color: '$textSecondary',
  lineHeight: 1.5
});

const ButtonGroup = styled('div', {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  width: '100%'
});

const ActionButton = styled('button', {
  width: '100%',
  padding: '12px 14px',
  border: 'none',
  borderRadius: '8px',
  fontSize: '13px',
  fontWeight: 700,
  cursor: 'pointer',
  transition: 'all 0.15s ease',
  boxSizing: 'border-box',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  gap: '6px',
  fontFamily: '$sans',
  
  variants: {
    variant: {
      primary: {
        backgroundColor: '$accent',
        color: '#FFFFFF',
        '&:hover': {
          backgroundColor: '#1D4ED8'
        }
      },
      danger: {
        backgroundColor: '#EF4444',
        color: '#FFFFFF',
        '&:hover': {
          backgroundColor: '#DC2626'
        }
      },
      secondary: {
        backgroundColor: '#F1F5F9',
        color: '$textPrimary',
        border: '1px solid #CBD5E1',
        '&:hover': {
          backgroundColor: '#E2E8F0'
        }
      }
    }
  }
});

// Banner superior informativo del estado sin red con padding regular
const OfflineBanner = styled('div', {
  backgroundColor: '#EF4444',
  color: '#FFFFFF',
  padding: '10px 12px',
  fontSize: '11px',
  fontWeight: 700,
  textAlign: 'center',
  fontFamily: '$sans',
  boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px'
});

const StickyTimerBanner = styled('div', {
  backgroundColor: '#DC2626', // Industrial Red
  color: '#FFFFFF',
  padding: '10px 12px',
  fontSize: '11px',
  fontWeight: 700,
  textAlign: 'center',
  fontFamily: '$sans',
  boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px',
  borderBottom: '2px solid #B91C1C'
});

// Cabecera compacta del portal del supervisor con perfil y cierre de terminal
const PortalHeader = styled('header', {
  width: '100%',
  maxWidth: '800px',
  margin: '0 auto',
  height: '52px', // Altura fija de alta densidad
  padding: '0 16px',
  backgroundColor: '$card',
  borderBottom: '1px solid $border',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  fontFamily: '$sans',
  boxSizing: 'border-box',
  zIndex: 1100,
  position: 'sticky',
  top: 0
});

const SupervisorProfile = styled('div', {
  display: 'flex',
  alignItems: 'center',
  gap: '10px'
});

const SupervisorAvatar = styled('img', {
  width: '28px',
  height: '28px',
  borderRadius: '50%',
  border: '1px solid $border',
  backgroundColor: '$background'
});

const SupervisorInfo = styled('div', {
  display: 'flex',
  flexDirection: 'column',
  gap: '0px'
});

const SupervisorName = styled('span', {
  fontSize: '$fonts$sizeSecondary',
  fontWeight: 600,
  color: '$textPrimary',
  lineHeight: 1.2
});

const LineTag = styled('span', {
  fontSize: '$fonts$sizeMeta',
  fontWeight: 500,
  color: '$textSecondary',
  lineHeight: 1.2
});

const LogoutButton = styled('button', {
  background: 'none',
  border: 'none',
  outline: 'none',
  padding: '0',
  borderRadius: '6px',
  color: '$textSecondary',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '28px',
  height: '28px',
  transition: 'all 0.2s',
  boxSizing: 'border-box',

  '&:hover': {
    color: '$textPrimary',
    backgroundColor: '$surfaceHover'
  },
  '&:active': {
    transform: 'scale(0.95)'
  }
});

// --- MAIN APPLICATION INTEGRATION ---

export default function App() {
  // Inyectar estilos CSS globales al inicio de la carga del DOM
  injectGlobalStyles();

  // 1. Estados principales (Sesión, Navegación, Conectividad)
  // Sólo confiar en la identidad de localStorage si además hay un token de sesión
  // vigente (sessionStorage, vía authService.getToken()). Antes se leía localStorage
  // sin verificar el token: tras un logout automático por 401/403
  // (coordinatorApi.js fetchWithAuth), la identidad seguía en localStorage y el
  // bloqueo de "sin sesión" (más abajo) nunca se activaba, produciendo un bucle
  // 401 → logout → reload (ver AUDIT_REPORT C-5).
  const hasValidSession = getToken() !== null;
  const [supervisorName, setSupervisorName] = useState(hasValidSession ? (localStorage.getItem("supervisorName") || "") : "");
  const [supervisorLineId, setSupervisorLineId] = useState(hasValidSession ? (localStorage.getItem("supervisorLineId") || "") : "");
  const [userRole, setUserRole] = useState(hasValidSession ? (localStorage.getItem("userRole") || "SUPERVISOR") : "SUPERVISOR");
  const [currentTab, setCurrentTab] = useState('HUD'); // 'HUD' | 'PERSONAL_SKU' | 'RELEVOS'
  const [isOffline, setIsOffline] = useState(false);
  const [pathname, setPathname] = useState(window.location.pathname);

  // 2. Monitorear cambios de ruta para enrutamiento del DevConsole
  // Antes sondeaba window.location.pathname cada 500ms además de escuchar
  // popstate (AUDIT_REPORT.md B-5): popstate ya cubre toda la navegación
  // real del navegador (atrás/adelante) y esta app no usa pushState en
  // ningún otro punto, así que el pathname solo cambia por una carga de
  // página completa -en cuyo caso useState ya lo lee bien al montar- o por
  // popstate. El polling era puro gasto de CPU sin ningún caso que cubriera.
  useEffect(() => {
    const handleLocationChange = () => {
      setPathname(window.location.pathname);
    };

    window.addEventListener('popstate', handleLocationChange);

    return () => {
      window.removeEventListener('popstate', handleLocationChange);
    };
  }, []);

  // 3. Distribución del Estado de Conectividad (Offline Guard)
  useEffect(() => {
    initializeConnectivityGuard((onlineStatus) => {
      setIsOffline(!onlineStatus);
    });
    // Sincronizar offset del reloj de servidor al arrancar
    syncServerTimeOffset();
  }, []);

  // 4. Salida / Cierre de sesión de Terminal
  const handleLogout = async () => {
    triggerNativeHapticFeedback('short');
    try {
      await logoutUser();
    } catch (e) {
      console.warn("[App] Error al cerrar sesión en Auth:", e.message);
    }
    localStorage.removeItem("supervisorName");
    localStorage.removeItem("supervisorLineId");
    localStorage.removeItem("userRole");
    setSupervisorName("");
    setSupervisorLineId("");
    setUserRole("SUPERVISOR");
  };

  // 5. ENRUTAMIENTO DEL TEST HARNESS (/dev-console) - Excluido de producción vía tree-shaking
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV && pathname === '/dev-console' && DevConsole) {
    return (
      <AppViewport id="qa-test-harness-viewport">
        {isOffline && (
          <StickyBannerContainer>
            <OfflineBanner id="offline-emergency-banner">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '6px'}}>
                <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
                <line x1="12" y1="9" x2="12" y2="13"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              <span>MODO DE ESTRÉS: TERMINAL OFFLINE SIMULADA</span>
            </OfflineBanner>
          </StickyBannerContainer>
        )}
        <Suspense fallback={<div style={{ padding: 20, color: '#38BDF8', fontFamily: 'sans-serif' }}>Cargando Test Harness...</div>}>
          <DevConsole />
        </Suspense>
      </AppViewport>
    );
  }

  // 6. BLOQUEO DE ACCESO SI NO HAY SESIÓN ACTIVA (Login/Línea)
  if (!supervisorName || !supervisorLineId) {
    return (
      <LoginScreen 
        onLoginSuccess={(name, line, role) => {
          setSupervisorName(name);
          setSupervisorLineId(line);
          setUserRole(role || "SUPERVISOR");
        }} 
      />
    );
  }

  // 6.5 REDIRECCIÓN ADAPTATIVA PARA EL COORDINADOR GENERAL
  if (userRole === "COORDINADOR") {
    return (
      <AppViewport id="coordinator-portal-viewport">
        <Suspense fallback={<LazyLoadFallback />}>
          <PanelCoordinador
            coordinatorName={supervisorName}
            onLogout={handleLogout}
            isOffline={isOffline}
          />
        </Suspense>
      </AppViewport>
    );
  }

  // 7. RENDERIZADO DEL FLUJO COMPLETO DEL SUPERVISOR EN PLANTA
  return (
    <SupervisorPortalWrapper 
      supervisorName={supervisorName}
      supervisorLineId={supervisorLineId}
      isOffline={isOffline}
      handleLogout={handleLogout}
      currentTab={currentTab}
      setCurrentTab={setCurrentTab}
    />
  );
}

function SupervisorPortalWrapper({ supervisorName, supervisorLineId, isOffline, handleLogout, currentTab, setCurrentTab }) {
  return (
    <StopTimerProvider supervisorLineId={supervisorLineId}>
      <SupervisorPortal 
        supervisorName={supervisorName}
        supervisorLineId={supervisorLineId}
        isOffline={isOffline}
        handleLogout={handleLogout}
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
      />
    </StopTimerProvider>
  );
}

function SupervisorPortal({ supervisorName, supervisorLineId, isOffline, handleLogout, currentTab, setCurrentTab }) {
  const { activeParo, elapsedSeconds, formattedTime } = useStopTimer();
  const [showParoReminder, setShowParoReminder] = useState(false);
  const [lastConfirmedPeriod, setLastConfirmedPeriod] = useState(0);

  const currentPeriod = Math.floor(elapsedSeconds / 1800); // 30 minutos = 1800s

  useEffect(() => {
    if (!activeParo) {
      setShowParoReminder(false);
      setLastConfirmedPeriod(0);
      return;
    }
    // Si pasaron 30 min y no hemos confirmado este periodo, mostramos el aviso
    if (currentPeriod > 0 && currentPeriod > lastConfirmedPeriod) {
      setShowParoReminder(true);
      triggerNativeHapticFeedback('warning');
    }
  }, [elapsedSeconds, activeParo, currentPeriod, lastConfirmedPeriod]);

  const handleEndParoGlobal = async () => {
    if (!activeParo || !supervisorLineId) return;
    try {
      await endLineParoTransaction(supervisorLineId);
      setShowParoReminder(false);
      triggerNativeHapticFeedback('confirm');
    } catch (err) {
      console.error("Error al finalizar el paro desde banner global:", err);
    }
  };

  const handleKeepParo = () => {
    setLastConfirmedPeriod(currentPeriod);
    setShowParoReminder(false);
    triggerNativeHapticFeedback('short');
  };

  return (
    <AppViewport id="supervisor-portal-viewport">
      <StickyBannerContainer>
        {/* Banner de emergencia offline superior */}
        {isOffline && (
          <OfflineBanner id="offline-emergency-banner">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '6px'}}>
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <span>Modo Fuera de Línea Activo ── Transferencias bloqueadas. Sincronización pendiente.</span>
          </OfflineBanner>
        )}

        {/* Banner flotante global de Paro Técnico persistente */}
        {activeParo && (
          <StickyTimerBanner 
            id="active-paro-global-banner"
            style={elapsedSeconds >= 1800 ? {
              animation: `${pulseBlinkRed} 2s infinite ease-in-out`,
              backgroundColor: '#EF4444'
            } : {}}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" style={{ marginRight: '4px' }}>
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <span>
              {elapsedSeconds >= 1800 ? '⚠️ DETENCIÓN PROLONGADA DETECTADA: ' : 'PARO EN LÍNEA: '}
              {activeParo.category} ({activeParo.cause.replaceAll('_', ' ')}) ── CRONÓMETRO: {formattedTime}
            </span>
          </StickyTimerBanner>
        )}
      </StickyBannerContainer>

      {/* Cabecera global del portal del supervisor */}
      <PortalHeader id="global-portal-header">
        <SupervisorProfile>
          <SupervisorAvatar 
            src={`https://api.dicebear.com/7.x/initials/svg?seed=${supervisorName}`} 
            alt={supervisorName} 
          />
          <SupervisorInfo>
            <SupervisorName>{supervisorName}</SupervisorName>
            <LineTag>Línea {supervisorLineId} {supervisorLineId === "L8" ? "(Bolsón)" : ""}</LineTag>
          </SupervisorInfo>
        </SupervisorProfile>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Indicador de red dinámico tipo semáforo */}
          <ConnectivityIndicator offline={isOffline} id="global-connectivity-indicator">
            <StatusDot offline={isOffline} />
            <span>{isOffline ? "Offline" : "Online"}</span>
          </ConnectivityIndicator>
          
          <LogoutButton 
            onClick={handleLogout} 
            title="Cerrar sesión de terminal"
            id="global-logout-button"
          >
            {/* Logout SVG Icon */}
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </LogoutButton>
        </div>
      </PortalHeader>

      {/* Contenedor principal de pestañas reactivas */}
      <MainContent>
        {currentTab === 'HUD' && (
          <Suspense fallback={<LazyLoadFallback />}>
            <HudPlanta supervisorLineId={supervisorLineId} />
          </Suspense>
        )}
        
        {currentTab === 'PERSONAL_SKU' && (
          <LineaSku supervisorLineId={supervisorLineId} />
        )}

        {currentTab === 'RELEVOS' && (
          <RelevosNotificaciones supervisorLineId={supervisorLineId} />
        )}
      </MainContent>

      {/* Tab Bar de Navegación inferior fija de 64px (Thumb Zone) */}
      <TabBar 
        currentTab={currentTab} 
        onTabChange={setCurrentTab} 
      />

      {/* 🔴 DIÁLOGO DE CONFIRMACIÓN DE PARO PROLONGADO */}
      {showParoReminder && activeParo && (
        <ConfirmationOverlay id="paro-reminder-overlay">
          <ConfirmationContent onClick={(e) => e.stopPropagation()}>
            <div style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              backgroundColor: '#FEE2E2',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#EF4444',
              marginBottom: '8px'
            }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
                <line x1="12" y1="9" x2="12" y2="13"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
            </div>
            <div>
              <AlertTitle>Alerta de Paro Técnico Prolongado</AlertTitle>
              <AlertMessage style={{ marginTop: '8px' }}>
                La línea ha estado detenida en la categoría <strong>{activeParo.category}</strong> por más de 30 minutos (Transcurrido: {formattedTime}).
              </AlertMessage>
              <AlertMessage style={{ marginTop: '8px', fontWeight: 600, color: '#1E293B' }}>
                ¿La línea física sigue detenida?
              </AlertMessage>
            </div>
            <ButtonGroup>
              <ActionButton variant="secondary" onClick={handleKeepParo} id="confirm-keep-paro-btn">
                Sí, continuar en Paro
              </ActionButton>
              <ActionButton variant="danger" onClick={handleEndParoGlobal} id="confirm-end-paro-btn">
                No, reanudar producción ahora
              </ActionButton>
            </ButtonGroup>
          </ConfirmationContent>
        </ConfirmationOverlay>
      )}
    </AppViewport>
  );
}
