import React from 'react';
import { styled } from '../styles/theme';

// Contenedor principal de la Tab Bar (Aspecto traslúcido glassmorphism de alta gama)
const NavContainer = styled('nav', {
  position: 'fixed',
  bottom: 0,
  left: 0,
  right: 0,
  height: 'calc($navbarHeight + env(safe-area-inset-bottom, 0px))',
  backgroundColor: 'rgba(255, 255, 255, 0.9)', // Glassmorphism
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  borderTop: '1px solid rgba(226, 232, 240, 0.8)',
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-around',
  boxShadow: '0 -6px 20px rgba(15, 23, 42, 0.03), 0 -1px 3px rgba(15, 23, 42, 0.01)',
  zIndex: 1000,
  boxSizing: 'border-box',
  padding: '0 16px',
  paddingBottom: 'env(safe-area-inset-bottom, 0px)'
});

// Botón individual de navegación (Optimizado para toques accidentales)
const NavItem = styled('button', {
  background: 'none',
  border: 'none',
  outline: 'none',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  height: '$navbarHeight', // Estricto a 64px interactivo
  flex: 1,
  color: '$textSecondary',
  cursor: 'pointer',
  fontFamily: '$sans',
  fontSize: '10px',
  letterSpacing: '0.015em',
  fontWeight: 600,
  position: 'relative',
  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
  gap: '4px',
  minWidth: 0,
  overflow: 'hidden',

  '&:active': {
    transform: 'scale(0.93)' // Efecto de clic nativo
  },

  variants: {
    active: {
      true: {
        color: '$accent',
        fontWeight: 700
      }
    }
  }
});

// Pastilla activa al estilo Android MD3
const IconWrapper = styled('div', {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '24px',
  width: '24px',
  color: '$textSecondary',
  transition: 'color 0.2s ease, transform 0.2s ease',

  variants: {
    active: {
      true: {
        color: '$accent',
        transform: 'scale(1.05)'
      }
    }
  }
});

// --- COMPONENT IMPLEMENTATION ---

/**
 * TabBar Component - Barra de navegación inferior rígida (64px) optimizada para el pulgar (Thumb Zone)
 * Estética: Vectorial Premium SaaS Light. Prohibido el uso de emojis.
 * 
 * @param {string} currentTab Tab actualmente activa ('HUD' | 'PERSONAL_SKU' | 'RELEVOS')
 * @param {function} onTabChange Callback gatillado al cambiar de pestaña
 */
export default function TabBar({ currentTab, onTabChange }) {
  return (
    <NavContainer id="bottom-navigation-bar">
      <NavItem 
        id="tab-hud-button"
        active={currentTab === 'HUD'} 
        onClick={() => onTabChange && onTabChange('HUD')}
      >
        <IconWrapper active={currentTab === 'HUD'}>
          {/* Dashboard Vectorial SVG */}
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <rect width="7" height="9" x="3" y="3" rx="1.5"/>
            <rect width="7" height="5" x="14" y="3" rx="1"/>
            <rect width="7" height="9" x="14" y="12" rx="1.5"/>
            <rect width="7" height="5" x="3" y="16" rx="1"/>
          </svg>
        </IconWrapper>
        <span>HUD Planta</span>
      </NavItem>
      
      <NavItem 
        id="tab-sku-button"
        active={currentTab === 'PERSONAL_SKU'} 
        onClick={() => onTabChange && onTabChange('PERSONAL_SKU')}
      >
        <IconWrapper active={currentTab === 'PERSONAL_SKU'}>
          {/* Package Vectorial SVG */}
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/>
            <path d="m3.3 7 8.7 5 8.7-5"/>
            <path d="M12 22V12"/>
          </svg>
        </IconWrapper>
        <span>Línea y SKU</span>
      </NavItem>

      <NavItem 
        id="tab-relevos-button"
        active={currentTab === 'RELEVOS'} 
        onClick={() => onTabChange && onTabChange('RELEVOS')}
      >
        <IconWrapper active={currentTab === 'RELEVOS'}>
          {/* Rotation Cycle Vectorial SVG */}
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21.5 2v6h-6"/>
            <path d="M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
          </svg>
        </IconWrapper>
        <span>Relevos</span>
      </NavItem>
    </NavContainer>
  );
}
