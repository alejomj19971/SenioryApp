import {
  ConflictoDeEstado,
  ErrorDeValidacion,
  ReglaDeNegocioIncumplida,
} from '../../../../src/compartido/dominio/errores.js';
import { FechaCivil } from '../../../../src/compartido/dominio/fecha-civil.js';
import {
  DIAS_MAXIMOS_DE_ANTICIPACION,
  PLAZO_DE_ACEPTACION_HOY_MINUTOS,
  PLAZO_DE_ACEPTACION_MINUTOS,
  Servicio,
} from '../../../../src/reservas/dominio/servicio.js';
import {
  ADULTO_MAYOR_ID,
  AHORA_RESERVAS,
  CUIDADOR_ID,
  CUIDADOR_USUARIO_ID,
  datosParaSolicitar,
  FAMILIAR_ID,
  HOY_RESERVAS,
  servicioEn,
  servicioSolicitado,
  ZONA,
} from '../../../soporte/reservas.js';

const minutosDespues = (base: Date, minutos: number) =>
  new Date(base.getTime() + minutos * 60_000);

describe('Servicio.solicitar', () => {
  it('nace «solicitado», con el desglose congelado y el cuidador por responder', () => {
    const servicio = servicioSolicitado();

    expect(servicio).toMatchObject({
      estado: 'solicitado',
      familiarId: FAMILIAR_ID,
      adultoMayorId: ADULTO_MAYOR_ID,
      cuidadorId: CUIDADOR_ID,
      jornada: 'manana',
      horas: 2,
      medioDePago: 'pasarela',
      aceptacionAutomatica: false,
      tarifaHora: 20_000,
      subtotal: 40_000,
      cargoFamilia: 3_200,
      totalFamilia: 43_200,
      pagoProfesional: 36_000,
      politicaVersion: 1,
      version: 1,
      aceptadoEn: null,
      iniciadoEn: null,
      finalizadoEn: null,
      canceladoEn: null,
      motivoDeCancelacion: null,
    });
    expect(servicio.fecha.aTexto()).toBe('2026-10-22');
    expect(servicio.solicitadoEn).toEqual(AHORA_RESERVAS);
    expect(servicio.estaActivo()).toBe(true);
  });

  it('deja la primera fila del historial: la familia solicitó', () => {
    expect(servicioSolicitado().transicionesPendientes).toEqual([
      {
        desde: null,
        hacia: 'solicitado',
        accion: 'solicitar',
        actorId: FAMILIAR_ID,
        ocurridoEn: AHORA_RESERVAS,
      },
    ]);
  });

  describe('plazo para que el cuidador responda', () => {
    it('2 horas si el servicio es para otro día', () => {
      const servicio = servicioSolicitado();

      expect(servicio.solicitudExpiraEn).toEqual(
        minutosDespues(AHORA_RESERVAS, PLAZO_DE_ACEPTACION_MINUTOS),
      );
      expect(PLAZO_DE_ACEPTACION_MINUTOS).toBe(120);
    });

    it('30 minutos si el servicio es para hoy', () => {
      const servicio = servicioSolicitado({
        fecha: HOY_RESERVAS,
        jornada: 'tarde',
      });

      expect(servicio.solicitudExpiraEn).toEqual(
        minutosDespues(AHORA_RESERVAS, PLAZO_DE_ACEPTACION_HOY_MINUTOS),
      );
      expect(PLAZO_DE_ACEPTACION_HOY_MINUTOS).toBe(30);
    });
  });

  describe('aceptación automática', () => {
    it('si el cuidador la activó, el servicio nace aceptado y sin plazo', () => {
      const servicio = servicioSolicitado({ aceptacionAutomatica: true });

      expect(servicio).toMatchObject({
        estado: 'aceptado',
        aceptacionAutomatica: true,
        aceptadoEn: AHORA_RESERVAS,
        solicitudExpiraEn: null,
      });
    });

    it('deja dos filas en el historial: solicitó la familia y aceptó el sistema', () => {
      const filas = servicioSolicitado({
        aceptacionAutomatica: true,
      }).transicionesPendientes;

      expect(filas.map((f) => [f.desde, f.hacia, f.accion, f.actorId])).toEqual(
        [
          [null, 'solicitado', 'solicitar', FAMILIAR_ID],
          ['solicitado', 'aceptado', 'aceptar', null],
        ],
      );
    });
  });

  describe('la fecha (H2)', () => {
    it('hoy está permitido si la franja no terminó', () => {
      // Son las 10:00: la tarde y la noche de hoy se pueden pedir; la mañana está en curso.
      for (const jornada of ['manana', 'tarde', 'noche'] as const) {
        expect(() =>
          servicioSolicitado({ fecha: HOY_RESERVAS, jornada }),
        ).not.toThrow();
      }
    });

    it('a las 8 p. m. en Colombia, hoy solo queda la noche (aunque en UTC ya sea mañana)', () => {
      const ochoDeLaNoche = new Date('2026-10-22T01:00:00.000Z');
      const pedir = (jornada: 'manana' | 'tarde' | 'noche') =>
        servicioSolicitado({
          fecha: HOY_RESERVAS,
          jornada,
          ahora: ochoDeLaNoche,
        });

      expect(() => pedir('manana')).toThrow(
        expect.objectContaining({
          codigo: 'servicio.franja_terminada',
        }) as Error,
      );
      expect(() => pedir('tarde')).toThrow(
        expect.objectContaining({
          codigo: 'servicio.franja_terminada',
        }) as Error,
      );
      expect(() => pedir('noche')).not.toThrow();
    });

    it('«hoy» es el de Colombia: a las 8 p. m. del 21, el 22 es MAÑANA', () => {
      const ochoDeLaNoche = new Date('2026-10-22T01:00:00.000Z');
      const hoyEnColombia = FechaCivil.hoy(
        { ahora: () => ochoDeLaNoche },
        ZONA,
      );

      expect(hoyEnColombia.aTexto()).toBe('2026-10-21');
    });

    it('ayer se rechaza', () => {
      expect(() =>
        servicioSolicitado({ fecha: HOY_RESERVAS.sumarDias(-1) }),
      ).toThrow(
        expect.objectContaining({
          constructor: ReglaDeNegocioIncumplida,
          codigo: 'servicio.fecha_pasada',
        }) as Error,
      );
    });

    it(`hasta ${DIAS_MAXIMOS_DE_ANTICIPACION} días adelante, no más`, () => {
      expect(() =>
        servicioSolicitado({
          fecha: HOY_RESERVAS.sumarDias(DIAS_MAXIMOS_DE_ANTICIPACION),
        }),
      ).not.toThrow();
      expect(() =>
        servicioSolicitado({
          fecha: HOY_RESERVAS.sumarDias(DIAS_MAXIMOS_DE_ANTICIPACION + 1),
        }),
      ).toThrow(
        expect.objectContaining({
          codigo: 'servicio.fecha_muy_lejana',
        }) as Error,
      );
    });
  });

  describe('validaciones', () => {
    it.each([0, 9, -1, 1.5, Number.NaN])('rechaza %s horas', (horas) => {
      expect(() =>
        servicioSolicitado({
          horas,
          subtotal: 20_000 * horas,
          totalFamilia: 20_000 * horas,
        }),
      ).toThrow(
        expect.objectContaining({
          constructor: ErrorDeValidacion,
          codigo: 'servicio.horas_invalidas',
        }) as Error,
      );
    });

    it.each([1, 8])('acepta %s hora(s)', (horas) => {
      expect(() =>
        servicioSolicitado({
          horas,
          subtotal: 20_000 * horas,
          cargoFamilia: 0,
          totalFamilia: 20_000 * horas,
          pagoProfesional: 18_000 * horas,
        }),
      ).not.toThrow();
    });

    it('rechaza una jornada inventada', () => {
      expect(() =>
        servicioSolicitado({ jornada: 'madrugada' as 'manana' }),
      ).toThrow(
        expect.objectContaining({
          codigo: 'servicio.jornada_invalida',
        }) as Error,
      );
    });

    it('rechaza un medio de pago inventado', () => {
      expect(() =>
        servicioSolicitado({ medioDePago: 'efectivo' as 'pasarela' }),
      ).toThrow(
        expect.objectContaining({
          codigo: 'servicio.medio_de_pago_invalido',
        }) as Error,
      );
    });

    it.each([
      'corta',
      '',
      'con espacios no vale',
      'x'.repeat(101),
      'ñandú-ñandú',
    ])('rechaza la clave de idempotencia %j', (clave) => {
      expect(() => servicioSolicitado({ claveDeIdempotencia: clave })).toThrow(
        expect.objectContaining({ codigo: 'servicio.clave_invalida' }) as Error,
      );
    });

    it('acepta un UUID como clave', () => {
      expect(() =>
        servicioSolicitado({
          claveDeIdempotencia: '0198aaaa-0000-7000-8000-0000000000f1',
        }),
      ).not.toThrow();
    });

    it.each([
      ['subtotal que no es tarifa × horas', { subtotal: 41_000 }],
      ['total que no es subtotal + cargo', { totalFamilia: 50_000 }],
      ['pago al profesional mayor al subtotal', { pagoProfesional: 40_001 }],
      ['tarifa en cero', { tarifaHora: 0, subtotal: 0, totalFamilia: 3_200 }],
      ['monto negativo', { cargoFamilia: -1, totalFamilia: 39_999 }],
      [
        'monto con decimales',
        { cargoFamilia: 3_200.5, totalFamilia: 43_200.5 },
      ],
      ['política sin versión', { politicaVersion: 0 }],
    ])('rechaza un desglose con %s', (_nombre, cambios) => {
      expect(() => servicioSolicitado(cambios)).toThrow(
        expect.objectContaining({
          codigo: 'servicio.desglose_incoherente',
        }) as Error,
      );
    });
  });
});

describe('aceptar', () => {
  it('el cuidador acepta: queda aceptado, sin plazo y con su marca de tiempo', () => {
    const servicio = servicioSolicitado();
    const luego = minutosDespues(AHORA_RESERVAS, 10);

    servicio.aceptar(CUIDADOR_USUARIO_ID, luego);

    expect(servicio).toMatchObject({
      estado: 'aceptado',
      aceptadoEn: luego,
      solicitudExpiraEn: null,
      actualizadoEn: luego,
      version: 2,
    });
  });

  it('no puede aceptar si el plazo ya venció, aunque la tarea de expiración no haya corrido', () => {
    const servicio = servicioSolicitado();
    const tarde = minutosDespues(AHORA_RESERVAS, PLAZO_DE_ACEPTACION_MINUTOS);

    expect(() => servicio.aceptar(CUIDADOR_USUARIO_ID, tarde)).toThrow(
      expect.objectContaining({
        constructor: ConflictoDeEstado,
        codigo: 'servicio.solicitud_expirada',
      }) as Error,
    );
    expect(servicio.estado).toBe('solicitado');
  });

  it('un minuto antes del plazo todavía puede', () => {
    const servicio = servicioSolicitado();

    expect(() =>
      servicio.aceptar(
        CUIDADOR_USUARIO_ID,
        minutosDespues(AHORA_RESERVAS, PLAZO_DE_ACEPTACION_MINUTOS - 1),
      ),
    ).not.toThrow();
  });

  it('no se acepta dos veces', () => {
    const servicio = servicioEn('aceptado');

    expect(() => servicio.aceptar(CUIDADOR_USUARIO_ID, AHORA_RESERVAS)).toThrow(
      ConflictoDeEstado,
    );
  });
});

describe('rechazar', () => {
  it('cancela con motivo «rechazada» y deja quién fue', () => {
    const servicio = servicioSolicitado();

    servicio.rechazar(CUIDADOR_USUARIO_ID, AHORA_RESERVAS);

    expect(servicio).toMatchObject({
      estado: 'cancelado',
      motivoDeCancelacion: 'rechazada',
      canceladoPor: CUIDADOR_USUARIO_ID,
      canceladoEn: AHORA_RESERVAS,
      solicitudExpiraEn: null,
    });
    expect(servicio.estaActivo()).toBe(false);
  });

  it('un servicio ya aceptado no se rechaza: se cancela', () => {
    expect(() =>
      servicioEn('aceptado').rechazar(CUIDADOR_USUARIO_ID, AHORA_RESERVAS),
    ).toThrow(ConflictoDeEstado);
  });
});

describe('expirar', () => {
  it('con el plazo vencido, el sistema cancela con motivo «expirada»', () => {
    const servicio = servicioSolicitado();
    const vencido = minutosDespues(AHORA_RESERVAS, PLAZO_DE_ACEPTACION_MINUTOS);

    servicio.expirar(vencido);

    expect(servicio).toMatchObject({
      estado: 'cancelado',
      motivoDeCancelacion: 'expirada',
      canceladoPor: null,
      canceladoEn: vencido,
    });
    expect(servicio.transicionesPendientes.at(-1)).toMatchObject({
      accion: 'expirar',
      actorId: null,
    });
  });

  it('antes del plazo no expira', () => {
    const servicio = servicioSolicitado();

    expect(() => servicio.expirar(minutosDespues(AHORA_RESERVAS, 5))).toThrow(
      expect.objectContaining({
        codigo: 'servicio.solicitud_vigente',
      }) as Error,
    );
    expect(servicio.estado).toBe('solicitado');
  });

  it('un servicio aceptado no expira', () => {
    expect(() =>
      servicioEn('aceptado').expirar(minutosDespues(AHORA_RESERVAS, 500)),
    ).toThrow(ConflictoDeEstado);
  });
});

describe('cancelar', () => {
  it.each(['solicitado', 'aceptado'] as const)(
    'la familia cancela un servicio %s',
    (estado) => {
      const servicio = servicioEn(estado);

      servicio.cancelar(FAMILIAR_ID, AHORA_RESERVAS);

      expect(servicio).toMatchObject({
        estado: 'cancelado',
        motivoDeCancelacion: 'cancelada_por_familia',
        canceladoPor: FAMILIAR_ID,
      });
    },
  );

  it.each(['en_curso', 'finalizado', 'cancelado'] as const)(
    'un servicio %s ya no se puede cancelar',
    (estado) => {
      expect(() =>
        servicioEn(estado).cancelar(FAMILIAR_ID, AHORA_RESERVAS),
      ).toThrow(ConflictoDeEstado);
    },
  );
});

describe('iniciar', () => {
  const servicioAceptado = () =>
    servicioEn('aceptado', { fecha: HOY_RESERVAS, jornada: 'tarde' });

  it('dentro de la franja, el cuidador inicia', () => {
    const servicio = servicioAceptado();
    const enLaTarde = new Date('2026-10-21T14:00:00-05:00');

    servicio.iniciar(CUIDADOR_USUARIO_ID, enLaTarde, ZONA);

    expect(servicio).toMatchObject({
      estado: 'en_curso',
      iniciadoEn: enLaTarde,
    });
  });

  it('puede marcar hasta 30 minutos antes de que empiece', () => {
    const treintaAntes = new Date('2026-10-21T11:30:00-05:00');
    const veintinueveAntes = new Date('2026-10-21T11:29:00-05:00');

    expect(() =>
      servicioAceptado().iniciar(CUIDADOR_USUARIO_ID, treintaAntes, ZONA),
    ).not.toThrow();
    expect(() =>
      servicioAceptado().iniciar(CUIDADOR_USUARIO_ID, veintinueveAntes, ZONA),
    ).toThrow(
      expect.objectContaining({
        constructor: ReglaDeNegocioIncumplida,
        codigo: 'servicio.fuera_de_la_franja',
      }) as Error,
    );
  });

  it('después de que terminó la franja ya no', () => {
    expect(() =>
      servicioAceptado().iniciar(
        CUIDADOR_USUARIO_ID,
        new Date('2026-10-21T18:00:00-05:00'),
        ZONA,
      ),
    ).toThrow(
      expect.objectContaining({
        codigo: 'servicio.fuera_de_la_franja',
      }) as Error,
    );
  });

  it('un servicio de mañana no se inicia hoy', () => {
    expect(() =>
      servicioEn('aceptado').iniciar(CUIDADOR_USUARIO_ID, AHORA_RESERVAS, ZONA),
    ).toThrow(ReglaDeNegocioIncumplida);
  });

  it('un servicio sin aceptar no se inicia', () => {
    expect(() =>
      servicioSolicitado({ fecha: HOY_RESERVAS, jornada: 'manana' }).iniciar(
        CUIDADOR_USUARIO_ID,
        AHORA_RESERVAS,
        ZONA,
      ),
    ).toThrow(ConflictoDeEstado);
  });
});

describe('finalizar', () => {
  it('el cuidador finaliza un servicio en curso', () => {
    const servicio = servicioEn('en_curso');
    const luego = minutosDespues(AHORA_RESERVAS, 90);

    servicio.finalizar(CUIDADOR_USUARIO_ID, luego);

    expect(servicio).toMatchObject({
      estado: 'finalizado',
      finalizadoEn: luego,
    });
    expect(servicio.estaActivo()).toBe(false);
  });

  it.each(['solicitado', 'aceptado', 'finalizado', 'cancelado'] as const)(
    'un servicio %s no se finaliza',
    (estado) => {
      expect(() =>
        servicioEn(estado).finalizar(CUIDADOR_USUARIO_ID, AHORA_RESERVAS),
      ).toThrow(ConflictoDeEstado);
    },
  );
});

describe('historial y versión', () => {
  it('el recorrido completo deja una fila por transición, en orden', () => {
    const servicio = servicioEn('finalizado');

    expect(
      servicio.transicionesPendientes.map(
        (t) => `${t.desde ?? '-'}>${t.hacia}`,
      ),
    ).toEqual([
      '->solicitado',
      'solicitado>aceptado',
      'aceptado>en_curso',
      'en_curso>finalizado',
    ]);
    expect(servicio.version).toBe(4);
  });

  it('una acción rechazada no deja rastro ni sube la versión', () => {
    const servicio = servicioSolicitado();
    const filasAntes = servicio.transicionesPendientes.length;

    expect(() =>
      servicio.finalizar(CUIDADOR_USUARIO_ID, AHORA_RESERVAS),
    ).toThrow();

    expect(servicio.transicionesPendientes).toHaveLength(filasAntes);
    expect(servicio.version).toBe(1);
    expect(servicio.estado).toBe('solicitado');
  });

  it('un servicio leído de la base recuerda con qué versión se leyó', () => {
    const original = servicioSolicitado();
    const leido = Servicio.reconstruir({
      id: original.id,
      familiarId: original.familiarId,
      adultoMayorId: original.adultoMayorId,
      cuidadorId: original.cuidadorId,
      fecha: original.fecha,
      jornada: original.jornada,
      horas: original.horas,
      estado: original.estado,
      medioDePago: original.medioDePago,
      pagadoEn: original.pagadoEn,
      aceptacionAutomatica: original.aceptacionAutomatica,
      solicitudExpiraEn: original.solicitudExpiraEn,
      tarifaHora: original.tarifaHora,
      subtotal: original.subtotal,
      cargoFamilia: original.cargoFamilia,
      totalFamilia: original.totalFamilia,
      pagoProfesional: original.pagoProfesional,
      politicaVersion: original.politicaVersion,
      claveDeIdempotencia: original.claveDeIdempotencia,
      solicitadoEn: original.solicitadoEn,
      aceptadoEn: null,
      iniciadoEn: null,
      finalizadoEn: null,
      canceladoEn: null,
      canceladoPor: null,
      motivoDeCancelacion: null,
      version: 7,
      creadoEn: original.creadoEn,
      actualizadoEn: original.actualizadoEn,
    });

    leido.aceptar(CUIDADOR_USUARIO_ID, AHORA_RESERVAS);

    expect(leido.versionLeida).toBe(7);
    expect(leido.version).toBe(8);
    expect(original.versionLeida).toBe(0);
    expect(leido.transicionesPendientes).toHaveLength(1);
  });
});

describe('estaEnTurno (H4)', () => {
  const hoyManana = () =>
    datosParaSolicitar({ fecha: HOY_RESERVAS, jornada: 'manana' });

  it('aceptado o en curso, y la franja contiene el momento actual', () => {
    const aceptado = servicioEn('aceptado', hoyManana());
    const enCurso = servicioEn('en_curso', hoyManana());

    expect(aceptado.estaEnTurno(AHORA_RESERVAS, ZONA)).toBe(true);
    expect(enCurso.estaEnTurno(AHORA_RESERVAS, ZONA)).toBe(true);
  });

  it('fuera de la franja, no', () => {
    const aceptado = servicioEn('aceptado', hoyManana());

    expect(
      aceptado.estaEnTurno(new Date('2026-10-21T13:00:00-05:00'), ZONA),
    ).toBe(false);
  });

  it.each(['solicitado', 'finalizado', 'cancelado'] as const)(
    'un servicio %s no está en turno aunque sea su franja',
    (estado) => {
      const servicio = servicioEn(estado, hoyManana());

      expect(servicio.estaEnTurno(AHORA_RESERVAS, ZONA)).toBe(false);
    },
  );
});

describe('horasDeAnticipacion', () => {
  it('cuenta horas enteras hasta el inicio de la franja', () => {
    // Mañana a las 06:00; ahora son las 10:00 de hoy: faltan 20 horas.
    expect(servicioSolicitado().horasDeAnticipacion(AHORA_RESERVAS, ZONA)).toBe(
      20,
    );
  });

  it('redondea hacia abajo', () => {
    const servicio = servicioSolicitado({
      fecha: HOY_RESERVAS,
      jornada: 'tarde',
    });

    expect(
      servicio.horasDeAnticipacion(new Date('2026-10-21T10:30:00-05:00'), ZONA),
    ).toBe(1);
  });

  it('nunca es negativa: una franja que ya empezó tiene cero horas', () => {
    const servicio = servicioSolicitado({
      fecha: HOY_RESERVAS,
      jornada: 'manana',
    });

    expect(servicio.horasDeAnticipacion(AHORA_RESERVAS, ZONA)).toBe(0);
  });
});

describe('el pago del servicio (M7)', () => {
  describe('registrarPago', () => {
    it('anota cuándo se aprobó el pago y sube la versión, sin cambiar el estado', () => {
      const servicio = servicioEn('aceptado');
      const version = servicio.version;
      const momento = minutosDespues(AHORA_RESERVAS, 5);

      expect(servicio.registrarPago(momento)).toBe(true);

      expect(servicio.pagadoEn).toEqual(momento);
      expect(servicio.estado).toBe('aceptado');
      expect(servicio.version).toBe(version + 1);
      expect(servicio.actualizadoEn).toEqual(momento);
    });

    it('no deja rastro en el historial: no es una transición', () => {
      const servicio = servicioEn('aceptado');
      const filas = servicio.transicionesPendientes.length;

      servicio.registrarPago(AHORA_RESERVAS);

      expect(servicio.transicionesPendientes).toHaveLength(filas);
    });

    it('anotarlo otra vez no cambia nada', () => {
      const servicio = servicioEn('aceptado');
      servicio.registrarPago(AHORA_RESERVAS);
      const version = servicio.version;

      expect(servicio.registrarPago(minutosDespues(AHORA_RESERVAS, 9))).toBe(
        false,
      );

      expect(servicio.pagadoEn).toEqual(AHORA_RESERVAS);
      expect(servicio.version).toBe(version);
    });

    it('un servicio cancelado no se marca como pagado: el dinero se devuelve por otro camino', () => {
      const servicio = servicioEn('cancelado');

      expect(servicio.registrarPago(AHORA_RESERVAS)).toBe(false);

      expect(servicio.pagadoEn).toBeNull();
    });

    it('un servicio nuevo no está pagado', () => {
      expect(servicioSolicitado().pagadoEn).toBeNull();
    });
  });

  describe('iniciar exigiendo el pago', () => {
    const iniciarCon = (servicio: Servicio, exigirPago: boolean) =>
      servicio.iniciar(CUIDADOR_USUARIO_ID, AHORA_RESERVAS, ZONA, exigirPago);

    it('sin el pago aprobado, no inicia', () => {
      const servicio = servicioEn('aceptado', {
        fecha: HOY_RESERVAS,
        jornada: 'manana',
      });

      expect(() => iniciarCon(servicio, true)).toThrow(
        expect.objectContaining({
          constructor: ReglaDeNegocioIncumplida,
          codigo: 'servicio.pago_pendiente',
        }) as Error,
      );
      expect(servicio.estado).toBe('aceptado');
      expect(servicio.version).toBe(2);
    });

    it('con el pago aprobado, inicia', () => {
      const servicio = servicioEn('aceptado', {
        fecha: HOY_RESERVAS,
        jornada: 'manana',
      });
      servicio.registrarPago(AHORA_RESERVAS);

      iniciarCon(servicio, true);

      expect(servicio.estado).toBe('en_curso');
    });

    it('si no se exige el pago (desarrollo), inicia sin él', () => {
      const servicio = servicioEn('aceptado', {
        fecha: HOY_RESERVAS,
        jornada: 'manana',
      });

      iniciarCon(servicio, false);

      expect(servicio.estado).toBe('en_curso');
    });

    it('por omisión no exige el pago', () => {
      const servicio = servicioEn('aceptado', {
        fecha: HOY_RESERVAS,
        jornada: 'manana',
      });

      servicio.iniciar(CUIDADOR_USUARIO_ID, AHORA_RESERVAS, ZONA);

      expect(servicio.estado).toBe('en_curso');
    });

    it('la franja se comprueba antes que el pago', () => {
      const servicio = servicioEn('aceptado');

      expect(() => iniciarCon(servicio, true)).toThrow(
        expect.objectContaining({
          codigo: 'servicio.fuera_de_la_franja',
        }) as Error,
      );
    });
  });

  describe('cancelarPorPago', () => {
    it('cancela un servicio aceptado con motivo «pago_fallido», sin actor', () => {
      const servicio = servicioEn('aceptado');
      const momento = minutosDespues(AHORA_RESERVAS, 40);

      servicio.cancelarPorPago(momento);

      expect(servicio).toMatchObject({
        estado: 'cancelado',
        motivoDeCancelacion: 'pago_fallido',
        canceladoPor: null,
        canceladoEn: momento,
        solicitudExpiraEn: null,
      });
      expect(servicio.transicionesPendientes.at(-1)).toEqual({
        desde: 'aceptado',
        hacia: 'cancelado',
        accion: 'cancelar_por_pago',
        actorId: null,
        ocurridoEn: momento,
      });
    });

    it.each(['solicitado', 'en_curso', 'finalizado', 'cancelado'] as const)(
      'un servicio %s no se cancela por pago',
      (estado) => {
        const servicio = servicioEn(estado);
        const version = servicio.version;

        expect(() => servicio.cancelarPorPago(AHORA_RESERVAS)).toThrow(
          ConflictoDeEstado,
        );

        expect(servicio.estado).toBe(estado);
        expect(servicio.version).toBe(version);
      },
    );
  });
});
