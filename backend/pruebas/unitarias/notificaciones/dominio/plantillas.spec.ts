import {
  fechaLegible,
  renderizarAviso,
  TIPOS_DE_AVISO,
} from '../../../../src/notificaciones/dominio/plantillas.js';
import { PARAMETROS_DE_SERVICIO } from '../../../soporte/notificaciones.js';

const con = (extra: Record<string, string | number> = {}) => ({
  ...PARAMETROS_DE_SERVICIO,
  ...extra,
});

describe('fechaLegible', () => {
  it.each([
    ['2030-06-10', 'lunes 10 de junio'],
    ['2030-06-11', 'martes 11 de junio'],
    ['2026-10-21', 'miércoles 21 de octubre'],
    ['2028-02-29', 'martes 29 de febrero'],
    ['2026-12-31', 'jueves 31 de diciembre'],
    ['2027-01-01', 'viernes 1 de enero'],
  ])('%s → %s', (fecha, esperado) => {
    expect(fechaLegible(fecha)).toBe(esperado);
  });

  it('rechaza una fecha que no existe', () => {
    expect(() => fechaLegible('2030-02-30')).toThrow();
  });
});

describe('renderizarAviso', () => {
  it('hay una plantilla para cada parte de cada cambio del servicio', () => {
    expect([...TIPOS_DE_AVISO].sort()).toEqual([
      'alerta_generada:destinatario',
      'bolsa_comprada:familia',
      'compra_de_bolsa_fallida:familia',
      'cuidador_verificado:cuidador',
      'lectura_fuera_de_rango:destinatario',
      'medicamento_omitido:destinatario',
      'mensaje_nuevo:destinatario',
      'pago_reembolsado:familia',
      'pago_requerido:familia',
      'servicio_cancelado:cuidador',
      'servicio_cancelado:familia',
      'servicio_confirmado:cuidador',
      'servicio_confirmado:familia',
      'servicio_finalizado:cuidador',
      'servicio_finalizado:familia',
      'servicio_iniciado:cuidador',
      'servicio_iniciado:familia',
      'servicio_solicitado:cuidador',
      'servicio_solicitado:familia',
      'verificacion_rechazada:cuidador',
    ]);
  });

  it('el cuidador recibe la solicitud con el día, la franja y las horas', () => {
    expect(renderizarAviso('servicio_solicitado:cuidador', con())).toEqual({
      titulo: 'Nueva solicitud de servicio',
      cuerpo:
        'Tienes una solicitud para el martes 11 de junio, en la mañana, por 2 horas. Respóndela en Seniory antes de que venza el plazo.',
    });
  });

  it('la familia recibe la confirmación', () => {
    expect(renderizarAviso('servicio_confirmado:familia', con())).toEqual({
      titulo: 'Servicio confirmado',
      cuerpo:
        'Tu servicio del martes 11 de junio, en la mañana quedó confirmado.',
    });
  });

  it('dice «1 hora» en singular', () => {
    expect(
      renderizarAviso('servicio_solicitado:cuidador', con({ horas: 1 })).cuerpo,
    ).toContain('por 1 hora.');
  });

  describe('cancelaciones: cada parte y cada motivo tiene su texto', () => {
    it.each([
      ['familia', 'rechazada', 'El cuidador no pudo atender tu solicitud'],
      ['familia', 'expirada', 'Tu solicitud venció'],
      ['familia', 'cancelada_por_familia', 'Servicio cancelado'],
      ['cuidador', 'rechazada', 'Rechazaste una solicitud'],
      ['cuidador', 'expirada', 'Una solicitud venció'],
      ['cuidador', 'cancelada_por_familia', 'La familia canceló el servicio'],
      ['familia', 'pago_fallido', 'No se pudo cobrar tu servicio'],
      ['cuidador', 'pago_fallido', 'Se canceló un servicio'],
    ])('%s / %s → «%s»', (rol, motivo, titulo) => {
      const aviso = renderizarAviso(
        `servicio_cancelado:${rol}`,
        con({ motivo }),
      );

      expect(aviso.titulo).toBe(titulo);
      expect(aviso.cuerpo).toContain('martes 11 de junio');
    });

    it('a la familia le dice que elija a otro cuando no hubo servicio', () => {
      for (const motivo of ['rechazada', 'expirada']) {
        expect(
          renderizarAviso('servicio_cancelado:familia', con({ motivo })).cuerpo,
        ).toContain('Elige a otra persona en Seniory');
      }
    });
  });

  describe('minimización: ningún aviso lleva datos clínicos ni nombres (Ley 1581)', () => {
    const motivos = ['rechazada', 'expirada', 'cancelada_por_familia'];
    const todos = TIPOS_DE_AVISO.flatMap((tipo) =>
      motivos.map((motivo) =>
        renderizarAviso(tipo, con({ motivo, nombre: 'Doña Carmen' })),
      ),
    );

    it('ninguno menciona salud', () => {
      for (const { titulo, cuerpo } of todos) {
        expect(`${titulo} ${cuerpo}`).not.toMatch(
          /medicament|presi[oó]n|glucosa|pulso|signos|diagn[oó]stic|enfermedad|ca[ií]da/i,
        );
      }
    });

    it('son texto plano: sin HTML ni enlaces', () => {
      for (const { titulo, cuerpo } of todos) {
        expect(`${titulo} ${cuerpo}`).not.toMatch(/[<>]|https?:|www\./i);
      }
    });

    it('no incluyen el identificador del servicio ni otros datos internos', () => {
      for (const { titulo, cuerpo } of todos) {
        expect(`${titulo} ${cuerpo}`).not.toContain(
          String(PARAMETROS_DE_SERVICIO.servicioId),
        );
      }
    });

    it('un parámetro extra con datos sensibles no se cuela en el texto', () => {
      const aviso = renderizarAviso(
        'servicio_confirmado:familia',
        con({ diagnostico: 'hipertensión', nombre: 'Doña Carmen' }),
      );

      expect(`${aviso.titulo} ${aviso.cuerpo}`).not.toMatch(
        /hipertensi|Carmen/,
      );
    });
  });

  describe('entradas inválidas', () => {
    it('un tipo desconocido', () => {
      expect(() => renderizarAviso('inventado:familia', con())).toThrow(
        expect.objectContaining({ codigo: 'plantilla.desconocida' }) as Error,
      );
    });

    it.each([
      ['sin fecha', { fecha: undefined }],
      ['sin jornada', { jornada: undefined }],
    ])('rechaza un aviso %s', (_nombre, cambios) => {
      const parametros: Record<string, unknown> = { ...con(), ...cambios };
      delete parametros[Object.keys(cambios)[0] as string];

      expect(() =>
        renderizarAviso(
          'servicio_confirmado:familia',
          parametros as Record<string, string>,
        ),
      ).toThrow(
        expect.objectContaining({
          codigo: 'plantilla.parametro_faltante',
        }) as Error,
      );
    });

    it('rechaza una jornada inventada', () => {
      expect(() =>
        renderizarAviso(
          'servicio_confirmado:familia',
          con({ jornada: 'madrugada' }),
        ),
      ).toThrow(
        expect.objectContaining({
          codigo: 'plantilla.jornada_invalida',
        }) as Error,
      );
    });

    it('rechaza horas que no son un número cuando la plantilla las usa', () => {
      expect(() =>
        renderizarAviso('servicio_solicitado:cuidador', con({ horas: 'dos' })),
      ).toThrow(
        expect.objectContaining({
          codigo: 'plantilla.parametro_faltante',
        }) as Error,
      );
    });

    it('una cancelación sin motivo', () => {
      expect(() =>
        renderizarAviso('servicio_cancelado:familia', con()),
      ).toThrow(
        expect.objectContaining({
          codigo: 'plantilla.parametro_faltante',
        }) as Error,
      );
    });
  });
});

describe('avisos de Teleasistencia', () => {
  it('la alerta lleva el nombre de la persona (sin él no se sabría de quién es) y recuerda el 123', () => {
    expect(
      renderizarAviso('alerta_generada:destinatario', {
        alertaId: 'a-1',
        nombre: 'Doña Carmen',
      }),
    ).toEqual({
      titulo: 'Alerta de Doña Carmen',
      cuerpo:
        'Doña Carmen pidió ayuda desde Seniory. Abre la aplicación para ver los detalles. Si es una emergencia, llama al 123.',
    });
  });

  it('la alerta sin nombre no se arma', () => {
    expect(() =>
      renderizarAviso('alerta_generada:destinatario', { alertaId: 'a-1' }),
    ).toThrow(
      expect.objectContaining({
        codigo: 'plantilla.parametro_faltante',
      }) as Error,
    );
  });

  it.each([
    'medicamento_omitido:destinatario',
    'lectura_fuera_de_rango:destinatario',
  ])(
    '%s no dice qué medicamento ni qué lectura: solo manda a abrir Seniory',
    (tipo) => {
      const { titulo, cuerpo } = renderizarAviso(tipo, {});

      expect(`${titulo} ${cuerpo}`).toMatch(/Seniory/);
      expect(`${titulo} ${cuerpo}`).not.toMatch(
        /\d|mg|presi[oó]n|glucosa|pulso|az[uú]car|fuera de rango|alto|bajo/i,
      );
    },
  );
});
