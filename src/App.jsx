import React, { useState, useEffect } from 'react';
import { injectGlobalStyles, styled } from './styles/theme';
import TabBar from './components/TabBar';
import HudPlanta from './components/HudPlanta';
import MiPersonal from './components/MiPersonal';
import LineaSku from './components/LineaSku';
import DevConsole from './dev/DevConsole';
import { initializeConnectivityGuard } from './skills/state-connectivity-guard';
import { triggerNativeHapticFeedback } from './skills/capacitor-android-bridge';

import LoginScreen from './components/LoginScreen';
import PanelCoordinador from './components/PanelCoordinador';
import RelevosNotificaciones from './components/RelevosNotificaciones';
import { StopTimerProvider, useStopTimer } from './components/StopTimerContext';

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
  padding: '12px 20px',
  backgroundColor: '$card',
  borderBottom: '1px solid $border',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  fontFamily: '$sans',
  boxSizing: 'border-box',
  zIndex: 1100,
  position: 'relative'
});

const SupervisorProfile = styled('div', {
  display: 'flex',
  alignItems: 'center',
  gap: '10px'
});

const SupervisorAvatar = styled('img', {
  width: '32px',
  height: '32px',
  borderRadius: '50%',
  border: '2px solid $accent',
  backgroundColor: '$background'
});

const SupervisorInfo = styled('div', {
  display: 'flex',
  flexDirection: 'column'
});

const SupervisorName = styled('span', {
  fontSize: '12px',
  fontWeight: 700,
  color: '$textPrimary'
});

const LineTag = styled('span', {
  fontSize: '10px',
  fontWeight: 600,
  color: '$textSecondary'
});

const LogoutButton = styled('button', {
  background: 'none',
  border: 'none',
  outline: 'none',
  padding: '6px',
  borderRadius: '8px',
  color: '$textSecondary',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: '44px',
  minHeight: '44px',
  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',

  '&:hover': {
    color: '#EF4444',
    backgroundColor: '$dangerBg'
  },
  '&:active': {
    transform: 'scale(0.92)'
  }
});

// --- MAIN APPLICATION INTEGRATION ---

export default function App() {
  // Inyectar estilos CSS globales al inicio de la carga del DOM
  injectGlobalStyles();

  // 1. Estados principales (Sesión, Navegación, Conectividad)
  const [supervisorName, setSupervisorName] = useState(localStorage.getItem("supervisorName") || "");
  const [supervisorLineId, setSupervisorLineId] = useState(localStorage.getItem("supervisorLineId") || "");
  const [userRole, setUserRole] = useState(localStorage.getItem("userRole") || "SUPERVISOR");
  const [currentTab, setCurrentTab] = useState('HUD'); // 'HUD' | 'PERSONAL' | 'PERSONAL_SKU'
  const [isOffline, setIsOffline] = useState(false);
  const [pathname, setPathname] = useState(window.location.pathname);

  // 2. Monitorear cambios de ruta para enrutamiento del DevConsole
  useEffect(() => {
    const handleLocationChange = () => {
      setPathname(window.location.pathname);
    };

    window.addEventListener('popstate', handleLocationChange);
    
    const routeInterval = setInterval(() => {
      if (window.location.pathname !== pathname) {
        setPathname(window.location.pathname);
      }
    }, 500);

    return () => {
      window.removeEventListener('popstate', handleLocationChange);
      clearInterval(routeInterval);
    };
  }, [pathname]);

  // 3. Distribución del Estado de Conectividad (Offline Guard)
  useEffect(() => {
    initializeConnectivityGuard((onlineStatus) => {
      setIsOffline(!onlineStatus);
    });
  }, []);

  // 4. Salida / Cierre de sesión de Terminal
  const handleLogout = () => {
    triggerNativeHapticFeedback('short');
    localStorage.removeItem("supervisorName");
    localStorage.removeItem("supervisorLineId");
    localStorage.removeItem("userRole");
    setSupervisorName("");
    setSupervisorLineId("");
    setUserRole("SUPERVISOR");
  };

  // 5. ENRUTAMIENTO DEL TEST HARNESS (/dev-console)
  if (pathname === '/dev-console') {
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
        <DevConsole />
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
        <PanelCoordinador 
          coordinatorName={supervisorName} 
          onLogout={handleLogout} 
          isOffline={isOffline}
        />
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
  const { activeParo, formattedTime } = useStopTimer();

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
          <StickyTimerBanner id="active-paro-global-banner">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" style={{ marginRight: '4px' }}>
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <span>
              PARO EN LÍNEA: {activeParo.category} ({activeParo.cause}) ── CRONÓMETRO: {formattedTime}
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
      </PortalHeader>

      {/* Contenedor principal de pestañas reactivas */}
      <MainContent>
        {currentTab === 'HUD' && (
          <HudPlanta supervisorLineId={supervisorLineId} />
        )}
        
        {currentTab === 'PERSONAL' && (
          <MiPersonal supervisorLineId={supervisorLineId} />
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
    </AppViewport>
  );
}
