import type { Bolsa, MovimientoDeBolsa } from '../../../dominio/bolsa.js';
import type { BolsaId, PagoId } from '../../../dominio/ids.js';
import type { Liquidacion } from '../../../dominio/liquidacion.js';
import type { PaqueteDeBolsa } from '../../../dominio/paquete-de-bolsa.js';
import type { Pago } from '../../../dominio/pago.js';

export interface RepositorioPagos {
  // Lanza ConflictoDeEstado `pago.clave_repetida` si ese pagador ya usó esa clave.
  guardar(pago: Pago): Promise<void>;

  // Bloqueo optimista: lanza ConflictoDeEstado `pago.version_obsoleta` si alguien lo cambió en el medio.
  actualizar(pago: Pago): Promise<void>;

  buscarPorId(id: PagoId): Promise<Pago | null>;
  // Dentro de una unidad de trabajo, bloquea la fila hasta el final de la transacción.
  buscarPorIdParaActualizar(id: PagoId): Promise<Pago | null>;
  // El pago del servicio (hay uno solo), bloqueado.
  buscarPorServicioParaActualizar(servicioId: string): Promise<Pago | null>;
  buscarPorClave(pagadorId: string, clave: string): Promise<Pago | null>;

  // Los más recientes primero.
  listarDePagador(pagadorId: string, limite: number): Promise<Pago[]>;

  // Los pendientes creados antes de `creadosAntesDe`: los que ya pasaron su plazo.
  listarPendientesVencidos(
    creadosAntesDe: Date,
    limite: number,
  ): Promise<PagoId[]>;
}

export interface RepositorioBolsas {
  buscarPorFamiliar(familiarId: string): Promise<Bolsa | null>;

  // La bolsa de la familia, bloqueada; si no tiene, la abre. Dos llamadas simultáneas no crean dos.
  obtenerOCrearParaActualizar(
    familiarId: string,
    idSiSeCrea: BolsaId,
    ahora: Date,
  ): Promise<Bolsa>;

  // Guarda el saldo (con bloqueo optimista) y agrega al libro los movimientos pendientes, en la misma transacción.
  // Lanza ConflictoDeEstado `bolsa.movimiento_repetido` si ese movimiento ya existía para el servicio.
  guardar(bolsa: Bolsa): Promise<void>;

  movimientosDelServicio(
    bolsaId: BolsaId,
    servicioId: string,
  ): Promise<MovimientoDeBolsa[]>;

  // Los más recientes primero.
  ultimosMovimientos(
    bolsaId: BolsaId,
    limite: number,
  ): Promise<MovimientoDeBolsa[]>;
}

export interface RepositorioLiquidaciones {
  // Falso si ya existía una liquidación para ese servicio (reprocesar el evento no paga dos veces).
  crearSiNoExiste(liquidacion: Liquidacion): Promise<boolean>;

  // La siguiente pendiente, bloqueada y saltándose las que otra instancia ya está atendiendo.
  reclamarSiguientePendiente(): Promise<Liquidacion | null>;

  actualizar(liquidacion: Liquidacion): Promise<void>;

  buscarPorServicio(servicioId: string): Promise<Liquidacion | null>;

  // Las más recientes primero.
  listarDeCuidador(cuidadorId: string, limite: number): Promise<Liquidacion[]>;
}

export interface AvisoRegistrado {
  id: string;
  proveedor: string;
  idEventoExterno: string;
  pagoId: string | null;
  tipo: string;
  // Sin datos de tarjeta: lo garantiza el adaptador de cada pasarela.
  cuerpo: unknown;
  firmaValida: boolean;
  recibidoEn: Date;
}

export interface RepositorioAvisosDePasarela {
  // Falso si ese aviso ya se había recibido: se procesa una sola vez (E3).
  registrar(aviso: AvisoRegistrado): Promise<boolean>;

  marcarProcesado(id: string, ahora: Date): Promise<void>;
}

export interface RepositorioPaquetes {
  listarActivos(): Promise<PaqueteDeBolsa[]>;
  buscarActivo(codigo: string): Promise<PaqueteDeBolsa | null>;
  // Activo o no: el crédito de una compra ya hecha no depende de que el paquete siga a la venta.
  buscar(codigo: string): Promise<PaqueteDeBolsa | null>;
}

export const REPOSITORIO_PAGOS = Symbol('RepositorioPagos');
export const REPOSITORIO_BOLSAS = Symbol('RepositorioBolsas');
export const REPOSITORIO_LIQUIDACIONES = Symbol('RepositorioLiquidaciones');
export const REPOSITORIO_AVISOS_DE_PASARELA = Symbol(
  'RepositorioAvisosDePasarela',
);
export const REPOSITORIO_PAQUETES = Symbol('RepositorioPaquetes');
