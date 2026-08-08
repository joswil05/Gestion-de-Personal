import { io } from 'socket.io-client';
import { getToken } from '../../services/authService';

const API_URL = 'http://localhost:3001/api';
const socket = io('http://localhost:3001');

// Todas las lecturas del shim pasan por aquí. Antes, tres puntos distintos leían
// localStorage.getItem("token") —una clave que ningún módulo escribe nunca— y un
// cuarto (puestos) no mandaba cabecera en absoluto: el 100% de las lecturas
// devolvía 401 (ver AUDIT_REPORT C-1 y C-2).
const authFetch = (path) => {
    const token = getToken();
    return fetch(`${API_URL}${path}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
};

// Helpers to create Firebase-like Snapshot objects
const createDocSnapshot = (id, data) => ({
    id,
    exists: () => !!data,
    data: () => data
});

const createQuerySnapshot = (dataArray) => ({
    empty: dataArray.length === 0,
    size: dataArray.length,
    docs: dataArray.map(d => createDocSnapshot(d.id, d)),
    forEach: (callback) => {
        dataArray.forEach(d => callback(createDocSnapshot(d.id, d)));
    }
});

// Proxy real hacia GET /api/config/:docId (Fase 2). Reemplaza la config de
// línea/SKU/turno que antes vivía únicamente en este mock (global_priority,
// shift_status, line_{lineId}) por datos reales de SQL Server
// (tablas Lineas y ConfiguracionGlobal, ver server/server.js).
const fetchConfigDoc = async (docId) => {
    const res = await authFetch(`/config/${docId}`);
    if (!res.ok) return { exists: false, data: {} };
    return res.json();
};

export const collection = (db, path) => ({ type: 'collection', path }); 
export const doc = (db, path, id) => ({ type: 'doc', path, id: id || path }); 
export const query = (col, ...args) => ({ type: 'query', col, args }); 
export const where = (field, op, val) => ({ type: 'where', field, op, val }); 

export const onSnapshot = (ref, callback, errorCallback) => {
    let isCancelled = false;

    // Resolver el path y el evento de forma SÍNCRONA. Antes esto se hacía dentro de
    // fetchData (asíncrona) y la suscripción se intentaba en un setTimeout(0), que
    // siempre corre antes de que vuelva la red: socket.on no llegaba a ejecutarse
    // nunca y no había tiempo real (ver AUDIT_REPORT C-7).
    let pathName = ref;
    if (ref.type === 'collection') pathName = ref.path;
    if (ref.type === 'query') pathName = ref.col.path || ref.col;
    if (ref.type === 'doc') pathName = ref.path; // For doc, path is usually the collection name

    const eventName =
        pathName === 'puestos'      ? 'puestos_updated'      :
        pathName === 'trabajadores' ? 'trabajadores_updated' :
        pathName === 'config'       ? 'config_updated'       : null;

    const fetchData = async () => {
        if (isCancelled) return;
        try {
            if (pathName === 'puestos') {
                const res = await authFetch('/puestos');
                if (!res.ok) throw new Error(`GET /puestos → HTTP ${res.status}`);
                const data = await res.json();
                if (!Array.isArray(data)) throw new Error('GET /puestos devolvió un payload no iterable');
                callback(createQuerySnapshot(data));
            }
            else if (pathName === 'config' && ref.type === 'doc') {
                const { exists, data } = await fetchConfigDoc(ref.id);
                callback(createDocSnapshot(ref.id, exists ? data : {}));
            }
            else if (pathName === 'trabajadores') {
                const res = await authFetch('/operarios/pool');
                if (res.ok) {
                    const data = await res.json();
                    callback(createQuerySnapshot(data));
                } else {
                    callback(createQuerySnapshot([]));
                }
            }
            else {
                // Return empty snapshot for other unhandled collections for now
                if (ref.type === 'doc') {
                    callback(createDocSnapshot(ref.id, {}));
                } else {
                    callback(createQuerySnapshot([]));
                }
            }
        } catch (err) {
            if (errorCallback) errorCallback(err);
            else console.error('[firestore-shim] onSnapshot:', err.message);
        }
    };

    // Initial fetch
    fetchData();

    const handleUpdate = () => fetchData();
    if (eventName) socket.on(eventName, handleUpdate);

    return () => {
        isCancelled = true;
        if (eventName) socket.off(eventName, handleUpdate);
    };
};

export const getDoc = async (ref) => {
    if (ref && ref.type === 'doc' && ref.path === 'config') {
        const { exists, data } = await fetchConfigDoc(ref.id);
        return createDocSnapshot(ref.id, exists ? data : {});
    }
    return { exists: () => false, data: () => ({}) };
};
export const getDocs = async (ref) => {
    let pathName = ref;
    if (ref && ref.type === 'collection') pathName = ref.path;
    if (ref && ref.type === 'query') pathName = ref.col.path || ref.col;

    if (pathName === 'trabajadores') {
        const res = await authFetch('/operarios/pool');
        if (res.ok) {
            const data = await res.json();
            return createQuerySnapshot(data);
        }
    }
    return createQuerySnapshot([]);
};
// El shim es solo de LECTURA. Toda escritura debe pasar por apiService.js /
// coordinatorApi.js contra la API REST. Antes estas funciones eran cuerpos vacíos:
// la UI confirmaba al operador acciones que nunca se persistían (ver AUDIT_REPORT
// C-3 y C-4). Ahora lanzan para que la falla sea visible y localizable.
const escrituraNoSoportada = (op) => {
    throw new Error(
        `[firestore-shim] '${op}' no está soportado. Esta ruta debe migrarse a la API REST. ` +
        `Ver AUDIT_REPORT.md, Fase 1 paso 1.3.`
    );
};

export const setDoc      = async () => escrituraNoSoportada('setDoc');
export const updateDoc   = async () => escrituraNoSoportada('updateDoc');
export const deleteDoc   = async () => escrituraNoSoportada('deleteDoc');
export const writeBatch  = () => ({
    set:    () => escrituraNoSoportada('writeBatch.set'),
    update: () => escrituraNoSoportada('writeBatch.update'),
    delete: () => escrituraNoSoportada('writeBatch.delete'),
    commit: async () => escrituraNoSoportada('writeBatch.commit')
});
export const runTransaction = async () => escrituraNoSoportada('runTransaction');
export const serverTimestamp = () => new Date().toISOString();
export const getFirestore = () => ({});
export const initializeFirestore = () => ({});
export const persistentLocalCache = () => ({});
export const persistentMultipleTabManager = () => ({});
export const connectFirestoreEmulator = () => {};
export const getDocFromServer = async () => ({ exists: () => false, data: () => ({}) });
export const getDocsFromServer = async () => createQuerySnapshot([]);
