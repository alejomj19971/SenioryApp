import type { Auditoria } from '../../../compartido/aplicacion/puertos/auditoria.js';
import type { Reloj } from '../../../compartido/aplicacion/puertos/reloj.js';
import type { UnidadDeTrabajo } from '../../../compartido/aplicacion/puertos/unidad-de-trabajo.js';
import type { Servicio } from '../../dominio/servicio.js';
import type { RepositorioServicios } from '../puertos/salida/repositorio-servicios.js';
import type { AccesoAServicios, RolConAcceso } from './acceso-a-servicios.js';

export interface Accion {
  // «reservas.aceptar_servicio»: nombra la acción en la auditoría.
  nombre: string;
  rol: RolConAcceso;
  // Lo que hace el dominio (y las comprobaciones extra que necesite). Si lanza, se revierte todo.
  aplicar: (servicio: Servicio, ahora: Date) => void | Promise<void>;
  // Lo que se anuncia a los demás módulos, dentro de la misma transacción.
  anunciar: (servicio: Servicio, ahora: Date) => Promise<void>;
}

// Lo común a las acciones sobre un servicio existente: cargarlo con la fila bloqueada, comprobar que quien
// actúa es parte, aplicar el cambio, guardarlo con bloqueo optimista, anunciarlo y dejar la auditoría. Todo en
// una transacción: o ocurre completo, o no ocurre.
export class EjecutorDeAcciones {
  constructor(
    private readonly acceso: AccesoAServicios,
    private readonly servicios: RepositorioServicios,
    private readonly unidadDeTrabajo: UnidadDeTrabajo,
    private readonly auditoria: Auditoria,
    private readonly reloj: Reloj,
  ) {}

  async ejecutar(
    servicioId: string,
    usuarioId: string,
    accion: Accion,
  ): Promise<Servicio> {
    const servicio = await this.unidadDeTrabajo.ejecutar(async () => {
      const cargado = await this.acceso.cargar(
        servicioId,
        usuarioId,
        accion.rol,
        accion.nombre,
        true,
      );
      const ahora = this.reloj.ahora();
      await accion.aplicar(cargado, ahora);
      await this.servicios.actualizar(cargado);
      await accion.anunciar(cargado, ahora);
      return cargado;
    });
    await this.auditoria.registrar({
      actorId: usuarioId,
      accion: accion.nombre,
      recursoTipo: 'servicio',
      recursoId: servicio.id,
      resultado: 'permitido',
    });
    return servicio;
  }
}
