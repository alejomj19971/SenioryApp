// Sobre común de los eventos entre módulos (M0 §4.8). Viaja por el outbox (`compartido.outbox`).
// Cada módulo declara aquí, en compartido/eventos, los contratos de los eventos que publica:
// así un manejador nunca importa nada de otro módulo (regla eventos-por-contrato, M0 §4.9).
export interface EventoDeIntegracion<
  Tipo extends string = string,
  Datos = unknown,
> {
  id: string; // UUID v7
  tipo: Tipo; // «modulo.hecho_en_pasado», por ejemplo 'reservas.servicio_confirmado'
  version: number; // versión del esquema de `datos`; se sube si cambia su forma
  ocurridoEn: string; // ISO 8601 en UTC
  idDeCorrelacion: string; // el de la petición HTTP que lo originó
  datos: Datos; // solo IDs y valores necesarios; nunca datos clínicos ni personales
}
