# Auditoría Técnica — SmartAssign (Gestión de Personal)

**Fecha:** 2026-08-07
**Rama:** `feature/migracion-sql-server`
**Commit base:** `592b98d`
**Alcance:** `src/`, `server/`, `scripts/`, configuración de build y entorno.
**Modo:** auditoría pasiva. No se modificó ningún archivo de la aplicación; el único
artefacto generado es este documento.

## Cómo se verificó

- `node --check` sobre los 12 archivos JS del backend → **todos pasan**.
- `npx vite build` → **compila** (975 KB en un solo chunk; solo warnings preexistentes).
- No existe configuración de linter ni de TypeScript en el repositorio, así que no hay
  chequeo estático más allá del parser y del bundler.
- **Backend arrancado en modo diagnóstico y consultado por HTTP** para confirmar
  empíricamente los hallazgos C-1, C-2 y C-8 (ver evidencia más abajo). El servidor
  quedó detenido al terminar; la base no fue modificada.

## Resumen ejecutivo

| Severidad | Cantidad |
|-----------|----------|
| CRÍTICO   | 8        |
| MEDIO     | 14       |
| BAJO      | 9        |
| **Total** | **31**   |

El backend SQL Server y los flujos nuevos del Coordinador (planificación T+1, gestión de
personal) están sanos y verificados. El problema está en la **capa de datos del frontend**:
seis componentes —toda la interfaz del Supervisor— siguen leyendo y escribiendo a través del
shim de compatibilidad de Firestore (`src/mocks/firebase/firestore.js`), que envía un token
que nunca se escribió y cuyas operaciones de escritura son funciones vacías. Se confirmó por
HTTP que **todas** sus lecturas devuelven 401 y que sus escrituras se descartan en silencio
sin lanzar excepción, de modo que la UI reporta éxito sobre operaciones que nunca ocurrieron.
Se recomienda tratarlo como una única falla estructural (Fase 1) antes de cualquier
funcionalidad nueva.

---

# Sección A: Diagnóstico

## [CRÍTICO]

### C-1 · El token JWT nunca se escribe donde el shim lo busca — todas sus lecturas dan 401

**Archivos:** `src/mocks/firebase/firestore.js:27`, `:65`, `:126` ·
`src/services/authService.js:49`

El shim lee la credencial con `localStorage.getItem("token")`. `authService.loginWithRoleAndLine`
guarda la sesión completa en **`sessionStorage`**, bajo la clave `smartassign_mock_user`.
Una búsqueda en todo `src/` confirma que **`localStorage.setItem("token", …)` no existe en
ninguna parte del proyecto**. El shim envía por tanto `Authorization: Bearer ` (vacío) en
cada petición.

**Evidencia empírica** (backend real, en ejecución):

```
GET /api/config/global_priority   Authorization: "Bearer "  → 401
GET /api/operarios/pool           Authorization: "Bearer "  → 401
GET /api/puestos                  (con token válido)        → 200  ← el backend está sano
```

**Impacto:** todo lo que el shim lee está permanentemente vacío. Eso incluye
`config/global_priority`, `config/shift_status` y `config/line_{lineId}` (estado de línea,
SKU activo, paro en curso, mermas) y la colección `trabajadores`. Afecta a
`HudPlanta.jsx:1492`, `:1504`, `:1546`, `:1592`, `:1636`; `LineaSku.jsx:673`, `:686`;
`RelevosNotificaciones.jsx:440`, `:462`; `StopTimerContext.jsx:30`. El cronómetro de paro,
el SKU de la línea y la lista de personal presente nunca se pueblan.

---

### C-2 · `onSnapshot('puestos')` no envía cabecera de autorización y revienta al parsear

**Archivo:** `src/mocks/firebase/firestore.js:53-57`

```js
if (pathName === 'puestos') {
    const res = await fetch(`${API_URL}/puestos`);   // ← sin Authorization
    const data = await res.json();
    callback(createQuerySnapshot(data));
}
```

`/api/puestos` exige `requireAuth`; devuelve `401 {"error": "..."}`. Ese objeto llega a
`createQuerySnapshot`, que hace `dataArray.map(...)` sobre un objeto → `TypeError: data.map is
not a function`, capturado por el `catch` de la línea 85 y desviado al `errorCallback`
opcional. Ningún llamador pasa `errorCallback`, así que el fallo desaparece sin rastro.

**Impacto:** la **rejilla de puestos del Supervisor está vacía**, que es la pantalla
principal de la aplicación. Afecta a `HudPlanta.jsx:1584`, `:1609`;
`RelevosNotificaciones.jsx:450`; `LineaSku.jsx:661`.

---

### C-3 · Las escrituras del shim son funciones vacías: pérdida de datos silenciosa

**Archivo:** `src/mocks/firebase/firestore.js:137`, `:161`, `:162`, `:171-183`

```js
export const setDoc     = async () => {};
export const deleteDoc  = async () => {};
export const writeBatch = () => ({ commit: async () => {} });
export const runTransaction = async (db, fn) => {
    const fakeTransaction = { get: …, set: () => {}, delete: () => {} };
    try { await fn(fakeTransaction); } catch (err) { console.error(…); }  // ← traga el error
};
```

Ninguna lanza. Cada llamador recibe `undefined`, ejecuta su `return { success: true }` y la
UI confirma al operador una acción que no se persistió. Rutas en producción confirmadas:

| Función (`src/services/apiService.js`) | Llamador vivo | Lo que se pierde |
|---|---|---|
| `startLineOfficially` `:369` | `HudPlanta.jsx:2574` | Arranque oficial de línea: estado, SKU y prioridad global |
| `autoAssignFixedOperators` `:424` | `HudPlanta.jsx:1519`, `:1533` | Auto-asignación de puestos fijos/críticos |
| `initializeSingleLineTransaction` `:192` | importada en `HudPlanta.jsx:20` | Arranque individual de línea |
| `transitionLineToSku` `:2089` | `HudPlanta.jsx:2919` | Cambio de SKU en caliente |
| `registerSkuFinishedEvent` `:2651` | `HudPlanta.jsx:3008` | Registro de fin de corrida |
| `updateWorkerDobleTurno` `:2338` | `HudPlanta.jsx:3421` | Marca de doble turno |
| `reprogramPartialNextDayShift` `:1458` | `PanelCoordinador.jsx:3311` | Reprogramación parcial T+1 |
| — (`updateDoc` inline) | `PanelCoordinador.jsx:2640` | Bloqueo/desbloqueo de asignaciones del plan |
| — (`setDoc` inline) | `LineaSku.jsx:713` | Inicialización del documento de línea |
| — (`updateDoc` inline) | `RelevosNotificaciones.jsx:812` | Actualización de estado de trabajador |

Es el mismo antipatrón ya corregido tres veces en rondas anteriores (mermas,
planificación T+1, pestaña Ausencias). Estos son los focos restantes.

---

### C-4 · `clearSlotBlacklist` no es un no-op: dispara una asignación real mal formada

**Archivos:** `src/services/apiService.js:912` · `src/mocks/firebase/firestore.js:143-159`

`clearSlotBlacklist` llama `updateDoc(doc(db,"puestos",slotId), { rejectedWorkerIds: [] })`.
El shim, al ver `pathName === 'puestos'`, **reinterpreta el payload**: como
`data.asignado !== false` y `data.operadorId` es `undefined` (no `null`), deduce
`action = 'asignar'` y hace `POST /api/puestos/relevo` con
`{ slotId, action: 'asignar', newWorkerId: null }` — y **sin cabecera de autorización**.

Hoy eso termina en 401 (que el shim ignora, porque no comprueba `res.ok`) y la blacklist
nunca se limpia. Pero si se arregla únicamente la autenticación sin tocar esta rama —el
orden de reparación intuitivo— la llamada pasará a ejecutar un intento de asignación real
contra un puesto de producción. Corregir C-1/C-2 **sin** corregir esto empeora el problema.

Llamador vivo: `RelevosNotificaciones.jsx:876`.

---

### C-5 · Split-brain de sesión: bucle infinito de recarga al reabrir la aplicación

**Archivos:** `src/App.jsx:328-330`, `:404` · `src/services/authService.js:49`, `:58-63` ·
`src/services/coordinatorApi.js:19-24`

La identidad de sesión vive en `localStorage` (`supervisorName`, `supervisorLineId`,
`userRole`, escritos en `LoginScreen.jsx:234-236`); el token vive en `sessionStorage`.
`sessionStorage` no sobrevive al cierre de la pestaña. Secuencia:

1. El operador cierra la pestaña y la reabre → `localStorage` conserva la identidad,
   `sessionStorage` perdió el token.
2. `App.jsx:404` ve `supervisorName` y `supervisorLineId` → **salta el login**.
3. La primera petición autenticada devuelve 401.
4. `fetchWithAuth` (`coordinatorApi.js:19-24`) llama `logoutUser()` + `window.location.reload()`.
5. `logoutUser` (`authService.js:58-63`) limpia **solo `sessionStorage`**. Las tres claves de
   `localStorage` siguen ahí → vuelta al paso 2.

**Impacto:** recarga en bucle sin salida por interfaz; el operador queda bloqueado hasta que
alguien limpie el almacenamiento del navegador a mano. En una terminal de planta compartida
esto detiene el turno.

---

### C-6 · Contraseña por defecto en el cliente + enumeración de usuarios sin autenticar + sin límite de intentos

**Archivos:** `src/components/LoginScreen.jsx:224` · `server/server.js:1981-2004` · `server/server.js:51`

```js
const loginPassword = selectedRole === "COORDINADOR" ? coordinatorPin : (supervisorPassword || '123456');
```

Tres debilidades que se componen:

1. El bundle de producción contiene la contraseña `'123456'` como fallback; dejar el campo
   vacío la envía. Cualquiera que abra las herramientas de desarrollo la lee.
2. `GET /api/supervisores/publico` devuelve **sin autenticación** el `Username` real de todos
   los supervisores, alimentando el desplegable del login.
3. `POST /api/auth/login` no tiene rate limiting, bloqueo por intentos ni retardo.

Con (2) se obtiene la lista completa de usuarios, con (1) la contraseña más probable y con (3)
intentos ilimitados. El hashing con bcrypt (`server.js:70`) es correcto y no compensa esto.

---

### C-7 · El shim nunca se suscribe al socket: no hay tiempo real

**Archivo:** `src/mocks/firebase/firestore.js:44-103`

`eventName` se asigna **dentro** de `fetchData`, después de un `await fetch(...)`. La
suscripción se programa con `setTimeout(..., 0)`:

```js
fetchData();                       // asíncrona; eventName se asigna tras la respuesta HTTP
setTimeout(() => {
    if (eventName) socket.on(eventName, handleUpdate);   // ← eventName sigue siendo null
}, 0);
```

Un `setTimeout(0)` se ejecuta en el siguiente macrotask, siempre antes de que vuelva una
petición de red. `eventName` es `null` y **`socket.on` no llega a ejecutarse nunca**.

**Impacto:** aunque se arreglen C-1 y C-2, cada `onSnapshot` seguirá siendo una lectura única
al montar. Los `io.emit` del backend (28 puntos de emisión) no refrescan a ningún cliente que
pase por el shim. Los supervisores verían datos congelados desde el montaje del componente.

---

### C-8 · El servidor arranca aunque falle la conexión a la base, y `/api/health` miente

**Archivo:** `server/server.js:30-39`, `:46-48`

```js
async function connectDB() {
    try { pool = await sql.connect({ connectionString }); … }
    catch (err) { console.error('❌ Error conectando a SQL Server:', err); }   // ← sin rethrow
}
connectDB();                                            // sin await
```

Si SQL Server no responde, `pool` queda `undefined`, `connectDB()` no propaga nada y
`server.listen` se ejecuta igual. Cada endpoint falla entonces con
`Cannot read properties of undefined (reading 'request')`, devuelto como HTTP 500. Mientras
tanto `/api/health` responde `{"status":"ok"}` incondicionalmente: **no consulta la base**.

Además, `connectDB()` no se reintenta nunca: una caída transitoria de SQL Server al arranque
deja el proceso permanentemente inútil, aparentando estar sano ante cualquier supervisor de
procesos o balanceador.

---

## [MEDIO]

### M-1 · `onSnapshot(collection(db, "config"))` no está contemplado por el shim
**Archivos:** `src/components/PanelCoordinador.jsx:1862` · `src/mocks/firebase/firestore.js:59`, `:77-84`
El shim solo atiende `config` cuando `ref.type === 'doc'`. Una referencia de **colección** cae
en el `else` y devuelve `createQuerySnapshot([])`. `configDocs` queda `{}` para siempre, y con
ello `activeLines` y `skuPlan` del Coordinador nunca se pueblan desde este efecto. Es un
segundo fallo independiente sobre los mismos datos que C-1.

### M-2 · `html5-qrcode` se usa pero no está declarado como dependencia
**Archivos:** `package.json:33-40` · `src/components/HudPlanta.jsx`
Solo está disponible como dependencia transitiva de `@capacitor/barcode-scanner`. Un
`npm prune`, un cambio de versión del scanner o un gestor con hoisting distinto (pnpm, Yarn PnP)
rompe el build del escáner QR, que es el mecanismo principal de alta de personal en planta.

### M-3 · `http://localhost:3001` está incrustado en seis archivos
**Archivos:** `src/services/apiService.js:118` · `src/services/coordinatorApi.js:4`, `:5` ·
`src/services/authService.js:14` · `src/components/LoginScreen.jsx:6` ·
`src/mocks/firebase/firestore.js:3`, `:4`
La aplicación no se puede desplegar fuera de la máquina de desarrollo sin editar código.
Vite ya soporta `import.meta.env.VITE_*` y `.env.example` existe, pero no se usa para esto.

### M-4 · CORS abierto y WebSocket sin autenticación
**Archivos:** `server/server.js:14-19`, `:22`, `:2049-2055`
`app.use(cors())` acepta cualquier origen, y `io` declara `origin: '*'` con un comentario
"En producción, cambiar". `io.on('connection')` no valida ningún token: cualquier cliente
puede conectarse y recibir los 28 eventos de refresco. Los payloads actuales son señales
ligeras (`{}`, `{ slotId, action }`, `{ lineId, supervisorId }`), así que la fuga es de
metadatos operativos, no de datos de personal — pero el canal no está autenticado.

### M-5 · 29 respuestas de error exponen `err.message` del servidor
**Archivo:** `server/server.js` (29 apariciones, p. ej. `:112`, `:1162`, `:2002`, `:2042`)
`res.status(500).json({ error: err.message })` devuelve al cliente mensajes del driver de SQL
Server: nombres de tabla y columna, restricciones violadas, a veces fragmentos de consulta.
Conviene registrar el detalle en servidor y devolver un identificador de error al cliente.

### M-6 · Un 403 legítimo fuerza el cierre de sesión y la recarga
**Archivo:** `src/services/coordinatorApi.js:19-24`
`fetchWithAuth` trata 401 y 403 igual: cierra sesión y recarga. Pero 403 significa "estás
autenticado, no autorizado" — exactamente lo que devuelven los cinco endpoints
`requireRole('COORDINADOR')` a un supervisor, y lo que devuelve `requireLineOwnership` cuando
alguien toca la línea equivocada. Un supervisor que llegue a esas rutas es expulsado en vez
de ver un mensaje. Solo 401 debe forzar logout.

### M-7 · El motor de sincronización de reloj está muerto; los cronómetros usan desfase 0
**Archivos:** `src/services/apiService.js:82-100` · `src/App.jsx:361` · `src/components/SlotCard.jsx:413`
`syncServerTimeOffset` escribe con `setDoc` (no-op, C-3) y luego relee esperando un
`Timestamp` de Firestore con `.toDate()`. El `catch` deja `serverTimeOffset` en 0 y solo emite
un `console.warn`. Todo cronómetro de ergonomía y de paro mide contra el reloj del dispositivo,
sin corrección — y los tablets de planta suelen desviarse.

### M-8 · La línea elegida en el login es una afirmación del cliente que contradice al JWT
**Archivos:** `src/components/LoginScreen.jsx:194`, `:218`, `:235` · `server/middleware/auth.js:79`
El supervisor elige su línea en un desplegable y el valor se guarda en `localStorage`; toda la
UI (`HudPlanta`, `LineaSku`, `RelevosNotificaciones`) se renderiza sobre ese valor. El servidor,
en cambio, autoriza contra `Supervisores.LineaAsignadaActual`, embebido en el JWT. Si no
coinciden, el supervisor ve una línea completa y **cada acción devuelve 403**. No es un agujero
de seguridad (el servidor decide bien) pero sí un flujo roto: el `lineId` debería venir de la
respuesta del login, no de un desplegable.

### M-9 · Ningún `fetch` tiene timeout, reintento ni cancelación
**Archivos:** todo `src/services/` y `src/mocks/firebase/firestore.js`
Cero apariciones de `AbortController` o `signal:` en el proyecto. En una terminal industrial
con WiFi intermitente, una petición colgada deja el botón en "Guardando…" indefinidamente sin
forma de recuperarse salvo recargar. Tampoco hay reintentos para fallos transitorios.

### M-10 · El login descarta el mensaje de error real
**Archivo:** `src/components/LoginScreen.jsx:241-246`
`authService` documenta explícitamente `// NO SILENT FALLBACK. Throw exception explicitly.` y
propaga el error del servidor; `LoginScreen` lo sustituye por el literal
`"Error al iniciar sesión local."`. El operador no distingue contraseña incorrecta de backend
caído — dos incidentes con respuestas completamente distintas.

### M-11 · Dos scripts npm apuntan a archivos que no existen
**Archivo:** `package.json:12-13`
- `test:unit-functions` → `node functions/test-standalone.cjs`; el directorio `functions/`
  **no existe**. El archivo real es `scripts/test-unit-functions.cjs`.
- `test:security` → `scripts/test-security-suite.js` importa el paquete `firebase`, que no está
  instalado ni declarado. Verificado: `Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'firebase'`.

Ambos son residuos de la era Firebase. No hay suite de pruebas ejecutable en el repositorio.

### M-12 · `requireLineOwnership`: N+1 consultas y una comparación que deja pasar nulos
**Archivo:** `server/middleware/auth.js:69-84`, `:79`
Ejecuta una consulta por cada `slotId` dentro de un bucle secuencial; un lote de 20
asignaciones son 20 viajes a la base antes de que empiece el trabajo real. Y en `:79`,
`actualLineId !== req.user.lineId` evalúa a `false` cuando ambos son `null`: un supervisor sin
línea asignada pasa la validación sobre cualquier puesto cuyo `LineId` sea `NULL`.

### M-13 · Sin manejo de errores del servidor ni apagado ordenado
**Archivo:** `server/server.js:2057-2060`
No hay `server.on('error')`, ni `process.on('unhandledRejection')`, ni cierre del pool en
`SIGTERM`/`SIGINT`. Confirmado durante esta auditoría: un puerto ocupado tumba el proceso con
un `Unhandled 'error' event` y un volcado de pila crudo. En producción, cualquier promesa
rechazada sin capturar termina el proceso en Node 24.

### M-14 · `JWT_SECRET` no se valida al arrancar
**Archivos:** `server/server.js:102` · `server/middleware/auth.js:13`
Si falta `server/.env`, `jwt.sign(payload, undefined)` lanza y el login devuelve 500. Falla
cerrado, que es lo correcto, pero el diagnóstico llega en el primer intento de login de un
operador en vez de al arrancar el servicio. Debe verificarse en el arranque y abortar.

---

## [BAJO]

### B-1 · Módulos sin ningún importador
**Archivos:** `src/skills/qa-harness-engineer.js`, `src/skills/firebase-firestore-specialist.js`
Cero referencias en todo el proyecto. Son andamiaje descriptivo (comentarios sobre cómo
"debería" hacerse algo, con implementaciones simuladas), no código ejecutable.

### B-2 · Andamiaje de Firebase todavía cableado
**Archivos:** `src/services/apiService.js:8`, `:31`, `:32`, `:60-69` ·
`src/mocks/firebase/app.js`, `auth.js`, `functions.js` · `vite.config.js:10-13`
`apiService` inicializa una app de Firebase y contiene un bloque de conexión a emuladores
(`connectFirestoreEmulator`, `connectAuthEmulator`, `connectFunctionsEmulator`) que opera
sobre mocks vacíos. Ejecuta solo si `VITE_USE_EMULATORS === 'true'`, variable que ya no existe.

### B-3 · Tres funciones de `coordinatorApi` apuntan a rutas inexistentes
**Archivo:** `src/services/coordinatorApi.js:150`, `:259`, `:318`
`assignPuestosLive` → `/puestos/asignar` con una firma `{ lineId, assignments }` que el
servidor no espera; `programNextDayShift` → `/turno/programar-siguiente` (no existe, ya
documentado en el propio comentario); `assignSupervisorToLine` → `/supervisores/asignar` con
`supervisorId` cuando el endpoint (`server.js:517`) espera otro contrato. Las tres tragan el
error y devuelven `false`.

### B-4 · Reglas de negocio duplicadas y divergentes
**Archivos:** `src/services/apiService.js:934`, `:2222` · `src/services/coordinatorApi.js:284` ·
`src/components/HudPlanta.jsx:1129` · `src/components/PanelCoordinador.jsx:2350` ·
`server/validations/canWorkerOccupiedSlot.js:7`
Seis implementaciones de la misma regla de compatibilidad trabajador↔puesto, con criterios
distintos (`apiService.js:934` devuelve `false` ante datos faltantes; `coordinatorApi.js:284`
devuelve `true`). `CRITICAL_TIPOS_PUESTO` aparece tres veces (`apiService.js:109`,
`server.js:954`, `server.js:1013`), dos de ellas dentro de la misma función.

### B-5 · Sondeo de ruta cada 500 ms con un efecto que se reconstruye continuamente
**Archivo:** `src/App.jsx:336-353`
El `useEffect` depende de `pathname` y crea un `setInterval` que compara `window.location.pathname`
con `pathname`: cada cambio de ruta destruye y recrea el intervalo. Solo sirve para enrutar
`/dev-console`, excluido de producción por tree-shaking.

### B-6 · 106 `console.log` y 34 `alert()` en código de producción
**Archivos:** `src/` excluyendo `src/dev/`
Los `console.log` incluyen trazas operativas con nombres e IDs. Los `alert()` bloquean el hilo
de la interfaz — problemático en una tablet con guantes y pantalla táctil, y ya sustituidos por
componentes propios en otras partes de la misma aplicación.

### B-7 · `.env.example` describe un proyecto que ya no existe
**Archivo:** `.env.example`
Solo contiene las seis variables `VITE_FIREBASE_*`. No menciona `JWT_SECRET`, `DB_SERVER`,
`DB_NAME`, `PORT` ni la URL de la API. Un desarrollador nuevo no puede arrancar el proyecto
siguiéndolo.

### B-8 · Bundle único de 975 KB
**Archivo:** salida de `npx vite build`
Un solo chunk de 974,76 KB (269 KB gzip). `PanelCoordinador.jsx` (237 KB) y `HudPlanta.jsx`
(199 KB) son la mayor parte. El `import()` dinámico de `apiService` en `PanelCoordinador.jsx:3310`
no separa nada porque el módulo también se importa estáticamente en cinco sitios
(`INEFFECTIVE_DYNAMIC_IMPORT`).

### B-9 · `authService` sigue rotulado como mock
**Archivo:** `src/services/authService.js:1-5`
La cabecera dice "Mock Authentication Manager … Simular una sesión local … dado que TI se
encargará de la autenticación real más adelante". El archivo ya hace autenticación real con
JWT contra SQL Server. El comentario induce a error sobre el nivel de confianza del módulo.

---

# Sección B: Plan de Acción (Roadmap)

Cuatro fases secuenciales. Cada paso es autónomo y verificable; se indica qué debe seguir
funcionando después de aplicarlo. **Ejecutar en orden**: dentro de la Fase 1, el orden entre
1.1 y 1.2 no es negociable (ver C-4).

> **Instrucciones generales para el agente ejecutor**
> - Aplicar **un paso por commit**. No agrupar pasos de fases distintas.
> - Tras cada paso: `npx vite build` (debe compilar) y `node --check server/server.js`.
> - No tocar `server/server.js` en la Fase 1 salvo donde se indique explícitamente:
>   el backend está verificado y no es la causa de ningún hallazgo CRÍTICO.
> - Las suites de verificación de rondas anteriores viven en el scratchpad de la sesión
>   (`verify_gestion_personal.mjs`, `verify_planificacion.mjs`, `verify_mermas.mjs`,
>   `verify_cierre_turno.mjs`, `verify_intercambio_local.mjs`, `verify_sugerencias.mjs`) y
>   requieren el backend levantado con `node server/server.js`.

---

## Fase 1 — Restaurar el plano de datos del Supervisor

Objetivo: que la interfaz del Supervisor vuelva a leer datos reales y que ninguna escritura
pueda perderse en silencio. Resuelve C-1, C-2, C-3, C-4, C-7 y M-1.

### Paso 1.1 · Neutralizar las escrituras engañosas del shim (**hacer esto primero**)

**Archivo:** `src/mocks/firebase/firestore.js`
**Motivo del orden:** el paso 1.2 añade autenticación a las peticiones del shim. Si la rama
`updateDoc → 'puestos'` (líneas 143-159) sigue viva cuando eso ocurra, `clearSlotBlacklist`
pasará de fallar con 401 a **ejecutar una asignación real mal formada** contra un puesto de
producción (C-4).

Sustituir los cuatro escritores por versiones que fallen de forma ruidosa. Reemplazar
íntegramente las líneas 137-183:

```js
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
```

Mantener sin cambios `serverTimestamp`, `getFirestore`, `initializeFirestore`,
`persistentLocalCache`, `persistentMultipleTabManager`, `connectFirestoreEmulator`,
`getDocFromServer`, `getDocsFromServer`.

**Efecto esperado e intencionado:** las diez rutas de la tabla de C-3 pasarán de "fallar en
silencio" a "fallar con un error en pantalla". **No es una regresión**: esas operaciones ya no
persistían nada. El paso 1.3 las migra una por una.

**Verificación:** `npx vite build` compila. Buscar en la consola del navegador
`[firestore-shim]` al usar el HUD — cada aparición es una entrada de trabajo para el paso 1.3.

---

### Paso 1.2 · Unificar el almacenamiento del token y autenticar todas las lecturas del shim

**Archivos:** `src/mocks/firebase/firestore.js` (líneas 1-4, 26-33, 53-57, 64-76, 120-136)

Resuelve C-1 y C-2. Dejar de leer una clave de `localStorage` que nadie escribe y usar la
**única** fuente de verdad del token, `authService.getToken()`.

1. Añadir el import en la cabecera del archivo:

```js
import { io } from 'socket.io-client';
import { getToken } from '../../services/authService';
```

2. Añadir un helper autenticado justo debajo de `const socket = io(...)`:

```js
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
```

3. Sustituir las cuatro llamadas de lectura:

| Ubicación | Antes | Después |
|---|---|---|
| `:28` (`fetchConfigDoc`) | `fetch(\`${API_URL}/config/${docId}\`, { headers: {...localStorage...} })` | `authFetch(\`/config/${docId}\`)` |
| `:54` (`onSnapshot` puestos) | `fetch(\`${API_URL}/puestos\`)` | `authFetch('/puestos')` |
| `:66` (`onSnapshot` trabajadores) | `fetch(..., { headers: {...localStorage...} })` | `authFetch('/operarios/pool')` |
| `:127` (`getDocs` trabajadores) | `fetch(..., { headers: {...localStorage...} })` | `authFetch('/operarios/pool')` |

4. Blindar la rama de `puestos` contra respuestas que no sean un array (C-2):

```js
if (pathName === 'puestos') {
    const res = await authFetch('/puestos');
    if (!res.ok) throw new Error(`GET /puestos → HTTP ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error('GET /puestos devolvió un payload no iterable');
    callback(createQuerySnapshot(data));
    eventName = 'puestos_updated';
}
```

**Verificación:** iniciar sesión como supervisor con el backend levantado. La rejilla de
puestos y la lista de personal deben poblarse. Ninguna petición a `/api/puestos`,
`/api/config/*` ni `/api/operarios/pool` debe devolver 401 en la pestaña Red.

---

### Paso 1.3 · Corregir la suscripción al socket (C-7)

**Archivo:** `src/mocks/firebase/firestore.js:40-111`

`eventName` se resuelve dentro de una función asíncrona pero se consume en un
`setTimeout(0)` que siempre gana la carrera. Determinar el nombre del evento **de forma
síncrona a partir de la referencia**, antes de disparar la primera lectura:

```js
export const onSnapshot = (ref, callback, errorCallback) => {
    let isCancelled = false;

    // Resolver el path y el evento de forma SÍNCRONA. Antes esto se hacía dentro de
    // fetchData (asíncrona) y la suscripción se intentaba en un setTimeout(0), que
    // siempre corre antes de que vuelva la red: socket.on no llegaba a ejecutarse
    // nunca y no había tiempo real (ver AUDIT_REPORT C-7).
    let pathName = ref;
    if (ref.type === 'collection') pathName = ref.path;
    if (ref.type === 'query')      pathName = ref.col.path || ref.col;
    if (ref.type === 'doc')        pathName = ref.path;

    const eventName =
        pathName === 'puestos'      ? 'puestos_updated'      :
        pathName === 'trabajadores' ? 'trabajadores_updated' :
        pathName === 'config'       ? 'config_updated'       : null;

    const fetchData = async () => {
        if (isCancelled) return;
        try {
            // ... ramas de lectura, usando el pathName ya resuelto arriba
            // (quitar los reasignaciones de eventName de cada rama)
        } catch (err) {
            if (errorCallback) errorCallback(err);
            else console.error('[firestore-shim] onSnapshot:', err.message);
        }
    };

    fetchData();

    const handleUpdate = () => fetchData();
    if (eventName) socket.on(eventName, handleUpdate);

    return () => {
        isCancelled = true;
        if (eventName) socket.off(eventName, handleUpdate);
    };
};
```

Nótese el `else console.error` en el `catch`: hoy, sin `errorCallback`, los fallos de lectura
desaparecen sin dejar rastro.

**Verificación:** con dos navegadores abiertos, una asignación hecha en uno debe reflejarse en
el otro sin recargar.

---

### Paso 1.4 · Soportar la referencia de colección `config` (M-1)

**Archivos:** `src/mocks/firebase/firestore.js` · consumidor: `src/components/PanelCoordinador.jsx:1862`

Añadir una rama en `onSnapshot`, antes del `else` genérico, que resuelva los tres documentos
de config que el Coordinador espera:

```js
else if (pathName === 'config' && ref.type !== 'doc') {
    // PanelCoordinador.jsx:1862 se suscribe a la COLECCIÓN config, no a un doc.
    // Antes caía en el else genérico y recibía siempre un snapshot vacío.
    const ids = ['global_priority', 'shift_status'];
    const docs = await Promise.all(ids.map(async (id) => {
        const { exists, data } = await fetchConfigDoc(id);
        return { id, ...(exists ? data : {}) };
    }));
    callback(createQuerySnapshot(docs));
}
```

**Alternativa preferible si hay margen:** sustituir ese `useEffect` por una llamada directa a
un método nuevo de `coordinatorApi.js` (`getConfigGlobal()`), y eliminar la dependencia del
shim en `PanelCoordinador.jsx`. Es el mismo patrón ya aplicado con éxito a mermas,
planificación T+1 y gestión de personal.

**Verificación:** en el panel del Coordinador, `activeLines` y `skuPlan` deben poblarse con
las líneas y SKU reales de la tabla `Lineas`.

---

### Paso 1.5 · Migrar a REST las escrituras que el paso 1.1 dejó lanzando

Diez rutas (tabla de C-3). Se abordan en dos grupos, **una por commit**.

**Grupo A — ya existe endpoint; solo hay que cablear:**

| Ruta rota | Endpoint destino | Acción |
|---|---|---|
| `PanelCoordinador.jsx:2640` (`handleToggleLock`) | `POST /api/planificacion/guardar` | Enviar el flag `locked` dentro del payload de líneas, vía `guardarPlanificacion()` de `coordinatorApi.js:210` |
| `apiService.js:1458` (`reprogramPartialNextDayShift`) | `POST /api/planificacion/guardar` | Redirigir a `guardarPlanificacion()`; la función completa puede eliminarse |
| `apiService.js:82` (`syncServerTimeOffset`) | `GET /api/health` | Ver Fase 3, paso 3.4 |

**Grupo B — requiere endpoints nuevos en `server/server.js`.** Especificación, siguiendo el
patrón transaccional ya establecido (`new sql.Transaction(pool)` + `WITH (UPDLOCK, SERIALIZABLE)`
+ `io.emit` al cerrar):

| Endpoint nuevo | Reemplaza a | Cuerpo | Notas |
|---|---|---|---|
| `POST /api/lineas/:lineId/arrancar` | `startLineOfficially` (`apiService.js:369`), llamado en `HudPlanta.jsx:2574` | `{ sku }` | `Lineas.Status='ARRANQUE'`, fija `Sku` y `TurnStartTimestamp`. Emitir `lineas_updated` + `config_updated` |
| `POST /api/lineas/:lineId/sku` | `transitionLineToSku` (`:2089`), en `HudPlanta.jsx:2919` | `{ skuAnterior, skuNuevo }` | Cambio en caliente. Reutilizar la lógica `IsSkuDependent`/`RequiredSkusJson` ya existente en `Puestos` |
| `POST /api/lineas/:lineId/sku-finalizado` | `registerSkuFinishedEvent` (`:2651`), en `HudPlanta.jsx:3008` | `{ sku }` | Registro de fin de corrida |
| `PATCH /api/operarios/:id/doble-turno` | `updateWorkerDobleTurno` (`:2338`), en `HudPlanta.jsx:3421` | `{ activo }` | Toggle individual. `/lineas/:id/cerrar-turno` ya recibe el lote, pero no el toggle unitario |
| `POST /api/puestos/:id/limpiar-blacklist` | `clearSlotBlacklist` (`:912`), en `RelevosNotificaciones.jsx:876` | — | `Puestos.RejectedWorkerIdsJson = '[]'`. **No** reutilizar `/puestos/relevo` (ver C-4) |
| `POST /api/lineas/:lineId/auto-asignar-fijos` | `autoAssignFixedOperators` (`:424`) e `initializeSingleLineTransaction` (`:192`), en `HudPlanta.jsx:1519`, `:1533` | `{ sku }` | La lógica ya existe server-side: reutilizar `ejecutarInyeccionDeTurno` (`server.js:1181`) acotada a una línea |

Todos con `requireAuth` + `requireRole('COORDINADOR','SUPERVISOR')`; los de `:lineId` deben
validar la propiedad de la línea igual que `assertLineOwnership` (`server.js:712`).

**Verificación por endpoint:** un script en el estilo de `verify_gestion_personal.mjs`
(login real, aserciones sobre la respuesta, comprobación cruzada con `sqlcmd`).

---

### Paso 1.6 · Corregir el bucle infinito de sesión (C-5)

**Archivos:** `src/services/authService.js:58-63` · `src/App.jsx:328-330`

Causa raíz: dos almacenamientos con vidas distintas para una misma sesión. Dos correcciones,
ambas necesarias:

1. **`logoutUser` debe limpiar todo**, no solo `sessionStorage`:

```js
export async function logoutUser() {
  currentUser = null;
  sessionStorage.removeItem('smartassign_mock_user');
  // Sin esto, App.jsx:404 sigue viendo una sesión válida en localStorage tras el
  // logout y vuelve a montar el panel → 401 → logout → reload, en bucle (C-5).
  localStorage.removeItem('supervisorName');
  localStorage.removeItem('supervisorLineId');
  localStorage.removeItem('userRole');
  notifyListeners();
  return true;
}
```

2. **La condición de sesión de `App.jsx` debe exigir token**, no solo identidad. Sustituir la
   inicialización de estado de `:328-330` por una lectura que verifique
   `getToken() !== null` antes de aceptar los valores de `localStorage`; si no hay token,
   arrancar con cadenas vacías para que `:404` lleve al login.

**Nota de diseño:** la solución de fondo es guardar la sesión completa en un único
almacenamiento. `localStorage` (persistente) es lo apropiado para una terminal de planta donde
el operador no debe reautenticarse al cambiar de pestaña. Puede abordarse en la Fase 4.

**Verificación:** iniciar sesión, cerrar la pestaña, reabrir la aplicación. Debe aparecer la
pantalla de login limpia, sin recargas en bucle.

---

## Fase 2 — Seguridad

### Paso 2.1 · Eliminar la contraseña por defecto del cliente (C-6, parte 1)

**Archivo:** `src/components/LoginScreen.jsx:224`

```js
// Antes: (supervisorPassword || '123456')  ← la contraseña quedaba en el bundle
const loginPassword = selectedRole === "COORDINADOR" ? coordinatorPin : supervisorPassword;
if (!loginPassword) {
  triggerNativeHapticFeedback('error');
  setErrorText("Introduce tu contraseña.");
  return;
}
```

Aprovechar el mismo commit para M-10 (líneas 241-246): mostrar `err.message`, que
`authService` ya propaga a propósito.

```js
} catch (err) {
  triggerNativeHapticFeedback('error');
  setErrorText(err.message || "No se pudo iniciar sesión.");
}
```

**Acción operativa asociada, fuera del código:** las cuentas sembradas usan `123456`
(visible en `server/credentials/`). Forzar el cambio en el primer acceso — la columna
`Usuarios.MustChangePassword` y el flag `forcePasswordChange` de la respuesta de login
(`server.js:109`) ya existen, pero **ningún componente los consume**. Implementar esa pantalla
es un paso de Fase 2 por derecho propio.

### Paso 2.2 · Limitar intentos de login (C-6, parte 3)

**Archivo:** `server/server.js:51`
Añadir `express-rate-limit` (`npm i express-rate-limit` en `server/`) al endpoint de login:

```js
const rateLimit = require('express-rate-limit');
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Demasiados intentos. Espera 15 minutos.' }
});
app.post('/api/auth/login', loginLimiter, async (req, res) => { /* … */ });
```

No aplicar el limitador globalmente: el HUD hace polling legítimo y quedaría estrangulado.

### Paso 2.3 · Restringir la exposición de `/api/supervisores/publico` (C-6, parte 2)

**Archivo:** `server/server.js:1981-2004`
El endpoint alimenta el desplegable del login, así que debe seguir siendo público, pero no
tiene por qué revelar el `Username` real. Devolver `id` y `name`, y hacer que el cliente envíe
el `id`; el servidor resuelve internamente el `Username`. Requiere ajustar `LoginScreen.jsx:211-215`
y el handler de login.

Si eso resulta invasivo, la mitigación mínima es aplicar `loginLimiter` también aquí.

### Paso 2.4 · Cerrar CORS y autenticar el WebSocket (M-4)

**Archivo:** `server/server.js:14-22`, `:2049`

```js
const ORIGENES = (process.env.CORS_ORIGINS || 'http://localhost:5173').split(',');
const io = new Server(server, { cors: { origin: ORIGENES, methods: ['GET', 'POST'] } });
app.use(cors({ origin: ORIGENES }));
```

Y validar el token en el handshake del socket:

```js
io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('No autorizado'));
    try { socket.data.user = jwt.verify(token, process.env.JWT_SECRET); next(); }
    catch { next(new Error('No autorizado')); }
});
```

**Dependencia:** exige pasar el token al construir el socket en `coordinatorApi.js:5` y
`firestore.js:4` (`io(URL, { auth: { token: getToken() } })`). Aplicar ambos lados en el mismo
commit, o el tiempo real se cae.

### Paso 2.5 · Dejar de devolver `err.message` al cliente (M-5)

**Archivo:** `server/server.js` (29 sitios)
Introducir un helper y sustituir mecánicamente:

```js
const errorServidor = (res, err, contexto) => {
    console.error(`[${contexto}]`, err);
    res.status(500).json({ error: 'Error interno del servidor.' });
};
// res.status(500).json({ error: err.message })  →  errorServidor(res, err, 'GET /api/puestos')
```

**Cuidado:** varios `catch` distinguen errores de negocio (con `statusCode` propio, p. ej.
`server.js:694`) de fallos internos. Revisar cada sitio; los mensajes de negocio deben seguir
llegando al cliente — la UI de gestión de personal depende de ellos ("nómina duplicada",
"cargo inválido").

### Paso 2.6 · Validar `JWT_SECRET` al arrancar (M-14)

**Archivo:** `server/server.js`, justo después de `require('dotenv').config()`

```js
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    console.error('❌ JWT_SECRET ausente o demasiado corto. Define uno en server/.env');
    process.exit(1);
}
```

---

## Fase 3 — Resiliencia y arquitectura

### Paso 3.1 · Arranque honesto del backend (C-8)

**Archivo:** `server/server.js:30-48`, `:2057`

```js
async function connectDB() {
    // Antes: el catch solo logueaba, el server escuchaba igual con pool=undefined y
    // cada endpoint moría con "Cannot read properties of undefined" (AUDIT_REPORT C-8).
    for (let intento = 1; intento <= 5; intento++) {
        try {
            pool = await sql.connect({ connectionString });
            app.locals.pool = pool;
            console.log('✅ Conectado a SQL Server (SmartAssignDB) vía Windows Auth');
            return;
        } catch (err) {
            console.error(`❌ Intento ${intento}/5 de conexión a SQL Server falló:`, err.message);
            if (intento === 5) throw err;
            await new Promise(r => setTimeout(r, 2000 * intento));
        }
    }
}

connectDB()
    .then(() => {
        const PORT = process.env.PORT || 3001;
        server.listen(PORT, () => console.log(`🚀 Servidor backend en http://localhost:${PORT}`));
    })
    .catch(() => { console.error('💥 No se pudo conectar a la base. Abortando.'); process.exit(1); });
```

Y que `/api/health` diga la verdad:

```js
app.get('/api/health', async (req, res) => {
    try {
        await pool.request().query('SELECT 1');
        res.json({ status: 'ok', db: 'up', serverTime: new Date().toISOString() });
    } catch (err) {
        res.status(503).json({ status: 'degraded', db: 'down' });
    }
});
```

### Paso 3.2 · Manejo de errores del proceso y apagado ordenado (M-13)

**Archivo:** `server/server.js`, al final

```js
server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') console.error(`❌ El puerto ${PORT} ya está en uso.`);
    else console.error('❌ Error del servidor HTTP:', err);
    process.exit(1);
});
process.on('unhandledRejection', (r) => console.error('⚠️ Promesa rechazada sin capturar:', r));
['SIGTERM', 'SIGINT'].forEach(sig => process.on(sig, async () => {
    console.log(`\n${sig} recibido, cerrando…`);
    server.close();
    try { await pool?.close(); } catch {}
    process.exit(0);
}));
```

### Paso 3.3 · Timeouts y reintentos en el cliente (M-9)

**Archivos:** `src/services/apiService.js:120` (`apiFetch`) ·
`src/services/coordinatorApi.js:7` (`fetchWithAuth`)

Aplicar en los dos helpers centralizados; no hace falta tocar los llamadores.

```js
const TIMEOUT_MS = 15000;

async function conTimeout(url, options, ms = TIMEOUT_MS) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    try {
        return await fetch(url, { ...options, signal: ctrl.signal });
    } catch (err) {
        if (err.name === 'AbortError') throw new Error('El servidor no respondió a tiempo.');
        throw err;
    } finally {
        clearTimeout(t);
    }
}
```

Reintentar **solo** peticiones idempotentes (GET), una vez, con 1 s de espera. **No reintentar
POST/PATCH**: los endpoints de asignación no son idempotentes y un reintento podría duplicar
movimientos de personal.

### Paso 3.4 · Sincronización de reloj real (M-7)

**Archivos:** `src/services/apiService.js:82-100` · `server/server.js:46`
Reescribir `syncServerTimeOffset` sobre el `serverTime` que el paso 3.1 añade a `/api/health`:

```js
export async function syncServerTimeOffset() {
  const antes = Date.now();
  try {
    const { serverTime } = await apiFetch('/health');
    const despues = Date.now();
    if (!serverTime) return;
    serverTimeOffset = new Date(serverTime).getTime() - (antes + despues) / 2;
    console.log(`[Clock Sync] Desfase servidor-cliente: ${serverTimeOffset}ms`);
  } catch (e) {
    console.warn('[Clock Sync] Sin sincronizar, se usa desfase 0:', e.message);
  }
}
```

### Paso 3.5 · Que la línea del supervisor venga del servidor (M-8)

**Archivos:** `src/components/LoginScreen.jsx:194`, `:218`, `:343-361` ·
`src/services/authService.js:43` · `server/server.js:106-110`

1. Incluir `lineId` en la respuesta de login (`server.js:108`): hoy se calcula en `:82-92` y se
   mete en el JWT, pero **no se devuelve en el objeto `user`** — de ahí que
   `authService.js:43` lea un campo inexistente.
2. Eliminar el desplegable de línea del login (`:343-361`) y usar el `lineId` devuelto.
3. Si un supervisor no tiene línea asignada, mostrar un mensaje explícito en vez de dejarle
   elegir una que el servidor rechazará.

### Paso 3.6 · Endurecer `requireLineOwnership` (M-12)

**Archivo:** `server/middleware/auth.js:69-84`
Sustituir el bucle de N consultas por una sola con `IN`, y tratar el caso nulo:

```js
if (!req.user.lineId) {
    return res.status(403).json({ error: 'No tienes una línea asignada.' });
}
const ids = slotIdsToCheck.map(Number).filter(Number.isInteger);
if (ids.length !== slotIdsToCheck.length) {
    return res.status(400).json({ error: 'Identificadores de puesto inválidos.' });
}
const result = await pool.request().query(
    `SELECT Id, LineId FROM Puestos WHERE Id IN (${ids.join(',')})`
);
```

La interpolación es segura porque `ids` acaba de filtrarse a enteros; documentarlo con un
comentario en el código para que no se lea como una inyección SQL en la próxima revisión.

### Paso 3.7 · URLs por variable de entorno (M-3)

**Archivos:** los seis de M-3 · `.env.example` · `vite.config.js`

```js
// src/config.js (nuevo)
export const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';
export const API_URL  = `${API_BASE}/api`;
```

Importarlo en los seis sitios. Actualizar `.env.example` (resuelve también B-7):

```
# Frontend
VITE_API_URL=http://localhost:3001
# Backend (server/.env)
JWT_SECRET=<64 caracteres hexadecimales aleatorios>
DB_SERVER=localhost
DB_NAME=SmartAssignDB
PORT=3001
CORS_ORIGINS=http://localhost:5173
```

### Paso 3.8 · Declarar `html5-qrcode` (M-2)

**Archivo:** `package.json`
Añadir `"html5-qrcode": "^2.3.8"` a `dependencies` (la versión que ya resuelve el lockfile) y
ejecutar `npm install` para actualizar `package-lock.json`.

### Paso 3.9 · Reparar o retirar los scripts npm rotos (M-11)

**Archivo:** `package.json:12-13`
- `test:unit-functions`: apuntar a `scripts/test-unit-functions.cjs`, que sí existe.
- `test:security`: reescribir sobre la API REST (mismo estilo que las suites `verify_*.mjs` de
  las rondas anteriores) o eliminar el script y el archivo. **No dejar un script de seguridad
  que no puede ejecutarse**: da una falsa sensación de cobertura.

---

## Fase 4 — Limpieza y deuda técnica

Ninguno de estos pasos cambia comportamiento. Abordar solo con las Fases 1-3 cerradas.

### Paso 4.1 · Eliminar código muerto (B-1, B-2, B-3)
- Borrar `src/skills/qa-harness-engineer.js` y `src/skills/firebase-firestore-specialist.js`
  (cero importadores; verificar con `grep -rn "qa-harness-engineer\|firebase-firestore-specialist" src/`).
- Quitar de `apiService.js` las líneas `8`, `31`, `32` y el bloque de emuladores `60-69`;
  después, borrar `src/mocks/firebase/app.js`, `auth.js`, `functions.js` y sus tres alias en
  `vite.config.js:11-13`.
- Borrar de `coordinatorApi.js` `programNextDayShift` (`:259`), `assignPuestosLive` (`:150`) y
  revisar `assignSupervisorToLine` (`:318`) contra el contrato real de `server.js:517`.
  **Antes de borrar `programNextDayShift`**, comprobar que `src/dev/DevConsole.jsx` ya no la
  importa (era la única razón de que siguiera exportada).

### Paso 4.2 · Unificar las reglas de negocio duplicadas (B-4)
Extraer una implementación canónica de `canWorkerOccupiedSlot` e `isWorkerRoleCompatibleWithSlot`
a `src/shared/reglas.js`, importada por los cinco consumidores del cliente. **Contrastar antes
la semántica** con `server/validations/canWorkerOccupiedSlot.js`, que es la autoritativa: hoy
`apiService.js:934` devuelve `false` ante datos faltantes y `coordinatorApi.js:284` devuelve
`true` — hay que decidir cuál es la correcta, no promediarlas. Elevar `CRITICAL_TIPOS_PUESTO`
a constante de módulo en `server.js` (hoy se redeclara en `:954` y `:1013`).

### Paso 4.3 · Reemplazar `alert()` y depurar `console.log` (B-6)
Sustituir las 34 llamadas a `alert()` por el componente de notificación ya presente en la
aplicación. Reducir los 106 `console.log`, priorizando los que emiten nombres de trabajador
o identificadores.

### Paso 4.4 · Retirar el sondeo de ruta (B-5)
`src/App.jsx:336-353`: eliminar el `setInterval` de 500 ms. `popstate` cubre la navegación del
navegador; para `/dev-console`, evaluar `window.location.pathname` una sola vez al montar.

### Paso 4.5 · División del bundle (B-8)
Convertir `PanelCoordinador` y `HudPlanta` en importaciones perezosas dentro de `App.jsx`
(los dos nunca se renderizan a la vez: dependen de `userRole`). Eliminar el `import()` dinámico
inútil de `PanelCoordinador.jsx:3310` y usar la importación estática que ya existe.

### Paso 4.6 · Actualizar comentarios engañosos (B-9)
Reescribir la cabecera de `src/services/authService.js:1-5`: ya no es un mock. Revisar de paso
las notas "Mock/API" de `coordinatorApi.js`, que describen funciones que hace rondas dejaron de
serlo.

---

## Notas para el agente ejecutor

**Lo que NO hay que tocar.** El backend SQL Server, los cinco endpoints de gestión de personal
(`server.js:195-419`), la planificación T+1 (`:1338-1556`), mermas (`:1729`), cierre de turno
(`:1804`) y el despachador de relevos (`:689-1060`) están verificados de extremo a extremo por
las suites de rondas anteriores. Los hallazgos CRÍTICOS son todos del lado cliente, salvo C-6
y C-8.

**Riesgo del paso 1.1.** Es el único paso que empeora la experiencia visible antes de
mejorarla: convierte fallos silenciosos en errores en pantalla. Es intencionado y es la
condición previa para poder localizar las diez rutas del paso 1.5. No fusionar 1.1 a una rama
compartida sin 1.5 planificado inmediatamente después.

**Precaución con la base de prueba.** Es compartida y de larga vida; rondas anteriores dejaron
estado residual (puestos `SUSPENDIDO`, líneas activas, operarios agotados de `POOL_ARRANQUE`).
Ante una suite que falla, comprobar el estado real con `sqlcmd` antes de concluir que hay una
regresión: en las últimas cinco rondas, la mayoría de esos fallos fueron contaminación de datos
y no defectos de código.
