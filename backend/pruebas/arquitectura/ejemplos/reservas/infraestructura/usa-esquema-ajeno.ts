// ROMPE: esquemas-privados (reservas lee las tablas de pagos)
import { tablaDePagos } from '../../pagos/infraestructura/salida/persistencia/pagos.esquema.js';

export const consultaDePagos = tablaDePagos;
