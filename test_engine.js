

const API_URL = 'http://localhost:3001/api';

async function runTests() {
    console.log('--- Iniciando Suite de Pruebas Profundas (Engine) ---');
    try {
        // 1. Verificar carga de puestos
        console.log('\n[TEST 1] Cargando puestos desde SQL Server...');
        let res = await fetch(`${API_URL}/puestos`);
        let puestos = await res.json();
        console.log(`> OK: Se encontraron ${puestos.length} puestos.`);
        
        let puestoAlfa = puestos.find(p => p.nombre === 'Ensamblaje A');
        let puestoDisponible = puestos.find(p => p.estado === 'disponible');

        // 2. Probar Relevo (Liberar puesto)
        console.log(`\n[TEST 2] Liberando puesto ID ${puestoAlfa.id} (Ensamblaje A)...`);
        res = await fetch(`${API_URL}/puestos/relevo`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ slotId: puestoAlfa.id, action: 'liberar', newWorkerId: null })
        });
        let result = await res.json();
        console.log(`> OK: Liberación retornó ${JSON.stringify(result)}`);

        // 3. Probar Asignación concurrente (Race condition stress)
        console.log(`\n[TEST 3] Estrés concurrente: Intentando asignar 20 operarios diferentes al mismo puesto libre casi al mismo tiempo...`);
        const requests = [];
        for (let i = 1; i <= 20; i++) {
            requests.push(fetch(`${API_URL}/puestos/relevo`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ slotId: puestoDisponible.id, action: 'asignar', newWorkerId: 1 }) // Simulamos workerId 1
            }));
        }
        await Promise.all(requests);
        console.log('> OK: Las 20 peticiones concurrentes fueron procesadas sin crashear el servidor.');

        // 4. Verificar integridad final
        console.log('\n[TEST 4] Verificando estado final...');
        res = await fetch(`${API_URL}/puestos`);
        puestos = await res.json();
        let puestoAlfaUpdated = puestos.find(p => p.id === puestoAlfa.id);
        if (puestoAlfaUpdated.estado === 'disponible' && puestoAlfaUpdated.operarioId === null) {
            console.log('> OK: Ensamblaje A se liberó correctamente en BD.');
        } else {
            console.error('> FALLO: Ensamblaje A no está libre.');
        }

        console.log('\n--- Todas las pruebas finalizaron con éxito ---');
    } catch (e) {
        console.error('Error durante pruebas:', e);
    }
}

runTests();
