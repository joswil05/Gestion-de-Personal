import React, { useState, useEffect, useMemo } from 'react';
import { styled } from '../styles/theme';
import { 
  db, 
  puestosColl, 
  trabajadoresColl,
  assignWorkerTransaction,
  acceptErgonomicRelevo,
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
  getRelocationDestination
} from '../services/firebaseService';
import { onSnapshot, query, where, getDocs, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import SlotCard from './SlotCard';
import { initializeConnectivityGuard } from '../skills/state-connectivity-guard';
import { triggerNativeHapticFeedback, initializeRearCameraQRScanner } from '../skills/capacitor-android-bridge';
import { Capacitor } from '@capacitor/core';

// --- STITCHES STYLED HUD COMPONENTS ---

// Contenedor principal con espaciado superior normalizado (el Notch es gobernado por el AppViewport global)
const HudContainer = styled('div', {
  padding: '16px 20px calc(100px + env(safe-area-inset-bottom, 0px)) 20px',
  display: 'flex',
  flexDirection: 'column',
  gap: '20px',
  fontFamily: '$sans',
  boxSizing: 'border-box'
});

const LineHeader = styled('div', {
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  padding: '20px 24px',
  backgroundColor: '$card',
  border: '1px solid $border',
  borderRadius: '16px',
  boxShadow: '$elevation2',
  transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
});

const LineHeaderTop = styled('div', {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  width: '100%'
});

const LineHeaderBottom = styled('div', {
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: '8px',
  borderTop: '1px solid $border',
  paddingTop: '12px',
  width: '100%'
});

const HeaderBadge = styled('span', {
  fontSize: '10px',
  fontWeight: 600,
  padding: '5px 12px',
  borderRadius: '8px',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  border: '1px solid $border',
  backgroundColor: '$background',
  color: '$textSecondary',
  boxShadow: '0 1px 2px rgba(0,0,0,0.01)',

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
  fontSize: '10px',
  fontWeight: 700,
  padding: '4px 10px',
  borderRadius: '6px',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  border: '1px solid #C084FC',
  backgroundColor: '#F3E8FF',
  color: '#7E22CE',
  boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
  cursor: 'pointer',
  transition: 'all 0.15s ease',
  minHeight: '24px',

  '&:hover': {
    backgroundColor: '#E9D5FF',
    borderColor: '#A855F7'
  },
  '&:active': {
    transform: 'scale(0.95)'
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

const GridContainer = styled('div', {
  display: 'grid',
  gridTemplateColumns: '1fr',
  gap: '14px'
});

// Botón Flotante Circular (FAB) de 64px de diámetro
const QRFloatingButton = styled('button', {
  position: 'fixed',
  right: '20px',
  bottom: 'calc(80px + env(safe-area-inset-bottom, 0px))', // 64px (TabBar) + 16px (Margen de ergonomía) + Safe Area Bottom
  width: '64px',
  height: '64px',
  borderRadius: '50%',
  backgroundColor: '$accent',
  color: '#FFFFFF',
  border: 'none',
  outline: 'none',
  boxShadow: '0 8px 24px rgba(15, 23, 42, 0.15), 0 2px 4px rgba(0, 0, 0, 0.04)',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 900,
  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',

  '&:hover': {
    backgroundColor: '#1D4ED8',
    transform: 'translateY(-2px) scale(1.04)',
    boxShadow: '0 12px 28px rgba(15, 23, 42, 0.18)'
  },
  '&:active': {
    transform: 'translateY(0) scale(0.95)'
  }
});

// Modal del escáner con desenfoque de fondo premium
const ScannerOverlay = styled('div', {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(15, 23, 42, 0.9)',
  backdropFilter: 'blur(10px)',
  zIndex: 2000,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#FFFFFF',
  fontFamily: '$sans'
});

const ScannerWindow = styled('div', {
  width: '240px',
  height: '240px',
  border: '4px solid $accent',
  borderRadius: '24px',
  position: 'relative',
  boxShadow: '0 0 24px rgba(15, 23, 42, 0.2)',
  marginBottom: '24px',
  overflow: 'hidden',
  backgroundColor: 'rgba(0, 0, 0, 0.2)',

  '&::after': {
    content: '""',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    border: '12px solid rgba(15, 23, 42, 0.5)'
  },

  '&::before': {
    content: '""',
    position: 'absolute',
    left: 0,
    right: 0,
    height: '3px',
    backgroundColor: '#94A3B8',
    boxShadow: 'none',
    animation: 'scanLine 2.5s infinite linear'
  }
});

const ScannerCloseButton = styled('button', {
  padding: '12px 28px',
  backgroundColor: '#334155',
  color: '#FFFFFF',
  border: 'none',
  borderRadius: '8px',
  fontSize: '13px',
  fontWeight: 600,
  cursor: 'pointer',
  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
  transition: 'all 0.1s ease',

  '&:active': {
    transform: 'scale(0.97)',
    backgroundColor: '#475569'
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

  // Estados interactivos para asignaciones y relevos manuales (Cajón Único Dinámico)
  const [selectedSlotId, setSelectedSlotId] = useState(null);
  const [selectedSlotName, setSelectedSlotName] = useState("");
  const [selectedSlotWorker, setSelectedSlotWorker] = useState(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetMode, setSheetMode] = useState('search'); // 'search' | 'confirm' | 'context'
  const [continuousScanMode, setContinuousScanMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
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

  // Helper para buscar candidato de intercambio local compatible en la misma línea (Subcaso B)
  const findLocalSwapCandidate = () => {
    if (!selectedSlotId || !selectedSlotWorker) return null;
    const slotA = slots.find(s => s.id === selectedSlotId);
    if (!slotA) return null;

    // Verificar si el puesto A está fatigado
    const elapsedA = getElapsedMinutes(slotA.asignadoEnSegundoVirtual);
    const isFatiguedA = elapsedA >= 105 || slotA.relevoSolicitado;
    if (!isFatiguedA) return null;

    // Buscar otro puesto B en la misma línea
    for (const slotB of slots) {
      if (slotB.id === slotA.id) continue;
      if (slotB.status !== "ASIGNADO" || !slotB.idWorkerCurrent) continue;

      // Verificar si el puesto B está fatigado
      const elapsedB = getElapsedMinutes(slotB.asignadoEnSegundoVirtual);
      const isFatiguedB = elapsedB >= 105 || slotB.relevoSolicitado;
      if (!isFatiguedB) continue;

      // Restricción: Puestos distintos (no similar base name)
      if (getBaseName(slotA.puestoName) === getBaseName(slotB.puestoName)) continue;

      const workerB = workersMap[slotB.idWorkerCurrent];
      if (!workerB) continue;

      // Compatibilidad cruzada (Aptitud para el puesto del otro)
      if (canWorkerOccupiedSlot(selectedSlotWorker, slotB) && canWorkerOccupiedSlot(workerB, slotA)) {
        return { slotB, workerB };
      }
    }
    return null;
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

  // 1.2 Efecto reactivo para solicitar acceso de hardware a la cámara al abrir el escáner QR
  useEffect(() => {
    let activeStream = null;
    if (scannerOpen && typeof navigator !== 'undefined' && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      console.log("[Lector QR] Solicitando permisos nativos de cámara...");
      navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: { ideal: "environment" } } 
      })
      .then(stream => {
        console.log("[Lector QR] Acceso concedido a la cámara trasera.");
        activeStream = stream;
        const videoEl = document.getElementById('qr-video-feed');
        if (videoEl) {
          videoEl.srcObject = stream;
          videoEl.play().catch(err => console.error("[Lector QR] Error reproduciendo video:", err));
        }
      })
      .catch(err => {
        console.warn("[Lector QR] No se pudo obtener la cámara trasera ideal. Intentando fallback genérico...", err);
        navigator.mediaDevices.getUserMedia({ video: true })
        .then(stream => {
          console.log("[Lector QR] Acceso concedido a la cámara fallback.");
          activeStream = stream;
          const videoEl = document.getElementById('qr-video-feed');
          if (videoEl) {
            videoEl.srcObject = stream;
            videoEl.play().catch(err => console.error("[Lector QR] Error reproduciendo video fallback:", err));
          }
        })
        .catch(camErr => {
          console.error("[Lector QR] Error crítico de permisos de cámara:", camErr);
          setNotification({
            type: 'error',
            message: 'Error de Cámara: Por favor concede permisos de cámara en tu navegador o WebView nativo.'
          });
        });
      });
    }

    return () => {
      if (activeStream) {
        console.log("[Lector QR] Liberando recurso de cámara de hardware...");
        activeStream.getTracks().forEach(track => {
          try { track.stop(); } catch (e) {}
        });
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
    return Object.values(workersMap).filter(w => 
      (w.status === 'POOL_ARRANQUE' || w.status === 'DISPONIBLE_BOLSON') &&
      w.currentSlotId == null
    ).sort((a, b) => a.name.localeCompare(b.name));
  }, [workersMap]);

  // Filtrar operarios disponibles por búsqueda en Drawer
  const filteredWorkers = useMemo(() => {
    return availableWorkers.filter(w => 
      w.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      w.id.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [availableWorkers, searchQuery]);

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
      if (slot.status !== 'ASIGNADO' || !slot.asignadoEnSegundoVirtual) return false;

      // El sistema de fatiga NO aplica para puestos fijos críticos, solo puestos varios
      const esFijo = ["Operador A", "Averiero", "Operador C"].includes(slot.tipoPuesto);
      if (esFijo) return false;

      const t = slot.asignadoEnSegundoVirtual;
      const ms = t.toDate 
        ? t.toDate().getTime() 
        : (t.seconds ? t.seconds * 1000 : new Date(t).getTime());
      const elapsed = Math.max(0, Math.floor((Date.now() - ms) / 60000));
      return elapsed >= 105;
    });
  }, [slots]);

  // 5.8 ALGORITMO SMART MATCHMAKING: Encontrar el puesto más compatible de forma 100% algorítmica
  const findBestSlotForWorker = (worker) => {
    if (!worker) return null;
    
    // Filtrar puestos vacantes de esta línea
    const vacantSlots = slots.filter(s => s.status === 'VACANTE' || s.status === 'ALERTA_VACANTE');
    if (vacantSlots.length === 0) return null;

    // Prioridad 1: Si hay una vacante en esta línea cuyo titular planificado es el operario
    const titularSlot = vacantSlots.find(s => s.idWorkerOriginal === worker.id);
    if (titularSlot && isWorkerRoleCompatibleWithSlot(worker.role, titularSlot.tipoPuesto) && canWorkerOccupiedSlot(worker, titularSlot)) {
      return titularSlot;
    }

    // Prioridad 2: Buscar cualquier otra vacante compatible de forma algorítmica (rol + género + restricciones médicas)
    const compatibleSlot = vacantSlots.find(s => isWorkerRoleCompatibleWithSlot(worker.role, s.tipoPuesto) && canWorkerOccupiedSlot(worker, s));
    if (compatibleSlot) {
      return compatibleSlot;
    }

    return null;
  };

  // 5.9 Procesar lectura exitosa de gafete QR (Único o Continuo)
  const handleScanWorkerSuccess = async (worker) => {
    if (!worker) return;

    let bestSlot = null;
    if (selectedSlotId) {
      const selectedSlot = slots.find(s => s.id === selectedSlotId);
      if (selectedSlot && (selectedSlot.status === 'VACANTE' || selectedSlot.status === 'ALERTA_VACANTE')) {
        const roleCompatible = isWorkerRoleCompatibleWithSlot(worker.role, selectedSlot.tipoPuesto);
        const healthCompatible = canWorkerOccupiedSlot(worker, selectedSlot);
        
        if (roleCompatible && healthCompatible) {
          bestSlot = selectedSlot;
        } else {
          // Si no es compatible, mostramos el error y abortamos sin asignar en orden
          triggerNativeHapticFeedback('error');
          let reason = "";
          if (!roleCompatible) reason = `El rol "${worker.role}" no es compatible con el tipo de puesto "${selectedSlot.tipoPuesto}".`;
          else if (!healthCompatible) reason = `El operario tiene restricciones médicas de esfuerzo físico incompatibles con el puesto.`;
          
          setNotification({
            type: 'error',
            message: `Incompatible: ${worker.name} no cumple las restricciones para el puesto seleccionado "${selectedSlot.puestoName}". ${reason}`
          });
          setScannerOpen(false);
          return;
        }
      }
    }

    if (!bestSlot) {
      bestSlot = findBestSlotForWorker(worker);
    }

    if (!bestSlot) {
      triggerNativeHapticFeedback('error');
      
      // GENERAR DIAGNÓSTICO DETALLADO DE INCOMPATIBILIDAD CON PUESTOS VACANTES
      const vacantSlots = slots.filter(s => s.status === 'VACANTE' || s.status === 'ALERTA_VACANTE');
      const diagnostics = vacantSlots.map(s => {
        // 1. Coincidencia de Rol
        const isRoleCompatible = isWorkerRoleCompatibleWithSlot(worker.role, s.tipoPuesto);

        // 2. Ficha Médica
        const requiresPhysical = s.requiredCapabilities && s.requiredCapabilities.includes("ESFUERZO_FISICO");
        const hasMedicalRestriction = worker.medicalRestrictions && worker.medicalRestrictions.includes("ESFUERZO_FISICO");
        const isMedicalCompatible = !(requiresPhysical && hasMedicalRestriction);

        // 3. Género
        const rawPref = s.sexoPreferente || "Indistinto";
        const normalizedPref = rawPref.trim().toLowerCase();
        const isValidGender = ["masculino", "femenino", "femenina", "masculina"].includes(normalizedPref);
        const preferedSex = isValidGender ? rawPref : "Indistinto";

        let isGenderCompatible = true;
        let wSex = worker.sexo || "Masculino";
        if (preferedSex !== "Indistinto") {
          const normPref = preferedSex.trim().toLowerCase().replace(/a$/, "o");
          const normWSex = wSex.trim().toLowerCase().replace(/a$/, "o");
          isGenderCompatible = (normWSex === normPref);
        }

        // 4. Historial Ergonómico (24h)
        const activityName = s.activityName || s.puestoName;
        const isErgonomicCompatible = !(worker.lastActivity && activityName && worker.lastActivity === activityName);

        // 5. Arranque Aislado (Localización Física en 10 min)
        // Restricción removida a petición del usuario.
        let isLocationCompatible = true;

        return {
          slotId: s.id,
          puestoName: s.puestoName,
          tipoPuesto: s.tipoPuesto,
          isRoleCompatible,
          isMedicalCompatible,
          isGenderCompatible,
          isErgonomicCompatible,
          isLocationCompatible,
          preferedSex,
          requiredCapabilities: s.requiredCapabilities || []
        };
      });

      setDiagnosticsData(diagnostics);
      setDiagnosticsWorker(worker);
      setSheetMode('diagnostics');
      setSheetOpen(true);
      setScannerOpen(false);

      setNotification({
        type: 'error',
        message: `Incompatible: ${worker.name} no cumple las restricciones para ningún puesto libre. Se abrió ficha de diagnóstico.`
      });
      return;
    }

    if (continuousScanMode) {
      // Flujo de Inicio Rápido (QR Continuo) sin cajón de confirmación
      try {
        const res = await assignWorkerTransaction(worker.id, bestSlot.id, supervisorLineId);
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
              message: `Puesto "${bestSlot.puestoName}" cubierto dinámicamente por ${worker.name}.`
            });

            // Verificar si quedan más vacantes en la línea
            const remainingVacant = slots.find(s => (s.status === 'VACANTE' || s.status === 'ALERTA_VACANTE') && s.id !== bestSlot.id);
            if (!remainingVacant) {
              setScannerOpen(false);
              setContinuousScanMode(false);
              setNotification({
                type: 'success',
                message: '🎉 ¡Arranque Completado! Todos los puestos de la línea han sido cubiertos.'
              });
            }
          }
        }
      } catch (err) {
        triggerNativeHapticFeedback('error');
        setNotification({
          type: 'error',
          message: err.message || 'Error en asignación continua.'
        });
      }
    } else {
      // Flujo de Escaneo Único con confirmación
      setSelectedSlotId(bestSlot.id);
      setSelectedSlotName(bestSlot.puestoName);
      setConfirmWorker(worker);
      setSheetMode('confirm');
      setSheetOpen(true);
      setScannerOpen(false);
    }
  };

  // 6. Control del Escáner QR de Hardware (Thumb Zone)
  const handleOpenScanner = async () => {
    triggerNativeHapticFeedback('short');
    setSelectedSlotId(null);
    if (isOffline) {
      setNotification({
        type: 'error',
        message: 'Modo Offline Activo: El escáner QR está inhabilitado por resiliencia de datos.'
      });
      return;
    }

    // Validar si hay puestos vacantes en la línea
    const vacant = slots.find(s => s.status === 'VACANTE' || s.status === 'ALERTA_VACANTE');
    if (!vacant) {
      setNotification({
        type: 'error',
        message: 'Línea Completa: No hay puestos vacantes en esta línea para asignar operarios.'
      });
      return;
    }

    setContinuousScanMode(true); // Activar escaneo continuo de alta velocidad por defecto

    const cameraRes = await initializeRearCameraQRScanner();
    if (cameraRes.success) {
      if (cameraRes.native && cameraRes.scanResult) {
        const typedId = cameraRes.scanResult.trim().toUpperCase();
        const worker = workersMap[typedId];
        if (worker) {
          await handleScanWorkerSuccess(worker);
          // Si quedan vacantes, gatillar de nuevo para mantener la cámara nativa abierta de forma continua
          const nextVacant = slots.find(s => s.status === 'VACANTE' || s.status === 'ALERTA_VACANTE');
          if (nextVacant) {
            setTimeout(() => {
              handleOpenScanner();
            }, 600);
          }
        } else {
          setNotification({ 
            type: 'error', 
            message: `No se encontró ningún operario libre con la Ficha decodificada: ${typedId}` 
          });
        }
      } else if (!cameraRes.native) {
        // Fallback a visor simulado web
        setScannerOpen(true);
      }
    }
  };

  const handleCloseScanner = () => {
    triggerNativeHapticFeedback('short');
    setScannerOpen(false);
    setContinuousScanMode(false);
  };

  // 6.2 Inicio Rápido (Escaneo Secuencial Continuo)
  const handleStartContinuousScan = async () => {
    triggerNativeHapticFeedback('short');
    setSelectedSlotId(null);
    if (isOffline) {
      setNotification({
        type: 'error',
        message: 'Modo Offline: El inicio rápido QR está inhabilitado sin conexión a red.'
      });
      return;
    }

    const vacant = slots.find(s => s.status === 'VACANTE' || s.status === 'ALERTA_VACANTE');
    if (!vacant) {
      setNotification({
        type: 'error',
        message: 'Línea Completa: Todos los puestos operacionales ya se encuentran ocupados.'
      });
      return;
    }

    setContinuousScanMode(true);
    
    const cameraRes = await initializeRearCameraQRScanner();
    if (cameraRes.success) {
      if (cameraRes.native && cameraRes.scanResult) {
        const typedId = cameraRes.scanResult.trim().toUpperCase();
        const worker = workersMap[typedId];
        if (worker) {
          await handleScanWorkerSuccess(worker);
          // Si quedan vacantes, gatillar de nuevo
          const nextVacant = slots.find(s => s.status === 'VACANTE' || s.status === 'ALERTA_VACANTE');
          if (nextVacant) {
            setTimeout(() => {
              handleStartContinuousScan();
            }, 600);
          }
        } else {
          setNotification({ 
            type: 'error', 
            message: `No se encontró ningún operario libre con la Ficha decodificada: ${typedId}` 
          });
        }
      } else if (!cameraRes.native) {
        // Fallback a visor simulado web
        setScannerOpen(true);
      }
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

  // 11. Transacción: Confirmar Arribo Físico de operario en tránsito
  const handleOpenTransitConfirm = (worker) => {
    triggerNativeHapticFeedback('short');
    setTransitConfirmWorker(worker);
    
    // Obtener los puestos vacantes actuales en la línea del supervisor
    const vacantes = slots.filter(s => s.status === 'VACANTE' || s.status === 'ALERTA_VACANTE');
    
    // Si el operario viene para un puesto específico (targetSlotId), lo incluimos de primero (aun si está ocupado/ASIGNADO)
    if (worker.targetSlotId) {
      const targetSlot = slots.find(s => s.id === worker.targetSlotId);
      if (targetSlot && !vacantes.some(s => s.id === targetSlot.id)) {
        vacantes.unshift(targetSlot);
      }
    }
    setVacantSlotsList(vacantes);
  };

  const handleExecuteTransitArrival = async (slotId) => {
    if (!transitConfirmWorker || !slotId) return;
    triggerNativeHapticFeedback('short');
    
    const workerId = transitConfirmWorker.id;
    const targetSlotId = transitConfirmWorker.targetSlotId;
    setTransitConfirmWorker(null);
    
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
        message: `¡Recepción Confirmada! Operario ${workersMap[workerId]?.name} asignado en estación.`
      });
    } catch (err) {
      triggerNativeHapticFeedback('error');
      setNotification({
        type: 'error',
        message: err.message || 'Error al consolidar arribo.'
      });
    }
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
        <LineHeader style={{ 
          border: allSlotsAssigned ? '1.5px solid #22C55E' : '1.5px solid #F59E0B', 
          backgroundColor: allSlotsAssigned ? '#F0FDF4' : '#FFFBEB', 
          marginBottom: '16px',
          boxShadow: allSlotsAssigned ? '0 4px 12px rgba(34, 197, 94, 0.08)' : '0 4px 12px rgba(245, 158, 11, 0.08)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ 
              width: '36px', 
              height: '36px', 
              borderRadius: '8px', 
              backgroundColor: allSlotsAssigned ? '#DCFCE7' : '#FEF3C7', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              fontSize: '18px'
            }}>
              {allSlotsAssigned ? "🚀" : "⏳"}
            </div>
            <div>
              <strong style={{ fontSize: '13px', color: allSlotsAssigned ? '#14532D' : '#92400E', display: 'block', fontWeight: 800 }}>
                {allSlotsAssigned 
                  ? `Línea ${supervisorLineId} ── ¡Asignación Completa y Lista!`
                  : `Línea ${supervisorLineId} en Preparación ── Completa los puestos`
                }
              </strong>
              <span style={{ fontSize: '10.5px', color: allSlotsAssigned ? '#166534' : '#B45309', fontWeight: 500 }}>
                {allSlotsAssigned 
                  ? "Todos los puestos han sido asignados correctamente. Presiona el botón de abajo para oficializar el arranque."
                  : `Asigna a los operarios escaneándolos o manualmente. Faltan ${totalSlotsCount - assignedSlotsCount} celdas por dotar (Asignadas: ${assignedSlotsCount}/${totalSlotsCount}).`
                }
              </span>
            </div>
          </div>
          <button
            disabled={!allSlotsAssigned}
            onClick={async () => {
              triggerNativeHapticFeedback('confirm');
              try {
                // 1. Intentar cargar el programa de producción real de hoy desde Firestore
                const todayStr = new Date().toISOString().split('T')[0];
                const realOrders = await getProgramaProduccionPorFecha(todayStr);
                
                // 2. Buscar el SKU correspondiente a esta línea
                const matchOrder = realOrders.find(o => o.lineaId === supervisorLineId);
                const skuToUse = matchOrder ? matchOrder.item : (sku && sku !== "SIN SKU" && sku !== "SIN PLANIFICAR" ? sku : "SKU-990-BOST");

                // 3. Ejecutar arranque oficial localizado sin sobreescribir las celdas ya asignadas
                await startLineOfficially(supervisorLineId, skuToUse);
                triggerNativeHapticFeedback('confirm');
                alert(`¡Línea ${supervisorLineId} Iniciada! La jornada laboral ha comenzado oficialmente en el piso.`);
              } catch (err) {
                triggerNativeHapticFeedback('error');
                alert(`Error al iniciar la línea: ${err.message}`);
              }
            }}
            style={{
              marginTop: '10px',
              padding: '12px 16px',
              backgroundColor: allSlotsAssigned ? '#16A34A' : '#D1D5DB',
              backgroundImage: allSlotsAssigned ? 'linear-gradient(135deg, #22C55E 0%, #16A34A 100%)' : 'none',
              color: allSlotsAssigned ? '#FFFFFF' : '#9CA3AF',
              border: 'none',
              borderRadius: '10px',
              fontSize: '11.5px',
              fontWeight: 800,
              cursor: allSlotsAssigned ? 'pointer' : 'not-allowed',
              boxShadow: allSlotsAssigned ? '0 4px 12px rgba(22, 163, 74, 0.25)' : 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              transition: 'all 0.2s ease',
              width: '100%'
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
            <span>
              {allSlotsAssigned 
                ? `Iniciar Línea ${supervisorLineId}`
                : `Faltan Puestos por Asignar (${assignedSlotsCount}/${totalSlotsCount})`
              }
            </span>
          </button>
        </LineHeader>
      )}

      {/* Encabezado del HUD de la línea */}
      <LineHeader>
        <LineHeaderTop>
          <LineTitle>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 20h20"/>
              <path d="m5 17 2-3 2 3"/>
              <path d="m11 17 2-3 2 3"/>
              <path d="m17 17 2-3 2 3"/>
              <path d="M12 4V2"/>
              <path d="M12 10V8"/>
            </svg>
            <span>Línea Activa: <strong>{supervisorLineId}</strong></span>
          </LineTitle>
          <StatusIndicator online={!isOffline} id="network-status-badge">
            <StatusDot online={!isOffline} />
            <span>{!isOffline ? "Conectado" : "Sin Conexión"}</span>
          </StatusIndicator>
        </LineHeaderTop>

        <LineHeaderBottom>
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
              onClick={handleStartContinuousScan}
              title="Iniciar Arranque Rápido Secuencial con QR"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 7V5a2 2 0 0 1 2-2h2" />
                <path d="M17 3h2a2 2 0 0 1 2 2v2" />
                <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
                <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
                <line x1="7" y1="12" x2="17" y2="12" />
              </svg>
              <span>Inicio Rápido (QR Continuo)</span>
            </FastOnboardingQRButton>
          )}
        </LineHeaderBottom>
      </LineHeader>

      {/* 🧠 SMART ACTION FEED (CENTRO DE ALERTAS DE ALTA PRIORIDAD) */}
      <SmartActionFeedContainer id="smart-action-feed">
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

        {transitWorkers.length === 0 && activeFatiguedSlots.length === 0 && (
          <ActionFeedCard 
            variant={lineStatus === "PREPARACION" ? "warning" : (allSlotsAssigned ? "success" : "danger")} 
            id="action-feed-stable"
          >
            {lineStatus === "PREPARACION" ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            ) : allSlotsAssigned ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
                <line x1="12" y1="9" x2="12" y2="13"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
            )}
            <ActionFeedTitle>
              {lineStatus === "PREPARACION" ? (
                <>
                  <strong>Línea en Preparación</strong>
                  <span>Dotación de celdas en proceso ({assignedSlotsCount}/{totalSlotsCount} asignados).</span>
                </>
              ) : allSlotsAssigned ? (
                <>
                  <strong>Línea Estable</strong>
                  <span>Cobertura al 100% y operando con normalidad.</span>
                </>
              ) : (
                <>
                  <strong>Línea con Infracobertura</strong>
                  <span>Faltan puestos por asignar. Cobertura al {totalSlotsCount > 0 ? Math.round((assignedSlotsCount / totalSlotsCount) * 100) : 0}% ({assignedSlotsCount}/{totalSlotsCount}).</span>
                </>
              )}
            </ActionFeedTitle>
          </ActionFeedCard>
        )}
      </SmartActionFeedContainer>

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

      {/* Malla principal de puestos operacionales */}
      <GridContainer id="hud-slots-grid">
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
          slots.map(slot => {
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
          })
        )}
      </GridContainer>

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

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '4px 0' }}>
                  <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>
                    Disponibles en Planta ({filteredWorkers.length})
                  </span>
                  
                  <button
                    onClick={() => {
                      setSheetOpen(false);
                      setScannerOpen(true);
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
                  const isCompatible = confirmWorker && currentSlot && 
                    canWorkerOccupiedSlot(confirmWorker, currentSlot) &&
                    (() => {
                      const wRole = confirmWorker.role.trim().toLowerCase();
                      const sTipo = currentSlot.tipoPuesto.trim().toLowerCase();
                      if (sTipo === "operador a") return wRole === "operador a" || wRole === "operador b";
                      if (sTipo === "averiero") return wRole === "averiero" || wRole === "operador b";
                      if (sTipo === "operador c") return wRole === "operador c" || wRole === "operador b" || wRole === "operador a";
                      if (sTipo === "puesto vario") return ["operario", "operario varios", "auxiliar materiales", "limpieza", "soporte", "nuevos ingresos", "asistente", "rotativo", "operario de patio"].includes(wRole);
                      return wRole === sTipo;
                    })();

                  return (
                    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                      {!isCompatible && (
                        <div style={{ 
                          padding: '10px 12px', 
                          backgroundColor: '#FEF2F2', 
                          border: '1.5px solid #FCA5A5', 
                          borderRadius: '8px', 
                          color: '#991B1B', 
                          fontSize: '11px', 
                          fontWeight: 700,
                          textAlign: 'center',
                          lineHeight: 1.4,
                          marginBottom: '4px'
                        }}>
                          ⚠️ ASIGNACIÓN BLOQUEADA:<br/>
                          El perfil del operario (rol, género o restricciones médicas) es incompatible con los requerimientos técnicos de esta celda operativa.
                        </div>
                      )}
                      <ConfirmButton 
                        onClick={handleConfirmAssignment} 
                        id="modal-confirm-assign-button"
                        disabled={!isCompatible}
                        style={{ 
                          opacity: isCompatible ? 1 : 0.5, 
                          cursor: isCompatible ? 'pointer' : 'not-allowed',
                          backgroundColor: isCompatible ? '#16A34A' : '#94A3B8',
                          backgroundImage: isCompatible ? 'linear-gradient(135deg, #22C55E 0%, #16A34A 100%)' : 'none'
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

                    const swapCandidate = findLocalSwapCandidate();

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
                            onClick={handleRequestErgonomicRelevo}
                            id="menu-request-relevo-button"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M21.5 2v6h-6"/>
                              <path d="M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
                            </svg>
                            <span>{elapsedMinutes >= 105 ? "Pedir Relevo Automático (Motor 3)" : `Pedir Relevo (Activo: ${elapsedMinutes}m)`}</span>
                          </ContextMenuItem>
                        )}

                        {swapCandidate && (
                          <ContextMenuItem
                            variant="purple"
                            onClick={() => handleLocalSwapClick(selectedSlotId, swapCandidate.slotB.id)}
                            style={{ border: '2px solid #8B5CF6', backgroundColor: '#F5F3FF', color: '#6D28D9', fontWeight: 'bold' }}
                            id="menu-local-swap-button"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="m16 3 4 4-4 4"/>
                              <path d="M20 7H4"/>
                              <path d="m8 21-4-4 4-4"/>
                              <path d="M4 17h16"/>
                            </svg>
                            <span>Intercambio Local con {swapCandidate.workerB.name} ({swapCandidate.slotB.puestoName})</span>
                          </ContextMenuItem>
                        )}
                      </>
                    );
                  })()}

                  <ContextMenuItem 
                    variant="primary" 
                    onClick={handleReleaseWorker}
                    id="menu-release-worker-button"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                    </svg>
                    <span>Liberar Operario al Bolsón (L8)</span>
                  </ContextMenuItem>

                  <ContextMenuItem 
                    variant="danger" 
                    onClick={handleTempBajaWorker}
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
      {scannerOpen && (
        <ScannerOverlay id="native-qr-scanner-overlay">
          <ScannerWindow>
            <video 
              id="qr-video-feed"
              autoPlay 
              playsInline 
              muted
              style={{ 
                width: '100%', 
                height: '100%', 
                objectFit: 'cover',
                position: 'absolute',
                top: 0,
                left: 0,
                zIndex: 1
              }} 
            />
          </ScannerWindow>
          <h3 style={{ marginBottom: '6px', fontSize: '18px', fontWeight: 600 }}>
            {continuousScanMode ? "Arranque Continuo por QR" : "Escaneando Gafete QR"}
          </h3>
          <p style={{ color: '#94A3B8', fontSize: '11px', marginBottom: '20px', textAlign: 'center', padding: '0 32px' }}>
            {continuousScanMode 
              ? "Alinee el código QR de la credencial del operario dentro del visor." 
              : "Alinee el código QR de la credencial del trabajador dentro del visor."
            }
          </p>

          {/* Si no estamos en plataforma nativa, renderizamos un simulador web interactivo premium */}
          {!Capacitor.isNativePlatform() && (
            <div style={{
              zIndex: 10,
              marginTop: '10px',
              width: '90%',
              maxWidth: '320px',
              backgroundColor: 'rgba(255, 255, 255, 0.96)',
              borderRadius: '12px',
              padding: '16px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px'
            }}>
              <span style={{ fontSize: '11px', fontWeight: 800, color: '#334155', textTransform: 'uppercase', display: 'block', borderBottom: '1px solid #E2E8F0', paddingBottom: '6px' }}>
                Simulador Web de Gafete QR
              </span>
              <p style={{ fontSize: '10px', color: '#64748B', margin: '0 0 4px 0', lineHeight: 1.4 }}>
                Selecciona un operario presente de esta línea ({supervisorLineId}) para simular el escaneo dinámico de su credencial:
              </p>
              
              {(() => {
                const availableToScan = Object.values(workersMap).filter(w => 
                  (w.status === 'POOL_ARRANQUE' || w.status === 'DISPONIBLE_BOLSON') &&
                  w.currentSlotId == null
                ).sort((a, b) => {
                  const locA = a.physicalLineLocation === supervisorLineId ? 0 : 1;
                  const locB = b.physicalLineLocation === supervisorLineId ? 0 : 1;
                  if (locA !== locB) return locA - locB;
                  return a.name.localeCompare(b.name);
                });

                if (availableToScan.length === 0) {
                  return (
                    <div style={{ fontSize: '11px', color: '#94A3B8', textAlign: 'center', padding: '16px 8px', border: '1px dashed #CBD5E1', borderRadius: '8px', backgroundColor: '#F8FAFC' }}>
                      No quedan operarios sin asignar asociados a la línea {supervisorLineId} en el pool de hoy.
                    </div>
                  );
                }

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '160px', overflowY: 'auto', paddingRight: '4px' }}>
                    {availableToScan.map(worker => (
                      <button
                        key={worker.id}
                        onClick={async () => {
                          await handleScanWorkerSuccess(worker);
                        }}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '8px 10px',
                          backgroundColor: '#F8FAFC',
                          border: '1.5px solid #E2E8F0',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          textAlign: 'left',
                          transition: 'all 0.15s ease',
                          fontSize: '11.5px'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = '#EFF6FF';
                          e.currentTarget.style.borderColor = '#BFDBFE';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = '#F8FAFC';
                          e.currentTarget.style.borderColor = '#E2E8F0';
                        }}
                      >
                        <div>
                          <strong style={{ color: '#1E293B', display: 'block', fontWeight: 700 }}>{worker.name}</strong>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '2px', alignItems: 'center' }}>
                            <span style={{ color: '#64748B', fontSize: '9px', fontFamily: 'monospace', fontWeight: 600 }}>{worker.id}</span>
                            {(() => {
                              const puestoText = worker.puestoTitular || worker.lastActivity || worker.role;
                              return (
                                <span style={{ 
                                  fontSize: '8.5px', 
                                  fontWeight: 700, 
                                  color: '#7C3AED',
                                  backgroundColor: '#F3E8FF',
                                  padding: '1px 5px',
                                  borderRadius: '4px'
                                }}>
                                  🛠️ {puestoText}
                                </span>
                              );
                            })()}
                            <span style={{ 
                              fontSize: '8.5px', 
                              fontWeight: 700, 
                              color: ['Operador A', 'Operador B', 'Operador C', 'Averiero'].includes(worker.role) ? '#0F766E' : '#475569',
                              backgroundColor: ['Operador A', 'Operador B', 'Operador C', 'Averiero'].includes(worker.role) ? '#CCFBF1' : '#F1F5F9',
                              padding: '1px 5px',
                              borderRadius: '4px',
                              textTransform: 'uppercase'
                            }}>{worker.role}</span>
                            <span style={{ 
                              fontSize: '8.5px', 
                              fontWeight: 700, 
                              color: worker.physicalLineLocation === supervisorLineId ? '#15803D' : '#475569',
                              backgroundColor: worker.physicalLineLocation === supervisorLineId ? '#DCFCE7' : '#F1F5F9',
                              padding: '1px 5px',
                              borderRadius: '4px'
                            }}>{worker.physicalLineLocation === supervisorLineId ? '📍 Local' : `📍 Sala/Bolsón (${worker.physicalLineLocation || 'L8'})`}</span>
                            <span style={{ 
                              fontSize: '8.5px', 
                              fontWeight: 600, 
                              color: worker.sexo === 'Masculino' ? '#0369A1' : '#BE185D',
                              backgroundColor: worker.sexo === 'Masculino' ? '#E0F2FE' : '#FCE7F3',
                              padding: '1px 5px',
                              borderRadius: '4px'
                            }}>{worker.sexo || 'Indistinto'}</span>
                            {worker.medicalRestrictions && worker.medicalRestrictions.length > 0 && (
                              <span style={{ 
                                fontSize: '8.5px', 
                                fontWeight: 700, 
                                color: '#991B1B', 
                                backgroundColor: '#FEE2E2', 
                                padding: '1px 5px', 
                                borderRadius: '4px' 
                              }}>⚠️ MED</span>
                            )}
                          </div>
                        </div>
                        <span style={{ fontSize: '10px', color: '#2563EB', fontWeight: 800, backgroundColor: '#DBEAFE', padding: '3px 8px', borderRadius: '6px' }}>
                          Escanear
                        </span>
                      </button>
                    ))}
                  </div>
                );
              })()}
            </div>
          )}

          <ScannerCloseButton onClick={handleCloseScanner} style={{ marginTop: '16px', zIndex: 10 }}>
            {continuousScanMode ? "Finalizar Arranque" : "Cancelar Escaneo"}
          </ScannerCloseButton>
        </ScannerOverlay>
      )}
    </HudContainer>
  );
}
