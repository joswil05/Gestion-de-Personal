import React, { useState, useEffect, useRef, useMemo } from 'react';
import { styled } from '../styles/theme';
import { db, puestosColl } from '../services/firebaseService';
import { doc, onSnapshot, setDoc, updateDoc, writeBatch, getDocs, where, query, serverTimestamp } from 'firebase/firestore';
import { triggerNativeHapticFeedback } from '../skills/capacitor-android-bridge';
import { useStopTimer } from './StopTimerContext';

// --- STITCHES STYLED COMPONENTS ---

const SkuContainer = styled('div', {
  padding: '16px 20px calc(100px + env(safe-area-inset-bottom, 0px)) 20px',
  fontFamily: '$sans',
  display: 'flex',
  flexDirection: 'column',
  gap: '20px'
});

const SkuHeader = styled('div', {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  borderBottom: '1px solid $border',
  paddingBottom: '16px'
});

const SkuTitle = styled('h2', {
  fontSize: '16px',
  fontWeight: 700,
  color: '$textPrimary',
  display: 'flex',
  alignItems: 'center',
  gap: '8px'
});

const SectionCard = styled('div', {
  backgroundColor: '$card',
  border: '1px solid $border',
  borderRadius: '16px',
  padding: '20px 24px',
  boxShadow: '$elevation1',
  display: 'flex',
  flexDirection: 'column',
  gap: '16px',
  transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
});

const SectionTitle = styled('h3', {
  fontSize: '13.5px',
  fontWeight: 700,
  color: '$textPrimary',
  borderBottom: '1px solid $border',
  paddingBottom: '12px',
  display: 'flex',
  alignItems: 'center',
  gap: '8px'
});

const Row = styled('div', {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '12px 0',
  borderBottom: '1px solid $border',

  '&:last-child': {
    borderBottom: 'none',
    paddingBottom: 0
  },
  '&:first-child': {
    paddingTop: 0
  }
});

const Label = styled('span', {
  fontSize: '12px',
  fontWeight: 600,
  color: '$textSecondary'
});

const Value = styled('span', {
  fontSize: '13px',
  fontWeight: 700,
  color: '$textPrimary'
});

const SkuValue = styled('span', {
  fontSize: '13px',
  fontWeight: 700,
  color: '$accent',
  backgroundColor: '$infoBg',
  border: '1px solid #BFDBFE',
  padding: '8px 14px',
  borderRadius: '8px',
  cursor: 'pointer',
  fontFamily: 'monospace',
  transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
  boxShadow: '0 1px 2px rgba(0,0,0,0.02)',

  '&:hover': {
    backgroundColor: '#DBEAFE',
    borderColor: '$accent',
    transform: 'scale(1.03)'
  },
  '&:active': {
    transform: 'scale(0.96)'
  }
});

const StatusBadge = styled('span', {
  fontSize: '10px',
  fontWeight: 700,
  padding: '5px 12px',
  borderRadius: '20px',
  textTransform: 'uppercase',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  letterSpacing: '0.3px',

  variants: {
    status: {
      PRODUCCION: {
        backgroundColor: '$successBg',
        color: '$successBorder',
        border: '1px solid #BBF7D0'
      },
      PREPARACION: {
        backgroundColor: '$warningBg',
        color: '$warningBorder',
        border: '1px solid #FEF08A'
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
    status: {
      PRODUCCION: {
        backgroundColor: '$successBorder'
      },
      PREPARACION: {
        backgroundColor: '$warningBorder'
      }
    }
  }
});

const FormGroup = styled('div', {
  display: 'flex',
  flexDirection: 'column',
  gap: '6px'
});

const FormLabel = styled('label', {
  fontSize: '11px',
  fontWeight: 700,
  color: '$textSecondary',
  letterSpacing: '0.3px'
});

const Select = styled('select', {
  width: '100%',
  padding: '10px 14px',
  minHeight: '44px', // Android touch targets
  borderRadius: '10px',
  border: '1px solid $border',
  backgroundColor: '#FFFFFF',
  fontSize: '13px',
  color: '$textPrimary',
  fontWeight: 500,
  outline: 'none',
  boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
  transition: 'all 0.2s ease',

  '&:focus': {
    borderColor: '$accent',
    boxShadow: '0 0 0 3px rgba(37, 99, 235, 0.12)'
  }
});

const Textarea = styled('textarea', {
  width: '100%',
  padding: '12px 14px',
  minHeight: '80px',
  borderRadius: '10px',
  border: '1px solid $border',
  backgroundColor: '#FFFFFF',
  fontSize: '13px',
  color: '$textPrimary',
  fontWeight: 500,
  outline: 'none',
  fontFamily: '$sans',
  resize: 'none',
  boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
  transition: 'all 0.2s ease',

  '&:focus': {
    borderColor: '$accent',
    boxShadow: '0 0 0 3px rgba(37, 99, 235, 0.12)'
  }
});

const FormGrid = styled('div', {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '12px'
});

const SubmitButton = styled('button', {
  width: '100%',
  padding: '12px 16px',
  minHeight: '44px', // Android touch targets
  fontSize: '12.5px',
  fontWeight: 700,
  borderRadius: '10px',
  border: 'none',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px',
  transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',

  '&:active': {
    transform: 'scale(0.96)'
  },

  variants: {
    intent: {
      primary: {
        backgroundColor: '$accent',
        color: '#FFFFFF',
        '&:hover': {
          backgroundColor: '#1D4ED8'
        },
        '&:disabled': {
          backgroundColor: '#94A3B8',
          cursor: 'not-allowed'
        }
      },
      danger: {
        backgroundColor: '$dangerBg',
        color: '$dangerBorder',
        border: '1px solid $dangerBorder',
        '&:hover': {
          backgroundColor: '#FCA5A5'
        }
      },
      success: {
        backgroundColor: '$successBg',
        color: '$successBorder',
        border: '1px solid $successBorder',
        '&:hover': {
          backgroundColor: '#86EFAC'
        }
      }
    }
  }
});

const MermaTable = styled('table', {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '11px',
  fontFamily: '$sans'
});

const Th = styled('th', {
  textAlign: 'left',
  padding: '8px',
  color: '$textSecondary',
  fontWeight: 700,
  borderBottom: '1px solid $border'
});

const Td = styled('td', {
  padding: '8px 4px',
  borderBottom: '1px solid $border',
  verticalAlign: 'middle'
});

const NumberInput = styled('input', {
  width: '70px',
  padding: '6px 8px',
  borderRadius: '6px',
  border: '1px solid $border',
  backgroundColor: '#FFFFFF',
  fontSize: '11px',
  textAlign: 'center',
  outline: 'none',

  '&:focus': {
    borderColor: '$accent',
    boxShadow: '0 0 0 2px rgba(37, 99, 235, 0.05)'
  }
});

const BlockWarning = styled('div', {
  backgroundColor: '#FFF1F2',
  border: '1px solid #FDA4AF',
  borderRadius: '12px',
  padding: '16px 20px',
  fontSize: '12px',
  color: '#BE123C',
  fontWeight: 600,
  lineHeight: 1.5,
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
  boxShadow: '0 4px 12px rgba(225, 29, 72, 0.05)'
});

const OeeMeterContainer = styled('div', {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px'
});

const OeeHeader = styled('div', {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline'
});

const OeePercent = styled('span', {
  fontSize: '28px',
  fontWeight: 800,
  fontFamily: 'monospace'
});

const ProgressTrack = styled('div', {
  height: '10px',
  backgroundColor: '#E2E8F0',
  borderRadius: '5px',
  overflow: 'hidden'
});

const ProgressBar = styled('div', {
  height: '100%',
  transition: 'width 0.5s ease',

  variants: {
    status: {
      success: {
        backgroundColor: '$successBorder'
      },
      warning: {
        backgroundColor: '$warningBorder'
      },
      danger: {
        backgroundColor: '$dangerBorder'
      }
    }
  }
});

const PromptToast = styled('div', {
  backgroundColor: '#1E293B',
  color: '#38BDF8',
  borderRadius: '8px',
  padding: '12px 16px',
  fontSize: '11px',
  fontFamily: 'monospace',
  marginTop: '8px',
  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
  borderLeft: '4px solid $accent',
  display: 'flex',
  alignItems: 'center',
  gap: '8px'
});

// --- CONSTANTS MAPPING ---

const PARO_MAP = {
  "MECÁNICO": [
    "ATASCO_DE_CADENA",
    "ROTURA_DE_BANDA",
    "DESALINEACIÓN_DE_GUÍAS",
    "DESGASTE_DE_RODAMIENTO"
  ],
  "ELÉCTRICO": [
    "CORTO_CIRCUITO",
    "FALLA_DE_SENSOR",
    "SOBRECARGA_DE_MOTOR",
    "FUSIBLE_QUEMADO"
  ],
  "CALIDAD": [
    "MAL_SELLADO",
    "ETIQUETA_ALINEADA_INCORRECTAMENTE",
    "DOSIFICACIÓN_INCORRECTA",
    "FRASCO_RAYADO"
  ],
  "FALTA_DE_MATERIAL": [
    "SIN_BOTELLAS",
    "SIN_TAPAS",
    "SIN_ESTUCHES",
    "SIN_ETIQUETAS"
  ]
};

// --- COMPONENT IMPLEMENTATION ---

export default function LineaSku({ supervisorLineId = "L4" }) {
  const { activeParo } = useStopTimer();

  // Estados locales del SKU y base de datos
  const [sku, setSku] = useState("Cargando SKU...");
  const [lineState, setLineState] = useState(null);
  const [puestosList, setPuestosList] = useState([]);
  const [resetPromptVisible, setResetPromptVisible] = useState(false);

  // Estados locales para el Formulario de Paros
  const [masterCategory, setMasterCategory] = useState("MECÁNICO");
  const [slaveCause, setSlaveCause] = useState(PARO_MAP["MECÁNICO"][0]);
  const [symptoms, setSymptoms] = useState("");

  // Estados locales para el Formulario de Mermas (Dual)
  const [mermas, setMermas] = useState({
    tapon: { inventario: 0, proceso: 0 },
    botella: { inventario: 0, proceso: 0 },
    estuche: { inventario: 0, proceso: 0 },
    etiqueta: { inventario: 0, proceso: 0 }
  });
  const [mermaJustification, setMermaJustification] = useState("");
  const [mermaSavedMsg, setMermaSavedMsg] = useState(false);

  const clickCountRef = useRef(0);
  const clickTimerRef = useRef(null);

  // 1. Escuchar los puestos locales para calcular la cobertura reactiva en Performance
  useEffect(() => {
    const q = query(puestosColl, where("lineId", "==", supervisorLineId));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = [];
      snapshot.forEach(docSnap => {
        list.push(docSnap.data());
      });
      setPuestosList(list);
    });
    return () => unsubscribe();
  }, [supervisorLineId]);

  // 2. Conexión al SKU Global
  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, "config", "global_priority"), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setSku(data.skuAssigned || "SIN PLANIFICAR");
      }
    });
    return () => unsubscribe();
  }, []);

  // 3. Conexión al Estado de la Línea (Paros, Mermas, OEE, Tiempos) en Firestore
  useEffect(() => {
    const lineDocRef = doc(db, "config", `line_${supervisorLineId}`);
    const unsubscribe = onSnapshot(lineDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setLineState(data);
        if (data.mermas) {
          setMermas(data.mermas);
        }
        if (data.mermaJustification) {
          setMermaJustification(data.mermaJustification);
        }
      } else {
        // Inicializar documento de línea si no existe
        const initialData = {
          status: "PRODUCCION",
          sku: "SKU-990-BOST",
          activeParo: null,
          paros: [],
          mermas: {
            tapon: { inventario: 0, proceso: 0 },
            botella: { inventario: 0, proceso: 0 },
            estuche: { inventario: 0, proceso: 0 },
            etiqueta: { inventario: 0, proceso: 0 }
          },
          mermaJustification: "",
          oee: 95,
          turnStartTimestamp: new Date()
        };
        setDoc(lineDocRef, initialData);
        setLineState(initialData);
      }
    });
    return () => unsubscribe();
  }, [supervisorLineId]);

  // Ajustar la causa esclava reactivamente cuando cambia la categoría master
  const handleMasterChange = (e) => {
    const cat = e.target.value;
    setMasterCategory(cat);
    setSlaveCause(PARO_MAP[cat][0]);
  };

  // 4. LÓGICA DE DETECTOR MAESTRO (3 toques rápidos = localStorage.clear())
  const handleSkuClick = () => {
    triggerNativeHapticFeedback('short');
    clickCountRef.current += 1;
    if (clickTimerRef.current) clearTimeout(clickTimerRef.current);

    if (clickCountRef.current === 3) {
      triggerNativeHapticFeedback('double');
      localStorage.clear();
      setResetPromptVisible(true);
      setTimeout(() => setResetPromptVisible(false), 5000);
      clickCountRef.current = 0;
      return;
    }
    clickTimerRef.current = setTimeout(() => {
      clickCountRef.current = 0;
    }, 400);
  };

  // 5. REGISTRAR PARO TÉCNICO (Transición a Preparación)
  const handleStartParo = async (e) => {
    e.preventDefault();
    if (!symptoms.trim()) {
      alert("Es obligatorio registrar los síntomas físicos del equipo.");
      return;
    }
    triggerNativeHapticFeedback('confirm');

    try {
      const lineDocRef = doc(db, "config", `line_${supervisorLineId}`);
      
      const newParo = {
        category: masterCategory,
        cause: slaveCause,
        symptoms: symptoms,
        startedAt: new Date()
      };

      // Mutación atómica 1: Registrar Paro en la Línea
      await updateDoc(lineDocRef, {
        status: "PREPARACION",
        activeParo: newParo
      });

      // Mutación atómica 2: Desalojar Puestos Varios de la línea en suspensión (Motor 4)
      console.log(`[Motor 4] Desalojando puestos varios de la línea: ${supervisorLineId}`);
      const qSlots = query(puestosColl, where("lineId", "==", supervisorLineId));
      const snapshotPuestos = await getDocs(qSlots);
      const batch = writeBatch(db);

      snapshotPuestos.forEach(docSnap => {
        const slot = docSnap.data();
        if (slot.tipoPuesto === "Puesto Vario" && slot.idWorkerCurrent) {
          const workerId = slot.idWorkerCurrent;
          batch.update(docSnap.ref, {
            status: "VACANTE",
            idWorkerCurrent: null,
            microCopiaContextual: "Desalojado por Paro Técnico / Preparación de equipo"
          });
          batch.update(doc(db, "trabajadores", workerId), {
            status: "DISPONIBLE_BOLSON",
            currentSlotId: null,
            physicalLineLocation: "L8"
          });
        }
      });
      await batch.commit();

      setSymptoms("");
    } catch (err) {
      console.error("[LineaSku] Error al iniciar paro:", err);
      alert("Error al guardar paro en base de datos.");
    }
  };

  // 6. DETENER PARO TÉCNICO (Reanudar Producción)
  const handleEndParo = async () => {
    if (!lineState?.activeParo) return;
    triggerNativeHapticFeedback('confirm');

    try {
      const lineDocRef = doc(db, "config", `line_${supervisorLineId}`);
      const startedAt = lineState.activeParo.startedAt;
      const startMs = startedAt?.toDate ? startedAt.toDate().getTime() : new Date(startedAt).getTime();
      const durationSeconds = Math.max(1, Math.floor((Date.now() - startMs) / 1000));

      const completedParo = {
        ...lineState.activeParo,
        endedAt: new Date(),
        durationSeconds
      };

      const pastParos = lineState.paros || [];

      await updateDoc(lineDocRef, {
        status: "PRODUCCION",
        activeParo: null,
        paros: [...pastParos, completedParo]
      });

      console.log(`[Paros] Paro completado y guardado. Duración: ${durationSeconds}s`);
    } catch (err) {
      console.error("[LineaSku] Error al detener paro:", err);
    }
  };

  // 7. CÁLCULO DE OEE REACTIVO CIENTÍFICO E INDUSTRIAL
  const oeeCalculations = useMemo(() => {
    if (!lineState) return { oee: 95, availability: 100, performance: 100, quality: 100 };

    const startTimestamp = lineState.turnStartTimestamp;
    const startMs = startTimestamp?.toDate ? startTimestamp.toDate().getTime() : (startTimestamp?.seconds ? startTimestamp.seconds * 1000 : new Date(startTimestamp).getTime());
    const totalElapsedSeconds = Math.max(60, Math.floor((Date.now() - startMs) / 1000));

    // Sumar tiempo acumulado de paros
    let totalParoSeconds = 0;
    if (lineState.paros) {
      lineState.paros.forEach(p => {
        totalParoSeconds += p.durationSeconds || 0;
      });
    }

    // Agregar el paro activo si existe
    if (lineState.activeParo) {
      const paroStartMs = lineState.activeParo.startedAt?.toDate ? lineState.activeParo.startedAt.toDate().getTime() : new Date(lineState.activeParo.startedAt).getTime();
      totalParoSeconds += Math.max(0, Math.floor((Date.now() - paroStartMs) / 1000));
    }

    // Disponibilidad (Availability)
    const runSeconds = Math.max(0, totalElapsedSeconds - totalParoSeconds);
    const availability = totalElapsedSeconds > 0 ? (runSeconds / totalElapsedSeconds) : 1;

    // Velocidad nominal teórica del SKU (piezas por minuto)
    let speedPerMin = 100;
    if (sku.includes("BOST")) speedPerMin = 120;
    else if (sku.includes("LITE")) speedPerMin = 80;

    // Producción Estimada
    const estimatedProduction = Math.max(100, Math.round((runSeconds * speedPerMin) / 60));

    // Mermas totales de proceso
    const processWaste = Object.values(mermas).reduce((acc, m) => acc + (parseInt(m.proceso) || 0), 0);

    // Calidad (Quality)
    const quality = estimatedProduction > 0 ? Math.max(0, Math.min(1, (estimatedProduction - processWaste) / estimatedProduction)) : 1;

    // Rendimiento (Performance)
    // Se calcula en base a la cobertura del personal activo
    const totalSlots = puestosList.length || 8;
    const activeSlots = puestosList.filter(p => p.status === "ASIGNADO").length;
    const coverageFactor = totalSlots > 0 ? (activeSlots / totalSlots) : 1;
    const performance = lineState.status === "PREPARACION" ? 0 : (coverageFactor * 0.98);

    // OEE %
    const oeeVal = Math.round(availability * performance * quality * 100);

    // Sincronizar OEE en base de datos si cambia significativamente
    if (lineState.oee !== oeeVal && !lineState.activeParo) {
      const docRef = doc(db, "config", `line_${supervisorLineId}`);
      updateDoc(docRef, { oee: oeeVal });
    }

    return {
      oee: oeeVal,
      availability: Math.round(availability * 100),
      performance: Math.round(performance * 100),
      quality: Math.round(quality * 100),
      estimatedProduction,
      processWaste
    };
  }, [lineState, puestosList, sku, mermas, supervisorLineId]);

  // 8. FORMULARIO DE MERMAS: LÓGICA DE DUALIDAD Y BLOQUEO DEL 5%
  const handleMermaChange = (material, column, val) => {
    const num = Math.max(0, parseInt(val) || 0);
    setMermas(prev => ({
      ...prev,
      [material]: {
        ...prev[material],
        [column]: num
      }
    }));
  };

  // Validar si el desperdicio supera el 5% de la producción estimada
  const processWastePercentage = useMemo(() => {
    const totalProcessWaste = Object.values(mermas).reduce((acc, m) => acc + (parseInt(m.proceso) || 0), 0);
    const estProd = oeeCalculations.estimatedProduction || 100;
    return (totalProcessWaste / estProd) * 100;
  }, [mermas, oeeCalculations.estimatedProduction]);

  const wasteExceedsLimit = processWastePercentage > 5;
  const isSaveMermaDisabled = wasteExceedsLimit && !mermaJustification.trim();

  const handleSaveMermas = async () => {
    triggerNativeHapticFeedback('confirm');
    try {
      const lineDocRef = doc(db, "config", `line_${supervisorLineId}`);
      await updateDoc(lineDocRef, {
        mermas: mermas,
        mermaJustification: wasteExceedsLimit ? mermaJustification : ""
      });
      setMermaSavedMsg(true);
      setTimeout(() => setMermaSavedMsg(false), 3000);
    } catch (err) {
      console.error("[LineaSku] Error al guardar mermas:", err);
      alert("Error al guardar las mermas en Firestore.");
    }
  };

  return (
    <SkuContainer>
      <SkuHeader>
        <SkuTitle>
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/>
            <path d="m3.3 7 8.7 5 8.7-5"/>
            <path d="M12 22V12"/>
          </svg>
          <span>Línea {supervisorLineId} ── Estado y SKU</span>
        </SkuTitle>
        <StatusBadge status={lineState?.status || "PRODUCCION"}>
          <StatusDot status={lineState?.status || "PRODUCCION"} />
          <span>{lineState?.status === "PRODUCCION" ? "En Producción" : "En Paro Técnico"}</span>
        </StatusBadge>
      </SkuHeader>

      {/* TARJETA 1: MÉTRICAS OEE REACTIVAS */}
      <SectionCard id="oee-reactivo-widget">
        <SectionTitle>
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2.5">
            <line x1="18" y1="20" x2="18" y2="10"/>
            <line x1="12" y1="20" x2="12" y2="4"/>
            <line x1="6" y1="20" x2="6" y2="14"/>
          </svg>
          <span>Eficiencia General del Lote (OEE)</span>
        </SectionTitle>

        <OeeMeterContainer>
          <OeeHeader>
            <OeePercent>{oeeCalculations.oee}%</OeePercent>
            <Label>OEE Nominal Calculado</Label>
          </OeeHeader>

          <ProgressTrack>
            <ProgressBar 
              status={oeeCalculations.oee >= 85 ? "success" : oeeCalculations.oee >= 70 ? "warning" : "danger"}
              style={{ width: `${oeeCalculations.oee}%` }}
              id="oee-progress-bar"
            />
          </ProgressTrack>
        </OeeMeterContainer>

        <FormGrid style={{ marginTop: '4px' }}>
          <Row style={{ flexDirection: 'column', alignItems: 'flex-start', borderBottom: 'none', padding: 0 }}>
            <Label>Disponibilidad</Label>
            <Value>{oeeCalculations.availability}%</Value>
          </Row>
          <Row style={{ flexDirection: 'column', alignItems: 'flex-start', borderBottom: 'none', padding: 0 }}>
            <Label>Calidad</Label>
            <Value>{oeeCalculations.quality}%</Value>
          </Row>
          <Row style={{ flexDirection: 'column', alignItems: 'flex-start', borderBottom: 'none', padding: 0 }}>
            <Label>Rendimiento</Label>
            <Value>{oeeCalculations.performance}%</Value>
          </Row>
          <Row style={{ flexDirection: 'column', alignItems: 'flex-start', borderBottom: 'none', padding: 0 }}>
            <Label>Prod. Estimada</Label>
            <Value>{oeeCalculations.estimatedProduction} pzs</Value>
          </Row>
        </FormGrid>
      </SectionCard>

      {/* TARJETA 2: DATOS DEL LOTE ACTUAL */}
      <SectionCard>
        <Row>
          <Label>Línea a Cargo</Label>
          <Value>{supervisorLineId}</Value>
        </Row>
        
        <Row>
          <Label>SKU Activo (Lote)</Label>
          <SkuValue onClick={handleSkuClick} id="sku-detector-trigger">
            {sku}
          </SkuValue>
        </Row>

        <Row>
          <Label>Velocidad Teórica</Label>
          <Value>{sku.includes("BOST") ? "120 pzs/min" : sku.includes("LITE") ? "80 pzs/min" : "100 pzs/min"}</Value>
        </Row>
      </SectionCard>

      {/* TARJETA 3: REGISTRO DE PAROS TÉCNICOS JERÁRQUICOS */}
      <SectionCard id="paro-tecnico-card">
        <SectionTitle>
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2.5">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <line x1="9" y1="9" x2="15" y2="15"/>
            <line x1="15" y1="9" x2="9" y2="15"/>
          </svg>
          <span>Registro de Paros Técnicos de la Jornada</span>
        </SectionTitle>

        {lineState?.status === "PRODUCCION" ? (
          <form onSubmit={handleStartParo} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <FormGrid>
              <FormGroup>
                <FormLabel htmlFor="master-category">Categoría (Máster)</FormLabel>
                <Select 
                  id="master-category" 
                  value={masterCategory} 
                  onChange={handleMasterChange}
                >
                  <option value="MECÁNICO">Mecánico</option>
                  <option value="ELÉCTRICO">Eléctrico</option>
                  <option value="CALIDAD">Calidad</option>
                  <option value="FALTA_DE_MATERIAL">Falta de Material</option>
                </Select>
              </FormGroup>

              <FormGroup>
                <FormLabel htmlFor="slave-cause">Causa Técnica (Esclavo)</FormLabel>
                <Select 
                  id="slave-cause" 
                  value={slaveCause} 
                  onChange={(e) => setSlaveCause(e.target.value)}
                >
                  {PARO_MAP[masterCategory].map(cause => (
                    <option key={cause} value={cause}>{cause.replaceAll('_', ' ')}</option>
                  ))}
                </Select>
              </FormGroup>
            </FormGrid>

            <FormGroup>
              <FormLabel htmlFor="symptoms-input">Síntomas del Equipo / Comentarios (Obligatorio)</FormLabel>
              <Textarea 
                id="symptoms-input" 
                placeholder="Describa síntomas físicos observados del equipo..." 
                value={symptoms}
                onChange={(e) => setSymptoms(e.target.value)}
              />
            </FormGroup>

            <SubmitButton 
              type="submit" 
              intent="danger" 
              id="toggle-paro-tecnico-button"
            >
              REGISTRAR PARO E INICIAR DETENCIÓN
            </SubmitButton>
          </form>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <BlockWarning style={{ backgroundColor: '#FEF2F2', borderColor: '#FCA5A5', color: '#991B1B' }}>
              <strong>LÍNEA PARADA ── MODO PREPARACIÓN ACTIVO</strong>
              <span>
                Categoría: {lineState?.activeParo?.category} ── Causa: {lineState?.activeParo?.cause.replaceAll('_', ' ')}
              </span>
              <span>
                Síntomas: {lineState?.activeParo?.symptoms}
              </span>
            </BlockWarning>

            <SubmitButton 
              onClick={handleEndParo} 
              intent="success" 
              id="toggle-paro-tecnico-button"
            >
              REANUDAR PRODUCCIÓN DE LÍNEA (PARAR CRONÓMETRO)
            </SubmitButton>
          </div>
        )}
      </SectionCard>

      {/* TARJETA 4: FORMULARIO DUAL DE MERMAS OBLIGATORIO */}
      <SectionCard id="formulario-mermas-card">
        <SectionTitle>
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2.5">
            <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
          </svg>
          <span>Formulario Estructurado de Mermas del Lote</span>
        </SectionTitle>

        <MermaTable>
          <thead>
            <tr>
              <Th>Material</Th>
              <Th>Avería Inventario</Th>
              <Th>Avería Proceso</Th>
            </tr>
          </thead>
          <tbody>
            {Object.keys(mermas).map(material => (
              <tr key={material}>
                <Td style={{ textTransform: 'capitalize', fontWeight: 'bold', color: '#475569' }}>
                  {material}
                </Td>
                <Td>
                  <NumberInput 
                    type="number"
                    min="0"
                    id={`merma-${material}-inventario`}
                    value={mermas[material].inventario}
                    onChange={(e) => handleMermaChange(material, 'inventario', e.target.value)}
                  />
                </Td>
                <Td>
                  <NumberInput 
                    type="number"
                    min="0"
                    id={`merma-${material}-proceso`}
                    value={mermas[material].proceso}
                    onChange={(e) => handleMermaChange(material, 'proceso', e.target.value)}
                  />
                </Td>
              </tr>
            ))}
          </tbody>
        </MermaTable>

        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: 700, padding: '10px 4px', borderTop: '1px solid #E2E8F0', marginTop: '6px' }}>
          <span>Desperdicio de Proceso Actual:</span>
          <span style={{ color: wasteExceedsLimit ? '#DC2626' : '$successBorder' }}>
            {oeeCalculations.processWaste} pzs ({processWastePercentage.toFixed(2)}%)
          </span>
        </div>

        {wasteExceedsLimit && (
          <BlockWarning id="merma-exceeds-warning">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ flexShrink: 0 }}>
                <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
                <line x1="12" y1="9" x2="12" y2="13"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              <strong>BLOQUEO DE SEGURIDAD: DESPERCIPCIO EXCESIVO ({processWastePercentage.toFixed(1)}% &gt; 5.0%)</strong>
            </div>
            <span>
              El desperdicio en proceso supera el límite tolerado de calidad del 5.0%. Debe justificar los factores industriales de merma para desbloquear el registro.
            </span>
            <FormGroup style={{ marginTop: '8px' }}>
              <FormLabel style={{ color: '#9F1239' }} htmlFor="merma-justification-input">Redacte Justificación Industrial Completa</FormLabel>
              <Textarea 
                id="merma-justification-input"
                placeholder="Escriba aquí los factores y síntomas que justifican la merma excesiva..."
                value={mermaJustification}
                onChange={(e) => setMermaJustification(e.target.value)}
                style={{ borderColor: '#FDA4AF', backgroundColor: '#FFF5F5' }}
              />
            </FormGroup>
          </BlockWarning>
        )}

        <SubmitButton 
          intent="primary"
          disabled={isSaveMermaDisabled}
          onClick={handleSaveMermas}
          id="submit-mermas-button"
        >
          REGISTRAR Y GUARDAR MERMAS DEL LOTE
        </SubmitButton>

        {mermaSavedMsg && (
          <div id="merma-saved-toast" style={{ fontSize: '11px', color: '#16A34A', fontWeight: 700, textAlign: 'center', marginTop: '4px', backgroundColor: '#DCFCE7', padding: '8px', borderRadius: '6px' }}>
            ✓ Mermas sincronizadas exitosamente en la nube.
          </div>
        )}
      </SectionCard>

      {resetPromptVisible && (
        <PromptToast id="localstorage-reset-toast">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="4 17 10 11 4 5"/>
            <line x1="12" y1="19" x2="20" y2="19"/>
          </svg>
          <span>[DETECTOR MAESTRO]: localStorage vaciado con éxito. Terminal reseteada a nivel físico.</span>
        </PromptToast>
      )}
    </SkuContainer>
  );
}
