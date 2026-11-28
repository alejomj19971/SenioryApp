import { describe, expect, it, vi } from 'vitest';
import type { Auditoria } from '../../../../src/compartido/aplicacion/puertos/auditoria.js';
import type {
  CuidadorReactivado,
  CuidadorSuspendido,
} from '../../../../src/compartido/eventos/directorio.js';
import {
  ReactivarCuentaDeCuidador,
  SuspenderCuentaDeCuidador,
} from '../../../../src/identidad/aplicacion/manejadores/bloquear-cuenta-de-cuidador-suspendido.js';
import type { RepositorioSesiones } from '../../../../src/identidad/aplicacion/puertos/salida/repositorio-sesiones.js';
import type { RepositorioUsuarios } from '../../../../src/identidad/aplicacion/puertos/salida/repositorio-usuarios.js';
import { Correo } from '../../../../src/identidad/dominio/correo.js';
import { NombrePersona } from '../../../../src/identidad/dominio/nombre-persona.js';
import { Usuario } from '../../../../src/identidad/dominio/usuario.js';
import {
  AHORA,
  credencialDePrueba,
  idDePrueba,
  usuarioDePrueba,
} from '../../../soporte/identidad.js';

const CUIDADOR_ID = '0198aaaa-0000-7000-8000-0000000000c2';

function cuidadorUsuario(): Usuario {
  const id = idDePrueba<'Usuario'>();
  return Usuario.registrarCuidador({
    id,
    correo: Correo.crear(`${id}@prueba.invalid`),
    nombre: NombrePersona.crear('Rosario Montes'),
    credencial: credencialDePrueba(id, AHORA),
    ahora: AHORA,
  });
}

function entorno(usuario: Usuario | null) {
  const actualizar = vi.fn().mockResolvedValue(undefined);
  const revocarTodasDeUsuario = vi.fn().mockResolvedValue(1);
  const registrar = vi.fn().mockResolvedValue(undefined);
  const usuarios = {
    buscarPorIdParaActualizar: vi.fn().mockResolvedValue(usuario),
    actualizar,
  } as unknown as RepositorioUsuarios;
  const sesiones = { revocarTodasDeUsuario } as unknown as RepositorioSesiones;
  const auditoria = { registrar } as Auditoria;
  const reloj = { ahora: () => AHORA };
  return {
    suspender: new SuspenderCuentaDeCuidador(
      usuarios,
      sesiones,
      auditoria,
      reloj,
    ),
    reactivar: new ReactivarCuentaDeCuidador(usuarios, auditoria, reloj),
    actualizar,
    revocarTodasDeUsuario,
    registrar,
  };
}

const suspendido = (usuarioId: string | null): CuidadorSuspendido => ({
  id: 'evento-1',
  tipo: 'directorio.cuidador_suspendido',
  version: 1,
  ocurridoEn: AHORA.toISOString(),
  idDeCorrelacion: 'correlacion',
  datos: { cuidadorId: CUIDADOR_ID, usuarioId },
});

const reactivado = (usuarioId: string | null): CuidadorReactivado => ({
  id: 'evento-2',
  tipo: 'directorio.cuidador_reactivado',
  version: 1,
  ocurridoEn: AHORA.toISOString(),
  idDeCorrelacion: 'correlacion',
  datos: { cuidadorId: CUIDADOR_ID, usuarioId },
});

describe('SuspenderCuentaDeCuidador', () => {
  it('suspende la cuenta del cuidador, le cierra todas las sesiones y lo deja en la auditoría', async () => {
    const usuario = cuidadorUsuario();
    const { suspender, actualizar, revocarTodasDeUsuario, registrar } =
      entorno(usuario);

    await suspender.manejar(suspendido(usuario.id));

    expect(usuario.estado).toBe('suspendido');
    expect(usuario.puedeIniciarSesion(AHORA)).toBe(false);
    expect(actualizar).toHaveBeenCalledWith(usuario);
    expect(revocarTodasDeUsuario).toHaveBeenCalledWith(usuario.id, AHORA);
    expect(registrar).toHaveBeenCalledWith(
      expect.objectContaining({
        accion: 'identidad.suspender_cuenta',
        recursoId: usuario.id,
        resultado: 'permitido',
      }),
    );
  });

  it('un cuidador sin cuenta todavía (usuarioId null) no tiene nada que bloquear', async () => {
    const { suspender, actualizar, revocarTodasDeUsuario } =
      entorno(cuidadorUsuario());

    await suspender.manejar(suspendido(null));

    expect(actualizar).not.toHaveBeenCalled();
    expect(revocarTodasDeUsuario).not.toHaveBeenCalled();
  });

  it('NUNCA suspende una cuenta que no es de cuidador (un familiar o un administrador), aunque el aviso la nombre', async () => {
    const familiar = usuarioDePrueba();
    const { suspender, actualizar, revocarTodasDeUsuario } = entorno(familiar);

    await suspender.manejar(suspendido(familiar.id));

    expect(familiar.estado).toBe('activo');
    expect(actualizar).not.toHaveBeenCalled();
    expect(revocarTodasDeUsuario).not.toHaveBeenCalled();
  });

  it('es idempotente: si el aviso llega dos veces, la segunda no hace nada', async () => {
    const usuario = cuidadorUsuario();
    const { suspender, actualizar } = entorno(usuario);

    await suspender.manejar(suspendido(usuario.id));
    await suspender.manejar(suspendido(usuario.id));

    expect(actualizar).toHaveBeenCalledTimes(1);
  });

  it('una cuenta que no existe no rompe el aviso', async () => {
    const { suspender, actualizar } = entorno(null);

    await expect(
      suspender.manejar(suspendido(idDePrueba<'Usuario'>())),
    ).resolves.toBeUndefined();
    expect(actualizar).not.toHaveBeenCalled();
  });
});

describe('ReactivarCuentaDeCuidador', () => {
  it('reabre la cuenta suspendida del cuidador', async () => {
    const usuario = cuidadorUsuario();
    usuario.suspender(AHORA);
    const { reactivar, actualizar, registrar } = entorno(usuario);

    await reactivar.manejar(reactivado(usuario.id));

    expect(usuario.estado).toBe('activo');
    expect(usuario.puedeIniciarSesion(AHORA)).toBe(true);
    expect(actualizar).toHaveBeenCalledWith(usuario);
    expect(registrar).toHaveBeenCalledWith(
      expect.objectContaining({ accion: 'identidad.reactivar_cuenta' }),
    );
  });

  it('solo reabre una cuenta SUSPENDIDA: una activa no se toca', async () => {
    const usuario = cuidadorUsuario();
    const { reactivar, actualizar } = entorno(usuario);

    await reactivar.manejar(reactivado(usuario.id));

    expect(actualizar).not.toHaveBeenCalled();
  });

  it('nunca reabre una cuenta que no es de cuidador', async () => {
    const familiar = usuarioDePrueba();
    familiar.suspender(AHORA);
    const { reactivar, actualizar } = entorno(familiar);

    await reactivar.manejar(reactivado(familiar.id));

    expect(familiar.estado).toBe('suspendido');
    expect(actualizar).not.toHaveBeenCalled();
  });

  it('un cuidador sin cuenta (usuarioId null) no tiene nada que reabrir', async () => {
    const { reactivar, actualizar } = entorno(cuidadorUsuario());

    await reactivar.manejar(reactivado(null));

    expect(actualizar).not.toHaveBeenCalled();
  });
});
