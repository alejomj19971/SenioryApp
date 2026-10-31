import type { Auditoria } from '../../../compartido/aplicacion/puertos/auditoria.js';
import type { GeneradorDeIds } from '../../../compartido/aplicacion/puertos/generador-de-ids.js';
import type { Reloj } from '../../../compartido/aplicacion/puertos/reloj.js';
import type { UnidadDeTrabajo } from '../../../compartido/aplicacion/puertos/unidad-de-trabajo.js';
import { RecursoNoEncontrado } from '../../../compartido/dominio/errores.js';
import { FechaCivil } from '../../../compartido/dominio/fecha-civil.js';
import { Medicamento, type MedicamentoId } from '../../dominio/medicamento.js';
import type {
  ActorDeTeleasistencia,
  PoliticaDeAcceso,
} from '../puertos/salida/politica-de-acceso.js';
import type {
  RepositorioMedicamentos,
  RepositorioTomas,
} from '../puertos/salida/repositorios.js';
import {
  vistaDeMedicamento,
  vistaDeToma,
  type VistaDeMedicamento,
  type VistaDeMedicamentoDelDia,
} from '../vistas.js';

export interface EntradaDeMedicamento {
  nombre: string;
  dosis: string;
  indicaciones?: string | null;
  // «HH:mm».
  horarios: string[];
  // 1 = lunes … 7 = domingo; si no viene, todos los días.
  diasDeLaSemana?: number[];
  // «AAAA-MM-DD»; si no viene, hoy.
  vigenteDesde?: string;
  vigenteHasta?: string | null;
}

// Agrega un medicamento al plan de una persona mayor. Solo la familia: un cuidador lee y registra, pero no cambia
// el plan. Genera ya las tomas de hoy para que aparezca de inmediato.
export class RegistrarMedicamento {
  constructor(
    private readonly politica: PoliticaDeAcceso,
    private readonly medicamentos: RepositorioMedicamentos,
    private readonly tomas: RepositorioTomas,
    private readonly unidadDeTrabajo: UnidadDeTrabajo,
    private readonly reloj: Reloj,
    private readonly ids: GeneradorDeIds,
    private readonly zonaHoraria: string,
  ) {}

  async ejecutar(
    actor: ActorDeTeleasistencia,
    adultoMayorId: string,
    entrada: EntradaDeMedicamento,
  ): Promise<VistaDeMedicamento> {
    await this.politica.exigir(
      actor,
      adultoMayorId,
      'administracion',
      'teleasistencia.registrar_medicamento',
    );
    const ahora = this.reloj.ahora();
    const hoy = FechaCivil.hoy(this.reloj, this.zonaHoraria);
    const medicamento = Medicamento.registrar({
      id: this.ids.nuevo<'Medicamento'>() as MedicamentoId,
      adultoMayorId,
      nombre: entrada.nombre,
      dosis: entrada.dosis,
      indicaciones: entrada.indicaciones ?? null,
      horarios: entrada.horarios,
      diasDeLaSemana: entrada.diasDeLaSemana,
      vigenteDesde:
        entrada.vigenteDesde === undefined
          ? hoy
          : FechaCivil.desdeTexto(entrada.vigenteDesde),
      vigenteHasta:
        entrada.vigenteHasta === undefined || entrada.vigenteHasta === null
          ? null
          : FechaCivil.desdeTexto(entrada.vigenteHasta),
      creadoPor: actor.usuarioId,
      ahora,
    });
    await this.unidadDeTrabajo.ejecutar(async () => {
      await this.medicamentos.guardar(medicamento);
      await this.tomas.generarDelDia(medicamento, hoy);
    });
    return vistaDeMedicamento(medicamento);
  }
}

// Deja de tomarse un medicamento. No se borra: las tomas ya registradas quedan en el historial.
export class DesactivarMedicamento {
  constructor(
    private readonly politica: PoliticaDeAcceso,
    private readonly medicamentos: RepositorioMedicamentos,
    private readonly auditoria: Auditoria,
    private readonly reloj: Reloj,
  ) {}

  async ejecutar(
    actor: ActorDeTeleasistencia,
    medicamentoId: string,
  ): Promise<void> {
    const medicamento = await this.medicamentos.buscarPorId(
      medicamentoId as MedicamentoId,
    );
    if (medicamento === null) {
      throw new RecursoNoEncontrado(
        'No encontramos ese medicamento',
        'medicamento.no_encontrado',
      );
    }
    await this.politica.exigir(
      actor,
      medicamento.adultoMayorId,
      'administracion',
      'teleasistencia.desactivar_medicamento',
    );
    medicamento.desactivar(this.reloj.ahora());
    await this.medicamentos.actualizar(medicamento);
    await this.auditoria.registrar({
      actorId: actor.usuarioId,
      accion: 'teleasistencia.medicamento_desactivado',
      recursoTipo: 'medicamento',
      recursoId: medicamento.id,
      resultado: 'permitido',
    });
  }
}

// Los medicamentos que se toman y sus tomas de un día. Para hoy, las tomas se generan al consultar si todavía no
// existen (idempotente), así el día siempre está completo aunque nadie haya abierto la pantalla antes.
export class ListarMedicamentosDelDia {
  constructor(
    private readonly politica: PoliticaDeAcceso,
    private readonly medicamentos: RepositorioMedicamentos,
    private readonly tomas: RepositorioTomas,
    private readonly reloj: Reloj,
    private readonly zonaHoraria: string,
  ) {}

  async ejecutar(
    actor: ActorDeTeleasistencia,
    adultoMayorId: string,
    fecha?: string,
  ): Promise<{ fecha: string; medicamentos: VistaDeMedicamentoDelDia[] }> {
    await this.politica.exigir(
      actor,
      adultoMayorId,
      'lectura',
      'teleasistencia.leer_medicamentos',
    );
    const hoy = FechaCivil.hoy(this.reloj, this.zonaHoraria);
    const dia = fecha === undefined ? hoy : FechaCivil.desdeTexto(fecha);
    const activos = await this.medicamentos.listarActivos(adultoMayorId);
    // Solo hoy se generan tomas: no se inventan las de días pasados ni se adelantan las de mañana.
    if (dia.igualA(hoy)) {
      for (const medicamento of activos) {
        await this.tomas.generarDelDia(medicamento, dia);
      }
    }
    const delDia = await this.tomas.listarDelDia(adultoMayorId, dia);
    return {
      fecha: dia.aTexto(),
      medicamentos: activos.map((m) => ({
        ...vistaDeMedicamento(m),
        tomas: delDia.filter((t) => t.medicamentoId === m.id).map(vistaDeToma),
      })),
    };
  }
}
