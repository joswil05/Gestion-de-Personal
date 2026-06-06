import React, { useState, useEffect, useMemo } from 'react';
import { styled, keyframes } from '../styles/theme';
import { 
  db, 
  puestosColl, 
  trabajadoresColl,
  dispatchWorkerToLine,
  acceptErgonomicRelevo,
  rejectErgonomicRelevo,
  assignWorkerTransaction,
  canWorkerOccupiedSlot,
  getRelocationDestination,
  confirmTransitWorkerArrival,
  getSlotsInTransitChains,
  clearSlotBlacklist,
  acceptReturnToBolson
} from '../services/firebaseService';
import { collection, doc, onSnapshot, query, where, updateDoc, serverTimestamp } from 'firebase/firestore';
import { triggerNativeHapticFeedback } from '../skills/capacitor-android-bridge';
import { initializeConnectivityGuard } from '../skills/state-connectivity-guard';

// --- STYLED COMPONENTS ---

const RelevosContainer = styled('div', {
  padding: '16px 20px calc(100px + env(safe-area-inset-bottom, 0px)) 20px',
  display: 'flex',
  flexDirection: 'column',
  gap: '20px',
  fontFamily: '$sans',
  boxSizing: 'border-box'
});

const SectionHeader = styled('div', {
  borderBottom: '1px solid $border',
  paddingBottom: '12px',
  display: 'flex',
  flexDirection: 'column',
  gap: '4px'
});

const SectionTitle = styled('h2', {
  fontSize: '18px',
  fontWeight: 800,
  color: '$textPrimary',
  display: 'flex',
  alignItems: 'center',
  gap: '8px'
});

const SectionDescription = styled('p', {
  fontSize: '12px',
  color: '$textSecondary',
  lineHeight: 1.4
});

const EmptyStateCard = styled('div', {
  padding: '48px 24px',
  border: '1px dashed $border',
  borderRadius: '16px',
  backgroundColor: '$card',
  color: '$textSecondary',
  fontSize: '12px',
  textAlign: 'center',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '12px',
  boxShadow: '$subtle'
});

const RelevoList = styled('div', {
  display: 'flex',
  flexDirection: 'column',
  gap: '12px'
});

// Consola de Prioridad / Tarjetas L8
const RelevoPriorityCard = styled('div', {
  backgroundColor: '$card',
  border: '1px solid $border',
  borderRadius: '16px',
  padding: '20px 24px',
  boxShadow: '$elevation1',
  display: 'flex',
  flexDirection: 'column',
  gap: '14px',
  position: 'relative',
  overflow: 'hidden',
  transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
});

const CardHeaderRow = styled('div', {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center'
});

const StationBadge = styled('div', {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px'
});

const StationName = styled('strong', {
  fontSize: '13.5px',
  color: '$textPrimary'
});

const LineTag = styled('span', {
  fontSize: '10px',
  fontWeight: 700,
  color: '$accent',
  letterSpacing: '0.5px',
  textTransform: 'uppercase'
});

const FatigaTimer = styled('span', {
  fontSize: '11px',
  fontWeight: 700,
  color: '$dangerBorder',
  backgroundColor: '$dangerBg',
  padding: '4px 10px',
  borderRadius: '8px',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  fontFamily: 'monospace',
  fontVariantNumeric: 'tabular-nums',
  border: '1px solid #FCA5A5'
});

const OperatorLabel = styled('div', {
  fontSize: '11.5px',
  color: '$textSecondary',
  display: 'flex',
  alignItems: 'center',
  gap: '8px'
});

const MatchmakerBox = styled('div', {
  backgroundColor: '#F8FAFC',
  border: '1px solid #E2E8F0',
  borderRadius: '12px',
  padding: '12px 16px',
  display: 'flex',
  flexDirection: 'column',
  gap: '8px'
});

const SuggestionHeader = styled('span', {
  fontSize: '9px',
  fontWeight: 700,
  color: '#64748B',
  textTransform: 'uppercase',
  letterSpacing: '0.8px'
});

const SuggestionWorker = styled('div', {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '10px'
});

const WorkerName = styled('strong', {
  fontSize: '12.5px',
  color: '#0F172A'
});

const WorkerId = styled('span', {
  fontFamily: 'monospace',
  fontSize: '10px',
  color: '#64748B'
});

const ActionBtn = styled('button', {
  padding: '8px 16px',
  minHeight: '38px', // Android touch targets
  border: 'none',
  borderRadius: '10px',
  fontSize: '11.5px',
  fontWeight: 700,
  cursor: 'pointer',
  transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',

  variants: {
    variant: {
      accent: {
        backgroundColor: '$accent',
        color: '#FFFFFF',
        boxShadow: '0 2px 4px rgba(15, 23, 42, 0.06)',
        '&:hover': {
          backgroundColor: '#1D4ED8',
          boxShadow: '0 4px 12px rgba(15, 23, 42, 0.1)'
        }
      },
      danger: {
        backgroundColor: '$dangerBg',
        color: '$dangerBorder',
        border: '1px solid $dangerBorder',
        '&:hover': {
          backgroundColor: '#FCA5A5',
          color: '#B91C1C'
        }
      },
      success: {
        backgroundColor: '$successBg',
        color: '$successBorder',
        border: '1px solid $successBorder',
        '&:hover': {
          backgroundColor: '#BBF7D0',
          color: '#15803D'
        }
      },
      secondary: {
        backgroundColor: '#F1F5F9',
        color: '#475569',
        border: '1px solid #E2E8F0',
        '&:hover': {
          backgroundColor: '#E2E8F0',
          color: '#1E293B'
        }
      }
    }
  },
  '&:active': {
    transform: 'scale(0.96)'
  }
});

// Tarjeta de Relevista en Tránsito (Supervisor Pasillo)
const TransitCard = styled('div', {
  backgroundColor: '$card',
  border: '1px solid $border',
  borderRadius: '16px',
  padding: '20px 24px',
  boxShadow: '$elevation1',
  display: 'flex',
  flexDirection: 'column',
  gap: '16px',
  borderLeft: '4px solid $transitBorder',
  transition: 'all 0.3s ease'
});

const RowActions = styled('div', {
  display: 'flex',
  gap: '8px',
  marginTop: '4px'
});



const VacancySelectArea = styled('div', {
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
  maxHeight: '140px',
  overflowY: 'auto'
});

const ToastNotification = styled('div', {
  backgroundColor: '#1E293B',
  color: '#FFFFFF',
  padding: '12px 18px',
  borderRadius: '12px',
  fontSize: '12px',
  fontWeight: 600,
  position: 'fixed',
  top: '24px',
  left: '50%',
  transform: 'translateX(-50%)',
  zIndex: 3000,
  boxShadow: '$elevation3',
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  animation: 'slideDown 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
});

// --- COMPONENT ---

export default function RelevosNotificaciones({ supervisorLineId }) {
  const [allSlots, setAllSlots] = useState([]);
  const [workers, setWorkers] = useState({});
  const [notification, setNotification] = useState(null);
  const [isOffline, setIsOffline] = useState(false);
  const [tick, setTick] = useState(0);

  // 0. Conexión al Guardián de Conectividad
  useEffect(() => {
    initializeConnectivityGuard((onlineStatus) => {
      setIsOffline(!onlineStatus);
    });
  }, []);

  // 1. Ticker para actualizar los minutos de fatiga en caliente cada 10 segundos
  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 10000);
    return () => clearInterval(timer);
  }, []);

  // 2. Desvanecer toasts automáticamente
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const [skippedIndexes, setSkippedIndexes] = useState({});
  const [priorityOrder, setPriorityOrder] = useState(["L4", "L1", "L2", "L6", "L7", "L5", "L3", "L8", "L9", "L10"]);

  // 2.5 Cargar global_priority reactivamente
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "config", "global_priority"), (snap) => {
      if (snap.exists() && snap.data().priorityOrder) {
        setPriorityOrder(snap.data().priorityOrder);
      }
    });
    return () => unsub();
  }, []);

  // 3. Conexión en tiempo real a todos los puestos
  useEffect(() => {
    const unsubscribe = onSnapshot(puestosColl, (snapshot) => {
      const list = [];
      snapshot.forEach(docSnap => {
        list.push({ id: docSnap.id, ...docSnap.data() });
      });
      setAllSlots(list);
    });
    return () => unsubscribe();
  }, []);

  // 4. Conexión en tiempo real a todos los trabajadores
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

  // 5. Filtrar puestos fatigados de toda la planta en tiempo real
  const activeFatiguedSlots = useMemo(() => {
    const fatigued = [];
    const transitChains = getSlotsInTransitChains(allSlots, workers, priorityOrder);
    const transitChainsSet = new Set(transitChains);

    allSlots.forEach(slot => {
      if (slot.status !== 'ASIGNADO' || !slot.asignadoEnSegundoVirtual) return;
      
      // El sistema de fatiga NO aplica para puestos fijos críticos, solo puestos varios
      const esFijo = ["Operador A", "Averiero", "Operador C"].includes(slot.tipoPuesto);
      if (esFijo) return;
      
      const t = slot.asignadoEnSegundoVirtual;
      const ms = t.toDate 
        ? t.toDate().getTime() 
        : (t.seconds ? t.seconds * 1000 : new Date(t).getTime());
      const elapsed = Math.max(0, Math.floor((Date.now() - ms) / 60000));
      
      // Excluir si ya hay un relevista en tránsito para este puesto o si está en su cadena de tránsito
      if (transitChainsSet.has(slot.id)) return;

      if (elapsed >= 105 || slot.relevoSolicitado) {
        fatigued.push({ ...slot, elapsed });
      }
    });

    // Ordenar de forma descendente por minutos de fatiga (prioridad de vencimiento)
    return fatigued.sort((a, b) => b.elapsed - a.elapsed);
  }, [allSlots, workers, priorityOrder, tick]);

  // 6. Obtener los relevistas de L8 disponibles
  const availableL8Workers = useMemo(() => {
    return Object.values(workers).filter(w => 
      (w.status === "DISPONIBLE_BOLSON" || w.status === "POOL_ARRANQUE") && 
      w.currentSlotId == null
    );
  }, [workers]);

  // 7. Algoritmo inteligente de matchmaking para sugerir candidatos en L8
  const getSuggestedCandidate = (slot) => {
    const blacklist = slot.rejectedWorkerIds || [];
    const stationName = slot.puestoName;

    const aptCandidates = availableL8Workers.filter(w => {
      // a. Ignorar si está blacklisteado (rechazado físicamente en pasillo)
      if (blacklist.includes(w.id)) return false;

      // b. Restricciones duras (Médicas y de Género)
      if (!canWorkerOccupiedSlot(w, slot)) return false;

      // c. Filtro ergonómico: No debe haber realizado la misma actividad al cierre anterior
      if (w.lastActivity && w.lastActivity === stationName) return false;

      return true;
    });

    if (aptCandidates.length === 0) {
      return { candidate: null, count: 0 };
    }

    const index = skippedIndexes[slot.id] || 0;
    const finalIndex = index % aptCandidates.length;

    return {
      candidate: aptCandidates[finalIndex],
      count: aptCandidates.length
    };
  };

  // Manejar el salto/rechazo cíclico de sugerencias
  const handleSkipSuggestion = (slotId, count) => {
    if (count < 1) return;
    triggerNativeHapticFeedback('short');
    setSkippedIndexes(prev => ({
      ...prev,
      [slotId]: ((prev[slotId] || 0) + 1) % count
    }));
  };

  // 8. Filtrar operarios en tránsito hacia esta línea (supervisor receptor)
  const inTransitWorkers = useMemo(() => {
    return Object.values(workers).filter(w => 
      w.status === 'EN_TRANSITO' && 
      w.lineaDestinoId === supervisorLineId
    );
  }, [workers, supervisorLineId]);

  // 9. Filtrar puestos vacantes locales para reasignación
  const vacantLocalSlots = useMemo(() => {
    return allSlots.filter(s => 
      s.lineId === supervisorLineId && 
      (s.status === 'VACANTE' || s.status === 'ALERTA_VACANTE')
    );
  }, [allSlots, supervisorLineId]);

  // --- HANDLERS ---

  // Despachar relevo desde la consola L8
  const handleDispatchRelevo = async (slot, candidate) => {
    if (isOffline) {
      setNotification({
        type: 'error',
        message: 'Sin conexión: No se puede despachar relevistas en modo offline.'
      });
      return;
    }
    if (!candidate) return;
    triggerNativeHapticFeedback('short');
    
    try {
      await dispatchWorkerToLine(candidate.id, slot.lineId, slot.id, "L8");
      triggerNativeHapticFeedback('confirm');
      setNotification({
        type: 'success',
        message: `¡Relevista Despachado! ${candidate.name} va en tránsito hacia Línea ${slot.lineId}.`
      });
    } catch (err) {
      triggerNativeHapticFeedback('error');
      setNotification({
        type: 'error',
        message: err.message || 'Error al despachar el relevo ergonómico.'
      });
    }
  };

  // Aceptar arribo físico en pasillo
  const handleAcceptRelevo = async (tw) => {
    if (isOffline) {
      setNotification({
        type: 'error',
        message: 'Sin conexión: No se puede aceptar arribo en modo offline.'
      });
      return;
    }
    if (!tw || !tw.targetSlotId) return;
    triggerNativeHapticFeedback('short');

    const relevistaId = tw.id;
    const slotId = tw.targetSlotId;

    try {
      const res = await acceptErgonomicRelevo(relevistaId, slotId, supervisorLineId);
      triggerNativeHapticFeedback('confirm');

      let relocationMsg = "";
      if (res.chainPath && res.chainPath.length > 0) {
        relocationMsg = " " + res.chainPath.map(step => {
          if (step.type === "local") {
            return `🔄 ${step.workerName} se reubicó localmente en "${step.slotName}".`;
          } else if (step.type === "transit") {
            return `🚀 ${step.workerName} va en tránsito a Línea ${step.lineId} ("${step.slotName}").`;
          } else {
            return `💤 ${step.workerName} regresó a L8 (Bolsón).`;
          }
        }).join(" ");
      }

      setNotification({
        type: 'success',
        message: `¡Relevista Recibido! Asignación consolidada.${relocationMsg}`
      });
    } catch (err) {
      triggerNativeHapticFeedback('error');
      setNotification({
        type: 'error',
        message: err.message || 'Error al procesar la aceptación de la rotación.'
      });
    }
  };

  // Aceptar retorno al Bolsón L8
  const handleAcceptReturnToBolson = async (tw) => {
    if (isOffline) {
      setNotification({
        type: 'error',
        message: 'Sin conexión: No se puede recibir operarios en modo offline.'
      });
      return;
    }
    if (!tw) return;
    triggerNativeHapticFeedback('short');

    try {
      await acceptReturnToBolson(tw.id);
      triggerNativeHapticFeedback('confirm');
      setNotification({
        type: 'success',
        message: `¡Operario ${tw.name} recibido con éxito en el Bolsón L8!`
      });
    } catch (err) {
      triggerNativeHapticFeedback('error');
      setNotification({
        type: 'error',
        message: err.message || 'Error al recibir al operario de vuelta.'
      });
    }
  };

  // Rechazar arribo (percance en el trayecto)
  const handleRejectRelevo = async (tw) => {
    if (isOffline) {
      setNotification({
        type: 'error',
        message: 'Sin conexión: No se puede rechazar arribo en modo offline.'
      });
      return;
    }
    if (!tw) return;
    triggerNativeHapticFeedback('short');

    const relevistaId = tw.id;
    const slotId = tw.targetSlotId;

    try {
      if (slotId) {
        await rejectErgonomicRelevo(relevistaId, slotId, supervisorLineId);
      } else {
        // Rechazo de tránsito general: retornar directamente al Bolsón L8 en Firestore
        const workerRef = doc(db, "trabajadores", relevistaId);
        await updateDoc(workerRef, {
          status: "DISPONIBLE_BOLSON",
          lineaDestinoId: null,
          targetSlotId: null,
          currentSlotId: null,
          physicalLineLocation: "L8",
          updatedAt: serverTimestamp()
        });
      }
      triggerNativeHapticFeedback('confirm');
      setNotification({
        type: 'success',
        message: `Relevo rechazado. El operario regresó a L8.`
      });
    } catch (err) {
      triggerNativeHapticFeedback('error');
      setNotification({
        type: 'error',
        message: err.message || 'Error al rechazar el relevo.'
      });
    }
  };

  // Aceptar arribo físico general en pasillo (sin puesto predefinido)
  const handleAcceptGeneralTransit = async (tw, slotId) => {
    if (isOffline) {
      setNotification({
        type: 'error',
        message: 'Sin conexión: No se puede asignar operario en modo offline.'
      });
      return;
    }
    if (!tw || !slotId) return;
    triggerNativeHapticFeedback('short');

    const workerId = tw.id;

    try {
      await confirmTransitWorkerArrival(workerId, slotId, supervisorLineId);
      triggerNativeHapticFeedback('confirm');
      setNotification({
        type: 'success',
        message: `¡Operario Recibido! Asignación consolidada en estación.`
      });
    } catch (err) {
      triggerNativeHapticFeedback('error');
      setNotification({
        type: 'error',
        message: err.message || 'Error al consolidar arribo.'
      });
    }
  };

  // Limpiar rechazados (blacklist) de un puesto fatigado en L8
  const handleClearBlacklist = async (slotId) => {
    if (isOffline) {
      setNotification({
        type: 'error',
        message: 'Sin conexión: No se puede restablecer candidatos en modo offline.'
      });
      return;
    }
    triggerNativeHapticFeedback('short');
    try {
      await clearSlotBlacklist(slotId);
      triggerNativeHapticFeedback('confirm');
      setNotification({
        type: 'success',
        message: 'Lista de candidatos rechazados restablecida exitosamente.'
      });
    } catch (err) {
      triggerNativeHapticFeedback('error');
      setNotification({
        type: 'error',
        message: err.message || 'Error al restablecer candidatos.'
      });
    }
  };

  return (
    <RelevosContainer id="relevos-portal-view">
      <style>{`
        @keyframes slideDown {
          from { transform: translateY(-16px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>

      {notification && (
        <ToastNotification id="relevo-toast-notification">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          <span>{notification.message}</span>
        </ToastNotification>
      )}

      {/* 🔴 SECCIÓN EXCLUSIVA DEL BOLSÓN (SUPERVISOR LÍNEA 8) */}
      {supervisorLineId === "L8" ? (
        <>
          <SectionHeader>
            <SectionTitle>
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
              </svg>
              <span>Consola de Prioridad de Relevos Planta</span>
            </SectionTitle>
            <SectionDescription>
              Bitácora global de puestos con fatiga ergonómica acumulada, ordenada por tiempo de vencimiento. Despacha reemplazos compatibles.
            </SectionDescription>
          </SectionHeader>

          <RelevoList id="l8-fatigue-queue">
            {activeFatiguedSlots.length === 0 ? (
              <EmptyStateCard id="l8-empty-fatigue-queue">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                  <polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
                <span>Planta Estable. Ningún puesto supera el límite ergonómico de 105 minutos actualmente.</span>
              </EmptyStateCard>
            ) : (
              activeFatiguedSlots.map(slot => {
                const currentWorker = workers[slot.idWorkerCurrent];
                const currentWorkerName = currentWorker ? currentWorker.name : "Operario";
                const suggestionObj = getSuggestedCandidate(slot);

                return (
                  <RelevoPriorityCard key={slot.id} id={`priority-card-${slot.id}`}>
                    <CardHeaderRow>
                      <StationBadge>
                        <LineTag>Línea {slot.lineId}</LineTag>
                        <StationName>{slot.puestoName}</StationName>
                      </StationBadge>
                      <FatigaTimer>
                        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                        </svg>
                        <span>{slot.elapsed} min</span>
                      </FatigaTimer>
                    </CardHeaderRow>

                    <OperatorLabel>
                      <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/>
                        <circle cx="12" cy="7" r="4"/>
                      </svg>
                      <span>Operario Fatigado: <strong>{currentWorkerName}</strong> ({slot.idWorkerCurrent})</span>
                    </OperatorLabel>

                    {/* SUGERENCIA INTELIGENTE MATCHMAKER */}
                    <MatchmakerBox>
                      <SuggestionHeader>Sugerencia de Reemplazo Aptitud L8</SuggestionHeader>
                      {suggestionObj.candidate ? (
                        <SuggestionWorker>
                          <div>
                            <WorkerName>{suggestionObj.candidate.name}</WorkerName>
                            <WorkerId> ── Ficha: {suggestionObj.candidate.id} ({suggestionObj.candidate.role})</WorkerId>
                          </div>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <ActionBtn 
                              variant="secondary" 
                              onClick={() => handleSkipSuggestion(slot.id, suggestionObj.count)}
                              id={`skip-relevo-${slot.id}-btn`}
                              style={{ padding: '8px 12px' }}
                            >
                              <span>Rechazar</span>
                            </ActionBtn>
                            <ActionBtn 
                              variant="accent" 
                              onClick={() => handleDispatchRelevo(slot, suggestionObj.candidate)}
                              id={`dispatch-relevo-${slot.id}-btn`}
                            >
                              <span>Despachar</span>
                            </ActionBtn>
                          </div>
                        </SuggestionWorker>
                      ) : (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', gap: '10px' }}>
                          <div style={{ fontSize: '11px', color: '#EF4444', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                              <circle cx="12" cy="12" r="10"/>
                              <line x1="12" y1="8" x2="12" y2="12"/>
                              <line x1="12" y1="16" x2="12.01" y2="16"/>
                            </svg>
                            <span>No hay relevista compatible en L8.</span>
                          </div>
                          {slot.rejectedWorkerIds && slot.rejectedWorkerIds.length > 0 && (
                            <ActionBtn
                              variant="secondary"
                              onClick={() => handleClearBlacklist(slot.id)}
                              id={`clear-blacklist-${slot.id}-btn`}
                              style={{ padding: '6px 12px', minHeight: '30px', backgroundColor: '#F1F5F9', border: '1px solid #CBD5E1' }}
                            >
                              <span>Restablecer rechazados</span>
                            </ActionBtn>
                          )}
                        </div>
                      )}
                    </MatchmakerBox>
                  </RelevoPriorityCard>
                );
              })
            )}
          </RelevoList>

          {/* 📬 ALERTAS DE RETORNO AL BOLSÓN L8 */}
          {inTransitWorkers.length > 0 && (
            <>
              <SectionHeader style={{ marginTop: '24px' }}>
                <SectionTitle style={{ color: '#10B981' }}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.5">
                    <polyline points="17 1 21 5 17 9"/>
                    <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
                    <polyline points="7 23 3 19 7 15"/>
                    <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
                  </svg>
                  <span>Recepción de Retornos al Bolsón</span>
                </SectionTitle>
                <SectionDescription>
                  Confirma la llegada física de los operarios relevados que regresan a descansar al Bolsón L8.
                </SectionDescription>
              </SectionHeader>

              <RelevoList id="l8-transit-queue">
                {inTransitWorkers.map(tw => (
                  <TransitCard key={tw.id} id={`transit-card-${tw.id}`} style={{ borderLeftColor: '#10B981' }}>
                    <CardHeaderRow>
                      <StationBadge>
                        <LineTag style={{ backgroundColor: '#D1FAE5', color: '#065F46' }}>Retorno a L8</LineTag>
                        <StationName>{tw.name}</StationName>
                      </StationBadge>
                      <span style={{ fontSize: '10px', fontWeight: 700, color: '#10B981', backgroundColor: '#E0F2FE', padding: '3px 8px', borderRadius: '6px' }}>
                        De Regreso
                      </span>
                    </CardHeaderRow>

                    <OperatorLabel>
                      <span>El operario ha sido relevado y está de regreso en descanso (Ficha: {tw.id})</span>
                    </OperatorLabel>

                    <RowActions>
                      <ActionBtn 
                        variant="success" 
                        onClick={() => handleAcceptReturnToBolson(tw)}
                        id={`accept-bolson-return-${tw.id}`}
                        style={{ width: '100%', marginTop: '6px', backgroundColor: '#10B981' }}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                        <span>Recibir en Bolsón</span>
                      </ActionBtn>
                    </RowActions>
                  </TransitCard>
                ))}
              </RelevoList>
            </>
          )}
        </>
      ) : (
        /* 🔵 SECCIÓN EXCLUSIVA DE PASILLO (SUPERVISORES DE LÍNEA OPERATIVA) */
        <>
          <SectionHeader>
            <SectionTitle>
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2.5">
                <path d="M16 3h5v5M8 21H3v-5M12 12l9-9M12 12l-9 9"/>
              </svg>
              <span>Notificaciones y Recepción de Relevos</span>
            </SectionTitle>
            <SectionDescription>
              Recibe operarios despachados en pasillo y gestiona de forma inmediata la reasignación de tu personal fatigado relevado.
            </SectionDescription>
          </SectionHeader>



          {/* 📬 ALERTAS DE TRÁNSITO / RECEPCIÓN */}
          <RelevoList id="supervisor-transit-alerts">
            {inTransitWorkers.length === 0 ? (
              <EmptyStateCard id="supervisor-empty-transit">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                  <polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
                <span>Tu canal de notificaciones y relevos está libre. Todos los puestos operan según el tiempo estipulado.</span>
              </EmptyStateCard>
            ) : (
              inTransitWorkers.map(tw => {
                const destSlot = tw.targetSlotId ? allSlots.find(s => s.id === tw.targetSlotId) : null;
                const destName = destSlot ? destSlot.puestoName : null;
                const relievedWorkerId = destSlot ? destSlot.idWorkerCurrent : null;
                const relievedWorker = relievedWorkerId ? workers[relievedWorkerId] : null;

                const relocationInfo = (relievedWorker && destSlot)
                  ? getRelocationDestination(relievedWorker, destSlot, allSlots, workers, priorityOrder)
                  : null;
                
                return (
                  <TransitCard key={tw.id} id={`transit-card-${tw.id}`}>
                    <CardHeaderRow>
                      <StationBadge>
                        <LineTag>{destSlot ? 'Relevista en Tránsito' : 'Operario en Tránsito'}</LineTag>
                        <StationName>{tw.name}</StationName>
                      </StationBadge>
                      <span style={{ fontSize: '10px', fontWeight: 700, color: '#A855F7', backgroundColor: '#F3E8FF', padding: '3px 8px', borderRadius: '6px' }}>
                        En Camino
                      </span>
                    </CardHeaderRow>
 
                    <OperatorLabel>
                      {destName ? (
                        <span>Destinado a la estación: <strong>{destName}</strong> (Ficha: {tw.id})</span>
                      ) : (
                        <span>Asignación General a Línea {tw.lineaDestinoId} (Ficha: {tw.id})</span>
                      )}
                    </OperatorLabel>

                    {relocationInfo && (
                      <div style={{ 
                        marginTop: '6px',
                        padding: '10px 14px',
                        backgroundColor: '#F8FAFC',
                        border: '1px solid #E2E8F0',
                        borderRadius: '10px',
                        fontSize: '11px',
                        color: '#475569',
                        lineHeight: 1.3
                      }}>
                        🔄 <strong>Destino al ser relevado:</strong> {relievedWorker.name} se reubicará en:
                        <div style={{ marginTop: '4px', fontWeight: 700, color: '#0F172A' }}>
                          📍 {relocationInfo.label}
                        </div>
                      </div>
                    )}

                    {tw.targetSlotId ? (
                      <RowActions>
                        <ActionBtn 
                          variant="success" 
                          onClick={() => handleAcceptRelevo(tw)}
                          id={`accept-transit-relevo-${tw.id}`}
                          style={{ flex: 1 }}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                          <span>Aceptar Relevo</span>
                        </ActionBtn>
                        <ActionBtn 
                          variant="danger" 
                          onClick={() => handleRejectRelevo(tw)}
                          id={`reject-transit-relevo-${tw.id}`}
                          style={{ flex: 1 }}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                            <line x1="18" y1="6" x2="6" y2="18"/>
                            <line x1="6" y1="6" x2="18" y2="18"/>
                          </svg>
                          <span>Rechazar</span>
                        </ActionBtn>
                      </RowActions>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                        {vacantLocalSlots.length > 0 ? (
                          <>
                            <span style={{ fontSize: '10px', fontWeight: 700, color: '#B45309' }}>Asignar a Puesto Vacante Local:</span>
                            <VacancySelectArea>
                              {vacantLocalSlots.map(v => (
                                <button
                                  key={v.id}
                                  onClick={() => handleAcceptGeneralTransit(tw, v.id)}
                                  style={{
                                    padding: '10px 12px',
                                    backgroundColor: '#FFFFFF',
                                    border: '1px solid #CBD5E1',
                                    borderRadius: '8px',
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    color: '#1E293B',
                                    textAlign: 'left',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    marginBottom: '4px'
                                  }}
                                  id={`reassign-transit-to-${v.id}`}
                                >
                                  <span>{v.puestoName}</span>
                                  <span style={{ fontSize: '9px', fontWeight: 700, color: '#2563EB' }}>Ubicar</span>
                                </button>
                              ))}
                            </VacancySelectArea>
                          </>
                        ) : (
                          <div style={{ fontSize: '11px', color: '#EF4444', fontWeight: 600, padding: '8px', border: '1px dashed #FCA5A5', borderRadius: '8px', backgroundColor: '#FEE2E2' }}>
                            No hay celdas vacantes en tu línea. Libera un puesto primero.
                          </div>
                        )}
                        <ActionBtn 
                          variant="danger" 
                          onClick={() => handleRejectRelevo(tw)}
                          id={`reject-transit-relevo-${tw.id}`}
                          style={{ width: '100%' }}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                            <line x1="18" y1="6" x2="6" y2="18"/>
                            <line x1="6" y1="6" x2="18" y2="18"/>
                          </svg>
                          <span>Rechazar Arribo</span>
                        </ActionBtn>
                      </div>
                    )}
                  </TransitCard>
                );
              })
            )}
          </RelevoList>

          {/* BITÁCORA GENERAL DE ALERTAS DE PLANTA */}
          <SectionHeader style={{ marginTop: '16px' }}>
            <SectionTitle style={{ fontSize: '14px', color: '$textSecondary' }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0"/>
              </svg>
              <span>Canal de Notificaciones de Planta</span>
            </SectionTitle>
          </SectionHeader>

          <RelevoList id="plant-wide-notifs-feed">
            {activeFatiguedSlots.filter(s => s.lineId !== supervisorLineId).length === 0 ? (
              <div style={{ fontSize: '11px', color: '#94A3B8', textAlign: 'center', padding: '16px 0', border: '1px dashed #E2E8F0', borderRadius: '8px' }}>
                Sin notificaciones de fatiga externas. Todas las líneas activas operan de forma normal.
              </div>
            ) : (
              activeFatiguedSlots.filter(s => s.lineId !== supervisorLineId).map(slot => (
                <div key={slot.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', border: '1px solid #FEE2E2', borderRadius: '8px', backgroundColor: '#FFF5F5', fontSize: '11px', color: '#EF4444', fontWeight: 600 }}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="8" x2="12" y2="12"/>
                    <line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                  <span>Línea {slot.lineId} necesita relevo inminente en "{slot.puestoName}" ({slot.elapsed}m activo).</span>
                </div>
              ))
            )}
          </RelevoList>
        </>
      )}
    </RelevosContainer>
  );
}
