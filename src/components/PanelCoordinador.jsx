import React, { useState, useEffect, useMemo } from 'react';
import { styled, keyframes } from '../styles/theme';
import { db, puestosColl, trabajadoresColl, initializeTurnoWithSheets, programNextDayShift, assignPuestosLive, executeCoordinatorSuggestion, getHistorialDia, saveHistorialDia, getProgramaProduccionPorFecha } from '../services/firebaseService';
import { collection, doc, onSnapshot, getDocs, updateDoc, setDoc, query, where, getDoc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { triggerNativeHapticFeedback } from '../skills/capacitor-android-bridge';

// --- KEYFRAMES & MICRO-ANIMATIONS ---
const fadeIn = keyframes({
  from: { opacity: 0, transform: 'translateY(8px)' },
  to: { opacity: 1, transform: 'translateY(0)' }
});

const pulse = keyframes({
  '0%, 100%': { transform: 'scale(1)' },
  '50%': { transform: 'scale(1.05)', opacity: 0.8 }
});

// --- STYLED COMPONENTS ---

const PanelContainer = styled('div', {
  minHeight: '100vh',
  backgroundColor: '$background',
  fontFamily: '$sans',
  boxSizing: 'border-box',
  paddingBottom: 'calc(64px + env(safe-area-inset-bottom, 0px) + 16px)' // Ajuste ergonómico para TabBar MD3 + notch
});

const StickyHeaderContainer = styled('div', {
  position: 'sticky',
  top: 0,
  zIndex: 1500,
  display: 'flex',
  flexDirection: 'column',
  width: '100%',
  boxShadow: '$subtle'
});

const PanelHeader = styled('header', {
  backgroundColor: '$card',
  borderBottom: '1px solid $border',
  padding: '12px 20px',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  position: 'relative',
  zIndex: 10,
  flexWrap: 'wrap',
  gap: '8px',
  '@mobile': {
    padding: '10px 12px',
    gap: '6px'
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
  gap: '8px',
  zIndex: 20
});

const LogoArea = styled('div', {
  display: 'flex',
  alignItems: 'center',
  gap: '10px'
});

const LogoIcon = styled('div', {
  width: '32px',
  height: '32px',
  borderRadius: '8px',
  backgroundColor: '$accent',
  color: '#FFFFFF',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  boxShadow: '0 4px 8px rgba(15, 23, 42, 0.08)'
});

const PanelTitle = styled('h1', {
  fontSize: '14px',
  fontWeight: 700,
  color: '$textPrimary',
  lineHeight: 1.2
});

const PanelSubtitle = styled('span', {
  fontSize: '10px',
  color: '$textSecondary',
  fontWeight: 500,
  display: 'block'
});

const ProfileArea = styled('div', {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  '@mobile': {
    gap: '6px'
  }
});

const CoordinatorBadge = styled('span', {
  fontSize: '9px',
  fontWeight: 800,
  backgroundColor: '$infoBg',
  color: '$infoBorder',
  padding: '3px 8px',
  borderRadius: '12px',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  '@mobile': {
    display: 'none'
  }
});

const LogoutBtn = styled('button', {
  background: 'none',
  border: 'none',
  outline: 'none',
  padding: '6px',
  borderRadius: '6px',
  color: '$textSecondary',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: 'all 0.2s',

  '&:hover': {
    color: '#EF4444',
    backgroundColor: '$dangerBg'
  },
  '&:active': {
    transform: 'scale(0.92)'
  }
});

// Contenedores Principales de Pestañas
const TabContentContainer = styled('div', {
  maxWidth: '1200px',
  margin: '0 auto',
  padding: '16px 20px',
  animation: `${fadeIn} 0.25s ease-out`,
  '@mobile': {
    padding: '12px 10px'
  }
});

// --- PESTAÑA: MAPA GLOBAL ---
const GridContainer = styled('div', {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
  gap: '16px',
  marginTop: '10px',
  '@mobile': {
    gridTemplateColumns: '1fr',
    gap: '12px'
  }
});

const LineStatusCard = styled('div', {
  padding: '18px 20px',
  borderRadius: '16px',
  border: '1px solid $border',
  backgroundColor: '#FFFFFF',
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
  transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
  cursor: 'pointer',
  position: 'relative',

  '&:hover': {
    boxShadow: '$elevation2',
    borderColor: '#CBD5E1'
  },

  '&:active': {
    transform: 'scale(0.97)',
    boxShadow: '$subtle'
  },

  '@mobile': {
    padding: '14px 14px',
    borderRadius: '12px',
    gap: '8px'
  },

  variants: {
    coverage: {
      success: { borderLeft: '4px solid $successBorder' },
      warning: { borderLeft: '4px solid $warningBorder' },
      danger: { borderLeft: '4px solid $dangerBorder' },
      suspended: { 
        borderLeft: '4px solid #94A3B8',
        backgroundColor: '#F8FAFC',
        opacity: 0.85
      }
    }
  }
});

const LineCardHeader = styled('div', {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center'
});

const LineTitle = styled('strong', {
  fontSize: '13px',
  fontWeight: 700,
  color: '$textPrimary'
});

const SkuTag = styled('span', {
  fontSize: '10px',
  fontWeight: 700,
  color: '#64748B',
  backgroundColor: '#E2E8F0',
  padding: '2px 6px',
  borderRadius: '4px',
  fontFamily: 'monospace'
});

const MiniMapLabel = styled('span', {
  fontSize: '9px',
  fontWeight: 700,
  color: '$textSecondary',
  textTransform: 'uppercase',
  letterSpacing: '0.3px',
  marginTop: '4px'
});

const SlotsMiniMap = styled('div', {
  display: 'flex',
  gap: '5px',
  alignItems: 'center',
  flexWrap: 'wrap',
  margin: '2px 0'
});

const CellIndicator = styled('span', {
  width: '8px',
  height: '8px',
  borderRadius: '50%',
  display: 'inline-block',

  variants: {
    state: {
      covered: { backgroundColor: '$successBorder' },
      deficit: { backgroundColor: '$dangerBorder', animation: `${pulse} 2s infinite` },
      suspended: { backgroundColor: '#94A3B8' }
    }
  }
});

const MetricPill = styled('span', {
  fontSize: '9px',
  fontWeight: 800,
  padding: '2px 6px',
  borderRadius: '4px',
  textTransform: 'uppercase',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',

  variants: {
    type: {
      success: { backgroundColor: '$successBg', color: '$successBorder' },
      danger: { backgroundColor: '$dangerBg', color: '$dangerBorder' },
      suspended: { backgroundColor: '#F1F5F9', color: '#64748B' }
    }
  }
});

const OeeMeter = styled('div', {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  marginTop: '4px'
});

const OeeHeader = styled('div', {
  display: 'flex',
  justifyContent: 'space-between',
  fontSize: '9px',
  fontWeight: 700,
  color: '$textSecondary'
});

const OeeTrack = styled('div', {
  height: '5px',
  backgroundColor: '#F1F5F9',
  borderRadius: '4px',
  overflow: 'hidden'
});

const OeeBar = styled('div', {
  height: '100%',
  transition: 'width 0.4s ease',

  variants: {
    status: {
      success: { backgroundColor: '$successBorder' },
      warning: { backgroundColor: '$warningBorder' },
      danger: { backgroundColor: '$dangerBorder' },
      suspended: { backgroundColor: '#94A3B8' }
    }
  }
});

// --- PESTAÑA: PUESTOS & COBERTURA ---
const LineButtonsRow = styled('div', {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '8px',
  marginBottom: '16px'
});

const LineFilterButton = styled('button', {
  padding: '8px 14px',
  borderRadius: '8px',
  border: '1px solid $border',
  backgroundColor: '#FFFFFF',
  color: '$textSecondary',
  fontSize: '11px',
  fontWeight: 700,
  cursor: 'pointer',
  transition: 'all 0.15s ease',

  '&:hover': {
    backgroundColor: '#F1F5F9',
    color: '$textPrimary'
  },

  variants: {
    active: {
      true: {
        backgroundColor: '$accent',
        color: '#FFFFFF',
        borderColor: '$accent',
        boxShadow: '0 4px 8px rgba(15, 23, 42, 0.08)',
        '&:hover': {
          backgroundColor: '#1D4ED8',
          color: '#FFFFFF'
        }
      }
    }
  }
});

const LayoutHeader = styled('div', {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '16px',
  borderBottom: '1px solid $border',
  paddingBottom: '12px'
});

const LayoutGrid = styled('div', {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '24px',

  '@mobile': {
    gridTemplateColumns: '1fr'
  }
});

const ColumnCard = styled('div', {
  backgroundColor: '#FFFFFF',
  borderRadius: '12px',
  border: '1px solid $border',
  padding: '16px',
  display: 'flex',
  flexDirection: 'column',
  gap: '12px'
});

const ColumnTitle = styled('h3', {
  fontSize: '12px',
  fontWeight: 700,
  color: '$textPrimary',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  borderBottom: '1px solid $border',
  paddingBottom: '8px'
});

const SlotDetailCard = styled('div', {
  padding: '12px 14px',
  borderRadius: '8px',
  border: '1px solid $border',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  transition: 'all 0.15s ease',

  variants: {
    state: {
      covered: {
        backgroundColor: '#FFFFFF',
        borderLeft: '4px solid $successBorder'
      },
      deficit: {
        backgroundColor: '#FFF1F2',
        borderColor: '#FECDD3',
        borderLeft: '4px solid $dangerBorder'
      },
      suspended: {
        backgroundColor: '#F8FAFC',
        borderLeft: '4px solid #94A3B8',
        opacity: 0.75
      }
    },
    locked: {
      true: {
        borderColor: '$accent',
        boxShadow: '0 0 8px rgba(37, 99, 235, 0.12)',
        backgroundColor: '#F0F5FF'
      }
    }
  }
});

const SlotInfo = styled('div', {
  display: 'flex',
  flexDirection: 'column',
  gap: '2px'
});

const SlotName = styled('strong', {
  fontSize: '12px',
  color: '$textPrimary'
});

const SlotWorkerName = styled('span', {
  fontSize: '10px',
  color: '$textSecondary',
  fontWeight: 500
});

const StatusPill = styled('span', {
  fontSize: '9px',
  fontWeight: 800,
  padding: '3px 8px',
  borderRadius: '20px',
  textTransform: 'uppercase',

  variants: {
    state: {
      covered: { backgroundColor: '$successBg', color: '$successBorder' },
      deficit: { backgroundColor: '$dangerBg', color: '$dangerBorder', animation: `${pulse} 2s infinite` },
      suspended: { backgroundColor: '#F1F5F9', color: '#64748B' }
    }
  }
});

// --- PESTAÑA: DASHBOARDS & ANALÍTICAS ---
const KpiGrid = styled('div', {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
  gap: '16px',
  marginBottom: '20px',
  '@mobile': {
    gridTemplateColumns: '1fr 1fr',
    gap: '10px'
  }
});

const KpiCard = styled('div', {
  backgroundColor: '#FFFFFF',
  border: '1px solid $border',
  borderRadius: '16px',
  padding: '20px',
  boxShadow: '$elevation1',
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
  '@mobile': {
    padding: '14px 12px',
    borderRadius: '12px',
    gap: '6px'
  }
});

const KpiLabel = styled('span', {
  fontSize: '10px',
  fontWeight: 700,
  color: '$textSecondary',
  textTransform: 'uppercase',
  letterSpacing: '0.6px'
});

const KpiValue = styled('strong', {
  fontSize: '26px',
  fontWeight: 800,
  color: '$textPrimary',
  fontFamily: 'monospace',
  '@mobile': {
    fontSize: '20px'
  }
});

const ChartCard = styled('div', {
  backgroundColor: '#FFFFFF',
  border: '1px solid $border',
  borderRadius: '16px',
  padding: '24px',
  boxShadow: '$elevation1',
  display: 'flex',
  flexDirection: 'column',
  gap: '16px'
});

const ChartTitle = styled('h3', {
  fontSize: '12px',
  fontWeight: 700,
  color: '$textPrimary',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  display: 'flex',
  alignItems: 'center',
  gap: '6px'
});



// --- PESTAÑA: CONTROL Y ALERTAS ---
const BentoCard = styled('div', {
  backgroundColor: '$card',
  borderRadius: '16px',
  border: '1px solid $border',
  padding: '20px 24px',
  boxShadow: '$elevation2',
  display: 'flex',
  flexDirection: 'column',
  gap: '16px',
  transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
  '@mobile': {
    padding: '14px 12px',
    borderRadius: '12px',
    gap: '12px'
  }
});

const CardTitle = styled('h2', {
  fontSize: '13px',
  fontWeight: 700,
  color: '$textPrimary',
  display: 'flex',
  alignItems: 'center',
  gap: '6px'
});



const SuggestionsGrid = styled('div', {
  display: 'grid',
  gridTemplateColumns: '1.6fr 1fr',
  gap: '24px',
  width: '100%',
  '@tablet': {
    gridTemplateColumns: '1fr',
    gap: '16px'
  },
  '@mobile': {
    gridTemplateColumns: '1fr',
    gap: '12px'
  }
});

const SuggestionsList = styled('div', {
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  width: '100%',
  boxSizing: 'border-box',
  '@mobile': {
    flexDirection: 'row',
    overflowX: 'auto',
    scrollSnapType: 'x mandatory',
    margin: '0 -24px',
    padding: '4px 24px 12px 24px',
    scrollbarWidth: 'none',
    WebkitOverflowScrolling: 'touch',
    '&::-webkit-scrollbar': {
      display: 'none'
    }
  }
});

const SuggestionItem = styled('div', {
  padding: '14px 18px',
  borderRadius: '12px',
  boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
  position: 'relative',
  overflow: 'hidden',
  boxSizing: 'border-box',
  width: '100%',
  transition: 'all 0.2s ease',
  variants: {
    critical: {
      true: {
        backgroundColor: '#FFF5F5',
        border: '1px solid #FEE2E2',
      },
      false: {
        backgroundColor: '#FFFFFF',
        border: '1px solid $border',
      }
    }
  },
  '@mobile': {
    flex: '0 0 85vw',
    maxWidth: '300px',
    scrollSnapAlign: 'start',
  }
});

const FatigueAlertsList = styled('div', {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  maxHeight: '220px',
  overflowY: 'auto',
  paddingRight: '4px',
  scrollbarWidth: 'thin',
  '&::-webkit-scrollbar': {
    width: '4px'
  },
  '&::-webkit-scrollbar-thumb': {
    backgroundColor: '$border',
    borderRadius: '2px'
  }
});

const ApplyAllButton = styled('button', {
  width: '100%',
  padding: '12px 16px',
  backgroundColor: '#10B981',
  backgroundImage: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
  color: '#FFFFFF',
  border: 'none',
  borderRadius: '10px',
  fontSize: '11px',
  fontWeight: 600,
  cursor: 'pointer',
  boxShadow: '0 4px 12px rgba(16, 185, 129, 0.15)',
  transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
  marginBottom: '16px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px',
  boxSizing: 'border-box',

  '&:hover': {
    backgroundImage: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
    boxShadow: '0 6px 16px rgba(5, 150, 105, 0.25)'
  },
  '&:active': {
    transform: 'scale(0.97)'
  },
  '&:disabled': {
    backgroundImage: 'none',
    backgroundColor: '#94A3B8',
    cursor: 'not-allowed',
    boxShadow: 'none'
  }
});

const SuggestionActionButton = styled('button', {
  padding: '8px 14px',
  color: '#FFFFFF',
  border: 'none',
  borderRadius: '8px',
  fontSize: '10px',
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
  display: 'flex',
  alignItems: 'center',
  gap: '4px',

  variants: {
    type: {
      rotation: {
        backgroundColor: '#D97706',
        boxShadow: '0 2px 6px rgba(217, 119, 6, 0.12)',
        '&:hover': {
          backgroundColor: '#B45309'
        }
      },
      injection: {
        backgroundColor: '$accent',
        boxShadow: '0 2px 6px rgba(37, 99, 235, 0.12)',
        '&:hover': {
          backgroundColor: '#1D4ED8'
        }
      }
    }
  },
  '&:active': {
    transform: 'scale(0.95)'
  },
  '&:disabled': {
    backgroundColor: '#94A3B8',
    cursor: 'not-allowed',
    boxShadow: 'none'
  }
});

const ControlGrid = styled('div', {
  display: 'grid',
  gridTemplateColumns: '1.2fr 0.8fr',
  gap: '24px',
  width: '100%',
  boxSizing: 'border-box',
  '@tablet': {
    gridTemplateColumns: '1fr',
    gap: '16px'
  }
});

const TimelineContainer = styled('div', {
  display: 'flex',
  flexDirection: 'column',
  position: 'relative',
  paddingLeft: '24px',
  '&::before': {
    content: '""',
    position: 'absolute',
    top: '8px',
    left: '5px',
    bottom: '8px',
    width: '2px',
    backgroundColor: '$border',
    zIndex: 1
  }
});

const TimelineItem = styled('div', {
  display: 'flex',
  gap: '12px',
  position: 'relative',
  marginBottom: '16px',
  zIndex: 2,
  '&:last-child': {
    marginBottom: 0
  }
});

const TimelineDot = styled('div', {
  width: '12px',
  height: '12px',
  borderRadius: '50%',
  border: '2px solid #FFFFFF',
  boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
  position: 'absolute',
  left: '-24px',
  top: '4px',
  zIndex: 3,
  variants: {
    type: {
      fatigue: {
        backgroundColor: '$dangerBorder',
      },
      relief: {
        backgroundColor: '$accent',
      },
      system: {
        backgroundColor: '$successBorder',
      }
    }
  },
  defaultVariants: {
    type: 'system'
  }
});

const LiveIndicator = styled('div', {
  width: '8px',
  height: '8px',
  borderRadius: '50%',
  backgroundColor: '#10B981',
  boxShadow: '0 0 0 0 rgba(16, 185, 129, 0.4)',
  animation: 'pulseLive 2s infinite',

  '@keyframes pulseLive': {
    '0%': {
      transform: 'scale(0.95)',
      boxShadow: '0 0 0 0 rgba(16, 185, 129, 0.7)'
    },
    '70%': {
      transform: 'scale(1)',
      boxShadow: '0 0 0 6px rgba(16, 185, 129, 0)'
    },
    '100%': {
      transform: 'scale(0.95)',
      boxShadow: '0 0 0 0 rgba(16, 185, 129, 0)'
    }
  }
});

const ActiveShiftDashboard = styled('div', {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, 1fr)',
  gap: '12px',
  marginTop: '12px',
  padding: '12px',
  backgroundColor: '#F8FAFC',
  borderRadius: '10px',
  border: '1px solid $border'
});

const SupervisorHorizontalList = styled('div', {
  display: 'flex',
  gap: '14px',
  overflowX: 'auto',
  padding: '8px 4px 12px 4px',
  scrollbarWidth: 'none',
  WebkitOverflowScrolling: 'touch',
  margin: '0 -16px',
  paddingLeft: '16px',
  paddingRight: '16px',
  '&::-webkit-scrollbar': {
    display: 'none'
  }
});

const SupervisorAvatarCard = styled('div', {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '6px',
  flex: '0 0 70px',
  cursor: 'pointer',
  transition: 'transform 0.2s ease',
  '&:active': {
    transform: 'scale(0.92)'
  }
});

const SupervisorAvatar = styled('div', {
  width: '44px',
  height: '44px',
  borderRadius: '50%',
  backgroundColor: '#DBEAFE',
  color: '$accent',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '13px',
  fontWeight: 700,
  border: '2px solid #FFFFFF',
  boxShadow: '0 2px 6px rgba(0,0,0,0.06)',
  position: 'relative'
});

const AlertasContainer = styled('div', {
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
  maxHeight: '300px',
  overflowY: 'auto'
});

const AlertaCard = styled('div', {
  padding: '12px 16px',
  border: '1px solid $border',
  borderRadius: '12px',
  display: 'flex',
  alignItems: 'center',
  gap: '10px',

  variants: {
    type: {
      fatigue: {
        backgroundColor: '$dangerBg',
        borderColor: '$dangerBorder',
        color: '$dangerBorder'
      },
      transit: {
        backgroundColor: '$transitBg',
        borderColor: '$transitBorder',
        color: '$transitBorder'
      },
      info: {
        backgroundColor: '$infoBg',
        borderColor: '$infoBorder',
        color: '$infoBorder'
      }
    }
  }
});

// --- BARRA DE NAVEGACIÓN INFERIOR (TABBAR COORDINADOR) ---
const TabBarContainer = styled('nav', {
  position: 'fixed',
  bottom: 0,
  left: 0,
  right: 0,
  height: 'calc(64px + env(safe-area-inset-bottom, 0px))',
  backgroundColor: '#FFFFFF',
  borderTop: '1px solid $border',
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-around',
  zIndex: 1000,
  boxSizing: 'border-box',
  padding: '0 4px',
  paddingBottom: 'env(safe-area-inset-bottom, 0px)',
  boxShadow: '0 -4px 16px rgba(15, 23, 42, 0.04), 0 -1px 2px rgba(15, 23, 42, 0.02)'
});

const TabButton = styled('button', {
  background: 'none',
  border: 'none',
  outline: 'none',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  height: '64px', // Altura estricta para la zona táctil
  flex: 1,
  color: '$textSecondary',
  cursor: 'pointer',
  fontFamily: '$sans',
  fontSize: '11px',
  fontWeight: 500,
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

const TabLabel = styled('span', {
  fontSize: '10px',
  fontWeight: 600,
  letterSpacing: '0.01em',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  maxWidth: '100%'
});

// Modal para supervisor
const ModalOverlay = styled('div', {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(15, 23, 42, 0.45)', // Scrim más contrastante
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 2000,
  animation: 'fadeIn 0.2s ease-out'
});

const ModalContent = styled('div', {
  backgroundColor: '#FFFFFF',
  borderRadius: '20px', // Redondeado Material 3
  padding: '24px 28px',
  width: '90%',
  maxWidth: '380px',
  border: '1px solid $border',
  boxShadow: '$elevation3',
  animation: 'slideDown 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
});

const DayToggleContainer = styled('div', {
  display: 'flex',
  backgroundColor: '#F1F5F9',
  padding: '4px',
  borderRadius: '10px',
  border: '1px solid $border',
  gap: '4px',
  marginLeft: 'auto',
  marginRight: '16px',
  '@mobile': {
    order: 10,
    width: '100%',
    marginLeft: 0,
    marginRight: 0,
    marginTop: '2px'
  }
});

const DayToggleButton = styled('button', {
  padding: '6px 12px',
  fontSize: '10.5px',
  fontWeight: 700,
  borderRadius: '8px',
  border: 'none',
  cursor: 'pointer',
  transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
  fontFamily: '$sans',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  outline: 'none',

  '&:active': {
    transform: 'scale(0.96)'
  },

  '@mobile': {
    flex: 1,
    padding: '10px 8px',
    fontSize: '11px'
  },

  variants: {
    active: {
      true: {
        backgroundColor: '#FFFFFF',
        color: '$accent',
        boxShadow: '0 2px 6px rgba(15, 23, 42, 0.08)'
      },
      false: {
        backgroundColor: 'transparent',
        color: '$textSecondary',
        '&:hover': {
          color: '$textPrimary'
        }
      }
    }
  }
});



// --- COMPONENT IMPLEMENTATION ---

export default function PanelCoordinador({ coordinatorName, onLogout, isOffline }) {
  const [currentTab, setCurrentTab] = useState('MAPA'); // 'MAPA' | 'PUESTOS' | 'DASHBOARD' | 'SUGERENCIAS' | 'CONTROL'
  const [activeLines, setActiveLines] = useState(["L4", "L1", "L2", "L6", "L7", "L5", "L3", "L8", "L9", "L10"]);
  const [selectedLineId, setSelectedLineId] = useState("L4");
  const [skuPlan, setSkuPlan] = useState({});
  const [supervisors, setSupervisors] = useState({});
  const [puestos, setPuestos] = useState([]);
  const [workers, setWorkers] = useState({});
  const [editingLineId, setEditingLineId] = useState(null);
  const [tempSupervisorName, setTempSupervisorName] = useState("");
  const [shiftActive, setShiftActive] = useState(false);
  const [triggeringStart, setTriggeringStart] = useState(false);
  const [applyingRotationId, setApplyingRotationId] = useState(null);
  const [applyingAll, setApplyingAll] = useState(false);
  const [configDocs, setConfigDocs] = useState({});
  const [viewDay, setViewDay] = useState('TODAY'); // 'TODAY' | 'NEXT_DAY' | 'HISTORY'
  const [selectedDate, setSelectedDate] = useState(() => {
    const local = new Date();
    const offset = local.getTimezoneOffset();
    const localDate = new Date(local.getTime() - (offset * 60 * 1000));
    return localDate.toISOString().split('T')[0];
  });
  const [historicalData, setHistoricalData] = useState(null);
  const [dayOrders, setDayOrders] = useState([]); // Órdenes del día cargadas de programa_produccion
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [programingNextDay, setProgramingNextDay] = useState(false);
  const [isConfiguringNextDay, setIsConfiguringNextDay] = useState(false);
  const [nextDaySkuPlan, setNextDaySkuPlan] = useState({
    L1: "SKU-441-AQUA",
    L2: "SKU-102-LITE",
    L3: "SKU-441-AQUA",
    L4: "SKU-990-BOST",
    L5: "INACTIVO",
    L6: "SKU-990-BOST",
    L7: "INACTIVO",
    L8: "SKU-102-LITE",
    L9: "INACTIVO",
    L10: "INACTIVO"
  });


  const presetSupervisors = [
    "Ing. Carlos Mendoza", "Ing. Sofía Reyes", "Ing. Martín Gómez", 
    "Ing. Elena Torres", "Ing. Oscar Díaz", "Ing. Lucía Sanz"
  ];

  // 1. Escuchar la colección config reactivamente
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "config"), (snapshot) => {
      const map = {};
      snapshot.forEach(docSnap => {
        map[docSnap.id] = docSnap.data();
      });
      setConfigDocs(map);

      // Cargar configuraciones del mapeo
      const globalPri = map["global_priority"];
      if (globalPri) {
        const fullLineOrder = ["L4", "L1", "L2", "L6", "L7", "L5", "L3", "L8", "L9", "L10"];
        const orderToUse = (globalPri.priorityOrder && globalPri.priorityOrder.length >= 8) 
          ? globalPri.priorityOrder 
          : fullLineOrder;
          
        setActiveLines(orderToUse);
        
        const skus = {};
        const activeLinesList = globalPri.activeLines || [];
        orderToUse.forEach(l => {
          const planSku = (globalPri.skuPlan && globalPri.skuPlan[l]) || (globalPri.skuPlanMap && globalPri.skuPlanMap[l]);
          if (planSku) {
            skus[l] = planSku;
          } else if (activeLinesList.includes(l)) {
            skus[l] = globalPri.skuAssigned || "SKU-990-BOST";
          } else {
            skus[l] = "INACTIVO";
          }
        });
        
        setSkuPlan(skus);
      }

      const shift = map["shift_status"];
      if (shift) {
        setShiftActive(!!shift.shiftStartTimestamp);
      }

      const sups = map["supervisors_assignment"];
      if (sups) {
        setSupervisors(sups);
      }
    });

    return () => unsub();
  }, []);

  // 2. Escuchar puestos de toda la planta
  useEffect(() => {
    const unsubscribe = onSnapshot(puestosColl, (snapshot) => {
      const list = [];
      snapshot.forEach(docSnap => {
        list.push({ id: docSnap.id, ...docSnap.data() });
      });
      setPuestos(list);
    });
    return () => unsubscribe();
  }, []);

  // 3. Escuchar trabajadores
  useEffect(() => {
    const unsubscribe = onSnapshot(trabajadoresColl, (snapshot) => {
      const map = {};
      snapshot.forEach(docSnap => {
        map[docSnap.id] = { id: docSnap.id, ...docSnap.data() };
      });
      setWorkers(map);
    });
    return () => unsubscribe();
  }, []);

  // 3.5. Cargar datos históricos y órdenes del programa de producción de Excel al cambiar selectedDate
  useEffect(() => {
    const todayStr = (() => {
      const local = new Date();
      const offset = local.getTimezoneOffset();
      const localDate = new Date(local.getTime() - (offset * 60 * 1000));
      return localDate.toISOString().split('T')[0];
    })();

    const loadOrdersAndDayData = async () => {
      try {
        let orders = await getProgramaProduccionPorFecha(selectedDate);
        setDayOrders(orders);
        
        // Si hay órdenes reales del programa de producción de Excel para el día seleccionado,
        // actualizamos dinámicamente el skuPlan local para que se refleje únicamente las líneas operativas del Excel!
        // CORRECCIÓN: Para "HOY" (selectedDate === todayStr), no debemos sobreescribir con el plan estático del Excel del 28,
        // sino mantener los SKUs ficticios inyectados desde la página de pruebas / global_priority.
        if (selectedDate !== todayStr && orders && orders.length > 0) {
          const skus = {};
          activeLines.forEach(l => {
            const matchOrder = orders.find(o => o.lineaId === l);
            skus[l] = matchOrder ? matchOrder.item : "INACTIVO";
          });
          setSkuPlan(skus);
        }
      } catch (err) {
        console.error("Error al cargar órdenes de producción:", err);
      }
    };
    
    loadOrdersAndDayData();

    if (selectedDate === todayStr) {
      setViewDay('TODAY');
      setHistoricalData(null);
      return;
    }

    const tomorrowStr = (() => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const offset = tomorrow.getTimezoneOffset();
      const localDate = new Date(tomorrow.getTime() - (offset * 60 * 1000));
      return localDate.toISOString().split('T')[0];
    })();

    if (selectedDate === tomorrowStr) {
      setViewDay('NEXT_DAY');
      setHistoricalData(null);
      return;
    }

    async function loadHistory() {
      setIsLoadingHistory(true);
      try {
        const data = await getHistorialDia(selectedDate);
        setHistoricalData(data);
        setViewDay('HISTORY');
      } catch (err) {
        console.error("Error al cargar el historial:", err);
      } finally {
        setIsLoadingHistory(false);
      }
    }

    loadHistory();
  }, [selectedDate, activeLines]);

  // 4. Agregación de Métricas por Línea para el Mapa Global (Turno Actual)
  const lineStats = useMemo(() => {
    const stats = {};
    activeLines.forEach(lineId => {
      const linePuestos = puestos.filter(p => p.lineId === lineId);
      const lineConfig = configDocs[`line_${lineId}`];
      // RESOLVER SKU DINÁMICAMENTE: Priorizar la inyección en vivo desde Firestore, luego la planificación local.
      const activeSku = lineConfig?.sku || skuPlan[lineId] || "INACTIVO";

      const isLinePrep = !lineConfig || lineConfig.status === "PREPARACION";

      // Si la línea está suspendida (no tiene SKU o está en status SUSPENDIDO)
      const isSuspended = activeSku === "INACTIVO" || lineConfig?.status === "SUSPENDIDO" || linePuestos.some(p => p.status === "SUSPENDIDO");

      // Calcular cobertura
      const totalSlotsCount = linePuestos.length;
      const assignedSlotsCount = linePuestos.filter(p => p.status === "ASIGNADO").length;
      const coveragePct = totalSlotsCount > 0 ? Math.round((assignedSlotsCount / totalSlotsCount) * 100) : 0;
      const deficitCount = linePuestos.filter(p => p.status === "VACANTE" || p.status === "ALERTA_VACANTE").length;

      // Determinar estado semafórico de cobertura
      let coverageState = "success";
      if (isSuspended) coverageState = "suspended";
      else if (isLinePrep) coverageState = "danger";
      else if (coveragePct < 75) coverageState = "danger";
      else if (coveragePct < 100) coverageState = "warning";

      // Calcular OEE dinámico y reactivo para la pestaña de HOY basándose en la cobertura y eventos reales de la planta
      let oeePct = 0;
      const isShiftPrep = configDocs?.shift_status?.status === "PREPARACION";
      
      if (isShiftPrep || assignedSlotsCount === 0) {
        oeePct = 0;
      } else {
        // OEE basado en cobertura real de personal
        let computedOee = Math.round((assignedSlotsCount / totalSlotsCount) * 95);
        
        // Si hay paros registrados en el config de la línea, restar su impacto
        let totalParoMins = 0;
        if (lineConfig) {
          if (lineConfig.paros) {
            lineConfig.paros.forEach(p => {
              totalParoMins += Math.round((p.durationSeconds || 0) / 60);
            });
          }
          if (lineConfig.activeParo) {
            const startSecs = lineConfig.activeParo.startedAt?.seconds || (Date.now() / 1000);
            const elapsedMins = Math.round((Date.now() / 1000 - startSecs) / 60);
            totalParoMins += elapsedMins;
          }
        }
        
        computedOee = computedOee - Math.round(totalParoMins * 0.5);
        oeePct = Math.max(30, Math.min(98, computedOee));
      }

      stats[lineId] = {
        totalSlots: totalSlotsCount,
        assignedSlots: assignedSlotsCount,
        coveragePct,
        coverageState,
        oeePct,
        isLinePrep,
        deficitCount,
        sku: isSuspended ? "INACTIVO" : activeSku,
        supervisor: supervisors[lineId] || "Sin Asignar",
        puestosData: linePuestos
      };
    });
    return stats;
  }, [puestos, activeLines, skuPlan, supervisors, configDocs]);

  // 4.5. RESOLVER MÉTRICAS Y DATOS DEL PLAN DEL DÍA SIGUIENTE REACTIVAMENTE
  const activeLineStats = useMemo(() => {
    if (viewDay === 'TODAY') {
      return lineStats;
    }

    if (viewDay === 'HISTORY') {
      return historicalData?.lineStats || null;
    }

    const nextPlan = configDocs["next_day_plan"];
    if (!nextPlan || !nextPlan.skuPlan) return null;

    const stats = {};
    activeLines.forEach(lineId => {
      const linePuestos = puestos.filter(p => p.lineId === lineId);
      const skuTomorrow = (nextPlan.skuPlan && nextPlan.skuPlan[lineId]) || "INACTIVO";
      const isSuspended = skuTomorrow === "INACTIVO";

      const tomorrowTotalSlots = (nextPlan.totalSlots && nextPlan.totalSlots[lineId]) || linePuestos.length;
      const tomorrowDeficits = (nextPlan.deficits && nextPlan.deficits[lineId]) || 0;
      const tomorrowAssigned = Math.max(0, tomorrowTotalSlots - tomorrowDeficits);
      const coveragePct = tomorrowTotalSlots > 0 ? Math.round((tomorrowAssigned / tomorrowTotalSlots) * 100) : 0;
      const oeePct = (nextPlan.OEE && nextPlan.OEE[lineId]) || 0;

      // Generar puestos simulados para mañana
      const tomorrowPuestosData = linePuestos.map(p => {
        const tomorrowAssign = nextPlan.assignments ? nextPlan.assignments[p.id] : null;
        return {
          id: p.id,
          puestoName: p.puestoName,
          tipoPuesto: p.tipoPuesto,
          status: tomorrowAssign ? tomorrowAssign.status : "VACANTE",
          idWorkerCurrent: tomorrowAssign ? tomorrowAssign.idWorkerCurrent : null,
          workerName: tomorrowAssign ? tomorrowAssign.workerName : "VACANTE",
          locked: tomorrowAssign ? !!tomorrowAssign.locked : false
        };
      });

      stats[lineId] = {
        totalSlots: tomorrowTotalSlots,
        assignedSlots: tomorrowAssigned,
        coveragePct,
        coverageState: isSuspended ? "suspended" : (tomorrowDeficits > 0 ? "danger" : "success"),
        oeePct,
        isLinePrep: false,
        deficitCount: tomorrowDeficits,
        sku: skuTomorrow,
        supervisor: supervisors[lineId] || "Sin Asignar",
        puestosData: tomorrowPuestosData
      };
    });
    return stats;
  }, [viewDay, lineStats, configDocs, activeLines, puestos, supervisors]);

  // Auto-seleccionar la primera línea activa por defecto si la actual está suspendida o inactiva
  useEffect(() => {
    if (activeLineStats && Object.keys(activeLineStats).length > 0) {
      const statsForCurrent = activeLineStats[selectedLineId];
      if (!statsForCurrent || statsForCurrent.sku === "INACTIVO") {
        const firstActiveLine = activeLines.find(l => activeLineStats[l] && activeLineStats[l].sku !== "INACTIVO");
        if (firstActiveLine) {
          setSelectedLineId(firstActiveLine);
        }
      }
    }
  }, [activeLineStats, selectedLineId, activeLines]);

  // 5. Analíticas y KPIs Consolidados de Planta (Hoy vs Mañana)
  const plantMetrics = useMemo(() => {
    const activeLinesList = activeLines.filter(l => lineStats[l] && lineStats[l].sku !== "INACTIVO");
    const operationalLinesCount = activeLinesList.length || 1;

    // a. OEE Promedio de Planta
    const totalOee = activeLinesList.reduce((acc, l) => acc + (lineStats[l]?.oeePct || 0), 0);
    const avgOee = Math.round(totalOee / operationalLinesCount);

    // b. Tiempo de Paro Total (Minutos) y Mermas Consolidadas
    let totalDowntimeMinutes = 0;
    let totalMermasProcess = 0;
    const parosByCategory = { MECÁNICO: 0, ELÉCTRICO: 0, CALIDAD: 0, FALTA_DE_MATERIAL: 0 };
    const mermasByMaterial = { tapon: 0, botella: 0, estuche: 0, etiqueta: 0 };

    activeLines.forEach(lineId => {
      const lineConfig = configDocs[`line_${lineId}`];
      if (lineConfig) {
        if (lineConfig.mermas) {
          Object.keys(lineConfig.mermas).forEach(material => {
            const processWaste = parseInt(lineConfig.mermas[material]?.proceso) || 0;
            totalMermasProcess += processWaste;
            mermasByMaterial[material] += processWaste;
          });
        }
        if (lineConfig.paros) {
          lineConfig.paros.forEach(p => {
            const mins = Math.round((p.durationSeconds || 0) / 60);
            totalDowntimeMinutes += mins;
            if (parosByCategory[p.category] !== undefined) {
              parosByCategory[p.category] += mins;
            }
          });
        }
        if (lineConfig.activeParo) {
          const startedAt = lineConfig.activeParo.startedAt;
          const startMs = startedAt?.toDate ? startedAt.toDate().getTime() : new Date(startedAt).getTime();
          const mins = Math.max(1, Math.round((Date.now() - startMs) / 60000));
          totalDowntimeMinutes += mins;
          if (parosByCategory[lineConfig.activeParo.category] !== undefined) {
            parosByCategory[lineConfig.activeParo.category] += mins;
          }
        }
      }
    });

    return {
      avgOee,
      totalDowntimeMinutes,
      totalMermasProcess,
      parosByCategory,
      mermasByMaterial
    };
  }, [activeLines, lineStats, configDocs]);

  const activePlantMetrics = useMemo(() => {
    if (viewDay === 'TODAY') {
      return plantMetrics;
    }

    if (viewDay === 'HISTORY') {
      return historicalData?.metrics || { avgOee: 0, totalDowntimeMinutes: 0, totalMermasProcess: 0, parosByCategory: { MECÁNICO: 0, ELÉCTRICO: 0, CALIDAD: 0, FALTA_DE_MATERIAL: 0 }, mermasByMaterial: { tapon: 0, botella: 0, estuche: 0, etiqueta: 0 } };
    }

    const nextPlan = configDocs["next_day_plan"];
    if (!nextPlan || !nextPlan.skuPlan) return { avgOee: 0, totalDowntimeMinutes: 0, totalMermasProcess: 0, parosByCategory: { MECÁNICO: 0, ELÉCTRICO: 0, CALIDAD: 0, FALTA_DE_MATERIAL: 0 }, mermasByMaterial: { tapon: 0, botella: 0, estuche: 0, etiqueta: 0 } };

    const activeLinesList = activeLines.filter(l => nextPlan.skuPlan && nextPlan.skuPlan[l] && nextPlan.skuPlan[l] !== "INACTIVO");
    const operationalLinesCount = activeLinesList.length || 1;

    let totalOee = 0;
    activeLinesList.forEach(l => {
      totalOee += (nextPlan.OEE && nextPlan.OEE[l]) || 0;
    });

    const avgOee = Math.round(totalOee / operationalLinesCount);

    return {
      avgOee,
      totalDowntimeMinutes: 0,
      totalMermasProcess: 0,
      parosByCategory: { MECÁNICO: 0, ELÉCTRICO: 0, CALIDAD: 0, FALTA_DE_MATERIAL: 0 },
      mermasByMaterial: { tapon: 0, botella: 0, estuche: 0, etiqueta: 0 }
    };
  }, [viewDay, plantMetrics, configDocs, activeLines]);

  // 6. Alertas de fatiga y operarios en tránsito globales
  const plantAlerts = useMemo(() => {
    const list = [];
    Object.values(workers).forEach(w => {
      if (w.status === "EN_TRANSITO") {
        list.push({
          id: `transit-${w.id}`,
          type: "transit",
          text: `Operario ${w.name} en tránsito`,
          subtext: `Destino: Línea ${w.lineaDestinoId} ── Despachado del Bolsón L8.`
        });
      }
    });

    puestos.forEach(p => {
      if (p.status === "ASIGNADO" && p.asignadoEnSegundoVirtual) {
        // El sistema de fatiga NO aplica para operadores ni supervisores (puestos fijos críticos), solo puestos varios
        const esFijo = ["Operador A", "Averiero", "Operador C"].includes(p.tipoPuesto);
        if (esFijo) return;

        const t = p.asignadoEnSegundoVirtual;
        const ms = t.toDate ? t.toDate().getTime() : (t.seconds ? t.seconds * 1000 : new Date(t).getTime());
        const elapsed = Math.max(0, Math.floor((Date.now() - ms) / 60000));
        
        if (elapsed >= 105) {
          const w = workers[p.idWorkerCurrent];
          const wName = w ? w.name : "Operario";
          list.push({
            id: `fatigue-${p.id}`,
            type: "fatigue",
            text: `Fatiga en Línea ${p.lineId} (${p.puestoName})`,
            subtext: `${wName} lleva ${elapsed} minutos activo. Requiere relevo ergonómico.`
          });
        }
      }
    });

    return list;
  }, [puestos, workers]);

  // 6.5. ALGORITMO SMART ROTATION: Calcular sugerencias de inyección y rotación por déficit en base a la planificación seleccionada
  const deficitSuggestions = useMemo(() => {
    // Helper function for role matching
    const isWorkerRoleCompatibleWithSlot = (workerRole, slotTipo) => {
      if (!workerRole || !slotTipo) return false;
      const wRole = workerRole.trim().toLowerCase();
      const sTipo = slotTipo.trim().toLowerCase();

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
        return ["operario", "operario varios", "auxiliar materiales", "limpieza", "soporte", "nuevos ingresos", "asistente", "rotativo", "operario de patio"].includes(wRole);
      }
      return wRole === sTipo;
    };

    // Generar mapeo de prioridad de líneas activas
    const priorityMap = {};
    activeLines.forEach((lId, idx) => {
      priorityMap[lId] = activeLines.length - idx; // Mayor número = mayor prioridad
    });

    if (viewDay === 'TODAY') {
      // --- PLANIFICACIÓN DE HOY (MAÑANA) EN VIVO ---
      // Encontrar todos los puestos vacantes (déficits) de líneas activas que no estén suspendidas
      const deficits = puestos.filter(p => 
        (p.status === "VACANTE" || p.status === "ALERTA_VACANTE") && 
        p.status !== "SUSPENDIDO" &&
        skuPlan[p.lineId] && 
        skuPlan[p.lineId] !== "INACTIVO"
      );

      // Obtener trabajadores disponibles
      const poolWorkers = Object.values(workers).filter(w => 
        w.status === "POOL_ARRANQUE" && 
        w.currentSlotId == null
      );
      
      const bolsonWorkers = Object.values(workers).filter(w => 
        w.status === "DISPONIBLE_BOLSON" && 
        w.currentSlotId == null
      );

      const activeAssignedWorkers = Object.values(workers).filter(w => 
        w.status === "ASIGNADO" && 
        w.currentSlotId != null
      );

      const suggestions = [];
      const assignedInSuggestions = new Set();

      deficits.forEach(slot => {
        const requiredCap = slot.requiredCapabilities || [];
        const stationName = slot.puestoName;

        // A. Primero buscar en el Pool de Arranque
        let chosenWorker = poolWorkers.find(w => {
          if (assignedInSuggestions.has(w.id)) return false;
          if (!isWorkerRoleCompatibleWithSlot(w.role, slot.tipoPuesto)) return false;
          
          const restrictions = w.medicalRestrictions || [];
          const medicalConflict = requiredCap.some(cap => restrictions.includes(`PROHIBIDO_${cap}`) || restrictions.includes(cap));
          if (medicalConflict) return false;

          if (w.lastActivity === stationName) return false;
          return true;
        });

        let suggestionType = "POOL";

        // B. Si no hay en Pool, buscar en el Bolsón L8
        if (!chosenWorker) {
          chosenWorker = bolsonWorkers.find(w => {
            if (assignedInSuggestions.has(w.id)) return false;
            if (!isWorkerRoleCompatibleWithSlot(w.role, slot.tipoPuesto)) return false;
            
            const restrictions = w.medicalRestrictions || [];
            const medicalConflict = requiredCap.some(cap => restrictions.includes(`PROHIBIDO_${cap}`) || restrictions.includes(cap));
            if (medicalConflict) return false;

            if (w.lastActivity === stationName) return false;
            return true;
          });
          suggestionType = "BOLSON";
        }

        // C. Si no hay en Pool ni Bolsón, buscar en operarios asignados en líneas de MENOR prioridad
        if (!chosenWorker) {
          const slotPriority = priorityMap[slot.lineId] || 0;

          const candidateRotations = activeAssignedWorkers.filter(w => {
            if (assignedInSuggestions.has(w.id)) return false;
            if (!isWorkerRoleCompatibleWithSlot(w.role, slot.tipoPuesto)) return false;

            const wSlot = puestos.find(p => p.id === w.currentSlotId);
            if (!wSlot) return false;

            const wLinePriority = priorityMap[wSlot.lineId] || 0;
            if (wLinePriority >= slotPriority) return false; // Solo rotar de menor a mayor prioridad

            if (w.role === "OPERADOR_A" || w.role === "AVERIERO") return false;

            const restrictions = w.medicalRestrictions || [];
            const medicalConflict = requiredCap.some(cap => restrictions.includes(`PROHIBIDO_${cap}`) || restrictions.includes(cap));
            if (medicalConflict) return false;

            return true;
          });

          // Ordenar candidatos por la prioridad de la línea (la más baja primero para proteger líneas medianas)
          candidateRotations.sort((a, b) => {
            const aSlot = puestos.find(p => p.id === a.currentSlotId);
            const bSlot = puestos.find(p => p.id === b.currentSlotId);
            const aPriority = priorityMap[aSlot?.lineId] || 0;
            const bPriority = priorityMap[bSlot?.lineId] || 0;
            return aPriority - bPriority;
          });

          if (candidateRotations.length > 0) {
            chosenWorker = candidateRotations[0];
            suggestionType = "ROTACION";
          }
        }

        if (chosenWorker) {
          assignedInSuggestions.add(chosenWorker.id);
          suggestions.push({
            id: `sug-today-${slot.id}-${chosenWorker.id}`,
            slot,
            worker: chosenWorker,
            type: suggestionType,
            originalSlotId: chosenWorker.currentSlotId || null,
            originalLineId: chosenWorker.currentSlotId ? puestos.find(p => p.id === chosenWorker.currentSlotId)?.lineId : null
          });
        } else {
          suggestions.push({
            id: `sug-today-empty-${slot.id}`,
            slot,
            worker: null,
            type: "NINGUNO",
            originalSlotId: null,
            originalLineId: null
          });
        }
      });

      return suggestions;
    } else {
      // --- PLANIFICACIÓN DE MAÑANA (DÍA POSTERIOR) ---
      const nextPlan = configDocs["next_day_plan"];
      if (!nextPlan || !nextPlan.assignments) return [];

      const nextSkuPlan = nextPlan.skuPlan || {};

      // Deficits en el plan: asignaciones que tienen status "VACANTE"
      const tomorrowDeficits = Object.values(nextPlan.assignments).filter(assign => 
        assign.status === "VACANTE" &&
        nextSkuPlan[puestos.find(p => p.id === assign.id)?.lineId] &&
        nextSkuPlan[puestos.find(p => p.id === assign.id)?.lineId] !== "INACTIVO"
      );

      // Trabajadores asignados en el plan de mañana
      const assignedWorkerIdsTomorrow = new Set(
        Object.values(nextPlan.assignments)
          .filter(a => a.status === "ASIGNADO")
          .map(a => a.idWorkerCurrent)
      );

      // Personal disponible en la planta que no está asignado en el plan de mañana
      const availableWorkersTomorrow = Object.values(workers).filter(w => 
        !assignedWorkerIdsTomorrow.has(w.id) &&
        w.status !== "INACTIVO"
      );

      const suggestions = [];
      const assignedInSuggestions = new Set();

      tomorrowDeficits.forEach(assign => {
        const slot = puestos.find(p => p.id === assign.id);
        if (!slot) return;

        const requiredCap = slot.requiredCapabilities || [];
        const stationName = slot.puestoName;

        // A. Buscar en los trabajadores no asignados para mañana
        let chosenWorker = availableWorkersTomorrow.find(w => {
          if (assignedInSuggestions.has(w.id)) return false;
          if (!isWorkerRoleCompatibleWithSlot(w.role, slot.tipoPuesto)) return false;
          const restrictions = w.medicalRestrictions || [];
          if (requiredCap.some(cap => restrictions.includes(`PROHIBIDO_${cap}`) || restrictions.includes(cap))) return false;
          if (w.lastActivity === stationName) return false;
          return true;
        });

        let suggestionType = "POOL"; // Inyeccion en plan

        // B. Rotación cruzada en el plan: Buscar trabajadores asignados en líneas de menor prioridad
        if (!chosenWorker) {
          const slotPriority = priorityMap[slot.lineId] || 0;
          
          const candidateRotations = Object.values(nextPlan.assignments).filter(a => {
            if (a.status !== "ASIGNADO" || !a.idWorkerCurrent) return false;
            if (assignedInSuggestions.has(a.idWorkerCurrent)) return false;

            const w = workers[a.idWorkerCurrent];
            if (!w || w.role === "OPERADOR_A" || w.role === "AVERIERO") return false;
            if (!isWorkerRoleCompatibleWithSlot(w.role, slot.tipoPuesto)) return false;

            const originalSlot = puestos.find(p => p.id === a.id);
            if (!originalSlot) return false;

            const wLinePriority = priorityMap[originalSlot.lineId] || 0;
            if (wLinePriority >= slotPriority) return false; // Solo rotar de menor a mayor prioridad

            const restrictions = w.medicalRestrictions || [];
            if (requiredCap.some(cap => restrictions.includes(`PROHIBIDO_${cap}`) || restrictions.includes(cap))) return false;

            return true;
          });

          // Ordenar por prioridad de la línea original
          candidateRotations.sort((a, b) => {
            const aSlot = puestos.find(p => p.id === a.id);
            const bSlot = puestos.find(p => p.id === b.id);
            return (priorityMap[aSlot?.lineId] || 0) - (priorityMap[bSlot?.lineId] || 0);
          });

          if (candidateRotations.length > 0) {
            const bestAssign = candidateRotations[0];
            chosenWorker = workers[bestAssign.idWorkerCurrent];
            suggestionType = "ROTACION";
          }
        }

        if (chosenWorker) {
          assignedInSuggestions.add(chosenWorker.id);
          const originalAssign = Object.values(nextPlan.assignments).find(a => a.idWorkerCurrent === chosenWorker.id);
          
          suggestions.push({
            id: `sug-tomorrow-${slot.id}-${chosenWorker.id}`,
            slot,
            worker: chosenWorker,
            type: suggestionType,
            originalSlotId: originalAssign ? originalAssign.id : null,
            originalLineId: originalAssign ? puestos.find(p => p.id === originalAssign.id)?.lineId : null
          });
        } else {
          suggestions.push({
            id: `sug-tomorrow-empty-${slot.id}`,
            slot,
            worker: null,
            type: "NINGUNO",
            originalSlotId: null,
            originalLineId: null
          });
        }
      });

      return suggestions;
    }
  }, [puestos, workers, skuPlan, activeLines, configDocs, viewDay]);



  const handleToggleSlotLock = async (slotId) => {
    triggerNativeHapticFeedback('short');
    
    const plan = configDocs["next_day_plan"];
    if (!plan || !plan.assignments) {
      alert("Error: No existe un plan generado para mañana para poder bloquear puestos.");
      return;
    }
    
    const assignments = { ...plan.assignments };
    const currentAssign = assignments[slotId];
    if (!currentAssign) {
      alert("El puesto no forma parte de la planificación activa de mañana.");
      return;
    }
    
    const isLocked = !currentAssign.locked;
    assignments[slotId] = {
      ...currentAssign,
      locked: isLocked
    };
    
    try {
      await updateDoc(doc(db, "config", "next_day_plan"), {
        assignments: assignments,
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      alert("Error al conmutar bloqueo lógico: " + err.message);
    }
  };



  const handleConfirmPlan = async () => {
    triggerNativeHapticFeedback('confirm');
    try {
      const planRef = doc(db, "config", "next_day_plan");
      await setDoc(planRef, {
        status: "CONFIRMADO",
        updatedAt: new Date()
      }, { merge: true });
      alert("¡Planificación de Mañana CONFIRMADA y SELLADA con éxito! Los supervisores ahora pueden ver las asignaciones oficiales.");
    } catch (err) {
      triggerNativeHapticFeedback('error');
      alert(`Error al confirmar plan: ${err.message}`);
    }
  };



  const handleProgramNextDay = () => {
    triggerNativeHapticFeedback('short');
    const existingPlan = configDocs["next_day_plan"]?.skuPlan;
    if (existingPlan) {
      setNextDaySkuPlan(existingPlan);
    } else {
      setNextDaySkuPlan({
        L1: "SKU-441-AQUA",
        L2: "SKU-102-LITE",
        L3: "SKU-441-AQUA",
        L4: "SKU-990-BOST",
        L5: "INACTIVO",
        L6: "SKU-990-BOST",
        L7: "INACTIVO",
        L8: "SKU-102-LITE",
        L9: "INACTIVO",
        L10: "INACTIVO"
      });
    }
    setIsConfiguringNextDay(true);
  };

  const handleLoadTomorrowFromExcel = async () => {
    triggerNativeHapticFeedback('short');
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const offset = tomorrow.getTimezoneOffset();
    const localDate = new Date(tomorrow.getTime() - (offset * 60 * 1000));
    const tomorrowStr = localDate.toISOString().split('T')[0];

    try {
      let targetDateStr = tomorrowStr;
      let orders = await getProgramaProduccionPorFecha(targetDateStr);
      
      if (!orders || orders.length === 0) {
        // Entrar en modo interactivo/simulador para facilitar pruebas
        const response = window.prompt(
          `No se encontraron órdenes de producción para el día de mañana real (${tomorrowStr}).\n\n` +
          `Para fines de prueba, ingresa qué fecha del programa de Excel deseas cargar:\n` +
          `• 2026-05-26  (Activa Línea 1)\n` +
          `• 2026-05-27  (Activa Línea 2)\n` +
          `• 2026-05-28  (Activa Líneas 2 y 4)\n\n` +
          `Ingresa la fecha (formato YYYY-MM-DD):`,
          "2026-05-28"
        );

        if (!response) {
          return; // Cancelado por el usuario
        }

        const trimmedResponse = response.trim();
        const validDates = ["2026-05-26", "2026-05-27", "2026-05-28"];
        if (!validDates.includes(trimmedResponse)) {
          alert(`Fecha inválida o sin órdenes programadas: "${trimmedResponse}". Se canceló la carga.`);
          return;
        }

        targetDateStr = trimmedResponse;
        orders = await getProgramaProduccionPorFecha(targetDateStr);
      }

      if (!orders || orders.length === 0) {
        alert(`No se encontraron órdenes para la fecha seleccionada (${targetDateStr}).`);
        return;
      }

      const loadedPlan = {};
      activeLines.forEach(l => {
        const match = orders.find(o => o.lineaId === l);
        loadedPlan[l] = match ? match.item : "INACTIVO";
      });

      setNextDaySkuPlan(loadedPlan);
      
      const linesSched = Object.keys(loadedPlan).filter(l => loadedPlan[l] !== "INACTIVO");
      alert(`¡Programa de Excel cargado con éxito para la fecha seleccionada (${targetDateStr})!\n\n` +
            `Líneas activadas: ${linesSched.join(", ")}\n` +
            `Líneas inactivas (suspensión lógica): ${activeLines.filter(l => !linesSched.includes(l)).join(", ")}`);
    } catch (err) {
      console.error("Error al cargar plan de Excel:", err);
      alert(`Error al cargar plan de Excel: ${err.message}`);
    }
  };

  const handleSaveNextDayPlan = async () => {
    triggerNativeHapticFeedback('confirm');
    setProgramingNextDay(true);
    try {
      await programNextDayShift(nextDaySkuPlan);
      setIsConfiguringNextDay(false);
      triggerNativeHapticFeedback('confirm');
      alert("¡Planificación del Día Posterior generada con éxito! Se pre-asignó preventivamente al personal para el día posterior y se calcularon coberturas y déficits preventivos.");
    } catch (err) {
      triggerNativeHapticFeedback('error');
      alert(`Error al generar planificación: ${err.message}`);
    } finally {
      setProgramingNextDay(false);
    }
  };

  const handleApplyRotation = async (slotId, workerId, originalSlotId, workerName, slotName) => {
    triggerNativeHapticFeedback('short');
    setApplyingRotationId(slotId);
    try {
      // Aplicar sugerencia al plan de Mañana
      await executeCoordinatorSuggestion(workerId, slotId, originalSlotId);
      
      // Marcar plan como BORRADOR
      await setDoc(doc(db, "config", "next_day_plan"), {
        status: "BORRADOR",
        updatedAt: new Date()
      }, { merge: true });

      triggerNativeHapticFeedback('confirm');
      alert(`¡Sugerencia de rotación aplicada con éxito! ${workerName} ha sido asignado al puesto "${slotName}".`);
    } catch (err) {
      triggerNativeHapticFeedback('error');
      alert(`Error al aplicar sugerencia: ${err.message}`);
    } finally {
      setApplyingRotationId(null);
    }
  };

  const handleApplyAllSuggestions = async () => {
    triggerNativeHapticFeedback('confirm');
    const validSugs = deficitSuggestions.filter(s => s.worker != null);
    if (validSugs.length === 0) {
      alert("No hay sugerencias aplicables que cuenten con candidatos recomendados en este momento.");
      return;
    }

    setApplyingAll(true);
    try {
      const batch = writeBatch(db);
      const processedWorkers = new Set();
      const processedSlots = new Set();

      validSugs.forEach(sug => {
        const { slot, worker, originalSlotId } = sug;
        if (processedWorkers.has(worker.id) || processedSlots.has(slot.id)) return;
        processedWorkers.add(worker.id);
        processedSlots.add(slot.id);

        // 1. Si es rotación, liberar puesto anterior
        if (originalSlotId) {
          batch.update(doc(db, "puestos", originalSlotId), {
            status: "VACANTE",
            idWorkerCurrent: null,
            updatedAt: serverTimestamp()
          });
        }

        // 2. Asignar en puesto destino
        batch.update(doc(db, "puestos", slot.id), {
          status: "ASIGNADO",
          idWorkerCurrent: worker.id,
          updatedAt: serverTimestamp(),
          asignadoEnSegundoVirtual: serverTimestamp()
        });

        // 3. Actualizar operario
        batch.update(doc(db, "trabajadores", worker.id), {
          status: "ASIGNADO",
          currentSlotId: slot.id,
          lineaDestinoId: null,
          physicalLineLocation: slot.lineId,
          updatedAt: serverTimestamp()
        });
      });

      // Marcar plan como BORRADOR
      batch.set(doc(db, "config", "next_day_plan"), {
        status: "BORRADOR",
        updatedAt: serverTimestamp()
      }, { merge: true });

      await batch.commit();
      triggerNativeHapticFeedback('confirm');
      alert(`¡Balanceo automático completado! Se aplicaron ${processedSlots.size} rotaciones/asignaciones preventivas.`);
    } catch (err) {
      triggerNativeHapticFeedback('error');
      alert(`Error al aplicar balanceo masivo: ${err.message}`);
    } finally {
      setApplyingAll(false);
    }
  };

  const handleSaveSupervisor = async () => {
    if (!editingLineId) return;
    triggerNativeHapticFeedback('short');
    try {
      const newAssignments = { ...supervisors, [editingLineId]: tempSupervisorName };
      await setDoc(doc(db, "config", "supervisors_assignment"), newAssignments);
      
      // Marcar plan como BORRADOR
      await setDoc(doc(db, "config", "next_day_plan"), {
        status: "BORRADOR",
        updatedAt: new Date()
      }, { merge: true });

      setEditingLineId(null);
    } catch (err) {
      alert("Error al guardar la asignación del supervisor.");
    }
  };

  const handleOpenEditSupervisor = (lineId) => {
    triggerNativeHapticFeedback('short');
    setEditingLineId(lineId);
    setTempSupervisorName(supervisors[lineId] || "");
  };

  return (
    <PanelContainer id="coordinator-dashboard">
      {/* SideDrawer removed completely to eliminate all redundancies */}

      <StickyHeaderContainer>
        {isOffline && (
          <OfflineBanner id="offline-emergency-banner">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '6px'}}>
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <span>Modo Fuera de Línea Activo ── Coordinación limitada. Sincronización pendiente.</span>
          </OfflineBanner>
        )}
        <PanelHeader>
          <LogoArea>
            <LogoIcon>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/>
                <path d="m3.3 7 8.7 5 8.7-5"/>
                <path d="M12 22V12"/>
              </svg>
            </LogoIcon>
            <div>
              <PanelTitle>SmartAssign</PanelTitle>
              <PanelSubtitle>Mando de Coordinación General de Planta</PanelSubtitle>
            </div>
          </LogoArea>

          {/* Segmented Control de Perspectiva Temporal Global */}
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '8px',
            flexWrap: 'wrap'
          }} id="global-timeline-segmented-control">
            <div style={{ 
              display: 'flex', 
              gap: '3px', 
              backgroundColor: '#E2E8F0', 
              padding: '3px', 
              borderRadius: '8px',
              border: '1px solid #CBD5E1'
            }}>
              <button
                onClick={() => {
                  triggerNativeHapticFeedback('short');
                  const local = new Date();
                  const offset = local.getTimezoneOffset();
                  const localDate = new Date(local.getTime() - (offset * 60 * 1000));
                  setSelectedDate(localDate.toISOString().split('T')[0]);
                  setViewDay('TODAY');
                }}
                style={{
                  padding: '5px 10px',
                  fontSize: '10.5px',
                  fontWeight: 800,
                  borderRadius: '6px',
                  border: 'none',
                  cursor: 'pointer',
                  backgroundColor: viewDay === 'TODAY' ? '#FFFFFF' : 'transparent',
                  color: viewDay === 'TODAY' ? '#16A34A' : '#64748B',
                  boxShadow: viewDay === 'TODAY' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
                id="timeline-btn-today"
              >
                <span style={{
                  width: '5px',
                  height: '5px',
                  backgroundColor: '#16A34A',
                  borderRadius: '50%',
                  display: 'inline-block'
                }} />
                Hoy
              </button>

              <button
                onClick={() => {
                  triggerNativeHapticFeedback('short');
                  const tomorrow = new Date();
                  tomorrow.setDate(tomorrow.getDate() + 1);
                  const offset = tomorrow.getTimezoneOffset();
                  const localDate = new Date(tomorrow.getTime() - (offset * 60 * 1000));
                  setSelectedDate(localDate.toISOString().split('T')[0]);
                  setViewDay('NEXT_DAY');
                }}
                style={{
                  padding: '5px 10px',
                  fontSize: '10.5px',
                  fontWeight: 800,
                  borderRadius: '6px',
                  border: 'none',
                  cursor: 'pointer',
                  backgroundColor: viewDay === 'NEXT_DAY' ? '#FFFFFF' : 'transparent',
                  color: viewDay === 'NEXT_DAY' ? '#7E22CE' : '#64748B',
                  boxShadow: viewDay === 'NEXT_DAY' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
                id="timeline-btn-next-day"
              >
                <span style={{
                  width: '5px',
                  height: '5px',
                  backgroundColor: '#7E22CE',
                  borderRadius: '50%',
                  display: 'inline-block'
                }} />
                Mañana
              </button>

              <button
                onClick={() => {
                  triggerNativeHapticFeedback('short');
                  setViewDay('HISTORY');
                }}
                style={{
                  padding: '5px 10px',
                  fontSize: '10.5px',
                  fontWeight: 800,
                  borderRadius: '6px',
                  border: 'none',
                  cursor: 'pointer',
                  backgroundColor: viewDay === 'HISTORY' ? '#FFFFFF' : 'transparent',
                  color: viewDay === 'HISTORY' ? '#2563EB' : '#64748B',
                  boxShadow: viewDay === 'HISTORY' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
                id="timeline-btn-history"
              >
                <span style={{
                  width: '5px',
                  height: '5px',
                  backgroundColor: '#2563EB',
                  borderRadius: '50%',
                  display: 'inline-block'
                }} />
                Historial
              </button>
            </div>

            {/* Selector de fecha inline visible contextualmente en modo Historial */}
            {viewDay === 'HISTORY' && (
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '6px', 
                backgroundColor: '#F8FAFC', 
                border: '1px solid #CBD5E1', 
                padding: '4px 10px', 
                borderRadius: '8px',
                animation: `${fadeIn} 0.2s ease`
              }} id="global-timeline-datepicker-container">
                <input 
                  type="date"
                  value={selectedDate}
                  onChange={(e) => {
                    triggerNativeHapticFeedback('light');
                    setSelectedDate(e.target.value);
                  }}
                  style={{
                    padding: '4px 8px',
                    borderRadius: '6px',
                    border: '1px solid #CBD5E1',
                    fontSize: '11px',
                    color: '#1E293B',
                    fontWeight: 700,
                    outline: 'none',
                    backgroundColor: '#FFFFFF',
                    cursor: 'pointer'
                  }}
                  id="global-timeline-datepicker"
                />
              </div>
            )}
          </div>

          <ProfileArea>
            <CoordinatorBadge>Coordinador General</CoordinatorBadge>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#1E293B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100px' }}>{coordinatorName}</span>
            <LogoutBtn onClick={onLogout} title="Cerrar terminal de coordinación" id="coordinator-logout-btn">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>
              </svg>
            </LogoutBtn>
          </ProfileArea>
        </PanelHeader>
      </StickyHeaderContainer>

      {/* --- RENDERIZADO REACTIVO DE PESTAÑAS (TABS) --- */}

      {currentTab === 'MAPA' && (
        <TabContentContainer id="tab-coordinador-mapa">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px', borderBottom: '1px solid #E2E8F0', paddingBottom: '10px' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 style={{ fontSize: '14px', fontWeight: 800, color: '#1E293B', marginBottom: '2px' }}>
                {viewDay === 'TODAY' ? "Monitoreo en Tiempo Real" : (viewDay === 'HISTORY' ? "Historial Real de Planta" : "Cobertura Día Siguiente")}
              </h2>
              <span style={{ fontSize: '10px', color: '#64748B', fontWeight: 700 }}>
                {activeLines.filter(lineId => activeLineStats?.[lineId] && activeLineStats[lineId].sku !== "INACTIVO").length} Líneas Activas
              </span>
            </div>
          </div>

          {/* ORDENES DE PRODUCCION REALES DEL EXCEL (Cargadas de programa_produccion) */}
          {dayOrders && dayOrders.length > 0 && (
            <BentoCard style={{ marginBottom: '16px', padding: '12px 14px', borderLeft: '4px solid #2563EB' }} id="coordination-excel-orders-panel">
              <CardTitle style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                <span style={{ fontSize: '12px' }}>📋</span>
                <span style={{ fontSize: '11.5px', fontWeight: 800, color: '#1E293B' }}>Programa de Producción del Excel ({selectedDate})</span>
              </CardTitle>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
                {dayOrders.map(order => (
                  <div key={order.id} style={{
                    padding: '8px 10px',
                    borderRadius: '8px',
                    backgroundColor: '#F8FAFC',
                    border: '1px solid #E2E8F0',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '3px',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong style={{ fontSize: '11px', color: '#1D4ED8' }}>Orden: {order.ordenProceso}</strong>
                      <span style={{
                        padding: '2px 6px',
                        backgroundColor: '#EFF6FF',
                        border: '1px solid #BFDBFE',
                        borderRadius: '4px',
                        fontSize: '8px',
                        fontWeight: 800,
                        color: '#1E40AF'
                      }}>
                        Línea {order.lineaId}
                      </span>
                    </div>
                    <span style={{ fontSize: '10px', fontWeight: 700, color: '#334155', lineHeight: '1.2' }}>
                      {order.producto}
                    </span>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: '#64748B', marginTop: '2px' }}>
                      <span>SKU: <strong style={{ color: '#0F172A' }}>{order.item}</strong></span>
                      <span>Meta: <strong>{order.cajas} cjs</strong> / <strong>{order.botellas} bot</strong></span>
                    </div>
                    {order.comentario && (
                      <span style={{ fontSize: '8.5px', color: '#B45309', fontStyle: 'italic', marginTop: '2px' }}>
                        * {order.comentario}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </BentoCard>
          )}

          {/* DASHBOARD DE MOSAICOS REACTIVOS — EXIGENCIA PLAN MAESTRO 8.A */}
          {viewDay === 'NEXT_DAY' && !activeLineStats ? (
            <BentoCard style={{ marginBottom: '16px', padding: '30px 20px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }} id="coordination-mosaicos-dashboard-empty">
              <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.85 }}>
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              <div>
                <h4 style={{ fontSize: '13px', fontWeight: 800, color: '#1E293B', marginBottom: '4px' }}>Plan de Producción del Día Siguiente sin Programar</h4>
                <p style={{ fontSize: '11px', color: '#64748B', maxWidth: '420px', margin: '0 auto', lineHeight: 1.4, marginBottom: '12px' }}>
                  No se ha realizado la simulación de dotación de personal para mañana. Presione el botón de abajo para cargar las órdenes del Excel o configurar los SKUs de producción y generar el plan proyectado.
                </p>
                <button
                  onClick={() => {
                    triggerNativeHapticFeedback('short');
                    handleProgramNextDay();
                  }}
                  style={{
                    padding: '10px 18px',
                    backgroundColor: '#2563EB',
                    backgroundImage: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '10px',
                    fontSize: '11px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(37, 99, 235, 0.2)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    transition: 'all 0.2s ease'
                  }}
                  id="program-next-day-empty-mapa-btn"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
                  </svg>
                  <span>Planificar Día Siguiente (Motor T+1)</span>
                </button>
              </div>
            </BentoCard>
          ) : (
            <BentoCard style={{ marginBottom: '16px', padding: '12px 14px' }} id="coordination-mosaicos-dashboard">
              <CardTitle style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '12px' }}>🎛</span>
                  <span style={{ fontSize: '11.5px', fontWeight: 800 }}>Mosaicos Reactivos de Cobertura de Líneas</span>
                </div>
                <div style={{ display: 'flex', gap: '8px', fontSize: '9px', fontWeight: 700 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '3px', color: '#16A34A' }}>
                    <span style={{ width: '6px', height: '6px', backgroundColor: '#22C55E', borderRadius: '50%' }} /> Cubierto
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '3px', color: '#EF4444' }}>
                    <span style={{ width: '6px', height: '6px', backgroundColor: '#EF4444', borderRadius: '50%' }} /> Infracobertura
                  </span>
                </div>
              </CardTitle>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(68px, 1fr))', gap: '8px' }}>
                {activeLines.map(lineId => {
                  const stats = activeLineStats?.[lineId];
                  if (!stats || stats.sku === "INACTIVO") return null;

                  const isCovered = stats.deficitCount === 0;
                  
                  // Generar desglose de déficit por sexo y habilidad en tiempo real
                  const getDeficitBreakdown = (lId) => {
                    const s = activeLineStats?.[lId];
                    if (!s || s.deficitCount === 0) return null;
                    
                    const skillMap = {};
                    const sexMap = { Masculino: 0, Femenino: 0, Indistinto: 0 };
                    
                    s.puestosData.forEach(p => {
                      if (p.status === "VACANTE" || p.status === "ALERTA_VACANTE") {
                        const skill = p.tipoPuesto || "Operario";
                        skillMap[skill] = (skillMap[skill] || 0) + 1;
                        
                        const sex = p.sexoPreferente || "Indistinto";
                        if (sexMap[sex] !== undefined) sexMap[sex]++;
                      }
                    });
                    
                    const skillsStr = Object.keys(skillMap).map(k => `${skillMap[k]} ${k}`).join(', ');
                    const sexList = [];
                    if (sexMap.Masculino > 0) sexList.push(`${sexMap.Masculino} Masc`);
                    if (sexMap.Femenino > 0) sexList.push(`${sexMap.Femenino} Fem`);
                    if (sexMap.Indistinto > 0) sexList.push(`${sexMap.Indistinto} Indist.`);
                    const sexStr = sexList.join(', ');
                    
                    return { skills: skillsStr, sex: sexStr };
                  };

                  const breakdown = !isCovered ? getDeficitBreakdown(lineId) : null;

                  return (
                    <div
                      key={lineId}
                      onClick={() => {
                        triggerNativeHapticFeedback('short');
                        setSelectedLineId(lineId);
                      }}
                      style={{
                        padding: '8px 4px',
                        borderRadius: '8px',
                        backgroundColor: isCovered ? 'rgba(34, 197, 94, 0.08)' : 'rgba(239, 68, 68, 0.08)',
                        border: isCovered ? '1.5px solid #22C55E' : '1.5px solid #EF4444',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        transition: 'all 0.2s ease',
                        boxShadow: selectedLineId === lineId 
                          ? (isCovered ? '0 0 10px rgba(34,197,94,0.3)' : '0 0 10px rgba(239,68,68,0.3)')
                          : 'none',
                        transform: selectedLineId === lineId ? 'scale(1.03)' : 'scale(1)'
                      }}
                      title={!isCovered ? `Infracobertura. Requiere: ${breakdown?.skills} (${breakdown?.sex})` : 'Cobertura completa'}
                    >
                      <strong style={{ fontSize: '11px', color: '#1E293B' }}>{lineId}</strong>
                      <span style={{ fontSize: '8px', fontWeight: 800, color: isCovered ? '#16A34A' : '#B91C1C', marginTop: '2px' }}>
                        {isCovered ? "OK" : `⚠ -${stats.deficitCount}`}
                      </span>
                    </div>
                  );
                })}
              </div>
              
              {/* Detalle rápido del mosaico seleccionado */}
              {(() => {
                const stats = activeLineStats?.[selectedLineId];
                if (!stats || stats.sku === "INACTIVO") return null;
                const isCovered = stats.deficitCount === 0;
                
                const getDeficitBreakdown = (lId) => {
                  const s = activeLineStats?.[lId];
                  if (!s || s.deficitCount === 0) return null;
                  
                  const skillMap = {};
                  const sexMap = { Masculino: 0, Femenino: 0, Indistinto: 0 };
                  
                  s.puestosData.forEach(p => {
                    if (p.status === "VACANTE" || p.status === "ALERTA_VACANTE") {
                      const skill = p.tipoPuesto || "Operario";
                      skillMap[skill] = (skillMap[skill] || 0) + 1;
                      
                      const sex = p.sexoPreferente || "Indistinto";
                      if (sexMap[sex] !== undefined) sexMap[sex]++;
                    }
                  });
                  
                  const skillsStr = Object.keys(skillMap).map(k => `${skillMap[k]} ${k}`).join(', ');
                  const sexList = [];
                  if (sexMap.Masculino > 0) sexList.push(`${sexMap.Masculino} Masc`);
                  if (sexMap.Femenino > 0) sexList.push(`${sexMap.Femenino} Fem`);
                  if (sexMap.Indistinto > 0) sexList.push(`${sexMap.Indistinto} Indist.`);
                  const sexStr = sexList.join(', ');
                  
                  return { skills: skillsStr, sex: sexStr };
                };

                const breakdown = !isCovered ? getDeficitBreakdown(selectedLineId) : null;
                
                return (
                  <div style={{ marginTop: '8px', borderTop: '1px solid #F1F5F9', paddingTop: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '9.5px' }}>
                    <span style={{ color: '#64748B', fontWeight: 700 }}>
                      Línea {selectedLineId} seleccionada: <strong style={{ color: '#334155' }}>{stats.sku}</strong>
                    </span>
                    <span style={{ color: isCovered ? '#16A34A' : '#EF4444', fontWeight: 800, textAlign: 'right' }}>
                      {isCovered 
                        ? "✓ Cobertura óptima al 100%" 
                        : `Infracobertura ── Requiere: ${breakdown?.skills} (${breakdown?.sex})`}
                    </span>
                  </div>
                );
              })()}
            </BentoCard>
          )}

          {/* ACCIONES PRINCIPALES Y DILIGENCIA: SEPARACIÓN DE MÉTODOS Y CORRECCIÓN DE BUG */}
          <div style={{
            display: 'flex',
            gap: '10px',
            marginBottom: '14px',
            flexWrap: 'wrap'
          }}>
            {viewDay === 'TODAY' ? (
              <div style={{
                flex: 1,
                width: '100%',
                padding: '12px 16px',
                backgroundColor: '#EFF6FF',
                border: '1px solid #BFDBFE',
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxSizing: 'border-box'
              }}>
                <span style={{ fontSize: '14px' }}>ℹ️</span>
                <span style={{ fontSize: '10.5px', color: '#1E40AF', fontWeight: 600, lineHeight: '1.3' }}>
                  <strong>Monitoreo en Vivo Activo:</strong> El inicio del turno y la inyección de personal es gestionado directamente por los supervisores desde el piso de producción. Como Coordinador, audita el estado en tiempo real aquí.
                </span>
              </div>
            ) : (
              <>
                <button
                  onClick={() => {
                    triggerNativeHapticFeedback('short');
                    handleProgramNextDay();
                  }}
                  disabled={programingNextDay}
                  style={{
                    flex: 1,
                    minWidth: '200px',
                    padding: '14px 18px',
                    backgroundColor: '#2563EB',
                    backgroundImage: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '12px',
                    fontSize: '13px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px'
                  }}
                  id="assign-tomorrow-puestos-btn"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
                  </svg>
                  <span>
                    {programingNextDay ? "Simulando Roster..." : "Planificar Día Siguiente (Motor T+1)"}
                  </span>
                </button>

                <button
                  onClick={async () => {
                    triggerNativeHapticFeedback('medium');
                    setProgramingNextDay(true);
                    try {
                      const { reprogramPartialNextDayShift } = await import('../services/firebaseService');
                      await reprogramPartialNextDayShift(nextDaySkuPlan);
                      alert("¡Reprogramación Parcial completada! Se recalcularon las celdas desocupadas/no-bloqueadas respetando estrictamente los Candados (Locks) del Coordinador.");
                    } catch (err) {
                      alert(`Error al reprogramar parcialmente: ${err.message}`);
                    } finally {
                      setProgramingNextDay(false);
                    }
                  }}
                  disabled={programingNextDay}
                  style={{
                    flex: 1,
                    minWidth: '200px',
                    padding: '14px 18px',
                    backgroundColor: '#7E22CE',
                    backgroundImage: 'linear-gradient(135deg, #7E22CE 0%, #6B21A8 100%)',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '12px',
                    fontSize: '13px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(126, 34, 206, 0.25)',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px'
                  }}
                  id="reprogram-partial-tomorrow-btn"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                  </svg>
                  <span>
                    {programingNextDay ? "Reprogramando..." : "Reprogramar Parcial (Infracobertura)"}
                  </span>
                </button>
              </>
            )}
          </div>

          {viewDay === 'NEXT_DAY' && activeLineStats && (() => {
            const planStatus = configDocs["next_day_plan"]?.status || "BORRADOR";
            const isDraft = planStatus === "BORRADOR";

            return (
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '12px 16px',
                background: isDraft 
                  ? 'linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%)' 
                  : 'linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%)',
                border: isDraft ? '1px solid #FCD34D' : '1px solid #A7F3D0',
                borderRadius: '12px',
                marginBottom: '12px',
                gap: '12px',
                flexWrap: 'wrap',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.03)',
                animation: `${fadeIn} 0.3s ease`
              }} id="today-active-bar">
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    backgroundColor: isDraft ? '#F59E0B' : '#10B981',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#FFFFFF',
                    flexShrink: 0,
                    boxShadow: '0 2px 6px rgba(0,0,0,0.1)'
                  }}>
                    {isDraft ? (
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    )}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <span style={{ fontSize: '11px', fontWeight: 800, color: isDraft ? '#78350F' : '#064E3B', display: 'block', marginBottom: '1px' }}>
                      {isDraft ? "Plan en Borrador" : "Plan Confirmado"}
                    </span>
                    <span style={{ fontSize: '10px', color: isDraft ? '#B45309' : '#047857', fontWeight: 600 }}>
                      {isDraft 
                        ? "Confirma el plan para que los supervisores lo ejecuten."
                        : "Plan sellado y publicado oficialmente."}
                    </span>
                  </div>
                </div>
                
                {isDraft && (
                  <button
                    onClick={handleConfirmPlan}
                    style={{
                      padding: '10px 16px',
                      backgroundColor: '#10B981',
                      color: '#FFFFFF',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '11px',
                      fontWeight: 800,
                      cursor: 'pointer',
                      boxShadow: '0 4px 10px rgba(16, 185, 129, 0.2)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      flexShrink: 0,
                      animation: `${pulse} 2s infinite`
                    }}
                    id="confirm-seal-plan-btn"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ flexShrink: 0 }}>
                      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                      <polyline points="17 21 17 13 7 13 7 21"/>
                      <polyline points="7 3 7 8 15 8"/>
                    </svg>
                    <span>Sellar Plan</span>
                  </button>
                )}
              </div>
            );
          })()}

          <GridContainer id="semaphoric-lines-grid">
            {activeLines
              .filter(lineId => {
                const stats = activeLineStats?.[lineId];
                return stats && stats.sku !== "INACTIVO";
              })
              .map(lineId => {
              const stats = activeLineStats[lineId] || {
                totalSlots: 0,
                assignedSlots: 0,
                coveragePct: 0,
                coverageState: "suspended",
                oeePct: 0,
                deficitCount: 0,
                isLinePrep: false,
                sku: "INACTIVO",
                supervisor: "Sin Asignar",
                puestosData: []
              };

              return (
                <LineStatusCard 
                  key={lineId} 
                  coverage={stats.coverageState}
                  onClick={() => {
                    if (viewDay === 'HISTORY') {
                      triggerNativeHapticFeedback('error');
                      alert("Los reportes históricos están en modo de solo lectura cerrado.");
                      return;
                    }
                    handleOpenEditSupervisor(lineId);
                  }}
                  id={`line-card-${lineId}`}
                >
                  <LineCardHeader>
                    <LineTitle>Línea {lineId}</LineTitle>
                    <SkuTag>{stats.sku}</SkuTag>
                  </LineCardHeader>

                  <div style={{ fontSize: '11px', color: '#64748B', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2M12 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"/>
                    </svg>
                    <span>Sup: {stats.supervisor}</span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2px' }}>
                    <span style={{ fontSize: '10px', fontWeight: 700, color: '#334155' }}>
                      Cobertura: {stats.assignedSlots}/{stats.totalSlots} ({stats.coveragePct}%)
                    </span>
                    <MetricPill type={stats.deficitCount > 0 ? "danger" : stats.coverageState === "suspended" ? "suspended" : "success"}>
                      {stats.isLinePrep ? "En Paro" : stats.deficitCount > 0 ? `⚠ ${stats.deficitCount} Déficit` : "✓ Completa"}
                    </MetricPill>
                  </div>

                  {/* MINIMAPA DE CELDAS OPERATIVAS */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <MiniMapLabel>Distribución de Puestos</MiniMapLabel>
                    <SlotsMiniMap>
                      {stats.puestosData.length === 0 ? (
                        <span style={{ fontSize: '9px', color: '#94A3B8', fontStyle: 'italic' }}>Sin celdas</span>
                      ) : (
                        stats.puestosData.map(p => {
                          const state = p.status === "SUSPENDIDO" ? "suspended" : (p.status === "ASIGNADO" ? "covered" : "deficit");
                          return <CellIndicator key={p.id} state={state} title={`${p.puestoName}: ${p.status}`} />;
                        })
                      )}
                    </SlotsMiniMap>
                  </div>

                  <OeeMeter>
                    <OeeHeader>
                      <span>Rendimiento OEE</span>
                      <strong>{stats.oeePct}%</strong>
                    </OeeHeader>
                    <OeeTrack>
                      <OeeBar 
                        status={stats.oeePct >= 85 ? "success" : stats.oeePct >= 70 ? "warning" : stats.coverageState === "suspended" ? "suspended" : "danger"} 
                        style={{ width: `${stats.oeePct}%` }}
                      />
                    </OeeTrack>
                  </OeeMeter>
                </LineStatusCard>
              );
            })}
          </GridContainer>

          {/* BOLSÓN DE RESERVA — Resumen de líneas suspendidas y operarios en pool */}
          {viewDay === 'NEXT_DAY' && activeLineStats && (() => {
            const suspendedLines = activeLines.filter(l => {
              const s = activeLineStats[l];
              return !s || s.sku === "INACTIVO";
            });

            if (suspendedLines.length === 0) return null;

            // Calcular operarios en pool: total de trabajadores activos - operarios asignados a líneas operacionales
            const totalWorkersPresent = Object.keys(workers).length;
            let totalAssignedToActiveLines = 0;
            activeLines.forEach(l => {
              const s = activeLineStats[l];
              if (s && s.sku !== "INACTIVO") {
                totalAssignedToActiveLines += (s.assignedSlots || 0);
              }
            });
            const workersInBolson = Math.max(0, totalWorkersPresent - totalAssignedToActiveLines);

            return (
              <BentoCard style={{
                marginTop: '12px',
                padding: '14px 16px',
                borderLeft: '4px solid #6366F1',
                background: 'linear-gradient(135deg, #EEF2FF 0%, #E0E7FF 100%)',
                boxShadow: '0 2px 8px rgba(99, 102, 241, 0.08)'
              }} id="bolson-reserva-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{
                      width: '28px', height: '28px', borderRadius: '8px',
                      backgroundColor: '#6366F1', display: 'flex', alignItems: 'center',
                      justifyContent: 'center', color: '#FFFFFF', fontSize: '14px',
                      boxShadow: '0 2px 6px rgba(99,102,241,0.25)'
                    }}>
                      🏗
                    </div>
                    <div>
                      <span style={{ fontSize: '12px', fontWeight: 800, color: '#312E81', display: 'block' }}>
                        Bolsón de Reserva (L8)
                      </span>
                      <span style={{ fontSize: '9.5px', color: '#4338CA', fontWeight: 600 }}>
                        Pool de operarios disponibles provenientes de líneas suspendidas
                      </span>
                    </div>
                  </div>
                  <div style={{
                    padding: '6px 12px', borderRadius: '20px',
                    backgroundColor: '#6366F1', color: '#FFFFFF',
                    fontSize: '12px', fontWeight: 800,
                    boxShadow: '0 2px 8px rgba(99,102,241,0.3)'
                  }}>
                    {workersInBolson} Operarios
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px' }}>
                  {suspendedLines.map(l => (
                    <span key={l} style={{
                      padding: '3px 8px', borderRadius: '6px',
                      backgroundColor: 'rgba(99, 102, 241, 0.12)',
                      border: '1px solid rgba(99, 102, 241, 0.25)',
                      fontSize: '9px', fontWeight: 700, color: '#4338CA'
                    }}>
                      {l} · Suspendida
                    </span>
                  ))}
                </div>

                <div style={{ marginTop: '8px', fontSize: '9.5px', color: '#4338CA', fontWeight: 600, lineHeight: 1.4 }}>
                  Los <strong>{workersInBolson}</strong> operarios de las {suspendedLines.length} líneas suspendidas están concentrados en el Bolsón y disponibles para redistribución inteligente si se requiere cobertura adicional en las líneas activas.
                </div>
              </BentoCard>
            );
          })()}
        </TabContentContainer>
      )}
      {currentTab === 'PUESTOS' && (
        <TabContentContainer id="tab-coordinador-puestos">
          {viewDay === 'NEXT_DAY' && !activeLineStats ? (
            <div style={{ padding: '40px', textAlign: 'center', backgroundColor: '#FFFFFF', border: '1px dashed #CBD5E1', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center', marginTop: '10px' }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              <div>
                <h4 style={{ fontSize: '13px', fontWeight: 800, color: '#1E293B', marginBottom: '4px' }}>Plan de Producción del Día Siguiente sin Programar</h4>
                <p style={{ fontSize: '11px', color: '#64748B', maxWidth: '360px', margin: '0 auto', lineHeight: 1.4, marginBottom: '12px' }}>
                  Aún no se ha realizado la simulación de dotación de personal. Presione el botón de abajo para iniciar la dotación proyectada de mañana o cargue el Excel desde el Mapa.
                </p>
                <button
                  onClick={() => {
                    triggerNativeHapticFeedback('short');
                    handleProgramNextDay();
                  }}
                  style={{
                    padding: '10px 18px',
                    backgroundColor: '#2563EB',
                    backgroundImage: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '10px',
                    fontSize: '11px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(37, 99, 235, 0.2)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    transition: 'all 0.2s ease'
                  }}
                  id="program-next-day-empty-puestos-btn"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
                  </svg>
                  <span>Planificar Día Siguiente (Motor T+1)</span>
                </button>
              </div>
            </div>
          ) : (
             <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px', borderBottom: '1px solid #E2E8F0', paddingBottom: '12px' }}>
            <div>
              <h2 style={{ fontSize: '13px', fontWeight: 800, color: '#1E293B', marginBottom: '2px' }}>
                Layout Detallado de Puestos Cubiertos vs Déficit ({viewDay === 'TODAY' ? "Hoy en Vivo" : (viewDay === 'HISTORY' ? `Historial: ${selectedDate}` : "Día Siguiente")})
              </h2>
              <p style={{ fontSize: '11px', color: '#64748B' }}>
                {viewDay === 'TODAY' 
                  ? "Auditoría en tiempo real del estado de cada celda y operario en el piso de producción." 
                  : (viewDay === 'HISTORY'
                    ? "Consulta de la dotación y personal asignado en cada puesto físico en la fecha seleccionada."
                    : "Plan de dotación preventivo. Selecciona una línea para auditar el estado físico proyectado de cada celda.")}
              </p>
            </div>
            

          </div>

          <LineButtonsRow id="line-selectors-row">
            {activeLines
              .filter(lineId => activeLineStats?.[lineId] && activeLineStats[lineId].sku !== "INACTIVO")
              .map(lineId => (
                <LineFilterButton 
                  key={lineId} 
                  active={selectedLineId === lineId}
                  onClick={() => {
                    triggerNativeHapticFeedback('short');
                    setSelectedLineId(lineId);
                  }}
                  id={`btn-select-line-${lineId}`}
                >
                  Línea {lineId}
                </LineFilterButton>
              ))}
          </LineButtonsRow>

          <LayoutHeader>
            <div>
              <strong style={{ fontSize: '14px', color: '#1E293B' }}>Celdas de Producción de Línea {selectedLineId}</strong>
              <span style={{ fontSize: '11px', color: '#64748B', display: 'block', marginTop: '2px' }}>
                SKU {viewDay === 'TODAY' ? "Activo" : "Planificado"}: {activeLineStats?.[selectedLineId]?.sku || "INACTIVO"}
              </span>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <StatusPill state="covered">Cubierto ({activeLineStats?.[selectedLineId]?.assignedSlots || 0})</StatusPill>
              <StatusPill state="deficit">Déficit ({activeLineStats?.[selectedLineId]?.deficitCount || 0})</StatusPill>
            </div>
          </LayoutHeader>

          <LayoutGrid id="puestos-layout-drilldown">
            {/* PUESTOS FIJOS CRÍTICOS */}
            <ColumnCard>
              <ColumnTitle>
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
                <span>Puestos Fijos Críticos (Técnicos/Soporte)</span>
              </ColumnTitle>

              {(() => {
                const activeLinePuestos = activeLineStats?.[selectedLineId]?.puestosData || [];
                const fijosPuestos = activeLinePuestos.filter(p => ["Operador A", "Averiero", "Operador C"].includes(p.tipoPuesto));
                
                if (fijosPuestos.length === 0) {
                  return <div style={{ fontSize: '11px', color: '#94A3B8', textAlign: 'center', padding: '16px' }}>Sin puestos fijos configurados.</div>;
                }

                return fijosPuestos.map(p => {
                  const state = p.status === "SUSPENDIDO" ? "suspended" : (p.status === "ASIGNADO" ? "covered" : "deficit");
                  const workerName = viewDay === 'TODAY' ? (workers[p.idWorkerCurrent]?.name || "VACANTE") : (p.workerName || "VACANTE");

                  return (
                    <SlotDetailCard key={p.id} state={state} locked={!!p.locked} id={`slot-detail-${p.id}`}>
                      <SlotInfo>
                        <SlotName>{p.puestoName} ({p.tipoPuesto})</SlotName>
                        <SlotWorkerName>Titular: {workers[p.idWorkerOriginal]?.name || "Sin Titular"}</SlotWorkerName>
                        <SlotWorkerName style={{ color: '#2563EB', fontWeight: 700 }}>Asignado: {workerName}</SlotWorkerName>
                      </SlotInfo>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <StatusPill state={state}>
                          {p.status === "SUSPENDIDO" ? "SUSPENDIDO" : (p.status === "ASIGNADO" ? "✓ CUBIERTO" : "⚠ DÉFICIT")}
                        </StatusPill>
                        {viewDay === 'NEXT_DAY' && p.status !== "SUSPENDIDO" && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleSlotLock(p.id);
                            }}
                            style={{
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              padding: '6px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              transition: 'all 0.2s ease',
                              color: p.locked ? '#2563EB' : '#94A3B8'
                            }}
                            title={p.locked ? "Bloqueado por el Coordinador (Locked)" : "Desbloqueado (Hacer clic para bloquear)"}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill={p.locked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              {p.locked ? (
                                <>
                                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                                </>
                              ) : (
                                <>
                                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                                  <path d="M7 11V7a5 5 0 0 1 9.9-1"/>
                                </>
                              )}
                            </svg>
                          </button>
                        )}
                      </div>
                    </SlotDetailCard>
                  );
                });
              })()}
            </ColumnCard>

            {/* PUESTOS VARIOS ROTATIVOS */}
            <ColumnCard>
              <ColumnTitle>
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2T9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"/>
                </svg>
                <span>Puestos Varios Rotativos (Manuales)</span>
              </ColumnTitle>

              {(() => {
                const activeLinePuestos = activeLineStats?.[selectedLineId]?.puestosData || [];
                const variosPuestos = activeLinePuestos.filter(p => !["Operador A", "Averiero", "Operador C"].includes(p.tipoPuesto));
                
                if (variosPuestos.length === 0) {
                  return <div style={{ fontSize: '11px', color: '#94A3B8', textAlign: 'center', padding: '16px' }}>Sin puestos varios configurados.</div>;
                }

                return variosPuestos.map(p => {
                  const state = p.status === "SUSPENDIDO" ? "suspended" : (p.status === "ASIGNADO" ? "covered" : "deficit");
                  const workerName = viewDay === 'TODAY' ? (workers[p.idWorkerCurrent]?.name || "VACANTE") : (p.workerName || "VACANTE");

                  let isFatigued = false;
                  let elapsed = 0;
                  if (viewDay === 'TODAY' && p.status === "ASIGNADO" && p.asignadoEnSegundoVirtual) {
                    const t = p.asignadoEnSegundoVirtual;
                    const ms = t.toDate ? t.toDate().getTime() : (t.seconds ? t.seconds * 1000 : new Date(t).getTime());
                    elapsed = Math.max(0, Math.floor((Date.now() - ms) / 60000));
                    if (elapsed >= 105) isFatigued = true;
                  }

                  return (
                    <SlotDetailCard 
                      key={p.id} 
                      state={state} 
                      locked={!!p.locked} 
                      id={`slot-detail-${p.id}`}
                      style={isFatigued ? { borderLeft: '4px solid #EF4444', boxShadow: '0 0 10px rgba(239, 68, 68, 0.12)' } : {}}
                    >
                      <SlotInfo>
                        <SlotName>{p.puestoName} ({p.tipoPuesto})</SlotName>
                        <SlotWorkerName>Operario: {workerName}</SlotWorkerName>
                      </SlotInfo>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {isFatigued && (
                          <StatusPill state="deficit" style={{ backgroundColor: '#FEE2E2', color: '#EF4444', border: '1px solid #FCA5A5', fontSize: '9px', fontWeight: 800 }}>
                            ⚠️ FATIGADO ({elapsed}m)
                          </StatusPill>
                        )}
                        <StatusPill state={state}>
                          {p.status === "SUSPENDIDO" ? "SUSPENDIDO" : (p.status === "ASIGNADO" ? "✓ CUBIERTO" : "⚠ DÉFICIT")}
                        </StatusPill>
                        {viewDay === 'NEXT_DAY' && p.status !== "SUSPENDIDO" && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleSlotLock(p.id);
                            }}
                            style={{
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              padding: '6px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              transition: 'all 0.2s ease',
                              color: p.locked ? '#2563EB' : '#94A3B8'
                            }}
                            title={p.locked ? "Bloqueado por el Coordinador (Locked)" : "Desbloqueado (Hacer clic para bloquear)"}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill={p.locked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              {p.locked ? (
                                <>
                                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                                </>
                              ) : (
                                <>
                                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                                  <path d="M7 11V7a5 5 0 0 1 9.9-1"/>
                                </>
                              )}
                            </svg>
                          </button>
                        )}
                      </div>
                    </SlotDetailCard>
                  );
                });
              })()}
            </ColumnCard>
          </LayoutGrid>
         </>
        )}
      </TabContentContainer>
      )}

      {currentTab === 'DASHBOARD' && (
        <TabContentContainer id="tab-coordinador-dashboard">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px', borderBottom: '1px solid #E2E8F0', paddingBottom: '12px' }}>
            <div>
              <h2 style={{ fontSize: '13px', fontWeight: 800, color: '#1E293B', marginBottom: '2px' }}>
                KPIs y Dashboards Analíticos de Planta ({viewDay === 'TODAY' ? "Hoy en Vivo" : (viewDay === 'HISTORY' ? `Historial Real: ${selectedDate}` : "Día Siguiente")})
              </h2>
              <p style={{ fontSize: '11px', color: '#64748B' }}>
                {viewDay === 'TODAY' 
                  ? "Monitoreo industrial consolidador de eficiencia, tiempos muertos y desperdicios reales en piso de producción." 
                  : (viewDay === 'HISTORY'
                    ? "Monitoreo de auditoría del histórico de eficiencia, averías y tiempos muertos reales con los que cerró la planta."
                    : "Monitoreo industrial consolidador de eficiencia proyectada en base al plan de producción del día de mañana.")}
              </p>
            </div>
            

          </div>

          <KpiGrid id="kpi-metric-cards">
            <KpiCard>
              <KpiLabel>{viewDay === 'TODAY' ? "OEE Promedio Real de Planta" : (viewDay === 'HISTORY' ? "OEE Promedio al Cierre" : "OEE Promedio Proyectado de Planta")}</KpiLabel>
              <KpiValue>{activePlantMetrics.avgOee}%</KpiValue>
              <div style={{ height: '4px', backgroundColor: '#E2E8F0', borderRadius: '2px', overflow: 'hidden', marginTop: '6px' }}>
                <div style={{ height: '100%', width: `${activePlantMetrics.avgOee}%`, backgroundColor: activePlantMetrics.avgOee >= 85 ? '#22C55E' : activePlantMetrics.avgOee >= 70 ? '#EAB308' : '#EF4444' }} />
              </div>
            </KpiCard>

            <KpiCard>
              <KpiLabel>{viewDay === 'TODAY' ? "Tiempos Muertos de Planta" : (viewDay === 'HISTORY' ? "Tiempos Muertos Reales Totales" : "Paros Proyectados")}</KpiLabel>
              <KpiValue>{activePlantMetrics.totalDowntimeMinutes} Min</KpiValue>
              <span style={{ fontSize: '10px', color: '#64748B', fontWeight: 600, marginTop: '6px' }}>
                {viewDay === 'TODAY' ? "⚠ Tiempo acumulado de paro" : (viewDay === 'HISTORY' ? "✓ Registro total de jornada" : "✓ Sin paros activos registrados para mañana")}
              </span>
            </KpiCard>

            <KpiCard>
              <KpiLabel>{viewDay === 'TODAY' ? "Mermas Totales de Planta" : (viewDay === 'HISTORY' ? "Mermas Reales Totales" : "Mermas Proyectadas")}</KpiLabel>
              <KpiValue>{activePlantMetrics.totalMermasProcess} Pzs</KpiValue>
              <span style={{ fontSize: '10px', color: '#16A34A', fontWeight: 600, marginTop: '6px' }}>
                {viewDay === 'TODAY' ? "✓ Desperdicio acumulado" : (viewDay === 'HISTORY' ? "✓ Registro histórico guardado" : "✓ Límites de mermas bajo control")}
              </span>
            </KpiCard>
          </KpiGrid>

          {/* Gráficos y Visualizaciones */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginTop: '20px' }}>
            {/* GRAFICO PAROS CATEGORIA SVG */}
            <ChartCard id="paros-chart-card">
              <ChartTitle>
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="12" cy="12" r="10"/>
                  <polyline points="12 6 12 12 16 14"/>
                </svg>
                <span>Distribución de Paros de Planta por Categoría</span>
              </ChartTitle>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '10px 0' }}>
                {Object.keys(activePlantMetrics.parosByCategory).map(category => {
                  const val = activePlantMetrics.parosByCategory[category];
                  const total = Object.values(activePlantMetrics.parosByCategory).reduce((a, b) => a + b, 0) || 1;
                  const pct = Math.round((val / total) * 100);

                  const barColors = {
                    MECÁNICO: '#3B82F6',
                    ELÉCTRICO: '#A855F7',
                    CALIDAD: '#F59E0B',
                    FALTA_DE_MATERIAL: '#EF4444'
                  };

                  return (
                    <div key={category} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', fontWeight: 700, color: '#475569' }}>
                        <span>{category.replaceAll('_', ' ')}</span>
                        <strong>{val} min</strong>
                      </div>
                      <div style={{ height: '14px', backgroundColor: '#F1F5F9', borderRadius: '4px', overflow: 'hidden', position: 'relative' }}>
                        <div style={{ height: '100%', width: `${pct}%`, backgroundColor: barColors[category] || '#64748B', transition: 'width 0.5s ease' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </ChartCard>

            {/* GRAFICO MERMAS SVG */}
            <ChartCard id="mermas-chart-card">
              <ChartTitle>
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <span>Desperdicios por Material (Mermas en Proceso)</span>
              </ChartTitle>

              {/* Gráfico de Barras Verticales SVG Limpio y Premium */}
              <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'flex-end', height: '180px', padding: '16px 0 8px 0', borderBottom: '1px solid #E2E8F0', position: 'relative' }}>
                {Object.keys(activePlantMetrics.mermasByMaterial).map(material => {
                  const val = activePlantMetrics.mermasByMaterial[material];
                  const maxVal = Math.max(10, ...Object.values(activePlantMetrics.mermasByMaterial));
                  const heightMins = Math.round((val / maxVal) * 120);

                  return (
                    <div key={material} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', zIndex: 10 }}>
                      <strong style={{ fontSize: '9px', color: '#1E293B', fontWeight: 800 }}>{val}</strong>
                      <div 
                        style={{ 
                          width: '24px', 
                          height: `${heightMins}px`, 
                          background: 'linear-gradient(to top, #2563EB, #60A5FA)', 
                          borderRadius: '4px 4px 0 0',
                          transition: 'height 0.5s ease',
                          boxShadow: '0 2px 5px rgba(37,99,235,0.15)'
                        }} 
                      />
                      <span style={{ fontSize: '9px', color: '#64748B', fontWeight: 700, textTransform: 'capitalize' }}>{material}</span>
                    </div>
                  );
                })}
              </div>
            </ChartCard>
          </div>


        </TabContentContainer>
      )}

      {currentTab === 'SUGERENCIAS' && (
        <TabContentContainer id="tab-coordinador-sugerencias">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Cabecera */}
            <div>
              <h2 style={{ fontSize: '13px', fontWeight: 800, color: '#1E293B', marginBottom: '2px' }}>
                Notificaciones y Recomendaciones Inteligentes de Planta
              </h2>
              <span style={{ fontSize: '10px', color: '#64748B', fontWeight: 700 }}>
                El motor analiza déficits, prioridades de planta y capacidades del personal disponible en tiempo real.
              </span>
            </div>

            <SuggestionsGrid>
              {/* PANEL DE SUGERENCIAS DE CAMBIO Y ROTACIÓN POR DÉFICIT */}
              <BentoCard id="coordinador-deficit-sugerencias">
                <CardTitle>
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2.5">
                    <path d="M16 3h5v5M8 21H3v-5M12 12l9-9M12 12l-9 9"/>
                  </svg>
                  <span>Sugerencias de Cobertura por Déficits Activos</span>
                </CardTitle>
                <p style={{ fontSize: '11px', color: '#64748B', marginBottom: '14px', lineHeight: 1.4 }}>
                  Los siguientes puestos están habilitados por SKU pero se encuentran vacantes. El Matchmaker recomienda el mejor recurso disponible de inmediato:
                </p>

                {deficitSuggestions.filter(s => s.worker != null).length > 0 && (
                  <ApplyAllButton
                    onClick={handleApplyAllSuggestions}
                    disabled={applyingAll}
                    id="apply-all-suggestions-btn"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                      <polyline points="22 4 12 14.01 9 11.01"/>
                    </svg>
                    <span>
                      {applyingAll 
                        ? "Aplicando Balanceo de Planta..." 
                        : `Auto-Aplicar Recomendaciones de Balanceo (${deficitSuggestions.filter(s => s.worker != null).length} sugerencias)`}
                    </span>
                  </ApplyAllButton>
                )}

                <SuggestionsList>
                  {deficitSuggestions.length === 0 ? (
                    <div style={{ padding: '32px 16px', color: '#94A3B8', fontSize: '11px', textAlign: 'center', border: '1px dashed #E2E8F0', borderRadius: '8px', width: '100%' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center' }}>
                        <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#10B981' }} />
                        <span>No hay déficits activos en la planta. Todas las celdas requeridas por SKU están cubiertas.</span>
                      </div>
                    </div>
                  ) : (
                    deficitSuggestions.map(sug => {
                      const isVacantOnly = sug.type === "NINGUNO";
                      const isPool = sug.type === "POOL";
                      const isBolson = sug.type === "BOLSON";
                      const isRotation = sug.type === "ROTACION";

                      return (
                        <SuggestionItem 
                          key={sug.id}
                          critical={isVacantOnly}
                        >
                          {/* Top row */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                              <span style={{ fontSize: '10px', fontWeight: 700, color: '#2563EB', textTransform: 'uppercase' }}>
                                Línea {sug.slot.lineId}
                              </span>
                              <strong style={{ fontSize: '12px', color: '#1E293B' }}>{sug.slot.puestoName}</strong>
                            </div>
                            <span style={{ 
                              fontSize: '9px', 
                              fontWeight: 700, 
                              color: isVacantOnly ? '#EF4444' : '#64748B',
                              backgroundColor: isVacantOnly ? '#FFF1F2' : '#F1F5F9',
                              border: isVacantOnly ? '1px solid #FECDD3' : '1px solid #E2E8F0',
                              padding: '3px 8px',
                              borderRadius: '6px'
                            }}>
                              {isVacantOnly ? "PUESTO CRÍTICO VACANTE" : `Requerido: ${sug.slot.tipoPuesto}`}
                            </span>
                          </div>

                          {/* Recommendation Card */}
                          <div style={{ 
                            backgroundColor: isVacantOnly ? '#FFF1F2' : '#F8FAFC',
                            border: isVacantOnly ? '1px solid #FECDD3' : '1px solid #E2E8F0',
                            borderRadius: '8px',
                            padding: '10px 12px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            gap: '10px'
                          }}>
                            {/* Worker Info */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              <span style={{ fontSize: '9px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                {isVacantOnly ? (
                                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#EF4444' }}>
                                    <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                      <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                                    </svg>
                                    <span>ESTADO</span>
                                  </div>
                                ) : isRotation ? (
                                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#D97706' }}>
                                    <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                      <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
                                    </svg>
                                    <span>SUGERENCIA DE ROTACIÓN</span>
                                  </div>
                                ) : (
                                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#2563EB' }}>
                                    <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                      <path d="M12 5v14M19 12l-7 7-7-7"/>
                                    </svg>
                                    <span>SUGERENCIA DE INYECCIÓN</span>
                                  </div>
                                )}
                              </span>
                              {sug.worker ? (
                                <div>
                                  <strong style={{ fontSize: '11px', color: '#0F172A' }}>{sug.worker.name}</strong>
                                  <span style={{ fontSize: '9px', color: '#64748B', fontFamily: 'monospace' }}> (Ficha: {sug.worker.id})</span>
                                  <div style={{ fontSize: '9px', color: '#475569', fontWeight: 600, marginTop: '2px' }}>
                                    {isRotation 
                                      ? `Extraer de Línea ${sug.originalLineId} (menor prioridad)`
                                      : isPool 
                                        ? `Disponible en Pool de Entrada (Sala de espera)`
                                        : `Disponible en Línea 8 (Bolsón central)`}
                                  </div>
                                </div>
                              ) : (
                                <span style={{ fontSize: '10px', color: '#94A3B8', fontWeight: 600 }}>
                                  No hay candidatos aptos en planta con el perfil médico/técnico requerido.
                                </span>
                              )}
                            </div>

                            {/* Action Button */}
                            {sug.worker && (
                              <SuggestionActionButton
                                onClick={() => handleApplyRotation(
                                  sug.slot.id, 
                                  sug.worker.id, 
                                  sug.originalSlotId, 
                                  sug.worker.name, 
                                  sug.slot.puestoName
                                )}
                                disabled={applyingRotationId === sug.slot.id}
                                type={isRotation ? "rotation" : "injection"}
                              >
                                {applyingRotationId === sug.slot.id ? (
                                  <span>Aplicando...</span>
                                ) : (
                                  <>
                                    <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                      <polyline points="20 6 9 17 4 12"/>
                                    </svg>
                                    <span>{isRotation ? "Rotar Operario" : "Asignar Operario"}</span>
                                  </>
                                )}
                              </SuggestionActionButton>
                            )}
                          </div>
                        </SuggestionItem>
                      );
                    })
                  )}
                </SuggestionsList>
              </BentoCard>

              {/* COLUMNA DERECHA: ALERTAS DE FATIGA Y BITÁCORA / RESUMEN PLAN */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {viewDay === 'TODAY' ? (
                  <>
                    {/* ALERTAS DE FATIGA */}
                    <BentoCard>
                      <CardTitle>
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2.5">
                          <circle cx="12" cy="12" r="10"/>
                          <polyline points="12 6 12 12 16 14"/>
                        </svg>
                        <span>Alertas de Fatiga Ergonómica Activas</span>
                      </CardTitle>
                      <p style={{ fontSize: '11px', color: '#64748B', marginBottom: '14px' }}>
                        Trabajadores que han superado el umbral nominal de 105 minutos continuos y requieren rotación:
                      </p>

                      <FatigueAlertsList>
                        {plantAlerts.filter(a => a.type === "fatigue").length === 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', padding: '20px 12px', color: '#64748B', fontSize: '10.5px', textAlign: 'center', border: '1px dashed #E2E8F0', borderRadius: '8px', backgroundColor: '#F8FAFC' }}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: '2px' }}>
                              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                              <polyline points="22 4 12 14.01 9 11.01"/>
                            </svg>
                            <span>Todos los trabajadores se encuentran dentro del límite ergonómico de 105 minutos continuos.</span>
                          </div>
                        ) : (
                          plantAlerts.filter(a => a.type === "fatigue").map(a => (
                            <div 
                              key={a.id}
                              style={{
                                padding: '10px 12px',
                                backgroundColor: '#FFF5F5',
                                border: '1px solid #FEE2E2',
                                borderRadius: '8px',
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: '8px',
                                fontSize: '11px',
                                color: '#B91C1C'
                              }}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" style={{ marginTop: '2px' }}>
                                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                              </svg>
                              <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <strong style={{ fontWeight: 800 }}>{a.text}</strong>
                                <span style={{ fontSize: '9px', color: '#7F1D1D', marginTop: '2px' }}>{a.subtext}</span>
                              </div>
                            </div>
                          ))
                        )}
                      </FatigueAlertsList>
                    </BentoCard>

                    {/* BITÁCORA Y ALERTAS GLOBALES */}
                    <BentoCard>
                      <CardTitle>
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2.5">
                          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0"/>
                        </svg>
                        <span>Bitácora de Relevos y Alertas Globales</span>
                      </CardTitle>

                      <AlertasContainer id="plant-alerts-log">
                        {plantAlerts.length === 0 ? (
                          <div style={{ padding: '32px 16px', color: '#94A3B8', fontSize: '11px', textAlign: 'center', border: '1px dashed #E2E8F0', borderRadius: '8px' }}>
                            Sin incidentes en planta. Todas las líneas activas operan de forma normal.
                          </div>
                        ) : (
                          <TimelineContainer>
                            {plantAlerts.map(alert => {
                              const isFatigue = alert.type === "fatigue";
                              return (
                                <TimelineItem key={alert.id} id={`global-alert-${alert.id}`}>
                                  <TimelineDot type={isFatigue ? "fatigue" : "relief"} />
                                  <div style={{ display: 'flex', flexDirection: 'column', flex: 1, backgroundColor: isFatigue ? '#FFF5F5' : '#F8FAFC', border: isFatigue ? '1px solid #FEE2E2' : '1px solid #E2E8F0', padding: '10px 14px', borderRadius: '10px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                                      <strong style={{ fontSize: '11px', color: '#1E293B' }}>{alert.text}</strong>
                                      <span style={{ fontSize: '8px', color: isFatigue ? '#EF4444' : '#2563EB', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                                        {isFatigue ? "Fatiga" : "Relevo"}
                                      </span>
                                    </div>
                                    <span style={{ fontSize: '9px', color: '#64748B' }}>{alert.subtext}</span>
                                  </div>
                                </TimelineItem>
                              );
                            })}
                          </TimelineContainer>
                        )}
                      </AlertasContainer>
                    </BentoCard>
                  </>
                ) : (
                  /* DÍA SIGUIENTE: SOLO RESUMEN DEL PLAN DE MAÑANA (SIN DUPLICADO DE SHEETS) */
                  <BentoCard>
                    <CardTitle>
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2.5">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                        <line x1="16" y1="2" x2="16" y2="6"/>
                        <line x1="8" y1="2" x2="8" y2="6"/>
                        <line x1="3" y1="10" x2="21" y2="10"/>
                      </svg>
                      <span>Resumen del Plan (Día Siguiente)</span>
                    </CardTitle>
                    <p style={{ fontSize: '11px', color: '#64748B', marginBottom: '14px', lineHeight: 1.4 }}>
                      Estadísticas proyectadas de dotación para mañana calculadas atómicamente por el motor preventivo:
                    </p>

                    {(() => {
                      const nextPlan = configDocs["next_day_plan"];
                      if (!nextPlan) {
                        return (
                          <div style={{ padding: '24px 12px', color: '#94A3B8', fontSize: '10px', textAlign: 'center', border: '1px dashed #E2E8F0', borderRadius: '8px' }}>
                            Genera la planificación en el Mapa para visualizar las estadísticas.
                          </div>
                        );
                      }
                      const totalDeficits = nextPlan.deficits ? Object.values(nextPlan.deficits).reduce((a, b) => a + b, 0) : 0;
                      const activeSku = nextPlan.skuPlan || {};
                      const activeLinesCount = Object.keys(activeSku).filter(l => activeSku[l] !== "INACTIVO").length;

                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', borderBottom: '1px solid #F1F5F9', paddingBottom: '6px' }}>
                            <span style={{ color: '#64748B', fontWeight: 600 }}>Líneas Programadas:</span>
                            <strong style={{ color: '#1E293B' }}>{activeLinesCount} activas</strong>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', borderBottom: '1px solid #F1F5F9', paddingBottom: '6px' }}>
                            <span style={{ color: '#64748B', fontWeight: 600 }}>Déficits Proyectados:</span>
                            <strong style={{ color: totalDeficits > 0 ? '#EF4444' : '#16A34A' }}>
                              {totalDeficits > 0 ? `${totalDeficits} vacantes` : "Dotación Completa"}
                            </strong>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', paddingBottom: '4px' }}>
                            <span style={{ color: '#64748B', fontWeight: 600 }}>OEE Proyectado Promedio:</span>
                            <strong style={{ color: '#2563EB' }}>{activePlantMetrics.avgOee}%</strong>
                          </div>
                        </div>
                      );
                    })()}
                  </BentoCard>
                )}
              </div>
            </SuggestionsGrid>
          </div>
        </TabContentContainer>
      )}

      {currentTab === 'CONTROL' && (() => {
        const supervisorsList = [
          { id: 1, name: "Carlos M.", initial: "CM", line: "Línea 1", color: "#DBEAFE" },
          { id: 2, name: "Elena R.", initial: "ER", line: "Línea 2", color: "#D1FAE5" },
          { id: 3, name: "Marcos P.", initial: "MP", line: "Línea 3", color: "#F3E8FF" },
          { id: 4, name: "Julia G.", initial: "JG", line: "Línea 4", color: "#FEE2E2" },
          { id: 5, name: "Tomás H.", initial: "TH", line: "Línea 5", color: "#FEF9C3" }
        ];

        return (
          <TabContentContainer id="tab-coordinador-control">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
              {/* CONTROL DE ARRANQUE — Solo visible en vista HOY */}
              {viewDay === 'TODAY' ? (
                <BentoCard id="master-start-card" style={{
                  border: shiftActive ? '1px solid rgba(16, 185, 129, 0.18)' : '1px solid $border',
                  backgroundImage: shiftActive ? 'linear-gradient(to bottom, rgba(16, 185, 129, 0.01), #FFFFFF)' : 'none'
                }}>
                  <CardTitle style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2.5">
                        <polygon points="5 3 19 12 5 21 5 3"/>
                      </svg>
                      <span>Control Maestro del Turno</span>
                    </div>
                    {shiftActive && (
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', backgroundColor: '#DCFCE7', padding: '4px 10px', borderRadius: '20px', fontSize: '9px', fontWeight: 700, color: '#16A34A', border: '1px solid #BBF7D0' }}>
                        <LiveIndicator />
                        <span>LIVE</span>
                      </div>
                    )}
                  </CardTitle>
                  
                  <p style={{ fontSize: '11px', color: '#64748B', lineHeight: 1.4, margin: 0 }}>
                    {shiftActive 
                      ? "La jornada se encuentra activa y en marcha. Todos los operarios críticos titulares fijos han sido inyectados a sus posiciones de manera atómica."
                      : "Al iniciar el turno, se inyectarán de forma atómica y consistente todos los operarios titulares fijos a sus celdas operativas en base al plan de SKU programado."}
                  </p>

                  {!shiftActive && (
                    <div style={{
                      backgroundColor: '#FEF3C7',
                      border: '1px solid #FCD34D',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      fontSize: '10.5px',
                      color: '#B45309',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      marginTop: '8px'
                    }}>
                      <span>⚠️</span>
                      <span>Arranque de turno pendiente desde piso por los supervisores.</span>
                    </div>
                  )}

                  {shiftActive && (
                    <ActiveShiftDashboard>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <span style={{ fontSize: '8px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Estado Planta</span>
                        <strong style={{ fontSize: '11px', color: '#16A34A', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#16A34A' }} />
                          Operando
                        </strong>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <span style={{ fontSize: '8px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Líneas Programadas</span>
                        <strong style={{ fontSize: '11px', color: '#1E293B' }}>
                          {activeLines.filter(l => skuPlan?.[l] !== "INACTIVO").length} Activas
                        </strong>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', gridColumn: 'span 2', borderTop: '1px solid #E2E8F0', paddingTop: '8px', marginTop: '4px' }}>
                        <span style={{ fontSize: '8px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Hora de Inicio del Turno</span>
                        <strong style={{ fontSize: '10.5px', color: '#475569', fontFamily: 'monospace' }}>
                          {configDocs?.shift_status?.shiftStartTimestamp 
                            ? new Date(configDocs.shift_status.shiftStartTimestamp.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                            : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}{" "}
                          HRS
                        </strong>
                      </div>
                    </ActiveShiftDashboard>
                  )}
                </BentoCard>
              ) : (
                <BentoCard id="master-start-card-disabled" style={{
                  border: '1px solid #E2E8F0',
                  backgroundImage: 'linear-gradient(135deg, #F8FAFC 0%, #F1F5F9 100%)'
                }}>
                  <CardTitle>
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2.5">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                      <line x1="16" y1="2" x2="16" y2="6"/>
                      <line x1="8" y1="2" x2="8" y2="6"/>
                      <line x1="3" y1="10" x2="21" y2="10"/>
                    </svg>
                    <span>Control de Turno (No Disponible)</span>
                  </CardTitle>
                  <div style={{ 
                    padding: '20px 14px', 
                    color: '#94A3B8', 
                    fontSize: '11px', 
                    textAlign: 'center', 
                    border: '1px dashed #E2E8F0', 
                    borderRadius: '8px', 
                    lineHeight: 1.5,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10"/>
                      <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
                    </svg>
                    <span>El control de arranque de turno solo esta disponible en la vista <strong style={{ color: '#64748B' }}>Hoy (En Vivo)</strong>. Cambia al selector de linea temporal para gestionar el turno actual.</span>
                  </div>
                </BentoCard>
              )}

              {/* LISTA RÁPIDA DE ASIGNACIÓN DE SUPERVISORES */}
              <BentoCard style={{ height: 'fit-content' }}>
                <CardTitle>
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2.5">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"/>
                  </svg>
                  <span>Asignar Supervisores a Líneas</span>
                </CardTitle>
                <p style={{ fontSize: '11px', color: '#64748B', margin: 0, lineHeight: 1.4 }}>
                  Supervisores en planta. Para reasignar sus líneas encargadas, pulsa sobre cualquier celda en la pestaña del **Mapa**.
                </p>
                
                <SupervisorHorizontalList>
                  {supervisorsList.map(sup => (
                    <SupervisorAvatarCard key={sup.id}>
                      <SupervisorAvatar style={{ backgroundColor: sup.color }}>
                        {sup.initial}
                        <div style={{ 
                          position: 'absolute', 
                          bottom: '-2px', 
                          right: '-2px', 
                          backgroundColor: '#1E293B', 
                          color: '#FFFFFF', 
                          fontSize: '8px', 
                          fontWeight: 800, 
                          padding: '2px 5px', 
                          borderRadius: '10px',
                          border: '1.5px solid #FFFFFF'
                        }}>
                          {sup.line.replace("Línea ", "")}
                        </div>
                      </SupervisorAvatar>
                      <span style={{ fontSize: '9px', fontWeight: 700, color: '#1E293B', textAlign: 'center', width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {sup.name}
                      </span>
                    </SupervisorAvatarCard>
                  ))}
                </SupervisorHorizontalList>
              </BentoCard>
            </div>
          </TabContentContainer>
        );
      })()}

      {currentTab === 'AUSENTES' && (
        <TabContentContainer id="tab-coordinador-ausentes">
          <div style={{ marginBottom: '14px' }}>
            <h2 style={{ fontSize: '13px', fontWeight: 800, color: '#1E293B', marginBottom: '4px' }}>
              Gestión de Personal Ausente e Incidencias Oficiales
            </h2>
            <p style={{ fontSize: '11px', color: '#64748B' }}>
              Auditoría del Filtro de Asistencia Real del checador. Tipifica incidencias oficiales para excluir operarios ausentes del motor de asignación.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
            {/* PANEL DE CONTROL DE AUSENCIAS */}
            <BentoCard>
              <CardTitle>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '14px' }}>📋</span>
                  <span>Listado de Personal Ausente y Bajas de Turno</span>
                </div>
              </CardTitle>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px', maxHeight: '450px', overflowY: 'auto', paddingRight: '4px' }}>
                {(() => {
                  const absentWorkers = Object.values(workers).filter(w => 
                    ["VACACIONES", "PERMISOS", "CONSULTAS_MEDICAS", "SUBSIDIOS", "ACCIDENTE_LABORAL", "INACTIVO"].includes(w.status?.toUpperCase())
                  );

                  if (absentWorkers.length === 0) {
                    return (
                      <div style={{ padding: '30px 12px', color: '#94A3B8', fontSize: '11px', textAlign: 'center', border: '1px dashed #E2E8F0', borderRadius: '8px' }}>
                        ¡Todo el personal se encuentra presente o asignado en planta!
                      </div>
                    );
                  }

                  return absentWorkers.map(w => {
                    const statusUpper = w.status?.toUpperCase() || "INACTIVO";
                    
                    const badgeColors = {
                      VACACIONES: { bg: '#FEF3C7', color: '#D97706', label: 'Vacaciones' },
                      PERMISOS: { bg: '#E0F2FE', color: '#0369A1', label: 'Permiso' },
                      CONSULTAS_MEDICAS: { bg: '#F3E8FF', color: '#7E22CE', label: 'Consulta Médica' },
                      SUBSIDIOS: { bg: '#FEE2E2', color: '#B91C1C', label: 'Subsidio' },
                      ACCIDENTE_LABORAL: { bg: '#FFEDD5', color: '#C2410C', label: 'Accidente Laboral' },
                      INACTIVO: { bg: '#F1F5F9', color: '#475569', label: 'Inasistente' }
                    };

                    const badge = badgeColors[statusUpper] || badgeColors.INACTIVO;

                    // Derivar sexo
                    const wSex = w.sexo || (
                      w.name.includes("María") || w.name.includes("Elena") || w.name.includes("Sofía") || w.name.includes("Teresa") || w.name.includes("Lucía") || w.name.includes("Laura") || w.name.includes("Carmen") || w.name.includes("Patricia") || w.name.includes("Isabel")
                        ? "Femenino" 
                        : "Masculino"
                    );

                    return (
                      <div key={w.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', backgroundColor: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', gap: '10px' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <strong style={{ fontSize: '11.5px', color: '#1E293B', display: 'block', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                            {w.name}
                          </strong>
                          <div style={{ display: 'flex', gap: '6px', marginTop: '2px', alignItems: 'center' }}>
                            <span style={{ fontSize: '9px', fontWeight: 700, color: '#64748B' }}>{w.role}</span>
                            <span style={{ fontSize: '9px', color: '#94A3B8' }}>•</span>
                            <span style={{ fontSize: '9px', color: '#64748B' }}>{wSex}</span>
                          </div>
                        </div>

                        {/* Dropdown de Tipificación en Vivo */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-end' }}>
                          <select
                            value={statusUpper}
                            onChange={async (e) => {
                              const newStatus = e.target.value;
                              triggerNativeHapticFeedback('short');
                              try {
                                await updateDoc(doc(db, "trabajadores", w.id), {
                                  status: newStatus,
                                  updatedAt: serverTimestamp()
                                });
                              } catch (err) {
                                alert("Error al tipificar inasistencia: " + err.message);
                              }
                            }}
                            style={{
                              padding: '4px 6px',
                              borderRadius: '6px',
                              border: '1px solid #CBD5E1',
                              fontSize: '10px',
                              fontWeight: 700,
                              color: badge.color,
                              backgroundColor: badge.bg,
                              outline: 'none',
                              cursor: 'pointer'
                            }}
                          >
                            <option value="INACTIVO" style={{ color: '#475569', backgroundColor: '#FFFFFF' }}>Ausente Gral.</option>
                            <option value="VACACIONES" style={{ color: '#D97706', backgroundColor: '#FFFFFF' }}>Vacaciones</option>
                            <option value="PERMISOS" style={{ color: '#0369A1', backgroundColor: '#FFFFFF' }}>Permiso</option>
                            <option value="CONSULTAS_MEDICAS" style={{ color: '#7E22CE', backgroundColor: '#FFFFFF' }}>Consulta Médica</option>
                            <option value="SUBSIDIOS" style={{ color: '#B91C1C', backgroundColor: '#FFFFFF' }}>Subsidio</option>
                            <option value="ACCIDENTE_LABORAL" style={{ color: '#C2410C', backgroundColor: '#FFFFFF' }}>Accidente Laboral</option>
                            <option value="POOL_ARRANQUE" style={{ color: '#16A34A', backgroundColor: '#FFFFFF' }}>✓ Dar de Alta (Pool)</option>
                          </select>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </BentoCard>

            {/* RESUMEN DE INCIDENCIAS */}
            <BentoCard style={{ height: 'fit-content' }}>
              <CardTitle>Resumen Estadístico de Ausentismo</CardTitle>
              <p style={{ fontSize: '11px', color: '#64748B', lineHeight: 1.4, margin: 0, marginBottom: '14px' }}>
                Estadísticas acumuladas de bajas y ausentismo del turno procesadas en tiempo real.
              </p>
              
              {(() => {
                const totalWorkers = Object.values(workers);
                const absentList = totalWorkers.filter(w => 
                  ["VACACIONES", "PERMISOS", "CONSULTAS_MEDICAS", "SUBSIDIOS", "ACCIDENTE_LABORAL", "INACTIVO"].includes(w.status?.toUpperCase())
                );
                
                const stats = {
                  vacaciones: absentList.filter(w => w.status === "VACACIONES").length,
                  permisos: absentList.filter(w => w.status === "PERMISOS").length,
                  consultas: absentList.filter(w => w.status === "CONSULTAS_MEDICAS").length,
                  subsidios: absentList.filter(w => w.status === "SUBSIDIOS").length,
                  accidentes: absentList.filter(w => w.status === "ACCIDENTE_LABORAL").length,
                  gral: absentList.filter(w => w.status === "INACTIVO").length
                };

                const totalAbsent = absentList.length;
                const totalActive = totalWorkers.length || 1;
                const absentPct = Math.round((totalAbsent / totalActive) * 100);

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', borderBottom: '1px solid #F1F5F9', paddingBottom: '6px' }}>
                      <span style={{ color: '#64748B', fontWeight: 600 }}>Tasa de Ausentismo:</span>
                      <strong style={{ color: absentPct > 15 ? '#EF4444' : '#1E293B' }}>{absentPct}% ({totalAbsent} Operarios)</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', borderBottom: '1px solid #F1F5F9', paddingBottom: '6px' }}>
                      <span style={{ color: '#64748B', fontWeight: 600 }}>Vacaciones Activas:</span>
                      <strong style={{ color: '#1E293B' }}>{stats.vacaciones}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', borderBottom: '1px solid #F1F5F9', paddingBottom: '6px' }}>
                      <span style={{ color: '#64748B', fontWeight: 600 }}>Permisos Otorgados:</span>
                      <strong style={{ color: '#1E293B' }}>{stats.permisos}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', borderBottom: '1px solid #F1F5F9', paddingBottom: '6px' }}>
                      <span style={{ color: '#64748B', fontWeight: 600 }}>Consultas Médicas:</span>
                      <strong style={{ color: '#1E293B' }}>{stats.consultas}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', borderBottom: '1px solid #F1F5F9', paddingBottom: '6px' }}>
                      <span style={{ color: '#64748B', fontWeight: 600 }}>Subsidios Médicos:</span>
                      <strong style={{ color: '#1E293B' }}>{stats.subsidios}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', borderBottom: '1px solid #F1F5F9', paddingBottom: '6px' }}>
                      <span style={{ color: '#64748B', fontWeight: 600 }}>Accidentes Laborales:</span>
                      <strong style={{ color: '#1E293B' }}>{stats.accidentes}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', paddingBottom: '4px' }}>
                      <span style={{ color: '#64748B', fontWeight: 600 }}>Ausentes sin Tipificar:</span>
                      <strong style={{ color: '#1E293B' }}>{stats.gral}</strong>
                    </div>
                  </div>
                );
              })()}
            </BentoCard>
          </div>
        </TabContentContainer>
      )}

      {/* --- BARRA DE NAVEGACIÓN INFERIOR FIJA DE 64PX (TABBAR COORDINADOR) --- */}
      <TabBarContainer id="coordinator-tab-bar">
        <TabButton 
          active={currentTab === 'MAPA'} 
          onClick={() => {
            triggerNativeHapticFeedback('short');
            setCurrentTab('MAPA');
          }}
          id="coordinator-tab-mapa"
        >
          <IconWrapper active={currentTab === 'MAPA'}>
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect width="7" height="7" x="3" y="3" rx="1.5" />
              <rect width="7" height="7" x="14" y="3" rx="1.5" />
              <rect width="7" height="7" x="14" y="14" rx="1.5" />
              <rect width="7" height="7" x="3" y="14" rx="1.5" />
            </svg>
          </IconWrapper>
          <TabLabel>Mapa</TabLabel>
        </TabButton>

        <TabButton 
          active={currentTab === 'PUESTOS'} 
          onClick={() => {
            triggerNativeHapticFeedback('short');
            setCurrentTab('PUESTOS');
          }}
          id="coordinator-tab-puestos"
        >
          <IconWrapper active={currentTab === 'PUESTOS'}>
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
              <circle cx="19" cy="8" r="3" />
            </svg>
          </IconWrapper>
          <TabLabel>Puestos</TabLabel>
        </TabButton>

        <TabButton 
          active={currentTab === 'AUSENTES'} 
          onClick={() => {
            triggerNativeHapticFeedback('short');
            setCurrentTab('AUSENTES');
          }}
          id="coordinator-tab-ausentes"
        >
          <IconWrapper active={currentTab === 'AUSENTES'}>
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"/>
            </svg>
          </IconWrapper>
          <TabLabel>Ausencias</TabLabel>
        </TabButton>

        <TabButton 
          active={currentTab === 'DASHBOARD'} 
          onClick={() => {
            triggerNativeHapticFeedback('short');
            setCurrentTab('DASHBOARD');
          }}
          id="coordinator-tab-dashboard"
        >
          <IconWrapper active={currentTab === 'DASHBOARD'}>
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="20" x2="18" y2="10" />
              <line x1="12" y1="20" x2="12" y2="4" />
              <line x1="6" y1="20" x2="6" y2="14" />
            </svg>
          </IconWrapper>
          <TabLabel>Charts</TabLabel>
        </TabButton>

        <TabButton 
          active={currentTab === 'SUGERENCIAS'} 
          onClick={() => {
            triggerNativeHapticFeedback('short');
            setCurrentTab('SUGERENCIAS');
          }}
          id="coordinator-tab-sugerencias"
        >
          <IconWrapper active={currentTab === 'SUGERENCIAS'}>
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
              <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
            </svg>
          </IconWrapper>
          <TabLabel>Alertas</TabLabel>
        </TabButton>

        <TabButton 
          active={currentTab === 'CONTROL'} 
          onClick={() => {
            triggerNativeHapticFeedback('short');
            setCurrentTab('CONTROL');
          }}
          id="coordinator-tab-control"
        >
          <IconWrapper active={currentTab === 'CONTROL'}>
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="4" y1="21" x2="4" y2="14" />
              <line x1="4" y1="10" x2="4" y2="3" />
              <line x1="12" y1="21" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12" y2="3" />
              <line x1="20" y1="21" x2="20" y2="16" />
              <line x1="20" y1="12" x2="20" y2="3" />
              <line x1="1" y1="14" x2="7" y2="14" />
              <line x1="9" y1="8" x2="15" y2="8" />
              <line x1="17" y1="16" x2="23" y2="16" />
            </svg>
          </IconWrapper>
          <TabLabel>Control</TabLabel>
        </TabButton>
      </TabBarContainer>

      {/* MODAL DE EDICIÓN DE SUPERVISOR */}
      {editingLineId && (
        <ModalOverlay onClick={() => setEditingLineId(null)} id="supervisor-assign-modal">
          <ModalContent onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: '13px', fontWeight: 700, color: '#1E293B', marginBottom: '4px' }}>
              Asignar Supervisor ── Línea {editingLineId}
            </h3>
            <p style={{ fontSize: '10px', color: '#64748B', marginBottom: '16px' }}>
              Asigna o reasigna el supervisor encargado de la terminal de esta línea.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '10px', fontWeight: 700, color: '#475569' }}>Nombre del Supervisor</label>
                <input 
                  type="text" 
                  value={tempSupervisorName}
                  onChange={(e) => setTempSupervisorName(e.target.value)}
                  placeholder="Ej. Ing. Carlos Mendoza"
                  style={{
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: '1px solid #CBD5E1',
                    fontSize: '12px',
                    outline: 'none',
                    width: '100%',
                    boxSizing: 'border-box'
                  }}
                  id="supervisor-name-field"
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '9px', fontWeight: 700, color: '#64748B' }}>Supervisores Disponibles:</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {presetSupervisors.map(name => (
                    <button
                      key={name}
                      onClick={() => setTempSupervisorName(name)}
                      style={{
                        padding: '4px 8px',
                        backgroundColor: '#F1F5F9',
                        border: '1px solid #E2E8F0',
                        borderRadius: '6px',
                        fontSize: '9px',
                        fontWeight: 600,
                        color: '#475569',
                        cursor: 'pointer'
                      }}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button 
                onClick={() => setEditingLineId(null)}
                style={{
                  padding: '6px 12px',
                  backgroundColor: '#F1F5F9',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: 600,
                  color: '#475569',
                  cursor: 'pointer'
                }}
              >
                Cancelar
              </button>
              <button 
                onClick={handleSaveSupervisor}
                style={{
                  padding: '6px 12px',
                  backgroundColor: '#2563EB',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
                id="save-supervisor-assignment-btn"
              >
                Guardar
              </button>
            </div>
          </ModalContent>
        </ModalOverlay>
      )}

      {/* MODAL DE CONFIGURACIÓN DEL PROGRAMA DE PRODUCCIÓN DE MAÑANA */}
      {isConfiguringNextDay && (
        <ModalOverlay onClick={() => setIsConfiguringNextDay(false)} id="configure-next-day-modal">
          <ModalContent onClick={(e) => e.stopPropagation()} style={{ maxWidth: '440px', width: '95%' }}>
            <h3 style={{ fontSize: '13.5px', fontWeight: 800, color: '#1E293B', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
              </svg>
              <span>Asignar Puestos (Día Posterior)</span>
            </h3>
            <p style={{ fontSize: '10px', color: '#64748B', marginBottom: '14px', lineHeight: '1.4' }}>
              Configura la planificación anticipada para el día posterior a mañana (opcional). Esto simula la cobertura de puestos y calcula preventivamente los déficits por SKU de las líneas activas.
            </p>

            {/* Acciones Rápidas */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
              <button
                onClick={() => {
                  triggerNativeHapticFeedback('short');
                  const activeAll = {};
                  activeLines.forEach(l => { activeAll[l] = "SKU-990-BOST"; });
                  setNextDaySkuPlan(activeAll);
                }}
                style={{
                  padding: '4px 8px',
                  backgroundColor: '#DCFCE7',
                  border: '1px solid #BBF7D0',
                  borderRadius: '6px',
                  fontSize: '9px',
                  fontWeight: 700,
                  color: '#15803D',
                  cursor: 'pointer'
                }}
              >
                Activar Todas (Standard)
              </button>
              <button
                onClick={() => {
                  triggerNativeHapticFeedback('short');
                  const inactiveAll = {};
                  activeLines.forEach(l => { inactiveAll[l] = "INACTIVO"; });
                  setNextDaySkuPlan(inactiveAll);
                }}
                style={{
                  padding: '4px 8px',
                  backgroundColor: '#FEE2E2',
                  border: '1px solid #FECACA',
                  borderRadius: '6px',
                  fontSize: '9px',
                  fontWeight: 700,
                  color: '#B91C1C',
                  cursor: 'pointer'
                }}
              >
                Suspender Todas
              </button>
              <button
                onClick={handleLoadTomorrowFromExcel}
                style={{
                  padding: '4px 8px',
                  backgroundColor: '#DBEAFE',
                  border: '1px solid #BFDBFE',
                  borderRadius: '6px',
                  fontSize: '9px',
                  fontWeight: 700,
                  color: '#1D4ED8',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
                id="load-excel-program-btn"
              >
                📊 Cargar del Excel
              </button>
            </div>

            {/* Listado de Líneas */}
            <div style={{ 
              maxHeight: '260px', 
              overflowY: 'auto', 
              display: 'flex', 
              flexDirection: 'column', 
              gap: '8px', 
              marginBottom: '20px', 
              paddingRight: '4px',
              border: '1px solid #F1F5F9',
              borderRadius: '8px',
              padding: '6px'
            }}>
              {activeLines.map(lineId => {
                const currentSku = nextDaySkuPlan[lineId] || "INACTIVO";
                const isInactive = currentSku === "INACTIVO";
                
                return (
                  <div key={lineId} style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center', 
                    padding: '6px 8px',
                    borderRadius: '6px',
                    backgroundColor: isInactive ? '#F8FAFC' : '#EFF6FF',
                    border: isInactive ? '1px solid #E2E8F0' : '1px solid #BFDBFE',
                    transition: 'all 0.15s ease'
                  }}>
                    <span style={{ fontSize: '11px', fontWeight: 800, color: isInactive ? '#64748B' : '#1E40AF' }}>
                      Línea {lineId}
                    </span>
                    <select
                      value={currentSku}
                      onChange={(e) => {
                        setNextDaySkuPlan(prev => ({ ...prev, [lineId]: e.target.value }));
                      }}
                      style={{
                        padding: '4px 8px',
                        borderRadius: '6px',
                        border: '1px solid #CBD5E1',
                        fontSize: '11px',
                        fontWeight: 700,
                        color: '#1E293B',
                        backgroundColor: '#FFFFFF',
                        outline: 'none',
                        cursor: 'pointer'
                      }}
                      id={`select-tomorrow-sku-${lineId}`}
                    >
                      <option value="INACTIVO">🔴 INACTIVO</option>
                      <option value="SKU-990-BOST">🟢 SKU-990-BOST (Standard)</option>
                      <option value="SKU-441-AQUA">🔵 SKU-441-AQUA (Agua)</option>
                      <option value="SKU-102-LITE">🟡 SKU-102-LITE (Diet)</option>
                      <optgroup label="SKUs Reales del Excel">
                        <option value="850EC0832L35">850EC0832L35 (Cristalino 28%)</option>
                        <option value="850MX0832L35">850MX0832L35 (Especial 35%)</option>
                        <option value="850RM4H32L40">850RM4H32L40 (Envase R40)</option>
                        <option value="850SV4H32L40">850SV4H32L40 (Envase SV40)</option>
                        <option value="850MX0632L35">850MX0632L35 (Especial 35%)</option>
                        <option value="850EC0632L32">850EC0632L32 (Cristalino 32%)</option>
                        <option value="850EC0618I32">850EC0618I32 (Cristalino 32% P)</option>
                        <option value="850EC0640O32">850EC0640O32 (Cristalino Litro)</option>
                        <option value="850SP0440O35">850SP0440O35 (Seco 35% Litro)</option>
                        <option value="850PX0440O35">850PX0440O35 (Proceso Premium)</option>
                        <option value="850NI6F26L28">850NI6F26L28 (Nica 12x750 28%)</option>
                        <option value="850NI0126L35">850NI0126L35 (12 Años 35% S/E)</option>
                        <option value="850SP0126L35">850SP0126L35 (12 Años Seco 35%)</option>
                        <option value="850SP0127L35">850SP0127L35 (12 Años Seco C/E)</option>
                        <option value="850CR0118I35">850CR0118I35 (12 Años CR 35%)</option>
                        <option value="850SV0118I35">850SV0118I35 (12 Años SV 35%)</option>
                        <option value="850PA0118I35">850PA0118I35 (12 Años PA 35%)</option>
                        <option value="850SP0118I35">850SP0118I35 (12 Años SP 35%)</option>
                        <option value="850NI3440O25">850NI3440O25 (Nica Lite 25%)</option>
                        <option value="861NI3274I23">861NI3274I23 (Plata Suave PET)</option>
                        <option value="861NI3239O23">861NI3239O23 (Plata Suave PET L)</option>
                        <option value="862NI2939O20">862NI2939O20 (Estrellita 6x1750)</option>
                      </optgroup>
                    </select>
                  </div>
                );
              })}
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button 
                onClick={() => setIsConfiguringNextDay(false)}
                style={{
                  padding: '8px 14px',
                  backgroundColor: '#F1F5F9',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: 600,
                  color: '#475569',
                  cursor: 'pointer'
                }}
              >
                Cancelar
              </button>
              <button 
                onClick={handleSaveNextDayPlan}
                disabled={programingNextDay}
                style={{
                  padding: '8px 14px',
                  backgroundColor: '#2563EB',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(15, 23, 42, 0.08)'
                }}
                id="save-next-day-program-btn"
              >
                {programingNextDay ? "Asignando..." : "Asignar Puestos"}
              </button>
            </div>
          </ModalContent>
        </ModalOverlay>
      )}


    </PanelContainer>
  );
}
