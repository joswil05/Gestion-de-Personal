import React from 'react';
import { styled, keyframes } from '../styles/theme';
import { MICRO_COPY } from '../skills/ui-saas-master';

// Keyframes para animaciones de fatiga y advertencia (Modo Claro Premium - Sin Emojis)
const pulseYellow = keyframes({
  '0%, 100%': { opacity: 1 },
  '50%': { opacity: 0.5 }
});

const pulseRed = keyframes({
  '0%, 100%': { opacity: 1 },
  '50%': { opacity: 0.3 }
});

const pulseBorderRed = keyframes({
  '0%, 100%': { borderColor: '$border' },
  '50%': { borderColor: '$dangerBorder', boxShadow: '0 0 8px rgba(239, 68, 68, 0.15)' }
});

const pulseBorderYellow = keyframes({
  '0%, 100%': { borderColor: '$border' },
  '50%': { borderColor: '$warningBorder', boxShadow: '0 0 8px rgba(234, 179, 8, 0.1)' }
});

// Tarjeta del Puesto (Rígida a 80px, con desborde oculto y bordes redondeados)
const CardContainer = styled('div', {
  height: '$slotHeight', // Estricto: 80px
  backgroundColor: '$card',
  border: '1px solid $border',
  borderRadius: '10px',
  padding: '14px 20px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  boxSizing: 'border-box',
  fontFamily: '$sans',
  position: 'relative',
  overflow: 'hidden',
  boxShadow: '$subtle',
  transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
  cursor: 'pointer',

  '&:hover': {
    borderColor: '#CBD5E1',
    boxShadow: '$elevation1'
  },
  
  '&:active': {
    transform: 'scale(0.97)',
    boxShadow: '$subtle'
  },

  variants: {
    status: {
      ASIGNADO: {
        borderLeft: '4px solid $accent'
      },
      EN_TRANSITO: {
        backgroundColor: '$transitBg',
        borderLeft: '4px solid $transitBorder'
      },
      DISPONIBLE_BOLSON: {
        backgroundColor: '$successBg',
        borderLeft: '4px solid $successBorder'
      },
      BAJA_TEMPORAL: {
        backgroundColor: '$dangerBg',
        borderLeft: '4px solid $dangerBorder'
      },
      POOL_ARRANQUE: {
        backgroundColor: '$infoBg',
        borderLeft: '4px solid $infoBorder'
      },
      VACANTE: {
        borderLeft: '4px solid #94A3B8',
        borderStyle: 'dashed',
        backgroundColor: '#F8FAFC',
        '&:hover': {
          backgroundColor: '#FFFFFF',
          borderColor: '$accent'
        }
      },
      ALERTA_VACANTE: {
        borderLeft: '4px solid $dangerBorder',
        borderStyle: 'dashed',
        backgroundColor: '$dangerBg',
        '&:hover': {
          backgroundColor: '#FFFFFF',
          borderColor: '$dangerBorder'
        }
      }
    },
    fatigue: {
      NORMAL: {},
      SUGERIDO: {
        animation: `${pulseBorderYellow} 2s infinite`,
        borderLeft: '4px solid $warningBorder !important'
      },
      CRITICO: {
        animation: `${pulseBorderRed} 1s infinite`,
        borderLeft: '4px solid $dangerBorder !important'
      }
    },
    isOffline: {
      true: {
        backgroundImage: '$offlineBg',
        borderColor: '#94A3B8',
        borderLeft: '4px solid #64748B',
        opacity: 0.85
      }
    }
  }
});

// Columna izquierda con información del puesto y operario
const InfoSection = styled('div', {
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  maxWidth: '72%'
});

// Identificación del Puesto
const SlotTitle = styled('div', {
  fontSize: '13px',
  fontWeight: 600,
  color: '$textPrimary',
  marginBottom: '3px',
  display: 'flex',
  alignItems: 'center',
  gap: '6px'
});

// Nombre y rol del operario
const WorkerInfo = styled('div', {
  fontSize: '11px',
  color: '$textSecondary',
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis'
});

// Micro-copia explicativa para transparentar los motores de planta
const ContextMicroCopy = styled('span', {
  fontSize: '10px',
  fontWeight: 500,
  color: '$textSecondary',
  marginTop: '2px',
  fontStyle: 'italic',
  display: 'block',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis'
});

// Columna derecha con acciones y badges
const ActionSection = styled('div', {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-end',
  justifyContent: 'center',
  gap: '4px'
});

// Badge de rol
const RoleBadge = styled('span', {
  fontSize: '9px',
  fontWeight: 700,
  padding: '3px 8px',
  borderRadius: '4px',
  textTransform: 'uppercase',
  backgroundColor: '#FFFFFF',
  color: '$textSecondary',
  border: '1px solid $border',
  letterSpacing: '0.3px',
  boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
});

// Badge de fatiga ergonómica (Modo Claro Premium - Sin Emojis)
const FatigueBadge = styled('span', {
  fontSize: '9px',
  fontWeight: 700,
  padding: '2.5px 7px',
  borderRadius: '4px',
  textTransform: 'uppercase',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  letterSpacing: '0.2px',
  boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
  fontFamily: 'monospace',
  fontVariantNumeric: 'tabular-nums',
  
  variants: {
    state: {
      SUGERIDO: {
        backgroundColor: '$warningBg',
        color: '$warningBorder',
        border: '1px solid $warningBorder',
      },
      CRITICO: {
        backgroundColor: '$dangerBg',
        color: '$dangerBorder',
        border: '1px solid $dangerBorder',
        animation: `${pulseRed} 1s infinite`
      }
    }
  }
});

// Track contenedor de la barra de progreso de fatiga (Absoluto al borde inferior)
const FatigueProgressTrack = styled('div', {
  position: 'absolute',
  bottom: 0,
  left: 0,
  right: 0,
  height: '4px',
  backgroundColor: '#E2E8F0',
});

// Relleno dinámico de la barra de progreso
const FatigueProgressBar = styled('div', {
  height: '100%',
  transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
  
  variants: {
    state: {
      NORMAL: {
        backgroundColor: '$accent',
      },
      SUGERIDO: {
        backgroundColor: '$warningBorder',
      },
      CRITICO: {
        backgroundColor: '$dangerBorder',
      }
    }
  }
});

// Botón de escaneo premium vectorial
const ScanButton = styled('button', {
  padding: '6px 12px',
  fontSize: '11px',
  fontWeight: 600,
  backgroundColor: '$accent',
  color: '#FFFFFF',
  border: 'none',
  borderRadius: '6px',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  boxShadow: '0 2px 4px rgba(15, 23, 42, 0.06)',
  transition: 'all 0.15s ease',

  '&:hover': {
    backgroundColor: '#1D4ED8',
    boxShadow: '0 4px 8px rgba(15, 23, 42, 0.1)'
  }
});

const OfflineBadge = styled('span', {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  fontSize: '10px',
  fontWeight: 700,
  color: '#EF4444',
  backgroundColor: '#FEE2E2',
  padding: '2px 6px',
  borderRadius: '4px',
  border: '1px solid #FCA5A5'
});

const RelevoDirectButton = styled('button', {
  padding: '6px 10px',
  fontSize: '10px',
  fontWeight: 700,
  backgroundColor: '$warningBorder',
  color: '#FFFFFF',
  border: 'none',
  borderRadius: '6px',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  boxShadow: '0 2px 4px rgba(234, 179, 8, 0.15)',
  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
  textTransform: 'uppercase',

  '&:hover': {
    backgroundColor: '#CA8A04',
    boxShadow: '0 4px 8px rgba(234, 179, 8, 0.25)'
  },
  '&:active': {
    transform: 'scale(0.93)'
  }
});

// --- COMPONENT IMPLEMENTATION ---

/**
 * SlotCard Component - Tarjeta de celda operativa del HUD (altura estricta de 80px)
 * Estética: Premium SaaS Light. Prohibido el uso de emojis.
 * 
 * @param {string} slotId Identificador del puesto
 * @param {string} slotName Nombre descriptivo (ej: "Alineadora de SKU")
 * @param {object} worker Datos del trabajador asignado (opcional)
 * @param {string} status Estado del puesto
 * @param {boolean} isOffline Indica si la app está en modo offline (activa UI defensiva)
 * @param {function} onActionClick Callback de interacción (ej: abrir scanner)
 * @param {function} onRelevoClick Callback directo para solicitar relevo ergonómico
 */
export default function SlotCard({ 
  slotId, 
  slotName, 
  worker, 
  status = 'VACANTE', 
  isOffline = false,
  onActionClick,
  onRelevoClick,
  asignadoEnSegundoVirtual,
  tipoPuesto,
  relevoSolicitado = false,
  relevistaInTransit = false
}) {
  const [elapsedMinutes, setElapsedMinutes] = React.useState(0);

  const asignadoTime = React.useMemo(() => {
    if (!asignadoEnSegundoVirtual) return null;
    if (typeof asignadoEnSegundoVirtual.toDate === 'function') {
      return asignadoEnSegundoVirtual.toDate().getTime();
    } else if (asignadoEnSegundoVirtual.seconds) {
      return asignadoEnSegundoVirtual.seconds * 1000;
    } else if (asignadoEnSegundoVirtual.nanoseconds !== undefined) {
      return (asignadoEnSegundoVirtual.seconds || 0) * 1000;
    } else {
      return new Date(asignadoEnSegundoVirtual).getTime();
    }
  }, [asignadoEnSegundoVirtual]);

  React.useEffect(() => {
    if (!asignadoTime || status !== 'ASIGNADO') {
      setElapsedMinutes(0);
      return;
    }

    const calculateElapsed = () => {
      const diffMs = Date.now() - asignadoTime;
      const mins = Math.max(0, Math.floor(diffMs / 60000));
      setElapsedMinutes(mins);
    };

    calculateElapsed();
    const interval = setInterval(calculateElapsed, 5000);
    return () => clearInterval(interval);
  }, [asignadoTime, status]);

  const fatigueState = React.useMemo(() => {
    if (status !== 'ASIGNADO' || !asignadoTime) return 'NORMAL';
    
    // El sistema de fatiga NO aplica para operadores ni supervisores (puestos fijos críticos), solo puestos varios
    const esFijo = ["Operador A", "Averiero", "Operador C"].includes(tipoPuesto);
    if (esFijo) return 'NORMAL';

    if (elapsedMinutes >= 120) return 'CRITICO';
    if (elapsedMinutes >= 105) return 'SUGERIDO';
    return 'NORMAL';
  }, [status, asignadoTime, elapsedMinutes, tipoPuesto]);

  const progressPercentage = React.useMemo(() => {
    if (status !== 'ASIGNADO') return 0;
    const esFijo = ["Operador A", "Averiero", "Operador C"].includes(tipoPuesto);
    if (esFijo) return 0;
    return Math.min(100, (elapsedMinutes / 120) * 100);
  }, [status, elapsedMinutes, tipoPuesto]);

  // Determinar la micro-copia correspondiente al estado y origen
  let displayMicroCopy = "";
  if (isOffline) {
    displayMicroCopy = MICRO_COPY.OFFLINE_PENDING;
  } else if (status === 'ASIGNADO' && worker) {
    if (fatigueState === 'CRITICO') {
      displayMicroCopy = `Exceso de fatiga: ${elapsedMinutes} minutos activo.`;
    } else if (fatigueState === 'SUGERIDO') {
      displayMicroCopy = `Fatiga sugerida: ${elapsedMinutes} minutos activo.`;
    } else if (worker.isReplacement) {
      displayMicroCopy = MICRO_COPY.MOTOR_1_REPLACEMENT;
    } else {
      displayMicroCopy = MICRO_COPY.MOTOR_1_AUTO;
    }
  } else if (status === 'BAJA_TEMPORAL') {
    displayMicroCopy = MICRO_COPY.MOTOR_5_RETURN;
  } else if (status === 'EN_TRANSITO') {
    displayMicroCopy = MICRO_COPY.MOTOR_3_ROTATION;
  } else if (status === 'VACANTE') {
    displayMicroCopy = "Listo para escaneo de ficha o lectura QR.";
  } else if (status === 'ALERTA_VACANTE') {
    displayMicroCopy = "Crítico vacante sin relevo disponible.";
  }

  const esFijoPuesto = ["Operador A", "Averiero", "Operador C"].includes(tipoPuesto);

  return (
    <CardContainer 
      id={`slot-card-${slotId}`}
      status={status} 
      fatigue={status === 'ASIGNADO' && !esFijoPuesto ? fatigueState : 'NORMAL'}
      isOffline={isOffline}
      onClick={() => onActionClick && onActionClick(slotId)}
    >
      <InfoSection>
        <SlotTitle>
          <span>{slotName}</span>
          {isOffline && (
            <OfflineBadge>
              {/* Icono de advertencia vectorial */}
              <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
                <line x1="12" y1="9" x2="12" y2="13"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              <span>Offline</span>
            </OfflineBadge>
          )}
        </SlotTitle>
        
        <WorkerInfo>
          {worker ? (
            <>
              <strong style={{ color: '#0F172A' }}>{worker.name}</strong>
              <span style={{ fontFamily: 'monospace' }}>({worker.id})</span>
            </>
          ) : (
            <span style={{ color: '#94A3B8', fontWeight: 500 }}>Puesto Desocupado</span>
          )}
        </WorkerInfo>

        {displayMicroCopy && (
          <ContextMicroCopy title={displayMicroCopy}>
            {displayMicroCopy}
          </ContextMicroCopy>
        )}
      </InfoSection>

      <ActionSection>
        {worker ? (
          <>
            <RoleBadge>{worker.role}</RoleBadge>
            {relevistaInTransit ? (
              <RelevoDirectButton
                id={`relevo-direct-${slotId}`}
                disabled
                style={{ backgroundColor: '#94A3B8', cursor: 'not-allowed', boxShadow: 'none' }}
              >
                <span>En camino</span>
              </RelevoDirectButton>
            ) : relevoSolicitado ? (
              <RelevoDirectButton
                id={`relevo-direct-${slotId}`}
                disabled
                style={{ backgroundColor: '#D1D5DB', color: '#4B5563', cursor: 'not-allowed', boxShadow: 'none' }}
              >
                <span>Solicitado</span>
              </RelevoDirectButton>
            ) : (fatigueState === 'CRITICO' || fatigueState === 'SUGERIDO' || elapsedMinutes >= 105) ? (
              <RelevoDirectButton
                id={`relevo-direct-${slotId}`}
                disabled
                style={{ backgroundColor: '#D1D5DB', color: '#4B5563', cursor: 'not-allowed', boxShadow: 'none' }}
              >
                <span>Solicitado</span>
              </RelevoDirectButton>
            ) : null}
          </>
        ) : (
          <ScanButton 
            id={`scan-slot-${slotId}-button`}
          >
            {/* Scan Viewfinder Icon */}
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 7V5a2 2 0 0 1 2-2h2" />
              <path d="M17 3h2a2 2 0 0 1 2 2v2" />
              <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
              <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
              <line x1="7" y1="12" x2="17" y2="12" />
            </svg>
            <span>Escanear</span>
          </ScanButton>
        )}
      </ActionSection>

      {status === 'ASIGNADO' && asignadoTime && !esFijoPuesto && (
        <FatigueProgressTrack>
          <FatigueProgressBar 
            state={fatigueState}
            style={{ width: `${progressPercentage}%` }}
          />
        </FatigueProgressTrack>
      )}
    </CardContainer>
  );
}
