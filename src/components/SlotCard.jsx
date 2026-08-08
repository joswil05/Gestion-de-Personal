import React from 'react';
import { styled, keyframes } from '../styles/theme';
import { MICRO_COPY } from '../skills/ui-saas-master';
import { getServerTimeOffset } from '../services/apiService';

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

// Contenedor del Puesto (Fila densa de 64px de alto, sin bordes exteriores, separador inferior)
const CardContainer = styled('div', {
  height: '$listItemHeight', // Estricto: 64px
  backgroundColor: '$card',
  border: 'none',
  borderRadius: 0,
  boxShadow: '$listSeparator', // Separador inferior inset 1px
  padding: '0 16px 0 24px', // Mayor padding a la izquierda para acomodar la barra de estado
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '12px',
  boxSizing: 'border-box',
  fontFamily: '$sans',
  position: 'relative',
  overflow: 'hidden',
  transition: 'background-color 0.2s',
  cursor: 'pointer',

  '&:hover': {
    backgroundColor: '$surfaceHover'
  },
  
  '&:active': {
    backgroundColor: '$surfaceHover'
  },

  '&:last-child': {
    boxShadow: 'none'
  },

  variants: {
    fatigue: {
      NORMAL: {},
      SUGERIDO: {
        animation: `${pulseBorderYellow} 2s infinite`,
      },
      CRITICO: {
        animation: `${pulseBorderRed} 1s infinite`,
      }
    },
    isOffline: {
      true: {
        backgroundImage: '$offlineBg',
        opacity: 0.85
      }
    }
  }
});

// Barra indicadora vertical izquierda (Aspecto nativo premium)
const StatusIndicatorBar = styled('div', {
  position: 'absolute',
  left: 0,
  top: 0,
  bottom: 0,
  width: '5px',
  transition: 'all 0.25s ease',
  
  variants: {
    status: {
      ASIGNADO: {
        backgroundColor: '$accent'
      },
      EN_TRANSITO: {
        backgroundColor: '$transitBorder'
      },
      DISPONIBLE_BOLSON: {
        backgroundColor: '$successBorder'
      },
      BAJA_TEMPORAL: {
        backgroundColor: '$dangerBorder'
      },
      POOL_ARRANQUE: {
        backgroundColor: '$infoBorder'
      },
      VACANTE: {
        backgroundColor: '#94A3B8'
      },
      ALERTA_VACANTE: {
        backgroundColor: '$dangerBorder'
      }
    },
    fatigue: {
      NORMAL: {},
      SUGERIDO: {
        backgroundColor: '$warningBorder !important'
      },
      CRITICO: {
        backgroundColor: '$dangerBorder !important'
      }
    }
  }
});

// ZONA A: Avatar circular con iniciales o placeholder
const AvatarCircle = styled('div', {
  width: '$avatarSize', // 36px
  height: '$avatarSize',
  borderRadius: '50%',
  backgroundColor: '$chipAccentBg',
  color: '$chipAccentText',
  fontSize: '$fonts$sizeMeta',
  fontWeight: '$fonts$weightBold',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0
});

const VacantAvatarCircle = styled('div', {
  width: '$avatarSize', // 36px
  height: '$avatarSize',
  borderRadius: '50%',
  backgroundColor: '#F1F5F9',
  color: '#94A3B8',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0
});

// ZONA B: Información del puesto
const InfoSection = styled('div', {
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  flex: 1,
  padding: '0 12px',
  minWidth: 0
});

// Título del puesto
const SlotTitle = styled('div', {
  fontSize: '$fonts$sizeBody',
  fontWeight: '$fonts$weightSemibold',
  color: '$textPrimary',
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  minWidth: 0
});

// Punto de estado para mayor legibilidad
const StatusDot = styled('span', {
  width: '6px',
  height: '6px',
  borderRadius: '50%',
  display: 'inline-block',
  flexShrink: 0,

  variants: {
    status: {
      ASIGNADO: {
        backgroundColor: '$statusOkDot'
      },
      VACANTE: {
        backgroundColor: '#CBD5E1'
      },
      EN_TRANSITO: {
        backgroundColor: '$transitBorder'
      },
      BAJA_TEMPORAL: {
        backgroundColor: '$dangerBorder'
      },
      POOL_ARRANQUE: {
        backgroundColor: '$infoBorder'
      },
      ALERTA_VACANTE: {
        backgroundColor: '$dangerBorder'
      }
    }
  }
});

// Información del operario asignado
const WorkerInfo = styled('div', {
  fontSize: '$fonts$sizeMeta',
  color: '$textSecondary',
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  marginTop: '2px'
});

// Micro-copia contextual
const ContextMicroCopy = styled('span', {
  fontSize: '10px',
  fontWeight: 500,
  color: '$textSecondary',
  marginTop: '1px',
  fontStyle: 'italic',
  display: 'block',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis'
});

// ZONA C: Columna derecha para acciones y chips
const ActionSection = styled('div', {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-end',
  justifyContent: 'center',
  gap: '4px',
  flexShrink: 0
});

// Chip de rol
const RoleBadge = styled('span', {
  height: '$chipHeight', // 24px
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 8px',
  fontSize: '$fonts$sizeMeta',
  fontWeight: '$fonts$weightSemibold',
  borderRadius: '6px',
  backgroundColor: '$chipNeutralBg',
  color: '$chipNeutralText',
  textTransform: 'uppercase',
  maxWidth: '96px',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  
  variants: {
    critical: {
      true: {
        backgroundColor: '$chipDangerBg',
        color: '$chipDangerText'
      }
    }
  }
});

// Botón de escaneo / asignación rápida (Chip neutral compacto de 22px de alto)
const ScanButton = styled('button', {
  height: '22px',
  padding: '0 8px',
  fontSize: '10px',
  fontWeight: 600,
  backgroundColor: '#F1F5F9',
  color: '#475569',
  border: '1px solid #E2E8F0',
  borderRadius: '6px',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '4px',
  transition: 'all 0.15s ease',
  boxSizing: 'border-box',

  '&:hover': {
    backgroundColor: '#E2E8F0',
    color: '#0F172A'
  },
  '&:active': {
    transform: 'scale(0.95)'
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
  padding: '4px 8px',
  fontSize: '9px',
  fontWeight: 700,
  backgroundColor: '$warningBorder',
  color: '#FFFFFF',
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: '3px',
  boxShadow: '0 1px 2px rgba(234, 179, 8, 0.1)',
  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
  textTransform: 'uppercase',

  '&:hover': {
    backgroundColor: '#CA8A04'
  },
  '&:active': {
    transform: 'scale(0.93)'
  }
});

// Track de fatiga
const FatigueProgressTrack = styled('div', {
  position: 'absolute',
  bottom: 0,
  left: 0,
  right: 0,
  height: '3px',
  backgroundColor: '#E2E8F0',
});

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

// --- HELPER FUNCTIONS ---

const getInitials = (name) => {
  if (!name) return "";
  const parts = name.split(" ").filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
};

const isCriticalRole = (role) => {
  if (!role) return false;
  const upper = role.toUpperCase();
  return upper.includes("AVERIERO") || upper.includes("TECNICO") || upper.includes("TÉCNICO") || upper.includes("OPERADOR A");
};

// --- COMPONENT IMPLEMENTATION ---

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
      const offset = getServerTimeOffset();
      const correctedNow = Date.now() + offset;
      const diffMs = correctedNow - asignadoTime;
      const mins = Math.max(0, Math.floor(diffMs / 60000));
      setElapsedMinutes(mins);
    };

    calculateElapsed();
    const interval = setInterval(calculateElapsed, 5000);
    return () => clearInterval(interval);
  }, [asignadoTime, status]);

  const fatigueState = React.useMemo(() => {
    if (status !== 'ASIGNADO' || !asignadoTime) return 'NORMAL';
    
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
      fatigue={status === 'ASIGNADO' && !esFijoPuesto ? fatigueState : 'NORMAL'}
      isOffline={isOffline}
      onClick={() => onActionClick && onActionClick(slotId)}
    >
      <StatusIndicatorBar status={status} fatigue={status === 'ASIGNADO' && !esFijoPuesto ? fatigueState : 'NORMAL'} />
      
      {/* ZONA A: Avatar circular con iniciales o silueta */}
      {worker ? (
        <AvatarCircle>{getInitials(worker.name)}</AvatarCircle>
      ) : (
        <VacantAvatarCircle>
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
        </VacantAvatarCircle>
      )}

      {/* ZONA B: Información del Puesto y Operario */}
      <InfoSection>
        <SlotTitle>
          <span>{slotName}</span>
          <StatusDot status={status} />
          {isOffline && (
            <OfflineBadge>
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
              <strong style={{ color: '#0F172A', fontWeight: 600 }}>{worker.name}</strong>
              <span style={{ fontFamily: 'monospace', color: '#64748B', fontSize: '11px' }}>({worker.id})</span>
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

      {/* ZONA C: Badge de Rol y Estado de Relevo */}
      <ActionSection>
        {worker ? (
          <>
            <RoleBadge critical={isCriticalRole(worker.role)}>{worker.role}</RoleBadge>
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
            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
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
