import React, { useState, useEffect, useMemo } from 'react';
import { styled, keyframes } from '../styles/theme';
import { db, puestosColl, trabajadoresColl, initializeTurnoWithSheets, programNextDayShift, assignPuestosLive, executeCoordinatorSuggestion, getHistorialDia, saveHistorialDia, getProgramaProduccionPorFecha, canWorkerOccupiedSlot, assignSupervisorToLine } from '../services/firebaseService';
import { REAL_SUPERVISORS } from '../dev/realDataSeed';
import { collection, doc, onSnapshot, getDocs, updateDoc, setDoc, deleteDoc, query, where, getDoc, writeBatch, serverTimestamp } from 'firebase/firestore';
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
  padding: '0 16px',
  height: '$headerHeight',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  position: 'relative',
  zIndex: 10,
  flexWrap: 'nowrap',
  boxSizing: 'border-box',
  '@mobile': {
    height: '$headerHeight',
    flexWrap: 'nowrap',
    padding: '0 12px',
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
  gap: '8px',
  flexShrink: 0,
  '@mobile': {
    gap: '4px'
  }
});

const PanelTitle = styled('h1', {
  fontSize: '$fonts$sizeTitleCard',
  fontWeight: '$fonts$weightBold',
  color: '$textPrimary',
  lineHeight: 1,
  margin: 0,
  '@mobile': {
    display: 'none'
  }
});

const ProfileArea = styled('div', {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  flexShrink: 0,
  '@mobile': {
    gap: '6px'
  }
});

const HeaderSpacer = styled('div', {
  flex: 1,
  '@mobile': {
    display: 'none'
  }
});

const TimelineControlWrapper = styled('div', {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  flexShrink: 1,
  maxWidth: '220px',
  width: 'auto',
  '@mobile': {
    maxWidth: '165px',
    justifyContent: 'center'
  }
});

const TimelineButtonsGroup = styled('div', {
  display: 'flex',
  gap: '2px',
  backgroundColor: '$background',
  padding: '2px',
  borderRadius: '20px',
  border: '1px solid $border',
  width: '100%',
  justifyContent: 'space-between'
});

const TimelineButton = styled('button', {
  padding: '4px 6px',
  fontSize: '$fonts$sizeMeta', // 11px
  fontWeight: '$fonts$weightBold',
  borderRadius: '16px',
  border: 'none',
  cursor: 'pointer',
  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '4px',
  flex: 1,
  minWidth: 0,
  whiteSpace: 'nowrap',
  
  variants: {
    active: {
      today: {
        backgroundColor: '#FFFFFF',
        color: '#16A34A',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
      },
      nextDay: {
        backgroundColor: '#FFFFFF',
        color: '#7E22CE',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
      },
      history: {
        backgroundColor: '#FFFFFF',
        color: '#2563EB',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
      },
      inactive: {
        backgroundColor: 'transparent',
        color: '#64748B'
      }
    }
  },
  '@mobile': {
    padding: '3px 4px',
    fontSize: '10px',
    gap: '2px'
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
  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',

  '&:hover': {
    color: '$statusAlert',
    backgroundColor: '$dangerBg'
  },
  '&:active': {
    transform: 'scale(0.92)'
  },
  '@mobile': {
    padding: '4px'
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

// --- PESTAÑA: AUSENCIAS ---
const SectionHeaderTitle = styled('div', {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  height: '32px',
  fontSize: '11px',
  fontWeight: 800,
  color: '$textPrimary',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  marginBottom: '8px'
});

const AbsentListContainer = styled('div', {
  border: '1px solid $border',
  borderRadius: '12px',
  overflow: 'hidden',
  backgroundColor: '#FFFFFF',
  display: 'flex',
  flexDirection: 'column'
});

const AbsentListItem = styled('div', {
  height: '64px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '0 16px',
  backgroundColor: '#FFFFFF',
  borderBottom: '1px solid $border',
  gap: '12px',
  boxSizing: 'border-box',
  '&:last-child': {
    borderBottom: 'none'
  },
  '&:hover': {
    backgroundColor: '#F8FAFC'
  }
});

const AbsentAvatar = styled('div', {
  width: '36px',
  height: '36px',
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '11px',
  fontWeight: 800,
  flexShrink: 0
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
  flexWrap: 'nowrap',
  gap: '6px',
  marginBottom: '16px',
  overflowX: 'auto',
  whiteSpace: 'nowrap',
  WebkitOverflowScrolling: 'touch', // Fluid mobile horizontal scrolling
  msOverflowStyle: 'none',
  scrollbarWidth: 'none',
  '&::-webkit-scrollbar': {
    display: 'none'
  }
});

const LineFilterButton = styled('button', {
  padding: '6px 12px',
  borderRadius: '20px',
  border: '1px solid $border',
  backgroundColor: '#FFFFFF',
  color: '$textSecondary',
  fontSize: '11px',
  fontWeight: 700,
  cursor: 'pointer',
  transition: 'all 0.15s ease',
  flexShrink: 0,

  '&:hover': {
    backgroundColor: '#F8FAFC',
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
  padding: '8px 0',
  height: '56px',
  maxHeight: '56px',
  borderBottom: '1px solid $border',
  boxSizing: 'border-box',
  marginBottom: '12px'
});

const LayoutGrid = styled('div', {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
  gap: '24px',

  '@mobile': {
    gridTemplateColumns: 'minmax(0, 1fr)',
    gap: '12px'
  }
});

const ColumnCard = styled('div', {
  backgroundColor: '#FFFFFF',
  borderRadius: '12px',
  border: '1px solid $border',
  padding: '16px',
  display: 'flex',
  flexDirection: 'column',
  gap: '0px'
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

const SlotsListWrapper = styled('div', {
  display: 'flex',
  flexDirection: 'column',
  marginTop: '0px',
  border: 'none',
  boxShadow: 'none',
  borderRadius: 0,
  overflow: 'hidden'
});

const StatusIndicatorBar = styled('div', {
  position: 'absolute',
  left: 0,
  top: 0,
  bottom: 0,
  width: '3px',
  borderRadius: 0,
  transition: 'all 0.25s ease',
  
  variants: {
    state: {
      covered: {
        backgroundColor: '$successBorder'
      },
      deficit: {
        backgroundColor: '$dangerBorder'
      },
      suspended: {
        backgroundColor: '#94A3B8'
      }
    },
    fatigue: {
      NORMAL: {},
      CRITICO: {
        backgroundColor: '$dangerBorder !important',
        animation: `${pulse} 1.5s infinite`
      }
    }
  }
});

const SlotDetailCard = styled('div', {
  padding: '8px 24px 8px 20px',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  transition: 'all 0.15s ease',
  position: 'relative',
  borderBottom: '1px solid $border',
  height: '64px',
  boxSizing: 'border-box',
  overflow: 'hidden',
  width: '100%',

  '&:last-child': {
    borderBottom: 'none'
  },

  '&:hover': {
    backgroundColor: '#F8FAFC'
  },

  variants: {
    state: {
      covered: {
        backgroundColor: '#FFFFFF'
      },
      deficit: {
        backgroundColor: '#FFFFFF',
        '&:hover': {
          backgroundColor: '#FFF5F5'
        }
      },
      suspended: {
        backgroundColor: '#F8FAFC',
        opacity: 0.75
      }
    },
    locked: {
      true: {
        backgroundColor: '#F0F5FF',
        '&:hover': {
          backgroundColor: '#E0EBFF'
        }
      }
    }
  }
});

const SlotInfo = styled('div', {
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
  flex: 1,
  minWidth: 0,
  paddingLeft: '8px'
});

const SlotName = styled('strong', {
  fontSize: '13px',
  fontWeight: 600,
  color: '$textPrimary'
});

const SlotWorkerName = styled('span', {
  fontSize: '11px',
  color: '$textSecondary',
  fontWeight: 500,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis'
});

const StatusPill = styled('span', {
  fontSize: '9px',
  fontWeight: 700,
  padding: '2px 6px',
  borderRadius: '4px',
  textTransform: 'uppercase',
  letterSpacing: '0.3px',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  border: 'none',
  flexShrink: 0,

  variants: {
    state: {
      covered: { 
        backgroundColor: '$chipSuccessBg', 
        color: '$chipSuccessText'
      },
      deficit: { 
        backgroundColor: '$chipDangerBg', 
        color: '$chipDangerText', 
        animation: `${pulse} 2s infinite` 
      },
      suspended: { 
        backgroundColor: '$chipNeutralBg', 
        color: '$chipNeutralText' 
      }
    }
  }
});

const FatigueBadge = styled('span', {
  fontSize: '9px',
  fontWeight: 700,
  padding: '2.5px 7px',
  borderRadius: '6px',
  textTransform: 'uppercase',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  letterSpacing: '0.2px',
  fontFamily: 'monospace',
  fontVariantNumeric: 'tabular-nums',
  backgroundColor: '$dangerBg',
  color: '$dangerBorder',
  border: '1px solid $dangerBorder',
  animation: `${pulse} 1.5s infinite`
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
  padding: '12px 16px',
  boxShadow: '$elevation1',
  display: 'flex',
  flexDirection: 'column',
  gap: '12px'
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



const EmptyStateCard = styled('div', {
  height: '48px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px',
  backgroundColor: '$card',
  border: '1px solid $border',
  borderRadius: '12px',
  color: '$textSecondary',
  fontSize: '12px',
  fontWeight: 500,
  boxSizing: 'border-box',
  width: '100%'
});

const SuggestionsListContainer = styled('div', {
  border: '1px solid $border',
  borderRadius: '12px',
  overflow: 'hidden',
  backgroundColor: '#FFFFFF',
  display: 'flex',
  flexDirection: 'column',
  width: '100%'
});

const SuggestionListItem = styled('div', {
  height: '64px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '0 16px',
  backgroundColor: '#FFFFFF',
  borderBottom: '1px solid $border',
  gap: '12px',
  boxSizing: 'border-box',
  '&:last-child': {
    borderBottom: 'none'
  },
  '&:hover': {
    backgroundColor: '#F8FAFC'
  }
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

const SupervisorVerticalList = styled('div', {
  display: 'flex',
  flexDirection: 'column'
});

const SupervisorListItem = styled('div', {
  height: '$listItemHeight',
  display: 'flex',
  alignItems: 'center',
  borderBottom: '1px solid $listDivider',
  boxSizing: 'border-box',
  gap: '12px',
  '&:last-child': {
    borderBottom: 'none'
  }
});

const SupervisorLineChip = styled('span', {
  backgroundColor: '$chipAccentBg',
  color: '$chipAccentText',
  fontSize: '$sizeMeta',
  fontWeight: '$weightBold',
  padding: '2px 8px',
  borderRadius: '12px',
  height: '$chipHeight',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  boxSizing: 'border-box'
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
  height: '24px',
  width: '24px',
  color: '$textSecondary',
  transition: 'color 0.25s ease, transform 0.25s ease',

  variants: {
    active: {
      true: {
        color: '$accent',
        transform: 'scale(1.05)'
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



// --- NEW TOKENS AND STYLED COMPONENTS FOR MAPA REDESIGN ---

const ScreenHeader = styled('div', {
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  padding: '16px 0 8px 0',
  boxSizing: 'border-box'
});

const ScreenTitle = styled('h2', {
  fontSize: '$fonts$sizeTitleCard',
  fontWeight: '$fonts$weightBold',
  color: '$textPrimary',
  margin: 0
});

const ScreenSubtitle = styled('span', {
  fontSize: '$fonts$sizeMeta',
  color: '$textSecondary',
  fontWeight: '$fonts$weightSemibold'
});

const MapaTabContainer = styled('div', {
  maxWidth: '1200px',
  margin: '0 auto',
  padding: '16px 20px calc(96px + env(safe-area-inset-bottom, 0px)) 20px',
  animation: `${fadeIn} 0.25s ease-out`,
  backgroundColor: '$background',
  boxSizing: 'border-box',
  '@mobile': {
    padding: '12px 12px calc(96px + env(safe-area-inset-bottom, 0px)) 12px'
  }
});

const LineChipsContainer = styled('div', {
  padding: '12px',
  backgroundColor: '$card',
  borderRadius: '12px',
  boxShadow: '$elevation1',
  margin: '12px 0',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  boxSizing: 'border-box',
  height: '64px',
  maxHeight: '80px',
  overflow: 'hidden'
});

const LineChipsHorizontalScroll = styled('div', {
  display: 'flex',
  flexDirection: 'row',
  gap: '8px',
  overflowX: 'auto',
  width: '100%',
  '-webkit-overflow-scrolling': 'touch',
  '&::-webkit-scrollbar': {
    display: 'none'
  },
  scrollbarWidth: 'none'
});

const LineSelectionChip = styled('div', {
  height: '40px',
  minWidth: '76px',
  borderRadius: '12px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
  boxSizing: 'border-box',
  
  variants: {
    status: {
      ok: {
        backgroundColor: '$chipSuccessBg',
        color: '$chipSuccessText',
        border: '1px solid $statusOk'
      },
      danger: {
        backgroundColor: '$chipDangerBg',
        color: '$chipDangerText',
        border: '1px solid $statusAlert'
      }
    },
    selected: {
      true: {
        transform: 'scale(1.02)',
        boxShadow: '$elevation2',
        borderWidth: '2px'
      }
    }
  }
});

const LinesListContainer = styled('div', {
  backgroundColor: '$card',
  borderRadius: '12px',
  boxShadow: '$elevation1',
  margin: '12px 0',
  overflow: 'hidden',
  border: '1px solid $border',
  boxSizing: 'border-box',
  display: 'flex',
  flexDirection: 'column'
});

const LineListItem = styled('div', {
  height: '$listItemHeight',
  backgroundColor: '$card',
  boxShadow: '$listSeparator',
  borderRadius: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '0 16px',
  gap: '12px',
  cursor: 'pointer',
  transition: 'background-color 0.2s',
  boxSizing: 'border-box',
  border: '0px solid transparent',
  
  '&:hover': {
    backgroundColor: '$surfaceHover'
  },
  '&:active': {
    backgroundColor: '$surfaceHover'
  },
  
  variants: {
    status: {
      ok: {
        borderLeftWidth: '3px',
        borderLeftStyle: 'solid',
        borderLeftColor: '$statusOk',
        paddingLeft: '13px'
      },
      danger: {
        borderLeftWidth: '3px',
        borderLeftStyle: 'solid',
        borderLeftColor: '$statusAlert',
        paddingLeft: '13px'
      }
    }
  }
});

const ZoneALine = styled('div', {
  width: '48px',
  fontSize: '$fonts$sizeTitleCard',
  fontWeight: '$fonts$weightBold',
  color: '$textPrimary',
  display: 'flex',
  alignItems: 'center',
  flexShrink: 0
});

const ZoneBLine = styled('div', {
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
  padding: '0 12px',
  minWidth: 0,
  justifyContent: 'center'
});

const LineTextSku = styled('span', {
  fontSize: '$fonts$sizeSecondary',
  fontWeight: '$fonts$weightSemibold',
  color: '$textPrimary',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis'
});

const LineTextSup = styled('span', {
  fontSize: '$fonts$sizeMeta',
  color: '$textSecondary',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  marginTop: '2px',
  
  variants: {
    unassigned: {
      true: {
        color: '$statusAlert',
        fontWeight: '$fonts$weightSemibold'
      }
    }
  }
});

const ZoneCLine = styled('div', {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-end',
  justifyContent: 'center',
  flexShrink: 0
});

const CoverageBadge = styled('span', {
  fontSize: '$fonts$sizeMeta',
  fontWeight: '$fonts$weightBold',
  padding: '3px 8px',
  borderRadius: '12px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  whiteSpace: 'nowrap',
  boxSizing: 'border-box',
  
  variants: {
    range: {
      green: {
        backgroundColor: '$chipSuccessBg',
        color: '$chipSuccessText',
        border: '1px solid $statusOk'
      },
      yellow: {
        backgroundColor: '#FFFBEB',
        color: '#B45309',
        border: '1px solid #FCD34D'
      },
      red: {
        backgroundColor: '$chipDangerBg',
        color: '$chipDangerText',
        border: '1px solid $statusAlert'
      }
    }
  }
});

const OeeBadgeText = styled('span', {
  fontSize: '$fonts$sizeMeta',
  color: '$textSecondary',
  marginTop: '2px'
});

const QuickStatsContainer = styled('div', {
  backgroundColor: '$card',
  border: '1px solid $border',
  borderRadius: '12px',
  padding: '12px 16px',
  display: 'grid',
  gridTemplateColumns: '1fr 1fr 1fr',
  alignItems: 'center',
  justifyContent: 'center',
  textAlign: 'center',
  boxShadow: '$subtle',
  boxSizing: 'border-box',
  width: '100%',
  margin: '12px 0'
});

const QuickStatItem = styled('div', {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  position: 'relative',
  
  '&:not(:last-child)::after': {
    content: '""',
    position: 'absolute',
    right: 0,
    top: '15%',
    height: '70%',
    width: '1px',
    backgroundColor: '$border'
  }
});

const QuickStatLabel = styled('span', {
  fontSize: '$fonts$sizeMeta',
  color: '$textSecondary',
  fontWeight: '$fonts$weightSemibold',
  textTransform: 'uppercase',
  letterSpacing: '0.3px'
});

const QuickStatValue = styled('span', {
  fontSize: '$fonts$sizeTitleCard',
  fontWeight: '$fonts$weightBold',
  
  variants: {
    status: {
      ok: { color: '$statusOk' },
      alert: { color: '$statusAlert' },
      normal: { color: '$textPrimary' }
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

  const [authorizedSupervisors, setAuthorizedSupervisors] = useState(REAL_SUPERVISORS);
  const [showAuthSupervisorsModal, setShowAuthSupervisorsModal] = useState(false);
  const [newSupWorkerId, setNewSupWorkerId] = useState("");
  const [newSupName, setNewSupName] = useState("");
  const [newSupShortName, setNewSupShortName] = useState("");

  // Escuchar colección personal_autorizado en tiempo real (Fuente de verdad)
  useEffect(() => {
    const unsubPersonal = onSnapshot(collection(db, "personal_autorizado"), (snapshot) => {
      if (!snapshot.empty) {
        const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        setAuthorizedSupervisors(list);
      } else {
        // Auto-poblar semillero inicial si la colección en Firestore está vacía
        REAL_SUPERVISORS.forEach(async (sup) => {
          await setDoc(doc(db, "personal_autorizado", sup.id), {
            workerId: sup.id,
            name: sup.name,
            shortName: sup.shortName,
            role: "Supervisor",
            createdAt: serverTimestamp()
          });
        });
        setAuthorizedSupervisors(REAL_SUPERVISORS);
      }
    }, (err) => {
      console.warn("[PanelCoordinador] Error escuchando personal_autorizado:", err);
    });

    return () => unsubPersonal();
  }, []);

  // Supervisores reales del sistema — enriquecidos con asignaciones actuales
  const availableSupervisors = useMemo(() => {
    return authorizedSupervisors.map(sup => {
      const supId = sup.id || sup.workerId;
      // Buscar si ya está asignado a alguna línea
      const assignedLine = Object.entries(supervisors).find(
        ([, val]) => val?.workerId === supId
      );
      return {
        ...sup,
        id: supId,
        assignedLine: assignedLine ? assignedLine[0] : null,
        isAvailable: !assignedLine || assignedLine[0] === editingLineId
      };
    });
  }, [supervisors, editingLineId, authorizedSupervisors]);

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
        // Normalizar: si los valores son strings (viejo formato), convertir a objetos
        const normalized = {};
        Object.entries(sups).forEach(([lineId, val]) => {
          if (typeof val === 'string') {
            normalized[lineId] = { workerId: null, name: val, shortName: val };
          } else {
            normalized[lineId] = val;
          }
        });
        setSupervisors(normalized);
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
        supervisor: supervisors[lineId]?.shortName || supervisors[lineId]?.name || (typeof supervisors[lineId] === 'string' ? supervisors[lineId] : "Sin Asignar"),
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
        supervisor: supervisors[lineId]?.shortName || supervisors[lineId]?.name || (typeof supervisors[lineId] === 'string' ? supervisors[lineId] : "Sin Asignar"),
        puestosData: tomorrowPuestosData
      };
    });
    return stats;
  }, [viewDay, lineStats, configDocs, activeLines, puestos, supervisors]);

  // Obtener los informes de producción y eventos de SKU guardados en Firestore
  const productionReports = useMemo(() => {
    const reportsDoc = configDocs["production_reports"];
    return reportsDoc?.reports || [];
  }, [configDocs]);

  const skuEvents = useMemo(() => {
    const reportsDoc = configDocs["production_reports"];
    return reportsDoc?.skuEvents || [];
  }, [configDocs]);

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

  const totalDeficits = useMemo(() => {
    if (!activeLineStats) return 0;
    return activeLines.reduce((acc, l) => {
      const stats = activeLineStats[l];
      if (stats && stats.sku !== "INACTIVO") {
        return acc + (stats.deficitCount || 0);
      }
      return acc;
    }, 0);
  }, [activeLines, activeLineStats]);

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
    const isWorkerRoleCompatibleWithSlot = (workerRole, slotTipo, slotName) => {
      if (!workerRole || !slotTipo) return false;
      const wRole = workerRole.trim().toLowerCase();
      const sTipo = slotTipo.trim().toLowerCase();
      const sName = slotName ? slotName.trim().toLowerCase() : "";

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
          if (!isWorkerRoleCompatibleWithSlot(w.role, slot.tipoPuesto, slot.puestoName)) return false;
          if (!canWorkerOccupiedSlot(w, slot)) return false;

          if (w.lastActivity === stationName) return false;
          return true;
        });

        let suggestionType = "POOL";

        // B. Si no hay en Pool, buscar en el Bolsón L8
        if (!chosenWorker) {
          chosenWorker = bolsonWorkers.find(w => {
            if (assignedInSuggestions.has(w.id)) return false;
            if (!isWorkerRoleCompatibleWithSlot(w.role, slot.tipoPuesto, slot.puestoName)) return false;
            if (!canWorkerOccupiedSlot(w, slot)) return false;

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
            if (!isWorkerRoleCompatibleWithSlot(w.role, slot.tipoPuesto, slot.puestoName)) return false;
            if (!canWorkerOccupiedSlot(w, slot)) return false;

            const wSlot = puestos.find(p => p.id === w.currentSlotId);
            if (!wSlot) return false;

            const wLinePriority = priorityMap[wSlot.lineId] || 0;
            if (wLinePriority >= slotPriority) return false; // Solo rotar de menor a mayor prioridad

            if (w.role === "OPERADOR_A" || w.role === "AVERIERO") return false;

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
          if (!isWorkerRoleCompatibleWithSlot(w.role, slot.tipoPuesto, slot.puestoName)) return false;
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
            if (!isWorkerRoleCompatibleWithSlot(w.role, slot.tipoPuesto, slot.puestoName)) return false;

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

  const handleAddAuthorizedSupervisor = async (e) => {
    e.preventDefault();
    if (!newSupWorkerId.trim() || !newSupName.trim()) return;
    try {
      const id = newSupWorkerId.trim();
      const name = newSupName.trim();
      const shortName = newSupShortName.trim() || name;
      await setDoc(doc(db, "personal_autorizado", id), {
        workerId: id,
        name: name,
        shortName: shortName,
        role: "Supervisor",
        createdAt: serverTimestamp()
      });
      setNewSupWorkerId("");
      setNewSupName("");
      setNewSupShortName("");
      triggerNativeHapticFeedback('confirm');
      alert(`Supervisor ${name} (${id}) dado de alta exitosamente en personal_autorizado.`);
    } catch (err) {
      alert(`Error al dar de alta supervisor: ${err.message}`);
    }
  };

  const handleDeleteAuthorizedSupervisor = async (supId, name) => {
    if (!window.confirm(`¿Dar de baja al supervisor "${name}" (${supId})? Se revocarán sus accesos.`)) return;
    try {
      await deleteDoc(doc(db, "personal_autorizado", supId));
      triggerNativeHapticFeedback('confirm');
    } catch (err) {
      alert(`Error al dar de baja supervisor: ${err.message}`);
    }
  };

  const handleSaveSupervisor = async () => {
    if (!editingLineId || !tempSupervisorName) return;
    triggerNativeHapticFeedback('short');
    try {
      // tempSupervisorName ahora contiene el workerId del supervisor seleccionado
      const selectedSup = authorizedSupervisors.find(s => s.id === tempSupervisorName || s.workerId === tempSupervisorName);
      if (!selectedSup) {
        // Si es "Sin Asignar" — limpiar asignación
        const newAssignments = { ...supervisors };
        newAssignments[editingLineId] = { workerId: null, name: "Sin Asignar", shortName: "Sin Asignar" };
        await setDoc(doc(db, "config", "supervisors_assignment"), newAssignments);
        await setDoc(doc(db, "config", "next_day_plan"), { status: "BORRADOR", updatedAt: new Date() }, { merge: true });
        setEditingLineId(null);
        return;
      }

      await assignSupervisorToLine(editingLineId, selectedSup.id || selectedSup.workerId, selectedSup.name, selectedSup.shortName || selectedSup.name);
      setEditingLineId(null);
    } catch (err) {
      alert(`Error al asignar supervisor: ${err.message}`);
    }
  };

  const handleOpenEditSupervisor = (lineId) => {
    triggerNativeHapticFeedback('short');
    setEditingLineId(lineId);
    // Pre-seleccionar el workerId actual del supervisor asignado
    const currentAssignment = supervisors[lineId];
    setTempSupervisorName(currentAssignment?.workerId || "");
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
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2.5" style={{ flexShrink: 0 }}>
              <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/>
              <path d="m3.3 7 8.7 5 8.7-5"/>
              <path d="M12 22V12"/>
            </svg>
            <PanelTitle>SmartAssign</PanelTitle>
          </LogoArea>

          {/* flex spacer */}
          <HeaderSpacer />

          {/* Segmented Control de Perspectiva Temporal Global */}
          <TimelineControlWrapper id="global-timeline-segmented-control">
            <TimelineButtonsGroup>
              <TimelineButton
                active={viewDay === 'TODAY' ? 'today' : 'inactive'}
                onClick={() => {
                  triggerNativeHapticFeedback('short');
                  const local = new Date();
                  const offset = local.getTimezoneOffset();
                  const localDate = new Date(local.getTime() - (offset * 60 * 1000));
                  setSelectedDate(localDate.toISOString().split('T')[0]);
                  setViewDay('TODAY');
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
              </TimelineButton>

              <TimelineButton
                active={viewDay === 'NEXT_DAY' ? 'nextDay' : 'inactive'}
                onClick={() => {
                  triggerNativeHapticFeedback('short');
                  const tomorrow = new Date();
                  tomorrow.setDate(tomorrow.getDate() + 1);
                  const offset = tomorrow.getTimezoneOffset();
                  const localDate = new Date(tomorrow.getTime() - (offset * 60 * 1000));
                  setSelectedDate(localDate.toISOString().split('T')[0]);
                  setViewDay('NEXT_DAY');
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
              </TimelineButton>

              <TimelineButton
                active={viewDay === 'HISTORY' ? 'history' : 'inactive'}
                onClick={() => {
                  triggerNativeHapticFeedback('short');
                  setViewDay('HISTORY');
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
              </TimelineButton>
            </TimelineButtonsGroup>

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
          </TimelineControlWrapper>

          <ProfileArea>
            <button
              onClick={() => {
                triggerNativeHapticFeedback('short');
                setShowAuthSupervisorsModal(true);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '5px 10px',
                backgroundColor: '#EFF6FF',
                color: '#2563EB',
                border: '1px solid #BFDBFE',
                borderRadius: '8px',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
              title="Gestionar Personal Autorizado (Supervisores en Nómina)"
              id="btn-manage-authorized-supervisors"
            >
              👥 Supervisores
            </button>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#1E293B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100px' }}>{coordinatorName}</span>
            <LogoutBtn onClick={onLogout} title="Cerrar terminal de coordination" id="coordinator-logout-btn">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>
              </svg>
            </LogoutBtn>
          </ProfileArea>
        </PanelHeader>
      </StickyHeaderContainer>

      {/* --- RENDERIZADO REACTIVO DE PESTAÑAS (TABS) --- */}

      {currentTab === 'MAPA' && (
        <MapaTabContainer id="tab-coordinador-mapa">
          {viewDay !== 'NEXT_DAY' && (
            <ScreenHeader>
              <ScreenTitle>
                {viewDay === 'TODAY' ? "Monitoreo en Tiempo Real" : "Historial Real de Planta"}
              </ScreenTitle>
              <ScreenSubtitle>
                {activeLines.filter(lineId => activeLineStats?.[lineId] && activeLineStats[lineId].sku !== "INACTIVO").length} Líneas Activas
              </ScreenSubtitle>
            </ScreenHeader>
          )}

          {/* ORDENES DE PRODUCCION REALES DEL EXCEL (Cargadas de programa_produccion) */}
          {viewDay !== 'NEXT_DAY' && dayOrders && dayOrders.length > 0 && (
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
          {viewDay === 'NEXT_DAY' && !activeLineStats && (
            <>
              <SectionHeaderTitle style={{ marginBottom: '12px' }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                  <line x1="16" y1="2" x2="16" y2="6"/>
                  <line x1="8" y1="2" x2="8" y2="6"/>
                  <line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
                <span>Plan de Producción del Día Siguiente sin Programar</span>
              </SectionHeaderTitle>

              {dayOrders && dayOrders.length > 0 && (
                <LinesListContainer id="semaphoric-lines-grid" style={{ marginBottom: '16px' }}>
                  {dayOrders.map(order => (
                    <LineListItem
                      key={order.id}
                      status="suspended"
                      style={{ cursor: 'default' }}
                    >
                      <ZoneALine>
                        L{order.lineaId}
                      </ZoneALine>
                      
                      <ZoneBLine>
                        <LineTextSku>{order.item} - {order.producto}</LineTextSku>
                        <span style={{ fontSize: '10px', color: '#64748B', display: 'block', marginTop: '2px' }}>
                          Orden: {order.ordenProceso}
                        </span>
                        {order.comentario && (
                          <span style={{ fontSize: '9px', color: '#B45309', fontStyle: 'italic', display: 'block', marginTop: '1px' }}>
                            * {order.comentario}
                          </span>
                        )}
                      </ZoneBLine>
                      
                      <ZoneCLine>
                        <span style={{ 
                          fontSize: '11px', 
                          fontWeight: 800, 
                          color: '#1E40AF', 
                          backgroundColor: '#EFF6FF', 
                          padding: '2px 8px', 
                          borderRadius: '4px', 
                          border: '1px solid #BFDBFE' 
                        }}>
                          Meta: {order.cajas} cjs
                        </span>
                      </ZoneCLine>
                    </LineListItem>
                  ))}
                </LinesListContainer>
              )}
            </>
          )}

          {/* ACCIONES PRINCIPALES Y DILIGENCIA: SEPARACIÓN DE MÉTODOS Y CORRECCIÓN DE BUG */}
          <div style={{
            display: 'flex',
            gap: '10px',
            marginBottom: '14px',
            flexWrap: 'wrap'
          }}>
            {viewDay === 'TODAY' ? (
              <QuickStatsContainer id="coordination-quick-stats-bar">
                <QuickStatItem>
                  <QuickStatLabel>OEE Promedio</QuickStatLabel>
                  <QuickStatValue status={activePlantMetrics.avgOee >= 85 ? "ok" : activePlantMetrics.avgOee >= 70 ? "normal" : "alert"}>
                    {activePlantMetrics.avgOee}%
                  </QuickStatValue>
                </QuickStatItem>
                <QuickStatItem>
                  <QuickStatLabel>Déficits</QuickStatLabel>
                  <QuickStatValue status={totalDeficits === 0 ? "ok" : "alert"}>
                    {totalDeficits === 0 ? "✓ 0" : `⚠ ${totalDeficits}`}
                  </QuickStatValue>
                </QuickStatItem>
                <QuickStatItem>
                  <QuickStatLabel>Paros</QuickStatLabel>
                  <QuickStatValue status={activePlantMetrics.totalDowntimeMinutes === 0 ? "ok" : "alert"}>
                    {activePlantMetrics.totalDowntimeMinutes} Min
                  </QuickStatValue>
                </QuickStatItem>
              </QuickStatsContainer>
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
                    height: '44px',
                    padding: '0 18px',
                    backgroundColor: '#2563EB',
                    backgroundImage: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '10px',
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
                    height: '44px',
                    padding: '0 18px',
                    backgroundColor: '#7E22CE',
                    backgroundImage: 'linear-gradient(135deg, #7E22CE 0%, #6B21A8 100%)',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '10px',
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

          <LinesListContainer id="semaphoric-lines-grid">
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

                const statusVal = stats.deficitCount > 0 ? "danger" : "ok";

                return (
                  <LineListItem
                    key={lineId}
                    status={statusVal}
                    onClick={() => {
                      triggerNativeHapticFeedback('short');
                      setSelectedLineId(lineId);
                      setCurrentTab('PUESTOS');
                    }}
                    id={`line-card-${lineId}`}
                  >
                    {/* ZONA A: Left */}
                    <ZoneALine>
                      {lineId}
                    </ZoneALine>
                    
                    {/* ZONA B: Center */}
                    <ZoneBLine>
                      <LineTextSku>{stats.sku}</LineTextSku>
                      {viewDay === 'NEXT_DAY' ? (
                        <div 
                          onClick={(e) => {
                            e.stopPropagation(); // Evita redirigir a Puestos
                            handleOpenEditSupervisor(lineId);
                          }}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            cursor: 'pointer',
                            marginTop: '4px',
                            color: stats.supervisor === "Sin Asignar" ? '#2563EB' : 'var(--colors-textSecondary, #475569)',
                            fontSize: '11px',
                            fontWeight: stats.supervisor === "Sin Asignar" ? 700 : 500,
                            padding: stats.supervisor === "Sin Asignar" ? '2px 6px' : '0',
                            border: stats.supervisor === "Sin Asignar" ? '1px dashed #2563EB' : 'none',
                            borderRadius: '4px',
                            backgroundColor: stats.supervisor === "Sin Asignar" ? 'rgba(37, 99, 235, 0.05)' : 'transparent',
                            width: 'fit-content'
                          }}
                        >
                          {stats.supervisor === "Sin Asignar" ? (
                            <>
                              <span>+ Asignar Supervisor</span>
                            </>
                          ) : (
                            <>
                              <span>Sup: {stats.supervisor}</span>
                              <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginLeft: '2px' }}>
                                <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
                              </svg>
                            </>
                          )}
                        </div>
                      ) : (
                        <LineTextSup unassigned={stats.supervisor === "Sin Asignar"}>
                          Sup: {stats.supervisor}
                        </LineTextSup>
                      )}
                    </ZoneBLine>
                    
                    {/* ZONA C: Right */}
                    <ZoneCLine>
                      {(() => {
                        let rangeColor = "green";
                        if (stats.coveragePct < 70) {
                          rangeColor = "red";
                        } else if (stats.coveragePct < 90) {
                          rangeColor = "yellow";
                        }
                        return (
                          <CoverageBadge range={rangeColor}>
                            {stats.assignedSlots}/{stats.totalSlots} ({stats.coveragePct}%)
                          </CoverageBadge>
                        );
                      })()}
                      <OeeBadgeText>
                        OEE: {stats.oeePct}%
                      </OeeBadgeText>
                    </ZoneCLine>
                  </LineListItem>
                );
              })}
          </LinesListContainer>

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
        </MapaTabContainer>
      )}
      {currentTab === 'PUESTOS' && (
        <TabContentContainer id="tab-coordinador-puestos">
          {viewDay === 'NEXT_DAY' && !activeLineStats ? (
            <div>
              <SectionHeaderTitle style={{ marginBottom: '12px' }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                  <line x1="16" y1="2" x2="16" y2="6"/>
                  <line x1="8" y1="2" x2="8" y2="6"/>
                  <line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
                <span>Plan de Producción del Día Siguiente sin Programar</span>
              </SectionHeaderTitle>
              
              {dayOrders && dayOrders.length > 0 && (
                <LinesListContainer id="semaphoric-lines-grid-puestos" style={{ marginBottom: '16px' }}>
                  {dayOrders.map(order => (
                    <LineListItem
                      key={order.id}
                      status="suspended"
                      style={{ cursor: 'default' }}
                    >
                      <ZoneALine>
                        L{order.lineaId}
                      </ZoneALine>
                      
                      <ZoneBLine>
                        <LineTextSku>{order.item} - {order.producto}</LineTextSku>
                        <span style={{ fontSize: '10px', color: '#64748B', display: 'block', marginTop: '2px' }}>
                          Orden: {order.ordenProceso}
                        </span>
                      </ZoneBLine>
                      
                      <ZoneCLine>
                        <span style={{ 
                          fontSize: '11px', 
                          fontWeight: 800, 
                          color: '#1E40AF', 
                          backgroundColor: '#EFF6FF', 
                          padding: '2px 8px', 
                          borderRadius: '4px', 
                          border: '1px solid #BFDBFE' 
                        }}>
                          Meta: {order.cajas} cjs
                        </span>
                      </ZoneCLine>
                    </LineListItem>
                  ))}
                </LinesListContainer>
              )}

              <button
                onClick={() => {
                  triggerNativeHapticFeedback('short');
                  handleProgramNextDay();
                }}
                style={{
                  height: '44px',
                  padding: '0 18px',
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
                  transition: 'all 0.2s ease',
                  width: '100%',
                  justifyContent: 'center'
                }}
                id="program-next-day-empty-puestos-btn"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
                </svg>
                <span>Planificar Día Siguiente (Motor T+1)</span>
              </button>
            </div>
          ) : (
             <>


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
                  {lineId}
                </LineFilterButton>
              ))}
          </LineButtonsRow>

          <LayoutHeader>
            <div>
              <strong style={{ fontSize: '14px', color: '$textPrimary', display: 'block', lineHeight: '1.2' }}>Línea {selectedLineId}</strong>
              <span style={{ fontSize: '11px', color: 'var(--colors-textSecondary)', display: 'block', marginTop: '2px' }}>
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

                return (
                  <SlotsListWrapper>
                    {fijosPuestos.map(p => {
                      const state = p.status === "SUSPENDIDO" ? "suspended" : (p.status === "ASIGNADO" ? "covered" : "deficit");
                      const workerName = viewDay === 'TODAY' ? (workers[p.idWorkerCurrent]?.name || "VACANTE") : (p.workerName || "VACANTE");

                      return (
                        <SlotDetailCard key={p.id} state={state} locked={!!p.locked} id={`slot-detail-${p.id}`}>
                          <StatusIndicatorBar state={state} />
                          <SlotInfo>
                            <SlotName>{p.puestoName} ({p.tipoPuesto})</SlotName>
                            <SlotWorkerName>
                              <span style={{ fontWeight: 600, color: '#64748B' }}>Titular:</span> {workers[p.idWorkerOriginal]?.name || "Sin Titular"}
                            </SlotWorkerName>
                            <SlotWorkerName style={{ color: '#2563EB', fontWeight: 600, marginTop: '2px' }}>
                              <span style={{ fontWeight: 700 }}>Asignado:</span> {workerName}
                            </SlotWorkerName>
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
                    })}
                  </SlotsListWrapper>
                );
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

                return (
                  <SlotsListWrapper>
                    {variosPuestos.map(p => {
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
                        >
                          <StatusIndicatorBar state={state} fatigue={isFatigued ? "CRITICO" : "NORMAL"} />
                          <SlotInfo>
                            <SlotName>{p.puestoName} ({p.tipoPuesto})</SlotName>
                            <SlotWorkerName>
                              <span style={{ fontWeight: 600, color: '#64748B' }}>Operario:</span> {workerName}
                            </SlotWorkerName>
                          </SlotInfo>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {isFatigued && (
                              <FatigueBadge>
                                FATIGADO ({elapsed}m)
                              </FatigueBadge>
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
                    })}
                  </SlotsListWrapper>
                );
              })()}
            </ColumnCard>
          </LayoutGrid>
         </>
        )}
      </TabContentContainer>
      )}

      {currentTab === 'DASHBOARD' && (
        <TabContentContainer id="tab-coordinador-dashboard">
          <QuickStatsContainer id="kpi-metric-dashboard-card" style={{ margin: '0 0 20px 0' }}>
            <QuickStatItem>
              <QuickStatLabel>{viewDay === 'TODAY' ? "OEE Real" : (viewDay === 'HISTORY' ? "OEE Cierre" : "OEE Proyectado")}</QuickStatLabel>
              <QuickStatValue status={activePlantMetrics.avgOee >= 85 ? "ok" : activePlantMetrics.avgOee >= 70 ? "normal" : "alert"}>
                {activePlantMetrics.avgOee}%
              </QuickStatValue>
            </QuickStatItem>
            <QuickStatItem>
              <QuickStatLabel>{viewDay === 'TODAY' ? "Paros Activos" : (viewDay === 'HISTORY' ? "Paros Totales" : "Paros Proyectados")}</QuickStatLabel>
              <QuickStatValue status={activePlantMetrics.totalDowntimeMinutes === 0 ? "ok" : "alert"}>
                {activePlantMetrics.totalDowntimeMinutes} Min
              </QuickStatValue>
            </QuickStatItem>
            <QuickStatItem>
              <QuickStatLabel>{viewDay === 'TODAY' ? "Mermas Totales" : (viewDay === 'HISTORY' ? "Mermas Totales" : "Mermas Proyectadas")}</QuickStatLabel>
              <QuickStatValue status={activePlantMetrics.totalMermasProcess < 100 ? "ok" : "alert"}>
                {activePlantMetrics.totalMermasProcess} Pzs
              </QuickStatValue>
            </QuickStatItem>
          </QuickStatsContainer>

          {/* Gráficos y Visualizaciones */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginTop: '20px' }}>
            {/* GRAFICO PAROS CATEGORIA SVG */}
            <div>
              <SectionHeaderTitle style={{ marginBottom: '8px' }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="12" cy="12" r="10"/>
                  <polyline points="12 6 12 12 16 14"/>
                </svg>
                <span>Distribución de Paros de Planta por Categoría</span>
              </SectionHeaderTitle>
              <ChartCard id="paros-chart-card">
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
            </div>

            {/* GRAFICO MERMAS SVG */}
            <div>
              <SectionHeaderTitle style={{ marginBottom: '8px' }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <span>Desperdicios por Material (Mermas en Proceso)</span>
              </SectionHeaderTitle>
              <ChartCard id="mermas-chart-card" style={{ padding: '8px 12px', maxHeight: '200px' }}>
                {/* Gráfico de Barras Verticales SVG Limpio y Premium */}
                <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'flex-end', height: '130px', padding: '12px 0 4px 0', borderBottom: '1px solid #E2E8F0', position: 'relative' }}>
                  {Object.keys(activePlantMetrics.mermasByMaterial).map(material => {
                    const val = activePlantMetrics.mermasByMaterial[material];
                    const maxVal = Math.max(10, ...Object.values(activePlantMetrics.mermasByMaterial));
                    const heightMins = Math.round((val / maxVal) * 85);

                    return (
                      <div key={material} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', zIndex: 10 }}>
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
          </div>

          {/* 📋 SECCIÓN: INFORMES DE PRODUCCIÓN Y EVENTOS DE SKU EN VIVO */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px', marginTop: '24px' }}>
            
            {/* COLUMNA A: Informes de Cierre de Turno de los Supervisores */}
            <div>
              <SectionHeaderTitle style={{ marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '13px' }}>📋</span>
                <span>Informes de Cierre de Turno Recibidos</span>
              </SectionHeaderTitle>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '420px', overflowY: 'auto', paddingRight: '4px' }}>
                {productionReports.length === 0 ? (
                  <div style={{
                    textAlign: 'center',
                    padding: '32px 20px',
                    color: '#94A3B8',
                    fontSize: '11px',
                    backgroundColor: '#FFFFFF',
                    border: '1px dashed #CBD5E1',
                    borderRadius: '12px'
                  }}>
                    Aún no se han recibido informes de cierre de turno para este periodo.
                  </div>
                ) : (
                  productionReports.map(rep => {
                    const oeeState = rep.oee >= 85 ? "success" : rep.oee >= 70 ? "warning" : "danger";
                    const oeeColors = {
                      success: { bg: '#EFF6FF', text: '#1E40AF', border: '#BFDBFE' },
                      warning: { bg: '#FFFBEB', text: '#92400E', border: '#FDE68A' },
                      danger: { bg: '#FEF2F2', text: '#991B1B', border: '#FCA5A5' }
                    };
                    const badgeStyle = oeeColors[oeeState];

                    return (
                      <div key={rep.id} style={{
                        backgroundColor: '#FFFFFF',
                        border: '1px solid #E2E8F0',
                        borderRadius: '12px',
                        padding: '14px',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px'
                      }}>
                        {/* Header: Línea y Hora */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{
                              padding: '2px 8px',
                              backgroundColor: '#EFF6FF',
                              border: '1px solid #BFDBFE',
                              borderRadius: '6px',
                              fontSize: '10.5px',
                              fontWeight: 800,
                              color: '#1D4ED8'
                            }}>
                              Línea {rep.lineId}
                            </span>
                            <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>
                              Sup: <strong>{rep.supervisor}</strong>
                            </span>
                          </div>
                          
                          <span style={{
                            padding: '3px 8px',
                            backgroundColor: badgeStyle.bg,
                            border: `1px solid ${badgeStyle.border}`,
                            color: badgeStyle.text,
                            borderRadius: '20px',
                            fontSize: '10.5px',
                            fontWeight: 800
                          }}>
                            OEE: {rep.oee}%
                          </span>
                        </div>

                        {/* Contenido: SKU y Detalle */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', borderTop: '1px solid #F1F5F9', paddingTop: '8px' }}>
                          <span style={{ fontSize: '10px', color: '#94A3B8', fontWeight: 800, textTransform: 'uppercase' }}>SKU Producido</span>
                          <span style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>{rep.sku}</span>
                        </div>

                        {/* Grid de KPIs */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', backgroundColor: '#F8FAFC', padding: '8px 10px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', textAlign: 'center' }}>
                            <span style={{ fontSize: '8px', color: '#64748B', fontWeight: 800 }}>DISPO.</span>
                            <span style={{ fontSize: '11px', fontWeight: 800, color: '#1E293B' }}>{rep.availability || 0}%</span>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', textAlign: 'center', borderLeft: '1px solid #E2E8F0', borderRight: '1px solid #E2E8F0' }}>
                            <span style={{ fontSize: '8px', color: '#64748B', fontWeight: 800 }}>RENDI.</span>
                            <span style={{ fontSize: '11px', fontWeight: 800, color: '#1E293B' }}>{rep.performance || 0}%</span>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', textAlign: 'center' }}>
                            <span style={{ fontSize: '8px', color: '#64748B', fontWeight: 800 }}>CALIDAD</span>
                            <span style={{ fontSize: '11px', fontWeight: 800, color: '#1E293B' }}>{rep.quality || 0}%</span>
                          </div>
                        </div>

                        {/* Paros y Mermas */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#475569', fontWeight: 600 }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{ color: '#EF4444' }}>⚠</span> Paros: <strong>{rep.totalParoMinutes} min</strong>
                          </span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{ color: '#F59E0B' }}>🗑</span> Mermas: <strong>{rep.totalMermas} pzs</strong>
                          </span>
                        </div>

                        {/* Footer: timestamp */}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', fontSize: '8.5px', color: '#94A3B8', borderTop: '1px solid #F1F5F9', paddingTop: '6px', fontWeight: 500 }}>
                          Cerrado el: {new Date(rep.closedAt).toLocaleString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit', day: '2-digit', month: '2-digit' })}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* COLUMNA B: Registro de SKU Finalizados y Limpiezas */}
            <div>
              <SectionHeaderTitle style={{ marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '13px' }}>🔄</span>
                <span>Registro de SKUs Finalizados y Setup</span>
              </SectionHeaderTitle>

              <div style={{
                backgroundColor: '#FFFFFF',
                border: '1px solid #E2E8F0',
                borderRadius: '12px',
                padding: '16px',
                boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
                maxHeight: '420px',
                overflowY: 'auto'
              }}>
                {skuEvents.length === 0 ? (
                  <div style={{
                    textAlign: 'center',
                    padding: '32px 20px',
                    color: '#94A3B8',
                    fontSize: '11px',
                    border: '1px dashed #CBD5E1',
                    borderRadius: '8px'
                  }}>
                    No se han registrado eventos de cambio de orden en este turno.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', position: 'relative', paddingLeft: '12px', borderLeft: '2px solid #E2E8F0' }}>
                    {skuEvents.map(evt => (
                      <div key={evt.id} style={{ position: 'relative', textAlign: 'left' }}>
                        {/* Indicador de nodo */}
                        <div style={{
                          position: 'absolute',
                          left: '-18px',
                          top: '2px',
                          width: '10px',
                          height: '10px',
                          borderRadius: '50%',
                          backgroundColor: '#F59E0B',
                          border: '2px solid #FFFFFF',
                          boxShadow: '0 0 0 2px #FDE68A'
                        }} />
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                            <strong style={{ fontSize: '11.5px', color: '#1E293B' }}>
                              Orden Terminada en Línea {evt.lineId}
                            </strong>
                            <span style={{ fontSize: '9px', color: '#94A3B8', fontWeight: 600 }}>
                              {new Date(evt.timestamp).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <span style={{ fontSize: '11px', color: '#475569', fontWeight: 500 }}>
                            El SKU <strong style={{ color: '#D97706', fontFamily: 'monospace' }}>{evt.sku}</strong> finalizó su producción y la línea inició fase de Limpieza y Setup.
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            
          </div>


        </TabContentContainer>
      )}

      {currentTab === 'SUGERENCIAS' && (
        <TabContentContainer id="tab-coordinador-sugerencias">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <SuggestionsGrid>
              {/* PANEL DE SUGERENCIAS DE CAMBIO Y ROTACIÓN POR DÉFICIT */}
              <div id="coordinador-deficit-sugerencias">
                <SectionHeaderTitle>
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M16 3h5v5M8 21H3v-5M12 12l9-9M12 12l-9 9"/>
                  </svg>
                  <span>Sugerencias de Cobertura por Déficits Activos</span>
                </SectionHeaderTitle>

                {deficitSuggestions.filter(s => s.worker != null).length > 0 && (
                  <ApplyAllButton
                    onClick={handleApplyAllSuggestions}
                    disabled={applyingAll}
                    id="apply-all-suggestions-btn"
                    style={{ marginBottom: '10px' }}
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

                {deficitSuggestions.length === 0 ? (
                  <EmptyStateCard id="no-deficit-suggestions">
                    <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#10B981' }} />
                    <span>Todas las celdas requeridas por SKU están cubiertas.</span>
                  </EmptyStateCard>
                ) : (
                  <SuggestionsListContainer>
                    {deficitSuggestions.map(sug => {
                      const isVacantOnly = sug.type === "NINGUNO";
                      const isPool = sug.type === "POOL";
                      const isBolson = sug.type === "BOLSON";
                      const isRotation = sug.type === "ROTACION";

                      return (
                        <SuggestionListItem key={sug.id}>
                          {/* Izquierda: Línea y puesto */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: '110px' }}>
                            <span style={{ fontSize: '9px', fontWeight: 800, color: '#2563EB', textTransform: 'uppercase' }}>
                              Línea {sug.slot.lineId}
                            </span>
                            <strong style={{ fontSize: '12px', color: '#1E293B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '140px' }} title={sug.slot.puestoName}>
                              {sug.slot.puestoName}
                            </strong>
                          </div>

                          {/* Centro: Operario sugerido */}
                          <div style={{ display: 'flex', flex: 1, flexDirection: 'column', gap: '2px', paddingLeft: '8px', minWidth: 0, overflow: 'hidden' }}>
                            {sug.worker ? (
                              <>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, overflow: 'hidden', width: '100%' }}>
                                  <strong style={{ fontSize: '11px', color: '#0F172A', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flexShrink: 1 }} title={sug.worker.name}>{sug.worker.name}</strong>
                                  <span style={{ fontSize: '9px', color: '#64748B', fontFamily: 'monospace', flexShrink: 0 }}>({sug.worker.id})</span>
                                </div>
                                <div style={{ fontSize: '9px', color: isRotation ? '#D97706' : '#2563EB', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {isRotation 
                                    ? `Rotar desde Línea ${sug.originalLineId}`
                                    : isPool 
                                      ? `Pool de Entrada`
                                      : `Bolsón L8`}
                                </div>
                              </>
                            ) : (
                              <span style={{ fontSize: '10px', color: '#94A3B8', fontWeight: 500 }}>
                                Sin candidatos aptos en planta
                              </span>
                            )}
                          </div>

                          {/* Derecha: Botón de acción */}
                          <div style={{ flexShrink: 0 }}>
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
                                style={{ padding: '6px 12px', borderRadius: '6px', fontSize: '10px', height: '28px' }}
                              >
                                {applyingRotationId === sug.slot.id ? (
                                  <span>...</span>
                                ) : (
                                  <span>{isRotation ? "Rotar" : "Asignar"}</span>
                                )}
                              </SuggestionActionButton>
                            )}
                          </div>
                        </SuggestionListItem>
                      );
                    })}
                  </SuggestionsListContainer>
                )}
              </div>

              {/* COLUMNA DERECHA: ALERTAS DE FATIGA Y BITÁCORA / RESUMEN PLAN */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {viewDay === 'TODAY' ? (
                  <>
                    {/* ALERTAS DE FATIGA */}
                    <div id="coordinador-fatiga-sugerencias">
                      <SectionHeaderTitle>
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2.5">
                          <circle cx="12" cy="12" r="10"/>
                          <polyline points="12 6 12 12 16 14"/>
                        </svg>
                        <span>Alertas de Fatiga Ergonómica Activas</span>
                      </SectionHeaderTitle>

                      {plantAlerts.filter(a => a.type === "fatigue").length === 0 ? (
                        <EmptyStateCard id="no-fatigue-alerts">
                          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                          <span>Todos los trabajadores dentro del límite ergonómico.</span>
                        </EmptyStateCard>
                      ) : (
                        <FatigueAlertsList>
                          {plantAlerts.filter(a => a.type === "fatigue").map(a => (
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
                          ))}
                        </FatigueAlertsList>
                      )}
                    </div>

                    {/* BITÁCORA Y ALERTAS GLOBALES */}
                    <div id="coordinador-bitacora-sugerencias">
                      <SectionHeaderTitle>
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2.5">
                          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0"/>
                        </svg>
                        <span>Bitácora de Relevos y Alertas Globales</span>
                      </SectionHeaderTitle>

                      {plantAlerts.length === 0 ? (
                        <EmptyStateCard id="no-global-alerts">
                          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                          <span>Sin incidentes en planta. Todas las líneas operan normal.</span>
                        </EmptyStateCard>
                      ) : (
                        <AlertasContainer id="plant-alerts-log">
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
                        </AlertasContainer>
                      )}
                    </div>
                  </>
                ) : (
                  /* DÍA SIGUIENTE: SOLO RESUMEN DEL PLAN DE MAÑANA (SIN DUPLICADO DE SHEETS) */
                  <div id="coordinador-next-day-resumen">
                    <SectionHeaderTitle>
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2.5">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                        <line x1="16" y1="2" x2="16" y2="6"/>
                        <line x1="8" y1="2" x2="8" y2="6"/>
                        <line x1="3" y1="10" x2="21" y2="10"/>
                      </svg>
                      <span>Resumen del Plan (Día Siguiente)</span>
                    </SectionHeaderTitle>

                    {(() => {
                      const nextPlan = configDocs["next_day_plan"];
                      if (!nextPlan) {
                        return (
                          <EmptyStateCard id="no-next-day-plan">
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2.5">
                              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                            </svg>
                            <span>Genera la planificación en el Mapa para ver estadísticas.</span>
                          </EmptyStateCard>
                        );
                      }
                      const totalDeficits = nextPlan.deficits ? Object.values(nextPlan.deficits).reduce((a, b) => a + b, 0) : 0;
                      const activeSku = nextPlan.skuPlan || {};
                      const activeLinesCount = Object.keys(activeSku).filter(l => activeSku[l] !== "INACTIVO").length;

                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', backgroundColor: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '14px' }}>
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
                  </div>
                )}
              </div>
            </SuggestionsGrid>
          </div>
        </TabContentContainer>
      )}

      {currentTab === 'CONTROL' && (() => {
        const lineColors = { L1: "#DBEAFE", L2: "#D1FAE5", L3: "#F3E8FF", L4: "#FEE2E2", L5: "#FEF9C3", L6: "#E0E7FF", L7: "#FCE7F3" };
        const supervisorsList = REAL_SUPERVISORS.map(sup => {
          const assignedEntry = Object.entries(supervisors).find(([, val]) => val?.workerId === sup.id);
          const lineId = assignedEntry ? assignedEntry[0] : null;
          const initials = sup.shortName.split(' ').map(w => w[0]).join('').toUpperCase();
          return {
            id: sup.id,
            name: sup.shortName,
            initial: initials,
            line: lineId ? `Línea ${lineId}` : "Sin Asignar",
            color: lineId ? (lineColors[lineId] || "#F1F5F9") : "#F1F5F9",
            isAssigned: !!lineId
          };
        });

        return (
          <TabContentContainer id="tab-coordinador-control">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
              {/* CONTROL DE ARRANQUE — Solo visible en vista HOY */}
              {viewDay === 'TODAY' ? (
                <div id="master-start-card">
                  <SectionHeaderTitle style={{ justifyContent: 'space-between', width: '100%', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <polygon points="5 3 19 12 5 21 5 3"/>
                      </svg>
                      <span>Control Maestro del Turno</span>
                    </div>
                    {shiftActive && (
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', backgroundColor: '#DCFCE7', padding: '4px 10px', borderRadius: '20px', fontSize: '9px', fontWeight: 700, color: '#16A34A', border: '1px solid #BBF7D0', textTransform: 'none', letterSpacing: 'normal', height: '18px' }}>
                        <LiveIndicator />
                        <span>LIVE</span>
                      </div>
                    )}
                  </SectionHeaderTitle>

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
                      gap: '6px'
                    }}>
                      <span>⚠️</span>
                      <span>Arranque de turno pendiente desde piso por los supervisores.</span>
                    </div>
                  )}

                  {shiftActive && (
                    <ActiveShiftDashboard style={{ marginTop: '0px' }}>
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
                </div>
              ) : (
                <div id="master-start-card-disabled">
                  <SectionHeaderTitle>
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                      <line x1="16" y1="2" x2="16" y2="6"/>
                      <line x1="8" y1="2" x2="8" y2="6"/>
                      <line x1="3" y1="10" x2="21" y2="10"/>
                    </svg>
                    <span>Control de Turno (No Disponible)</span>
                  </SectionHeaderTitle>
                  <div style={{ 
                    padding: '20px 14px', 
                    color: '#94A3B8', 
                    fontSize: '11px', 
                    textAlign: 'center', 
                    border: '1px solid #E2E8F0', 
                    backgroundColor: '#F8FAFC',
                    borderRadius: '12px', 
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
                    <span>El control de arranque de turno solo está disponible en la vista <strong style={{ color: '#64748B' }}>Hoy (En Vivo)</strong>. Cambia al selector de línea temporal para gestionar el turno actual.</span>
                  </div>
                </div>
              )}

              {/* LISTA RÁPIDA DE ASIGNACIÓN DE SUPERVISORES */}
              <div style={{ height: 'fit-content' }}>
                <SectionHeaderTitle>
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"/>
                  </svg>
                  <span>Asignar Supervisores a Líneas</span>
                </SectionHeaderTitle>
                
                <SupervisorVerticalList>
                  {supervisorsList.map(sup => (
                    <SupervisorListItem key={sup.id}>
                      {/* Izquierda: Iniciales en texto plano en $sizeMeta y color $textSecondary */}
                      <span style={{ fontSize: '11px', color: '#475569', width: '24px', flexShrink: 0, fontWeight: 600 }}>
                        {sup.initial}
                      </span>
                      {/* Centro: Nombre completo, fontSize $sizeBody, fontWeight $weightSemibold */}
                      <span style={{ flexGrow: 1, fontSize: '14px', fontWeight: 600, color: '#0F172A' }}>
                        {sup.name}
                      </span>
                      {/* Derecha: Línea asignada como chip compacto */}
                      <SupervisorLineChip>
                        {sup.line}
                      </SupervisorLineChip>
                    </SupervisorListItem>
                  ))}
                </SupervisorVerticalList>
              </div>
            </div>
          </TabContentContainer>
        );
      })()}

      {currentTab === 'AUSENTES' && (
        <TabContentContainer id="tab-coordinador-ausentes">


          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
            {/* PANEL DE CONTROL DE AUSENCIAS */}
            <div>
              <SectionHeaderTitle>
                <span style={{ fontSize: '14px' }}>📋</span>
                <span>Listado de Personal Ausente y Bajas de Turno</span>
              </SectionHeaderTitle>
              
              <AbsentListContainer style={{ maxHeight: '450px', overflowY: 'auto', paddingRight: '4px' }}>
                {(() => {
                  const absentWorkers = Object.values(workers).filter(w => 
                    ["VACACIONES", "PERMISOS", "CONSULTAS_MEDICAS", "SUBSIDIOS", "ACCIDENTE_LABORAL", "INACTIVO"].includes(w.status?.toUpperCase())
                  );

                  if (absentWorkers.length === 0) {
                    return (
                      <div style={{ padding: '30px 12px', color: '#94A3B8', fontSize: '11px', textAlign: 'center', border: '1px dashed #E2E8F0', borderRadius: '8px', margin: '12px' }}>
                        ¡Todo el personal se encuentra presente o asignado en planta!
                      </div>
                    );
                  }

                  const getInitials = (name) => {
                    if (!name) return "";
                    const parts = name.trim().split(/\s+/);
                    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
                    return (parts[0][0] + (parts[1]?.[0] || "")).toUpperCase();
                  };

                  const getBadgeStyles = (status) => {
                    const s = status?.toUpperCase();
                    if (s === "VACACIONES") {
                      return { bg: 'var(--colors-warningBg)', color: 'var(--colors-warningBorder)' };
                    }
                    if (s === "PERMISOS") {
                      return { bg: 'var(--colors-infoBg)', color: 'var(--colors-infoBorder)' };
                    }
                    if (s === "CONSULTAS_MEDICAS") {
                      return { bg: 'var(--colors-transitBg)', color: 'var(--colors-transitBorder)' };
                    }
                    if (s === "SUBSIDIOS" || s === "ACCIDENTE_LABORAL") {
                      return { bg: 'var(--colors-dangerBg)', color: 'var(--colors-dangerBorder)' };
                    }
                    return { bg: 'var(--colors-border)', color: 'var(--colors-textSecondary)' };
                  };

                  return absentWorkers.map(w => {
                    const statusUpper = w.status?.toUpperCase() || "INACTIVO";
                    const badge = getBadgeStyles(statusUpper);

                    // Derivar sexo
                    const wSex = w.sexo || (
                      w.name.includes("María") || w.name.includes("Elena") || w.name.includes("Sofía") || w.name.includes("Teresa") || w.name.includes("Lucía") || w.name.includes("Laura") || w.name.includes("Carmen") || w.name.includes("Patricia") || w.name.includes("Isabel")
                        ? "Femenino" 
                        : "Masculino"
                    );

                    return (
                      <AbsentListItem key={w.id}>
                        <AbsentAvatar style={{ backgroundColor: badge.bg, color: badge.color }}>
                          {getInitials(w.name)}
                        </AbsentAvatar>

                        <div style={{ flex: 1, minWidth: 0, paddingLeft: '8px' }}>
                          <strong style={{ fontSize: '12px', color: 'var(--colors-textPrimary)', display: 'block', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                            {w.name}
                          </strong>
                          <span style={{ fontSize: '10px', color: 'var(--colors-textSecondary)', display: 'block', marginTop: '1px' }}>
                            {w.role} • {wSex}
                          </span>
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
                              padding: '3px 18px 3px 8px',
                              borderRadius: '16px',
                              border: 'none',
                              fontSize: '9.5px',
                              fontWeight: 700,
                              color: badge.color,
                              backgroundColor: badge.bg,
                              outline: 'none',
                              cursor: 'pointer',
                              backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23475569' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'></polyline></svg>")`,
                              backgroundRepeat: 'no-repeat',
                              backgroundPosition: 'right 6px center',
                              backgroundSize: '8px',
                              WebkitAppearance: 'none',
                              MozAppearance: 'none',
                              appearance: 'none'
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
                      </AbsentListItem>
                    );
                  });
                })()}
              </AbsentListContainer>
            </div>

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
                <label style={{ fontSize: '10px', fontWeight: 700, color: '#475569' }}>Seleccionar Supervisor</label>
                <select
                  value={tempSupervisorName}
                  onChange={(e) => setTempSupervisorName(e.target.value)}
                  style={{
                    padding: '10px 10px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    fontSize: '12px',
                    outline: 'none',
                    width: '100%',
                    boxSizing: 'border-box',
                    backgroundColor: '#FFFFFF',
                    cursor: 'pointer',
                    fontWeight: 600,
                    color: '#1E293B'
                  }}
                  id="supervisor-select-field"
                >
                  <option value="">── Sin Asignar ──</option>
                  {availableSupervisors.map(sup => (
                    <option 
                      key={sup.id} 
                      value={sup.id}
                      style={{ 
                        color: sup.isAvailable ? '#1E293B' : '#94A3B8',
                        fontWeight: sup.isAvailable ? 600 : 400
                      }}
                    >
                      {sup.shortName}{sup.assignedLine && sup.assignedLine !== editingLineId ? ` (en ${sup.assignedLine})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Info card del supervisor seleccionado */}
              {tempSupervisorName && (() => {
                const sel = REAL_SUPERVISORS.find(s => s.id === tempSupervisorName);
                if (!sel) return null;
                const existing = availableSupervisors.find(s => s.id === sel.id);
                return (
                  <div style={{
                    padding: '8px 12px',
                    backgroundColor: existing?.isAvailable ? '#F0FDF4' : '#FEF3C7',
                    border: `1px solid ${existing?.isAvailable ? '#BBF7D0' : '#FCD34D'}`,
                    borderRadius: '8px',
                    fontSize: '10px',
                    color: existing?.isAvailable ? '#166534' : '#92400E',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2px'
                  }}>
                    <strong>{sel.name}</strong>
                    {existing?.assignedLine && existing.assignedLine !== editingLineId ? (
                      <span>⚠ Actualmente asignado a {existing.assignedLine}. Se moverá a {editingLineId}.</span>
                    ) : (
                      <span>✓ Disponible para asignación</span>
                    )}
                  </div>
                );
              })()}
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

      {/* --- MODAL GESTIÓN DE PERSONAL AUTORIZADO (SUPERVISORES EN NÓMINA) --- */}
      {showAuthSupervisorsModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.6)',
          backdropFilter: 'blur(4px)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px'
        }}>
          <div style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '16px',
            padding: '24px',
            maxWidth: '580px',
            width: '100%',
            maxHeight: '85vh',
            overflowY: 'auto',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            border: '1px solid #E2E8F0'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', borderBottom: '1px solid #E2E8F0', paddingBottom: '12px' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#1E293B' }}>👥 Gestión de Personal Autorizado (Supervisores)</h2>
                <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: '#64748B' }}>
                  Administración en tiempo real de la colección <code>personal_autorizado</code> en Firestore. Alta y baja sin tocar código ni redeploy de Cloud Functions.
                </p>
              </div>
              <button 
                onClick={() => setShowAuthSupervisorsModal(false)}
                style={{ background: 'none', border: 'none', fontSize: '18px', fontWeight: 'bold', cursor: 'pointer', color: '#64748B', padding: '4px' }}
              >✕</button>
            </div>

            {/* Formulario de Alta */}
            <form onSubmit={handleAddAuthorizedSupervisor} style={{
              backgroundColor: '#F8FAFC',
              padding: '14px',
              borderRadius: '12px',
              border: '1px solid #E2E8F0',
              marginBottom: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px'
            }}>
              <strong style={{ fontSize: '12px', color: '#1E293B' }}>+ Dar de Alta Nuevo Supervisor en Nómina</strong>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                <div>
                  <label style={{ fontSize: '10px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '2px' }}>ID / Ficha *</label>
                  <input 
                    type="text"
                    placeholder="ej. WORKER_99999"
                    value={newSupWorkerId}
                    onChange={e => setNewSupWorkerId(e.target.value)}
                    required
                    style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '11px', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '10px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '2px' }}>Nombre Completo *</label>
                  <input 
                    type="text"
                    placeholder="Nombre Completo"
                    value={newSupName}
                    onChange={e => setNewSupName(e.target.value)}
                    required
                    style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '11px', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '10px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '2px' }}>Nombre Corto</label>
                  <input 
                    type="text"
                    placeholder="ej. Juan P."
                    value={newSupShortName}
                    onChange={e => setNewSupShortName(e.target.value)}
                    style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '11px', boxSizing: 'border-box' }}
                  />
                </div>
              </div>
              <button 
                type="submit"
                style={{
                  alignSelf: 'flex-end',
                  padding: '6px 14px',
                  backgroundColor: '#16A34A',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                + Dar de Alta
              </button>
            </form>

            {/* Tabla de Supervisores Autorizados */}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#F1F5F9', borderBottom: '2px solid #E2E8F0', textAlign: 'left' }}>
                    <th style={{ padding: '8px' }}>Ficha / ID</th>
                    <th style={{ padding: '8px' }}>Nombre Completo</th>
                    <th style={{ padding: '8px' }}>Nombre Corto</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>Estado / Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {authorizedSupervisors.map(sup => {
                    const id = sup.id || sup.workerId;
                    return (
                      <tr key={id} style={{ borderBottom: '1px solid #E2E8F0' }}>
                        <td style={{ padding: '8px', fontFamily: 'monospace', fontWeight: 700, color: '#2563EB' }}>{id}</td>
                        <td style={{ padding: '8px', fontWeight: 600, color: '#1E293B' }}>{sup.name}</td>
                        <td style={{ padding: '8px', color: '#475569' }}>{sup.shortName || sup.name}</td>
                        <td style={{ padding: '8px', textAlign: 'right' }}>
                          <button
                            onClick={() => handleDeleteAuthorizedSupervisor(id, sup.name)}
                            style={{
                              padding: '4px 8px',
                              backgroundColor: '#FEE2E2',
                              color: '#DC2626',
                              border: '1px solid #FCA5A5',
                              borderRadius: '4px',
                              fontSize: '10px',
                              fontWeight: 700,
                              cursor: 'pointer'
                            }}
                            title="Dar de baja en personal_autorizado"
                          >
                            Dar de Baja
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

    </PanelContainer>
  );
}
