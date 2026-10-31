import { and, eq, inArray } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import type { ContextoTransaccional } from '../../../../compartido/infraestructura/base-de-datos/contexto-transaccional.js';
import type { RepositorioMedicamentos } from '../../../aplicacion/puertos/salida/repositorios.js';
import type {
  Medicamento,
  MedicamentoId,
} from '../../../dominio/medicamento.js';
import { medicamentoDeFila } from './mapeadores.js';
import {
  horariosDeMedicamento,
  medicamentos,
} from './teleasistencia.esquema.js';

export class RepositorioMedicamentosDrizzle implements RepositorioMedicamentos {
  constructor(private readonly contexto: ContextoTransaccional) {}

  async guardar(medicamento: Medicamento): Promise<void> {
    // El medicamento y sus horarios son una sola unidad: o se guardan los dos o ninguno.
    await this.contexto.ejecutar(async () => {
      const bd = this.contexto.conexion();
      await bd.insert(medicamentos).values({
        id: medicamento.id,
        adultoMayorId: medicamento.adultoMayorId,
        nombre: medicamento.nombre,
        dosis: medicamento.dosis,
        indicaciones: medicamento.indicaciones,
        diasSemana: [...medicamento.diasDeLaSemana],
        vigenteDesde: medicamento.vigenteDesde.aTexto(),
        vigenteHasta: medicamento.vigenteHasta?.aTexto() ?? null,
        activo: medicamento.activo,
        creadoPor: medicamento.creadoPor,
        creadoEn: medicamento.creadoEn,
        actualizadoEn: medicamento.actualizadoEn,
      });
      await bd.insert(horariosDeMedicamento).values(
        medicamento.horarios.map((hora) => ({
          id: uuidv7(),
          medicamentoId: medicamento.id,
          hora,
        })),
      );
    });
  }

  async actualizar(medicamento: Medicamento): Promise<void> {
    await this.contexto
      .conexion()
      .update(medicamentos)
      .set({
        activo: medicamento.activo,
        actualizadoEn: medicamento.actualizadoEn,
      })
      .where(eq(medicamentos.id, medicamento.id));
  }

  async buscarPorId(id: MedicamentoId): Promise<Medicamento | null> {
    const filas = await this.contexto
      .conexion()
      .select()
      .from(medicamentos)
      .where(eq(medicamentos.id, id))
      .limit(1);
    const fila = filas[0];
    if (fila === undefined) return null;
    const horarios = await this.horariosDe([id]);
    return medicamentoDeFila(fila, horarios.get(id) ?? []);
  }

  async listarActivos(adultoMayorId: string): Promise<Medicamento[]> {
    const filas = await this.contexto
      .conexion()
      .select()
      .from(medicamentos)
      .where(
        and(
          eq(medicamentos.adultoMayorId, adultoMayorId),
          eq(medicamentos.activo, true),
        ),
      )
      .orderBy(medicamentos.nombre, medicamentos.id);
    const horarios = await this.horariosDe(
      filas.map((fila) => fila.id as MedicamentoId),
    );
    return filas.map((fila) =>
      medicamentoDeFila(fila, horarios.get(fila.id as MedicamentoId) ?? []),
    );
  }

  private async horariosDe(
    ids: readonly MedicamentoId[],
  ): Promise<Map<MedicamentoId, string[]>> {
    const porMedicamento = new Map<MedicamentoId, string[]>();
    if (ids.length === 0) return porMedicamento;
    const filas = await this.contexto
      .conexion()
      .select()
      .from(horariosDeMedicamento)
      .where(inArray(horariosDeMedicamento.medicamentoId, [...ids]));
    for (const fila of filas) {
      const id = fila.medicamentoId as MedicamentoId;
      porMedicamento.set(id, [...(porMedicamento.get(id) ?? []), fila.hora]);
    }
    return porMedicamento;
  }
}
