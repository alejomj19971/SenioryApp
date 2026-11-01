# Seniory — Revisión de seguridad del backend

Hecha al cerrar los módulos M0 a M9, **antes** del endurecimiento final. No es una auditoría externa ni una certificación: es la lista de lo que hace el código, dónde se comprueba, y lo que **falta** y bloquea el lanzamiento. Marcas: ✅ hecho y probado · 🟡 parcial · ❌ falta · 🚀 depende del hosting.

La firma de ambos desarrolladores sobre esta lista (requisito de M10) solo tiene sentido cuando no queden ❌ ni 🚀 sin resolver.

## 1. OWASP API Security Top 10 (2023)

| Riesgo | Estado | Cómo |
| --- | --- | --- |
| **API1** Autorización a nivel de objeto (IDOR) | ✅ | Toda ruta con id de otra persona verifica el vínculo y responde **404 idéntico** al de un recurso inexistente: servicios, conversaciones, pagos, alertas, documentos. Hay pruebas de "un tercero no lee ni escribe" en cada módulo. |
| **API2** Autenticación rota | ✅ | argon2id; tokens de acceso cortos (15 min) y de refresco rotativos con **detección de robo**; bloqueo progresivo; lista de contraseñas comunes; recuperación con enlace de 30 minutos y un solo uso que cierra todas las sesiones. 🟡 Falta segundo factor para administradores. |
| **API3** Autorización a nivel de propiedad | ✅ | Vistas de **lista blanca** (el cliente nunca recibe una entidad): la familia no ve lo que cobra el cuidador, el cuidador no ve lo que paga la familia, ningún teléfono sale del directorio. El `ValidationPipe` rechaza campos no declarados (no se puede enviar `rol`, `estado`, `visible`, `nombre`, montos…). |
| **API4** Consumo de recursos sin límite | 🟡 | Límite global por IP (100/min) y límites propios por ruta (registro, login, compras, mensajes, eventos en vivo, archivos); cuerpo JSON de 100 KB; archivos de 5 MB leídos **después** de autenticar; tope de 5 conexiones en vivo por persona; paginación acotada. Falta ajustar los límites con una prueba de carga 🚀. |
| **API5** Autorización a nivel de función | ✅ | Guardia global que **deniega por defecto** (`@Publico()` explícito) y guardia de roles; el panel de revisores exige `administrador`; un administrador solo se crea por línea de comandos. |
| **API6** Acceso sin restricción a flujos de negocio sensibles | ✅ | Idempotencia en solicitar servicio, comprar bolsa y alertas; sin doble reserva (índice único parcial); un pago solo se aprueba por el aviso firmado de la pasarela, una vez y con el monto verificado; un servicio no inicia sin pago aprobado. |
| **API7** Falsificación de peticiones del lado del servidor (SSRF) | ✅ | La API no hace peticiones a direcciones que dé el usuario. |
| **API8** Configuración de seguridad incorrecta | ✅ | **Arranque seguro**: en producción la aplicación no inicia con adaptadores simulados, secretos cortos o repetidos, `localhost`/`http` en orígenes, intervalos apagados o logs de depuración (CI lo verifica contra la imagen). `helmet`, CORS con orígenes exactos, cookies `HttpOnly`/`Secure`/`SameSite`, verificación de `Origin` contra CSRF, Swagger solo fuera de producción. |
| **API9** Gestión inadecuada del inventario | 🟡 | Rutas solo bajo `/api/v1`. Falta publicar los contratos OpenAPI/AsyncAPI versionados (PENDIENTES). |
| **API10** Consumo inseguro de APIs | 🟡 | La pasarela real se integra detrás de un puerto; el aviso **se verifica con firma sobre el cuerpo crudo** antes de hacer nada. El adaptador real debe quitar datos de tarjeta antes de guardar el aviso. Pendiente de la elección del proveedor 🚀. |

## 2. OWASP ASVS nivel 2 (capítulos)

| Capítulo | Estado | Notas |
| --- | --- | --- |
| V1 Arquitectura | ✅ | Monolito modular con reglas que **rompen la CI** (dominio puro, frontera por módulo, esquemas privados, sin ciclos). |
| V2 Autenticación | 🟡 | Ver API2. Falta MFA para administradores y verificación del correo (llega con el canal de correo 🚀). |
| V3 Sesión | ✅ | Refresco rotativo con detección de reutilización, cierre de todas las sesiones al cambiar la contraseña, cookies con atributos de seguridad, conexiones en vivo con vida máxima de 10 min. |
| V4 Control de acceso | ✅ | Deniega por defecto, roles, vínculo por objeto, política de acceso a datos de salud consultada **en cada acceso** (revocar el consentimiento o terminar el servicio corta el acceso al instante), auditoría de denegaciones. |
| V5 Validación y codificación | ✅ | DTO con lista blanca; reglas de dominio; consultas parametrizadas (Drizzle); texto plano para mensajes y comentarios; archivos validados por **contenido**, con clave generada por el servidor. 🟡 Metadatos de imágenes sin quitar; sin antivirus. |
| V6 Criptografía | ✅ | argon2id; HMAC-SHA256 con comparación en tiempo constante (avisos de la pasarela, archivos firmados, clave de operación); tokens opacos con resumen en base. 🟡 Cifrado de columnas clínicas pendiente (decisión abierta). |
| V7 Errores y logs | ✅ | Errores `problem+json` con id de correlación; sin datos clínicos, de tarjeta ni textos de mensajes en logs ni eventos; auditoría de solo inserción. |
| V8 Protección de datos | 🟡 | Minimización: los eventos llevan ids, no datos. Falta exportar y suprimir los datos de una persona (derecho de acceso y supresión) y los plazos de retención ❌. |
| V9 Comunicaciones | 🚀 | TLS lo termina el hosting; `COOKIES_SEGURAS` y orígenes `https` son obligatorios en producción. |
| V10 Código malicioso | ✅ | Acciones de la CI fijadas por SHA; `npm ci` desde el lock; `npm audit` bloquea altas y críticas; imagen sin compilador. |
| V11 Lógica de negocio | ✅ | Máquina de estados del servicio comprobada contra su tabla; el dinero en pesos enteros con propiedades (ningún peso se crea ni se pierde); libro de la bolsa de solo inserción. |
| V12 Archivos | 🟡 | Ver V5; almacén real 🚀. |
| V13 API | ✅ | Ver arriba. |
| V14 Configuración | ✅ | Ver API8; secretos solo por entorno; rol de base de datos de la aplicación **sin permiso de estructura**. |

## 3. Lo que bloquea el lanzamiento (resumen)

1. ❌ **Exportar y suprimir los datos** de una persona, y plazos de retención: pide decisión legal sobre qué se conserva (registros financieros, de salud, auditoría).
2. ❌ **Segundo factor** para administradores.
3. 🚀 Entorno de producción, TLS, monitor externo, respaldos del proveedor y **ensayo de restauración en producción**.
4. 🚀 Prueba de carga ligera (búsqueda de cuidadores, alertas) y revisión de índices con volumen real.
5. 🚀 Pasarela y dispersor reales con su adaptador revisado; almacén real de archivos.
6. ⚖️ Política de tratamiento de datos, aviso de alcance de la teleasistencia, términos y condiciones, procedimiento ante incidentes con la SIC (ver sección 12 del [plan](./PLAN_BACKEND_SENIORY.md)).
7. 🟡 Un rol de base de datos **por módulo** (hoy hay uno de mínimos permisos para toda la aplicación; ver [OPERACION](./OPERACION.md#3-base-de-datos-dos-cuentas)).
