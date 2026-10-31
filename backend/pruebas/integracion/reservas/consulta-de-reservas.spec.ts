import type { ConsultaDeDirectorio } from '../../../src/directorio/aplicacion/puertos/entrada/consulta-de-directorio.js';
import { ConsultaDeReservasServicio } from '../../../src/reservas/aplicacion/servicios/consulta-de-reservas-servicio.js';
import { nuevoId } from '../../soporte/bd.js';
import { RelojFalso } from '../../soporte/dobles.js';
import {
  CUIDADOR_USUARIO_ID,
  FAMILIAR_ID,
  HOY_RESERVAS,
  servicioEn,
  ZONA,
} from '../../soporte/reservas.js';
import {
  montarRepositoriosDeReservas,
  personasNuevas,
} from '../../soporte/repositorios-reservas.js';
import type { DatosParaSolicitar } from '../../../src/reservas/dominio/servicio.js';
import type { EstadoDeServicio } from '../../../src/reservas/dominio/valores-cerrados.js';

// Lo que Reservas ofrece a Teleasistencia, Mensajería, Pagos y Notificaciones (E13), contra Postgres real.
describe('ConsultaDeReservasServicio', () => {
  const repos = montarRepositoriosDeReservas();
  // 10:00 en Bogotá del 21 de octubre de 2026.
  const reloj = new RelojFalso('2026-10-21T15:00:00.000Z');
  let usuarioDelCuidador: string | null = CUIDADOR_USUARIO_ID;
  const directorio: ConsultaDeDirectorio = {
    obtenerCuidadorParaContratar: () => Promise.resolve(null),
    obtenerContactoDeCuidador: (cuidadorId) =>
      Promise.resolve({
        cuidadorId,
        usuarioId: usuarioDelCuidador,
        nombre: 'Marta',
        telefono: '+573001234567',
        fotoUrl: null,
        especialidad: 'enfermeria',
      }),
    obtenerCuidadorPorUsuario: () => Promise.resolve(null),
  };
  const consulta = new ConsultaDeReservasServicio(
    repos.servicios,
    directorio,
    reloj,
    ZONA,
  );

  afterAll(async () => {
    await repos.pool.end();
  });

  beforeEach(() => {
    reloj.fijar('2026-10-21T15:00:00.000Z');
    usuarioDelCuidador = CUIDADOR_USUARIO_ID;
  });

  // Un servicio guardado en el estado pedido, con personas propias.
  async function guardar(
    estado: EstadoDeServicio,
    cambios: Partial<DatosParaSolicitar> = {},
    momento: Date = reloj.ahora(),
  ) {
    const servicio = servicioEn(
      estado,
      { ...personasNuevas(), ...cambios },
      momento,
    );
    // Un servicio construido por varias transiciones se guarda ya en su estado final, con su historial completo.
    await repos.servicios.guardar(servicio);
    return servicio;
  }

  describe('obtenerServicio', () => {
    it('devuelve un resumen con IDs y datos mínimos', async () => {
      const servicio = await guardar('solicitado', {
        horas: 3,
        subtotal: 60_000,
        cargoFamilia: 4_800,
        totalFamilia: 64_800,
        pagoProfesional: 54_000,
      });

      expect(await consulta.obtenerServicio(servicio.id)).toEqual({
        id: servicio.id,
        familiarId: servicio.familiarId,
        adultoMayorId: servicio.adultoMayorId,
        cuidadorId: servicio.cuidadorId,
        estado: 'solicitado',
        fecha: servicio.fecha.aTexto(),
        jornada: 'manana',
        horas: 3,
      });
    });

    it('no entrega dinero ni datos personales', async () => {
      const servicio = await guardar('solicitado');

      const texto = JSON.stringify(await consulta.obtenerServicio(servicio.id));

      expect(texto).not.toMatch(/total|pago|tarifa|subtotal|cargo|telefono/i);
    });

    it('un servicio que no existe devuelve null', async () => {
      expect(await consulta.obtenerServicio(nuevoId())).toBeNull();
    });
  });

  describe('cuidadorTieneServicioActivo', () => {
    // Hoy 10:00: la mañana de hoy está en curso.
    const hoyManana: Partial<DatosParaSolicitar> = {
      fecha: HOY_RESERVAS,
      jornada: 'manana',
    };

    it('un servicio en curso, sí', async () => {
      const s = await guardar('en_curso', hoyManana);

      expect(
        await consulta.cuidadorTieneServicioActivo(
          s.cuidadorId,
          s.adultoMayorId,
        ),
      ).toBe(true);
    });

    it('uno aceptado cuya franja es ahora, sí', async () => {
      const s = await guardar('aceptado', hoyManana);

      expect(
        await consulta.cuidadorTieneServicioActivo(
          s.cuidadorId,
          s.adultoMayorId,
        ),
      ).toBe(true);
    });

    it('uno aceptado de otra franja de hoy, no', async () => {
      const s = await guardar('aceptado', {
        fecha: HOY_RESERVAS,
        jornada: 'tarde',
      });

      expect(
        await consulta.cuidadorTieneServicioActivo(
          s.cuidadorId,
          s.adultoMayorId,
        ),
      ).toBe(false);
    });

    it('uno aceptado para mañana, no', async () => {
      const s = await guardar('aceptado');

      expect(
        await consulta.cuidadorTieneServicioActivo(
          s.cuidadorId,
          s.adultoMayorId,
        ),
      ).toBe(false);
    });

    it.each(['solicitado', 'finalizado', 'cancelado'] as const)(
      'uno %s, no: terminar o cancelar corta el acceso de inmediato',
      async (estado) => {
        const s = await guardar(estado, hoyManana);

        expect(
          await consulta.cuidadorTieneServicioActivo(
            s.cuidadorId,
            s.adultoMayorId,
          ),
        ).toBe(false);
      },
    );

    it('otro cuidador con la misma persona mayor, no', async () => {
      const s = await guardar('en_curso', hoyManana);

      expect(
        await consulta.cuidadorTieneServicioActivo(nuevoId(), s.adultoMayorId),
      ).toBe(false);
    });

    it('el mismo cuidador con otra persona mayor, no', async () => {
      const s = await guardar('en_curso', hoyManana);

      expect(
        await consulta.cuidadorTieneServicioActivo(s.cuidadorId, nuevoId()),
      ).toBe(false);
    });

    it('la noche de ayer sigue activa de madrugada, hasta las 06:00', async () => {
      const ayer = HOY_RESERVAS.sumarDias(-1);
      reloj.fijar('2026-10-20T20:00:00.000Z'); // 15:00 del 20: aún se puede aceptar
      const s = await guardar('aceptado', {
        fecha: ayer,
        jornada: 'noche',
        hoy: ayer, // se pidió "hoy" (el 20) para esa noche
        ahora: reloj.ahora(),
      });

      reloj.fijar('2026-10-21T08:00:00.000Z'); // 03:00 del 21
      const madrugada = await consulta.cuidadorTieneServicioActivo(
        s.cuidadorId,
        s.adultoMayorId,
      );
      reloj.fijar('2026-10-21T11:30:00.000Z'); // 06:30 del 21
      const despues = await consulta.cuidadorTieneServicioActivo(
        s.cuidadorId,
        s.adultoMayorId,
      );

      expect(madrugada).toBe(true);
      expect(despues).toBe(false);
    });
  });

  describe('obtenerParticipantes', () => {
    it('devuelve quiénes pueden hablar en el chat del servicio', async () => {
      const s = await guardar('solicitado', { familiarId: FAMILIAR_ID });

      expect(await consulta.obtenerParticipantes(s.id)).toEqual({
        servicioId: s.id,
        familiarId: FAMILIAR_ID,
        cuidadorId: s.cuidadorId,
        cuidadorUsuarioId: CUIDADOR_USUARIO_ID,
      });
    });

    it('si el cuidador no tiene cuenta, su usuario es null', async () => {
      usuarioDelCuidador = null;
      const s = await guardar('solicitado');

      expect(
        (await consulta.obtenerParticipantes(s.id))?.cuidadorUsuarioId,
      ).toBeNull();
    });

    it('un servicio que no existe devuelve null', async () => {
      expect(await consulta.obtenerParticipantes(nuevoId())).toBeNull();
    });
  });
});
