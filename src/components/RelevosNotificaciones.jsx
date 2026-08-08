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
} from '../services/apiService';
import { collection, doc, onSnapshot, query, where, updateDoc, serverTimestamp } from 'firebase/firestore';
import { triggerNativeHapticFeedback } from '../skills/capacitor-android-bridge';
import { initializeConnectivityGuard } from '../skills/state-connectivity-guard';

// --- STYLED COMPONENTS ---

const RelevosContainer = styled('div', {
  padding: '12px 16px calc(80px + env(safe-area-inset-bottom, 0px)) 16px',
  display: 'flex',
  flexDirection: 'column',
  gap: '14px',
  fontFamily: '$sans',
  boxSizing: 'border-box',
  backgroundColor: '$background',
  minHeight: '100vh'
});

const SectionHeader = styled('div', {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  paddingBottom: '4px'
});

const SectionTitle = styled('h2', {
  fontSize: '14px',
  fontWeight: 700,
  color: '$textPrimary',
  display: 'flex',
  alignItems: 'center',
  gap: '6px'
});

const SubSectionTitle = styled('h3', {
  fontSize: '11px',
  fontWeight: 700,
  color: '$textSecondary',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  height: '32px',
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  padding: '0 4px',
  borderBottom: '1px solid $border',
  margin: '12px 0 6px 0'
});

const SectionDescription = styled('p', {
  display: 'none' // Se elimina visualmente para evitar scroll innecesario
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
  boxShadow: '$subtle',
  padding: '0 16px',
  boxSizing: 'border-box'
});

const RelevoList = styled('div', {
  display: 'flex',
  flexDirection: 'column',
  gap: '10px'
});

const RelevoPriorityCard = styled('div', {
  backgroundColor: '$card',
  border: '1px solid $border',
  borderRadius: '12px',
  height: '64px',
  padding: '0 12px 0 14px',
  boxShadow: '$subtle',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  position: 'relative',
  overflow: 'hidden',
  gap: '12px',
  borderLeft: '4px solid $dangerBorder',
  boxSizing: 'border-box'
});

const CardHeaderRow = styled('div', {
  display: 'flex',
  alignItems: 'center',
  gap: '8px'
});

const StationBadge = styled('div', {
  display: 'flex',
  flexDirection: 'column',
  gap: '1px'
});

const StationName = styled('strong', {
  fontSize: '13px',
  color: '$textPrimary',
  fontWeight: 700
});

const LineTag = styled('span', {
  fontSize: '9px',
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
  padding: '3px 8px',
  borderRadius: '6px',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  fontFamily: 'monospace',
  border: '1px solid #FCA5A5'
});

const OperatorLabel = styled('div', {
  fontSize: '11px',
  color: '$textSecondary',
  display: 'flex',
  alignItems: 'center',
  gap: '4px'
});

const MatchmakerBox = styled('div', {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  height: '100%'
});

const SuggestionHeader = styled('span', {
  display: 'none' // Comprimido para el list-item de 64px
});

const SuggestionWorker = styled('div', {
  display: 'flex',
  alignItems: 'center',
  gap: '10px'
});

const WorkerName = styled('strong', {
  fontSize: '12px',
  color: '$textPrimary',
  fontWeight: 700
});

const WorkerId = styled('span', {
  fontFamily: 'monospace',
  fontSize: '9px',
  color: '$textSecondary'
});

const ActionBtn = styled('button', {
  padding: '0 10px',
  height: '32px',
  border: 'none',
  borderRadius: '8px',
  fontSize: '11px',
  fontWeight: 700,
  cursor: 'pointer',
  transition: 'all 0.15s ease',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '4px',
  fontFamily: '$sans',

  variants: {
    variant: {
      accent: {
        backgroundColor: '$accent',
        color: '#FFFFFF',
        '&:hover': {
          backgroundColor: '#1D4ED8'
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
          backgroundColor: '#E2E8F0'
        }
      }
    }
  },
  '&:active': {
    transform: 'scale(0.96)'
  }
});

const TransitCard = styled('div', {
  backgroundColor: '$card',
  border: '1px solid $border',
  borderRadius: '12px',
  height: '64px',
  padding: '0 12px 0 14px',
  boxShadow: '$subtle',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '12px',
  borderLeft: '4px solid $transitBorder',
  transition: 'all 0.15s ease',
  boxSizing: 'border-box'
});

const RowActions = styled('div', {
  display: 'flex',
  gap: '6px'
});

const VacancySelectArea = styled('div', {
  display: 'flex',
  alignItems: 'center',
  gap: '4px'
});

const PlantAlertGroup = styled('div', {
  border: '1px solid $border',
  borderRadius: '12px',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
  boxShadow: '$subtle'
});

const PlantAlertItem = styled('div', {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '8px 12px',
  borderBottom: '1px solid $border',
  fontSize: '11.5px',
  color: '$dangerBorder',
  fontWeight: 600,
  backgroundColor: '$dangerBg',
  boxSizing: 'border-box',
  '&:last-child': {
    borderBottom: 'none'
  }
});

const ToastNotification = styled('div', {
  backgroundColor: '#1E293B',
  color: '#FFFFFF',
  padding: '10px 16px',
  borderRadius: '8px',
  fontSize: '11px',
  fontWeight: 600,
  position: 'fixed',
  top: '16px',
  left: '50%',
  transform: 'translateX(-50%)',
  zIndex: 3000,
  boxShadow: '$elevation3',
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  animation: 'slideDown 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
});

const ConfirmationOverlay = styled('div', {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(15, 23, 42, 0.5)',
  backdropFilter: 'blur(4px)',
  zIndex: 1600,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '16px'
});

const ConfirmationContent = styled('div', {
  width: '100%',
  maxWidth: '360px',
  backgroundColor: '$card',
  borderRadius: '12px',
  boxShadow: '0 8px 32px rgba(15, 23, 42, 0.15)',
  padding: '20px',
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  boxSizing: 'border-box',
  fontFamily: '$sans'
});

const DialogTitle = styled('h3', {
  fontSize: '14px',
  fontWeight: 700,
  color: '$textPrimary',
  textAlign: 'center'
});

const DialogSubtitle = styled('p', {
  fontSize: '11px',
  color: '$textSecondary',
  textAlign: 'center',
  lineHeight: 1.3
});

const WorkerListContainer = styled('div', {
  maxHeight: '200px',
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
  paddingRight: '2px'
});

const WorkerListItem = styled('button', {
  width: '100%',
  padding: '8px 10px',
  backgroundColor: '#F8FAFC',
  border: '1px solid #E2E8F0',
  borderRadius: '6px',
  textAlign: 'left',
  cursor: 'pointer',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  transition: 'all 0.15s ease',
  fontFamily: '$sans',

  '&:hover': {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE'
  }
});

const CancelBtn = styled('button', {
  width: '100%',
  padding: '10px',
  backgroundColor: '#FFFFFF',
  border: '1px solid #CBD5E1',
  borderRadius: '6px',
  color: '$textSecondary',
  fontSize: '11.5px',
  fontWeight: 700,
  cursor: 'pointer',
  transition: 'all 0.15s ease',
  fontFamily: '$sans',

  '&:hover': {
    backgroundColor: '#F1F5F9'
  }
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
  const [manualDispatchSlot, setManualDispatchSlot] = useState(null);

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

    const getBaseNameLocal = (name) => {
      if (!name) return "";
      return name.toLowerCase().split(/\d/)[0].trim();
    };

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
        // Evaluar si es resoluble localmente por intercambio cruzado compatible en su propia línea
        let isLocalResolvable = false;
        let localSwapInfo = null;
        const workerA = workers[slot.idWorkerCurrent];

        if (workerA) {
          const sameLineSlots = allSlots.filter(s => s.lineId === slot.lineId && s.id !== slot.id);
          
          // 1. Buscar si hay otro fatigado compatible (Siempre bloquea L8)
          let partnerFatigued = null;
          for (const slotB of sameLineSlots) {
            if (slotB.status !== 'ASIGNADO' || !slotB.idWorkerCurrent) continue;
            const esFijoB = ["Operador A", "Averiero", "Operador C"].includes(slotB.tipoPuesto);
            if (esFijoB) continue;

            let isFatiguedB = slotB.relevoSolicitado === true;
            if (!isFatiguedB && slotB.asignadoEnSegundoVirtual) {
              const tB = slotB.asignadoEnSegundoVirtual;
              const msB = tB.toDate ? tB.toDate().getTime() : (tB.seconds ? tB.seconds * 1000 : new Date(tB).getTime());
              const elapsedB = Math.max(0, Math.floor((Date.now() - msB) / 60000));
              isFatiguedB = elapsedB >= 105;
            }
            if (!isFatiguedB) continue;

            if (getBaseNameLocal(slot.puestoName) === getBaseNameLocal(slotB.puestoName)) continue;
            const workerB = workers[slotB.idWorkerCurrent];
            if (!workerB) continue;

            if (canWorkerOccupiedSlot(workerA, slotB) && canWorkerOccupiedSlot(workerB, slot)) {
              partnerFatigued = { slotB, workerB };
              break;
            }
          }

          if (partnerFatigued) {
            isLocalResolvable = true;
            localSwapInfo = {
              partnerSlot: partnerFatigued.slotB,
              partnerWorker: partnerFatigued.workerB,
              reason: "both_fatigued"
            };
          } else {
            // 2. Si no hay fatigado compatible, verificar si L8 tiene personal disponible compatible
            const l8Available = Object.values(workers).filter(w => 
              (w.status === "DISPONIBLE_BOLSON" || w.status === "POOL_ARRANQUE") && 
              w.currentSlotId == null
            );

            const hasCompatibleL8Worker = l8Available.some(w => {
              const blacklist = slot.rejectedWorkerIds || [];
              if (blacklist.includes(w.id)) {
                console.log(`[QA Debug] ${w.name} (${w.id}) excluido de ${slot.puestoName} por estar en la blacklist.`);
                return false;
              }
              if (!canWorkerOccupiedSlot(w, slot)) {
                console.log(`[QA Debug] ${w.name} (${w.id}) excluido de ${slot.puestoName} por canWorkerOccupiedSlot.`);
                return false;
              }
              if (w.lastActivity && w.lastActivity === slot.puestoName) {
                console.log(`[QA Debug] ${w.name} (${w.id}) excluido de ${slot.puestoName} por lastActivity matching (fatiga ergonómica 24h).`);
                return false;
              }
              console.log(`[QA Debug] CANDIDATO COMPATIBLE L8 DETECTADO: ${w.name} (${w.id}) para puesto ${slot.puestoName}.`);
              return true;
            });

            // Si L8 NO tiene recursos, verificamos si hay algún estable compatible localmente
            if (!hasCompatibleL8Worker) {
              let partnerStable = null;
              for (const slotB of sameLineSlots) {
                if (slotB.status !== 'ASIGNADO' || !slotB.idWorkerCurrent) continue;
                const esFijoB = ["Operador A", "Averiero", "Operador C"].includes(slotB.tipoPuesto);
                if (esFijoB) continue;

                if (getBaseNameLocal(slot.puestoName) === getBaseNameLocal(slotB.puestoName)) continue;
                const workerB = workers[slotB.idWorkerCurrent];
                if (!workerB) continue;

                if (canWorkerOccupiedSlot(workerA, slotB) && canWorkerOccupiedSlot(workerB, slot)) {
                  partnerStable = { slotB, workerB };
                  break;
                }
              }

              if (partnerStable) {
                isLocalResolvable = true;
                localSwapInfo = {
                  partnerSlot: partnerStable.slotB,
                  partnerWorker: partnerStable.workerB,
                  reason: "no_l8_resources"
                };
              }
            }
          }
        }

        fatigued.push({ 
          ...slot, 
          elapsed, 
          isLocalResolvable, 
          localSwapInfo 
        });
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

  // 7. Algoritmo inteligente de matchmaking para sugerir candidatos únicos en L8
  const suggestionsMap = useMemo(() => {
    const map = {};
    const suggestedUserIds = new Set();

    activeFatiguedSlots.forEach(slot => {
      if (slot.isLocalResolvable) {
        map[slot.id] = { candidate: null, count: 0 };
        return;
      }

      const blacklist = slot.rejectedWorkerIds || [];
      const stationName = slot.puestoName;

      // Filtrar candidatos aptos de L8 (no sugeridos previamente en la cola de prioridad)
      const aptCandidates = availableL8Workers.filter(w => {
        if (suggestedUserIds.has(w.id)) return false;
        if (blacklist.includes(w.id)) return false;
        if (!canWorkerOccupiedSlot(w, slot)) return false;
        if (w.lastActivity && w.lastActivity === stationName) return false;
        return true;
      });

      if (aptCandidates.length === 0) {
        map[slot.id] = { candidate: null, count: 0 };
        return;
      }

      const index = skippedIndexes[slot.id] || 0;
      const finalIndex = index % aptCandidates.length;
      const chosenCandidate = aptCandidates[finalIndex];

      map[slot.id] = {
        candidate: chosenCandidate,
        count: aptCandidates.length
      };

      if (chosenCandidate) {
        suggestedUserIds.add(chosenCandidate.id);
      }
    });

    return map;
  }, [activeFatiguedSlots, availableL8Workers, skippedIndexes]);

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
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
              </svg>
              <span>Consola de Prioridad de Relevos Planta</span>
            </SectionTitle>
          </SectionHeader>

          <RelevoList id="l8-fatigue-queue">
            {activeFatiguedSlots.length === 0 ? (
              <EmptyStateCard id="l8-empty-fatigue-queue">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                  <polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
                <span>Planta Estable. Ningún puesto supera los 105 min.</span>
              </EmptyStateCard>
            ) : (
              activeFatiguedSlots.map(slot => {
                const currentWorker = workers[slot.idWorkerCurrent];
                const currentWorkerName = currentWorker ? currentWorker.name : "Operario";
                const suggestionObj = suggestionsMap[slot.id] || { candidate: null, count: 0 };

                return (
                  <RelevoPriorityCard key={slot.id} id={`priority-card-${slot.id}`}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <LineTag>L{slot.lineId}</LineTag>
                        <StationName style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                          {slot.puestoName}
                        </StationName>
                      </div>
                      <OperatorLabel style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                        Fatigado: <strong>{currentWorkerName}</strong>
                      </OperatorLabel>
                    </div>

                    <div style={{ flexShrink: 0 }}>
                      <FatigaTimer>
                        <span>{slot.elapsed}m</span>
                      </FatigaTimer>
                    </div>

                    {slot.isLocalResolvable ? (
                      <div style={{ 
                        flexShrink: 0, 
                        backgroundColor: 'hsl(45, 100%, 94%)', 
                        border: '1px solid hsl(45, 100%, 80%)', 
                        borderRadius: '6px', 
                        padding: '4px 8px', 
                        fontSize: '10px', 
                        color: 'hsl(35, 92%, 35%)', 
                        fontWeight: 700,
                        maxWidth: '130px',
                        textAlign: 'center',
                        textOverflow: 'ellipsis',
                        overflow: 'hidden',
                        whiteSpace: 'nowrap'
                      }}>
                        Autogestión Local
                      </div>
                    ) : (
                      <MatchmakerBox>
                        {suggestionObj.candidate ? (
                          <SuggestionWorker>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', minWidth: '90px' }}>
                              <WorkerName style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '100px' }}>
                                {suggestionObj.candidate.name}
                              </WorkerName>
                              <WorkerId>Sugerido ({suggestionObj.count})</WorkerId>
                            </div>
                            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                              <ActionBtn 
                                variant="accent" 
                                onClick={() => handleDispatchRelevo(slot, suggestionObj.candidate)}
                                id={`dispatch-relevo-${slot.id}-btn`}
                              >
                                <span>Despachar</span>
                              </ActionBtn>
                              <ActionBtn 
                                variant="secondary" 
                                onClick={() => handleSkipSuggestion(slot.id, suggestionObj.count)}
                                id={`skip-relevo-${slot.id}-btn`}
                                style={{ padding: '0 8px' }}
                              >
                                <span>Saltar</span>
                              </ActionBtn>
                              <ActionBtn
                                variant="secondary"
                                onClick={() => setManualDispatchSlot(slot)}
                                id={`manual-relevo-${slot.id}-btn`}
                              >
                                <span>Manual</span>
                              </ActionBtn>
                            </div>
                          </SuggestionWorker>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '10px', color: '#EF4444', fontWeight: 600 }}>Sin candidatos</span>
                            <div style={{ display: 'flex', gap: '4px' }}>
                              <ActionBtn
                                variant="secondary"
                                onClick={() => setManualDispatchSlot(slot)}
                                id={`manual-relevo-${slot.id}-btn`}
                                style={{ backgroundColor: '#EFF6FF', borderColor: '#BFDBFE', color: '#1E40AF' }}
                              >
                                <span>Manual</span>
                              </ActionBtn>
                              {slot.rejectedWorkerIds && slot.rejectedWorkerIds.length > 0 && (
                                <ActionBtn
                                  variant="secondary"
                                  onClick={() => handleClearBlacklist(slot.id)}
                                  id={`clear-blacklist-${slot.id}-btn`}
                                >
                                  <span>Restablecer</span>
                                </ActionBtn>
                              )}
                            </div>
                          </div>
                        )}
                      </MatchmakerBox>
                    )}
                  </RelevoPriorityCard>
                );
              })
            )}
          </RelevoList>

          {/* 📬 ALERTAS DE RETORNO AL BOLSÓN L8 */}
          {inTransitWorkers.length > 0 && (
            <>
              <SectionHeader style={{ marginTop: '16px' }}>
                <SectionTitle style={{ color: '#10B981' }}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.5">
                    <polyline points="17 1 21 5 17 9"/>
                    <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
                    <polyline points="7 23 3 19 7 15"/>
                    <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
                  </svg>
                  <span>Recepción de Retornos al Bolsón</span>
                </SectionTitle>
              </SectionHeader>

              <RelevoList id="l8-transit-queue">
                {inTransitWorkers.map(tw => (
                  <TransitCard key={tw.id} id={`transit-card-${tw.id}`} style={{ borderLeftColor: '#10B981' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <LineTag style={{ color: '#10B981' }}>Retorno L8</LineTag>
                        <StationName style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                          {tw.name}
                        </StationName>
                      </div>
                      <OperatorLabel style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', fontSize: '11px' }}>
                        Ficha: {tw.id} ── En descanso
                      </OperatorLabel>
                    </div>

                    <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                      <ActionBtn 
                        variant="success" 
                        onClick={() => handleAcceptReturnToBolson(tw)}
                        id={`accept-bolson-return-${tw.id}`}
                        style={{ backgroundColor: '#10B981', color: '#FFFFFF' }}
                      >
                        <span>Recibir</span>
                      </ActionBtn>
                    </div>
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
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2.5">
                <path d="M16 3h5v5M8 21H3v-5M12 12l9-9M12 12l-9 9"/>
              </svg>
              <span>Notificaciones y Recepción de Relevos</span>
            </SectionTitle>
          </SectionHeader>

          {/* 📬 ALERTAS DE TRÁNSITO / RECEPCIÓN */}
          <RelevoList id="supervisor-transit-alerts">
            {inTransitWorkers.length === 0 ? (
              <EmptyStateCard id="supervisor-empty-transit">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                  <polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
                <span>Notificaciones y relevos sin novedades.</span>
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
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <LineTag style={{ color: '#A855F7' }}>{destSlot ? 'Relevo' : 'Tránsito'}</LineTag>
                        <StationName style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                          {tw.name}
                        </StationName>
                      </div>
                      <OperatorLabel style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', fontSize: '11px' }}>
                        {destName ? (
                          <span>Destino: <strong>{destName}</strong></span>
                        ) : (
                          <span>Asignación General L{tw.lineaDestinoId}</span>
                        )}
                      </OperatorLabel>
                    </div>

                    {relocationInfo && (
                      <div style={{ 
                        flexShrink: 0, 
                        backgroundColor: '#F8FAFC', 
                        border: '1px solid #E2E8F0', 
                        borderRadius: '6px', 
                        padding: '4px 8px', 
                        fontSize: '10px', 
                        color: '#475569',
                        maxWidth: '120px',
                        textAlign: 'right',
                        marginRight: '4px',
                        textOverflow: 'ellipsis',
                        overflow: 'hidden',
                        whiteSpace: 'nowrap'
                      }}>
                        Reubica: <strong>{relocationInfo.label.split(' ')[0]}</strong>
                      </div>
                    )}

                    {tw.targetSlotId ? (
                      <RowActions>
                        <ActionBtn 
                          variant="success" 
                          onClick={() => handleAcceptRelevo(tw)}
                          id={`accept-transit-relevo-${tw.id}`}
                        >
                          <span>Aceptar</span>
                        </ActionBtn>
                        <ActionBtn 
                          variant="danger" 
                          onClick={() => handleRejectRelevo(tw)}
                          id={`reject-transit-relevo-${tw.id}`}
                        >
                          <span>Rechazar</span>
                        </ActionBtn>
                      </RowActions>
                    ) : (
                      <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexShrink: 0 }}>
                        {vacantLocalSlots.length > 0 ? (
                          <select
                            onChange={(e) => {
                              if (e.target.value) {
                                handleAcceptGeneralTransit(tw, e.target.value);
                                e.target.value = "";
                              }
                            }}
                            style={{
                              height: '32px',
                              padding: '0 8px',
                              borderRadius: '8px',
                              border: '1px solid #CBD5E1',
                              fontSize: '11px',
                              fontWeight: 700,
                              color: '#2563EB',
                              backgroundColor: '#EFF6FF',
                              outline: 'none',
                              cursor: 'pointer'
                            }}
                            id={`reassign-transit-select-${tw.id}`}
                            defaultValue=""
                          >
                            <option value="" disabled>Ubicar en...</option>
                            {vacantLocalSlots.map(v => (
                              <option key={v.id} value={v.id}>{v.puestoName}</option>
                            ))}
                          </select>
                        ) : (
                          <span style={{ fontSize: '10px', color: '#EF4444', fontWeight: 600 }}>Sin vacantes</span>
                        )}
                        <ActionBtn 
                          variant="danger" 
                          onClick={() => handleRejectRelevo(tw)}
                          id={`reject-transit-relevo-${tw.id}`}
                        >
                          <span>Rechazar</span>
                        </ActionBtn>
                      </div>
                    )}
                  </TransitCard>
                );
              })
            )}
          </RelevoList>

          {/* BITÁCORA GENERAL DE ALERTAS DE PLANTA */}
          <SubSectionTitle>
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
            <span>Canal de Notificaciones de Planta</span>
          </SubSectionTitle>

          <div id="plant-wide-notifs-feed">
            {activeFatiguedSlots.filter(s => s.lineId !== supervisorLineId).length === 0 ? (
              <EmptyStateCard style={{ borderStyle: 'solid' }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                  <polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
                <span>Sin alertas de fatiga externas en planta.</span>
              </EmptyStateCard>
            ) : (
              <PlantAlertGroup>
                {activeFatiguedSlots.filter(s => s.lineId !== supervisorLineId).map(slot => (
                  <PlantAlertItem key={slot.id}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <circle cx="12" cy="12" r="10"/>
                      <line x1="12" y1="8" x2="12" y2="12"/>
                      <line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                    <span>L{slot.lineId} necesita relevo en "{slot.puestoName}" ({slot.elapsed}m).</span>
                  </PlantAlertItem>
                ))}
              </PlantAlertGroup>
            )}
          </div>
        </>
      )}

      {/* 🔵 MODAL DE ASIGNACIÓN MANUAL DESDE EL BOLSÓN L8 */}
      {manualDispatchSlot && (
        <ConfirmationOverlay onClick={() => setManualDispatchSlot(null)} id="manual-dispatch-modal">
          <ConfirmationContent onClick={(e) => e.stopPropagation()}>
            <div>
              <DialogTitle>Asignación Manual: Línea {manualDispatchSlot.lineId}</DialogTitle>
              <DialogSubtitle style={{ marginTop: '4px' }}>
                Selecciona un operario libre del Bolsón L8 para despachar a: <strong>{manualDispatchSlot.puestoName}</strong>
              </DialogSubtitle>
            </div>

            <WorkerListContainer>
              {availableL8Workers.length === 0 ? (
                <div style={{ fontSize: '12px', color: '#EF4444', textAlign: 'center', padding: '16px', border: '1px dashed #FCA5A5', borderRadius: '8px', backgroundColor: '#FEE2E2', fontWeight: 500 }}>
                  No hay operarios disponibles en el Bolsón L8 actualmente.
                </div>
              ) : (
                availableL8Workers.map(w => {
                  const matches = canWorkerOccupiedSlot(w, manualDispatchSlot);
                  return (
                    <WorkerListItem
                      key={w.id}
                      onClick={async () => {
                        const slot = manualDispatchSlot;
                        const worker = w;
                        setManualDispatchSlot(null);
                        await handleDispatchRelevo(slot, worker);
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <strong style={{ fontSize: '12px', color: '#1E293B' }}>{w.name}</strong>
                        <span style={{ fontSize: '10px', color: '$textSecondary', fontFamily: 'monospace' }}>
                          Ficha: {w.id} ── {w.role}
                        </span>
                        {w.medicalRestrictions && w.medicalRestrictions.length > 0 && (
                          <span style={{ alignSelf: 'flex-start', marginTop: '2px', fontSize: '8px', fontWeight: 700, color: '#991B1B', backgroundColor: '#FEE2E2', padding: '1px 4px', borderRadius: '3px' }}>
                            ⚠️ REST. MÉDICA
                          </span>
                        )}
                      </div>
                      <span style={{ 
                        fontSize: '11px', 
                        fontWeight: 700, 
                        color: matches ? '#2563EB' : '#EF4444',
                        backgroundColor: matches ? '#DBEAFE' : '#FEE2E2',
                        padding: '4px 8px',
                        borderRadius: '6px'
                      }}>
                        {matches ? 'Despachar' : 'Incompatible'}
                      </span>
                    </WorkerListItem>
                  );
                })
              )}
            </WorkerListContainer>

            <CancelBtn onClick={() => setManualDispatchSlot(null)}>
              Cancelar
            </CancelBtn>
          </ConfirmationContent>
        </ConfirmationOverlay>
      )}
    </RelevosContainer>
  );
}
