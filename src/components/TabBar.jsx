import React from 'react';
import { styled } from '../styles/theme';

// Contenedor principal de la Tab Bar (rígido a 64px + safe area bottom, fondo blanco y borde superior)
const NavContainer = styled('nav', {
  position: 'fixed',
  bottom: 0,
  left: 0,
  right: 0,
  height: 'calc($navbarHeight + env(safe-area-inset-bottom, 0px))',
  backgroundColor: '$card',
  borderTop: '1px solid $border',
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-around',
  boxShadow: '0 -4px 16px rgba(15, 23, 42, 0.04), 0 -1px 2px rgba(15, 23, 42, 0.02)',
  zIndex: 1000,
  boxSizing: 'border-box',
  padding: '0 24px',
  paddingBottom: 'env(safe-area-inset-bottom, 0px)'
});

// Botón individual de navegación
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
  letterSpacing: '0.01em',
  fontWeight: 600,
  position: 'relative',
  transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
  gap: '3px',
  minWidth: 0,
  overflow: 'hidden',

  '&:active': {
    transform: 'scale(0.95)'
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

const IconWrapper = styled('div', {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '32px',
  width: '56px',
  borderRadius: '16px',
  transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
  color: '$textSecondary',

  variants: {
    active: {
      true: {
        backgroundColor: '#DBEAFE',
        color: '$accent'
      }
    }
  }
});

// --- COMPONENT IMPLEMENTATION ---

/**
 * TabBar Component - Barra de navegación inferior rígida (64px) optimizada para el pulgar (Thumb Zone)
 * Estética: Vectorial Premium SaaS Light. Prohibido el uso de emojis.
 * 
 * @param {string} currentTab Tab actualmente activa ('HUD' | 'PERSONAL' | 'PERSONAL_SKU')
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
        id="tab-personal-button"
        active={currentTab === 'PERSONAL'} 
        onClick={() => onTabChange && onTabChange('PERSONAL')}
      >
        <IconWrapper active={currentTab === 'PERSONAL'}>
          {/* Users Vectorial SVG */}
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
            <circle cx="19" cy="8" r="3" />
          </svg>
        </IconWrapper>
        <span>Mi Personal</span>
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
