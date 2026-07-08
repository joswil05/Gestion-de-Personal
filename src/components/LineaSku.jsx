import React, { useState, useEffect, useRef, useMemo } from 'react';
import { styled } from '../styles/theme';
import { db, puestosColl, startLineParoTransaction, endLineParoTransaction } from '../services/firebaseService';
import { doc, onSnapshot, setDoc, updateDoc, writeBatch, getDocs, where, query, serverTimestamp } from 'firebase/firestore';
import { triggerNativeHapticFeedback } from '../skills/capacitor-android-bridge';
import { useStopTimer } from './StopTimerContext';

// --- STITCHES STYLED COMPONENTS ---

const SkuContainer = styled('div', {
  padding: '12px 16px calc(80px + env(safe-area-inset-bottom, 0px)) 16px',
  fontFamily: '$sans',
  display: 'flex',
  flexDirection: 'column',
  gap: '14px',
  backgroundColor: '$background',
  minHeight: '100vh'
});

const SkuHeader = styled('div', {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  paddingBottom: '4px'
});

const SkuTitle = styled('h2', {
  fontSize: '14px',
  fontWeight: 700,
  color: '$textPrimary',
  display: 'flex',
  alignItems: 'center',
  gap: '6px'
});

const SectionCard = styled('div', {
  backgroundColor: '$card',
  border: '1px solid $border',
  borderRadius: '12px',
  padding: '16px',
  boxShadow: '$subtle',
  display: 'flex',
  flexDirection: 'column',
  gap: '12px'
});

const SectionTitle = styled('h3', {
  fontSize: '11px',
  fontWeight: 700,
  color: '$textSecondary',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  padding: '10px 14px 4px 14px',
  borderBottom: '1px solid $border',
  margin: 0,
  backgroundColor: '$card'
});

const Row = styled('div', {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '10px 0',
  borderBottom: '1px solid $border',

  '&:last-child': {
    borderBottom: 'none'
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
  fontSize: '12px',
  fontWeight: 700,
  color: '$accent',
  backgroundColor: 'hsl(217, 91%, 95%)',
  border: '1px solid hsl(217, 91%, 88%)',
  padding: '4px 10px',
  borderRadius: '6px',
  cursor: 'pointer',
  fontFamily: 'monospace',
  transition: 'all 0.15s ease',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',

  '&:hover': {
    backgroundColor: 'hsl(217, 91%, 92%)',
    borderColor: '$accent'
  },
  '&:active': {
    transform: 'scale(0.97)'
  }
});

const StatusBadge = styled('span', {
  fontSize: '9px',
  fontWeight: 700,
  padding: '4px 10px',
  borderRadius: '12px',
  textTransform: 'uppercase',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  letterSpacing: '0.3px',

  variants: {
    status: {
      PRODUCCION: {
        backgroundColor: '$successBg',
        color: '$successBorder',
        border: '1px solid hsl(142, 70%, 90%)'
      },
      ARRANQUE: {
        backgroundColor: '$successBg',
        color: '$successBorder',
        border: '1px solid hsl(142, 70%, 90%)'
      },
      PREPARACION: {
        backgroundColor: '$dangerBg',
        color: '$dangerBorder',
        border: '1px solid hsl(0, 100%, 90%)'
      },
      PARO: {
        backgroundColor: '$dangerBg',
        color: '$dangerBorder',
        border: '1px solid hsl(0, 100%, 90%)'
      }
    }
  }
});

const StatusDot = styled('span', {
  width: '5px',
  height: '5px',
  borderRadius: '50%',
  display: 'inline-block',

  variants: {
    status: {
      PRODUCCION: {
        backgroundColor: '$successBorder'
      },
      ARRANQUE: {
        backgroundColor: '$successBorder'
      },
      PREPARACION: {
        backgroundColor: '$dangerBorder'
      },
      PARO: {
        backgroundColor: '$dangerBorder'
      }
    }
  }
});

const FormGroup = styled('div', {
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
  padding: '12px 14px',
  backgroundColor: '$card',
  borderBottom: '1px solid $border'
});

const FormLabel = styled('label', {
  fontSize: '11px',
  fontWeight: 700,
  color: '$textSecondary',
  letterSpacing: '0.3px',
  textTransform: 'uppercase'
});

const Select = styled('select', {
  border: 'none',
  backgroundColor: 'transparent',
  fontSize: '13px',
  fontWeight: 700,
  color: '$accent',
  textAlign: 'right',
  outline: 'none',
  cursor: 'pointer',
  padding: '4px 0',
  direction: 'rtl',
  fontFamily: '$sans',

  '& option': {
    color: '$textPrimary',
    backgroundColor: '$card',
    direction: 'ltr'
  }
});

const Textarea = styled('textarea', {
  width: '100%',
  padding: '8px 10px',
  minHeight: '48px',
  borderRadius: '6px',
  border: '1px solid $border',
  backgroundColor: '#F8FAFC',
  fontSize: '12px',
  color: '$textPrimary',
  fontWeight: 500,
  outline: 'none',
  fontFamily: '$sans',
  resize: 'none',
  transition: 'all 0.15s ease',

  '&:focus': {
    borderColor: '$accent',
    backgroundColor: '#FFFFFF',
    boxShadow: '0 0 0 2px rgba(37, 99, 235, 0.08)'
  }
});

const FormGrid = styled('div', {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '12px'
});

const SubmitButton = styled('button', {
  width: '100%',
  padding: '10px 14px',
  minHeight: '36px',
  fontSize: '12px',
  fontWeight: 700,
  borderRadius: '8px',
  border: 'none',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px',
  transition: 'all 0.15s cubic-bezier(0.16, 1, 0.3, 1)',

  '&:active': {
    transform: 'scale(0.97)'
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
        backgroundColor: '$dangerBorder',
        color: '#FFFFFF',
        '&:hover': {
          backgroundColor: '#B91C1C'
        }
      },
      success: {
        backgroundColor: '$successBorder',
        color: '#FFFFFF',
        '&:hover': {
          backgroundColor: '#15803D'
        }
      }
    }
  }
});

const OeeHeroContainer = styled('div', {
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  padding: '16px',
  backgroundColor: '$card',
  border: '1px solid $border',
  borderRadius: '12px',
  boxShadow: '$subtle',
  boxSizing: 'border-box'
});

const OeeHeaderRow = styled('div', {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '12px'
});

const OeeValueText = styled('span', {
  fontSize: '40px',
  fontWeight: 800,
  color: '$textPrimary',
  letterSpacing: '-1.5px',
  lineHeight: 1
});

const OeeLabelText = styled('span', {
  fontSize: '11px',
  fontWeight: 700,
  color: '$textSecondary',
  textTransform: 'uppercase',
  letterSpacing: '0.5px'
});

const OeeProgressBarContainer = styled('div', {
  width: '100%',
  height: '6px',
  backgroundColor: '$border',
  borderRadius: '3px',
  overflow: 'hidden'
});

const OeeProgressBarFill = styled('div', {
  height: '100%',
  borderRadius: '3px',
  transition: 'width 0.8s cubic-bezier(0.16, 1, 0.3, 1)',
  
  variants: {
    level: {
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

const OeeStatsRow = styled('div', {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: '8px',
  marginTop: '2px',
  borderTop: '1px solid $border',
  paddingTop: '10px'
});

const OeeStatCol = styled('div', {
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
  alignItems: 'center'
});

const OeeStatLabel = styled('span', {
  fontSize: '9px',
  fontWeight: 600,
  color: '$textSecondary',
  textTransform: 'uppercase',
  letterSpacing: '0.3px'
});

const OeeStatValue = styled('span', {
  fontSize: '13px',
  fontWeight: 700,
  color: '$textPrimary'
});

const OeeStatusBadge = styled('span', {
  fontSize: '9px',
  fontWeight: 700,
  padding: '3px 8px',
  borderRadius: '12px',
  textTransform: 'uppercase',
  letterSpacing: '0.3px',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  
  variants: {
    status: {
      success: {
        backgroundColor: '$successBg',
        color: '$successBorder',
        border: '1px solid hsl(142, 70%, 90%)'
      },
      warning: {
        backgroundColor: '$warningBg',
        color: '$warningBorder',
        border: '1px solid hsl(45, 100%, 90%)'
      },
      danger: {
        backgroundColor: '$dangerBg',
        color: '$dangerBorder',
        border: '1px solid hsl(0, 100%, 90%)'
      }
    }
  }
});

const FlatRowGroup = styled('div', {
  backgroundColor: '$card',
  border: '1px solid $border',
  borderRadius: '12px',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
  boxShadow: '$subtle'
});

const FlatRow = styled('div', {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '10px 14px',
  backgroundColor: '$card',
  borderBottom: '1px solid $border',
  '&:last-child': {
    borderBottom: 'none'
  }
});

const DenseSectionGroup = styled('div', {
  backgroundColor: '$card',
  border: '1px solid $border',
  borderRadius: '12px',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  boxShadow: '$subtle'
});

const FormRow = styled('div', {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '10px 14px',
  backgroundColor: '$card',
  borderBottom: '1px solid $border',
  gap: '12px',
  '&:last-child': {
    borderBottom: 'none'
  }
});

const MermaHeaderRow = styled('div', {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '8px 14px',
  backgroundColor: '#F8FAFC',
  borderBottom: '1px solid $border'
});

const MermaHeaderCol = styled('span', {
  fontSize: '10px',
  fontWeight: 700,
  color: '$textSecondary',
  textTransform: 'uppercase',
  letterSpacing: '0.5px'
});

const MermaListGroup = styled('div', {
  display: 'flex',
  flexDirection: 'column'
});

const MermaRow = styled('div', {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '8px 14px',
  backgroundColor: '$card',
  borderBottom: '1px solid $border',
  gap: '12px',
  '&:last-child': {
    borderBottom: 'none'
  }
});

const MermaLabel = styled('span', {
  fontSize: '13px',
  fontWeight: 600,
  color: '$textPrimary',
  textTransform: 'capitalize',
  flex: 1
});

const MermaInputsContainer = styled('div', {
  display: 'flex',
  alignItems: 'center',
  gap: '8px'
});

const MermaInputWrapper = styled('div', {
  display: 'flex',
  alignItems: 'center',
  gap: '4px'
});

const MermaInputLabel = styled('span', {
  fontSize: '9px',
  color: '$textSecondary',
  fontWeight: 700,
  textTransform: 'uppercase',
  marginRight: '2px'
});

const MermaNumberInput = styled('input', {
  width: '56px',
  height: '28px',
  padding: '0 6px',
  borderRadius: '6px',
  border: '1px solid $border',
  backgroundColor: '#F8FAFC',
  fontSize: '12px',
  textAlign: 'center',
  fontWeight: 700,
  color: '$textPrimary',
  outline: 'none',
  transition: 'all 0.15s ease',

  '&:focus': {
    borderColor: '$accent',
    backgroundColor: '#FFFFFF',
    boxShadow: '0 0 0 2px rgba(37, 99, 235, 0.08)'
  }
});

const BlockWarning = styled('div', {
  backgroundColor: 'hsl(0, 100%, 97%)',
  borderBottom: '1px solid $border',
  padding: '12px 14px',
  fontSize: '12px',
  color: '$dangerBorder',
  fontWeight: 600,
  lineHeight: 1.4,
  display: 'flex',
  flexDirection: 'column',
  gap: '4px'
});

const MermaSummaryRow = styled('div', {
  display: 'flex', 
  justifyContent: 'space-between', 
  fontSize: '11px', 
  fontWeight: 700, 
  padding: '10px 14px', 
  borderTop: '1px solid $border',
  backgroundColor: '#F8FAFC'
});

const MermaExcessBlock = styled('div', {
  backgroundColor: 'hsl(0, 100%, 97%)',
  borderTop: '1px solid $border',
  borderBottom: '1px solid $border',
  padding: '12px 14px',
  fontSize: '12px',
  color: '$dangerBorder',
  fontWeight: 600,
  lineHeight: 1.4,
  display: 'flex',
  flexDirection: 'column',
  gap: '8px'
});

const ButtonWrapper = styled('div', {
  padding: '12px 14px',
  backgroundColor: '$card',
  display: 'flex',
  flexDirection: 'column',
  gap: '8px'
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

  // 2. Conexión al SKU de la Línea Específica
  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, "config", "global_priority"), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        const lineSku = (data.skuPlan && data.skuPlan[supervisorLineId]) || data.skuAssigned || "SIN PLANIFICAR";
        setSku(lineSku);
      }
    });
    return () => unsubscribe();
  }, [supervisorLineId]);

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
      await startLineParoTransaction(supervisorLineId, masterCategory, slaveCause, symptoms);
      setSymptoms("");
    } catch (err) {
      console.error("[LineaSku] Error al iniciar paro:", err);
      alert("Error al guardar paro en base de datos.");
    }
  };

  // 6. DETENER PARO TÉCNICO (Reanudar Producción)
  const handleEndParo = async () => {
    if (lineState?.status === "PRODUCCION") return;
    triggerNativeHapticFeedback('confirm');

    try {
      await endLineParoTransaction(supervisorLineId);
    } catch (err) {
      console.error("[LineaSku] Error al detener paro:", err);
      alert("Error al reanudar producción.");
    }
  };

  // 7. CÁLCULO DE OEE REACTIVO CIENTÍFICO E INDUSTRIAL
  const oeeCalculations = useMemo(() => {
    if (!lineState) return { oee: 95, availability: 100, performance: 100, quality: 100 };

    const startTimestamp = lineState?.turnStartTimestamp;
    let startMs = Date.now() - 3600000; // Por defecto 1 hora atrás para evitar NaN
    if (startTimestamp) {
      if (typeof startTimestamp.toDate === 'function') {
        startMs = startTimestamp.toDate().getTime();
      } else if (startTimestamp.seconds) {
        startMs = startTimestamp.seconds * 1000;
      } else {
        const ms = new Date(startTimestamp).getTime();
        if (!isNaN(ms)) {
          startMs = ms;
        }
      }
    }
    const totalElapsedSeconds = Math.max(60, Math.floor((Date.now() - startMs) / 1000));

    // Sumar tiempo acumulado de paros
    let totalParoSeconds = 0;
    if (lineState.paros) {
      lineState.paros.forEach(p => {
        totalParoSeconds += p.durationSeconds || 0;
      });
    }

    // Agregar el paro activo si existe
    if (lineState.activeParo && lineState.activeParo.startedAt) {
      const t = lineState.activeParo.startedAt;
      const ms = t.toDate ? t.toDate().getTime() : (t.seconds ? t.seconds * 1000 : new Date(t).getTime());
      if (!isNaN(ms)) {
        totalParoSeconds += Math.max(0, Math.floor((Date.now() - ms) / 1000));
      }
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
    const processWaste = Object.values(mermas || {}).reduce((acc, m) => acc + (parseInt(m?.proceso) || 0), 0);

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
    const totalProcessWaste = Object.values(mermas || {}).reduce((acc, m) => acc + (parseInt(m?.proceso) || 0), 0);
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
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/>
            <path d="m3.3 7 8.7 5 8.7-5"/>
            <path d="M12 22V12"/>
          </svg>
          <span>Línea {supervisorLineId} ── Estado y SKU</span>
        </SkuTitle>
        <StatusBadge status={lineState?.status || "PRODUCCION"}>
          <StatusDot status={lineState?.status || "PRODUCCION"} />
          <span>
            {lineState?.status === "PRODUCCION" || lineState?.status === "ARRANQUE"
              ? "Producción"
              : lineState?.status === "PARO"
              ? "Paro Técnico"
              : "Preparación"}
          </span>
        </StatusBadge>
      </SkuHeader>

      {/* TARJETA 1: MÉTRICAS OEE REACTIVAS */}
      <OeeHeroContainer id="oee-reactivo-widget">
        <OeeHeaderRow>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
            <OeeValueText>{oeeCalculations.oee || 0}%</OeeValueText>
            <OeeLabelText>OEE</OeeLabelText>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
            <OeeStatusBadge status={(oeeCalculations.oee || 0) >= 85 ? "success" : (oeeCalculations.oee || 0) >= 70 ? "warning" : "danger"}>
              {(oeeCalculations.oee || 0) >= 85 ? "Óptimo" : (oeeCalculations.oee || 0) >= 70 ? "Medio" : "Bajo"}
            </OeeStatusBadge>
            <span style={{ fontSize: '10px', fontWeight: 600, color: '#475569' }}>
              Est: <strong>{oeeCalculations.estimatedProduction} pzs</strong>
            </span>
          </div>
        </OeeHeaderRow>

        <OeeProgressBarContainer>
          <OeeProgressBarFill 
            level={(oeeCalculations.oee || 0) >= 85 ? "success" : (oeeCalculations.oee || 0) >= 70 ? "warning" : "danger"} 
            style={{ width: `${Math.min(100, Math.max(0, oeeCalculations.oee || 0))}%` }}
          />
        </OeeProgressBarContainer>

        <OeeStatsRow>
          <OeeStatCol>
            <OeeStatLabel>Disponibilidad</OeeStatLabel>
            <OeeStatValue>{oeeCalculations.availability}%</OeeStatValue>
          </OeeStatCol>
          <OeeStatCol>
            <OeeStatLabel>Rendimiento</OeeStatLabel>
            <OeeStatValue>{oeeCalculations.performance}%</OeeStatValue>
          </OeeStatCol>
          <OeeStatCol>
            <OeeStatLabel>Calidad</OeeStatLabel>
            <OeeStatValue>{oeeCalculations.quality}%</OeeStatValue>
          </OeeStatCol>
        </OeeStatsRow>
      </OeeHeroContainer>

      {/* TARJETA 2: DATOS DEL LOTE ACTUAL */}
      <FlatRowGroup>
        <FlatRow>
          <Label>Línea a Cargo</Label>
          <Value>{supervisorLineId}</Value>
        </FlatRow>
        
        <FlatRow>
          <Label>SKU Activo (Lote)</Label>
          <SkuValue onClick={handleSkuClick} id="sku-detector-trigger">
            {sku}
          </SkuValue>
        </FlatRow>

        <FlatRow>
          <Label>Velocidad Teórica</Label>
          <Value>{sku.includes("BOST") ? "120 pzs/min" : sku.includes("LITE") ? "80 pzs/min" : "100 pzs/min"}</Value>
        </FlatRow>
      </FlatRowGroup>

      {/* TARJETA 3: REGISTRO DE PAROS TÉCNICOS JERÁRQUICOS */}
      <DenseSectionGroup id="paro-tecnico-card">
        <SectionTitle>
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2.5">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <line x1="9" y1="9" x2="15" y2="15"/>
            <line x1="15" y1="9" x2="9" y2="15"/>
          </svg>
          <span>Registro de Paros Técnicos</span>
        </SectionTitle>

        {lineState?.status === "PRODUCCION" || lineState?.status === "ARRANQUE" ? (
          <form onSubmit={handleStartParo} style={{ display: 'flex', flexDirection: 'column', margin: 0 }}>
            <FormRow>
              <FormLabel htmlFor="master-category">Categoría</FormLabel>
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
            </FormRow>

            <FormRow>
              <FormLabel htmlFor="slave-cause">Causa Técnica</FormLabel>
              <Select 
                id="slave-cause" 
                value={slaveCause} 
                onChange={(e) => setSlaveCause(e.target.value)}
              >
                {PARO_MAP[masterCategory].map(cause => (
                  <option key={cause} value={cause}>{cause.replaceAll('_', ' ')}</option>
                ))}
              </Select>
            </FormRow>

            <FormGroup>
              <FormLabel htmlFor="symptoms-input" style={{ marginBottom: '4px' }}>Síntomas del Equipo / Comentarios</FormLabel>
              <Textarea 
                id="symptoms-input" 
                placeholder="Describa síntomas físicos observados del equipo..." 
                value={symptoms}
                onChange={(e) => setSymptoms(e.target.value)}
              />
            </FormGroup>

            <ButtonWrapper>
              <SubmitButton 
                type="submit" 
                intent="danger" 
                id="toggle-paro-tecnico-button"
              >
                REGISTRAR PARO E INICIAR DETENCIÓN
              </SubmitButton>
            </ButtonWrapper>
          </form>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <BlockWarning>
              <strong style={{ fontSize: '11px', textTransform: 'uppercase' }}>
                Línea Parada ── {lineState?.status === "PARO" ? "Paro Técnico" : "Modo Preparación"}
              </strong>
              <div style={{ fontSize: '11px', opacity: 0.9 }}>
                Categoría: <strong>{lineState?.activeParo?.category}</strong>
              </div>
              <div style={{ fontSize: '11px', opacity: 0.9 }}>
                Causa: <strong>{lineState?.activeParo?.cause.replaceAll('_', ' ')}</strong>
              </div>
              <div style={{ fontSize: '11px', opacity: 0.85 }}>
                Síntomas: {lineState?.activeParo?.symptoms}
              </div>
            </BlockWarning>

            <ButtonWrapper>
              <SubmitButton 
                onClick={handleEndParo} 
                intent="success" 
                id="toggle-paro-tecnico-button"
              >
                REANUDAR PRODUCCIÓN DE LÍNEA
              </SubmitButton>
            </ButtonWrapper>
          </div>
        )}
      </DenseSectionGroup>

      {/* TARJETA 4: FORMULARIO DUAL DE MERMAS OBLIGATORIO */}
      <DenseSectionGroup id="formulario-mermas-card">
        <SectionTitle>
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2.5">
            <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
          </svg>
          <span>Formulario de Mermas</span>
        </SectionTitle>

        <MermaHeaderRow>
          <MermaHeaderCol>Material</MermaHeaderCol>
          <div style={{ display: 'flex', gap: '30px', paddingRight: '12px' }}>
            <MermaHeaderCol>Inventario</MermaHeaderCol>
            <MermaHeaderCol>Proceso</MermaHeaderCol>
          </div>
        </MermaHeaderRow>

        <MermaListGroup>
          {Object.keys(mermas || {}).map(material => (
            <MermaRow key={material}>
              <MermaLabel>{material}</MermaLabel>
              <MermaInputsContainer>
                <MermaInputWrapper>
                  <MermaNumberInput 
                    type="number"
                    min="0"
                    id={`merma-${material}-inventario`}
                    value={mermas[material]?.inventario ?? 0}
                    onChange={(e) => handleMermaChange(material, 'inventario', e.target.value)}
                  />
                </MermaInputWrapper>
                <MermaInputWrapper>
                  <MermaNumberInput 
                    type="number"
                    min="0"
                    id={`merma-${material}-proceso`}
                    value={mermas[material]?.proceso ?? 0}
                    onChange={(e) => handleMermaChange(material, 'proceso', e.target.value)}
                  />
                </MermaInputWrapper>
              </MermaInputsContainer>
            </MermaRow>
          ))}
        </MermaListGroup>

        <MermaSummaryRow>
          <span style={{ color: '#475569' }}>Desperdicio Proceso Total:</span>
          <span style={{ color: wasteExceedsLimit ? 'hsl(0, 84%, 44%)' : 'hsl(142, 72%, 29%)' }}>
            {oeeCalculations.processWaste} pzs ({processWastePercentage.toFixed(1)}%)
          </span>
        </MermaSummaryRow>

        {wasteExceedsLimit && (
          <MermaExcessBlock id="merma-exceeds-warning">
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ flexShrink: 0 }}>
                <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
                <line x1="12" y1="9" x2="12" y2="13"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              <strong style={{ fontSize: '11px' }}>DESPERDICIO EXCESIVO ({processWastePercentage.toFixed(1)}% &gt; 5.0%)</strong>
            </div>
            <span style={{ fontSize: '11px', opacity: 0.9 }}>
              El desperdicio supera el límite tolerado del 5.0%. Justifique los factores de merma.
            </span>
            <FormGroup style={{ gap: '4px', padding: 0, borderBottom: 'none', backgroundColor: 'transparent' }}>
              <FormLabel style={{ color: 'hsl(0, 84%, 44%)', fontSize: '10px' }} htmlFor="merma-justification-input">Justificación Industrial</FormLabel>
              <Textarea 
                id="merma-justification-input"
                placeholder="Escriba los factores y síntomas que justifican la merma..."
                value={mermaJustification}
                onChange={(e) => setMermaJustification(e.target.value)}
                style={{ borderColor: '#FDA4AF', backgroundColor: '#FFF5F5' }}
              />
            </FormGroup>
          </MermaExcessBlock>
        )}

        <ButtonWrapper>
          <SubmitButton 
            intent="primary"
            disabled={isSaveMermaDisabled}
            onClick={handleSaveMermas}
            id="submit-mermas-button"
          >
            REGISTRAR Y GUARDAR MERMAS DEL LOTE
          </SubmitButton>

          {mermaSavedMsg && (
            <div id="merma-saved-toast" style={{ fontSize: '11px', color: 'hsl(142, 72%, 25%)', fontWeight: 700, textAlign: 'center', backgroundColor: '$successBg', padding: '8px', borderRadius: '6px', border: '1px solid hsl(142, 70%, 90%)' }}>
              ✓ Mermas sincronizadas exitosamente.
            </div>
          )}
        </ButtonWrapper>
      </DenseSectionGroup>

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
