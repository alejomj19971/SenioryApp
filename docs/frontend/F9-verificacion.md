# F9 — Postulación del cuidador y panel de revisión

| Campo | Valor |
|---|---|
| **Módulo** | F9 |
| **Requiere en el backend** | M9 (registro y verificación de cuidadores) |
| **Estado** | Construido (2026-11-02) |

## Qué hace
- **Postulación del cuidador:** `/registro/cuidador` (cuenta de cuidador, enlazada desde el pie de la landing) → `/cuidador/perfil`: arma su perfil, sube la cédula, los antecedentes, el título y la psicotécnica (y, opcional, una hoja de vida en PDF), envía todo a revisión y ve cómo va cada uno de los tres controles. Un control rechazado muestra el **motivo**; uno rechazado o vencido se renueva subiendo un documento nuevo y pidiendo la revisión otra vez. El panel `/cuidador` lo lleva a armar su perfil si no lo tiene y le dice dónde va su postulación.
- **Panel de revisión (`/admin`, solo administradores):** la cola de verificaciones por estado (por revisar, aprobadas, rechazadas, vencidas), con los documentos para abrirlos, **aprobar** (con hasta cuándo vale) o **rechazar** (con motivo), y las **hojas de vida** que verán las familias. Sale del grupo de pantallas de cuenta: tiene su propio diseño ancho para computador.

## Decisiones
| Tema | Decisión |
|---|---|
| Subida de documentos | El navegador manda el archivo como **cuerpo** de una petición a `POST /api/cuidador/documentos/[tipo]` (sin multipart ni base64); el servidor de Next comprueba lo evidente (tipo declarado, vacío, tope de 5 MB leyendo con corte, origen de la petición) y lo reenvía como cuerpo binario al backend, que decide por el **contenido**. Un archivo que «dice ser PDF» y no lo es lo rechaza el backend y la pantalla lo muestra. La hoja de vida solo admite PDF. |
| Abrir documentos privados | El revisor los abre desde `/api/admin/documentos/[id]`: el servidor de Next pide el archivo al backend (que lo entrega solo a administradores y deja constancia de **cada apertura**), sigue la dirección firmada de 2 minutos **en el servidor** y entrega el archivo con `Cache-Control: private, no-store`, `nosniff` y una política que no ejecuta nada. El navegador nunca ve la dirección del backend ni la firmada. Es la misma pieza (`lib/services/archivos.ts`) que entrega la hoja de vida pública (F2). |
| Perfil | Crear o actualizar lo decide el **servidor** mirando si el perfil ya existe, no el formulario. Un perfil **activo** no puede cambiar su especialidad ni su título (respaldan un título aprobado): se muestran sin poderse editar y no se envían. La aceptación automática de servicios la activa solo el propio cuidador. El nombre sale de la cuenta, no del formulario. |
| Qué ve cada quién | El cuidador ve su teléfono (es suyo); a las familias nunca les llega (H1). Los documentos privados no tienen ninguna ruta para familias. |
| Vigencia | Al aprobar, el revisor dice hasta cuándo vale: antecedentes y psicotécnica la exigen (máximo 5 años); el título puede no vencer. La pantalla valida (fecha futura, hasta 5 años) y el backend la vuelve a exigir. Las fechas lejanas se muestran con año. |
| Rechazo | Pide el motivo (hasta 1000 caracteres); lo ve el cuidador en su perfil. |
| Decisiones simultáneas | Dos revisores sobre el mismo control: el primero decide y el otro recibe el aviso del backend («ya decidido»), que se muestra en la tarjeta. |
| Honestidad | Mientras falte un control, el perfil **no se muestra** ni se puede contratar (lo hace cumplir el backend y su base de datos); la pantalla del cuidador lo dice con palabras claras en vez de prometer una fecha. |

## Pruebas
Unitarias (validación del perfil y de la vigencia, acciones con rol y orden de validaciones, la ruta de subida con sus rechazos y errores del backend, el cliente HTTP con cuerpo binario, y las pantallas: subir documentos, controles, formulario, y la cola con aprobar y rechazar), de contrato (cuenta de cuidador sin perfil hasta que lo arma, documentos binarios aceptados o rechazados por contenido, tipo y tamaño, revisión con documentos faltantes, cola solo de administradores, apertura con dirección firmada, rechazo con motivo y renovación, vigencias, y visibilidad en el directorio solo con los tres controles aprobados) y recorridos (el ciclo completo con un cuidador, un revisor y una familia, y los permisos del panel).
