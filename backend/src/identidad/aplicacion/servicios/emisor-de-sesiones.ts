import type { GeneradorDeIds } from '../../../compartido/aplicacion/puertos/generador-de-ids.js';
import type { Rol } from '../../../compartido/dominio/rol.js';
import type {
  FamiliaDeSesionesId,
  SesionDeRefrescoId,
  UsuarioId,
} from '../../dominio/ids.js';
import { SesionDeRefresco } from '../../dominio/sesion-de-refresco.js';
import type { EmisorDeTokens } from '../puertos/salida/emisor-de-tokens.js';
import type { GeneradorDeTokensOpacos } from '../puertos/salida/generador-de-tokens-opacos.js';
import type { RepositorioSesiones } from '../puertos/salida/repositorio-sesiones.js';

// Los dos tokens de una sesión, tal como se entregan a la persona.
export interface TokensDeSesion {
  acceso: string;
  accesoExpiraEn: Date;
  refresco: string;
  refrescoExpiraEn: Date;
}

// Abre una sesión nueva (token de acceso y de refresco) para un usuario. La usan el registro, el
// inicio de sesión y la renovación. Debe llamarse dentro de una unidad de trabajo: guarda la sesión.
export class EmisorDeSesiones {
  constructor(
    private readonly sesiones: RepositorioSesiones,
    private readonly emisor: EmisorDeTokens,
    private readonly tokensOpacos: GeneradorDeTokensOpacos,
    private readonly ids: GeneradorDeIds,
    private readonly duracionDelRefrescoMs: number,
  ) {}

  // Sin `familiaId` empieza una familia nueva (un inicio de sesión); con ella continúa la cadena
  // de renovaciones de esa familia.
  async emitir(
    usuario: { id: UsuarioId; rol: Rol },
    ahora: Date,
    familiaId?: FamiliaDeSesionesId,
  ): Promise<{ sesionId: SesionDeRefrescoId; tokens: TokensDeSesion }> {
    const opaco = this.tokensOpacos.generar();
    const sesion = SesionDeRefresco.emitir({
      id: this.ids.nuevo<'SesionDeRefresco'>(),
      usuarioId: usuario.id,
      familiaId: familiaId ?? this.ids.nuevo<'FamiliaDeSesiones'>(),
      hashDelToken: opaco.hash,
      ahora,
      duracionMs: this.duracionDelRefrescoMs,
    });
    await this.sesiones.guardar(sesion);
    const acceso = await this.emisor.emitirAcceso(usuario, ahora);
    return {
      sesionId: sesion.id,
      tokens: {
        acceso: acceso.token,
        accesoExpiraEn: acceso.expiraEn,
        refresco: opaco.token,
        refrescoExpiraEn: sesion.expiraEn,
      },
    };
  }
}
