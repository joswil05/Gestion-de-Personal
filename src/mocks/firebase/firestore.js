import { io } from 'socket.io-client';

const API_URL = 'http://localhost:3001/api';
const socket = io('http://localhost:3001');

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
    const token = localStorage.getItem("token") || "";
    const res = await fetch(`${API_URL}/config/${docId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) return { exists: false, data: {} };
    return res.json();
};

export const collection = (db, path) => ({ type: 'collection', path }); 
export const doc = (db, path, id) => ({ type: 'doc', path, id: id || path }); 
export const query = (col, ...args) => ({ type: 'query', col, args }); 
export const where = (field, op, val) => ({ type: 'where', field, op, val }); 

export const onSnapshot = (ref, callback, errorCallback) => {
    let isCancelled = false;
    let eventName = null;

    const fetchData = async () => {
        if (isCancelled) return;
        try {
            // Determine what we are querying
            let pathName = ref;
            if (ref.type === 'collection') pathName = ref.path;
            if (ref.type === 'query') pathName = ref.col.path || ref.col;
            if (ref.type === 'doc') pathName = ref.path; // For doc, path is usually the collection name

            if (pathName === 'puestos') {
                const res = await fetch(`${API_URL}/puestos`);
                const data = await res.json();
                callback(createQuerySnapshot(data));
                eventName = 'puestos_updated';
            } 
            else if (pathName === 'config' && ref.type === 'doc') {
                const { exists, data } = await fetchConfigDoc(ref.id);
                callback(createDocSnapshot(ref.id, exists ? data : {}));
                eventName = 'config_updated';
            }
            else if (pathName === 'trabajadores') {
                const token = localStorage.getItem("token") || "";
                const res = await fetch(`${API_URL}/operarios/pool`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    callback(createQuerySnapshot(data));
                } else {
                    callback(createQuerySnapshot([]));
                }
                eventName = 'trabajadores_updated';
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
        }
    };

    // Initial fetch
    fetchData();

    // Setup socket listener
    const handleUpdate = () => {
        fetchData();
    };

    // Wait a tick to ensure eventName is set
    setTimeout(() => {
        if (eventName) {
            socket.on(eventName, handleUpdate);
        }
    }, 0);

    return () => {
        isCancelled = true;
        if (eventName) {
            socket.off(eventName, handleUpdate);
        }
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
        const token = localStorage.getItem("token") || "";
        const res = await fetch(`${API_URL}/operarios/pool`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            const data = await res.json();
            return createQuerySnapshot(data);
        }
    }
    return createQuerySnapshot([]);
};
export const setDoc = async () => {}; 
export const updateDoc = async (ref, data) => {
    // Si están actualizando un puesto, redirigimos al backend
    let pathName = ref;
    if (ref.type === 'doc') pathName = ref.path;
    
    if (pathName === 'puestos' || pathName === 'puestosColl') { // Podría ser el nombre de la colección
        // Determinamos qué acción están haciendo según el payload
        let action = 'asignar';
        if (data.asignado === false || data.operadorId === null) {
            action = 'liberar';
        }
        
        await fetch(`${API_URL}/puestos/relevo`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                slotId: ref.id,
                action: action,
                newWorkerId: data.operadorId || null
            })
        });
    }
}; 
export const deleteDoc = async () => {}; 
export const writeBatch = () => ({ commit: async () => {} }); 
export const serverTimestamp = () => new Date().toISOString(); 
export const getFirestore = () => ({}); 
export const initializeFirestore = () => ({}); 
export const persistentLocalCache = () => ({}); 
export const persistentMultipleTabManager = () => ({}); 
export const connectFirestoreEmulator = () => {};
export const getDocFromServer = async () => ({ exists: () => false, data: () => ({}) });
export const getDocsFromServer = async () => createQuerySnapshot([]);
export const runTransaction = async (db, transactionUpdate) => {
    const fakeTransaction = {
        get: async (ref) => createDocSnapshot(ref.id, {}),
        update: (ref, data) => updateDoc(ref, data),
        set: (ref, data) => {},
        delete: (ref) => {}
    };
    try {
        await transactionUpdate(fakeTransaction);
    } catch(err) {
        console.error("Mock Transaction error:", err);
    }
};
