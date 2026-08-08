import React, { useState, useEffect } from 'react';
import { styled } from '../styles/theme';
import { triggerNativeHapticFeedback } from '../skills/capacitor-android-bridge';
import { loginWithRoleAndLine } from '../services/authService';

const API_URL = 'http://localhost:3001/api';

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

export default function LoginScreen({ onLoginSuccess }) {
  const [selectedRole, setSelectedRole] = useState("SUPERVISOR"); 
  const [selectedLine, setSelectedLine] = useState("L1");
  const [supervisorName, setSupervisorName] = useState("");
  const [supervisorPassword, setSupervisorPassword] = useState("");
  const [coordinatorPin, setCoordinatorPin] = useState("");
  const [errorText, setErrorText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [supervisorsList, setSupervisorsList] = useState([]);
  const [isLoadingSups, setIsLoadingSups] = useState(false);
  const [fetchError, setFetchError] = useState("");

  useEffect(() => {
    async function fetchSupervisors() {
      setIsLoadingSups(true);
      setFetchError("");
      try {
        const res = await fetch(`${API_URL}/supervisores/publico`);
        if (!res.ok) throw new Error("Error obteniendo supervisores");
        const data = await res.json();
        setSupervisorsList(data);
      } catch (err) {
        setFetchError("No se pudo cargar la lista de supervisores.");
        console.error(err);
      } finally {
        setIsLoadingSups(false);
      }
    }
    fetchSupervisors();
  }, []);

  const activeLines = ["L4", "L1", "L2", "L6", "L7", "L5", "L3", "L8", "L9", "L10"];

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
    let username = trimmedName.toLowerCase().replace(/\s+/g, '.'); // fallback para Coordinador

    if (selectedRole === "SUPERVISOR") {
      const foundSup = supervisorsList.find(s => s.username === trimmedName);
      if (foundSup) {
        finalName = foundSup.name;
        username = foundSup.username;
      }
    }

    const finalLine = selectedRole === "COORDINADOR" ? "COORDINADOR" : selectedLine;

    // Login real al API con JWT. Antes: (supervisorPassword || '123456') —
    // dejar el campo vacío enviaba una contraseña fija embebida en el bundle
    // de producción, legible por cualquiera con las herramientas de
    // desarrollo abiertas (ver AUDIT_REPORT.md C-6, parte 1). Exigir la
    // contraseña explícitamente en vez de rellenarla en silencio.
    const loginPassword = selectedRole === "COORDINADOR" ? coordinatorPin : supervisorPassword;
    if (!loginPassword) {
      triggerNativeHapticFeedback('error');
      setErrorText("Introduce tu contraseña.");
      return;
    }

    try {
      setIsSubmitting(true);

      await loginWithRoleAndLine({
        username,
        password: loginPassword
      });

      triggerNativeHapticFeedback('confirm');
      console.log(`[Login] Acceso local concedido: ${finalName} (${selectedRole}) -> ${finalLine}`);

      localStorage.setItem("supervisorName", finalName);
      localStorage.setItem("supervisorLineId", finalLine);
      localStorage.setItem("userRole", selectedRole);

      if (onLoginSuccess) {
        onLoginSuccess(finalName, finalLine, selectedRole);
      }
    } catch (err) {
      triggerNativeHapticFeedback('error');
      // authService.loginWithRoleAndLine ya propaga el mensaje real del
      // servidor ("Usuario o contraseña incorrectos", "Demasiados intentos",
      // etc.) a propósito; antes se descartaba con un mensaje genérico que
      // no distinguía credenciales inválidas de un servidor caído (M-10).
      setErrorText(err.message || "No se pudo iniciar sesión.");
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
            <>
              <FormField>
                <FormLabel htmlFor="supervisor-select">Seleccionar Supervisor</FormLabel>
                <SelectDropdown
                  id="supervisor-select"
                  value={supervisorName}
                  onChange={(e) => {
                    setSupervisorName(e.target.value);
                    setErrorText("");
                  }}
                >
                  <option value="">
                    {isLoadingSups ? "Cargando supervisores..." : fetchError ? fetchError : "── Seleccionar Supervisor ──"}
                  </option>
                  {!isLoadingSups && !fetchError && supervisorsList.map(sup => (
                    <option key={sup.id} value={sup.username}>
                      {sup.name}
                    </option>
                  ))}
                </SelectDropdown>
              </FormField>
              <FormField>
                <FormLabel htmlFor="supervisor-password-input">Contraseña</FormLabel>
                <InputText 
                  type="password" 
                  id="supervisor-password-input"
                  placeholder="Ingrese contraseña" 
                  value={supervisorPassword}
                  onChange={(e) => setSupervisorPassword(e.target.value)}
                />
              </FormField>
            </>
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

          {errorText && (
            <div style={{ color: '#EF4444', fontSize: '11px', fontWeight: 600, textAlign: 'center', marginTop: '4px' }}>
              {errorText}
            </div>
          )}

          <LoginButton type="submit" id="login-submit-button" disabled={isSubmitting}>
            {isSubmitting ? "Ingresando..." : "Ingresar a la Terminal"}
          </LoginButton>
        </form>
      </LoginCard>
    </LoginContainer>
  );
}
