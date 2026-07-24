import React, { useState, useEffect } from 'react';
import { styled } from '../styles/theme';
import { db } from '../services/firebaseService';
import { doc, getDoc } from 'firebase/firestore';
import { triggerNativeHapticFeedback } from '../skills/capacitor-android-bridge';
import { REAL_SUPERVISORS } from '../dev/realDataSeed';
import { loginWithRoleAndLine } from '../services/authService';

// --- STITCHES STYLED LOGIN COMPONENTS ---

const LoginContainer = styled('div', {
  minHeight: '100vh',
  backgroundColor: '$background',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '24px 20px',
  fontFamily: '$sans',
  boxSizing: 'border-box',
  backgroundImage: 'radial-gradient(circle at 10% 20%, rgba(37, 99, 235, 0.03) 0%, transparent 40%), radial-gradient(circle at 90% 80%, rgba(37, 99, 235, 0.03) 0%, transparent 40%)'
});

const LoginCard = styled('div', {
  width: '100%',
  maxWidth: '380px',
  backgroundColor: '$card',
  borderRadius: '20px',
  border: '1px solid $border',
  boxShadow: '$elevation3',
  padding: '36px 28px',
  display: 'flex',
  flexDirection: 'column',
  gap: '24px',
  boxSizing: 'border-box',
  animation: 'slideDown 0.4s cubic-bezier(0.16, 1, 0.3, 1)'
});

const LogoSection = styled('div', {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  textAlign: 'center',
  gap: '10px',
  marginBottom: '4px'
});

const LogoIcon = styled('div', {
  width: '68px',
  height: '68px',
  borderRadius: '18px',
  backgroundColor: '$accent',
  color: '#FFFFFF',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  boxShadow: '0 6px 16px rgba(15, 23, 42, 0.1)',
  transition: 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
  '&:hover': {
    transform: 'scale(1.05)'
  }
});

const AppTitle = styled('h1', {
  fontSize: '24px',
  fontWeight: 700,
  color: '$textPrimary',
  letterSpacing: '-0.02em'
});

const AppSubtitle = styled('p', {
  fontSize: '13px',
  color: '$textSecondary',
  maxWidth: '280px',
  lineHeight: 1.6
});

const FormField = styled('div', {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px'
});

const FormLabel = styled('label', {
  fontSize: '12px',
  fontWeight: 600,
  color: '#475569',
  letterSpacing: '0.01em',
  paddingLeft: '2px'
});

const InputText = styled('input', {
  padding: '14px 16px',
  borderRadius: '10px',
  border: '1px solid $border',
  fontSize: '15px',
  outline: 'none',
  fontFamily: '$sans',
  backgroundColor: '$background',
  minHeight: '48px',
  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
  boxSizing: 'border-box',
  color: '$textPrimary',

  '&:focus': {
    borderColor: '$accent',
    backgroundColor: '#FFFFFF',
    boxShadow: '0 0 0 3px rgba(37, 99, 235, 0.12)'
  }
});

const SelectDropdown = styled('select', {
  padding: '14px 16px',
  borderRadius: '10px',
  border: '1px solid $border',
  fontSize: '15px',
  outline: 'none',
  fontFamily: '$sans',
  backgroundColor: '$background',
  cursor: 'pointer',
  minHeight: '48px',
  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
  boxSizing: 'border-box',
  color: '$textPrimary',

  '&:focus': {
    borderColor: '$accent',
    backgroundColor: '#FFFFFF',
    boxShadow: '0 0 0 3px rgba(37, 99, 235, 0.12)'
  }
});

const LoginButton = styled('button', {
  width: '100%',
  padding: '16px',
  minHeight: '50px',
  backgroundColor: '$accent',
  color: '#FFFFFF',
  border: 'none',
  borderRadius: '12px',
  fontSize: '15px',
  fontWeight: 600,
  cursor: 'pointer',
  boxShadow: '0 4px 14px rgba(15, 23, 42, 0.08)',
  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
  marginTop: '12px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  letterSpacing: '-0.01em',

  '&:hover': {
    backgroundColor: '#1D4ED8',
    boxShadow: '0 6px 20px rgba(15, 23, 42, 0.12)'
  },
  '&:active': {
    transform: 'scale(0.97)',
    boxShadow: '0 2px 8px rgba(15, 23, 42, 0.06)'
  }
});

// --- COMPONENT IMPLEMENTATION ---

/**
 * LoginScreen Component - Pantalla de acceso hermético y selección de línea operativa
 * Estética: Premium SaaS Light. Prohibido el uso de emojis.
 * 
 * @param {function} onLoginSuccess Callback gatillado al autenticarse de forma exitosa
 */
export default function LoginScreen({ onLoginSuccess }) {
  const [supervisorName, setSupervisorName] = useState("");
  const [coordinatorPin, setCoordinatorPin] = useState("9900");
  const [selectedLine, setSelectedLine] = useState("L4");
  const [selectedRole, setSelectedRole] = useState("SUPERVISOR"); // "SUPERVISOR" | "COORDINADOR"
  const [activeLines, setActiveLines] = useState(["L4", "L1", "L2", "L6", "L7", "L5", "L3", "L8", "L9", "L10"]);
  const [supervisorsAssignment, setSupervisorsAssignment] = useState({});
  const [errorText, setErrorText] = useState("");
  const [warningText, setWarningText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Cargar líneas planificadas y prioritarias desde Firestore al montar
  useEffect(() => {
    const fetchConfigData = async () => {
      try {
        const globalPriorityDoc = await getDoc(doc(db, "config", "global_priority"));
        if (globalPriorityDoc.exists()) {
          const data = globalPriorityDoc.data();
          if (data.priorityOrder && data.priorityOrder.length > 0) {
            setActiveLines(data.priorityOrder);
            setSelectedLine(data.priorityOrder[0] || "L4");
          }
        }
      } catch (err) {
        console.warn("[LoginScreen] Error consultando config/global_priority, usando fallback:", err);
      }

      try {
        const supsDoc = await getDoc(doc(db, "config", "supervisors_assignment"));
        if (supsDoc.exists()) {
          setSupervisorsAssignment(supsDoc.data());
        }
      } catch (err) {
        console.warn("[LoginScreen] Error consultando config/supervisors_assignment:", err);
      }
    };

    fetchConfigData();
  }, []);

  // Escuchar cambio en el rol o la línea seleccionada para auto-completar supervisor
  useEffect(() => {
    if (selectedRole === "SUPERVISOR" && selectedLine) {
      const assignment = supervisorsAssignment[selectedLine];
      if (assignment && assignment.workerId) {
        // Encontrar en REAL_SUPERVISORS para setear el workerId
        const match = REAL_SUPERVISORS.find(s => s.id === assignment.workerId);
        if (match) {
          setSupervisorName(match.id);
          setWarningText("");
        } else {
          setSupervisorName("");
        }
      } else {
        setSupervisorName("");
      }
    } else {
      setSupervisorName("");
    }
  }, [selectedLine, selectedRole, supervisorsAssignment]);

  const handleSupervisorSelect = (e) => {
    const val = e.target.value;
    setSupervisorName(val);
    setErrorText("");

    if (!val) {
      setWarningText("");
      return;
    }

    const assigned = supervisorsAssignment[selectedLine];
    if (assigned && assigned.workerId && assigned.workerId !== val) {
      const actualName = REAL_SUPERVISORS.find(s => s.id === val)?.shortName || val;
      const expectedName = assigned.shortName || assigned.name;
      setWarningText(`Aviso: El coordinador asignó a "${expectedName}" a esta línea. Estás ingresando como "${actualName}".`);
    } else {
      setWarningText("");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorText("");

    const trimmedName = supervisorName.trim();
    if (!trimmedName) {
      triggerNativeHapticFeedback('error');
      setErrorText(selectedRole === "COORDINADOR" ? "Por favor, introduce tu nombre de coordinador." : "Por favor, selecciona un supervisor.");
      return;
    }

    let finalName = trimmedName;
    if (selectedRole === "SUPERVISOR") {
      const foundSup = REAL_SUPERVISORS.find(s => s.id === trimmedName);
      if (foundSup) {
        finalName = foundSup.name;
      }
    }

    const finalLine = selectedRole === "COORDINADOR" ? "COORDINADOR" : selectedLine;

    try {
      setIsSubmitting(true);
      // Iniciar sesión en Firebase Auth y obtener token con custom claims
      await loginWithRoleAndLine({
        role: selectedRole,
        lineId: finalLine,
        supervisorName: finalName,
        pin: selectedRole === "COORDINADOR" ? coordinatorPin : undefined
      });

      triggerNativeHapticFeedback('confirm');
      console.log(`[Login] Acceso autenticado concedido: ${finalName} (${selectedRole}) -> ${finalLine}`);

      // Asentar en localStorage
      localStorage.setItem("supervisorName", finalName);
      localStorage.setItem("supervisorLineId", finalLine);
      localStorage.setItem("userRole", selectedRole);

      if (onLoginSuccess) {
        onLoginSuccess(finalName, finalLine, selectedRole);
      }
    } catch (err) {
      triggerNativeHapticFeedback('error');
      setErrorText(err.message || "Error al autenticar con Firebase. Verifica tus credenciales.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <LoginContainer>
      <style>{`
        @keyframes slideDown {
          from { transform: translateY(-20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>

      <LoginCard>
        <LogoSection>
          <LogoIcon>
            {/* Box/Package Vectorial Icon */}
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/>
              <path d="m3.3 7 8.7 5 8.7-5"/>
              <path d="M12 22V12"/>
            </svg>
          </LogoIcon>
          <AppTitle>SmartAssign</AppTitle>
          <AppSubtitle>Terminal de Control de Personal y Relevos Ergonómicos</AppSubtitle>
        </LogoSection>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }} id="login-form">
          <FormField>
            <FormLabel htmlFor="supervisor-role-select">Rol en Planta</FormLabel>
            <SelectDropdown 
              id="supervisor-role-select"
              value={selectedRole} 
              onChange={(e) => setSelectedRole(e.target.value)}
            >
              <option value="SUPERVISOR">Supervisor de Línea</option>
              <option value="COORDINADOR">Coordinador General</option>
            </SelectDropdown>
          </FormField>

          {selectedRole === "COORDINADOR" ? (
            <>
              <FormField>
                <FormLabel htmlFor="supervisor-name-input">Nombre del Coordinador</FormLabel>
                <InputText 
                  type="text" 
                  id="supervisor-name-input"
                  placeholder="Ej. Ing. Sofía Reyes" 
                  value={supervisorName}
                  onChange={(e) => setSupervisorName(e.target.value)}
                  autoFocus
                />
              </FormField>
              <FormField>
                <FormLabel htmlFor="coordinator-pin-input">PIN Maestro de Coordinador</FormLabel>
                <InputText 
                  type="password" 
                  id="coordinator-pin-input"
                  placeholder="PIN de 4 dígitos" 
                  value={coordinatorPin}
                  onChange={(e) => setCoordinatorPin(e.target.value)}
                />
              </FormField>
            </>
          ) : (
            <FormField>
              <FormLabel htmlFor="supervisor-select">Seleccionar Supervisor</FormLabel>
              <SelectDropdown
                id="supervisor-select"
                value={supervisorName}
                onChange={handleSupervisorSelect}
              >
                <option value="">── Seleccionar Supervisor ──</option>
                {REAL_SUPERVISORS.map(sup => {
                  const assignedLine = Object.entries(supervisorsAssignment).find(
                    ([, val]) => val?.workerId === sup.id
                  );
                  return (
                    <option key={sup.id} value={sup.id}>
                      {sup.shortName}{assignedLine ? ` (Asignado a ${assignedLine[0]})` : ' (Disponible)'}
                    </option>
                  );
                })}
              </SelectDropdown>
            </FormField>
          )}

          {selectedRole !== "COORDINADOR" && (
            <FormField>
              <FormLabel htmlFor="supervisor-line-select">Línea de Producción a Cargo</FormLabel>
              <SelectDropdown 
                id="supervisor-line-select"
                value={selectedLine} 
                onChange={(e) => {
                  setSelectedLine(e.target.value);
                  setErrorText("");
                }}
              >
                {activeLines.map(lineId => (
                  <option key={lineId} value={lineId}>
                    Línea Operativa {lineId} {lineId === "L8" ? "(Bolsón Central)" : ""}
                  </option>
                ))}
              </SelectDropdown>
            </FormField>
          )}

          {warningText && (
            <div style={{ color: '#D97706', fontSize: '11px', fontWeight: 600, textAlign: 'center', marginTop: '4px', padding: '6px 8px', backgroundColor: '#FEF3C7', borderRadius: '6px', border: '1px solid #FCD34D' }}>
              {warningText}
            </div>
          )}

          {errorText && (
            <div style={{ color: '#EF4444', fontSize: '11px', fontWeight: 600, textAlign: 'center', marginTop: '4px' }}>
              {errorText}
            </div>
          )}

          <LoginButton type="submit" id="login-submit-button">
            Ingresar a la Terminal
          </LoginButton>
        </form>
      </LoginCard>
    </LoginContainer>
  );
}
