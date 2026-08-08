import { useState, useEffect } from 'react';
import { styled } from '../../styles/theme';

// Banner de notificación tipo "toast": reemplaza los alert()/confirm()
// bloqueantes del navegador -que congelan el hilo de UI y no distinguen
// éxito de error visualmente- por un aviso no bloqueante con auto-dismiss.
// Antes cada archivo (HudPlanta.jsx, RelevosNotificaciones.jsx) tenía su
// propia copia casi idéntica de este styled component (AlertBanner /
// ToastNotification); PanelCoordinador.jsx y LineaSku.jsx no tenían ninguno
// y usaban alert() para todo (34 llamadas entre los cuatro archivos, ver
// AUDIT_REPORT.md B-6). Este es el único lugar donde vive ahora.
export const NotificationBanner = styled('div', {
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
  alignItems: 'flex-start',
  gap: '10px',
  whiteSpace: 'pre-line', // preserva \n en mensajes multilínea (resúmenes, listas de fallos)
  animation: 'notificationSlideDown 0.3s ease-out',

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

/**
 * Hook de notificaciones: estado + auto-dismiss a los `autoDismissMs` (4s
 * por defecto). Uso: const [notification, notify] = useNotification();
 * notify('success', 'Guardado.'); notify('error', err.message);
 */
export function useNotification(autoDismissMs = 4000) {
  const [notification, setNotification] = useState(null);

  useEffect(() => {
    if (!notification) return;
    const timer = setTimeout(() => setNotification(null), autoDismissMs);
    return () => clearTimeout(timer);
  }, [notification, autoDismissMs]);

  const notify = (type, message) => setNotification(message ? { type, message } : null);

  return [notification, notify, setNotification];
}

/**
 * Renderiza el banner activo (o nada). id se puede sobreescribir para no
 * colisionar si por algún motivo hubiera dos montados en la misma pantalla.
 */
export function NotificationToast({ notification, id = 'toast-alert' }) {
  if (!notification) return null;
  return (
    <>
      <style>{`
        @keyframes notificationSlideDown {
          from { transform: translateY(-16px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
      <NotificationBanner type={notification.type} id={id}>
        {notification.type === 'error' ? (
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: '1px' }}>
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: '1px' }}>
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        )}
        <span>{notification.message}</span>
      </NotificationBanner>
    </>
  );
}
