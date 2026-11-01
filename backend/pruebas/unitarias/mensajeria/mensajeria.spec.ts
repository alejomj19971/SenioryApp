import { firstValueFrom, toArray } from 'rxjs';
import { ReglaDeNegocioIncumplida } from '../../../src/compartido/dominio/errores.js';
import { ConexionesDeFlujos } from '../../../src/compartido/infraestructura/sse/conexiones-de-flujos.js';
import type { MensajeEnviado } from '../../../src/compartido/eventos/mensajeria.js';
import { AvisarMensajeNuevo } from '../../../src/notificaciones/aplicacion/manejadores/avisar-de-mensajes.js';
import { CrearAvisos } from '../../../src/notificaciones/aplicacion/casos-de-uso/crear-avisos.js';
import { DespertarFlujosAlEnviar } from '../../../src/mensajeria/aplicacion/manejadores/despertar-flujos.js';
import type { ObtenerMensajesNuevos } from '../../../src/mensajeria/aplicacion/casos-de-uso/mensajes.js';
import { Conversacion } from '../../../src/mensajeria/dominio/conversacion.js';
import {
  codificarCursor,
  decodificarCursor,
  esPosterior,
  limiteDe,
} from '../../../src/mensajeria/dominio/cursor-de-mensajes.js';
import type {
  ConversacionId,
  MensajeId,
} from '../../../src/mensajeria/dominio/ids.js';
import {
  Mensaje,
  normalizarTexto,
} from '../../../src/mensajeria/dominio/mensaje.js';
import { ConcentradorDeFlujos } from '../../../src/mensajeria/infraestructura/entrada/sse/concentrador-de-flujos.js';
import { FlujoDeMensajes } from '../../../src/mensajeria/infraestructura/entrada/sse/flujo-de-mensajes.js';
import { GeneradorDeIdsSecuencial, RelojFalso } from '../../soporte/dobles.js';
import { RepositorioNotificacionesEnMemoria } from '../../soporte/notificaciones.js';
import { idDePrueba } from '../../soporte/identidad.js';

const AHORA = new Date('2030-06-10T15:00:00.000Z');
const UUID = '0198aaaa-0000-7000-8000-0000000000a1';

const mensaje = (cambios: Partial<Parameters<typeof Mensaje.crear>[0]> = {}) =>
  Mensaje.crear({
    id: idDePrueba<'Mensaje'>() as MensajeId,
    conversacionId: idDePrueba<'Conversacion'>() as ConversacionId,
    autorId: idDePrueba<'Usuario'>(),
    autorRol: 'familiar',
    texto: 'Hola',
    idDeCliente: UUID,
    creadoEn: AHORA,
    ...cambios,
  });

describe('normalizarTexto', () => {
  it('recorta y uniformiza los saltos de línea', () => {
    expect(normalizarTexto('  a\r\nb\rc  ')).toBe('a\nb\nc');
  });

  it('acepta tabulador y salto de línea, pero no otros caracteres de control', () => {
    expect(normalizarTexto('a\tb\nc')).toBe('a\tb\nc');
    for (const control of ['\u0000', '\u0007', '\u001b', '\u007f']) {
      expect(() => normalizarTexto(`a${control}b`)).toThrow(
        expect.objectContaining({ codigo: 'mensaje.texto_invalido' }) as Error,
      );
    }
  });

  it('no acepta lo que no es texto', () => {
    for (const valor of [5, null, undefined, {}, ['a']]) {
      expect(() => normalizarTexto(valor)).toThrow(
        expect.objectContaining({ codigo: 'mensaje.texto_invalido' }) as Error,
      );
    }
  });

  it('los límites son 1 y 1000 caracteres, y un emoji cuenta uno', () => {
    expect(normalizarTexto('a'.repeat(1000))).toHaveLength(1000);
    expect(Array.from(normalizarTexto('😀'.repeat(1000)))).toHaveLength(1000);
    expect(() => normalizarTexto('a'.repeat(1001))).toThrow(
      expect.objectContaining({ codigo: 'mensaje.muy_largo' }) as Error,
    );
    expect(() => normalizarTexto(' \n ')).toThrow(
      expect.objectContaining({ codigo: 'mensaje.vacio' }) as Error,
    );
  });
});

describe('Mensaje', () => {
  it('guarda el texto normalizado y el id de cliente en minúsculas', () => {
    const creado = mensaje({
      texto: '  Hola  ',
      idDeCliente: UUID.toUpperCase(),
    });

    expect(creado).toMatchObject({ texto: 'Hola', idDeCliente: UUID });
  });

  it.each(['abc', '', '12345678-1234-1234-1234-123456789012x'])(
    'rechaza el id de cliente «%s»',
    (idDeCliente) => {
      expect(() => mensaje({ idDeCliente })).toThrow(
        expect.objectContaining({
          codigo: 'mensaje.id_de_cliente_invalido',
        }) as Error,
      );
    },
  );

  it('rechaza un autor que no es familia ni cuidador', () => {
    expect(() => mensaje({ autorRol: 'administrador' as never })).toThrow(
      expect.objectContaining({ codigo: 'mensaje.autor_invalido' }) as Error,
    );
  });

  it('reconstruir no revalida: el texto ya se validó al guardarse', () => {
    const leido = Mensaje.reconstruir({
      id: idDePrueba<'Mensaje'>() as MensajeId,
      conversacionId: idDePrueba<'Conversacion'>() as ConversacionId,
      autorId: 'a',
      autorRol: 'cuidador',
      texto: '  tal cual  ',
      idDeCliente: UUID,
      creadoEn: AHORA,
    });

    expect(leido.texto).toBe('  tal cual  ');
  });
});

describe('Conversacion', () => {
  const abierta = Conversacion.abrir({
    id: idDePrueba<'Conversacion'>() as ConversacionId,
    familiarId: 'familia-1',
    cuidadorId: 'cuidador-1',
    ahora: AHORA,
  });

  it('nace sin mensajes', () => {
    expect(abierta).toMatchObject({
      familiarId: 'familia-1',
      cuidadorId: 'cuidador-1',
      creadaEn: AHORA,
      ultimoMensajeEn: null,
    });
  });

  it('solo sus dos partes son de ella, cada una en su calidad', () => {
    expect(abierta.esDe('familiar', 'familia-1')).toBe(true);
    expect(abierta.esDe('cuidador', 'cuidador-1')).toBe(true);
    // El id de uno no sirve en la calidad del otro.
    expect(abierta.esDe('familiar', 'cuidador-1')).toBe(false);
    expect(abierta.esDe('cuidador', 'familia-1')).toBe(false);
    expect(abierta.esDe('familiar', 'otra-familia')).toBe(false);
  });
});

describe('cursor de mensajes', () => {
  const cursor = { creadoEn: AHORA, id: UUID };

  it('ida y vuelta', () => {
    expect(decodificarCursor(codificarCursor(cursor))).toEqual(cursor);
  });

  it.each([
    '',
    'basura',
    'a'.repeat(201),
    Buffer.from('[]').toString('base64url'),
    Buffer.from('{"creadoEn":"ayer","id":"x"}').toString('base64url'),
    Buffer.from(`{"creadoEn":"2030-06-10T15:00:00Z","id":"${UUID}"}`).toString(
      'base64url',
    ),
    Buffer.from(`{"creadoEn":"${AHORA.toISOString()}","id":"corto"}`).toString(
      'base64url',
    ),
  ])('rechaza el cursor «%s»', (texto) => {
    expect(() => decodificarCursor(texto)).toThrow(
      expect.objectContaining({
        codigo: 'paginacion.cursor_invalido',
      }) as Error,
    );
  });

  it('esPosterior compara la hora y desempata por id', () => {
    const despues = { creadoEn: new Date(AHORA.getTime() + 1), id: 'a' };
    expect(esPosterior(despues, { ...cursor, id: 'z' })).toBe(true);
    expect(esPosterior(cursor, despues)).toBe(false);
    expect(esPosterior({ ...cursor, id: 'b' }, { ...cursor, id: 'a' })).toBe(
      true,
    );
    expect(esPosterior(cursor, cursor)).toBe(false);
  });

  it('el límite va de 1 a 100, y por defecto 30', () => {
    expect(limiteDe(undefined)).toBe(30);
    expect(limiteDe(1)).toBe(1);
    expect(limiteDe(100)).toBe(100);
    for (const malo of [0, 101, 1.5, Number.NaN]) {
      expect(() => limiteDe(malo)).toThrow(
        expect.objectContaining({
          codigo: 'paginacion.limite_invalido',
        }) as Error,
      );
    }
  });
});

describe('ConexionesDeFlujos', () => {
  it('permite hasta el máximo por persona y las demás personas no se ven afectadas', () => {
    const conexiones = new ConexionesDeFlujos(2);
    conexiones.registrar('ana', () => undefined);
    conexiones.registrar('ana', () => undefined);

    expect(() => conexiones.verificarCupo('ana')).toThrow(
      expect.objectContaining({
        constructor: ReglaDeNegocioIncumplida,
        codigo: 'flujo.demasiadas_conexiones',
      }) as Error,
    );
    expect(() => conexiones.verificarCupo('beto')).not.toThrow();
  });

  it('soltar una conexión libera su cupo, y soltarla dos veces no cuenta doble', () => {
    const conexiones = new ConexionesDeFlujos(1);
    const soltar = conexiones.registrar('ana', () => undefined);

    soltar();
    soltar();

    expect(conexiones.cuantas('ana')).toBe(0);
    expect(() => conexiones.verificarCupo('ana')).not.toThrow();
  });

  it('cerrarTodas cierra todas, aunque cada cierre se suelte a sí mismo', () => {
    const conexiones = new ConexionesDeFlujos(5);
    const cerradas: string[] = [];
    for (const persona of ['ana', 'ana', 'beto']) {
      const cerrar = () => {
        cerradas.push(persona);
        soltar();
      };
      const soltar = conexiones.registrar(persona, cerrar);
    }

    conexiones.cerrarTodas();

    expect(cerradas.sort()).toEqual(['ana', 'ana', 'beto']);
    expect(conexiones.cuantas('ana')).toBe(0);
  });

  it('cierra todo antes de apagar el servidor', () => {
    const conexiones = new ConexionesDeFlujos(5);
    let cerrada = false;
    conexiones.registrar('ana', () => {
      cerrada = true;
    });

    conexiones.beforeApplicationShutdown();

    expect(cerrada).toBe(true);
  });
});

describe('ConcentradorDeFlujos', () => {
  it('despierta solo a quien se avisa y deja de hacerlo al darse de baja', () => {
    const concentrador = new ConcentradorDeFlujos();
    const despertados: string[] = [];
    const bajaAna = concentrador.suscribir('ana', () =>
      despertados.push('ana'),
    );
    concentrador.suscribir('beto', () => despertados.push('beto'));

    concentrador.avisarA('ana');
    bajaAna();
    concentrador.avisarA('ana');
    concentrador.avisarA('nadie');

    expect(despertados).toEqual(['ana']);
    expect(concentrador.oyentesDe('ana')).toBe(0);
    expect(concentrador.oyentesDe('beto')).toBe(1);
  });
});

describe('DespertarFlujosAlEnviar', () => {
  const evento = (destinatarioId: string | null): MensajeEnviado => ({
    id: 'e1',
    tipo: 'mensajeria.mensaje_enviado',
    version: 1,
    ocurridoEn: AHORA.toISOString(),
    idDeCorrelacion: 'c',
    datos: {
      mensajeId: 'm',
      conversacionId: 'c',
      autorId: 'ana',
      destinatarioId,
    },
  });

  it('despierta al autor y al destinatario', async () => {
    const avisados: string[] = [];
    const manejador = new DespertarFlujosAlEnviar({
      avisarA: (id) => avisados.push(id),
    });

    await manejador.manejar(evento('beto'));

    expect(avisados).toEqual(['ana', 'beto']);
  });

  it('sin destinatario solo despierta al autor', async () => {
    const avisados: string[] = [];
    await new DespertarFlujosAlEnviar({
      avisarA: (id) => avisados.push(id),
    }).manejar(evento(null));

    expect(avisados).toEqual(['ana']);
  });
});

describe('AvisarMensajeNuevo', () => {
  const evento = (
    destinatarioId: string | null,
    id = 'e1',
  ): MensajeEnviado => ({
    id,
    tipo: 'mensajeria.mensaje_enviado',
    version: 1,
    ocurridoEn: AHORA.toISOString(),
    idDeCorrelacion: 'c',
    datos: {
      mensajeId: 'm',
      conversacionId: 'conv-1',
      autorId: 'ana',
      destinatarioId,
    },
  });

  function montar() {
    const repositorio = new RepositorioNotificacionesEnMemoria();
    const reloj = new RelojFalso(AHORA);
    const avisos = new CrearAvisos(
      repositorio,
      [{ canal: 'app', enviar: () => Promise.resolve('entregada') }],
      new GeneradorDeIdsSecuencial(),
      reloj,
    );
    return {
      repositorio,
      reloj,
      manejador: new AvisarMensajeNuevo(repositorio, avisos, reloj),
    };
  }

  it('avisa sin texto ni nombres: solo la conversación', async () => {
    const { manejador, repositorio } = montar();

    await manejador.manejar(evento('beto'));

    expect(repositorio.avisos()).toHaveLength(1);
    expect(repositorio.avisos()[0]).toMatchObject({
      destinatarioId: 'beto',
      tipo: 'mensaje_nuevo:destinatario',
      parametros: { conversacionId: 'conv-1' },
    });
  });

  it('sin cuenta del destinatario no avisa', async () => {
    const { manejador, repositorio } = montar();

    await manejador.manejar(evento(null));

    expect(repositorio.avisos()).toEqual([]);
  });

  it('agrupa dentro de los cinco minutos y vuelve a avisar pasado ese rato', async () => {
    const { manejador, repositorio, reloj } = montar();

    await manejador.manejar(evento('beto', 'e1'));
    reloj.avanzar(4 * 60_000);
    await manejador.manejar(evento('beto', 'e2'));
    reloj.avanzar(2 * 60_000);
    await manejador.manejar(evento('beto', 'e3'));

    expect(repositorio.avisos()).toHaveLength(2);
  });

  it('otra conversación y otra persona no se agrupan con esta', async () => {
    const { manejador, repositorio } = montar();
    const otraConversacion = evento('beto', 'e2');
    otraConversacion.datos.conversacionId = 'conv-2';

    await manejador.manejar(evento('beto', 'e1'));
    await manejador.manejar(otraConversacion);
    await manejador.manejar(evento('carla', 'e3'));

    expect(repositorio.avisos()).toHaveLength(3);
  });
});

describe('FlujoDeMensajes', () => {
  const usuario = { id: 'ana', rol: 'familiar' as const };
  const opciones = {
    sondeoMs: 20,
    latidoMs: 60,
    vidaMaximaMs: 400,
    ventanaMs: 10_000,
  };

  function montar(
    consulta: () => Promise<Mensaje[]>,
    sobrescribir: Partial<typeof opciones> = {},
  ) {
    const nuevos = { ejecutar: consulta } as unknown as ObtenerMensajesNuevos;
    const conexiones = new ConexionesDeFlujos(2);
    const concentrador = new ConcentradorDeFlujos();
    const flujo = new FlujoDeMensajes(
      nuevos,
      concentrador,
      conexiones,
      new RelojFalso(AHORA),
      { ...opciones, ...sobrescribir },
    );
    return { flujo, conexiones, concentrador };
  }

  it('manda señales de vida, y se cierra solo al cumplir su vida máxima', async () => {
    const { flujo, conexiones } = montar(() => Promise.resolve([]));

    const eventos = await firstValueFrom(
      flujo.abrir(usuario, null).pipe(toArray()),
    );

    expect(eventos.length).toBeGreaterThanOrEqual(2);
    expect(eventos.every((e) => e.type === 'latido')).toBe(true);
    expect(conexiones.cuantas('ana')).toBe(0);
  });

  it('no repite un mensaje que ya entregó en la misma conexión', async () => {
    const unico = mensaje({ creadoEn: AHORA });
    const { flujo } = montar(() => Promise.resolve([unico]));

    const eventos = await firstValueFrom(
      flujo.abrir(usuario, null).pipe(toArray()),
    );

    expect(eventos.filter((e) => e.type === 'mensaje')).toHaveLength(1);
  });

  it('tras fallos seguidos se cierra para que la interfaz se reconecte', async () => {
    let llamadas = 0;
    const { flujo } = montar(
      () => {
        llamadas += 1;
        return Promise.reject(new Error('la base no responde'));
      },
      { vidaMaximaMs: 10_000 },
    );

    const eventos = await firstValueFrom(
      flujo.abrir(usuario, null).pipe(toArray()),
    );

    expect(eventos).toEqual([]);
    expect(llamadas).toBe(3);
  });

  it('respeta el tope de conexiones antes de empezar a transmitir', () => {
    const { flujo } = montar(() => Promise.resolve([]), {
      vidaMaximaMs: 10_000,
    });
    const suscripciones = [1, 2].map(() =>
      flujo.abrir(usuario, null).subscribe(),
    );

    expect(() => flujo.abrir(usuario, null)).toThrow(
      expect.objectContaining({
        codigo: 'flujo.demasiadas_conexiones',
      }) as Error,
    );

    for (const suscripcion of suscripciones) suscripcion.unsubscribe();
  });

  it('un aviso del concentrador lo despierta sin esperar al sondeo', async () => {
    let llamadas = 0;
    const { flujo, concentrador } = montar(
      () => {
        llamadas += 1;
        return Promise.resolve([]);
      },
      { sondeoMs: 10_000, latidoMs: 10_000, vidaMaximaMs: 10_000 },
    );
    const suscripcion = flujo.abrir(usuario, null).subscribe();
    await new Promise((resolver) => setTimeout(resolver, 30));
    const antes = llamadas;

    concentrador.avisarA('ana');
    await new Promise((resolver) => setTimeout(resolver, 30));

    expect(llamadas).toBe(antes + 1);
    suscripcion.unsubscribe();
  });
});
