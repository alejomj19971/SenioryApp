import type { Auditoria } from '../../../compartido/aplicacion/puertos/auditoria.js';
import type { Reloj } from '../../../compartido/aplicacion/puertos/reloj.js';
import type { UnidadDeTrabajo } from '../../../compartido/aplicacion/puertos/unidad-de-trabajo.js';
import type { GeneradorDeTokensOpacos } from '../puertos/salida/generador-de-tokens-opacos.js';
import type { RepositorioSesiones } from '../puertos/salida/repositorio-sesiones.js';

// Revoca toda la familia de la sesión: el dispositivo queda fuera aunque alguien conserve una copia
// del token de refresco. Es idempotente: sin token, o con uno que no existe, no hace nada.
export class CerrarSesion {
  constructor(
    private readonly sesiones: RepositorioSesiones,
    private readonly tokensOpacos: GeneradorDeTokensOpacos,
    private readonly unidadDeTrabajo: UnidadDeTrabajo,
    private readonly auditoria: Auditoria,
    private readonly reloj: Reloj,
  ) {}

  async ejecutar(tokenDeRefresco: string | undefined): Promise<void> {
    if (tokenDeRefresco === undefined || tokenDeRefresco === '') return;
    const hash = this.tokensOpacos.hashDe(tokenDeRefresco);

    const cerrada = await this.unidadDeTrabajo.ejecutar(async () => {
      const sesion = await this.sesiones.buscarPorHashDelToken(hash);
      if (sesion === null) return null;
      await this.sesiones.revocarFamilia(sesion.familiaId, this.reloj.ahora());
      return { usuarioId: sesion.usuarioId, familiaId: sesion.familiaId };
    });

    if (cerrada !== null) {
      await this.auditoria.registrar({
        actorId: cerrada.usuarioId,
        accion: 'identidad.cerrar_sesion',
        recursoTipo: 'sesion',
        recursoId: cerrada.familiaId,
        resultado: 'permitido',
      });
    }
  }
}
