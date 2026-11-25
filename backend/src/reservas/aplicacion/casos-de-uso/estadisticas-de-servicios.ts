import type { Reloj } from '../../../compartido/aplicacion/puertos/reloj.js';
import type {
  EstadisticasDeServicios,
  RepositorioServicios,
} from '../puertos/salida/repositorio-servicios.js';

// El resumen de servicios para el panel del administrador: solo conteos, ningún dato de ninguna persona (por eso no
// deja huella en la auditoría). Quién puede pedirlo lo decide el controlador (`@Roles('administrador')`).
export class ObtenerEstadisticasDeServicios {
  constructor(
    private readonly servicios: RepositorioServicios,
    private readonly reloj: Reloj,
  ) {}

  ejecutar(): Promise<EstadisticasDeServicios> {
    return this.servicios.obtenerEstadisticas(this.reloj.ahora());
  }
}
