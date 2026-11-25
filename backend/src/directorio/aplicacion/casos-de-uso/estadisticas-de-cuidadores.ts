import type {
  EstadisticasDeCuidadores,
  RepositorioCuidadores,
} from '../puertos/salida/repositorio-cuidadores.js';

// El resumen de cuidadores para el panel del administrador: solo conteos, ningún dato de ninguna persona (por eso no
// deja huella en la auditoría). Quién puede pedirlo lo decide el controlador (`@Roles('administrador')`).
export class ObtenerEstadisticasDeCuidadores {
  constructor(private readonly cuidadores: RepositorioCuidadores) {}

  ejecutar(): Promise<EstadisticasDeCuidadores> {
    return this.cuidadores.obtenerEstadisticas();
  }
}
