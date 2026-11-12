export interface PedidoDeCobro {
  // Nuestro identificador del pago: la pasarela lo guarda como «referencia» y nos lo devuelve en cada aviso. Pedir
  // dos veces el cobro con la misma referencia devuelve el mismo cobro (la pasarela lo trata como idempotente).
  referencia: string;
  // Pesos enteros.
  monto: number;
  descripcion: string;
  venceEn: Date;
}

export interface CobroCreado {
  // Cómo conoce la pasarela este cobro.
  referenciaProveedor: string;
  // A dónde manda el BFF a la familia a pagar.
  urlDePago: string;
}

export type EstadoEnLaPasarela = 'pendiente' | 'aprobado' | 'rechazado';

export interface PedidoDeReembolso {
  referenciaProveedor: string;
  monto: number;
  // Hace que repetir el reembolso no devuelva el dinero dos veces.
  claveDeIdempotencia: string;
}

// Lo que dice un aviso (webhook) de la pasarela, ya traducido a nuestros términos. Nunca lleva datos de tarjeta.
export interface AvisoDeLaPasarela {
  // El mismo aviso puede llegar varias veces: este identificador permite procesarlo una sola vez.
  idEventoExterno: string;
  // «otro» son avisos que no nos interesan (se confirman y se ignoran).
  resultado: 'aprobado' | 'rechazado' | 'otro';
  // Nuestro identificador del pago.
  referencia: string;
  // Cómo conoce la pasarela este cobro: con ella se podrá reembolsar. Null si el aviso no la trae.
  referenciaProveedor: string | null;
  monto: number | null;
}

// El proveedor de cobros. Cada proveedor real (Wompi, Mercado Pago…) es un adaptador de este puerto: elegirlo
// no cambia nada del resto (decisión abierta, docs/PENDIENTES.md). Hasta entonces solo hay una pasarela simulada
// (desarrollo y pruebas) y otra deshabilitada que responde «no disponible».
export interface PasarelaDePagos {
  // Se guarda en cada pago como `proveedor`, y es el que viaja en la ruta del webhook.
  readonly nombre: string;
  readonly habilitada: boolean;

  crearCobro(pedido: PedidoDeCobro): Promise<CobroCreado>;

  // Para recuperar un aviso que se perdió: antes de vencer un pago pendiente se le pregunta a la pasarela.
  consultarEstado(referenciaProveedor: string): Promise<EstadoEnLaPasarela>;

  reembolsar(pedido: PedidoDeReembolso): Promise<void>;

  // ¿El aviso lo firmó de verdad la pasarela? Compara en tiempo constante, sobre el cuerpo EXACTO recibido.
  verificarFirma(
    cuerpoCrudo: Buffer,
    encabezados: Readonly<Record<string, string | string[] | undefined>>,
  ): boolean;

  // Null si el cuerpo no tiene la forma de un aviso de esta pasarela. Es asíncrono porque algunos proveedores
  // (MercadoPago) mandan un aviso «delgado» que solo dice qué cambió: hay que consultarle el estado real antes
  // de poder traducirlo.
  interpretarAviso(cuerpo: unknown): Promise<AvisoDeLaPasarela | null>;
}

export const PASARELA_DE_PAGOS = Symbol('PasarelaDePagos');
