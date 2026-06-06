import React, { useState, useEffect } from 'react';
import { styled } from '../styles/theme';
import { puestosColl, trabajadoresColl } from '../services/firebaseService';
import { onSnapshot, query, where } from 'firebase/firestore';
import { triggerNativeHapticFeedback } from '../skills/capacitor-android-bridge';

// --- STITCHES STYLED COMPONENTS ---

const PersonalContainer = styled('div', {
  padding: '16px 20px calc(100px + env(safe-area-inset-bottom, 0px)) 20px',
  fontFamily: '$sans',
  display: 'flex',
  flexDirection: 'column',
  gap: '20px'
});

const SectionHeader = styled('div', {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  borderBottom: '1px solid $border',
  paddingBottom: '16px'
});

const SectionTitle = styled('h2', {
  fontSize: '16px',
  fontWeight: 700,
  color: '$textPrimary',
  display: 'flex',
  alignItems: 'center',
  gap: '8px'
});

const WorkersList = styled('div', {
  display: 'flex',
  flexDirection: 'column',
  gap: '14px'
});

const WorkerContactCard = styled('div', {
  backgroundColor: '$card',
  border: '1px solid $border',
  borderRadius: '16px',
  padding: '20px 24px',
  boxShadow: '$elevation1',
  display: 'flex',
  flexDirection: 'column',
  gap: '14px',
  transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
  cursor: 'pointer',

  '&:hover': {
    boxShadow: '$elevation2',
    borderColor: '$accent'
  },
  
  '&:active': {
    transform: 'scale(0.97)',
    boxShadow: '$subtle'
  }
});

const ContactHeader = styled('div', {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start'
});

const ProfileInfo = styled('div', {
  display: 'flex',
  flexDirection: 'column',
  gap: '2px'
});

const WorkerName = styled('h3', {
  fontSize: '14px',
  fontWeight: 600,
  color: '$textPrimary'
});

const WorkerFicha = styled('span', {
  fontSize: '11px',
  color: '$textSecondary',
  fontFamily: 'monospace'
});

const RoleTag = styled('span', {
  fontSize: '9px',
  fontWeight: 700,
  padding: '3px 8px',
  borderRadius: '4px',
  backgroundColor: '#FFFFFF',
  color: '$textSecondary',
  border: '1px solid $border',
  textTransform: 'uppercase',
  letterSpacing: '0.3px'
});

// Contenedor principal destacado para auditoría médica rápida
const HealthAuditBox = styled('div', {
  borderRadius: '12px',
  padding: '12px 14px',
  fontSize: '12px',
  fontWeight: 500,
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',

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

const AuditTitle = styled('div', {
  fontSize: '10px',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px'
});

const RestrictionList = styled('div', {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '6px',
  marginTop: '2px'
});

const RestrictionBadge = styled('span', {
  fontSize: '9px',
  fontWeight: 700,
  padding: '3px 8px',
  borderRadius: '4px',
  backgroundColor: '#FFFFFF',
  color: '#EF4444',
  border: '1px solid #FCA5A5',
  textTransform: 'uppercase',
  letterSpacing: '0.2px'
});

const SubSectionTitle = styled('h3', {
  fontSize: '11.5px',
  fontWeight: 700,
  color: '$textSecondary',
  textTransform: 'uppercase',
  letterSpacing: '0.6px',
  marginTop: '16px',
  marginBottom: '10px',
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  borderLeft: '3px solid $accent',
  paddingLeft: '8px',
  width: '100%'
});

// --- COMPONENT IMPLEMENTATION ---

/**
 * MiPersonal Component - Directorio de contactos de operarios asignados en la línea
 * Estética: Vectorial Premium SaaS Light. Prohibido el uso de emojis.
 * 
 * @param {string} supervisorLineId Línea operativa del supervisor (ej: "L4")
 */
export default function MiPersonal({ supervisorLineId = "L4" }) {
  const [activeWorkers, setActiveWorkers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log(`[Mi Personal] Cargando operarios asignados a la línea: ${supervisorLineId}`);

    const qSlots = query(puestosColl, where("lineId", "==", supervisorLineId));
    
    const unsubscribeSlots = onSnapshot(qSlots, (slotsSnapshot) => {
      const activeWorkerIds = [];
      const slotMap = {};
      slotsSnapshot.forEach(docSnap => {
        const slot = docSnap.data();
        if (slot.idWorkerCurrent) {
          activeWorkerIds.push(slot.idWorkerCurrent);
          slotMap[slot.idWorkerCurrent] = {
            slotId: slot.id,
            slotName: slot.puestoName,
            tipoPuesto: slot.tipoPuesto
          };
        }
      });

      if (activeWorkerIds.length === 0) {
        setActiveWorkers([]);
        setLoading(false);
        return;
      }

      const unsubscribeWorkers = onSnapshot(trabajadoresColl, (workersSnapshot) => {
        const workersList = [];
        workersSnapshot.forEach(docSnap => {
          const workerData = docSnap.data();
          if (activeWorkerIds.includes(docSnap.id)) {
            workersList.push({ 
              id: docSnap.id, 
              ...workerData,
              assignedSlot: slotMap[docSnap.id]
            });
          }
        });

        workersList.sort((a, b) => a.name.localeCompare(b.name));
        setActiveWorkers(workersList);
        setLoading(false);
      }, (err) => {
        console.error("[Mi Personal] Error escuchando trabajadores:", err);
      });

      return () => unsubscribeWorkers();
    }, (err) => {
      console.error("[Mi Personal] Error escuchando puestos para personal:", err);
    });

    return () => unsubscribeSlots();
  }, [supervisorLineId]);

  const handleCardClick = () => {
    triggerNativeHapticFeedback('short');
  };

  return (
    <PersonalContainer>
      <SectionHeader>
        <SectionTitle>
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
          <span>Mi Personal Asignado</span>
        </SectionTitle>
        <span style={{ fontSize: '11px', color: '#64748B' }}>
          Activos hoy: <strong>{activeWorkers.length} operarios</strong>
        </span>
      </SectionHeader>

      <WorkersList id="personal-directory-list" style={{ gap: '20px' }}>
        {(() => {
          const fijos = activeWorkers.filter(w => 
            w.assignedSlot && ["Operador A", "Averiero", "Operador C"].includes(w.assignedSlot.tipoPuesto)
          );
          const varios = activeWorkers.filter(w => 
            !w.assignedSlot || !["Operador A", "Averiero", "Operador C"].includes(w.assignedSlot.tipoPuesto)
          );

          const renderWorkerCard = (worker) => {
            const hasRestrictions = worker.medicalRestrictions && worker.medicalRestrictions.length > 0;
            return (
              <WorkerContactCard 
                key={worker.id} 
                onClick={handleCardClick}
                id={`worker-card-${worker.id}`}
              >
                <ContactHeader>
                  <ProfileInfo>
                    <WorkerName>{worker.name}</WorkerName>
                    <WorkerFicha>
                      Nómina: {worker.id}
                      {worker.assignedSlot && (
                        <span style={{ marginLeft: '8px', color: '#2563EB', fontWeight: 700, fontSize: '11px', display: 'inline-block', backgroundColor: '#EFF6FF', padding: '1px 6px', borderRadius: '4px' }}>
                          Puesto: {worker.assignedSlot.slotName}
                        </span>
                      )}
                    </WorkerFicha>
                  </ProfileInfo>
                  <RoleTag>{worker.role}</RoleTag>
                </ContactHeader>

                {/* Bloque Destacado de Auditoría de Salud (Obligatorio) */}
                <HealthAuditBox hasRestrictions={hasRestrictions}>
                  <AuditTitle>
                    {hasRestrictions ? (
                      <>
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
                          <line x1="12" y1="9" x2="12" y2="13"/>
                          <line x1="12" y1="17" x2="12.01" y2="17"/>
                        </svg>
                        <span>Restricciones Médicas Activas</span>
                      </>
                    ) : (
                      <>
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                        <span>Salud Aprobada: Apto para tareas físicas críticas</span>
                      </>
                    )}
                  </AuditTitle>
                  
                  {hasRestrictions && (
                    <RestrictionList>
                      {worker.medicalRestrictions.map((restriction, idx) => (
                        <RestrictionBadge key={idx}>{restriction}</RestrictionBadge>
                      ))}
                    </RestrictionList>
                  )}
                </HealthAuditBox>
              </WorkerContactCard>
            );
          };

          if (loading) {
            return (
              <div style={{ 
                textAlign: 'center', 
                padding: '32px', 
                color: '#94A3B8', 
                fontSize: '13px',
                backgroundColor: '#FFFFFF',
                border: '1px solid #E2E8F0',
                borderRadius: '12px'
              }}>
                Cargando nómina activa en línea...
              </div>
            );
          }

          if (activeWorkers.length === 0) {
            return (
              <div style={{ 
                textAlign: 'center', 
                padding: '64px 20px', 
                color: '#94A3B8', 
                fontSize: '13px',
                backgroundColor: '#FFFFFF',
                border: '1px solid #E2E8F0',
                borderRadius: '12px'
              }}>
                No hay personal asignado laborando en tu línea actualmente. Registra operarios desde el HUD.
              </div>
            );
          }

          return (
            <>
              {/* CATEGORÍA 1: PUESTOS FIJOS */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <SubSectionTitle>
                  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                  <span>Puestos Fijos y Operadores Técnicos ({fijos.length})</span>
                </SubSectionTitle>
                {fijos.length === 0 ? (
                  <div style={{ padding: '20px', color: '#94A3B8', fontSize: '12px', border: '1px dashed #E2E8F0', borderRadius: '12px', textAlign: 'center', backgroundColor: '#F8FAFC' }}>
                    Sin operadores técnicos asignados en esta línea actualmente.
                  </div>
                ) : (
                  fijos.map(worker => renderWorkerCard(worker))
                )}
              </div>

              {/* CATEGORÍA 2: PUESTOS VARIOS */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '14px' }}>
                <SubSectionTitle style={{ borderLeftColor: '#10B981' }}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 2.1l4 4-4 4"/>
                    <path d="M3 12a9 9 0 0 1 15-6.7L21 6"/>
                    <path d="M7 21.9l-4-4 4-4"/>
                    <path d="M21 12a9 9 0 0 1-15 6.7L3 18"/>
                  </svg>
                  <span>Personal Rotativo y Puestos Varios ({varios.length})</span>
                </SubSectionTitle>
                {varios.length === 0 ? (
                  <div style={{ padding: '20px', color: '#94A3B8', fontSize: '12px', border: '1px dashed #E2E8F0', borderRadius: '12px', textAlign: 'center', backgroundColor: '#F8FAFC' }}>
                    Sin operarios de puestos varios asignados en esta línea actualmente.
                  </div>
                ) : (
                  varios.map(worker => renderWorkerCard(worker))
                )}
              </div>
            </>
          );
        })()}
      </WorkersList>
    </PersonalContainer>
  );
}
