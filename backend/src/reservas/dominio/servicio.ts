import {
  ConflictoDeEstado,
  ErrorDeValidacion,
  ReglaDeNegocioIncumplida,
} from '../../compartido/dominio/errores.js';
import { FechaCivil } from '../../compartido/dominio/fecha-civil.js';
import { esJornada, type Jornada } from '../../compartido/dominio/jornada.js';
import type { MotivoDeCancelacion } from '../../compartido/eventos/reservas.js';
import {
  franjaContiene,
  franjaYaTermino,
  MARGEN_PARA_INICIAR_MINUTOS,
  minutosHastaElInicio,
} from './franjas.js';
import type { ServicioId } from './ids.js';
import { transicionar } from './maquina-de-estados.js';
import {
  ESTADOS_ACTIVOS,
  MEDIOS_DE_PAGO,
  type AccionDeServicio,
  type EstadoDeServicio,
  type MedioDePago,
} from './valores-cerrados.js';

// El mismo rango que el CHECK `servicios_horas_validas`. Pagos tiene el suyo: cada módulo valida lo que le toca.
export const HORAS_MINIMAS = 1;
export const HORAS_MAXIMAS = 8;

// Decidido el 2026-10-26: el cuidador tiene 2 horas para responder, o 30 minutos si el servicio es para hoy.
export const PLAZO_DE_ACEPTACION_MINUTOS = 120;
export const PLAZO_DE_ACEPTACION_HOY_MINUTOS = 30;

// Hasta cuántos días adelante se puede pedir un servicio. Propuesto, a confirmar con el equipo.
export const DIAS_MAXIMOS_DE_ANTICIPACION = 180;

const FORMATO_DE_CLAVE = /^[A-Za-z0-9._:-]{8,100}$/;
const MS_POR_MINUTO = 60_000;

// Una fila del historial: trazabilidad de la máquina de estados (E9).
export interface TransicionDeServicio {
  desde: EstadoDeServicio | null;
  hacia: EstadoDeServicio;
  accion: AccionDeServicio;
  // La cuenta que hizo la acción; null cuando la hizo el sistema (la aceptación automática, la expiración).
  actorId: string | null;
  ocurridoEn: Date;
}

export interface DatosDeServicio {
  id: ServicioId;
  // Las tres personas del servicio. Los IDs vienen de otros módulos: nunca se guardan sus datos aquí.
  familiarId: string;
  adultoMayorId: string;
  cuidadorId: string;
  // El día civil en la zona del negocio (H2), nunca un instante UTC.
  fecha: FechaCivil;
  jornada: Jornada;
  horas: number;
  estado: EstadoDeServicio;
  medioDePago: MedioDePago;
  aceptacionAutomatica: boolean;
  // Hasta cuándo puede aceptar el cuidador; null cuando ya no está pendiente.
  solicitudExpiraEn: Date | null;
  // El desglose queda CONGELADO al solicitar (E10): si cambian la tarifa o las comisiones, este servicio
  // conserva el precio con el que se contrató. Pesos enteros.
  tarifaHora: number;
  subtotal: number;
  cargoFamilia: number;
  totalFamilia: number;
  pagoProfesional: number;
  politicaVersion: number;
  claveDeIdempotencia: string;
  // Cuándo Pagos avisó que el pago quedó aprobado; null mientras no.
  pagadoEn: Date | null;
  solicitadoEn: Date;
  aceptadoEn: Date | null;
  iniciadoEn: Date | null;
  finalizadoEn: Date | null;
  canceladoEn: Date | null;
  canceladoPor: string | null;
  motivoDeCancelacion: MotivoDeCancelacion | null;
  version: number;
  creadoEn: Date;
  actualizadoEn: Date;
}

export interface DatosParaSolicitar {
  id: ServicioId;
  familiarId: string;
  adultoMayorId: string;
  cuidadorId: string;
  fecha: FechaCivil;
  jornada: Jornada;
  horas: number;
  medioDePago: MedioDePago;
  // Lo que el cuidador tiene activado en su perfil hoy; el servicio guarda una copia.
  aceptacionAutomatica: boolean;
  tarifaHora: number;
  subtotal: number;
  cargoFamilia: number;
  totalFamilia: number;
  pagoProfesional: number;
  politicaVersion: number;
  claveDeIdempotencia: string;
  hoy: FechaCivil;
  ahora: Date;
  zonaHoraria: string;
}

// Un servicio de cuidado: una familia contrata a un cuidador para una fecha y una franja.
//
// Todos los cambios pasan por la máquina de estados (`transicionar`) y quedan en `transicionesPendientes`,
// que el repositorio escribe en el historial. Cada cambio sube la versión: el repositorio guarda con
// bloqueo optimista, así dos cambios simultáneos no se pisan.
export class Servicio {
  private readonly pendientes: TransicionDeServicio[] = [];
  // La versión con la que se leyó de la base de datos (0 si es nuevo): con ella el repositorio detecta que
  // otra persona lo cambió en el medio.
  private readonly leidaEnVersion: number;

  private constructor(
    private datos: DatosDeServicio,
    versionLeida: number,
  ) {
    this.leidaEnVersion = versionLeida;
  }

  static solicitar(entrada: DatosParaSolicitar): Servicio {
    validarSolicitud(entrada);
    const fechaEsHoy = entrada.fecha.igualA(entrada.hoy);
    const estado = transicionar(null, 'solicitar', 'familiar', {
      aceptacionAutomatica: entrada.aceptacionAutomatica,
    });
    const quedaAceptado = estado === 'aceptado';
    const plazoEnMinutos = fechaEsHoy
      ? PLAZO_DE_ACEPTACION_HOY_MINUTOS
      : PLAZO_DE_ACEPTACION_MINUTOS;

    const servicio = new Servicio(
      {
        id: entrada.id,
        familiarId: entrada.familiarId,
        adultoMayorId: entrada.adultoMayorId,
        cuidadorId: entrada.cuidadorId,
        fecha: entrada.fecha,
        jornada: entrada.jornada,
        horas: entrada.horas,
        estado,
        medioDePago: entrada.medioDePago,
        aceptacionAutomatica: entrada.aceptacionAutomatica,
        // Aceptado de entrada: ya no hay a quién esperar.
        solicitudExpiraEn: quedaAceptado
          ? null
          : new Date(entrada.ahora.getTime() + plazoEnMinutos * MS_POR_MINUTO),
        tarifaHora: entrada.tarifaHora,
        subtotal: entrada.subtotal,
        cargoFamilia: entrada.cargoFamilia,
        totalFamilia: entrada.totalFamilia,
        pagoProfesional: entrada.pagoProfesional,
        politicaVersion: entrada.politicaVersion,
        claveDeIdempotencia: entrada.claveDeIdempotencia,
        pagadoEn: null,
        solicitadoEn: entrada.ahora,
        aceptadoEn: quedaAceptado ? entrada.ahora : null,
        iniciadoEn: null,
        finalizadoEn: null,
        canceladoEn: null,
        canceladoPor: null,
        motivoDeCancelacion: null,
        version: 1,
        creadoEn: entrada.ahora,
        actualizadoEn: entrada.ahora,
      },
      0,
    );
    servicio.pendientes.push({
      desde: null,
      hacia: 'solicitado',
      accion: 'solicitar',
      actorId: entrada.familiarId,
      ocurridoEn: entrada.ahora,
    });
    if (quedaAceptado) {
      servicio.pendientes.push({
        desde: 'solicitado',
        hacia: 'aceptado',
        accion: 'aceptar',
        actorId: null,
        ocurridoEn: entrada.ahora,
      });
    }
    return servicio;
  }

  // Para reconstruir desde la base de datos: los datos ya fueron validados al guardarse.
  static reconstruir(datos: DatosDeServicio): Servicio {
    return new Servicio({ ...datos }, datos.version);
  }

  get id(): ServicioId {
    return this.datos.id;
  }
  get familiarId(): string {
    return this.datos.familiarId;
  }
  get adultoMayorId(): string {
    return this.datos.adultoMayorId;
  }
  get cuidadorId(): string {
    return this.datos.cuidadorId;
  }
  get fecha(): FechaCivil {
    return this.datos.fecha;
  }
  get jornada(): Jornada {
    return this.datos.jornada;
  }
  get horas(): number {
    return this.datos.horas;
  }
  get estado(): EstadoDeServicio {
    return this.datos.estado;
  }
  get medioDePago(): MedioDePago {
    return this.datos.medioDePago;
  }
  get aceptacionAutomatica(): boolean {
    return this.datos.aceptacionAutomatica;
  }
  get solicitudExpiraEn(): Date | null {
    return this.datos.solicitudExpiraEn;
  }
  get tarifaHora(): number {
    return this.datos.tarifaHora;
  }
  get subtotal(): number {
    return this.datos.subtotal;
  }
  get cargoFamilia(): number {
    return this.datos.cargoFamilia;
  }
  get totalFamilia(): number {
    return this.datos.totalFamilia;
  }
  get pagoProfesional(): number {
    return this.datos.pagoProfesional;
  }
  get politicaVersion(): number {
    return this.datos.politicaVersion;
  }
  get claveDeIdempotencia(): string {
    return this.datos.claveDeIdempotencia;
  }
  get pagadoEn(): Date | null {
    return this.datos.pagadoEn;
  }
  get solicitadoEn(): Date {
    return this.datos.solicitadoEn;
  }
  get aceptadoEn(): Date | null {
    return this.datos.aceptadoEn;
  }
  get iniciadoEn(): Date | null {
    return this.datos.iniciadoEn;
  }
  get finalizadoEn(): Date | null {
    return this.datos.finalizadoEn;
  }
  get canceladoEn(): Date | null {
    return this.datos.canceladoEn;
  }
  get canceladoPor(): string | null {
    return this.datos.canceladoPor;
  }
  get motivoDeCancelacion(): MotivoDeCancelacion | null {
    return this.datos.motivoDeCancelacion;
  }
  get version(): number {
    return this.datos.version;
  }
  get versionLeida(): number {
    return this.leidaEnVersion;
  }
  get creadoEn(): Date {
    return this.datos.creadoEn;
  }
  get actualizadoEn(): Date {
    return this.datos.actualizadoEn;
  }
  get transicionesPendientes(): readonly TransicionDeServicio[] {
    return this.pendientes;
  }

  // ¿Tiene al cuidador comprometido en esa fecha y franja?
  estaActivo(): boolean {
    return (ESTADOS_ACTIVOS as readonly string[]).includes(this.datos.estado);
  }

  // El cuidador acepta. Si el plazo ya venció (la tarea de expiración todavía no corrió), ya no puede.
  aceptar(cuidadorUsuarioId: string, ahora: Date): void {
    const estado = transicionar(this.datos.estado, 'aceptar', 'cuidador');
    if (this.solicitudVencida(ahora)) {
      throw new ConflictoDeEstado(
        'La solicitud ya venció',
        'servicio.solicitud_expirada',
      );
    }
    this.mover(estado, 'aceptar', cuidadorUsuarioId, ahora);
    this.datos.aceptadoEn = ahora;
    this.datos.solicitudExpiraEn = null;
  }

  rechazar(cuidadorUsuarioId: string, ahora: Date): void {
    const estado = transicionar(this.datos.estado, 'rechazar', 'cuidador');
    this.mover(estado, 'rechazar', cuidadorUsuarioId, ahora);
    this.cancelarCon('rechazada', cuidadorUsuarioId, ahora);
  }

  // La tarea programada cancela las solicitudes cuyo plazo venció sin respuesta.
  expirar(ahora: Date): void {
    const estado = transicionar(this.datos.estado, 'expirar', 'sistema');
    if (!this.solicitudVencida(ahora)) {
      throw new ConflictoDeEstado(
        'La solicitud todavía está vigente',
        'servicio.solicitud_vigente',
      );
    }
    this.mover(estado, 'expirar', null, ahora);
    this.cancelarCon('expirada', null, ahora);
  }

  cancelar(familiarUsuarioId: string, ahora: Date): void {
    const estado = transicionar(this.datos.estado, 'cancelar', 'familiar');
    this.mover(estado, 'cancelar', familiarUsuarioId, ahora);
    this.cancelarCon('cancelada_por_familia', familiarUsuarioId, ahora);
  }

  // Pagos avisa que el pago quedó aprobado. Devuelve falso si no hay nada que anotar: ya estaba anotado, o el
  // servicio se canceló mientras tanto (el dinero se devuelve por otro camino).
  registrarPago(ahora: Date): boolean {
    if (this.datos.pagadoEn !== null || this.datos.estado === 'cancelado') {
      return false;
    }
    this.datos.pagadoEn = ahora;
    this.datos.version += 1;
    this.datos.actualizadoEn = ahora;
    return true;
  }

  // Pagos avisa que el pago no se hizo (la pasarela lo rechazó, venció o el saldo de la bolsa no alcanzó).
  cancelarPorPago(ahora: Date): void {
    const estado = transicionar(
      this.datos.estado,
      'cancelar_por_pago',
      'sistema',
    );
    this.mover(estado, 'cancelar_por_pago', null, ahora);
    this.cancelarCon('pago_fallido', null, ahora);
  }

  // El cuidador marca que empezó. Solo dentro de su franja (con un margen para quien llega un poco antes). Con
  // `exigirPago`, además, el pago tiene que estar aprobado: nadie presta un servicio que no se ha pagado.
  iniciar(
    cuidadorUsuarioId: string,
    ahora: Date,
    zonaHoraria: string,
    exigirPago = false,
  ): void {
    const estado = transicionar(this.datos.estado, 'iniciar', 'cuidador');
    if (
      !franjaContiene(
        this.datos.fecha,
        this.datos.jornada,
        ahora,
        zonaHoraria,
        MARGEN_PARA_INICIAR_MINUTOS,
      )
    ) {
      throw new ReglaDeNegocioIncumplida(
        'El servicio solo puede iniciarse dentro de su franja',
        'servicio.fuera_de_la_franja',
      );
    }
    if (exigirPago && this.datos.pagadoEn === null) {
      throw new ReglaDeNegocioIncumplida(
        'El servicio todavía no está pagado',
        'servicio.pago_pendiente',
      );
    }
    this.mover(estado, 'iniciar', cuidadorUsuarioId, ahora);
    this.datos.iniciadoEn = ahora;
  }

  finalizar(cuidadorUsuarioId: string, ahora: Date): void {
    const estado = transicionar(this.datos.estado, 'finalizar', 'cuidador');
    this.mover(estado, 'finalizar', cuidadorUsuarioId, ahora);
    this.datos.finalizadoEn = ahora;
  }

  // ¿Hoy ya se puede prestar? Para el «cuidador en turno» (H4): aceptado o en curso, y la franja contiene el
  // momento actual.
  estaEnTurno(ahora: Date, zonaHoraria: string): boolean {
    return (
      (this.datos.estado === 'aceptado' || this.datos.estado === 'en_curso') &&
      franjaContiene(this.datos.fecha, this.datos.jornada, ahora, zonaHoraria)
    );
  }

  // Cuántas horas enteras faltaban para empezar (0 si ya empezó): lo que mide la política de reembolso (M7).
  horasDeAnticipacion(ahora: Date, zonaHoraria: string): number {
    const minutos = minutosHastaElInicio(
      this.datos.fecha,
      this.datos.jornada,
      ahora,
      zonaHoraria,
    );
    return Math.max(0, Math.floor(minutos / 60));
  }

  private solicitudVencida(ahora: Date): boolean {
    const limite = this.datos.solicitudExpiraEn;
    return limite !== null && ahora.getTime() >= limite.getTime();
  }

  private cancelarCon(
    motivo: MotivoDeCancelacion,
    actorId: string | null,
    ahora: Date,
  ): void {
    this.datos.canceladoEn = ahora;
    this.datos.canceladoPor = actorId;
    this.datos.motivoDeCancelacion = motivo;
    this.datos.solicitudExpiraEn = null;
  }

  private mover(
    hacia: EstadoDeServicio,
    accion: AccionDeServicio,
    actorId: string | null,
    ahora: Date,
  ): void {
    this.pendientes.push({
      desde: this.datos.estado,
      hacia,
      accion,
      actorId,
      ocurridoEn: ahora,
    });
    this.datos.estado = hacia;
    this.datos.version += 1;
    this.datos.actualizadoEn = ahora;
  }
}

function validarSolicitud(entrada: DatosParaSolicitar): void {
  if (
    !Number.isInteger(entrada.horas) ||
    entrada.horas < HORAS_MINIMAS ||
    entrada.horas > HORAS_MAXIMAS
  ) {
    throw new ErrorDeValidacion(
      `Las horas deben ser un entero entre ${HORAS_MINIMAS} y ${HORAS_MAXIMAS}`,
      'servicio.horas_invalidas',
    );
  }
  if (!esJornada(entrada.jornada)) {
    throw new ErrorDeValidacion(
      'La jornada no es válida',
      'servicio.jornada_invalida',
    );
  }
  if (!(MEDIOS_DE_PAGO as readonly string[]).includes(entrada.medioDePago)) {
    throw new ErrorDeValidacion(
      'El medio de pago no es válido',
      'servicio.medio_de_pago_invalido',
    );
  }
  if (!FORMATO_DE_CLAVE.test(entrada.claveDeIdempotencia)) {
    throw new ErrorDeValidacion(
      'La clave de idempotencia debe tener de 8 a 100 caracteres (letras, números y . _ : -)',
      'servicio.clave_invalida',
    );
  }
  validarMontos(entrada);

  if (entrada.fecha.esAnteriorA(entrada.hoy)) {
    throw new ReglaDeNegocioIncumplida(
      'La fecha del servicio no puede ser anterior a hoy',
      'servicio.fecha_pasada',
    );
  }
  if (
    entrada.hoy
      .sumarDias(DIAS_MAXIMOS_DE_ANTICIPACION)
      .esAnteriorA(entrada.fecha)
  ) {
    throw new ReglaDeNegocioIncumplida(
      `El servicio no puede pedirse con más de ${DIAS_MAXIMOS_DE_ANTICIPACION} días de anticipación`,
      'servicio.fecha_muy_lejana',
    );
  }
  if (
    entrada.fecha.igualA(entrada.hoy) &&
    franjaYaTermino(
      entrada.fecha,
      entrada.jornada,
      entrada.ahora,
      entrada.zonaHoraria,
    )
  ) {
    throw new ReglaDeNegocioIncumplida(
      'Esa franja de hoy ya terminó',
      'servicio.franja_terminada',
    );
  }
}

// Las mismas condiciones del CHECK `servicios_desglose_coherente`: un desglose que no cuadra no se guarda.
function validarMontos(entrada: DatosParaSolicitar): void {
  const montos = [
    entrada.tarifaHora,
    entrada.subtotal,
    entrada.cargoFamilia,
    entrada.totalFamilia,
    entrada.pagoProfesional,
  ];
  const coherente =
    montos.every((monto) => Number.isSafeInteger(monto) && monto >= 0) &&
    entrada.tarifaHora > 0 &&
    entrada.subtotal === entrada.tarifaHora * entrada.horas &&
    entrada.totalFamilia === entrada.subtotal + entrada.cargoFamilia &&
    entrada.pagoProfesional <= entrada.subtotal &&
    Number.isInteger(entrada.politicaVersion) &&
    entrada.politicaVersion >= 1;
  if (!coherente) {
    throw new ErrorDeValidacion(
      'El desglose de costo del servicio no es coherente',
      'servicio.desglose_incoherente',
    );
  }
}
