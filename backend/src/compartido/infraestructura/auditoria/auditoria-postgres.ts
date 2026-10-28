import type {
  Auditoria,
  EntradaDeAuditoria,
} from '../../aplicacion/puertos/auditoria.js';
import type { ContextoDePeticion } from '../../aplicacion/puertos/contexto-de-peticion.js';
import type { GeneradorDeIds } from '../../aplicacion/puertos/generador-de-ids.js';
import type { Reloj } from '../../aplicacion/puertos/reloj.js';
import type { BaseDeDatos } from '../base-de-datos/base-de-datos.module.js';
import { auditoria } from '../base-de-datos/compartido.esquema.js';

// Escribe en `compartido.auditoria` con el pool, NUNCA con la transacción del caso de uso
// (M0 §4.8): si el caso de uso se revierte, por ejemplo porque se negó el acceso, el registro
// queda igual (E6).
//
// Si no se puede escribir, el error se propaga: una lectura de datos de salud que no quedó
// auditada no debe entregarse.
export class AuditoriaPostgres implements Auditoria {
  constructor(
    private readonly bd: BaseDeDatos,
    private readonly generadorDeIds: GeneradorDeIds,
    private readonly reloj: Reloj,
    private readonly contextoDePeticion: ContextoDePeticion,
  ) {}

  async registrar(entrada: EntradaDeAuditoria): Promise<void> {
    await this.bd.insert(auditoria).values({
      id: this.generadorDeIds.nuevo<'Auditoria'>(),
      ocurridoEn: this.reloj.ahora(),
      actorId: entrada.actorId,
      accion: entrada.accion,
      recursoTipo: entrada.recursoTipo,
      recursoId: entrada.recursoId,
      resultado: entrada.resultado,
      idDeCorrelacion: this.contextoDePeticion.idDeCorrelacion(),
      metadatos: entrada.metadatos ?? null,
    });
  }
}
