import { eq } from 'drizzle-orm';
import {
  ConflictoDeEstado,
  RecursoNoEncontrado,
} from '../../../../compartido/dominio/errores.js';
import type { ContextoTransaccional } from '../../../../compartido/infraestructura/base-de-datos/contexto-transaccional.js';
import { esViolacionDeUnicidad } from '../../../../compartido/infraestructura/base-de-datos/errores-de-postgres.js';
import type { RepositorioUsuarios } from '../../../aplicacion/puertos/salida/repositorio-usuarios.js';
import type { Correo } from '../../../dominio/correo.js';
import type { UsuarioId } from '../../../dominio/ids.js';
import type { Usuario } from '../../../dominio/usuario.js';
import { credenciales, usuarios } from './identidad.esquema.js';
import { usuarioDeFilas } from './mapeadores.js';

export class RepositorioUsuariosDrizzle implements RepositorioUsuarios {
  constructor(private readonly contexto: ContextoTransaccional) {}

  async guardar(usuario: Usuario): Promise<void> {
    try {
      // Dos tablas, una sola unidad: si la credencial falla, el usuario tampoco queda.
      await this.contexto.ejecutar(async () => {
        const bd = this.contexto.conexion();
        await bd.insert(usuarios).values({
          id: usuario.id,
          correo: usuario.correo.valor,
          nombre: usuario.nombre.valor,
          telefono: usuario.telefono?.valor ?? null,
          rol: usuario.rol,
          estado: usuario.estado,
          correoVerificadoEn: usuario.correoVerificadoEn,
          creadoEn: usuario.creadoEn,
          actualizadoEn: usuario.actualizadoEn,
        });
        await bd.insert(credenciales).values({
          usuarioId: usuario.id,
          hash: usuario.credencial.hash,
          intentosFallidos: usuario.credencial.intentosFallidos,
          bloqueadoHasta: usuario.credencial.bloqueadoHasta,
          actualizadoEn: usuario.credencial.actualizadoEn,
        });
      });
    } catch (error) {
      // Si ya había una transacción abierta, tras este error queda abortada: el caso de uso debe
      // dejar que se revierta, no seguir usándola.
      if (esViolacionDeUnicidad(error, 'usuarios_correo_unico')) {
        throw new ConflictoDeEstado(
          'Ese correo ya está registrado',
          'usuario.correo_ya_registrado',
        );
      }
      throw error;
    }
  }

  async actualizar(usuario: Usuario): Promise<void> {
    await this.contexto.ejecutar(async () => {
      const bd = this.contexto.conexion();
      const actualizados = await bd
        .update(usuarios)
        .set({
          nombre: usuario.nombre.valor,
          telefono: usuario.telefono?.valor ?? null,
          estado: usuario.estado,
          correoVerificadoEn: usuario.correoVerificadoEn,
          actualizadoEn: usuario.actualizadoEn,
        })
        .where(eq(usuarios.id, usuario.id))
        .returning({ id: usuarios.id });
      if (actualizados.length === 0) {
        throw new RecursoNoEncontrado(
          'El usuario no existe',
          'usuario.no_encontrado',
        );
      }
      await bd
        .update(credenciales)
        .set({
          hash: usuario.credencial.hash,
          intentosFallidos: usuario.credencial.intentosFallidos,
          bloqueadoHasta: usuario.credencial.bloqueadoHasta,
          actualizadoEn: usuario.credencial.actualizadoEn,
        })
        .where(eq(credenciales.usuarioId, usuario.id));
    });
  }

  buscarPorId(id: UsuarioId): Promise<Usuario | null> {
    return this.buscar(eq(usuarios.id, id), false);
  }

  buscarPorCorreo(correo: Correo): Promise<Usuario | null> {
    return this.buscar(eq(usuarios.correo, correo.valor), false);
  }

  buscarPorCorreoParaActualizar(correo: Correo): Promise<Usuario | null> {
    return this.buscar(eq(usuarios.correo, correo.valor), true);
  }

  private async buscar(
    condicion: ReturnType<typeof eq>,
    bloquear: boolean,
  ): Promise<Usuario | null> {
    const consulta = this.contexto
      .conexion()
      .select({ usuario: usuarios, credencial: credenciales })
      .from(usuarios)
      .innerJoin(credenciales, eq(credenciales.usuarioId, usuarios.id))
      .where(condicion)
      .limit(1);
    // NO KEY UPDATE bloquea la fila para otros inicios de sesión de la misma cuenta, pero no estorba
    // a quien inserte filas que apuntan al usuario (vínculos, consentimientos): esas piden un bloqueo
    // más débil (KEY SHARE) que no choca con este. No se usa `FOR UPDATE OF credenciales` porque
    // Drizzle escribe la tabla con su esquema («identidad.credenciales») y Postgres no lo acepta.
    const filas = await (bloquear ? consulta.for('no key update') : consulta);
    const fila = filas[0];
    return fila === undefined
      ? null
      : usuarioDeFilas(fila.usuario, fila.credencial);
  }
}
