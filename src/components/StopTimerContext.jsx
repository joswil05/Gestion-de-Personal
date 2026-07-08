import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { db } from '../services/firebaseService';
import { doc, onSnapshot } from 'firebase/firestore';

const StopTimerContext = createContext(null);

export function useStopTimer() {
  const context = useContext(StopTimerContext);
  if (!context) {
    throw new Error('useStopTimer must be used within a StopTimerProvider');
  }
  return context;
}

export function StopTimerProvider({ children, supervisorLineId }) {
  const [activeParo, setActiveParo] = useState(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!supervisorLineId || supervisorLineId === 'COORDINADOR') {
      setActiveParo(null);
      setElapsedSeconds(0);
      return;
    }

    console.log(`[StopTimerContext] Conectando listener de paro persistente para línea: ${supervisorLineId}`);
    
    const docRef = doc(db, 'config', `line_${supervisorLineId}`);
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.activeParo) {
          const startedAt = data.activeParo.startedAt;
          // Convertir Timestamp a milisegundos
          let startMs = Date.now();
          if (startedAt) {
            const ms = startedAt.toDate ? startedAt.toDate().getTime() : (startedAt.seconds ? startedAt.seconds * 1000 : new Date(startedAt).getTime());
            if (!isNaN(ms)) {
              startMs = ms;
            }
          }
          
          setActiveParo(data.activeParo);
          
          // Calcular desfase inicial
          const diffSeconds = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
          setElapsedSeconds(diffSeconds);

          // Iniciar o reiniciar intervalo para incrementar el cronómetro localmente cada segundo
          if (timerRef.current) clearInterval(timerRef.current);
          timerRef.current = setInterval(() => {
            const currentDiff = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
            setElapsedSeconds(currentDiff);
          }, 1000);
        } else {
          setActiveParo(null);
          setElapsedSeconds(0);
          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }
        }
      } else {
        setActiveParo(null);
        setElapsedSeconds(0);
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
      }
    }, (err) => {
      console.error(`[StopTimerContext] Error en listener de paro:`, err);
    });

    return () => {
      unsubscribe();
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [supervisorLineId]);

  const formatTime = (totalSecs) => {
    const hrs = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <StopTimerContext.Provider value={{ activeParo, elapsedSeconds, formattedTime: formatTime(elapsedSeconds) }}>
      {children}
    </StopTimerContext.Provider>
  );
}
