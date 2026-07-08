import React, { useState, useEffect, useMemo, useRef } from 'react';
import { styled } from '../styles/theme';
import { 
  db, 
  puestosColl, 
  trabajadoresColl,
  assignWorkerTransaction,
  acceptErgonomicRelevo,
  acceptReturnToBolson,
  executeLocalSwapTransaction,
  releaseWorkerTransaction,
  tempBajaWorkerTransaction,
  confirmTransitWorkerArrival,
  dispatchWorkerToLine,
  requestErgonomicRelevo,
  getSlotsForSku,
  initializeTurnoWithSheets,
  getProgramaProduccionPorFecha,
  canWorkerOccupiedSlot,
  initializeSingleLineTransaction,
  startLineOfficially,
  autoAssignFixedOperators,
  getRelocationDestination,
  transitionLineToSku,
  getBestSuggestionsForSlot,
  updateWorkerDobleTurno,
  closeShiftForLineTransaction,
  registerSkuFinishedEvent
} from '../services/firebaseService';
import { onSnapshot, query, where, getDocs, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import SlotCard from './SlotCard';
import { initializeConnectivityGuard } from '../skills/state-connectivity-guard';
import { triggerNativeHapticFeedback, initializeRearCameraQRScanner } from '../skills/capacitor-android-bridge';
import { Capacitor } from '@capacitor/core';

// --- STITCHES STYLED HUD COMPONENTS ---

// Contenedor principal con espaciado superior normalizado y padding inferior de seguridad contra solapamientos de FAB
const HudContainer = styled('div', {
  padding: '16px 20px calc(128px + env(safe-area-inset-bottom, 0px)) 20px', // Mayor espacio inferior para que el FAB no tape nada
  display: 'flex',
  flexDirection: 'column',
  gap: '12px', // Reduced gap for a tighter layout
  fontFamily: '$sans',
  boxSizing: 'border-box'
});

const LineHeader = styled('div', {
  position: 'sticky',
  top: '52px', // Sticky right under the 52px PortalHeader
  zIndex: 100,
  height: '40px', // Reduced height for higher density
  display: 'flex',
  alignItems: 'center',
  padding: '0 12px',
  backgroundColor: '$card',
  borderBottom: '1px solid $border',
  boxShadow: '$subtle',
  boxSizing: 'border-box',
  overflowX: 'auto',
  whiteSpace: 'nowrap',
  WebkitOverflowScrolling: 'touch', // Fluid mobile horizontal scrolling
  msOverflowStyle: 'none',
  scrollbarWidth: 'none',
  '&::-webkit-scrollbar': {
    display: 'none'
  },
  margin: '-16px -20px 0px -20px', // Bottom margin set to 0px to eliminate the gap
  width: 'calc(100% + 40px)', // Edge-to-edge layout constraints
  maxWidth: 'calc(100% + 40px)',
  gap: '6px' // Tighter spacing for a native app feel
});

const HeaderBadge = styled('span', {
  fontSize: '9px', // Compact text
  fontWeight: 600,
  padding: '3px 6px', // Smaller padding
  borderRadius: '6px',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '3px',
  border: '1px solid $border',
  backgroundColor: '$background',
  color: '$textSecondary',
  boxShadow: '0 1px 2px rgba(0,0,0,0.01)',
  flexShrink: 0, // Prevent shrinking in the scrollable header

  variants: {
    variant: {
      sku: {
        backgroundColor: '$infoBg',
        color: '$accent',
        borderColor: '#BFDBFE'
      },
      coverage: {
        backgroundColor: '$successBg',
        color: '$successBorder',
        borderColor: '#BBF7D0'
      },
      shift: {
        backgroundColor: '#F1F5F9',
        color: '#475569',
        borderColor: '#E2E8F0'
      },
      network: {
        backgroundColor: '$successBg',
        color: '$successBorder',
        borderColor: '#BBF7D0'
      },
      networkOffline: {
        backgroundColor: '$dangerBg',
        color: '$dangerBorder',
        borderColor: '#FCA5A5'
      }
    }
  }
});

const LineTitle = styled('div', {
  fontSize: '15px',
  fontWeight: 700,
  color: '$textPrimary',
  display: 'flex',
  alignItems: 'center',
  gap: '10px'
});

const StatusIndicator = styled('span', {
  fontSize: '10px',
  fontWeight: 700,
  padding: '4px 10px',
  borderRadius: '20px',
  letterSpacing: '0.01em',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',

  variants: {
    online: {
      true: {
        backgroundColor: '$successBg',
        color: '$successBorder',
        border: '1px solid #BBF7D0'
      },
      false: {
        backgroundColor: '$dangerBg',
        color: '$dangerBorder',
        border: '1px solid #FCA5A5',
        animation: 'pulse 2s infinite'
      }
    }
  }
});

const StatusDot = styled('span', {
  width: '6px',
  height: '6px',
  borderRadius: '50%',
  display: 'inline-block',

  variants: {
    online: {
      true: {
        backgroundColor: '$successBorder'
      },
      false: {
        backgroundColor: '$dangerBorder'
      }
    }
  }
});

// --- SMART ACTION FEED (CENTRO DE ALERTAS DE ALTA PRIORIDAD) ---
const SmartActionFeedContainer = styled('div', {
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  width: '100%',
  animation: 'slideDown 0.4s cubic-bezier(0.16, 1, 0.3, 1)'
});

const ActionFeedCard = styled('div', {
  borderRadius: '14px',
  padding: '16px 20px',
  boxShadow: '$elevation1',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '16px',
  border: '1px solid $border',
  boxSizing: 'border-box',
  fontFamily: '$sans',
  transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',

  '&:active': {
    transform: 'scale(0.98)'
  },

  variants: {
    variant: {
      success: {
        backgroundColor: '$successBg',
        borderColor: '#BBF7D0',
        color: '$successBorder'
      },
      warning: {
        backgroundColor: '$warningBg',
        borderColor: '#FEF08A',
        color: '$warningBorder'
      },
      danger: {
        backgroundColor: '$dangerBg',
        borderColor: '#FCA5A5',
        color: '$dangerBorder'
      },
      transit: {
        backgroundColor: '$transitBg',
        borderColor: '#E9D5FF',
        color: '$transitBorder'
      }
    }
  }
});

const ActionFeedTitle = styled('div', {
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
  flex: 1,

  '& strong': {
    fontSize: '12.5px',
    color: '$textPrimary'
  },
  '& span': {
    fontSize: '11px',
    color: '$textSecondary',
    fontWeight: 500
  }
});

const ActionFeedButton = styled('button', {
  padding: '8px 16px',
  minHeight: '36px',
  border: 'none',
  borderRadius: '8px',
  fontSize: '11.5px',
  fontWeight: 700,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
  boxShadow: '0 2px 4px rgba(0,0,0,0.05)',

  '&:active': {
    transform: 'scale(0.94)'
  },

  variants: {
    variant: {
      success: {
        backgroundColor: '$successBorder',
        color: '#FFFFFF',
        '&:hover': { backgroundColor: '#16A34A' }
      },
      warning: {
        backgroundColor: '$warningBorder',
        color: '#FFFFFF',
        '&:hover': { backgroundColor: '#D97706' }
      },
      danger: {
        backgroundColor: '$dangerBorder',
        color: '#FFFFFF',
        '&:hover': { backgroundColor: '#DC2626' }
      },
      transit: {
        backgroundColor: '$transitBorder',
        color: '#FFFFFF',
        '&:hover': { backgroundColor: '#8B5CF6' }
      }
    }
  }
});

// Botón de Inicio Rápido (QR Continuo)
const FastOnboardingQRButton = styled('button', {
  fontSize: '9px', // Compact font
  fontWeight: 700,
  padding: '3px 8px', // Smaller padding
  borderRadius: '6px',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  border: '1px solid #C084FC',
  backgroundColor: '#F3E8FF',
  color: '#7E22CE',
  boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
  cursor: 'pointer',
  transition: 'all 0.15s ease',
  minHeight: '22px', // Compact minHeight
  flexShrink: 0, // Prevent shrinking in the scrollable header

  '&:hover': {
    backgroundColor: '#E9D5FF',
    borderColor: '#A855F7'
  },
  '&:active': {
    transform: 'scale(0.95)'
  }
});

// Botón para Cierre de Turno
const CerrarTurnoButton = styled('button', {
  fontSize: '9px',
  fontWeight: 700,
  padding: '3px 8px',
  borderRadius: '6px',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  border: '1px solid #F87171',
  backgroundColor: '#FEF2F2',
  color: '#991B1B',
  boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
  cursor: 'pointer',
  transition: 'all 0.15s ease',
  minHeight: '22px',
  flexShrink: 0,

  '&:hover': {
    backgroundColor: '#FEE2E2',
    borderColor: '#EF4444'
  },
  '&:active': {
    transform: 'scale(0.95)'
  }
});

// Componentes del switch / toggle switch para Doble Turno
const ToggleContainer = styled('label', {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '10px 14px',
  backgroundColor: '#F8FAFC',
  borderRadius: '8px',
  border: '1.5px solid #E2E8F0',
  cursor: 'pointer',
  userSelect: 'none',
  transition: 'all 0.15s ease',
  width: '100%',
  boxSizing: 'border-box',
  '&:hover': {
    borderColor: '#CBD5E1',
    backgroundColor: '#F1F5F9'
  }
});

const ToggleLabel = styled('span', {
  fontSize: '11px',
  fontWeight: 700,
  color: '#475569',
  textTransform: 'uppercase',
  fontFamily: '$sans'
});

const SwitchInput = styled('input', {
  opacity: 0,
  width: 0,
  height: 0,
  position: 'absolute',
  '&:checked + span': {
    backgroundColor: '#2563EB',
    '&:before': {
      transform: 'translateX(18px)'
    }
  }
});

const SwitchSlider = styled('span', {
  position: 'relative',
  display: 'inline-block',
  width: '38px',
  height: '20px',
  backgroundColor: '#CBD5E1',
  borderRadius: '20px',
  transition: '0.2s',
  '&:before': {
    position: 'absolute',
    content: '""',
    height: '14px',
    width: '14px',
    left: '3px',
    bottom: '3px',
    backgroundColor: 'white',
    borderRadius: '50%',
    transition: '0.2s'
  }
});

// Caja de Auditoría de Salud en Confirmación
const ConfirmationHealthBox = styled('div', {
  width: '100%',
  borderRadius: '8px',
  padding: '12px',
  fontSize: '11px',
  textAlign: 'left',
  boxSizing: 'border-box',
  
  variants: {
    hasRestrictions: {
      true: {
        backgroundColor: '$dangerBg',
        color: '$dangerBorder',
        border: '1px solid $dangerBorder'
      },
      false: {
        backgroundColor: '$successBg',
        color: '$successBorder',
        border: '1px solid $successBorder'
      }
    }
  }
});

// Sección exclusiva para despacho del Bolsón L8
const BolsonDeskContainer = styled('div', {
  backgroundColor: '$card',
  border: '1px solid $border',
  borderRadius: '12px',
  padding: '20px',
  display: 'flex',
  flexDirection: 'column',
  gap: '14px',
  boxShadow: '0 4px 6px -1px rgba(15, 23, 42, 0.03)'
});



const SlotsList = styled('div', {
  display: 'flex',
  flexDirection: 'column',
  gap: '16px',
  width: '100%'
});

const SlotsGroup = styled('div', {
  backgroundColor: '$card',
  borderRadius: '12px',
  border: '1px solid $border',
  boxShadow: '$elevation1',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
  width: '100%'
});

const SubSectionTitle = styled('h3', {
  height: '24px',
  fontSize: '$fonts$sizeMeta',
  fontWeight: '$fonts$weightBold',
  color: '$textSecondary',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  backgroundColor: 'transparent',
  padding: '4px 16px 4px 16px',
  margin: 0,
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  width: '100%',
  boxSizing: 'border-box'
});

const PreparationBanner = styled('div', {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '8px 12px',
  backgroundColor: '$warningBg',
  border: '1px solid $warningBorder',
  borderRadius: '8px',
  gap: '12px',
  boxSizing: 'border-box',
  width: '100%',
  marginBottom: '8px'
});

const PreparationBannerText = styled('div', {
  fontSize: '11px',
  color: '$warningBorder',
  fontWeight: 500,
  flex: 1,
  lineHeight: '1.3'
});

const PreparationBannerButton = styled('button', {
  padding: '6px 12px',
  backgroundColor: '$successBorder',
  backgroundImage: 'linear-gradient(135deg, $successBorder, #16A34A)',
  color: '#FFFFFF',
  border: 'none',
  borderRadius: '6px',
  fontSize: '11px',
  fontWeight: 700,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  transition: 'all 0.15s ease',
  boxShadow: '0 2px 4px rgba(22, 163, 74, 0.2)',

  '&:disabled': {
    backgroundColor: '#CBD5E1',
    backgroundImage: 'none',
    color: '#94A3B8',
    cursor: 'not-allowed',
    boxShadow: 'none'
  },
  '&:active': {
    transform: 'scale(0.95)'
  }
});

// Botón Flotante Circular (FAB) de 60px de diámetro con sombra de elevación nativa tipo Android MD3
const QRFloatingButton = styled('button', {
  position: 'fixed',
  right: '24px',
  bottom: 'calc(88px + env(safe-area-inset-bottom, 0px))', // Separación limpia sobre la TabBar y notch inferior
  width: '60px',
  height: '60px',
  borderRadius: '30px',
  backgroundColor: '$accent',
  backgroundImage: 'linear-gradient(135deg, $accent, #1D4ED8)', // Gradiente premium táctil
  color: '#FFFFFF',
  border: 'none',
  outline: 'none',
  boxShadow: '0 10px 25px -5px rgba(37, 99, 235, 0.4), 0 4px 10px -3px rgba(37, 99, 235, 0.2)', // Sombra de elevación tipo Android
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 990,
  transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',

  '&:hover': {
    backgroundImage: 'linear-gradient(135deg, #3B82F6, #1D4ED8)',
    transform: 'translateY(-3px) scale(1.06)',
    boxShadow: '0 12px 28px -5px rgba(37, 99, 235, 0.5), 0 6px 12px -3px rgba(37, 99, 235, 0.3)'
  },
  '&:active': {
    transform: 'translateY(0) scale(0.95)',
    boxShadow: '0 4px 10px rgba(37, 99, 235, 0.3)'
  }
});

// Modal del escáner con desenfoque de fondo premium
const ScannerOverlay = styled('div', {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(8, 15, 30, 0.96)',
  backdropFilter: 'blur(12px)',
  zIndex: 2000,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  color: '#FFFFFF',
  fontFamily: '$sans',
  overflow: 'hidden'
});

const ScannerHeaderBar = styled('div', {
  width: '100%',
  padding: '12px 16px 10px',
  backgroundColor: 'rgba(30, 41, 59, 0.85)',
  borderBottom: '1px solid rgba(148, 163, 184, 0.15)',
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  boxSizing: 'border-box',
  flexShrink: 0,
  paddingTop: 'calc(12px + env(safe-area-inset-top, 0px))'
});

const ScannerProgressBar = styled('div', {
  width: '100%',
  height: '6px',
  borderRadius: '3px',
  backgroundColor: 'rgba(148, 163, 184, 0.2)',
  overflow: 'hidden',
  position: 'relative'
});

const ScannerProgressFill = styled('div', {
  height: '100%',
  borderRadius: '3px',
  backgroundImage: 'linear-gradient(90deg, #22C55E 0%, #16A34A 50%, #15803D 100%)',
  transition: 'width 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
  boxShadow: '0 0 8px rgba(34, 197, 94, 0.4)'
});

const ScannerBody = styled('div', {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  width: '100%',
  padding: '16px',
  boxSizing: 'border-box',
  overflowY: 'auto'
});

const ScannerWindow = styled('div', {
  width: '260px',
  height: '260px',
  border: '3px solid rgba(59, 130, 246, 0.6)',
  borderRadius: '20px',
  position: 'relative',
  boxShadow: '0 0 40px rgba(59, 130, 246, 0.15), inset 0 0 20px rgba(0,0,0,0.1)',
  marginBottom: '20px',
  overflow: 'hidden',
  backgroundColor: 'rgba(0, 0, 0, 0.3)',

  '&::after': {
    content: '""',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    border: '10px solid rgba(8, 15, 30, 0.4)',
    borderRadius: '17px',
    pointerEvents: 'none'
  },

  '&::before': {
    content: '""',
    position: 'absolute',
    left: '10%',
    right: '10%',
    height: '2px',
    backgroundColor: '#3B82F6',
    boxShadow: '0 0 12px rgba(59, 130, 246, 0.6)',
    animation: 'scanLine 2s infinite linear',
    zIndex: 2
  }
});

const ScannerCloseButton = styled('button', {
  padding: '14px 32px',
  backgroundColor: 'rgba(51, 65, 85, 0.8)',
  color: '#FFFFFF',
  border: '1px solid rgba(148, 163, 184, 0.2)',
  borderRadius: '12px',
  fontSize: '13px',
  fontWeight: 700,
  cursor: 'pointer',
  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)',
  transition: 'all 0.15s ease',
  marginBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))',

  '&:active': {
    transform: 'scale(0.96)',
    backgroundColor: 'rgba(71, 85, 105, 0.9)'
  }
});

// Retroalimentación visual premium dentro del escáner QR
const FeedbackCard = styled('div', {
  width: '92%',
  maxWidth: '380px',
  backgroundColor: '#FFFFFF',
  borderRadius: '24px',
  padding: '28px 24px 24px',
  boxShadow: '0 20px 60px rgba(0, 0, 0, 0.4)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  color: '$textPrimary',
  boxSizing: 'border-box',
  overflowY: 'auto',
  fontFamily: '$sans',
  maxHeight: '80vh',
  animation: 'feedbackSlideIn 0.3s ease-out'
});

const FeedbackHeader = styled('div', {
  width: '100%',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '10px',
  textAlign: 'center',
  marginBottom: '16px'
});

const FeedbackTitle = styled('h4', {
  fontSize: '18px',
  fontWeight: 800,
  margin: 0,
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  letterSpacing: '-0.3px',
  
  variants: {
    status: {
      success: { color: '#16A34A' },
      error: { color: '#DC2626' },
      incompatible: { color: '#D97706' },
      confirm: { color: '$accent' }
    }
  }
});

const FeedbackAvatar = styled('img', {
  width: '56px',
  height: '56px',
  borderRadius: '50%',
  backgroundColor: '#F1F5F9',
  border: '3px solid #E2E8F0',
  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)'
});

const FeedbackInfo = styled('div', {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  textAlign: 'center',
  width: '100%',
  borderBottom: '1px solid #F1F5F9',
  paddingBottom: '16px',
  marginBottom: '16px'
});

const FeedbackDiagnosticsContainer = styled('div', {
  width: '100%',
  maxHeight: '200px',
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
  paddingRight: '4px',
  marginBottom: '16px',
  boxSizing: 'border-box'
});

const FeedbackActionGroup = styled('div', {
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
  width: '100%',
  marginTop: 'auto'
});

const FeedbackButton = styled('button', {
  width: '100%',
  height: '50px',
  borderRadius: '12px',
  border: 'none',
  fontSize: '14px',
  fontWeight: 700,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px',
  transition: 'all 0.15s ease',
  boxSizing: 'border-box',
  fontFamily: '$sans',
  
  '&:active': {
    transform: 'scale(0.97)'
  },
  
  variants: {
    variant: {
      primary: {
        backgroundColor: '$accent',
        color: '#FFFFFF',
        backgroundImage: 'linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)',
        boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)',
        '&:hover': { opacity: 0.95 }
      },
      success: {
        backgroundColor: '#16A34A',
        color: '#FFFFFF',
        backgroundImage: 'linear-gradient(135deg, #22C55E 0%, #16A34A 100%)',
        boxShadow: '0 4px 12px rgba(22, 163, 74, 0.3)',
        '&:hover': { opacity: 0.95 }
      },
      danger: {
        backgroundColor: '#DC2626',
        color: '#FFFFFF',
        backgroundImage: 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)',
        boxShadow: '0 4px 12px rgba(220, 38, 38, 0.3)',
        '&:hover': { opacity: 0.95 }
      },
      secondary: {
        backgroundColor: '#F1F5F9',
        color: '$textPrimary',
        border: '1.5px solid #CBD5E1',
        '&:hover': { backgroundColor: '#E2E8F0' }
      }
    }
  }
});

// Contenedor del Drawer Deslizable Inferior (Buscador Manual)
const DrawerOverlay = styled('div', {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(15, 23, 42, 0.4)',
  backdropFilter: 'blur(4px)',
  zIndex: 1400,
  display: 'flex',
  alignItems: 'flex-end',
  justifyContent: 'center'
});

const DrawerContent = styled('div', {
  width: '100%',
  maxWidth: '500px',
  backgroundColor: '$card',
  borderTopLeftRadius: '20px',
  borderTopRightRadius: '20px',
  boxShadow: '0 -8px 32px rgba(15, 23, 42, 0.15)',
  padding: '24px 20px calc(24px + env(safe-area-inset-bottom, 16px)) 20px',
  display: 'flex',
  flexDirection: 'column',
  gap: '16px',
  maxHeight: '80vh',
  overflowY: 'auto',
  boxSizing: 'border-box'
});

const DrawerHeader = styled('div', {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  borderBottom: '1px solid $border',
  paddingBottom: '12px'
});

const DrawerTitle = styled('h3', {
  fontSize: '15px',
  fontWeight: 700,
  color: '$textPrimary'
});

const CloseTextButton = styled('button', {
  background: 'none',
  border: 'none',
  color: '$textSecondary',
  fontSize: '13px',
  fontWeight: 600,
  cursor: 'pointer',
  '&:hover': {
    color: '$textPrimary'
  }
});

const SearchInput = styled('input', {
  width: '100%',
  padding: '12px 16px',
  borderRadius: '8px',
  border: '1px solid $border',
  fontSize: '13px',
  fontFamily: '$sans',
  outline: 'none',
  boxSizing: 'border-box',
  transition: 'border-color 0.15s ease',
  backgroundColor: '$background',

  '&:focus': {
    borderColor: '$accent',
    backgroundColor: '#FFFFFF'
  }
});

const WorkersListContainer = styled('div', {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  maxHeight: '280px',
  overflowY: 'auto',
  paddingRight: '4px'
});

const AvailableWorkerCard = styled('div', {
  padding: '12px 16px',
  borderRadius: '8px',
  border: '1px solid $border',
  backgroundColor: '$card',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  cursor: 'pointer',
  transition: 'all 0.15s ease',

  '&:hover': {
    borderColor: '$accent',
    backgroundColor: '$infoBg',
    transform: 'translateY(-1px)'
  },
  '&:active': {
    transform: 'translateY(0)'
  }
});

// Modal de Doble Confirmación con Foto
const ConfirmationOverlay = styled('div', {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(15, 23, 42, 0.6)',
  backdropFilter: 'blur(6px)',
  zIndex: 1600,
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
  boxSizing: 'border-box'
});

const OperatorPhoto = styled('img', {
  width: '88px',
  height: '88px',
  borderRadius: '50%',
  border: '3px solid $accent',
  padding: '4px',
  backgroundColor: '$background',
  objectFit: 'cover'
});

const ConfirmButton = styled('button', {
  width: '100%',
  padding: '14px',
  backgroundColor: '$accent',
  color: '#FFFFFF',
  border: 'none',
  borderRadius: '8px',
  fontSize: '13px',
  fontWeight: 700,
  cursor: 'pointer',
  boxShadow: '0 4px 12px rgba(15, 23, 42, 0.08)',
  transition: 'all 0.15s ease',

  '&:hover': {
    backgroundColor: '#1D4ED8'
  },
  '&:active': {
    transform: 'scale(0.98)'
  }
});

const CancelButton = styled('button', {
  width: '100%',
  padding: '12px',
  backgroundColor: 'transparent',
  color: '$textSecondary',
  border: '1px solid $border',
  borderRadius: '8px',
  fontSize: '13px',
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'all 0.15s ease',
  boxSizing: 'border-box',

  '&:hover': {
    backgroundColor: '$background',
    color: '$textPrimary'
  }
});

// Toast / Alerta de Notificación Temporal de Planta
const AlertBanner = styled('div', {
  position: 'fixed',
  top: '20px',
  left: '20px',
  right: '20px',
  zIndex: 3000,
  padding: '14px 18px',
  borderRadius: '8px',
  color: '#FFFFFF',
  fontSize: '12px',
  fontWeight: 600,
  boxShadow: '0 8px 24px rgba(15, 23, 42, 0.15)',
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  animation: 'slideDown 0.3s ease-out',

  variants: {
    type: {
      error: {
        backgroundColor: '#EF4444',
        borderLeft: '4px solid #B91C1C'
      },
      success: {
        backgroundColor: '#22C55E',
        borderLeft: '4px solid #15803D'
      }
    }
  }
});

// Menú Contextual para celdas ocupadas
const ContextOverlay = styled('div', {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(15, 23, 42, 0.4)',
  backdropFilter: 'blur(3px)',
  zIndex: 1500,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '20px'
});

const ContextContent = styled('div', {
  width: '100%',
  maxWidth: '320px',
  backgroundColor: '$card',
  borderRadius: '12px',
  boxShadow: '0 8px 32px rgba(15, 23, 42, 0.15)',
  padding: '20px',
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
  boxSizing: 'border-box'
});

const ContextMenuItem = styled('button', {
  width: '100%',
  padding: '12px 16px',
  borderRadius: '8px',
  border: 'none',
  outline: 'none',
  fontSize: '13px',
  fontWeight: 600,
  textAlign: 'left',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  transition: 'all 0.15s ease',

  variants: {
    variant: {
      primary: {
        backgroundColor: '$infoBg',
        color: '$accent',
        '&:hover': {
          backgroundColor: '#DBEAFE'
        }
      },
      danger: {
        backgroundColor: '$dangerBg',
        color: '$dangerBorder',
        '&:hover': {
          backgroundColor: '#FEE2E2'
        }
      },
      secondary: {
        backgroundColor: '$background',
        color: '$textPrimary',
        '&:hover': {
          backgroundColor: '$border'
        }
      },
      purple: {
        backgroundColor: '$transitBg',
        color: '$transitBorder',
        '&:hover': {
          backgroundColor: '#E9D5FF'
        }
      }
    }
  }
});

// Helper para calcular minutos transcurridos en tiempo real
const getElapsedMinutes = (asignadoEnSegundoVirtual) => {
  if (!asignadoEnSegundoVirtual) return 0;
  let ms = 0;
  if (typeof asignadoEnSegundoVirtual.toDate === 'function') {
    ms = asignadoEnSegundoVirtual.toDate().getTime();
  } else if (asignadoEnSegundoVirtual.seconds) {
    ms = asignadoEnSegundoVirtual.seconds * 1000;
  } else if (asignadoEnSegundoVirtual.nanoseconds !== undefined) {
    ms = (asignadoEnSegundoVirtual.seconds || 0) * 1000;
  } else {
    ms = new Date(asignadoEnSegundoVirtual).getTime();
  }
  return Math.max(0, Math.floor((Date.now() - ms) / 60000));
};

// Helper de coincidencia de roles para el algoritmo Smart Matchmaking y Diagnósticos
const isWorkerRoleCompatibleWithSlot = (workerRole, slotTipo, slotName) => {
  if (!workerRole || !slotTipo) return false;
  const wRole = workerRole.trim().toLowerCase();
  const sTipo = slotTipo.trim().toLowerCase();
  const sName = slotName ? slotName.trim().toLowerCase() : "";

  // En casos críticos, permitir que personal administrativo o de liderazgo cubra vacantes
  const leadershipRoles = ["supervisor", "jefe", "coordinador", "coordinadora", "analista", "analista de procesos", "jefe de turno"];
  if (leadershipRoles.includes(wRole)) {
    return true;
  }

  // Estibadores: Ningún rol de operador técnico (A, B, C, Averiero, Calderas, etc.) es compatible con Estibador/Estivador
  const isEstibador = sName.includes("estibador") || sName.includes("estivador");
  const isTechnicalOperator = wRole.includes("operador") || wRole.includes("averiero");
  if (isEstibador && isTechnicalOperator) {
    return false;
  }

  if (sTipo === "operador a") {
    return wRole === "operador a" || wRole === "operador b";
  }
  if (sTipo === "averiero") {
    return wRole === "averiero" || wRole === "operador b";
  }
  if (sTipo === "operador c") {
    return wRole === "operador c" || wRole === "operador b" || wRole === "operador a";
  }
  if (sTipo === "puesto vario") {
    return ["operario", "operario varios", "auxiliar materiales", "limpieza", "soporte", "nuevos ingresos", "asistente", "rotativo", "operario de patio", "operador b"].includes(wRole);
  }
  return wRole === sTipo;
};

// Helper para obtener el nombre base de un puesto (ej. "Estibador 1" -> "estibador")
const getBaseName = (name) => {
  if (!name) return "";
  return name.toLowerCase().split(/\d/)[0].trim();
};

// --- COMPONENT IMPLEMENTATION ---

/**
 * HudPlanta Component - Malla de puestos de planta en tiempo real para el supervisor
 * Estética: Vectorial Premium SaaS Light. Prohibido el uso de emojis.
 * 
 * @param {string} supervisorLineId Línea operativa del supervisor (ej: "L4")
 */
export default function HudPlanta({ supervisorLineId = "L4" }) {
  const [rawSlots, setRawSlots] = useState([]);
  const [sku, setSku] = useState("Cargando SKU...");
  const [shiftStatus, setShiftStatus] = useState("PREPARACION"); // "PREPARACION" | "ARRANQUE"
  const [lineStatus, setLineStatus] = useState("PREPARACION"); // "PREPARACION" | "ARRANQUE" / "OPERATIVO"
  const slots = useMemo(() => {
    const computedSlots = getSlotsForSku(sku, rawSlots);
    const TIPO_PUESTO_PRIORITY = {
      "Operador A": 1,
      "Averiero": 2,
      "Operador C": 3,
      "Puesto Vario": 4
    };
    return [...computedSlots].sort((a, b) => {
      const priorityA = TIPO_PUESTO_PRIORITY[a.tipoPuesto] || 99;
      const priorityB = TIPO_PUESTO_PRIORITY[b.tipoPuesto] || 99;
      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }
      return a.id.localeCompare(b.id);
    });
  }, [sku, rawSlots]);

  const totalSlotsCount = slots.length;
  const assignedSlotsCount = slots.filter(p => p.status === "ASIGNADO").length;
  const allSlotsAssigned = totalSlotsCount > 0 && assignedSlotsCount === totalSlotsCount;
  const [workersMap, setWorkersMap] = useState({});
  const [allSlots, setAllSlots] = useState([]);
  const [priorityOrder, setPriorityOrder] = useState(["L4", "L1", "L2", "L6", "L7", "L5", "L3", "L8", "L9", "L10"]);
  const [isOffline, setIsOffline] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);

  // Estados y manejadores para Cierre de Turno (Fase 2)
  const [cerrarTurnoModalOpen, setCerrarTurnoModalOpen] = useState(false);
  const [cerrarTurnoSelectedWorkers, setCerrarTurnoSelectedWorkers] = useState([]);

  const handleOpenCerrarTurno = () => {
    triggerNativeHapticFeedback('short');
    
    const activeWorkers = [];
    slots.forEach(slot => {
      if (slot.idWorkerCurrent) {
        const w = workersMap[slot.idWorkerCurrent];
        if (w) activeWorkers.push(w);
      }
    });

    if (activeWorkers.length === 0) {
      setNotification({
        type: 'error',
        message: 'No hay operarios activos asignados a esta línea para cerrar turno.'
      });
      return;
    }

    const preSelected = activeWorkers
      .filter(w => !!w.dobleTurnoActivo)
      .map(w => w.id);

    setCerrarTurnoSelectedWorkers(preSelected);
    setCerrarTurnoModalOpen(true);
  };

  const handleToggleCerrarTurnoWorker = (workerId) => {
    triggerNativeHapticFeedback('short');
    setCerrarTurnoSelectedWorkers(prev => {
      if (prev.includes(workerId)) {
        return prev.filter(id => id !== workerId);
      } else {
        return [...prev, workerId];
      }
    });
  };

  const handleConfirmCerrarTurno = async () => {
    triggerNativeHapticFeedback('short');
    try {
      await closeShiftForLineTransaction(supervisorLineId, cerrarTurnoSelectedWorkers);
      triggerNativeHapticFeedback('confirm');
      setCerrarTurnoModalOpen(false);
      setNotification({
        type: 'success',
        message: `¡Turno Cerrado con Éxito! Se liberaron los puestos y se actualizó el estado del personal.`
      });
    } catch (err) {
      triggerNativeHapticFeedback('error');
      alert(`Error al cerrar el turno: ${err.message}`);
    }
  };

  // Estados interactivos para asignaciones y relevos manuales (Cajón Único Dinámico)
  const [selectedSlotId, setSelectedSlotId] = useState(null);
  const [selectedSlotName, setSelectedSlotName] = useState("");
  const [selectedSlotWorker, setSelectedSlotWorker] = useState(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetMode, setSheetMode] = useState('search'); // 'search' | 'confirm' | 'context'
  const [continuousScanMode, setContinuousScanMode] = useState(false);
  const continuousScanModeRef = useRef(false);
  const assignedSlotIdsRef = useRef(new Set());

  const updateContinuousScanMode = (val) => {
    setContinuousScanMode(val);
    continuousScanModeRef.current = val;
  };
  const [searchQuery, setSearchQuery] = useState("");
  
  // Retroalimentación del escáner QR en vivo
  const [activeScanFeedback, setActiveScanFeedback] = useState(null); // { worker, slot, status: 'success' | 'error' | 'incompatible' | 'confirm', message, diagnostics: [...] }
  const isProcessingScanRef = useRef(false);
  const autoResumeTimerRef = useRef(null);
  const scanCountRef = useRef(0); // Contador de escaneos exitosos en la sesión actual
  const [scanSessionCount, setScanSessionCount] = useState(0);

  const handleResumeScan = () => {
    setActiveScanFeedback(null);
    isProcessingScanRef.current = false;
    
    // Si estamos en plataforma nativa y en modo continuo, debemos reabrir la cámara nativa para la siguiente lectura
    if (Capacitor.isNativePlatform() && continuousScanModeRef.current) {
      const remainingVacant = slots.find(s => (s.status === 'VACANTE' || s.status === 'ALERTA_VACANTE') && !assignedSlotIdsRef.current.has(s.id));
      if (remainingVacant) {
        handleOpenScanner(null, true);
      } else {
        setScannerOpen(false);
        updateContinuousScanMode(false);
      }
    }
  };
  const [lineOrders, setLineOrders] = useState([]);
  const [selectedNextOrderId, setSelectedNextOrderId] = useState("");
  const [confirmWorker, setConfirmWorker] = useState(null);
  const [notification, setNotification] = useState(null); // { type: 'success' | 'error', message: string }

  // Estados exclusivos para confirmación de operario en tránsito
  const [transitConfirmWorker, setTransitConfirmWorker] = useState(null);
  const [vacantSlotsList, setVacantSlotsList] = useState([]);

  // Estados exclusivos para despacho desde Bolsón L8
  const [dispatchWorker, setDispatchWorker] = useState(null);
  const [destLineId, setDestLineId] = useState("L4");
  const [destSlots, setDestSlots] = useState([]);
  const [selectedDestSlotId, setSelectedDestSlotId] = useState("");

  // Estados exclusivos para Diagnóstico de Matchmaking
  const [diagnosticsWorker, setDiagnosticsWorker] = useState(null);
  const [diagnosticsData, setDiagnosticsData] = useState([]);

  // Estados para las confirmaciones de seguridad (Prevención de errores de dedo)
  const [confirmRelevoSlotId, setConfirmRelevoSlotId] = useState(null);
  const [confirmLocalSwapData, setConfirmLocalSwapData] = useState(null); // { slotIdA, slotIdB }
  const [confirmReleaseSlotId, setConfirmReleaseSlotId] = useState(null);
  const [confirmBajaSlotId, setConfirmBajaSlotId] = useState(null);

  // Helper para buscar candidatos de intercambio local compatibles en la misma línea (Subcaso B)
  const findLocalSwapCandidates = () => {
    if (!selectedSlotId || !selectedSlotWorker) return [];
    const slotA = slots.find(s => s.id === selectedSlotId);
    if (!slotA) return [];

    // Verificar si el puesto A está fatigado
    const elapsedA = getElapsedMinutes(slotA.asignadoEnSegundoVirtual);
    const isFatiguedA = elapsedA >= 105 || slotA.relevoSolicitado;
    if (!isFatiguedA) return [];

    const list = [];

    // Buscar otros puestos B compatibles en la misma línea (pueden estar estables o fatigados)
    for (const slotB of slots) {
      if (slotB.id === slotA.id) continue;
      if (slotB.status !== "ASIGNADO" || !slotB.idWorkerCurrent) continue;

      // Restricción: No rotar puestos fijos críticos
      const esFijo = ["Operador A", "Averiero", "Operador C"].includes(slotB.tipoPuesto);
      if (esFijo) continue;

      // Restricción: Puestos distintos (no similar base name)
      if (getBaseName(slotA.puestoName) === getBaseName(slotB.puestoName)) continue;

      const workerB = workersMap[slotB.idWorkerCurrent];
      if (!workerB) continue;

      // Compatibilidad cruzada (Aptitud para el puesto del otro)
      if (canWorkerOccupiedSlot(selectedSlotWorker, slotB) && canWorkerOccupiedSlot(workerB, slotA)) {
        list.push({ slotB, workerB });
      }
    }

    // Ordenar de forma que los fatigados aparezcan primero
    return list.sort((a, b) => {
      const isFatiguedA = getElapsedMinutes(a.slotB.asignadoEnSegundoVirtual) >= 105 || a.slotB.relevoSolicitado;
      const isFatiguedB = getElapsedMinutes(b.slotB.asignadoEnSegundoVirtual) >= 105 || b.slotB.relevoSolicitado;
      if (isFatiguedA && !isFatiguedB) return -1;
      if (!isFatiguedA && isFatiguedB) return 1;
      return 0;
    });
  };

  // 1. Conexión Reactiva a Datos de Conectividad (Offline Guard)
  useEffect(() => {
    initializeConnectivityGuard((onlineStatus) => {
      setIsOffline(!onlineStatus);
    });
  }, []);

  // Auto-desvanecer notificaciones toast tras 4 segundos
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  // Refs para evitar reinicializaciones de cámara al cambiar estados
  const handleScanWorkerSuccessRef = useRef(null);
  const workersMapRef = useRef({});
  useEffect(() => {
    handleScanWorkerSuccessRef.current = handleScanWorkerSuccess;
    workersMapRef.current = workersMap;
  });

  // 1.2 Efecto reactivo para solicitar acceso de hardware a la cámara al abrir el escáner QR en web
  useEffect(() => {
    let html5QrCode = null;

    if (scannerOpen && typeof window !== 'undefined') {
      console.log("[Lector QR] Solicitando cámara en web fallback usando html5-qrcode...");
      import('html5-qrcode').then(({ Html5Qrcode }) => {
        const qrContainer = document.getElementById('qr-reader-container');
        if (!qrContainer) return;

        console.log("[Lector QR] Inicializando Html5Qrcode...");
        html5QrCode = new Html5Qrcode("qr-reader-container");

        html5QrCode.start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: (width, height) => {
              const size = Math.min(width, height) * 0.7;
              return { width: size, height: size };
            }
          },
          async (decodedText) => {
            if (isProcessingScanRef.current) return;
            isProcessingScanRef.current = true; // Pause scanning immediately

            try {
              console.log("[Lector QR] Código QR decodificado con éxito:", decodedText);
              const typedId = decodedText.trim().toUpperCase();
              const worker = workersMapRef.current[typedId];
              if (worker) {
                if (handleScanWorkerSuccessRef.current) {
                  await handleScanWorkerSuccessRef.current(worker);
                }
              } else {
                triggerNativeHapticFeedback('error');
                setNotification({ 
                  type: 'error', 
                  message: `No se encontró ningún operario libre con la Ficha decodificada: ${typedId}` 
                });
                isProcessingScanRef.current = false; // Resume on error
              }
            } catch (err) {
              console.error("[Lector QR] Error en callback de lectura:", err);
              isProcessingScanRef.current = false; // Resume on exception
            }
          },
          (errorMessage) => {
            // Ignorar errores menores del ciclo de fotogramas
          }
        ).catch(err => {
          console.error("[Lector QR] Error iniciando cámara con Html5Qrcode:", err);
          setNotification({
            type: 'error',
            message: 'Error de Cámara: Por favor concede permisos de cámara en tu navegador.'
          });
        });
      }).catch(err => {
        console.error("[Lector QR] Error importando html5-qrcode:", err);
      });
    }

    return () => {
      if (html5QrCode) {
        console.log("[Lector QR] Liberando recurso de cámara de hardware...");
        if (html5QrCode.isScanning) {
          html5QrCode.stop().catch(err => console.error("[Lector QR] Error deteniendo scanner:", err));
        }
      }
    };
  }, [scannerOpen]);

  // 1.4 Conexión Reactiva al Estado del Turno Global (PREPARACION / ARRANQUE)
  useEffect(() => {
    const unsubscribeStatus = onSnapshot(doc(db, "config", "shift_status"), (docSnap) => {
      if (docSnap.exists()) {
        setShiftStatus(docSnap.data().status || "PREPARACION");
      }
    }, (err) => {
      console.error("[HUD Status] Error cargando shift_status:", err);
    });
    return () => unsubscribeStatus();
  }, []);

  // 1.4.5 Conexión Reactiva al Estado Específico de esta Línea (PREPARACION / ARRANQUE / OPERATIVO)
  useEffect(() => {
    const unsubscribeLineStatus = onSnapshot(doc(db, "config", `line_${supervisorLineId}`), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setLineStatus(data.status || "PREPARACION");
        
        // GATILLO AUTOMÁTICO DE AUTO-ASIGNACIÓN DE FIJOS:
        // Si la línea está en PREPARACION y fijosAssigned es falso, ejecutamos la auto-asignación en segundo plano!
        // DEFENSA EXTRAORDINARIA: Consultamos de forma síncrona/directa de Firestore para evitar la condición de carrera del montado de React.
        if ((data.status === "PREPARACION" || !data.status) && !data.fijosAssigned) {
          getDoc(doc(db, "config", "shift_status")).then(shiftSnap => {
            if (shiftSnap.exists() && shiftSnap.data().status === "ARRANQUE") {
              console.log("[HUD AutoAsignar] Turno ya en marcha en servidor (ARRANQUE). Abortando auto-asignación.");
              return;
            }
            const skuToUse = sku && sku !== "Cargando SKU..." && sku !== "SIN SKU" && sku !== "SIN PLANIFICAR" ? sku : "SKU-990-BOST";
            autoAssignFixedOperators(supervisorLineId, skuToUse).catch(err => {
              console.error("[HUD AutoAsignar] Error en auto-asignación automática:", err);
            });
          });
        }
      } else {
        setLineStatus("PREPARACION");
        // Si el documento de la línea no existe todavía, lo creamos y gatillamos la auto-asignación (si el turno no ha iniciado en el servidor)
        getDoc(doc(db, "config", "shift_status")).then(shiftSnap => {
          if (shiftSnap.exists() && shiftSnap.data().status === "ARRANQUE") {
            console.log("[HUD AutoAsignar] Turno ya iniciado en servidor. Abortando auto-asignación inicial.");
            return;
          }
          const skuToUse = sku && sku !== "Cargando SKU..." && sku !== "SIN SKU" && sku !== "SIN PLANIFICAR" ? sku : "SKU-990-BOST";
          autoAssignFixedOperators(supervisorLineId, skuToUse).catch(err => {
            console.error("[HUD AutoAsignar] Error en auto-asignación inicial:", err);
          });
        });
      }
    }, (err) => {
      console.error(`[HUD Line Status] Error cargando line_${supervisorLineId}:`, err);
    });
    return () => unsubscribeLineStatus();
  }, [supervisorLineId, sku]);

  // 1.5 Conexión Reactiva al SKU asignado específicamente a esta línea
  useEffect(() => {
    const unsubscribeSku = onSnapshot(doc(db, "config", "global_priority"), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        const lineSku = (data.skuPlan && data.skuPlan[supervisorLineId]) || data.skuAssigned || "SIN PLANIFICAR";
        setSku(lineSku);
      }
    }, (err) => {
      console.error("[HUD Sku] Error cargando global_priority:", err);
    });
    return () => unsubscribeSku();
  }, [supervisorLineId]);

  // 1.6 Cargar órdenes de producción de Excel para el día de hoy
  useEffect(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    getProgramaProduccionPorFecha(todayStr).then(orders => {
      const filtered = orders.filter(o => o.lineaId === supervisorLineId);
      if (filtered.length === 0) {
        // Fallback defensivo para desarrollo/pruebas si no hay datos de hoy en Sheets
        setLineOrders([
          { id: "OP-MOCK-1", item: sku && sku !== "Cargando SKU..." ? sku : "SKU-990-BOST", producto: "Producto Activo Inicial", ordenProceso: "OP-1002" },
          { id: "OP-MOCK-2", item: "SKU-441-AQUA", producto: "Agua Mineral Embotellada", ordenProceso: "OP-1003" },
          { id: "OP-MOCK-3", item: "SKU-102-LITE", producto: "Bebida Lite Dietética", ordenProceso: "OP-1004" }
        ]);
      } else {
        setLineOrders(filtered);
      }
    }).catch(err => {
      console.error("[HUD Line Orders] Falló al cargar órdenes:", err);
      setLineOrders([
        { id: "OP-MOCK-1", item: sku && sku !== "Cargando SKU..." ? sku : "SKU-990-BOST", producto: "Producto Activo Inicial", ordenProceso: "OP-1002" },
        { id: "OP-MOCK-2", item: "SKU-441-AQUA", producto: "Agua Mineral Embotellada", ordenProceso: "OP-1003" }
      ]);
    });
  }, [supervisorLineId, lineStatus, sku]);

  // 1.8 Conexión Reactiva a todos los puestos y orden de prioridad global
  useEffect(() => {
    const unsubscribeAllSlots = onSnapshot(puestosColl, (snapshot) => {
      const list = [];
      snapshot.forEach(docSnap => {
        list.push({ id: docSnap.id, ...docSnap.data() });
      });
      setAllSlots(list);
    });

    const unsubscribePriority = onSnapshot(doc(db, "config", "global_priority"), (docSnap) => {
      if (docSnap.exists() && docSnap.data().priorityOrder) {
        setPriorityOrder(docSnap.data().priorityOrder);
      }
    });

    return () => {
      unsubscribeAllSlots();
      unsubscribePriority();
    };
  }, []);

  // 2. Conexión Reactiva a Puestos de la Línea y Catálogo de Trabajadores
  useEffect(() => {
    console.log(`[HUD Planta] Conectando onSnapshot para la línea: ${supervisorLineId}`);

    const qSlots = query(puestosColl, where("lineId", "==", supervisorLineId));
    const unsubscribeSlots = onSnapshot(qSlots, (snapshot) => {
      const slotsList = [];
      snapshot.forEach(docSnap => {
        slotsList.push({ id: docSnap.id, ...docSnap.data() });
      });

      const TIPO_PUESTO_PRIORITY = {
        "Operador A": 1,
        "Averiero": 2,
        "Operador C": 3,
        "Puesto Vario": 4
      };

      slotsList.sort((a, b) => {
        const priorityA = TIPO_PUESTO_PRIORITY[a.tipoPuesto] || 99;
        const priorityB = TIPO_PUESTO_PRIORITY[b.tipoPuesto] || 99;
        if (priorityA !== priorityB) {
          return priorityA - priorityB;
        }
        return a.id.localeCompare(b.id);
      });

      setRawSlots(slotsList);
    }, (err) => {
      console.error("[HUD Planta] Error en listener de puestos:", err);
    });

    const unsubscribeWorkers = onSnapshot(trabajadoresColl, (snapshot) => {
      const tempMap = {};
      snapshot.forEach(docSnap => {
        tempMap[docSnap.id] = { id: docSnap.id, ...docSnap.data() };
      });
      setWorkersMap(tempMap);
    }, (err) => {
      console.error("[HUD Planta] Error en listener de trabajadores:", err);
    });

    return () => {
      unsubscribeSlots();
      unsubscribeWorkers();
    };
  }, [supervisorLineId]);

  // 3. Consultar vacantes disponibles de una línea destino seleccionada en Bolsón
  useEffect(() => {
    if (dispatchWorker && destLineId) {
      const q = query(puestosColl, where("lineId", "==", destLineId), where("status", "==", "VACANTE"));
      getDocs(q).then(snap => {
        const list = [];
        snap.forEach(docSnap => {
          list.push({ id: docSnap.id, ...docSnap.data() });
        });
        setDestSlots(list);
        setSelectedDestSlotId(list[0]?.id || "");
      }).catch(err => console.error("[HUD L8 Dispatch] Error fetching vacant slots:", err));
    }
  }, [dispatchWorker, destLineId]);

  // 4. Calcular trabajadores disponibles en la planta
  const availableWorkers = useMemo(() => {
    const leadershipRoles = ["supervisor", "jefe", "coordinador", "coordinadora", "analista", "analista de procesos", "jefe de turno"];
    return Object.values(workersMap).filter(w => 
      (w.status === 'POOL_ARRANQUE' || w.status === 'DISPONIBLE_BOLSON') &&
      w.currentSlotId == null &&
      !leadershipRoles.includes((w.role || "").trim().toLowerCase())
    ).sort((a, b) => a.name.localeCompare(b.name));
  }, [workersMap]);

  // Filtrar operarios disponibles por búsqueda en Drawer
  const filteredWorkers = useMemo(() => {
    const searchLower = searchQuery.toLowerCase().trim();
    if (!searchLower) {
      return availableWorkers;
    }
    // Si hay búsqueda, permitir buscar también a los roles administrativos/liderazgo
    return Object.values(workersMap).filter(w => 
      (w.status === 'POOL_ARRANQUE' || w.status === 'DISPONIBLE_BOLSON') &&
      w.currentSlotId == null &&
      (w.name.toLowerCase().includes(searchLower) || w.id.toLowerCase().includes(searchLower))
    ).sort((a, b) => a.name.localeCompare(b.name));
  }, [availableWorkers, searchQuery, workersMap]);


  // 5. Escuchar operarios EN TRÁNSITO con destino a esta línea en tiempo real
  const transitWorkers = useMemo(() => {
    return Object.values(workersMap).filter(w => 
      w.status === 'EN_TRANSITO' && 
      w.lineaDestinoId === supervisorLineId
    );
  }, [workersMap, supervisorLineId]);

  // 5.5 Calcular puestos en fatiga sugerida o crítica en tiempo real
  const activeFatiguedSlots = useMemo(() => {
    return slots.filter(slot => {
      if (slot.status !== 'ASIGNADO' || !slot.idWorkerCurrent) return false;

      // El sistema de fatiga NO aplica para puestos fijos críticos, solo puestos varios
      const esFijo = ["Operador A", "Averiero", "Operador C"].includes(slot.tipoPuesto);
      if (esFijo) return false;

      let isFatigued = slot.relevoSolicitado === true;
      if (!isFatigued && slot.asignadoEnSegundoVirtual) {
        const t = slot.asignadoEnSegundoVirtual;
        const ms = t.toDate 
          ? t.toDate().getTime() 
          : (t.seconds ? t.seconds * 1000 : new Date(t).getTime());
        const elapsed = Math.max(0, Math.floor((Date.now() - ms) / 60000));
        isFatigued = elapsed >= 105;
      }
      return isFatigued;
    });
  }, [slots]);

  // 5.6 Identificar parejas compatibles de intercambio ergonómico local en caliente
  const localSwapPair = useMemo(() => {
    if (slots.length < 2) return null;

    // Obtener los slots asignados de la línea (excluyendo puestos fijos críticos)
    const assignedSlots = slots.filter(slot => {
      if (slot.status !== 'ASIGNADO' || !slot.idWorkerCurrent) return false;
      const esFijo = ["Operador A", "Averiero", "Operador C"].includes(slot.tipoPuesto);
      return !esFijo;
    });

    const fatiguedSlots = assignedSlots.filter(slot => {
      let isFatigued = slot.relevoSolicitado === true;
      if (!isFatigued && slot.asignadoEnSegundoVirtual) {
        const t = slot.asignadoEnSegundoVirtual;
        const ms = t.toDate ? t.toDate().getTime() : (t.seconds ? t.seconds * 1000 : new Date(t).getTime());
        const elapsed = Math.max(0, Math.floor((Date.now() - ms) / 60000));
        isFatigued = elapsed >= 105;
      }
      return isFatigued;
    });

    if (fatiguedSlots.length === 0) return null;

    // 1. Prioridad 1: Buscar si hay 2 celdas fatigadas compatibles en la línea (Swap entre fatigados)
    if (fatiguedSlots.length >= 2) {
      for (let i = 0; i < fatiguedSlots.length; i++) {
        const slotA = fatiguedSlots[i];
        const workerA = workersMap[slotA.idWorkerCurrent];
        if (!workerA) continue;

        for (let j = i + 1; j < fatiguedSlots.length; j++) {
          const slotB = fatiguedSlots[j];
          const workerB = workersMap[slotB.idWorkerCurrent];
          if (!workerB) continue;

          if (getBaseName(slotA.puestoName) === getBaseName(slotB.puestoName)) continue;
          if (canWorkerOccupiedSlot(workerA, slotB) && canWorkerOccupiedSlot(workerB, slotA)) {
            return { slotA, slotB, workerA, workerB, isBFatigued: true, reason: "both_fatigued" };
          }
        }
      }
    }

    // 2. Prioridad 2: Si hay 1 fatigado y el Bolsón L8 no tiene recursos compatibles, sugerir swap con estable
    const l8Available = Object.values(workersMap).filter(w => 
      (w.status === 'POOL_ARRANQUE' || w.status === 'DISPONIBLE_BOLSON') &&
      w.currentSlotId == null
    );

    for (const slotA of fatiguedSlots) {
      const workerA = workersMap[slotA.idWorkerCurrent];
      if (!workerA) continue;

      // Evaluar si L8 tiene algún operario compatible disponible
      const hasCompatibleL8Worker = l8Available.some(w => {
        const blacklist = slotA.rejectedWorkerIds || [];
        if (blacklist.includes(w.id)) {
          console.log(`[QA Debug HUD] ${w.name} (${w.id}) excluido de ${slotA.puestoName} por estar en la blacklist.`);
          return false;
        }
        if (!canWorkerOccupiedSlot(w, slotA)) {
          console.log(`[QA Debug HUD] ${w.name} (${w.id}) excluido de ${slotA.puestoName} por canWorkerOccupiedSlot.`);
          return false;
        }
        if (w.lastActivity && w.lastActivity === slotA.puestoName) {
          console.log(`[QA Debug HUD] ${w.name} (${w.id}) excluido de ${slotA.puestoName} por lastActivity matching (fatiga ergonómica 24h).`);
          return false;
        }
        console.log(`[QA Debug HUD] CANDIDATO COMPATIBLE L8 DETECTADO: ${w.name} (${w.id}) para puesto ${slotA.puestoName}.`);
        return true;
      });

      // Si L8 NO tiene recursos compatibles, sugerimos rotar con un puesto estable compatible
      if (!hasCompatibleL8Worker) {
        for (const slotB of assignedSlots) {
          if (slotB.id === slotA.id) continue;
          const isBFatigued = fatiguedSlots.some(s => s.id === slotB.id);
          if (isBFatigued) continue;

          const workerB = workersMap[slotB.idWorkerCurrent];
          if (!workerB) continue;

          if (getBaseName(slotA.puestoName) === getBaseName(slotB.puestoName)) continue;
          if (canWorkerOccupiedSlot(workerA, slotB) && canWorkerOccupiedSlot(workerB, slotA)) {
            return { slotA, slotB, workerA, workerB, isBFatigued: false, reason: "no_l8_resources" };
          }
        }
      }
    }

    return null;
  }, [slots, workersMap]);

  // 5.8 ALGORITMO SMART MATCHMAKING: Encontrar el puesto más compatible de forma 100% algorítmica
  const findBestSlotForWorker = (worker) => {
    if (!worker) return null;

    // Si el operario tiene un rol de liderazgo/administrativo, no debe ser sugerido/auto-asignado automáticamente
    const wRole = (worker.role || "").trim().toLowerCase();
    const leadershipRoles = ["supervisor", "jefe", "coordinador", "coordinadora", "analista", "analista de procesos", "jefe de turno"];
    if (leadershipRoles.includes(wRole)) {
      return null;
    }
    
    // Filtrar puestos vacantes de esta línea
    const vacantSlots = slots.filter(s => s.status === 'VACANTE' || s.status === 'ALERTA_VACANTE');
    if (vacantSlots.length === 0) return null;

    // Prioridad 1: Si hay una vacante en esta línea cuyo titular planificado es el operario (con género coincidente)
    const titularSlot = vacantSlots.find(s => s.idWorkerOriginal === worker.id);
    if (titularSlot && isWorkerRoleCompatibleWithSlot(worker.role, titularSlot.tipoPuesto, titularSlot.puestoName) && canWorkerOccupiedSlot(worker, titularSlot)) {
      return titularSlot;
    }

    // Prioridad 1.5: Si hay una vacante cuyo titular es el operario (ignorando género pero respetando restricciones médicas)
    if (titularSlot && isWorkerRoleCompatibleWithSlot(worker.role, titularSlot.tipoPuesto, titularSlot.puestoName)) {
      // Verificar solo restricciones médicas duras (sin género)
      const requiredCaps = titularSlot.requiredCapabilities || [];
      const medRestrictions = worker.medicalRestrictions || [];
      const hasMedicalConflict = requiredCaps.some(cap => {
        const cleanCap = cap.trim().toUpperCase();
        return medRestrictions.some(res => {
          const cleanRes = res.trim().toUpperCase();
          return cleanRes === cleanCap || cleanRes === `PROHIBIDO_${cleanCap}`;
        });
      });
      if (!hasMedicalConflict) {
        return titularSlot;
      }
    }

    // Prioridad 2: Buscar cualquier otra vacante compatible de forma algorítmica (rol + género + restricciones médicas)
    let compatibleSlot = vacantSlots.find(s => isWorkerRoleCompatibleWithSlot(worker.role, s.tipoPuesto, s.puestoName) && canWorkerOccupiedSlot(worker, s));
    if (compatibleSlot) {
      return compatibleSlot;
    }

    // Prioridad 3: Buscar cualquier otra vacante compatible por rol + restricciones médicas, ignorando preferencia de género
    compatibleSlot = vacantSlots.find(s => {
      const roleCompatible = isWorkerRoleCompatibleWithSlot(worker.role, s.tipoPuesto, s.puestoName);
      const requiredCaps = s.requiredCapabilities || [];
      const medRestrictions = worker.medicalRestrictions || [];
      const hasMedicalConflict = requiredCaps.some(cap => {
        const cleanCap = cap.trim().toUpperCase();
        return medRestrictions.some(res => {
          const cleanRes = res.trim().toUpperCase();
          return cleanRes === cleanCap || cleanRes === `PROHIBIDO_${cleanCap}`;
        });
      });
      return roleCompatible && !hasMedicalConflict;
    });

    if (compatibleSlot) {
      return compatibleSlot;
    }

    return null;
  };

  // 5.9 Procesar lectura exitosa de gafete QR (Único o Continuo)
  const handleScanWorkerSuccess = async (worker) => {
    if (!worker) {
      triggerNativeHapticFeedback('error');
      setNotification({
        type: 'error',
        message: 'Escáner QR: Operario no encontrado en la base de datos.'
      });
      isProcessingScanRef.current = false;
      return;
    }

    console.log(`[QR Scan] Procesando escaneo de: ${worker.name} (${worker.id})`);
    isProcessingScanRef.current = true; // Pausar escáner para procesar y dar feedback
    
    // Interceptar escaneo de personal administrativo/liderazgo sin puesto seleccionado
    const wRole = (worker.role || "").trim().toLowerCase();
    const leadershipRoles = ["supervisor", "jefe", "coordinador", "coordinadora", "analista", "analista de procesos", "jefe de turno"];
    if (leadershipRoles.includes(wRole) && !selectedSlotId) {
      triggerNativeHapticFeedback('error');
      setActiveScanFeedback({
        worker,
        slot: null,
        status: 'error',
        message: `El operario ${worker.name} tiene un rol administrativo o de liderazgo (${worker.role}). Para asignarlo en un caso crítico de déficit, por favor seleccione primero el puesto de destino en la pantalla y luego escanee su gafete.`
      });
      return;
    }

    let targetSlot = null;

    if (selectedSlotId) {
      const selectedSlot = slots.find(s => s.id === selectedSlotId);
      if (selectedSlot) {
        const roleCompatible = isWorkerRoleCompatibleWithSlot(worker.role, selectedSlot.tipoPuesto, selectedSlot.puestoName);
        const slotCompatible = canWorkerOccupiedSlot(worker, selectedSlot);
        const isHardCompatible = roleCompatible && slotCompatible;
        
        if (isHardCompatible) {
          targetSlot = selectedSlot;
          console.log(`[QR Scan] Slot seleccionado compatible: ${targetSlot.puestoName} (${targetSlot.id})`);
        } else {
          triggerNativeHapticFeedback('error');
          let reason = "";
          if (!roleCompatible) {
            reason = `Rol "${worker.role}" incompatible con "${selectedSlot.tipoPuesto}".`;
          } else if (!slotCompatible) {
            reason = `Restricción médica o de género incompatible con este puesto.`;
          }
          
          // Generar diagnóstico usando canWorkerOccupiedSlot centralizado
          const vacantSlots = slots.filter(s => s.status === 'VACANTE' || s.status === 'ALERTA_VACANTE');
          const diagnostics = vacantSlots.map(s => ({
            slotId: s.id,
            puestoName: s.puestoName,
            tipoPuesto: s.tipoPuesto,
            isRoleCompatible: isWorkerRoleCompatibleWithSlot(worker.role, s.tipoPuesto, s.puestoName),
            isSlotCompatible: canWorkerOccupiedSlot(worker, s),
            isFullyCompatible: isWorkerRoleCompatibleWithSlot(worker.role, s.tipoPuesto, s.puestoName) && canWorkerOccupiedSlot(worker, s)
          }));

          setActiveScanFeedback({
            worker,
            slot: selectedSlot,
            status: 'incompatible',
            message: `Incompatible con "${selectedSlot.puestoName}". ${reason}`,
            diagnostics
          });
          return;
        }
      }
    }

    if (!targetSlot) {
      targetSlot = findBestSlotForWorker(worker);
      if (targetSlot) {
        console.log(`[QR Scan] Matchmaker automático seleccionó: ${targetSlot.puestoName} (${targetSlot.id})`);
      }
    }

    if (!targetSlot) {
      triggerNativeHapticFeedback('error');
      
      const vacantSlots = slots.filter(s => s.status === 'VACANTE' || s.status === 'ALERTA_VACANTE');
      const diagnostics = vacantSlots.map(s => ({
        slotId: s.id,
        puestoName: s.puestoName,
        tipoPuesto: s.tipoPuesto,
        isRoleCompatible: isWorkerRoleCompatibleWithSlot(worker.role, s.tipoPuesto, s.puestoName),
        isSlotCompatible: canWorkerOccupiedSlot(worker, s),
        isFullyCompatible: isWorkerRoleCompatibleWithSlot(worker.role, s.tipoPuesto, s.puestoName) && canWorkerOccupiedSlot(worker, s)
      }));

      setActiveScanFeedback({
        worker,
        slot: null,
        status: 'incompatible',
        message: `Sin puestos compatibles en ${supervisorLineId} para este operario.`,
        diagnostics
      });
      return;
    }

    if (continuousScanModeRef.current) {
      // Flujo de Inicio Rápido (QR Continuo) sin cajón externo de confirmación, pero con feedback visual
      try {
        console.log(`[QR Scan] Auto-asignación en marcha: ${worker.id} -> ${targetSlot.id}`);
        const res = await assignWorkerTransaction(worker.id, targetSlot.id, supervisorLineId);
        if (res.success) {
          assignedSlotIdsRef.current.add(targetSlot.id);
          if (res.intercepted) {
            triggerNativeHapticFeedback('error');
            setActiveScanFeedback({
              worker,
              slot: targetSlot,
              status: 'error',
              message: `Asignación redirigida a la línea ${res.targetLineId} por vacante crítica de mayor prioridad.`
            });
          } else {
            triggerNativeHapticFeedback('confirm');
            
            const remainingVacant = slots.find(s => 
              (s.status === 'VACANTE' || s.status === 'ALERTA_VACANTE') && 
              s.id !== targetSlot.id && 
              !assignedSlotIdsRef.current.has(s.id)
            );

            scanCountRef.current += 1;
            setScanSessionCount(scanCountRef.current);

            setActiveScanFeedback({
              worker,
              slot: targetSlot,
              status: 'success',
              message: `Asignado a "${targetSlot.puestoName}".`,
              isLineCompleted: !remainingVacant
            });

            if (autoResumeTimerRef.current) clearTimeout(autoResumeTimerRef.current);
            autoResumeTimerRef.current = setTimeout(() => {
              if (!remainingVacant) {
                setScannerOpen(false);
                updateContinuousScanMode(false);
                setActiveScanFeedback(null);
                setNotification({
                  type: 'success',
                  message: `🎉 ¡Línea Completa! ${scanCountRef.current} operarios asignados.`
                });
                scanCountRef.current = 0;
                setScanSessionCount(0);
                isProcessingScanRef.current = false;
              } else {
                handleResumeScan();
              }
            }, 2000);
          }
        }
      } catch (err) {
        console.error("[QR Scan] Error en transacción continua:", err);
        triggerNativeHapticFeedback('error');
        setActiveScanFeedback({
          worker,
          slot: targetSlot,
          status: 'error',
          message: err.message || 'Error en la asignación continua.'
        });
      }
    } else {
      // Flujo de Escaneo Único: Muestra propuesta de confirmación directamente dentro del escáner
      triggerNativeHapticFeedback('short');
      setActiveScanFeedback({
        worker,
        slot: targetSlot,
        status: 'confirm',
        message: `¿Confirmar asignación en el puesto "${targetSlot.puestoName}"?`
      });
    }
  };

  // 6. Control del Escáner QR de Hardware (Thumb Zone)
  const handleOpenScanner = async (specificSlotId = null, isResume = false) => {
    triggerNativeHapticFeedback('short');
    if (isOffline) {
      setNotification({
        type: 'error',
        message: 'Modo Offline Activo: El escáner QR está inhabilitado por resiliencia de datos.'
      });
      return;
    }

    if (specificSlotId) {
      setSelectedSlotId(specificSlotId);
      updateContinuousScanMode(false); // Modo único
    } else {
      setSelectedSlotId(null);
      if (!isResume) {
        assignedSlotIdsRef.current.clear(); // Limpiar asignaciones locales al abrir
      }
      updateContinuousScanMode(true); // Modo continuo por defecto
    }

    // Validar si hay puestos vacantes en la línea
    const vacant = slots.find(s => (s.status === 'VACANTE' || s.status === 'ALERTA_VACANTE') && !assignedSlotIdsRef.current.has(s.id));
    if (!vacant) {
      setNotification({
        type: 'error',
        message: 'Línea Completa: No hay puestos vacantes en esta línea para asignar operarios.'
      });
      return;
    }

    setScannerOpen(true);
    isProcessingScanRef.current = false;
    setActiveScanFeedback(null);
    if (!isResume) {
      scanCountRef.current = 0;
      setScanSessionCount(0);
    }

    const cameraRes = await initializeRearCameraQRScanner();
    if (cameraRes.success) {
      if (cameraRes.native && cameraRes.scanResult) {
        const typedId = cameraRes.scanResult.trim().toUpperCase();
        const worker = workersMap[typedId];
        if (worker) {
          await handleScanWorkerSuccess(worker);
        } else {
          triggerNativeHapticFeedback('error');
          setNotification({ 
            type: 'error', 
            message: `No se encontró ningún operario libre con la Ficha decodificada: ${typedId}` 
          });
          isProcessingScanRef.current = false;
        }
      }
    }
  };

  const handleCloseScanner = () => {
    triggerNativeHapticFeedback('short');
    setScannerOpen(false);
    updateContinuousScanMode(false);
    setActiveScanFeedback(null);
    if (autoResumeTimerRef.current) clearTimeout(autoResumeTimerRef.current);
    isProcessingScanRef.current = false;
    scanCountRef.current = 0;
    setScanSessionCount(0);
  };

  const handleConfirmScanAssignment = async () => {
    if (!activeScanFeedback || !activeScanFeedback.worker || !activeScanFeedback.slot) return;
    
    const { worker, slot } = activeScanFeedback;
    triggerNativeHapticFeedback('short');
    
    try {
      const res = await assignWorkerTransaction(worker.id, slot.id, supervisorLineId);
      if (res.success) {
        triggerNativeHapticFeedback('confirm');
        scanCountRef.current += 1;
        setScanSessionCount(scanCountRef.current);
        
        // Mostrar feedback de éxito dentro del escáner antes de cerrar
        setActiveScanFeedback({
          worker,
          slot,
          status: 'success',
          message: `Asignado a "${slot.puestoName}".`,
          isLineCompleted: false
        });
        
        if (autoResumeTimerRef.current) clearTimeout(autoResumeTimerRef.current);
        autoResumeTimerRef.current = setTimeout(() => {
          setScannerOpen(false);
          setActiveScanFeedback(null);
          isProcessingScanRef.current = false;
        }, 2000);
      }
    } catch (err) {
      triggerNativeHapticFeedback('error');
      setActiveScanFeedback({
        worker,
        slot,
        status: 'error',
        message: err.message || 'Error en la asignación.'
      });
    }
  };

  // 7. Clic en Puesto: Controlador de flujos
  const handleSlotClick = (slotId) => {
    triggerNativeHapticFeedback('short');
    if (isOffline) {
      setNotification({
        type: 'error',
        message: 'Modo Offline: Se prohíbe realizar movimientos o asignaciones hasta recuperar Wi-Fi.'
      });
      return;
    }

    const clickedSlot = slots.find(s => s.id === slotId);
    if (!clickedSlot) return;

    setSelectedSlotId(slotId);
    setSelectedSlotName(clickedSlot.puestoName);

    const currentWorkerId = clickedSlot.idWorkerCurrent;
    if (currentWorkerId) {
      // Puesto Ocupado: Abrir menú contextual en Cajón Único
      const workerDetails = workersMap[currentWorkerId];
      setSelectedSlotWorker(workerDetails ? {
        id: workerDetails.id,
        name: workerDetails.name,
        role: workerDetails.role,
        isReplacement: clickedSlot.idWorkerOriginal !== currentWorkerId,
        asignadoEnSegundoVirtual: clickedSlot.asignadoEnSegundoVirtual
      } : { 
        id: currentWorkerId, 
        name: 'Operario General', 
        role: 'Operario', 
        asignadoEnSegundoVirtual: clickedSlot.asignadoEnSegundoVirtual 
      });
      setSheetMode('context');
      setSheetOpen(true);
    } else {
      // Puesto Vacante: Abrir buscador en Cajón Único
      setSelectedSlotWorker(null);
      setSearchQuery("");
      setSheetMode('search');
      setSheetOpen(true);
    }
  };

  // 8. Transacción: Asentar Asignación del Operario en Firebase
  const handleConfirmAssignment = async () => {
    if (!confirmWorker || !selectedSlotId) return;
    
    triggerNativeHapticFeedback('short');
    const workerId = confirmWorker.id;
    const workerName = confirmWorker.name;
    const slotId = selectedSlotId;
    
    setConfirmWorker(null);
    setSheetOpen(false);
    
    try {
      const res = await assignWorkerTransaction(workerId, slotId, supervisorLineId);
      if (res.success) {
        if (res.intercepted) {
          triggerNativeHapticFeedback('error');
          setNotification({
            type: 'error',
            message: `Asignación redirigida a la línea ${res.targetLineId} por vacante crítica de mayor prioridad abierta en el puesto "${res.targetSlotName}".`
          });
        } else {
          triggerNativeHapticFeedback('confirm');
          setNotification({
            type: 'success',
            message: `¡Asignación Consolidada! ${workerName} fue registrado en ${selectedSlotName}.`
          });
        }
      }
    } catch (err) {
      triggerNativeHapticFeedback('error');
      setNotification({
        type: 'error',
        message: err.message || 'Error desconocido procesando asignación.'
      });
    }
  };

  // 8.5 Transacción: Ejecutar Intercambio Ergonómico Local (Subcaso B)
  const handleLocalSwapClick = async (slotIdA, slotIdB) => {
    if (isOffline) {
      setNotification({
        type: 'error',
        message: 'Modo Offline Activo: El intercambio local está inhabilitado por resiliencia de datos.'
      });
      return;
    }

    try {
      setNotification(null);
      triggerNativeHapticFeedback('short');
      const res = await executeLocalSwapTransaction(slotIdA, slotIdB, supervisorLineId);
      if (res.success) {
        triggerNativeHapticFeedback('confirm');
        setNotification({
          type: 'success',
          message: `¡Intercambio ergonómico local exitoso! ${res.workerAName} (${res.puestoAName}) y ${res.workerBName} (${res.puestoBName}) rotaron de puesto.`
        });
        setSheetOpen(false);
      }
    } catch (err) {
      triggerNativeHapticFeedback('error');
      console.error("[Intercambio Local] Error:", err);
      setNotification({
        type: 'error',
        message: err.message || 'Error al ejecutar el intercambio local.'
      });
    }
  };

  // 9. Transacción: Liberar Operario de su puesto
  const handleReleaseWorker = async () => {
    if (!selectedSlotId || !selectedSlotWorker) return;
    
    triggerNativeHapticFeedback('short');
    const workerId = selectedSlotWorker.id;
    const slotId = selectedSlotId;
    
    setSheetOpen(false);
    
    try {
      const res = await releaseWorkerTransaction(slotId, workerId, supervisorLineId);
      if (res.success) {
        triggerNativeHapticFeedback('confirm');
        setNotification({
          type: 'success',
          message: `Operario ${selectedSlotWorker.name} liberado exitosamente. Regresa a Línea 8 (Bolsón).`
        });
      }
    } catch (err) {
      triggerNativeHapticFeedback('error');
      setNotification({
        type: 'error',
        message: err.message || 'Fallo al liberar operario.'
      });
    }
  };

  // 10. Transacción: Registrar Baja Temporal del Puesto
  const handleTempBajaWorker = async () => {
    if (!selectedSlotId || !selectedSlotWorker) return;
    
    triggerNativeHapticFeedback('short');
    const workerId = selectedSlotWorker.id;
    const slotId = selectedSlotId;
    
    setSheetOpen(false);
    
    try {
      await tempBajaWorkerTransaction(slotId, workerId, supervisorLineId);
      triggerNativeHapticFeedback('confirm');
      setNotification({
        type: 'success',
        message: `Baja Temporal asentada para ${selectedSlotWorker.name}. Retirado de línea por enfermería.`
      });
    } catch (err) {
      triggerNativeHapticFeedback('error');
      setNotification({
        type: 'error',
        message: err.message || 'Fallo al procesar baja temporal.'
      });
    }
  };

  // 10.5 Transacción: Solicitar Relevo Automático (Motor 3 Ergonómico)
  const handleRequestErgonomicRelevo = async () => {
    if (!selectedSlotId || !selectedSlotWorker) return;
    
    triggerNativeHapticFeedback('short');
    const slotId = selectedSlotId;
    
    setSheetOpen(false);
    
    try {
      const res = await requestErgonomicRelevo(slotId, supervisorLineId);
      if (res.success) {
        triggerNativeHapticFeedback('confirm');
        setNotification({
          type: 'success',
          message: `¡Relevo Automático! El relevista ${res.relevistaName} fue seleccionado del Bolsón L8 y viene en tránsito.`
        });
      }
    } catch (err) {
      triggerNativeHapticFeedback('error');
      setNotification({
        type: 'error',
        message: err.message || 'Fallo al solicitar relevo ergonómico.'
      });
    }
  };

  // 10.8 Transacción Directa: Relevar desde Tarjeta sin Cajón
  const handleDirectRelevoClick = async (slotId) => {
    triggerNativeHapticFeedback('short');
    try {
      const res = await requestErgonomicRelevo(slotId, supervisorLineId);
      if (res.success) {
        triggerNativeHapticFeedback('confirm');
        setNotification({
          type: 'success',
          message: `¡Relevo Automático! El relevista ${res.relevistaName} fue seleccionado del Bolsón L8 y viene en tránsito.`
        });
      }
    } catch (err) {
      triggerNativeHapticFeedback('error');
      setNotification({
        type: 'error',
        message: err.message || 'Fallo al solicitar relevo ergonómico.'
      });
    }
  };

  const executeArrival = async (worker, slotId) => {
    const workerId = worker.id;
    const targetSlotId = worker.targetSlotId;
    
    try {
      const selectedSlot = slots.find(s => s.id === slotId);
      const isRelevo = (targetSlotId && targetSlotId === slotId) || (selectedSlot && selectedSlot.idWorkerCurrent);
      
      if (isRelevo) {
        await acceptErgonomicRelevo(workerId, slotId, supervisorLineId);
      } else {
        await confirmTransitWorkerArrival(workerId, slotId, supervisorLineId);
      }
      
      triggerNativeHapticFeedback('confirm');
      setNotification({
        type: 'success',
        message: `¡Recepción Confirmada! Operario ${workersMap[workerId]?.name || worker.name} asignado en estación.`
      });
    } catch (err) {
      triggerNativeHapticFeedback('error');
      setNotification({
        type: 'error',
        message: err.message || 'Error al consolidar arribo.'
      });
    }
  };

  // 11. Transacción: Confirmar Arribo Físico de operario en tránsito
  const handleOpenTransitConfirm = async (worker) => {
    if (!worker) return;
    
    // Si el supervisor es la Línea 8 (Bolsón), el operario regresa directamente al Bolsón L8
    if (supervisorLineId === "L8") {
      try {
        await acceptReturnToBolson(worker.id);
        triggerNativeHapticFeedback('confirm');
        setNotification({
          type: 'success',
          message: `¡Operario ${worker.name || 'recibido'} de vuelta con éxito en el Bolsón L8!`
        });
      } catch (err) {
        triggerNativeHapticFeedback('error');
        setNotification({
          type: 'error',
          message: err.message || 'Error al recibir al operario de vuelta.'
        });
      }
      return;
    }

    // Si el operario viene para un puesto específico (targetSlotId), lo recibimos de forma automática directa
    if (worker.targetSlotId) {
      await executeArrival(worker, worker.targetSlotId);
      return;
    }

    // De lo contrario (caso manual general sin destino específico), abrir modal de selección
    setTransitConfirmWorker(worker);
    const vacantes = slots.filter(s => s.status === 'VACANTE' || s.status === 'ALERTA_VACANTE');
    setVacantSlotsList(vacantes);
  };

  const handleExecuteTransitArrival = async (slotId) => {
    if (!transitConfirmWorker || !slotId) return;
    triggerNativeHapticFeedback('short');
    
    const worker = transitConfirmWorker;
    setTransitConfirmWorker(null);
    await executeArrival(worker, slotId);
  };

  // 12. Transacción L8: Despachar operario del Bolsón a una línea crítica
  const handleExecuteDispatch = async () => {
    if (!dispatchWorker || !destLineId) return;
    triggerNativeHapticFeedback('short');

    const workerId = dispatchWorker.id;
    setDispatchWorker(null);

    try {
      await dispatchWorkerToLine(workerId, destLineId, selectedDestSlotId || null, "L8");
      triggerNativeHapticFeedback('confirm');
      setNotification({
        type: 'success',
        message: `Operario ${workersMap[workerId]?.name} despachado. En tránsito hacia Línea ${destLineId}.`
      });
    } catch (err) {
      triggerNativeHapticFeedback('error');
      setNotification({
        type: 'error',
        message: err.message || 'Error al despachar relevo.'
      });
    }
  };

  const hasActionAlerts = !!localSwapPair || transitWorkers.length > 0 || activeFatiguedSlots.length > 0;

  return (
    <HudContainer>
      {/* Estilos CSS Inline para soportar Micro-animaciones en Planta */}
      <style>{`
        @keyframes slideDown {
          from { transform: translateY(-24px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes scanLine {
          0% { top: 0; }
          50% { top: 100%; }
          100% { top: 0; }
        }
        @keyframes pulse {
          0% { transform: scale(1); }
          50% { transform: scale(1.05); }
          100% { transform: scale(1); }
        }
        @keyframes feedbackSlideIn {
          from { transform: translateY(30px) scale(0.95); opacity: 0; }
          to { transform: translateY(0) scale(1); opacity: 1; }
        }
        @keyframes progressPulse {
          0%, 100% { box-shadow: 0 0 8px rgba(34, 197, 94, 0.4); }
          50% { box-shadow: 0 0 16px rgba(34, 197, 94, 0.7); }
        }
        #qr-reader-container video {
          width: 100% !important;
          height: 100% !important;
          object-fit: cover !important;
        }
      `}</style>

      {notification && (
        <AlertBanner type={notification.type} id="plant-toast-alert">
          {notification.type === 'error' ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          )}
          <span>{notification.message}</span>
        </AlertBanner>
      )}

      {/* CONTROL DE ARRANQUE EN PISO PARA EL SUPERVISOR — Exigencia y Corrección de Roles */}
      {lineStatus === "PREPARACION" && supervisorLineId !== "L8" && (
        <PreparationBanner id="prep-banner">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
            <span style={{ fontSize: '16px' }}>{allSlotsAssigned ? "🚀" : "⏳"}</span>
            <PreparationBannerText>
              <strong>{allSlotsAssigned ? "Línea Lista" : "En Preparación"}</strong>:{" "}
              {allSlotsAssigned 
                ? "Todos los puestos asignados." 
                : `Faltan ${totalSlotsCount - assignedSlotsCount} puestos por asignar (${assignedSlotsCount}/${totalSlotsCount}).`
              }
            </PreparationBannerText>
          </div>
          <PreparationBannerButton
            disabled={!allSlotsAssigned}
            onClick={async () => {
              triggerNativeHapticFeedback('confirm');
              try {
                const todayStr = new Date().toISOString().split('T')[0];
                const realOrders = await getProgramaProduccionPorFecha(todayStr);
                const matchOrder = realOrders.find(o => o.lineaId === supervisorLineId);
                const skuToUse = matchOrder ? matchOrder.item : (sku && sku !== "SIN SKU" && sku !== "SIN PLANIFICAR" ? sku : "SKU-990-BOST");

                await startLineOfficially(supervisorLineId, skuToUse);
                triggerNativeHapticFeedback('confirm');
                alert(`¡Línea ${supervisorLineId} Iniciada! La jornada laboral ha comenzado oficialmente en el piso.`);
              } catch (err) {
                triggerNativeHapticFeedback('error');
                alert(`Error al iniciar la línea: ${err.message}`);
              }
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
            <span>Iniciar</span>
          </PreparationBannerButton>
        </PreparationBanner>
      )}

      {/* Encabezado del HUD de la línea */}
      <LineHeader>
        <span style={{ fontSize: '12px', fontWeight: 800, color: '#0F172A', marginRight: '4px', flexShrink: 0 }}>
          Línea {supervisorLineId}
        </span>

        <HeaderBadge variant={!isOffline ? "network" : "networkOffline"} id="network-status-badge">
          <span style={{ 
            width: '6px', 
            height: '6px', 
            borderRadius: '50%', 
            backgroundColor: !isOffline ? '$successBorder' : '$dangerBorder',
            display: 'inline-block' 
          }} />
          <span>{!isOffline ? "Conectado" : "Sin Conexión"}</span>
        </HeaderBadge>

        <HeaderBadge variant="sku">
          <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/>
            <path d="m3.3 7 8.7 5 8.7-5"/>
            <path d="M12 22V12"/>
          </svg>
          <span>SKU: {sku}</span>
        </HeaderBadge>

        <HeaderBadge variant="coverage">
          <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
          </svg>
          <span>Cobertura: {slots.filter(s => s.idWorkerCurrent).length}/{slots.length}</span>
        </HeaderBadge>

        <HeaderBadge variant="shift">
          <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
          <span>Turno Matutino</span>
        </HeaderBadge>

        {/* Botón de Fast Onboarding (Inicio Rápido QR Continuo) */}
        {supervisorLineId !== "L8" && (
          <FastOnboardingQRButton 
            id="fast-onboarding-qr-button" 
            onClick={() => handleOpenScanner()}
            title="Iniciar Arranque Rápido Secuencial con QR"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 7V5a2 2 0 0 1 2-2h2" />
              <path d="M17 3h2a2 2 0 0 1 2 2v2" />
              <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
              <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
              <line x1="7" y1="12" x2="17" y2="12" />
            </svg>
            <span>Inicio Rápido</span>
          </FastOnboardingQRButton>
        )}

        {/* Botón de Cierre de Turno (Fase 2) */}
        {supervisorLineId !== "L8" && lineStatus !== "PREPARACION" && (
          <CerrarTurnoButton 
            id="cerrar-turno-button" 
            onClick={handleOpenCerrarTurno}
            title="Cerrar Turno de la Línea y liquidar asignaciones"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            <span>Cerrar Turno</span>
          </CerrarTurnoButton>
        )}
      </LineHeader>

      {/* 🧠 SMART ACTION FEED (CENTRO DE ALERTAS DE ALTA PRIORIDAD) */}
      {hasActionAlerts && (
        <SmartActionFeedContainer id="smart-action-feed">
          {localSwapPair && (
          <ActionFeedCard variant="warning" id="action-local-swap-suggestion">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
              <path d="M3 3v5h5"/>
              <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/>
              <path d="M16 16h5v5"/>
            </svg>
            <ActionFeedTitle>
              <strong>{localSwapPair.reason === "no_l8_resources" ? "Déficit en Bolsón: Rotación Local Sugerida" : "Rotación Local Disponible"}</strong>
              <span>
                {localSwapPair.reason === "no_l8_resources" 
                  ? <>No hay relevistas compatibles en el Bolsón L8. Te sugerimos rotar a <strong>{localSwapPair.workerA.name}</strong> ({localSwapPair.slotA.puestoName}) con el operario estable <strong>{localSwapPair.workerB.name}</strong> ({localSwapPair.slotB.puestoName}) para aliviar la fatiga.</>
                  : <>Puedes rotar a <strong>{localSwapPair.workerA.name}</strong> ({localSwapPair.slotA.puestoName}) con <strong>{localSwapPair.workerB.name}</strong> ({localSwapPair.slotB.puestoName}) para reiniciar fatiga localmente.</>
                }
              </span>
            </ActionFeedTitle>
            <ActionFeedButton variant="warning" onClick={() => setConfirmLocalSwapData({ slotIdA: localSwapPair.slotA.id, slotIdB: localSwapPair.slotB.id })} id="execute-local-swap-suggestion-btn">
              Rotar Operarios
            </ActionFeedButton>
          </ActionFeedCard>
        )}

        {transitWorkers.map(tw => {
          const destSlot = tw.targetSlotId ? allSlots.find(s => s.id === tw.targetSlotId) : null;
          const destName = destSlot ? destSlot.puestoName : 'Estación';
          const relievedWorkerId = destSlot ? destSlot.idWorkerCurrent : null;
          const relievedWorker = relievedWorkerId ? workersMap[relievedWorkerId] : null;

          const relocationInfo = (relievedWorker && destSlot)
            ? getRelocationDestination(relievedWorker, destSlot, allSlots, workersMap, priorityOrder)
            : null;

          return (
            <ActionFeedCard key={tw.id} variant="transit" id={`action-transit-${tw.id}`}>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 3h5v5"/>
                <path d="M8 21H3v-5"/>
                <path d="M12 12 21 3"/>
                <path d="m12 12-9 9"/>
              </svg>
              <ActionFeedTitle>
                <strong>Relevista en Camino: {tw.name}</strong>
                <span>En tránsito hacia {destName} (Ficha: {tw.id})</span>
                {relocationInfo && (
                  <span style={{ 
                    display: 'block', 
                    marginTop: '6px', 
                    padding: '6px 10px', 
                    backgroundColor: '#F1F5F9', 
                    borderRadius: '6px',
                    fontSize: '10px',
                    color: '#475569',
                    border: '1px solid #E2E8F0',
                    lineHeight: 1.3
                  }}>
                    🔄 <strong>Destino al relevar:</strong> {relievedWorker.name} se reubicará en:<br/>
                    <strong style={{ color: '#0F172A' }}>📍 {relocationInfo.label}</strong>
                  </span>
                )}
              </ActionFeedTitle>
              <ActionFeedButton variant="transit" onClick={() => handleOpenTransitConfirm(tw)}>
                Recibir
              </ActionFeedButton>
            </ActionFeedCard>
          );
        })}

        {activeFatiguedSlots.map(slot => {
          const workerId = slot.idWorkerCurrent;
          const worker = workersMap[workerId];
          const workerName = worker ? worker.name : "Operario";
          const elapsed = getElapsedMinutes(slot.asignadoEnSegundoVirtual);
          const isCritico = elapsed >= 120;

          const isRelevistaInTransit = transitWorkers.some(tw => tw.targetSlotId === slot.id);
          const isRelevoPending = slot.relevoSolicitado;
          const isRequestDisabled = isRelevistaInTransit || isRelevoPending;

          const sameLineSlots = slots.filter(s => s.lineId === slot.lineId && s.id !== slot.id);
          const hasLocalOption = worker && sameLineSlots.some(slotB => {
            if (slotB.status !== "ASIGNADO" || !slotB.idWorkerCurrent) return false;
            const esFijoB = ["Operador A", "Averiero", "Operador C"].includes(slotB.tipoPuesto);
            if (esFijoB) return false;
            if (getBaseName(slot.puestoName) === getBaseName(slotB.puestoName)) return false;
            const workerB = workersMap[slotB.idWorkerCurrent];
            if (!workerB) return false;
            return canWorkerOccupiedSlot(worker, slotB) && canWorkerOccupiedSlot(workerB, slot);
          });

          return (
            <ActionFeedCard 
              key={slot.id} 
              variant={isCritico ? 'danger' : 'warning'} 
              id={`action-fatigue-${slot.id}`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
                <line x1="12" y1="9" x2="12" y2="13"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              <ActionFeedTitle>
                <strong>Puesto "{slot.puestoName}" Fatigado</strong>
                <span>{workerName} lleva {elapsed} min. activo en esta celda.</span>
                {hasLocalOption && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '6px', color: '#6D28D9', fontSize: '10.5px', fontWeight: 'bold' }}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10"/>
                      <line x1="12" y1="16" x2="12" y2="12"/>
                      <line x1="12" y1="8" x2="12.01" y2="8"/>
                    </svg>
                    <span>💡 Rotación manual local disponible en menú de celda</span>
                  </div>
                )}
              </ActionFeedTitle>
              <ActionFeedButton 
                variant={isCritico ? 'danger' : 'warning'} 
                disabled={true}
                onClick={() => {}}
                style={{ backgroundColor: '#E2E8F0', color: '#4B5563', cursor: 'default', border: '1px solid #CBD5E1', boxShadow: 'none' }}
              >
                {isRelevistaInTransit ? "En Camino" : isRelevoPending ? "Esperando Despacho (L8)" : "Solicitado"}
              </ActionFeedButton>
            </ActionFeedCard>
          );
        })}
        </SmartActionFeedContainer>
      )}

      {/* 🔵 PANEL DE DESPACHO DE BOLSÓN EXCLUSIVO DE L8 */}
      {supervisorLineId === "L8" && (
        <BolsonDeskContainer id="l8-bolson-desk">
          <div style={{ borderBottom: '1px solid #E2E8F0', paddingBottom: '8px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 700, color: '$textPrimary', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10"/>
                <path d="m12 8-4 4 4 4M16 12H8"/>
              </svg>
              <span>Despacho de Relevos del Bolsón</span>
            </h3>
            <p style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>
              Envía operarios disponibles de ensamble manual hacia líneas críticas activas con vacantes.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '180px', overflowY: 'auto' }}>
            {availableWorkers.length === 0 ? (
              <div style={{ fontSize: '12px', color: '#94A3B8', textAlign: 'center', padding: '16px 0', border: '1px dashed #E2E8F0', borderRadius: '8px' }}>
                No hay operarios disponibles laborando en las mesas de la L8 actualmente.
              </div>
            ) : (
              availableWorkers.map(w => (
                <div key={w.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', border: '1px solid #E2E8F0', borderRadius: '8px', backgroundColor: '#F8FAFC' }}>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <strong style={{ fontSize: '12px', color: '#1E293B' }}>{w.name}</strong>
                    <span style={{ fontSize: '10px', color: '#64748B', fontFamily: 'monospace' }}>Ficha: {w.id} ── {w.role}</span>
                  </div>
                  <button
                    onClick={() => setDispatchWorker(w)}
                    style={{
                      padding: '5px 10px',
                      backgroundColor: '$accent',
                      color: '#FFFFFF',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    <span>Despachar</span>
                  </button>
                </div>
              ))
            )}
          </div>
        </BolsonDeskContainer>
      )}

      {/* 📋 PANEL DE CONTROL DE ORDEN DE PRODUCCIÓN (Fase 1) */}
      {supervisorLineId !== "L8" && lineStatus !== "PREPARACION" && (
        <div style={{
          padding: '14px 16px',
          borderRadius: '12px',
          backgroundColor: '#FFFFFF',
          border: '1px solid #E2E8F0',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
          marginBottom: '12px'
        }} id="production-order-control-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '14px' }}>📋</span>
              <strong style={{ fontSize: '12px', color: '#1E293B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Orden de Producción Activa
              </strong>
            </div>
            <span style={{
              padding: '4px 10px',
              borderRadius: '20px',
              fontSize: '10px',
              fontWeight: 700,
              backgroundColor: lineStatus === 'LIMPIEZA' ? '#FEF3C7' : lineStatus === 'PARO' ? '#FEE2E2' : '#DCFCE7',
              color: lineStatus === 'LIMPIEZA' ? '#D97706' : lineStatus === 'PARO' ? '#EF4444' : '#15803D'
            }}>
              {lineStatus === 'LIMPIEZA' ? '⚙️ LIMPIEZA / SETUP' : lineStatus === 'PARO' ? '⚠️ PARO TÉCNICO' : '🚀 EN PRODUCCIÓN'}
            </span>
          </div>

          {lineStatus === 'LIMPIEZA' ? (
            <div>
              <p style={{ fontSize: '11px', color: '#64748B', margin: '0 0 10px 0', lineHeight: 1.4 }}>
                La orden anterior ha finalizado. La línea se encuentra en fase de limpieza y adecuación de puestos. Por favor, selecciona la siguiente orden para iniciarla:
              </p>
              
              <select
                value={selectedNextOrderId}
                onChange={(e) => setSelectedNextOrderId(e.target.value)}
                style={{
                  width: '100%',
                  height: '38px',
                  borderRadius: '8px',
                  border: '1px solid #CBD5E1',
                  backgroundColor: '#F8FAFC',
                  fontSize: '11.5px',
                  fontWeight: 600,
                  color: '#334155',
                  padding: '0 10px',
                  marginBottom: '10px',
                  outline: 'none'
                }}
              >
                <option value="">-- Seleccionar Siguiente Orden --</option>
                {lineOrders.map(o => (
                  <option key={o.id} value={o.id}>
                    {o.ordenProceso} - {o.item} ({o.producto || 'Sin descripción'})
                  </option>
                ))}
              </select>

              <button
                disabled={!selectedNextOrderId}
                onClick={async () => {
                  triggerNativeHapticFeedback('confirm');
                  const nextOrder = lineOrders.find(o => o.id === selectedNextOrderId);
                  if (!nextOrder) return;

                  try {
                    // Realizar transición de SKU atómica
                    await transitionLineToSku(supervisorLineId, sku, nextOrder.item);
                    triggerNativeHapticFeedback('confirm');
                    setNotification({
                      type: 'success',
                      message: `¡Orden ${nextOrder.ordenProceso} Iniciada! Se reconfiguraron los puestos para ${nextOrder.item}.`
                    });
                    setSelectedNextOrderId("");
                  } catch (err) {
                    triggerNativeHapticFeedback('error');
                    alert(`Error en transición: ${err.message}`);
                  }
                }}
                style={{
                  width: '100%',
                  height: '44px',
                  borderRadius: '10px',
                  backgroundColor: selectedNextOrderId ? '#2563EB' : '#94A3B8',
                  color: '#FFFFFF',
                  border: 'none',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: selectedNextOrderId ? 'pointer' : 'not-allowed',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: selectedNextOrderId ? '0 2px 4px rgba(37, 99, 235, 0.2)' : 'none',
                  transition: 'all 0.15s ease'
                }}
              >
                <span>Iniciar Siguiente Orden</span>
              </button>
            </div>
          ) : (
            <div>
              <div style={{
                backgroundColor: '#F8FAFC',
                border: '1px solid #F1F5F9',
                borderRadius: '8px',
                padding: '10px 12px',
                marginBottom: '10px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <div>
                  <span style={{ fontSize: '9px', color: '#64748B', textTransform: 'uppercase', fontWeight: 700 }}>Código de Orden / SKU</span>
                  <strong style={{ fontSize: '13px', color: '#0F172A', display: 'block', marginTop: '2px' }}>
                    {sku}
                  </strong>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: '9px', color: '#64748B', textTransform: 'uppercase', fontWeight: 700 }}>Puestos Activos</span>
                  <strong style={{ fontSize: '13px', color: '#4F46E5', display: 'block', marginTop: '2px' }}>
                    {totalSlotsCount} Puestos
                  </strong>
                </div>
              </div>

              {/* Lista de próximas órdenes */}
              {lineOrders.length > 1 && (
                <div style={{ marginBottom: '10px' }}>
                  <span style={{ fontSize: '9px', color: '#94A3B8', fontWeight: 800, textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
                    Próximas Órdenes Programadas:
                  </span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {lineOrders.filter(o => o.item !== sku).slice(0, 2).map(o => (
                      <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#475569', backgroundColor: '#FAF5FF', padding: '4px 8px', borderRadius: '4px' }}>
                        <span><strong>{o.ordenProceso}</strong>: {o.producto}</span>
                        <span style={{ fontWeight: 700, color: '#7C3AED' }}>{o.item}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <button
                onClick={async () => {
                  if (confirm("¿Estás seguro de finalizar la orden de producción actual e iniciar la fase de limpieza?")) {
                    triggerNativeHapticFeedback('confirm');
                    try {
                      await updateDoc(doc(db, "config", `line_${supervisorLineId}`), {
                        status: "LIMPIEZA",
                        updatedAt: serverTimestamp()
                      });
                      
                      // Registrar evento de SKU finalizado
                      try {
                        const skuToUse = sku && sku !== "Cargando SKU..." && sku !== "SIN SKU" && sku !== "SIN PLANIFICAR" ? sku : "SKU-990-BOST";
                        await registerSkuFinishedEvent(supervisorLineId, skuToUse);
                      } catch (skuEvErr) {
                        console.warn("[HUD Finalizar] Error al registrar evento de SKU finalizado:", skuEvErr);
                      }

                      setNotification({
                        type: 'success',
                        message: "¡Orden Finalizada! La línea ha entrado en fase de Limpieza y Setup y se registró el fin de producción del SKU."
                      });
                    } catch (err) {
                      triggerNativeHapticFeedback('error');
                      alert(`Error al finalizar orden: ${err.message}`);
                    }
                  }
                }}
                style={{
                  width: '100%',
                  height: '44px',
                  borderRadius: '10px',
                  backgroundColor: '#DC2626',
                  color: '#FFFFFF',
                  border: 'none',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 2px 4px rgba(220, 38, 38, 0.2)',
                  transition: 'all 0.15s ease'
                }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                </svg>
                <span>Finalizar Orden / Limpieza</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Malla principal de puestos operacionales */}
      {/* Lista principal de puestos operacionales agrupados */}
      <SlotsList id="hud-slots-list">
        {slots.length === 0 ? (
          <div style={{ 
            textAlign: 'center', 
            padding: '64px 20px', 
            color: '#94A3B8', 
            fontSize: '13px',
            backgroundColor: '#FFFFFF',
            border: '1px solid #E2E8F0',
            borderRadius: '12px'
          }}>
            No hay puestos operacionales registrados en esta línea o el turno no ha iniciado.
          </div>
        ) : (
          (() => {
            const fijos = slots.filter(slot => 
              slot.tipoPuesto && ["Operador A", "Averiero", "Operador C"].includes(slot.tipoPuesto)
            );
            const varios = slots.filter(slot => 
              !slot.tipoPuesto || !["Operador A", "Averiero", "Operador C"].includes(slot.tipoPuesto)
            );

            const renderSlotCard = (slot) => {
              const currentWorkerId = slot.idWorkerCurrent;
              const workerDetails = currentWorkerId ? workersMap[currentWorkerId] : null;
              const isReplacement = currentWorkerId && slot.idWorkerOriginal !== currentWorkerId;
              
              const workerProp = workerDetails ? {
                id: workerDetails.id,
                name: workerDetails.name,
                role: workerDetails.role,
                isReplacement: isReplacement
              } : null;

              return (
                <SlotCard
                  key={slot.id}
                  slotId={slot.id}
                  slotName={slot.puestoName}
                  worker={workerProp}
                  status={slot.status}
                  isOffline={isOffline}
                  onActionClick={handleSlotClick}
                  onRelevoClick={handleDirectRelevoClick}
                  asignadoEnSegundoVirtual={slot.asignadoEnSegundoVirtual}
                  tipoPuesto={slot.tipoPuesto}
                  relevoSolicitado={slot.relevoSolicitado}
                  relevistaInTransit={transitWorkers.some(tw => tw.targetSlotId === slot.id)}
                />
              );
            };

            return (
              <>
                {/* CATEGORÍA 1: PUESTOS FIJOS */}
                <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
                  <SubSectionTitle>
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                    </svg>
                    <span>Puestos Fijos ({fijos.length})</span>
                  </SubSectionTitle>
                  <SlotsGroup>
                    {fijos.length === 0 ? (
                      <div style={{ padding: '16px', color: '#94A3B8', fontSize: '12px', textAlign: 'center', backgroundColor: '#FFFFFF' }}>
                        Sin puestos técnicos asignados en esta línea.
                      </div>
                    ) : (
                      fijos.map(slot => renderSlotCard(slot))
                    )}
                  </SlotsGroup>
                </div>

                {/* CATEGORÍA 2: PERSONAL ROTATIVO */}
                <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
                  <SubSectionTitle>
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17 2.1l4 4-4 4"/>
                      <path d="M3 12a9 9 0 0 1 15-6.7L21 6"/>
                      <path d="M7 21.9l-4-4 4-4"/>
                      <path d="M21 12a9 9 0 0 1-15 6.7L3 18"/>
                    </svg>
                    <span>Personal Rotativo ({varios.length})</span>
                  </SubSectionTitle>
                  <SlotsGroup>
                    {varios.length === 0 ? (
                      <div style={{ padding: '16px', color: '#94A3B8', fontSize: '12px', textAlign: 'center', backgroundColor: '#FFFFFF' }}>
                        Sin puestos rotativos asignados en esta línea.
                      </div>
                    ) : (
                      varios.map(slot => renderSlotCard(slot))
                    )}
                  </SlotsGroup>
                </div>
              </>
            );
          })()
        )}
      </SlotsList>

      {/* 📲 CAJÓN ÚNICO DINÁMICO DE PLANTA (Single Bottom Sheet Drawer) */}
      {sheetOpen && (
        <DrawerOverlay onClick={() => setSheetOpen(false)} id="search-drawer-overlay">
          <DrawerContent onClick={(e) => e.stopPropagation()}>
            {sheetMode === 'search' && (
              <>
                <DrawerHeader>
                  <DrawerTitle>Asignar Operario: {selectedSlotName}</DrawerTitle>
                  <CloseTextButton onClick={() => setSheetOpen(false)}>Cerrar</CloseTextButton>
                </DrawerHeader>

                <SearchInput 
                  type="text" 
                  placeholder="Buscar por nombre o número de nómina..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  autoFocus
                />


                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '8px 0 4px 0' }}>
                  <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>
                    Disponibles en Planta ({filteredWorkers.length})
                  </span>
                  
                  <button
                    onClick={() => {
                      setSheetOpen(false);
                      handleOpenScanner(selectedSlotId);
                    }}
                    style={{
                      padding: '8px 14px',
                      minHeight: '36px',
                      backgroundColor: '#DBEAFE',
                      color: '#2563EB',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 7V5a2 2 0 0 1 2-2h2" />
                      <path d="M17 3h2a2 2 0 0 1 2 2v2" />
                      <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
                      <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
                      <line x1="7" y1="12" x2="17" y2="12" />
                    </svg>
                    <span>Usar Lector QR</span>
                  </button>
                </div>

                <WorkersListContainer id="available-workers-list">
                  {filteredWorkers.length === 0 ? (
                    <div style={{ 
                      textAlign: 'center', 
                      padding: '32px 10px', 
                      color: '#94A3B8', 
                      fontSize: '12px',
                      backgroundColor: '#F8FAFC',
                      borderRadius: '8px',
                      border: '1px dashed #E2E8F0'
                    }}>
                      Ningún operario compatible libre en el Pool o Bolsón actualmente.
                    </div>
                  ) : (
                    filteredWorkers.map(w => (
                      <AvailableWorkerCard 
                        key={w.id}
                        onClick={() => {
                          setConfirmWorker(w);
                          setSheetMode('confirm');
                        }}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <span style={{ fontSize: '13px', fontWeight: 600, color: '#1E293B' }}>{w.name}</span>
                          <span style={{ fontSize: '11px', color: '#64748B', fontFamily: 'monospace' }}>Nómina: {w.id}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ 
                            fontSize: '9px', 
                            fontWeight: 700, 
                            padding: '3px 8px', 
                            borderRadius: '4px',
                            backgroundColor: w.status === 'DISPONIBLE_BOLSON' ? '$successBg' : '$infoBg',
                            color: w.status === 'DISPONIBLE_BOLSON' ? '$successBorder' : '$accent',
                            border: `1px solid ${w.status === 'DISPONIBLE_BOLSON' ? '#BBF7D0' : '#BFDBFE'}`
                          }}>
                            {w.status === 'DISPONIBLE_BOLSON' ? 'Bolsón' : 'Pool'}
                          </span>
                          <span style={{ fontSize: '10px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>
                            {w.role}
                          </span>
                        </div>
                      </AvailableWorkerCard>
                    ))
                  )}
                </WorkersListContainer>
              </>
            )}

            {sheetMode === 'confirm' && confirmWorker && (
              <>
                <DrawerHeader>
                  <DrawerTitle>Verificación de Gafete</DrawerTitle>
                  <CloseTextButton onClick={() => setSheetOpen(false)}>Cerrar</CloseTextButton>
                </DrawerHeader>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '12px', padding: '10px 0' }}>
                  <OperatorPhoto 
                    src={`https://api.dicebear.com/7.x/adventurer/svg?seed=${confirmWorker.id}`}
                    alt={confirmWorker.name}
                  />
                  <div>
                    <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#1E293B' }}>
                      {confirmWorker.name}
                    </h3>
                    <p style={{ fontSize: '11px', color: '#64748B', fontFamily: 'monospace', marginTop: '2px' }}>
                      Nómina: {confirmWorker.id} ── Rol: {confirmWorker.role}
                    </p>
                  </div>
                </div>

                <ConfirmationHealthBox hasRestrictions={confirmWorker.medicalRestrictions && confirmWorker.medicalRestrictions.length > 0}>
                  <div style={{ fontWeight: 700, fontSize: '10px', textTransform: 'uppercase', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {confirmWorker.medicalRestrictions && confirmWorker.medicalRestrictions.length > 0 ? (
                      <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
                        <line x1="12" y1="9" x2="12" y2="13"/>
                        <line x1="12" y1="17" x2="12.01" y2="17"/>
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                        <polyline points="22 4 12 14.01 9 11.01"/>
                      </svg>
                    )}
                    <span>Ficha Médica de Enfermería</span>
                  </div>
                  
                  {confirmWorker.medicalRestrictions && confirmWorker.medicalRestrictions.length > 0 ? (
                    <div>
                      <strong style={{ display: 'block', marginBottom: '2px' }}>Restricciones Médicas Activas:</strong>
                      {confirmWorker.medicalRestrictions.join(', ')}
                    </div>
                  ) : (
                    <span>Salud Aprobada: Apto para tareas físicas críticas.</span>
                  )}
                </ConfirmationHealthBox>

                {(() => {
                  const currentSlot = slots.find(s => s.id === selectedSlotId);
                  if (!currentSlot || !confirmWorker) return null;

                  const roleCompatible = isWorkerRoleCompatibleWithSlot(confirmWorker.role, currentSlot.tipoPuesto, currentSlot.puestoName);
                  const requiresPhysical = currentSlot.requiredCapabilities && currentSlot.requiredCapabilities.includes("ESFUERZO_FISICO");
                  const hasMedicalRestriction = confirmWorker.medicalRestrictions && confirmWorker.medicalRestrictions.includes("ESFUERZO_FISICO");
                  const isMedicalCompatible = !(requiresPhysical && hasMedicalRestriction);
                  
                  const isHardCompatible = roleCompatible && isMedicalCompatible;

                  const rawPref = currentSlot.sexoPreferente || "Indistinto";
                  const normalizedPref = rawPref.trim().toLowerCase();
                  const isValidGender = ["masculino", "femenino", "femenina", "masculina"].includes(normalizedPref);
                  const preferedSex = isValidGender ? rawPref : "Indistinto";

                  let isGenderCompatible = true;
                  if (preferedSex !== "Indistinto") {
                    const normPref = preferedSex.trim().toLowerCase().replace(/a$/, "o");
                    const wSex = confirmWorker.sexo || "Masculino";
                    const normWSex = wSex.trim().toLowerCase().replace(/a$/, "o");
                    isGenderCompatible = (normWSex === normPref);
                  }

                  return (
                    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                      {!isHardCompatible && (
                        <div style={{ 
                          padding: '10px 12px', 
                          backgroundColor: '#FEF2F2', 
                          border: '1.5px solid #FCA5A5', 
                          borderRadius: '8px', 
                          color: '#991B1B', 
                          fontSize: '11.5px', 
                          fontWeight: 700,
                          textAlign: 'center',
                          lineHeight: 1.4,
                          marginBottom: '4px'
                        }}>
                          ⚠️ ASIGNACIÓN BLOQUEADA:<br/>
                          El perfil del operario (rol o restricciones médicas) es incompatible con los requerimientos técnicos de esta celda operativa.
                        </div>
                      )}
                      {isHardCompatible && !isGenderCompatible && (
                        <div style={{ 
                          padding: '10px 12px', 
                          backgroundColor: '#FFF7ED', 
                          border: '1.5px solid #FED7AA', 
                          borderRadius: '8px', 
                          color: '#C2410C', 
                          fontSize: '11.5px', 
                          fontWeight: 700,
                          textAlign: 'center',
                          lineHeight: 1.4,
                          marginBottom: '4px'
                        }}>
                          ⚠️ ADVERTENCIA DE GÉNERO:<br/>
                          El género del operario ({confirmWorker.sexo || 'Femenino'}) no coincide con el sexo preferente del puesto ({currentSlot.sexoPreferente}).
                        </div>
                      )}
                      <ConfirmButton 
                        onClick={handleConfirmAssignment} 
                        id="modal-confirm-assign-button"
                        disabled={!isHardCompatible}
                        style={{ 
                          opacity: isHardCompatible ? 1 : 0.5, 
                          cursor: isHardCompatible ? 'pointer' : 'not-allowed',
                          backgroundColor: isHardCompatible ? '#16A34A' : '#94A3B8',
                          backgroundImage: isHardCompatible ? 'linear-gradient(135deg, #22C55E 0%, #16A34A 100%)' : 'none'
                        }}
                      >
                        Confirmar Asignación
                      </ConfirmButton>
                      <CancelButton onClick={() => { setConfirmWorker(null); setSheetMode('search'); }}>
                        Regresar a la Búsqueda
                      </CancelButton>
                    </div>
                  );
                })()}
              </>
            )}

            {sheetMode === 'context' && selectedSlotWorker && (
              <>
                <DrawerHeader>
                  <DrawerTitle>Control de Celda: {selectedSlotName}</DrawerTitle>
                  <CloseTextButton onClick={() => setSheetOpen(false)}>Cerrar</CloseTextButton>
                </DrawerHeader>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', borderBottom: '1px solid #E2E8F0', paddingBottom: '12px', marginBottom: '4px' }}>
                  <span style={{ fontSize: '10px', textTransform: 'uppercase', color: '$textSecondary', fontWeight: 700 }}>
                    Operario Asignado
                  </span>
                  <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#1E293B' }}>
                    {selectedSlotWorker.name}
                  </h3>
                  <p style={{ fontSize: '11px', color: '$textSecondary', fontFamily: 'monospace' }}>
                    Ficha: {selectedSlotWorker.id} ── Rol: {selectedSlotWorker.role}
                  </p>
                </div>

                <div style={{ marginBottom: '12px', marginTop: '8px' }}>
                  <ToggleContainer id="worker-doble-turno-toggle">
                    <ToggleLabel>Trabajar Doble Turno</ToggleLabel>
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                      <SwitchInput 
                        type="checkbox"
                        checked={!!(workersMap[selectedSlotWorker.id]?.dobleTurnoActivo)}
                        onChange={async (e) => {
                          const newStatus = e.target.checked;
                          triggerNativeHapticFeedback('short');
                          try {
                            await updateWorkerDobleTurno(selectedSlotWorker.id, newStatus);
                            setNotification({
                              type: 'success',
                              message: `Doble turno ${newStatus ? 'activado' : 'desactivado'} para ${selectedSlotWorker.name}.`
                            });
                          } catch (err) {
                            triggerNativeHapticFeedback('error');
                            setNotification({
                              type: 'error',
                              message: `Fallo al actualizar doble turno: ${err.message}`
                            });
                          }
                        }}
                      />
                      <SwitchSlider />
                    </div>
                  </ToggleContainer>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {(() => {
                    const clickedSlotObj = slots.find(s => s.id === selectedSlotId);
                    if (!clickedSlotObj) return null;
                    const esFijo = ["Operador A", "Averiero", "Operador C"].includes(clickedSlotObj.tipoPuesto);
                    if (esFijo) return null;

                    const asignado = selectedSlotWorker.asignadoEnSegundoVirtual;
                    if (!asignado) return null;
                    let ms = 0;
                    if (typeof asignado.toDate === 'function') {
                      ms = asignado.toDate().getTime();
                    } else if (asignado.seconds) {
                      ms = asignado.seconds * 1000;
                    } else {
                      ms = new Date(asignado).getTime();
                    }
                    const isRelevistaInTransit = transitWorkers.some(tw => tw.targetSlotId === selectedSlotId);
                    const isRelevoPending = clickedSlotObj.relevoSolicitado;
                    const elapsedMinutes = Math.max(0, Math.floor((Date.now() - ms) / 60000));

                    const swapCandidates = findLocalSwapCandidates();

                    return (
                      <>
                        {isRelevistaInTransit ? (
                          <ContextMenuItem 
                            variant="secondary" 
                            disabled
                            id="menu-request-relevo-button-disabled"
                            style={{ backgroundColor: '#E2E8F0', color: '#94A3B8', cursor: 'not-allowed' }}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M21.5 2v6h-6"/>
                              <path d="M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
                            </svg>
                            <span>Relevista en camino</span>
                          </ContextMenuItem>
                        ) : isRelevoPending ? (
                          <ContextMenuItem 
                            variant="secondary" 
                            disabled
                            id="menu-request-relevo-button-disabled"
                            style={{ backgroundColor: '#E2E8F0', color: '#4B5563', cursor: 'not-allowed' }}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M21.5 2v6h-6"/>
                              <path d="M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
                            </svg>
                            <span>Esperando despacho (L8)</span>
                          </ContextMenuItem>
                        ) : (
                          <ContextMenuItem 
                            variant="purple" 
                            onClick={() => setConfirmRelevoSlotId(selectedSlotId)}
                            id="menu-request-relevo-button"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M21.5 2v6h-6"/>
                              <path d="M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
                            </svg>
                            <span>{elapsedMinutes >= 105 ? "Pedir Relevo Automático (Motor 3)" : `Pedir Relevo (Activo: ${elapsedMinutes}m)`}</span>
                          </ContextMenuItem>
                        )}

                        {swapCandidates.map(c => {
                          const isBLocallyFatigued = getElapsedMinutes(c.slotB.asignadoEnSegundoVirtual) >= 105 || c.slotB.relevoSolicitado;
                          return (
                            <ContextMenuItem
                              key={c.slotB.id}
                              variant="purple"
                              onClick={() => {
                                setConfirmLocalSwapData({ slotIdA: selectedSlotId, slotIdB: c.slotB.id });
                                setSheetOpen(false);
                              }}
                              style={{
                                border: isBLocallyFatigued ? '2px solid #D97706' : '2px solid #8B5CF6',
                                backgroundColor: isBLocallyFatigued ? '#FFFBEB' : '#F5F3FF',
                                color: isBLocallyFatigued ? '#B45309' : '#6D28D9',
                                fontWeight: 'bold'
                              }}
                              id={`menu-local-swap-button-${c.slotB.id}`}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="m16 3 4 4-4 4"/>
                                <path d="M20 7H4"/>
                                <path d="m8 21-4-4 4-4"/>
                                <path d="M4 17h16"/>
                              </svg>
                              <span>
                                Intercambio con {c.workerB.name} ({c.slotB.puestoName})
                                {isBLocallyFatigued ? " [Fatigado]" : " [Estable]"}
                              </span>
                            </ContextMenuItem>
                          );
                        })}
                      </>
                    );
                  })()}

                  <ContextMenuItem 
                    variant="primary" 
                    onClick={() => setConfirmReleaseSlotId(selectedSlotId)}
                    id="menu-release-worker-button"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                    </svg>
                    <span>Liberar Operario al Bolsón (L8)</span>
                  </ContextMenuItem>

                  <ContextMenuItem 
                    variant="danger" 
                    onClick={() => setConfirmBajaSlotId(selectedSlotId)}
                    id="menu-temp-baja-button"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 9v4M12 17h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/>
                    </svg>
                    <span>Registrar Baja Temporal</span>
                  </ContextMenuItem>

                  <ContextMenuItem variant="secondary" onClick={() => setSheetOpen(false)}>
                    <span>Cancelar</span>
                  </ContextMenuItem>
                </div>
              </>
            )}

            {sheetMode === 'diagnostics' && diagnosticsWorker && (
              <>
                <DrawerHeader>
                  <DrawerTitle style={{ color: '#E11D48', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10"/>
                      <line x1="12" y1="16" x2="12" y2="12"/>
                      <line x1="12" y1="8" x2="12.01" y2="8"/>
                    </svg>
                    <span>Diagnóstico de Smart Matchmaking</span>
                  </DrawerTitle>
                  <CloseTextButton onClick={() => setSheetOpen(false)}>Cerrar</CloseTextButton>
                </DrawerHeader>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid #E2E8F0', paddingBottom: '12px', marginBottom: '14px' }}>
                  <div style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    backgroundColor: '#FFE4E6',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '20px'
                  }}>
                    🕵️‍♂️
                  </div>
                  <div>
                    <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#1E293B' }}>
                      {diagnosticsWorker.name}
                    </h3>
                    <p style={{ fontSize: '11px', color: '#64748B', fontFamily: 'monospace', marginTop: '2px' }}>
                      Ficha: {diagnosticsWorker.id} ── Rol: {diagnosticsWorker.role}
                    </p>
                  </div>
                </div>

                <div style={{ fontSize: '12px', color: '#475569', marginBottom: '12px', lineHeight: 1.4 }}>
                  El algoritmo de SmartAssign ha evaluado a este operario contra todos los puestos vacantes de esta línea y ha bloqueado la asignación debido a los siguientes conflictos detectados:
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '280px', overflowY: 'auto', paddingRight: '4px', marginBottom: '16px' }}>
                  {diagnosticsData.length === 0 ? (
                    <div style={{ padding: '20px', color: '#94A3B8', fontSize: '12px', border: '1px dashed #E2E8F0', borderRadius: '12px', textAlign: 'center', backgroundColor: '#F8FAFC' }}>
                      No hay puestos vacantes en esta línea para analizar.
                    </div>
                  ) : (
                    diagnosticsData.map(diag => {
                      return (
                        <div 
                          key={diag.slotId} 
                          style={{ 
                            padding: '12px', 
                            border: '1.5px solid #F1F5F9', 
                            borderRadius: '10px', 
                            backgroundColor: '#F8FAFC',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '6px'
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <strong style={{ fontSize: '12px', color: '#1E293B' }}>{diag.puestoName}</strong>
                            <span style={{ fontSize: '9px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', backgroundColor: '#E2E8F0', color: '#475569' }}>
                              {diag.tipoPuesto}
                            </span>
                          </div>

                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '2px' }}>
                            {/* 1. ROL */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px' }}>
                              <span>{diag.isRoleCompatible ? "🟢" : "🔴"}</span>
                              <span style={{ color: diag.isRoleCompatible ? '#15803D' : '#991B1B', fontWeight: 500 }}>
                                {diag.isRoleCompatible 
                                  ? `Rol compatible` 
                                  : `Rol no calificado (Puesto requiere ${diag.tipoPuesto}, trabajador es ${diagnosticsWorker.role})`
                                }
                              </span>
                            </div>

                            {/* 2. LOCALIZACION (ARRANQUE AISLADO) */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px' }}>
                              <span>{diag.isLocationCompatible ? "🟢" : "🔴"}</span>
                              <span style={{ color: diag.isLocationCompatible ? '#15803D' : '#991B1B', fontWeight: 500 }}>
                                {diag.isLocationCompatible 
                                  ? `Ubicación física aprobada` 
                                  : `Arranque Aislado activo (Trabajador ubicado físicamente en ${diagnosticsWorker.physicalLineLocation || 'otra línea'} y no en la local ${supervisorLineId})`
                                }
                              </span>
                            </div>

                            {/* 3. CAPACIDADES MEDICAS */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px' }}>
                              <span>{diag.isMedicalCompatible ? "🟢" : "🔴"}</span>
                              <span style={{ color: diag.isMedicalCompatible ? '#15803D' : '#991B1B', fontWeight: 500 }}>
                                {diag.isMedicalCompatible 
                                  ? `Apto médicamente` 
                                  : `Exclusión Médica: Puesto requiere ESFUERZO_FISICO y operario tiene esta restricción activa.`
                                }
                              </span>
                            </div>

                            {/* 4. GÉNERO */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px' }}>
                              <span>{diag.isGenderCompatible ? "🟢" : "🔴"}</span>
                              <span style={{ color: diag.isGenderCompatible ? '#15803D' : '#991B1B', fontWeight: 500 }}>
                                {diag.isGenderCompatible 
                                  ? `Género compatible (Preferencia: ${diag.preferedSex})` 
                                  : `Género incompatible (Puesto prefiere ${diag.preferedSex}, trabajador es ${diagnosticsWorker.sexo || 'Masculino'})`
                                }
                              </span>
                            </div>

                            {/* 5. HISTORIAL ERGONÓMICO */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px' }}>
                              <span>{diag.isErgonomicCompatible ? "🟢" : "🔴"}</span>
                              <span style={{ color: diag.isErgonomicCompatible ? '#15803D' : '#991B1B', fontWeight: 500 }}>
                                {diag.isErgonomicCompatible 
                                  ? `Sin fatiga por rotación ergonómica de 24h` 
                                  : `Fatiga Ergonómica: Operario realizó la actividad "${diagnosticsWorker.lastActivity || activityName}" al cierre de ayer. Regla de no repetición de 24h activa.`
                                }
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <ConfirmButton 
                  onClick={() => setSheetOpen(false)} 
                  style={{ backgroundColor: '#475569', backgroundImage: 'none' }}
                >
                  Entendido, Cerrar Diagnóstico
                </ConfirmButton>
              </>
            )}
          </DrawerContent>
        </DrawerOverlay>
      )}

      {/* 🔴 MODAL DE CONFIRMACIÓN DE ARRIBO (TRÁNSITO) */}
      {transitConfirmWorker && (
        <ConfirmationOverlay onClick={() => setTransitConfirmWorker(null)} id="transit-confirm-modal">
          <ConfirmationContent onClick={(e) => e.stopPropagation()} style={{ maxWidth: '400px' }}>
            <OperatorPhoto src={`https://api.dicebear.com/7.x/adventurer/svg?seed=${transitConfirmWorker.id}`} />
            
            <div style={{ marginBottom: '8px' }}>
              <span style={{ fontSize: '10px', color: '#7C3AED', fontWeight: 700, textTransform: 'uppercase' }}>
                Confirmar Recepción de Relevo
              </span>
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: '$textPrimary', marginTop: '2px' }}>
                {transitConfirmWorker.name}
              </h3>
              <p style={{ fontSize: '11px', color: '#64748B', fontFamily: 'monospace' }}>
                Ficha: {transitConfirmWorker.id} ── {transitConfirmWorker.role}
              </p>
            </div>

            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <span style={{ fontSize: '11px', color: '#475569', fontWeight: 700, textAlign: 'left' }}>
                ¿En cuál estación física deseas ubicarlo?
              </span>

              <div style={{ maxHeight: '140px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {vacantSlotsList.length === 0 ? (
                  <div style={{ fontSize: '12px', color: '#EF4444', padding: '12px', border: '1px dashed #FCA5A5', borderRadius: '8px', backgroundColor: '#FEE2E2', fontWeight: 500 }}>
                    Alerta: No tienes puestos vacantes en tu línea actualmente para colocarlo. Libera a un operario primero.
                  </div>
                ) : (
                  vacantSlotsList.map(v => (
                    <button
                      key={v.id}
                      onClick={() => handleExecuteTransitArrival(v.id)}
                      style={{
                        padding: '10px 14px',
                        backgroundColor: '#F1F5F9',
                        border: '1px solid #CBD5E1',
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontWeight: 600,
                        color: '#1E293B',
                        textAlign: 'left',
                        cursor: 'pointer',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}
                    >
                      <span>{v.puestoName}</span>
                      <span style={{ fontSize: '10px', color: '#2563EB', fontWeight: 700 }}>Asignar</span>
                    </button>
                  ))
                )}
              </div>

              <CancelButton onClick={() => setTransitConfirmWorker(null)}>
                Cancelar
              </CancelButton>
            </div>
          </ConfirmationContent>
        </ConfirmationOverlay>
      )}

      {/* 🔵 MODAL DE DESPACHO DESDE BOLSÓN L8 */}
      {dispatchWorker && (
        <ConfirmationOverlay onClick={() => setDispatchWorker(null)} id="l8-dispatch-modal">
          <ConfirmationContent onClick={(e) => e.stopPropagation()} style={{ maxWidth: '380px' }}>
            <OperatorPhoto src={`https://api.dicebear.com/7.x/adventurer/svg?seed=${dispatchWorker.id}`} />
            
            <div style={{ marginBottom: '8px' }}>
              <span style={{ fontSize: '10px', color: '$accent', fontWeight: 700, textTransform: 'uppercase' }}>
                Despachar Relevo Ergonómico
              </span>
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: '$textPrimary', marginTop: '2px' }}>
                {dispatchWorker.name}
              </h3>
              <p style={{ fontSize: '11px', color: '#64748B', fontFamily: 'monospace' }}>
                Ficha: {dispatchWorker.id} ── {dispatchWorker.role}
              </p>
            </div>

            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '10px', boxSizing: 'border-box' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', textAlign: 'left' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '$textSecondary', textTransform: 'uppercase' }}>
                  Línea Destino Crítica
                </span>
                <select
                  value={destLineId}
                  onChange={(e) => setDestLineId(e.target.value)}
                  style={{
                    padding: '10px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    fontSize: '13px',
                    fontFamily: '$sans',
                    outline: 'none',
                    cursor: 'pointer',
                    width: '100%'
                  }}
                >
                  {["L4", "L1", "L2", "L6", "L7", "L5", "L3", "L9", "L10"].map(lId => (
                    <option key={lId} value={lId}>Línea Operativa {lId}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', textAlign: 'left' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '$textSecondary', textTransform: 'uppercase' }}>
                  Estación Vacante Destino
                </span>
                <select
                  value={selectedDestSlotId}
                  onChange={(e) => setSelectedDestSlotId(e.target.value)}
                  style={{
                    padding: '10px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    fontSize: '13px',
                    fontFamily: '$sans',
                    outline: 'none',
                    cursor: 'pointer',
                    width: '100%'
                  }}
                >
                  {destSlots.length === 0 ? (
                    <option value="">No hay celdas vacías en esta línea</option>
                  ) : (
                    destSlots.map(ds => (
                      <option key={ds.id} value={ds.id}>{ds.puestoName}</option>
                    ))
                  )}
                </select>
              </div>

              <ConfirmButton onClick={handleExecuteDispatch} disabled={destSlots.length === 0} style={{ opacity: destSlots.length === 0 ? 0.6 : 1 }}>
                Despachar Operario a Pasillo
              </ConfirmButton>
              
              <CancelButton onClick={() => setDispatchWorker(null)}>
                Cancelar
              </CancelButton>
            </div>
          </ConfirmationContent>
        </ConfirmationOverlay>
      )}

      {/* Interfaz QR en el Thumb Zone (FAB circular flotante de 64px) */}
      <QRFloatingButton 
        id="hud-qr-scanner-fab"
        onClick={handleOpenScanner}
        title="Escanear Gafete QR del Operario"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 7V5a2 2 0 0 1 2-2h2" />
          <path d="M17 3h2a2 2 0 0 1 2 2v2" />
          <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
          <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
          <line x1="7" y1="12" x2="17" y2="12" />
        </svg>
      </QRFloatingButton>

      {/* Modal / Escáner QR de Hardware Activo */}
      {scannerOpen && (() => {
        const vacantCount = slots.filter(s => s.status === 'VACANTE' || s.status === 'ALERTA_VACANTE').length;
        const totalCount = slots.length;
        const assignedCount = totalCount - vacantCount;
        const progressPct = totalCount > 0 ? Math.round((assignedCount / totalCount) * 100) : 0;

        return (
        <ScannerOverlay id="native-qr-scanner-overlay">
          {/* Header de Contexto */}
          <ScannerHeaderBar>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '16px', fontWeight: 800, letterSpacing: '-0.3px' }}>
                  Línea {supervisorLineId}
                </span>
                <span style={{
                  fontSize: '9px',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '4px',
                  backgroundColor: lineStatus === 'PRODUCCION' ? 'rgba(22, 163, 74, 0.2)' : lineStatus === 'PARO' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(59, 130, 246, 0.2)',
                  color: lineStatus === 'PRODUCCION' ? '#4ADE80' : lineStatus === 'PARO' ? '#EF4444' : '#93C5FD',
                  textTransform: 'uppercase'
                }}>
                  {lineStatus === 'PARO' ? 'PARO TÉCNICO' : (lineStatus || 'PREPARACIÓN')}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {scanSessionCount > 0 && (
                  <span style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    backgroundColor: 'rgba(34, 197, 94, 0.15)',
                    color: '#4ADE80',
                    padding: '2px 8px',
                    borderRadius: '4px'
                  }}>
                    ✓ {scanSessionCount} escaneados
                  </span>
                )}
                <button
                  onClick={handleCloseScanner}
                  style={{
                    background: 'none',
                    border: '1px solid rgba(148, 163, 184, 0.3)',
                    borderRadius: '6px',
                    color: '#94A3B8',
                    fontSize: '10px',
                    fontWeight: 700,
                    padding: '4px 10px',
                    cursor: 'pointer'
                  }}
                >
                  ✕ Cerrar
                </button>
              </div>
            </div>

            {sku && sku !== "Cargando SKU..." && sku !== "SIN SKU" && (
              <span style={{ fontSize: '10px', color: '#94A3B8', fontFamily: 'monospace', marginTop: '-4px' }}>
                SKU: {sku}
              </span>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <ScannerProgressBar>
                <ScannerProgressFill style={{ width: `${progressPct}%` }} />
              </ScannerProgressBar>
              <span style={{ fontSize: '11px', fontWeight: 700, color: progressPct === 100 ? '#4ADE80' : '#CBD5E1', whiteSpace: 'nowrap', flexShrink: 0 }}>
                {assignedCount}/{totalCount}
              </span>
            </div>
          </ScannerHeaderBar>

          {/* Body del Escáner */}
          <ScannerBody>
            {/* Visor de cámara (solo cuando no hay feedback activo) */}
            {!activeScanFeedback && (
              <>
                <ScannerWindow>
                  <div 
                    id="qr-reader-container" 
                    style={{ 
                      width: '100%', 
                      height: '100%',
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      zIndex: 1
                    }} 
                  />
                </ScannerWindow>
                <h3 style={{ marginBottom: '4px', fontSize: '16px', fontWeight: 700, letterSpacing: '-0.2px' }}>
                  {continuousScanMode ? "Arranque Continuo por QR" : "Escaneando Gafete QR"}
                </h3>
                <p style={{ color: '#94A3B8', fontSize: '12px', marginBottom: '16px', textAlign: 'center', padding: '0 24px', lineHeight: 1.5 }}>
                  Alinee el código QR del gafete del operario dentro del visor.
                  {vacantCount > 0 && (
                    <span style={{ display: 'block', marginTop: '4px', color: '#CBD5E1', fontSize: '11px' }}>
                      {vacantCount} puesto{vacantCount !== 1 ? 's' : ''} pendiente{vacantCount !== 1 ? 's' : ''} de asignar
                    </span>
                  )}
                </p>

                {/* Simulador Web para pruebas cuando no hay cámara nativa */}
                {!Capacitor.isNativePlatform() && (
                  <div style={{
                    width: '92%',
                    maxWidth: '360px',
                    backgroundColor: 'rgba(30, 41, 59, 0.7)',
                    borderRadius: '16px',
                    padding: '14px',
                    border: '1px solid rgba(148, 163, 184, 0.15)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px'
                  }}>
                    <span style={{ fontSize: '10px', fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Simulador de Gafete QR
                    </span>

                    {/* Búsqueda rápida */}
                    <input
                      type="text"
                      placeholder="Buscar por nombre o ficha..."
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: '8px',
                        border: '1px solid rgba(148, 163, 184, 0.2)',
                        backgroundColor: 'rgba(15, 23, 42, 0.5)',
                        color: '#FFFFFF',
                        fontSize: '12px',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      value={searchQuery}
                    />

                    {(() => {
                      const searchTerm = searchQuery.toLowerCase().trim();
                      const availableToScan = Object.values(workersMap).filter(w => 
                        (w.status === 'POOL_ARRANQUE' || w.status === 'DISPONIBLE_BOLSON') &&
                        w.currentSlotId == null
                      ).filter(w => {
                        if (!searchTerm) return true;
                        return w.name.toLowerCase().includes(searchTerm) || w.id.toLowerCase().includes(searchTerm);
                      }).sort((a, b) => {
                        const locA = a.physicalLineLocation === supervisorLineId ? 0 : 1;
                        const locB = b.physicalLineLocation === supervisorLineId ? 0 : 1;
                        if (locA !== locB) return locA - locB;
                        return a.name.localeCompare(b.name);
                      });

                      if (availableToScan.length === 0) {
                        return (
                          <div style={{ fontSize: '11px', color: '#64748B', textAlign: 'center', padding: '12px 8px', border: '1px dashed rgba(148,163,184,0.2)', borderRadius: '8px' }}>
                            {searchTerm ? 'Sin resultados para la búsqueda.' : 'No quedan operarios sin asignar.'}
                          </div>
                        );
                      }

                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '180px', overflowY: 'auto', paddingRight: '2px' }}>
                          {availableToScan.slice(0, 20).map(worker => {
                            const hasAnyCompatibleSlot = slots.some(s => 
                              (s.status === 'VACANTE' || s.status === 'ALERTA_VACANTE') &&
                              isWorkerRoleCompatibleWithSlot(worker.role, s.tipoPuesto, s.puestoName) &&
                              canWorkerOccupiedSlot(worker, s)
                            );
                            return (
                              <button
                                key={worker.id}
                                onClick={async () => {
                                  setSearchQuery("");
                                  await handleScanWorkerSuccess(worker);
                                }}
                                style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                  padding: '8px 10px',
                                  backgroundColor: 'rgba(15, 23, 42, 0.4)',
                                  border: `1.5px solid ${hasAnyCompatibleSlot ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
                                  borderRadius: '8px',
                                  cursor: 'pointer',
                                  textAlign: 'left',
                                  transition: 'all 0.15s ease',
                                  color: '#FFFFFF'
                                }}
                              >
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                  <strong style={{ fontSize: '12px', fontWeight: 700 }}>{worker.name}</strong>
                                  <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: '9px', fontFamily: 'monospace', color: '#94A3B8' }}>{worker.id}</span>
                                    <span style={{
                                      fontSize: '8px',
                                      fontWeight: 700,
                                      padding: '1px 5px',
                                      borderRadius: '3px',
                                      backgroundColor: worker.physicalLineLocation === supervisorLineId ? 'rgba(22,163,74,0.2)' : 'rgba(148,163,184,0.15)',
                                      color: worker.physicalLineLocation === supervisorLineId ? '#4ADE80' : '#94A3B8'
                                    }}>
                                      {worker.physicalLineLocation === supervisorLineId ? '📍 Local' : `📍 ${worker.physicalLineLocation || 'L8'}`}
                                    </span>
                                    {worker.medicalRestrictions && worker.medicalRestrictions.length > 0 && (
                                      <span style={{ fontSize: '8px', fontWeight: 700, color: '#F87171', backgroundColor: 'rgba(239,68,68,0.15)', padding: '1px 5px', borderRadius: '3px' }}>⚠ MED</span>
                                    )}
                                  </div>
                                </div>
                                <span style={{
                                  fontSize: '10px',
                                  fontWeight: 800,
                                  padding: '4px 10px',
                                  borderRadius: '6px',
                                  backgroundColor: hasAnyCompatibleSlot ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.15)',
                                  color: hasAnyCompatibleSlot ? '#4ADE80' : '#F87171'
                                }}>
                                  {hasAnyCompatibleSlot ? 'Escanear' : 'No apto'}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </>
            )}

            {/* Renderizado de la retroalimentación del escaneo */}
            {activeScanFeedback && (
              <FeedbackCard id="qr-scanner-feedback-card">
                <FeedbackHeader>
                  {/* Icono de estado grande */}
                  <div style={{
                    width: '56px',
                    height: '56px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '28px',
                    backgroundColor: activeScanFeedback.status === 'success' ? '#DCFCE7'
                      : activeScanFeedback.status === 'error' ? '#FEE2E2'
                      : activeScanFeedback.status === 'incompatible' ? '#FEF3C7'
                      : '#DBEAFE'
                  }}>
                    {activeScanFeedback.status === 'success' && '✓'}
                    {activeScanFeedback.status === 'error' && '✕'}
                    {activeScanFeedback.status === 'incompatible' && '⚠'}
                    {activeScanFeedback.status === 'confirm' && '?'}
                  </div>

                  <FeedbackTitle status={activeScanFeedback.status} id="qr-feedback-title">
                    {activeScanFeedback.status === 'success' && "Asignado con Éxito"}
                    {activeScanFeedback.status === 'error' && "Error en Asignación"}
                    {activeScanFeedback.status === 'incompatible' && "Operario Incompatible"}
                    {activeScanFeedback.status === 'confirm' && "Confirmar Asignación"}
                  </FeedbackTitle>
                </FeedbackHeader>
                
                <FeedbackInfo>
                  <strong style={{ fontSize: '17px', color: '#1E293B', fontWeight: 800, letterSpacing: '-0.2px' }}>
                    {activeScanFeedback.worker?.name}
                  </strong>
                  <span style={{ fontSize: '11px', color: '#64748B', fontFamily: 'monospace', marginTop: '2px' }}>
                    Ficha: {activeScanFeedback.worker?.id}
                  </span>
                  
                  {activeScanFeedback.slot && (
                    <div style={{ 
                      marginTop: '10px', 
                      padding: '8px 14px', 
                      backgroundColor: activeScanFeedback.status === 'success' ? '#F0FDF4' : '#F1F5F9', 
                      borderRadius: '10px', 
                      border: `1.5px solid ${activeScanFeedback.status === 'success' ? '#BBF7D0' : '#E2E8F0'}`,
                      display: 'inline-block' 
                    }}>
                      <span style={{ fontSize: '9px', textTransform: 'uppercase', color: '#64748B', fontWeight: 800, display: 'block', letterSpacing: '0.5px' }}>
                        Puesto Destino
                      </span>
                      <strong style={{ fontSize: '15px', color: activeScanFeedback.status === 'success' ? '#16A34A' : '#2563EB', fontWeight: 800 }}>
                        {activeScanFeedback.slot?.puestoName}
                      </strong>
                    </div>
                  )}
                </FeedbackInfo>

                {/* Mensaje descriptivo */}
                <p style={{ 
                  fontSize: '13px', 
                  color: (activeScanFeedback.status === 'error' || activeScanFeedback.status === 'incompatible') ? '#991B1B' : '#475569',
                  textAlign: 'center',
                  margin: '0 0 16px 0',
                  lineHeight: 1.5,
                  fontWeight: (activeScanFeedback.status === 'error' || activeScanFeedback.status === 'incompatible') ? 600 : 400
                }}>
                  {activeScanFeedback.message}
                </p>

                {/* Diagnósticos simplificados en caso de incompatibilidad */}
                {activeScanFeedback.status === 'incompatible' && activeScanFeedback.diagnostics && (
                  <FeedbackDiagnosticsContainer id="qr-feedback-diagnostics">
                    <span style={{ fontSize: '10px', textTransform: 'uppercase', color: '#64748B', fontWeight: 800, marginBottom: '4px', display: 'block', letterSpacing: '0.3px' }}>
                      Vacantes de la línea:
                    </span>
                    {activeScanFeedback.diagnostics.map(diag => (
                      <div 
                        key={diag.slotId} 
                        style={{ 
                          padding: '8px 10px', 
                          border: diag.isFullyCompatible ? '1.5px solid #BBF7D0' : '1.5px solid #FECACA',
                          borderRadius: '8px', 
                          backgroundColor: diag.isFullyCompatible ? '#F0FDF4' : '#FEF2F2',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center'
                        }}
                      >
                        <div>
                          <strong style={{ fontSize: '12px', color: '#1E293B', display: 'block' }}>{diag.puestoName}</strong>
                          <span style={{ fontSize: '9px', color: '#64748B' }}>{diag.tipoPuesto}</span>
                        </div>
                        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                          <span style={{ fontSize: '10px' }}>{diag.isRoleCompatible ? '✅' : '❌'} Rol</span>
                          <span style={{ fontSize: '10px' }}>{diag.isSlotCompatible ? '✅' : '❌'} Apto</span>
                        </div>
                      </div>
                    ))}
                  </FeedbackDiagnosticsContainer>
                )}

                {/* Acciones */}
                <FeedbackActionGroup>
                  {activeScanFeedback.status === 'confirm' && (
                    <>
                      <FeedbackButton variant="success" onClick={handleConfirmScanAssignment} id="qr-feedback-confirm-button">
                        ✓ Confirmar Asignación
                      </FeedbackButton>
                      <FeedbackButton variant="secondary" onClick={handleResumeScan} id="qr-feedback-cancel-button">
                        Cancelar
                      </FeedbackButton>
                    </>
                  )}
                  
                  {activeScanFeedback.status === 'success' && (
                    <>
                      {activeScanFeedback.isLineCompleted ? (
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: '40px', marginBottom: '8px', animation: 'pulse 1s infinite' }}>🎉</div>
                          <p style={{ fontSize: '14px', fontWeight: 700, color: '#16A34A', margin: '0 0 4px 0' }}>
                            ¡Línea Completa!
                          </p>
                          <span style={{ fontSize: '11px', color: '#94A3B8' }}>
                            Cerrando automáticamente...
                          </span>
                        </div>
                      ) : (
                        <>
                          <FeedbackButton variant="primary" onClick={handleResumeScan} id="qr-feedback-next-button">
                            ▶ Siguiente Escaneo
                          </FeedbackButton>
                          <span style={{ fontSize: '10px', color: '#94A3B8', textAlign: 'center' }}>
                            Reanudando en 2s...
                          </span>
                        </>
                      )}
                    </>
                  )}

                  {(activeScanFeedback.status === 'error' || activeScanFeedback.status === 'incompatible') && (
                    <>
                      <FeedbackButton variant="primary" onClick={handleResumeScan} id="qr-feedback-retry-button">
                        ▶ Escanear Siguiente
                      </FeedbackButton>
                      <FeedbackButton variant="secondary" onClick={handleCloseScanner} id="qr-feedback-close-button">
                        Cerrar Escáner
                      </FeedbackButton>
                    </>
                  )}
                </FeedbackActionGroup>
              </FeedbackCard>
            )}
          </ScannerBody>

          {/* Botón de cierre inferior (solo si no hay feedback) */}
          {!activeScanFeedback && (
            <ScannerCloseButton onClick={handleCloseScanner}>
              {continuousScanMode ? "Finalizar Arranque" : "Cancelar Escaneo"}
            </ScannerCloseButton>
          )}
        </ScannerOverlay>
        );
      })()}

      {/* 🟣 MODAL DE CONFIRMACIÓN DE PEDIR RELEVO */}
      {confirmRelevoSlotId && (
        <ConfirmationOverlay onClick={() => setConfirmRelevoSlotId(null)} id="relevo-confirm-modal">
          <ConfirmationContent onClick={(e) => e.stopPropagation()} style={{ maxWidth: '380px' }}>
            <div style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              backgroundColor: '#F3E8FF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#A855F7',
              marginBottom: '4px'
            }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M21.5 2v6h-6"/>
                <path d="M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
              </svg>
            </div>
            
            <div style={{ marginBottom: '8px' }}>
              <span style={{ fontSize: '10px', color: '#A855F7', fontWeight: 700, textTransform: 'uppercase' }}>
                Confirmar Solicitud de Relevo
              </span>
              {(() => {
                const targetSlot = slots.find(s => s.id === confirmRelevoSlotId);
                const workerDetails = targetSlot ? workersMap[targetSlot.idWorkerCurrent] : null;
                return (
                  <>
                    <h3 style={{ fontSize: '16px', fontWeight: 700, color: '$textPrimary', marginTop: '4px' }}>
                      {workerDetails ? workerDetails.name : 'Operario'}
                    </h3>
                    <p style={{ fontSize: '12px', color: '#475569', marginTop: '6px' }}>
                      ¿Deseas solicitar un relevo ergonómico para este operario en el puesto <strong>{targetSlot?.puestoName}</strong>?
                    </p>
                  </>
                );
              })()}
            </div>

            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <ConfirmButton 
                onClick={async () => {
                  const slotId = confirmRelevoSlotId;
                  setConfirmRelevoSlotId(null);
                  setSheetOpen(false);
                  try {
                    const res = await requestErgonomicRelevo(slotId, supervisorLineId);
                    if (res.success) {
                      triggerNativeHapticFeedback('confirm');
                      setNotification({
                        type: 'success',
                        message: `¡Relevo Automático! El relevista ${res.relevistaName} fue seleccionado del Bolsón L8 y viene en tránsito.`
                      });
                    }
                  } catch (err) {
                    triggerNativeHapticFeedback('error');
                    setNotification({
                      type: 'error',
                      message: err.message || 'Fallo al solicitar relevo ergonómico.'
                    });
                  }
                }}
                style={{ backgroundColor: '#A855F7' }}
                id="execute-relevo-confirm-btn"
              >
                Confirmar Solicitud
              </ConfirmButton>
              <CancelButton onClick={() => setConfirmRelevoSlotId(null)}>
                Cancelar
              </CancelButton>
            </div>
          </ConfirmationContent>
        </ConfirmationOverlay>
      )}

      {/* 🔵 MODAL DE CONFIRMACIÓN DE INTERCAMBIO LOCAL */}
      {confirmLocalSwapData && (
        <ConfirmationOverlay onClick={() => setConfirmLocalSwapData(null)} id="local-swap-confirm-modal">
          <ConfirmationContent onClick={(e) => e.stopPropagation()} style={{ maxWidth: '420px' }}>
            <div style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              backgroundColor: '#DBEAFE',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#2563EB',
              marginBottom: '4px'
            }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="m16 3 4 4-4 4"/>
                <path d="M20 7H4"/>
                <path d="m8 21-4-4 4-4"/>
                <path d="M4 17h16"/>
              </svg>
            </div>
            
            <div style={{ marginBottom: '8px', width: '100%' }}>
              <span style={{ fontSize: '10px', color: '#2563EB', fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>
                Confirmar Rotación Ergonómica Local
              </span>
              
              {(() => {
                const slotA = slots.find(s => s.id === confirmLocalSwapData.slotIdA);
                const slotB = slots.find(s => s.id === confirmLocalSwapData.slotIdB);
                const workerA = slotA ? workersMap[slotA.idWorkerCurrent] : null;
                const workerB = slotB ? workersMap[slotB.idWorkerCurrent] : null;
                
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F8FAFC', padding: '10px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                      <div style={{ textAlign: 'left' }}>
                        <span style={{ fontSize: '9px', fontWeight: 700, color: '#64748B' }}>PUESTO A: {slotA?.puestoName}</span>
                        <strong style={{ display: 'block', fontSize: '12px' }}>{workerA?.name}</strong>
                      </div>
                      <div style={{ fontSize: '18px', color: '#64748B' }}>⇄</div>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: '9px', fontWeight: 700, color: '#64748B' }}>PUESTO B: {slotB?.puestoName}</span>
                        <strong style={{ display: 'block', fontSize: '12px' }}>{workerB?.name}</strong>
                      </div>
                    </div>
                    <p style={{ fontSize: '12px', color: '#475569', textAlign: 'center' }}>
                      ¿Deseas realizar el intercambio físico de puestos entre ambos operarios?
                    </p>
                  </div>
                );
              })()}
            </div>

            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <ConfirmButton 
                onClick={async () => {
                  const { slotIdA, slotIdB } = confirmLocalSwapData;
                  setConfirmLocalSwapData(null);
                  setSheetOpen(false);
                  
                  try {
                    setNotification(null);
                    triggerNativeHapticFeedback('short');
                    const res = await executeLocalSwapTransaction(slotIdA, slotIdB, supervisorLineId);
                    if (res.success) {
                      triggerNativeHapticFeedback('confirm');
                      setNotification({
                        type: 'success',
                        message: `¡Intercambio ergonómico local exitoso! ${res.workerAName} (${res.puestoAName}) y ${res.workerBName} (${res.puestoBName}) rotaron de puesto.`
                      });
                    }
                  } catch (err) {
                    triggerNativeHapticFeedback('error');
                    setNotification({
                      type: 'error',
                      message: err.message || 'Error al ejecutar el intercambio local.'
                    });
                  }
                }}
                id="execute-local-swap-btn"
              >
                Confirmar Rotación
              </ConfirmButton>
              <CancelButton onClick={() => setConfirmLocalSwapData(null)}>
                Cancelar
              </CancelButton>
            </div>
          </ConfirmationContent>
        </ConfirmationOverlay>
      )}

      {/* 🟢 MODAL DE CONFIRMACIÓN DE LIBERAR OPERARIO */}
      {confirmReleaseSlotId && (
        <ConfirmationOverlay onClick={() => setConfirmReleaseSlotId(null)} id="release-confirm-modal">
          <ConfirmationContent onClick={(e) => e.stopPropagation()} style={{ maxWidth: '380px' }}>
            <div style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              backgroundColor: '#EFF6FF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#3B82F6',
              marginBottom: '4px'
            }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
              </svg>
            </div>
            
            <div style={{ marginBottom: '8px' }}>
              <span style={{ fontSize: '10px', color: '#3B82F6', fontWeight: 700, textTransform: 'uppercase' }}>
                Liberar Operario a Bolsón
              </span>
              {(() => {
                const targetSlot = slots.find(s => s.id === confirmReleaseSlotId);
                const workerDetails = targetSlot ? workersMap[targetSlot.idWorkerCurrent] : null;
                return (
                  <>
                    <h3 style={{ fontSize: '16px', fontWeight: 700, color: '$textPrimary', marginTop: '4px' }}>
                      {workerDetails ? workerDetails.name : 'Operario'}
                    </h3>
                    <p style={{ fontSize: '12px', color: '#475569', marginTop: '6px' }}>
                      ¿Deseas retirar a este operario del puesto <strong>{targetSlot?.puestoName}</strong>? El trabajador retornará a la Línea 8 (Bolsón) como Disponible.
                    </p>
                  </>
                );
              })()}
            </div>

            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <ConfirmButton 
                onClick={async () => {
                  const slotId = confirmReleaseSlotId;
                  setConfirmReleaseSlotId(null);
                  setSheetOpen(false);
                  
                  const targetSlot = slots.find(s => s.id === slotId);
                  const workerId = targetSlot ? targetSlot.idWorkerCurrent : null;
                  if (!workerId) return;

                  try {
                    const res = await releaseWorkerTransaction(slotId, workerId, supervisorLineId);
                    if (res.success) {
                      triggerNativeHapticFeedback('confirm');
                      setNotification({
                        type: 'success',
                        message: `Operario liberado exitosamente. Regresa a Línea 8 (Bolsón).`
                      });
                    }
                  } catch (err) {
                    triggerNativeHapticFeedback('error');
                    setNotification({
                      type: 'error',
                      message: err.message || 'Fallo al liberar operario.'
                    });
                  }
                }}
                id="execute-release-confirm-btn"
              >
                Confirmar Liberación
              </ConfirmButton>
              <CancelButton onClick={() => setConfirmReleaseSlotId(null)}>
                Cancelar
              </CancelButton>
            </div>
          </ConfirmationContent>
        </ConfirmationOverlay>
      )}

      {/* 🔴 MODAL DE CONFIRMACIÓN DE REGISTRAR BAJA */}
      {confirmBajaSlotId && (
        <ConfirmationOverlay onClick={() => setConfirmBajaSlotId(null)} id="baja-confirm-modal">
          <ConfirmationContent onClick={(e) => e.stopPropagation()} style={{ maxWidth: '380px' }}>
            <div style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              backgroundColor: '#FEE2E2',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#EF4444',
              marginBottom: '4px'
            }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M12 9v4M12 17h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/>
              </svg>
            </div>
            
            <div style={{ marginBottom: '8px' }}>
              <span style={{ fontSize: '10px', color: '#EF4444', fontWeight: 700, textTransform: 'uppercase' }}>
                Registrar Baja Temporal
              </span>
              {(() => {
                const targetSlot = slots.find(s => s.id === confirmBajaSlotId);
                const workerDetails = targetSlot ? workersMap[targetSlot.idWorkerCurrent] : null;
                return (
                  <>
                    <h3 style={{ fontSize: '16px', fontWeight: 700, color: '$textPrimary', marginTop: '4px' }}>
                      {workerDetails ? workerDetails.name : 'Operario'}
                    </h3>
                    <p style={{ fontSize: '12px', color: '#475569', marginTop: '6px' }}>
                      ¿Deseas registrar la baja temporal de este operario por enfermería o incidencia? El puesto quedará vacante y el trabajador será retirado de la jornada.
                    </p>
                  </>
                );
              })()}
            </div>

            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <ConfirmButton 
                onClick={async () => {
                  const slotId = confirmBajaSlotId;
                  setConfirmBajaSlotId(null);
                  setSheetOpen(false);
                  
                  const targetSlot = slots.find(s => s.id === slotId);
                  const workerId = targetSlot ? targetSlot.idWorkerCurrent : null;
                  if (!workerId) return;

                  try {
                    await tempBajaWorkerTransaction(slotId, workerId, supervisorLineId);
                    triggerNativeHapticFeedback('confirm');
                    setNotification({
                      type: 'success',
                      message: `Baja Temporal asentada. Retirado de línea por enfermería.`
                    });
                  } catch (err) {
                    triggerNativeHapticFeedback('error');
                    setNotification({
                      type: 'error',
                      message: err.message || 'Fallo al procesar baja temporal.'
                    });
                  }
                }}
                style={{ backgroundColor: '#EF4444' }}
                id="execute-baja-confirm-btn"
              >
                Confirmar Baja
              </ConfirmButton>
              <CancelButton onClick={() => setConfirmBajaSlotId(null)}>
                Cancelar
              </CancelButton>
            </div>
          </ConfirmationContent>
        </ConfirmationOverlay>
      )}

      {/* 📋 MODAL DE PASARELA DE CIERRE DE TURNO */}
      {cerrarTurnoModalOpen && (
        <ConfirmationOverlay onClick={() => setCerrarTurnoModalOpen(false)} id="cierre-turno-modal">
          <ConfirmationContent onClick={(e) => e.stopPropagation()} style={{ maxWidth: '420px', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', borderBottom: '1px solid #E2E8F0', paddingBottom: '12px', marginBottom: '12px' }}>
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                backgroundColor: '#FEE2E2',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#EF4444',
                fontSize: '18px'
              }}>
                📋
              </div>
              <div style={{ textAlign: 'left' }}>
                <span style={{ fontSize: '10px', color: '#EF4444', fontWeight: 800, textTransform: 'uppercase', display: 'block' }}>
                  Pasarela de Cierre
                </span>
                <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#1E293B', margin: 0 }}>
                  Cierre de Turno - Línea {supervisorLineId}
                </h3>
              </div>
            </div>

            <p style={{ fontSize: '11px', color: '#64748B', margin: '0 0 12px 0', lineHeight: 1.4, textAlign: 'left' }}>
              Selecciona los operarios que trabajarán <strong>Doble Turno</strong>. Los seleccionados pasarán automáticamente al Pool de Arranque del siguiente turno. Los no seleccionados serán desactivados.
            </p>

            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '4px', marginBottom: '16px', minHeight: '120px' }}>
              {(() => {
                const activeWorkers = [];
                slots.forEach(slot => {
                  if (slot.idWorkerCurrent) {
                    const w = workersMap[slot.idWorkerCurrent];
                    if (w) activeWorkers.push({ ...w, puestoName: slot.puestoName });
                  }
                });

                if (activeWorkers.length === 0) {
                  return (
                    <div style={{ textAlign: 'center', color: '#94A3B8', fontSize: '12px', padding: '16px 0' }}>
                      No hay operarios activos asignados.
                    </div>
                  );
                }

                return activeWorkers.map(w => {
                  const isChecked = cerrarTurnoSelectedWorkers.includes(w.id);
                  const isPreSelected = !!w.dobleTurnoActivo;
                  
                  return (
                    <div 
                      key={w.id}
                      onClick={() => handleToggleCerrarTurnoWorker(w.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 12px',
                        backgroundColor: isChecked ? '#EFF6FF' : '#F8FAFC',
                        border: isChecked ? '1.5px solid #3B82F6' : '1.5px solid #E2E8F0',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <img 
                          src={`https://api.dicebear.com/7.x/adventurer/svg?seed=${w.id}`}
                          alt={w.name}
                          style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: '#E2E8F0' }}
                        />
                        <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'left' }}>
                          <strong style={{ fontSize: '12px', color: '#1E293B' }}>{w.name}</strong>
                          <span style={{ fontSize: '9.5px', color: '#64748B' }}>
                            Ficha: {w.id} ── Puesto: {w.puestoName}
                          </span>
                        </div>
                      </div>
                      
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {isPreSelected && (
                          <span style={{ fontSize: '8px', fontWeight: 800, backgroundColor: '#FEF3C7', color: '#D97706', padding: '2px 6px', borderRadius: '4px', textTransform: 'uppercase' }}>
                            Doble Turno Caliente
                          </span>
                        )}
                        <input 
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}} // Se controla con el click del contenedor
                          style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                        />
                      </div>
                    </div>
                  );
                });
              })()}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <ConfirmButton 
                onClick={handleConfirmCerrarTurno}
                style={{ backgroundColor: '#EF4444' }}
                id="execute-cerrar-turno-btn"
              >
                Confirmar Cierre de Turno
              </ConfirmButton>
              <CancelButton onClick={() => setCerrarTurnoModalOpen(false)}>
                Cancelar
              </CancelButton>
            </div>
          </ConfirmationContent>
        </ConfirmationOverlay>
      )}
    </HudContainer>
  );
}
