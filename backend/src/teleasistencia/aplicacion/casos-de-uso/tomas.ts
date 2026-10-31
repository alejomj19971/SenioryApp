import type { Auditoria } from '../../../compartido/aplicacion/puertos/auditoria.js';
import type { Reloj } from '../../../compartido/aplicacion/puertos/reloj.js';
import type { UnidadDeTrabajo } from '../../../compartido/aplicacion/puertos/unidad-de-trabajo.js';
import { RecursoNoEncontrado } from '../../../compartido/dominio/errores.js';
import { FechaCivil } from '../../../compartido/dominio/fecha-civil.js';
import type { MedicamentoId } from '../../dominio/medicamento.js';
import type { Toma, TomaId } from '../../dominio/toma.js';
import type {
  ActorDeTeleasistencia,
  PoliticaDeAcceso,
} from '../puertos/salida/politica-de-acceso.js';
import type {
  RepositorioMedicamentos,
  RepositorioTomas,
} from '../puertos/salida/repositorios.js';
import type { EventosDeTeleasistencia } from '../servicios/eventos-de-teleasistencia.js';
import { vistaDeToma, type VistaDeToma } from '../vistas.js';

const NO_ENCONTRADA = () =>
  new RecursoNoEncontrado('No encontramos esa toma', 'toma.no_encontrada');

// Marcar o deshacer una toma. Solo el día que corresponde (H6), y quien lo hace tiene que tener acceso a la
// persona: la familia, o el cuidador mientras tiene un servicio activo. Deshacer deja su propia fila en la
// auditoría. Cada cambio se guarda con bloqueo optimista: marcar y deshacer desde dos pantallas a la vez no se
// pisan.
export class CambiarEstadoDeToma {
  constructor(
    private readonly politica: PoliticaDeAcceso,
    private readonly tomas: RepositorioTomas,
    private readonly unidadDeTrabajo: UnidadDeTrabajo,
    private readonly auditoria: Auditoria,
    private readonly reloj: Reloj,
    private readonly zonaHoraria: string,
  ) {}

  marcarTomada(
    actor: ActorDeTeleasistencia,
    medicamentoId: string,
    tomaId: string,
  ): Promise<VistaDeToma> {
    return this.cambiar(
      actor,
      medicamentoId,
      tomaId,
      'teleasistencia.marcar_toma',
      (toma, ahora, hoy) => toma.marcarTomada(actor.usuarioId, ahora, hoy),
    );
  }

  desmarcar(
    actor: ActorDeTeleasistencia,
    medicamentoId: string,
    tomaId: string,
  ): Promise<VistaDeToma> {
    return this.cambiar(
      actor,
      medicamentoId,
      tomaId,
      'teleasistencia.desmarcar_toma',
      (toma, _ahora, hoy) => toma.desmarcar(hoy),
    );
  }

  private async cambiar(
    actor: ActorDeTeleasistencia,
    medicamentoId: string,
    tomaId: string,
    accion: string,
    aplicar: (toma: Toma, ahora: Date, hoy: FechaCivil) => void,
  ): Promise<VistaDeToma> {
    const toma = await this.unidadDeTrabajo.ejecutar(async () => {
      const cargada = await this.tomas.buscarPorIdParaActualizar(
        tomaId as TomaId,
      );
      // La toma tiene que ser de ESE medicamento: el id de la ruta no se toma por bueno.
      if (cargada === null || cargada.medicamentoId !== medicamentoId) {
        throw NO_ENCONTRADA();
      }
      await this.politica.exigir(
        actor,
        cargada.adultoMayorId,
        'registro',
        accion,
      );
      aplicar(
        cargada,
        this.reloj.ahora(),
        FechaCivil.hoy(this.reloj, this.zonaHoraria),
      );
      await this.tomas.actualizar(cargada);
      return cargada;
    });
    await this.auditoria.registrar({
      actorId: actor.usuarioId,
      accion: `${accion}_hecha`,
      recursoTipo: 'toma',
      recursoId: toma.id,
      resultado: 'permitido',
    });
    return vistaDeToma(toma);
  }
}

// La tarea programada: una toma que sigue pendiente pasada la tolerancia se marca «omitida» y se anuncia
// (`medicamento_omitido`) para que la familia lo sepa. Cada toma va en su propia transacción y es segura si dos
// instancias corren a la vez: se bloquea la fila y se vuelve a comprobar el estado.
export const TOMAS_POR_VUELTA = 100;

export class OmitirTomasVencidas {
  constructor(
    private readonly tomas: RepositorioTomas,
    private readonly medicamentos: RepositorioMedicamentos,
    private readonly unidadDeTrabajo: UnidadDeTrabajo,
    private readonly eventos: EventosDeTeleasistencia,
    private readonly auditoria: Auditoria,
    private readonly reloj: Reloj,
    private readonly zonaHoraria: string,
    // Cuánto se espera después de la hora programada (decisión abierta; configurable).
    private readonly toleranciaMinutos: number,
  ) {}

  // Devuelve cuántas omitió.
  async ejecutar(): Promise<number> {
    const limite = new Date(
      this.reloj.ahora().getTime() - this.toleranciaMinutos * 60_000,
    );
    const vencidas = await this.tomas.listarVencidas(
      limite,
      this.zonaHoraria,
      TOMAS_POR_VUELTA,
    );
    let omitidas = 0;
    for (const id of vencidas) {
      try {
        if (await this.omitir(id)) omitidas += 1;
      } catch {
        // Una que falle no frena a las demás; queda pendiente y se reintenta en la vuelta siguiente.
      }
    }
    return omitidas;
  }

  private async omitir(id: TomaId): Promise<boolean> {
    const omitida = await this.unidadDeTrabajo.ejecutar(async () => {
      const toma = await this.tomas.buscarPorIdParaActualizar(id);
      // Entre la lista y aquí pudieron registrarla.
      if (toma?.estado !== 'pendiente') return null;
      // Un medicamento que ya se dejó de tomar no genera omisiones.
      const medicamento = await this.medicamentos.buscarPorId(
        toma.medicamentoId as MedicamentoId,
      );
      if (medicamento?.activo !== true) return null;
      toma.omitir();
      await this.tomas.actualizar(toma);
      await this.eventos.publicar(
        'teleasistencia.medicamento_omitido',
        {
          tomaId: toma.id,
          medicamentoId: toma.medicamentoId,
          adultoMayorId: toma.adultoMayorId,
        },
        this.reloj.ahora(),
      );
      return toma;
    });
    if (omitida === null) return false;
    await this.auditoria.registrar({
      actorId: null,
      accion: 'teleasistencia.omitir_toma',
      recursoTipo: 'toma',
      recursoId: omitida.id,
      resultado: 'permitido',
    });
    return true;
  }
}
