// Los decoradores de class-validator y class-transformer leen metadatos: se carga aquí de forma
// explícita para que este archivo funcione también fuera de Nest (por ejemplo, en pruebas unitarias).
import 'reflect-metadata';
import { plainToInstance, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  validateSync,
  type ValidationError,
} from 'class-validator';

export const ENTORNOS = [
  'development',
  'test',
  'staging',
  'production',
] as const;
export type Entorno = (typeof ENTORNOS)[number];

export const NIVELES_DE_LOG = [
  'error',
  'warn',
  'info',
  'debug',
  'trace',
] as const;
export type NivelDeLog = (typeof NIVELES_DE_LOG)[number];

export const ALMACENES_DE_ARCHIVOS = [
  'local',
  'cloudinary',
  'deshabilitado',
] as const;
export type AlmacenDeArchivosConfigurado =
  (typeof ALMACENES_DE_ARCHIVOS)[number];

export const CANALES_DE_RECUPERACION = [
  'consola',
  'resend',
  'deshabilitado',
] as const;
export type CanalDeRecuperacion = (typeof CANALES_DE_RECUPERACION)[number];

// Por dónde sale el correo de los avisos (M5) fuera de la campana. A diferencia de la recuperación, no hay
// «consola»: para probar sin enviar de verdad ya está CANALES_DE_NOTIFICACION_SIMULADOS.
export const CANALES_DE_CORREO_PARA_AVISOS = ['deshabilitado', 'resend'] as const;
export type CanalDeCorreoParaAvisos =
  (typeof CANALES_DE_CORREO_PARA_AVISOS)[number];

// Con qué se cobra y con qué se le paga al cuidador. «simulada» y «simulado» son solo para desarrollo y pruebas
// (en producción no se admiten: un cobro que no existe no puede darse por hecho). «mercadopago» es la pasarela
// real (Checkout Pro / API de Orders), admitida en producción con sus credenciales reales (en staging se usan
// las de prueba de MercadoPago; Wompi quedó descartado por ahora: pide RUT y actividad comercial que todavía no
// hay). «deshabilitada» responde «no disponible» hasta que se elija proveedor.
export const PASARELAS_DE_PAGOS = [
  'simulada',
  'mercadopago',
  'deshabilitada',
] as const;
export type PasarelaConfigurada = (typeof PASARELAS_DE_PAGOS)[number];

// «manual»: un administrador transfiere de verdad por fuera del sistema (Nequi, Daviplata, banco) y lo
// confirma en Seniory (`PATCH /liquidaciones/:id/confirmar-pago`). Admitido en producción: sí mueve dinero
// real, solo que a mano.
export const DISPERSORES_DE_PAGOS = [
  'simulado',
  'manual',
  'deshabilitado',
] as const;
export type DispersorConfigurado = (typeof DISPERSORES_DE_PAGOS)[number];

const LARGO_MINIMO_SECRETO_BFF = 32;
// 256 bits: el mínimo para firmar con HS256.
const LARGO_MINIMO_SECRETO_JWT = 32;

export class VariablesDeEntorno {
  @IsIn(ENTORNOS, {
    message: `NODE_ENV debe ser uno de: ${ENTORNOS.join(', ')}`,
  })
  NODE_ENV!: Entorno;

  @Type(() => Number)
  @IsInt({ message: 'PUERTO debe ser un número entero' })
  @Min(1, { message: 'PUERTO debe estar entre 1 y 65535' })
  @Max(65535, { message: 'PUERTO debe estar entre 1 y 65535' })
  PUERTO: number = 3001;

  @Matches(/^postgres(ql)?:\/\/\S+$/, {
    message:
      'URL_BASE_DE_DATOS es obligatoria y debe empezar por postgres:// o postgresql://',
  })
  URL_BASE_DE_DATOS!: string;

  @IsString({
    message:
      'ORIGENES_PERMITIDOS es obligatoria (lista de orígenes separados por comas)',
  })
  ORIGENES_PERMITIDOS!: string;

  @IsIn(NIVELES_DE_LOG, {
    message: `NIVEL_DE_LOG debe ser uno de: ${NIVELES_DE_LOG.join(', ')}`,
  })
  NIVEL_DE_LOG: NivelDeLog = 'info';

  @IsString()
  ZONA_HORARIA_NEGOCIO: string = 'America/Bogota';

  // Cada cuánto busca el despachador eventos pendientes en el outbox. 0 lo apaga (solo en pruebas:
  // en producción un evento que no se entregó al instante quedaría sin entregar).
  @Type(() => Number)
  @IsInt({ message: 'INTERVALO_SONDEO_OUTBOX_MS debe ser un número entero' })
  @Min(0, {
    message: 'INTERVALO_SONDEO_OUTBOX_MS debe estar entre 0 y 60000',
  })
  @Max(60_000, {
    message: 'INTERVALO_SONDEO_OUTBOX_MS debe estar entre 0 y 60000',
  })
  INTERVALO_SONDEO_OUTBOX_MS: number = 1_000;

  // Cada cuánto se cancelan las solicitudes de servicio a las que el cuidador no respondió a tiempo. El plazo
  // más corto es de 30 minutos, por eso la revisión es frecuente. 0 la apaga (solo en pruebas).
  @Type(() => Number)
  @IsInt({
    message: 'INTERVALO_EXPIRACION_SERVICIOS_MS debe ser un número entero',
  })
  @Min(0, {
    message: 'INTERVALO_EXPIRACION_SERVICIOS_MS debe estar entre 0 y 3600000',
  })
  @Max(3_600_000, {
    message: 'INTERVALO_EXPIRACION_SERVICIOS_MS debe estar entre 0 y 3600000',
  })
  INTERVALO_EXPIRACION_SERVICIOS_MS: number = 60_000;

  // Cada cuánto se cancela (motivo «no_show») un servicio que quedó «aceptado» sin que nadie marcara que
  // inició, una vez que su franja ya terminó. Sin esto, un cuidador que no llega deja el servicio huérfano
  // para siempre. 0 lo apaga (solo en pruebas).
  @Type(() => Number)
  @IsInt({
    message: 'INTERVALO_DETECCION_NO_SHOW_MS debe ser un número entero',
  })
  @Min(0, {
    message: 'INTERVALO_DETECCION_NO_SHOW_MS debe estar entre 0 y 3600000',
  })
  @Max(3_600_000, {
    message: 'INTERVALO_DETECCION_NO_SHOW_MS debe estar entre 0 y 3600000',
  })
  INTERVALO_DETECCION_NO_SHOW_MS: number = 300_000;

  // Cada cuánto se oculta a un cuidador al que se le venció un control (antecedentes, título o psicotécnica).
  // Antes esto dependía de programar `npm run cuidadores:revisar-vigencias` como cron del hosting; ahora corre
  // solo. 0 lo apaga (solo en pruebas).
  @Type(() => Number)
  @IsInt({
    message: 'INTERVALO_REVISION_DE_VIGENCIAS_MS debe ser un número entero',
  })
  @Min(0, {
    message: 'INTERVALO_REVISION_DE_VIGENCIAS_MS debe estar entre 0 y 3600000',
  })
  @Max(3_600_000, {
    message: 'INTERVALO_REVISION_DE_VIGENCIAS_MS debe estar entre 0 y 3600000',
  })
  INTERVALO_REVISION_DE_VIGENCIAS_MS: number = 3_600_000;

  // Cada cuánto se envían los avisos pendientes. Corto, porque una alerta no puede esperar. 0 lo apaga (solo en
  // pruebas).
  @Type(() => Number)
  @IsInt({
    message: 'INTERVALO_ENTREGA_NOTIFICACIONES_MS debe ser un número entero',
  })
  @Min(0, {
    message: 'INTERVALO_ENTREGA_NOTIFICACIONES_MS debe estar entre 0 y 60000',
  })
  @Max(60_000, {
    message: 'INTERVALO_ENTREGA_NOTIFICACIONES_MS debe estar entre 0 y 60000',
  })
  INTERVALO_ENTREGA_NOTIFICACIONES_MS: number = 2_000;

  // Cuánto se espera después de la hora de una toma antes de darla por omitida (decisión abierta: lo fija el
  // equipo con un profesional de salud). Debe ser mayor que cero.
  @Type(() => Number)
  @IsInt({ message: 'TOLERANCIA_DE_TOMA_MINUTOS debe ser un número entero' })
  @Min(1, { message: 'TOLERANCIA_DE_TOMA_MINUTOS debe estar entre 1 y 720' })
  @Max(720, { message: 'TOLERANCIA_DE_TOMA_MINUTOS debe estar entre 1 y 720' })
  TOLERANCIA_DE_TOMA_MINUTOS: number = 60;

  // Cada cuánto se revisan las tomas vencidas. 0 lo apaga (solo en pruebas).
  @Type(() => Number)
  @IsInt({ message: 'INTERVALO_OMISION_TOMAS_MS debe ser un número entero' })
  @Min(0, {
    message: 'INTERVALO_OMISION_TOMAS_MS debe estar entre 0 y 3600000',
  })
  @Max(3_600_000, {
    message: 'INTERVALO_OMISION_TOMAS_MS debe estar entre 0 y 3600000',
  })
  INTERVALO_OMISION_TOMAS_MS: number = 60_000;

  // Finge los canales de correo, SMS, WhatsApp y push (solo escribe en el log) mientras no haya proveedores.
  // SOLO desarrollo y pruebas: en producción un aviso que no sale no puede darse por enviado.
  @IsIn(['true', 'false'], {
    message: 'CANALES_DE_NOTIFICACION_SIMULADOS debe ser true o false',
  })
  CANALES_DE_NOTIFICACION_SIMULADOS: string = 'false';

  // Con qué pasarela se cobra. «simulada» (solo desarrollo, pruebas y staging) acepta pagos de mentira firmados con
  // SECRETO_DE_PASARELA; «deshabilitada» responde «no disponible» hasta que se elija proveedor.
  @IsIn(PASARELAS_DE_PAGOS, {
    message: `PASARELA_DE_PAGOS debe ser una de: ${PASARELAS_DE_PAGOS.join(', ')}`,
  })
  PASARELA_DE_PAGOS: PasarelaConfigurada = 'deshabilitada';

  // Con la pasarela simulada, cada cobro se aprueba SOLO a los pocos segundos de pedirse el enlace de pago: la familia pulsa
  // «Pagar ahora» y queda pagado, sin pasar por ningún proveedor. Es para que personas de prueba recorran el ciclo completo
  // (contratar, pagar, prestar el servicio) sin dinero ni tarjetas. El aviso entra por el MISMO camino firmado que usaría una
  // pasarela real, no por un atajo. Solo con PASARELA_DE_PAGOS=simulada y NUNCA en producción.
  @IsIn(['true', 'false'], {
    message: 'PASARELA_SIMULADA_APRUEBA_SOLA debe ser true o false',
  })
  PASARELA_SIMULADA_APRUEBA_SOLA: string = 'false';

  // Firma los avisos de la pasarela simulada (32 caracteres o más; obligatorio con la pasarela simulada).
  @IsOptional()
  @IsString()
  SECRETO_DE_PASARELA?: string;

  // Credenciales de MercadoPago (obligatorias con PASARELA_DE_PAGOS=mercadopago). El access token se consigue
  // en el panel de desarrolladores de la aplicación (pestaña Credenciales); el secreto de firma, en
  // «Configuración de webhooks» de esa misma aplicación.
  @IsOptional()
  @IsString()
  MERCADOPAGO_ACCESS_TOKEN?: string;

  @IsOptional()
  @IsString()
  MERCADOPAGO_SECRETO_DE_FIRMA?: string;

  // Con qué se le paga al cuidador. «deshabilitado» deja las liquidaciones pendientes hasta que haya dispersor.
  @IsIn(DISPERSORES_DE_PAGOS, {
    message: `DISPERSOR_DE_PAGOS debe ser uno de: ${DISPERSORES_DE_PAGOS.join(', ')}`,
  })
  DISPERSOR_DE_PAGOS: DispersorConfigurado = 'deshabilitado';

  // Si es true, un servicio solo puede iniciar con el pago aprobado. Obligatorio en staging y producción; en
  // desarrollo puede apagarse para probar sin pagar.
  @IsIn(['true', 'false'], {
    message: 'REQUIERE_PAGO_APROBADO debe ser true o false',
  })
  REQUIERE_PAGO_APROBADO: string = 'false';

  // Cuánto tiempo tiene la familia para pagar un servicio (o una bolsa) antes de que el pago expire.
  @Type(() => Number)
  @IsInt({ message: 'MINUTOS_PARA_PAGAR debe ser un número entero' })
  @Min(1, { message: 'MINUTOS_PARA_PAGAR debe estar entre 1 y 1440' })
  @Max(1440, { message: 'MINUTOS_PARA_PAGAR debe estar entre 1 y 1440' })
  MINUTOS_PARA_PAGAR: number = 120;

  // Cada cuánto se vencen los pagos sin pagar. 0 lo apaga (solo en pruebas).
  @Type(() => Number)
  @IsInt({ message: 'INTERVALO_EXPIRACION_PAGOS_MS debe ser un número entero' })
  @Min(0, {
    message: 'INTERVALO_EXPIRACION_PAGOS_MS debe estar entre 0 y 3600000',
  })
  @Max(3_600_000, {
    message: 'INTERVALO_EXPIRACION_PAGOS_MS debe estar entre 0 y 3600000',
  })
  INTERVALO_EXPIRACION_PAGOS_MS: number = 60_000;

  // Cada cuánto se envían al cuidador las liquidaciones pendientes. 0 lo apaga (solo en pruebas).
  @Type(() => Number)
  @IsInt({ message: 'INTERVALO_LIQUIDACION_MS debe ser un número entero' })
  @Min(0, { message: 'INTERVALO_LIQUIDACION_MS debe estar entre 0 y 3600000' })
  @Max(3_600_000, {
    message: 'INTERVALO_LIQUIDACION_MS debe estar entre 0 y 3600000',
  })
  INTERVALO_LIQUIDACION_MS: number = 60_000;

  // Con qué se firman los tokens de acceso. Obligatorio en todos los entornos: un valor por defecto
  // en el código sería una llave pública.
  @IsString({ message: 'SECRETO_JWT_ACCESO es obligatorio' })
  SECRETO_JWT_ACCESO!: string;

  // Con qué se cifra el secreto TOTP del segundo factor de los administradores. Obligatorio en todos los
  // entornos, por la misma razón que SECRETO_JWT_ACCESO: sin él, un secreto TOTP en la base de datos
  // robada protegería a cualquiera que lea la fila.
  @IsString({ message: 'SECRETO_DE_CIFRADO es obligatorio' })
  SECRETO_DE_CIFRADO!: string;

  // Identifica la clave de firma (`kid`) para poder rotarla sin cerrar las sesiones abiertas.
  @Matches(/^[A-Za-z0-9._-]{1,32}$/, {
    message:
      'ID_CLAVE_JWT debe tener entre 1 y 32 letras, números, puntos, guiones o guiones bajos',
  })
  ID_CLAVE_JWT: string = 'k1';

  @Type(() => Number)
  @IsInt({ message: 'DURACION_ACCESO_MIN debe ser un número entero' })
  @Min(1, { message: 'DURACION_ACCESO_MIN debe estar entre 1 y 60' })
  @Max(60, { message: 'DURACION_ACCESO_MIN debe estar entre 1 y 60' })
  DURACION_ACCESO_MIN: number = 15;

  @Type(() => Number)
  @IsInt({ message: 'DURACION_REFRESCO_DIAS debe ser un número entero' })
  @Min(1, { message: 'DURACION_REFRESCO_DIAS debe estar entre 1 y 90' })
  @Max(90, { message: 'DURACION_REFRESCO_DIAS debe estar entre 1 y 90' })
  DURACION_REFRESCO_DIAS: number = 30;

  // Las cookies de sesión llevan `Secure` salvo en local (http://localhost no tiene https).
  @IsIn(['true', 'false'], {
    message: 'COOKIES_SEGURAS debe ser true o false',
  })
  COOKIES_SEGURAS: string = 'true';

  // Versión de la política de tratamiento de datos que se pide aceptar al registrarse.
  @Matches(/^[A-Za-z0-9][A-Za-z0-9._-]{0,19}$/, {
    message: 'VERSION_POLITICA_VIGENTE no es una versión válida (ej. v1)',
  })
  VERSION_POLITICA_VIGENTE: string = 'v1';

  // Por dónde llega el enlace para recuperar la contraseña. «consola» lo escribe en el log del servidor
  // (solo desarrollo y pruebas: en producción no se admite). «resend» es el canal real, admitido en
  // producción. «deshabilitado» deja la recuperación respondiendo «no disponible» hasta que se elija uno.
  @IsIn(CANALES_DE_RECUPERACION, {
    message: `CANAL_DE_RECUPERACION debe ser uno de: ${CANALES_DE_RECUPERACION.join(', ')}`,
  })
  CANAL_DE_RECUPERACION: CanalDeRecuperacion = 'deshabilitado';

  // Credenciales de Resend (obligatorias con CANAL_DE_RECUPERACION=resend). RESEND_CORREO_DESDE debe usar un
  // dominio verificado en Resend; mientras no haya uno, «Seniory <onboarding@resend.dev>» solo entrega al
  // correo de la propia cuenta de Resend (restricción de su sandbox, no nuestra).
  @IsOptional()
  @IsString()
  RESEND_API_KEY?: string;

  @IsOptional()
  @IsString()
  RESEND_CORREO_DESDE?: string;

  // El correo de los avisos del ciclo de vida (servicio confirmado, cancelado, etc.), fuera de la campana.
  // «resend» reutiliza las mismas credenciales RESEND_API_KEY/RESEND_CORREO_DESDE que la recuperación.
  @IsIn(CANALES_DE_CORREO_PARA_AVISOS, {
    message: `CANAL_DE_CORREO_PARA_AVISOS debe ser uno de: ${CANALES_DE_CORREO_PARA_AVISOS.join(', ')}`,
  })
  CANAL_DE_CORREO_PARA_AVISOS: CanalDeCorreoParaAvisos = 'deshabilitado';

  // Dónde se guardan los archivos de los cuidadores (hoja de vida). «local» usa una carpeta del servidor
  // (solo desarrollo, pruebas y staging: en producción no se admite). «cloudinary» es el almacén real
  // (admitido en producción). «deshabilitado» responde «no disponible» hasta que se elija uno.
  @IsIn(ALMACENES_DE_ARCHIVOS, {
    message: `ALMACEN_DE_ARCHIVOS debe ser uno de: ${ALMACENES_DE_ARCHIVOS.join(', ')}`,
  })
  ALMACEN_DE_ARCHIVOS: AlmacenDeArchivosConfigurado = 'deshabilitado';

  @IsString()
  DIRECTORIO_DE_ARCHIVOS: string = './archivos-locales';

  // Credenciales de Cloudinary (obligatorias con ALMACEN_DE_ARCHIVOS=cloudinary). Se consiguen en el panel de
  // Cloudinary (Dashboard → Product Environment Credentials).
  @IsOptional()
  @IsString()
  CLOUDINARY_CLOUD_NAME?: string;

  @IsOptional()
  @IsString()
  CLOUDINARY_API_KEY?: string;

  @IsOptional()
  @IsString()
  CLOUDINARY_API_SECRET?: string;

  // Clave con la que el monitor del equipo consulta GET /salud/operacion (retraso del outbox y fallos). Si no se define, esa
  // ruta no existe. 32 caracteres o más.
  @IsOptional()
  @IsString()
  SECRETO_DE_OPERACION?: string;

  // Con él se firman las direcciones temporales de los archivos (obligatorio con el almacén local).
  @IsOptional()
  @IsString()
  SECRETO_DE_ARCHIVOS?: string;

  // Dirección de la API a la que apuntan esas direcciones temporales; por defecto, el servidor local.
  @IsOptional()
  @IsString()
  URL_PUBLICA_DE_LA_API?: string;

  // Versión del texto del consentimiento para tratar datos de salud que se pide aceptar.
  @Matches(/^[A-Za-z0-9][A-Za-z0-9._-]{0,19}$/, {
    message:
      'VERSION_CONSENTIMIENTO_SALUD_VIGENTE no es una versión válida (ej. v1)',
  })
  VERSION_CONSENTIMIENTO_SALUD_VIGENTE: string = 'v1';

  @IsOptional()
  @IsString()
  SENTRY_DSN?: string;

  @IsOptional()
  @IsString()
  SECRETO_BFF?: string;
}

export interface Configuracion {
  entorno: Entorno;
  esProduccion: boolean;
  puerto: number;
  urlBaseDeDatos: string;
  origenesPermitidos: string[];
  nivelDeLog: NivelDeLog;
  zonaHorariaNegocio: string;
  intervaloSondeoOutboxMs: number;
  intervaloExpiracionServiciosMs: number;
  intervaloDeteccionNoShowMs: number;
  intervaloRevisionDeVigenciasMs: number;
  intervaloEntregaNotificacionesMs: number;
  toleranciaDeTomaMinutos: number;
  intervaloOmisionTomasMs: number;
  canalesDeNotificacionSimulados: boolean;
  pasarelaDePagos: PasarelaConfigurada;
  // Los cobros de la pasarela simulada se aprueban solos (ver PASARELA_SIMULADA_APRUEBA_SOLA). Solo fuera de producción.
  pasarelaSimuladaApruebaSola: boolean;
  secretoDePasarela: string | null;
  mercadopagoAccessToken: string | null;
  mercadopagoSecretoDeFirma: string | null;
  dispersorDePagos: DispersorConfigurado;
  requierePagoAprobado: boolean;
  minutosParaPagar: number;
  intervaloExpiracionPagosMs: number;
  intervaloLiquidacionMs: number;
  sentryDsn: string | null;
  secretoBff: string | null;
  secretoJwtAcceso: string;
  secretoDeCifrado: string;
  idClaveJwt: string;
  duracionAccesoMin: number;
  duracionRefrescoDias: number;
  cookiesSeguras: boolean;
  versionPoliticaVigente: string;
  versionConsentimientoSaludVigente: string;
  canalDeRecuperacion: CanalDeRecuperacion;
  resendApiKey: string | null;
  resendCorreoDesde: string | null;
  canalDeCorreoParaAvisos: CanalDeCorreoParaAvisos;
  almacenDeArchivos: AlmacenDeArchivosConfigurado;
  directorioDeArchivos: string;
  secretoDeArchivos: string | null;
  cloudinaryCloudName: string | null;
  cloudinaryApiKey: string | null;
  cloudinaryApiSecret: string | null;
  secretoDeOperacion: string | null;
  urlPublicaDeLaApi: string;
}

export class ErrorDeConfiguracion extends Error {
  constructor(readonly problemas: string[]) {
    super(
      `Configuración inválida. La aplicación no puede iniciar:\n${problemas.map((p) => `  - ${p}`).join('\n')}`,
    );
    this.name = 'ErrorDeConfiguracion';
  }
}

function mensajesDe(errores: ValidationError[]): string[] {
  return errores.flatMap((error) => Object.values(error.constraints ?? {}));
}

function listaDeOrigenes(valor: string): string[] {
  return valor
    .split(',')
    .map((origen) => origen.trim())
    .filter((origen) => origen !== '');
}

function esZonaHorariaValida(zona: string): boolean {
  try {
    new Intl.DateTimeFormat('es-CO', { timeZone: zona });
    return true;
  } catch {
    return false;
  }
}

function esOrigenValido(origen: string): boolean {
  try {
    const url = new URL(origen);
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      url.origin === origen
    );
  } catch {
    return false;
  }
}

// Reglas que van más allá de la forma de cada variable: coherencia entre ellas y arranque seguro.
function reglasAdicionales(variables: VariablesDeEntorno): string[] {
  const problemas: string[] = [];
  const origenes = listaDeOrigenes(variables.ORIGENES_PERMITIDOS ?? '');

  if (variables.ORIGENES_PERMITIDOS !== undefined) {
    if (origenes.length === 0) {
      problemas.push('ORIGENES_PERMITIDOS no puede estar vacía');
    }
    for (const origen of origenes) {
      if (origen.includes('*')) {
        problemas.push(`ORIGENES_PERMITIDOS no admite comodines (${origen})`);
      } else if (!esOrigenValido(origen)) {
        problemas.push(
          `ORIGENES_PERMITIDOS contiene un origen inválido: "${origen}" (use el formato https://dominio.com, sin ruta ni barra final)`,
        );
      }
    }
  }

  if (!esZonaHorariaValida(variables.ZONA_HORARIA_NEGOCIO)) {
    problemas.push(
      `ZONA_HORARIA_NEGOCIO no es una zona horaria válida: "${variables.ZONA_HORARIA_NEGOCIO}"`,
    );
  }

  if (variables.SECRETO_JWT_ACCESO !== undefined) {
    if (variables.SECRETO_JWT_ACCESO.length < LARGO_MINIMO_SECRETO_JWT) {
      problemas.push(
        `SECRETO_JWT_ACCESO debe tener al menos ${LARGO_MINIMO_SECRETO_JWT} caracteres`,
      );
    } else if (variables.SECRETO_JWT_ACCESO === variables.SECRETO_BFF) {
      problemas.push('SECRETO_JWT_ACCESO y SECRETO_BFF deben ser distintos');
    }
  }
  if (variables.SECRETO_DE_CIFRADO !== undefined) {
    if (variables.SECRETO_DE_CIFRADO.length < LARGO_MINIMO_SECRETO_JWT) {
      problemas.push(
        `SECRETO_DE_CIFRADO debe tener al menos ${LARGO_MINIMO_SECRETO_JWT} caracteres`,
      );
    } else if (
      variables.SECRETO_DE_CIFRADO === variables.SECRETO_JWT_ACCESO ||
      variables.SECRETO_DE_CIFRADO === variables.SECRETO_BFF
    ) {
      problemas.push(
        'SECRETO_DE_CIFRADO debe ser distinto de SECRETO_JWT_ACCESO y de SECRETO_BFF',
      );
    }
  }

  if (variables.ALMACEN_DE_ARCHIVOS === 'local') {
    if (variables.SECRETO_DE_ARCHIVOS === undefined) {
      problemas.push('SECRETO_DE_ARCHIVOS es obligatorio con el almacén local');
    } else if (
      variables.SECRETO_DE_ARCHIVOS.length < LARGO_MINIMO_SECRETO_JWT
    ) {
      problemas.push(
        `SECRETO_DE_ARCHIVOS debe tener al menos ${LARGO_MINIMO_SECRETO_JWT} caracteres`,
      );
    }
  }
  if (variables.ALMACEN_DE_ARCHIVOS === 'cloudinary') {
    if (variables.CLOUDINARY_CLOUD_NAME === undefined) {
      problemas.push(
        'CLOUDINARY_CLOUD_NAME es obligatorio con el almacén cloudinary',
      );
    }
    if (variables.CLOUDINARY_API_KEY === undefined) {
      problemas.push(
        'CLOUDINARY_API_KEY es obligatorio con el almacén cloudinary',
      );
    }
    if (variables.CLOUDINARY_API_SECRET === undefined) {
      problemas.push(
        'CLOUDINARY_API_SECRET es obligatorio con el almacén cloudinary',
      );
    }
  }
  if (
    variables.PASARELA_SIMULADA_APRUEBA_SOLA === 'true' &&
    variables.PASARELA_DE_PAGOS !== 'simulada'
  ) {
    problemas.push(
      'PASARELA_SIMULADA_APRUEBA_SOLA solo se admite con PASARELA_DE_PAGOS=simulada',
    );
  }
  if (variables.PASARELA_DE_PAGOS === 'simulada') {
    if (variables.SECRETO_DE_PASARELA === undefined) {
      problemas.push(
        'SECRETO_DE_PASARELA es obligatorio con la pasarela simulada',
      );
    } else if (
      variables.SECRETO_DE_PASARELA.length < LARGO_MINIMO_SECRETO_JWT
    ) {
      problemas.push(
        `SECRETO_DE_PASARELA debe tener al menos ${LARGO_MINIMO_SECRETO_JWT} caracteres`,
      );
    }
  }
  if (variables.CANAL_DE_RECUPERACION === 'resend') {
    if (variables.RESEND_API_KEY === undefined) {
      problemas.push(
        'RESEND_API_KEY es obligatorio con el canal de recuperación resend',
      );
    }
    if (variables.RESEND_CORREO_DESDE === undefined) {
      problemas.push(
        'RESEND_CORREO_DESDE es obligatorio con el canal de recuperación resend',
      );
    }
  }
  if (variables.CANAL_DE_CORREO_PARA_AVISOS === 'resend') {
    if (variables.RESEND_API_KEY === undefined) {
      problemas.push(
        'RESEND_API_KEY es obligatorio con el canal de correo de avisos resend',
      );
    }
    if (variables.RESEND_CORREO_DESDE === undefined) {
      problemas.push(
        'RESEND_CORREO_DESDE es obligatorio con el canal de correo de avisos resend',
      );
    }
  }
  if (variables.PASARELA_DE_PAGOS === 'mercadopago') {
    if (variables.MERCADOPAGO_ACCESS_TOKEN === undefined) {
      problemas.push(
        'MERCADOPAGO_ACCESS_TOKEN es obligatorio con la pasarela mercadopago',
      );
    }
    if (variables.MERCADOPAGO_SECRETO_DE_FIRMA === undefined) {
      problemas.push(
        'MERCADOPAGO_SECRETO_DE_FIRMA es obligatorio con la pasarela mercadopago',
      );
    }
  }
  if (
    variables.SECRETO_DE_OPERACION !== undefined &&
    variables.SECRETO_DE_OPERACION.length < LARGO_MINIMO_SECRETO_JWT
  ) {
    problemas.push(
      `SECRETO_DE_OPERACION debe tener al menos ${LARGO_MINIMO_SECRETO_JWT} caracteres`,
    );
  }
  if (variables.URL_PUBLICA_DE_LA_API !== undefined) {
    try {
      new URL(variables.URL_PUBLICA_DE_LA_API);
    } catch {
      problemas.push('URL_PUBLICA_DE_LA_API no es una dirección válida');
    }
  }

  const exigeSecreto =
    variables.NODE_ENV === 'staging' || variables.NODE_ENV === 'production';
  if (exigeSecreto) {
    if (variables.SECRETO_BFF === undefined) {
      problemas.push(`SECRETO_BFF es obligatorio en ${variables.NODE_ENV}`);
    } else if (variables.SECRETO_BFF.length < LARGO_MINIMO_SECRETO_BFF) {
      problemas.push(
        `SECRETO_BFF debe tener al menos ${LARGO_MINIMO_SECRETO_BFF} caracteres`,
      );
    }
  }

  if (exigeSecreto && variables.COOKIES_SEGURAS !== 'true') {
    problemas.push(`COOKIES_SEGURAS debe ser true en ${variables.NODE_ENV}`);
  }
  if (exigeSecreto && variables.REQUIERE_PAGO_APROBADO !== 'true') {
    problemas.push(
      `REQUIERE_PAGO_APROBADO debe ser true en ${variables.NODE_ENV} (un servicio no puede iniciar sin pago)`,
    );
  }

  if (variables.NODE_ENV === 'production') {
    for (const origen of origenes) {
      if (/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origen)) {
        problemas.push(
          `En producción, ORIGENES_PERMITIDOS no puede incluir localhost (${origen})`,
        );
      } else if (origen.startsWith('http://')) {
        problemas.push(
          `En producción, ORIGENES_PERMITIDOS solo admite https (${origen})`,
        );
      }
    }
    if (
      variables.NIVEL_DE_LOG === 'debug' ||
      variables.NIVEL_DE_LOG === 'trace'
    ) {
      problemas.push(
        'En producción, NIVEL_DE_LOG no puede ser debug ni trace (podrían registrarse datos personales)',
      );
    }
    if (variables.ALMACEN_DE_ARCHIVOS === 'local') {
      problemas.push(
        'En producción, ALMACEN_DE_ARCHIVOS no puede ser local (el disco del servidor pierde los archivos al desplegar)',
      );
    }
    if (variables.CANAL_DE_RECUPERACION === 'consola') {
      problemas.push(
        'En producción, CANAL_DE_RECUPERACION no puede ser consola (el enlace de recuperación quedaría escrito en el log)',
      );
    }
    if (variables.INTERVALO_OMISION_TOMAS_MS === 0) {
      problemas.push(
        'En producción, INTERVALO_OMISION_TOMAS_MS no puede ser 0 (las tomas vencidas nunca se marcarían como omitidas)',
      );
    }
    if (variables.INTERVALO_ENTREGA_NOTIFICACIONES_MS === 0) {
      problemas.push(
        'En producción, INTERVALO_ENTREGA_NOTIFICACIONES_MS no puede ser 0 (los avisos nunca se enviarían)',
      );
    }
    if (variables.CANALES_DE_NOTIFICACION_SIMULADOS === 'true') {
      problemas.push(
        'En producción, CANALES_DE_NOTIFICACION_SIMULADOS no puede ser true (un aviso que no sale se daría por enviado)',
      );
    }
    if (variables.INTERVALO_EXPIRACION_SERVICIOS_MS === 0) {
      problemas.push(
        'En producción, INTERVALO_EXPIRACION_SERVICIOS_MS no puede ser 0 (las solicitudes sin respuesta nunca expirarían)',
      );
    }
    if (variables.INTERVALO_DETECCION_NO_SHOW_MS === 0) {
      problemas.push(
        'En producción, INTERVALO_DETECCION_NO_SHOW_MS no puede ser 0 (un servicio sin iniciar se quedaría aceptado para siempre)',
      );
    }
    if (variables.INTERVALO_REVISION_DE_VIGENCIAS_MS === 0) {
      problemas.push(
        'En producción, INTERVALO_REVISION_DE_VIGENCIAS_MS no puede ser 0 (un cuidador con un control vencido seguiría apareciendo en la búsqueda)',
      );
    }
    if (variables.PASARELA_DE_PAGOS === 'simulada') {
      problemas.push(
        'En producción, PASARELA_DE_PAGOS no puede ser simulada (un pago de mentira se daría por cobrado)',
      );
    }
    if (variables.PASARELA_SIMULADA_APRUEBA_SOLA === 'true') {
      problemas.push(
        'En producción, PASARELA_SIMULADA_APRUEBA_SOLA no puede ser true (todo pago se aprobaría sin cobrar nada)',
      );
    }
    if (variables.DISPERSOR_DE_PAGOS === 'simulado') {
      problemas.push(
        'En producción, DISPERSOR_DE_PAGOS no puede ser simulado (un pago al cuidador de mentira se daría por hecho)',
      );
    }
    if (variables.INTERVALO_EXPIRACION_PAGOS_MS === 0) {
      problemas.push(
        'En producción, INTERVALO_EXPIRACION_PAGOS_MS no puede ser 0 (los pagos sin pagar nunca vencerían)',
      );
    }
    if (variables.INTERVALO_LIQUIDACION_MS === 0) {
      problemas.push(
        'En producción, INTERVALO_LIQUIDACION_MS no puede ser 0 (las liquidaciones nunca se enviarían)',
      );
    }
    if (variables.INTERVALO_SONDEO_OUTBOX_MS === 0) {
      problemas.push(
        'En producción, INTERVALO_SONDEO_OUTBOX_MS no puede ser 0 (los eventos pendientes nunca se entregarían)',
      );
    }
  }

  return problemas;
}

// Valida las variables de entorno y devuelve la instancia tipada.
// Lanza ErrorDeConfiguracion con TODOS los problemas, para corregirlos de una vez.
export function validarVariables(
  entorno: Record<string, unknown>,
): VariablesDeEntorno {
  // Una variable vacía (VARIABLE=) cuenta como ausente: así .env.ejemplo puede traer claves
  // sin valor y se aplican los valores por defecto.
  const conValor = Object.fromEntries(
    Object.entries(entorno).filter(
      ([, valor]) => !(typeof valor === 'string' && valor.trim() === ''),
    ),
  );

  const variables = plainToInstance(VariablesDeEntorno, conValor, {
    enableImplicitConversion: false,
    exposeDefaultValues: true,
  });

  const problemas = mensajesDe(
    validateSync(variables, { skipMissingProperties: false }),
  );
  if (problemas.length > 0) {
    throw new ErrorDeConfiguracion(problemas);
  }

  const adicionales = reglasAdicionales(variables);
  if (adicionales.length > 0) {
    throw new ErrorDeConfiguracion(adicionales);
  }

  return variables;
}

export function configuracionDesdeVariables(
  variables: VariablesDeEntorno,
): Configuracion {
  return {
    entorno: variables.NODE_ENV,
    esProduccion: variables.NODE_ENV === 'production',
    puerto: variables.PUERTO,
    urlBaseDeDatos: variables.URL_BASE_DE_DATOS,
    origenesPermitidos: listaDeOrigenes(variables.ORIGENES_PERMITIDOS),
    nivelDeLog: variables.NIVEL_DE_LOG,
    zonaHorariaNegocio: variables.ZONA_HORARIA_NEGOCIO,
    intervaloSondeoOutboxMs: variables.INTERVALO_SONDEO_OUTBOX_MS,
    intervaloExpiracionServiciosMs: variables.INTERVALO_EXPIRACION_SERVICIOS_MS,
    intervaloDeteccionNoShowMs: variables.INTERVALO_DETECCION_NO_SHOW_MS,
    intervaloRevisionDeVigenciasMs: variables.INTERVALO_REVISION_DE_VIGENCIAS_MS,
    intervaloEntregaNotificacionesMs:
      variables.INTERVALO_ENTREGA_NOTIFICACIONES_MS,
    toleranciaDeTomaMinutos: variables.TOLERANCIA_DE_TOMA_MINUTOS,
    intervaloOmisionTomasMs: variables.INTERVALO_OMISION_TOMAS_MS,
    canalesDeNotificacionSimulados:
      variables.CANALES_DE_NOTIFICACION_SIMULADOS === 'true',
    pasarelaDePagos: variables.PASARELA_DE_PAGOS,
    pasarelaSimuladaApruebaSola:
      variables.PASARELA_SIMULADA_APRUEBA_SOLA === 'true',
    secretoDePasarela: variables.SECRETO_DE_PASARELA ?? null,
    mercadopagoAccessToken: variables.MERCADOPAGO_ACCESS_TOKEN ?? null,
    mercadopagoSecretoDeFirma: variables.MERCADOPAGO_SECRETO_DE_FIRMA ?? null,
    dispersorDePagos: variables.DISPERSOR_DE_PAGOS,
    requierePagoAprobado: variables.REQUIERE_PAGO_APROBADO === 'true',
    minutosParaPagar: variables.MINUTOS_PARA_PAGAR,
    intervaloExpiracionPagosMs: variables.INTERVALO_EXPIRACION_PAGOS_MS,
    intervaloLiquidacionMs: variables.INTERVALO_LIQUIDACION_MS,
    sentryDsn: variables.SENTRY_DSN ?? null,
    secretoBff: variables.SECRETO_BFF ?? null,
    secretoJwtAcceso: variables.SECRETO_JWT_ACCESO,
    secretoDeCifrado: variables.SECRETO_DE_CIFRADO,
    idClaveJwt: variables.ID_CLAVE_JWT,
    duracionAccesoMin: variables.DURACION_ACCESO_MIN,
    duracionRefrescoDias: variables.DURACION_REFRESCO_DIAS,
    cookiesSeguras: variables.COOKIES_SEGURAS === 'true',
    versionPoliticaVigente: variables.VERSION_POLITICA_VIGENTE,
    versionConsentimientoSaludVigente:
      variables.VERSION_CONSENTIMIENTO_SALUD_VIGENTE,
    canalDeRecuperacion: variables.CANAL_DE_RECUPERACION,
    resendApiKey: variables.RESEND_API_KEY ?? null,
    resendCorreoDesde: variables.RESEND_CORREO_DESDE ?? null,
    canalDeCorreoParaAvisos: variables.CANAL_DE_CORREO_PARA_AVISOS,
    almacenDeArchivos: variables.ALMACEN_DE_ARCHIVOS,
    directorioDeArchivos: variables.DIRECTORIO_DE_ARCHIVOS,
    secretoDeArchivos: variables.SECRETO_DE_ARCHIVOS ?? null,
    cloudinaryCloudName: variables.CLOUDINARY_CLOUD_NAME ?? null,
    cloudinaryApiKey: variables.CLOUDINARY_API_KEY ?? null,
    cloudinaryApiSecret: variables.CLOUDINARY_API_SECRET ?? null,
    secretoDeOperacion: variables.SECRETO_DE_OPERACION ?? null,
    urlPublicaDeLaApi: (
      variables.URL_PUBLICA_DE_LA_API ??
      `http://localhost:${variables.PUERTO}/api/v1`
    ).replace(/\/+$/, ''),
  };
}
