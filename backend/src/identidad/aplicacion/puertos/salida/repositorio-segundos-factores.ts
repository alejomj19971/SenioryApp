import type { UsuarioId } from '../../../dominio/ids.js';
import type { SegundoFactor } from '../../../dominio/segundo-factor.js';

export interface RepositorioSegundosFactores {
  buscarPorUsuarioId(usuarioId: UsuarioId): Promise<SegundoFactor | null>;

  // Con bloqueo: dos peticiones simultáneas de la misma cuenta (dos pestañas confirmando a la vez, por
  // ejemplo) se atienden una tras otra. Debe llamarse dentro de una unidad de trabajo.
  buscarPorUsuarioIdParaActualizar(
    usuarioId: UsuarioId,
  ): Promise<SegundoFactor | null>;

  // Crea el registro o, si ya existía (reiniciar la configuración), lo reemplaza entero.
  guardarOReemplazar(segundoFactor: SegundoFactor): Promise<void>;

  actualizar(segundoFactor: SegundoFactor): Promise<void>;

  // Apagar el segundo factor por elección propia, o al recuperar la cuenta por correo.
  eliminar(usuarioId: UsuarioId): Promise<void>;
}

export const REPOSITORIO_SEGUNDOS_FACTORES = Symbol(
  'RepositorioSegundosFactores',
);
