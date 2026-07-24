# Modelo de Seguridad y Matriz de Permisos: SmartAssign MVP V1.0

## 1. Arquitectura de Autenticación

SmartAssign utiliza **Firebase Authentication Anónimo enriquecido con Custom Claims** mediante la Cloud Function callable `assignUserClaims`.

### Estrategia en Piso de Planta:
- Los supervisores y coordinadores inician sesión sin necesidad de ingresar contraseñas complejas en dispositivos móviles o tabletas compartidas de la planta.
- Al presionar *"Ingresar a la Terminal"*, la aplicación crea una sesión anónima en Firebase Auth (`signInAnonymously(auth)`).
- Invoca la Cloud Function `assignUserClaims` enviando el rol y datos de la sesión:
  - **Coordinador:** Requiere la validación del PIN maestro (`9900` por defecto o configurado en backend). Incluye rate-limiting (máximo 5 intentos fallidos, bloqueo temporal de 15 min en `pin_attempts`).
  - **Supervisor:** Valida que la identidad y línea correspondan a la asignación oficial.
- Una vez verificados los datos en el servidor, Firebase Admin SDK estampa los **Custom Claims** (`request.auth.token.role` y `request.auth.token.lineId`).
- El cliente invoca `user.getIdToken(true)` para refrescar el token JWT firmado criptográficamente.

---

## 2. Matriz de Permisos en Firestore (`firestore.rules`)

Todas las operaciones requieren `request.auth != null`. El acceso anónimo sin claims válidos es **completamente rechazado**.

| Colección | Operación | Regla de Seguridad |
| :--- | :--- | :--- |
| `trabajadores` | Lectura | Cualquier usuario autenticado (`request.auth != null`) |
| `trabajadores` | Escritura | **Coordinador:** Acceso total.<br>**Supervisor:** Permitido únicamente si:<br>1. Modifica un operario ubicado en su línea (`physicalLineLocation == token.lineId`).<br>2. Asigna destino a personal libre (`lineaDestinoId == token.lineId` y estado previo en `['DISPONIBLE_BOLSON', 'POOL_ARRANQUE', 'INACTIVO']`).<br>3. Confirma llegada de personal en tránsito despachado a su línea (`physicalLineLocation == token.lineId` y `lineaDestinoId == token.lineId`). |
| `puestos` | Lectura | Cualquier usuario autenticado |
| `puestos` | Escritura | **Coordinador:** Acceso total.<br>**Supervisor:** Solo sobre puestos pertenecientes a su línea asignada (`resource.data.lineId == token.lineId`). |
| `config` | Lectura | Cualquier usuario autenticado |
| `config` | Escritura | **Coordinador:** Acceso total.<br>**Supervisor:** Solo sobre documentos operativos autorizados: `time_sync`, `shift_status`, `global_priority`, `production_reports` y `line_{lineId}` de su propia línea. Escritura en `supervisors_assignment` o `next_day_plan` **prohibida**. |
| `programa_produccion` | Lectura / Escritura | Lectura: Autenticado. Escritura: **Solo Coordinador** |
| `historial_dias` | Lectura / Escritura | Lectura: Autenticado. Escritura: **Solo Coordinador** |

---

## 3. Ciclo de Vida de Tokens y Cambio de Turno en Terminal Compartida

1. **Cierre de Turno:** Al presionar "Cerrar sesión de terminal", se ejecuta `signOut(auth)`. La sesión de Firebase Auth se revoca inmediatamente, invalidando el token JWT y eliminando el acceso a Firestore desde ese cliente.
2. **Relevo de Supervisor:** El supervisor entrante selecciona su nombre y línea. Se genera una **nueva sesión anónima en Firebase Auth** y se solicita la estampación de nuevos Custom Claims específicos para la nueva línea.

---

## 4. Aislamiento de `/dev-console` y Test Harness

> [!WARNING]
> **ADVERTENCIA DE SEGURIDAD CRÍTICA:**
> 
> La consola `/dev-console` contiene funciones de prueba interna, simulación de estrés y purga de datos (`handleResetDB`).
> 
> 1. **Exclusión del Bundle de Producción:** `/dev-console` se importa dinámicamente mediante `React.lazy` y está condicionado a `import.meta.env.DEV`. Vite elimina automáticamente todo el código de DevConsole durante `npm run build` vía Tree-Shaking.
> 2. **Protección Runtime:** `DevConsole.jsx` verifica `VITE_USE_EMULATORS === 'true'`. Si no está en emulador local, la UI se bloquea completamente.
> 3. **Auto-autenticación:** La auto-autenticación como `coordinador` dentro de DevConsole es **exclusiva del entorno de emulador local**. Si en el futuro alguien intenta reactivar `/dev-console` en producción, reintroduciría una vulnerabilidad severa.
> 4. **Verificación Automatizada:** El script `scripts/verify-build.js` analiza la carpeta `dist/` tras cada compilación y **falla el build** si detecta cualquier coincidencia de `DevConsole` o `handleResetDB`.
