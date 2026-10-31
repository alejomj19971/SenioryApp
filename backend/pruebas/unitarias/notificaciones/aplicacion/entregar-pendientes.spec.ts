import type { Contacto } from '../../../../src/identidad/aplicacion/puertos/entrada/consulta-de-identidad.js';
import type { ConsultaDeIdentidad } from '../../../../src/identidad/aplicacion/puertos/entrada/consulta-de-identidad.js';
import { EntregarPendientes } from '../../../../src/notificaciones/aplicacion/casos-de-uso/entregar-pendientes.js';
import { FalloDeEnvio } from '../../../../src/notificaciones/aplicacion/puertos/salida/canal-de-notificacion.js';
import { MAXIMO_DE_INTENTOS } from '../../../../src/notificaciones/dominio/notificacion.js';
import type { Notificacion } from '../../../../src/notificaciones/dominio/notificacion.js';
import { EventosDeNotificaciones } from '../../../../src/notificaciones/aplicacion/servicios/eventos-de-notificaciones.js';
import {
  AuditoriaEnMemoria,
  GeneradorDeIdsSecuencial,
  PublicadorDeEventosEnMemoria,
  RelojFalso,
} from '../../../soporte/dobles.js';
import {
  avisoDePrueba,
  CanalFalso,
  RepositorioNotificacionesEnMemoria,
} from '../../../soporte/notificaciones.js';

const AHORA = '2026-10-21T15:00:00.000Z';
const CONTACTO: Contacto = {
  usuarioId: '0198aaaa-0000-7000-8000-0000000000f1',
  nombre: 'Andrea Gómez',
  correo: 'andrea@ejemplo.co',
  telefono: '+573001234567',
};

function montar(canales: CanalFalso[], contacto: Contacto | null = CONTACTO) {
  const repositorio = new RepositorioNotificacionesEnMemoria();
  const reloj = new RelojFalso(AHORA);
  const auditoria = new AuditoriaEnMemoria();
  const identidad = {
    obtenerContacto: () => Promise.resolve(contacto),
  } as unknown as ConsultaDeIdentidad;
  const publicador = new PublicadorDeEventosEnMemoria();
  const caso = new EntregarPendientes(
    repositorio,
    canales,
    identidad,
    { ejecutar: (trabajo) => trabajo() },
    auditoria,
    reloj,
    new EventosDeNotificaciones(publicador, new GeneradorDeIdsSecuencial(), {
      idDeCorrelacion: () => '0198aaaa-0000-7000-8000-0000000000c0',
    }),
  );
  return { caso, repositorio, reloj, auditoria, publicador };
}

async function guardar(
  repositorio: RepositorioNotificacionesEnMemoria,
  ...avisos: Notificacion[]
) {
  await repositorio.crear(avisos);
}

describe('EntregarPendientes', () => {
  describe('envío', () => {
    it('entrega un aviso por la aplicación y lo marca entregado', async () => {
      const app = new CanalFalso('app');
      const { caso, repositorio } = montar([app]);
      const aviso = avisoDePrueba({ canal: 'app' });
      await guardar(repositorio, aviso);

      const tomadas = await caso.ejecutar();

      expect(tomadas).toBe(1);
      expect(aviso).toMatchObject({ estado: 'entregada', intentos: 1 });
      expect(repositorio.intentosDe(aviso)).toEqual([
        {
          resultado: 'exito',
          respuesta: 'entregada',
          intentadoEn: new Date(AHORA),
        },
      ]);
    });

    it('le pasa al canal el texto armado y los datos de contacto', async () => {
      const correo = new CanalFalso('correo');
      const { caso, repositorio } = montar([correo]);
      await guardar(repositorio, avisoDePrueba({ canal: 'correo' }));

      await caso.ejecutar();

      expect(correo.enviados).toEqual([
        {
          destinatario: CONTACTO,
          titulo: 'Servicio confirmado',
          cuerpo:
            'Tu servicio del martes 11 de junio, en la mañana quedó confirmado.',
          prioridad: 'normal',
        },
      ]);
    });

    it('si el proveedor solo aceptó el mensaje, queda «enviada» (falta confirmación)', async () => {
      const correo = new CanalFalso('correo');
      correo.respuesta = () => Promise.resolve('enviada');
      const { caso, repositorio } = montar([correo]);
      const aviso = avisoDePrueba({ canal: 'correo' });
      await guardar(repositorio, aviso);

      await caso.ejecutar();

      expect(aviso).toMatchObject({ estado: 'enviada', entregadaEn: null });
    });

    it('sin avisos pendientes no hace nada', async () => {
      const { caso } = montar([new CanalFalso('app')]);

      expect(await caso.ejecutar()).toBe(0);
    });

    it('no toma los que todavía no les toca ni los que ya salieron', async () => {
      const { caso, repositorio, reloj } = montar([new CanalFalso('app')]);
      const futuro = avisoDePrueba({ canal: 'app' });
      futuro.registrarFallo(reloj.ahora(), 'falló antes');
      const hecho = avisoDePrueba({
        canal: 'app',
        tipo: 'servicio_iniciado:familia',
      });
      hecho.marcarEntregada(reloj.ahora());
      await guardar(repositorio, futuro, hecho);

      expect(await caso.ejecutar()).toBe(0);
    });

    it('envía en orden los más antiguos primero', async () => {
      const app = new CanalFalso('app');
      const { caso, repositorio } = montar([app]);
      await guardar(
        repositorio,
        avisoDePrueba({
          tipo: 'servicio_iniciado:familia',
          ahora: new Date('2026-10-21T14:59:50.000Z'),
        }),
      );

      expect(await caso.ejecutar()).toBe(1);
    });
  });

  describe('reintentos con espera creciente', () => {
    it('un fallo lo deja pendiente para más tarde, con el error guardado', async () => {
      const correo = new CanalFalso('correo');
      correo.respuesta = () => Promise.reject(new Error('proveedor caído'));
      const { caso, repositorio } = montar([correo]);
      const aviso = avisoDePrueba({ canal: 'correo' });
      await guardar(repositorio, aviso);

      await caso.ejecutar();

      expect(aviso).toMatchObject({
        estado: 'pendiente',
        intentos: 1,
        ultimoError: 'proveedor caído',
        proximoIntentoEn: new Date('2026-10-21T15:00:30.000Z'),
      });
      expect(repositorio.intentosDe(aviso)[0]).toMatchObject({
        resultado: 'error',
        respuesta: 'proveedor caído',
      });
    });

    it('no se reintenta antes de tiempo, y sí cuando llega la hora', async () => {
      const correo = new CanalFalso('correo');
      correo.respuesta = () => Promise.reject(new Error('caído'));
      const { caso, repositorio, reloj } = montar([correo]);
      await guardar(repositorio, avisoDePrueba({ canal: 'correo' }));
      await caso.ejecutar();

      reloj.avanzar(29_000);
      const antes = await caso.ejecutar();
      reloj.avanzar(1_000);
      const despues = await caso.ejecutar();

      expect([antes, despues]).toEqual([0, 1]);
      expect(correo.enviados).toHaveLength(2);
    });

    it('si el reintento funciona, queda entregada y se limpia el error', async () => {
      const correo = new CanalFalso('correo');
      correo.respuesta = () => Promise.reject(new Error('caído'));
      const { caso, repositorio, reloj } = montar([correo]);
      const aviso = avisoDePrueba({ canal: 'correo' });
      await guardar(repositorio, aviso);
      await caso.ejecutar();
      correo.respuesta = () => Promise.resolve('entregada');
      reloj.avanzar(30_000);

      await caso.ejecutar();

      expect(aviso).toMatchObject({
        estado: 'entregada',
        intentos: 2,
        ultimoError: null,
      });
    });

    it(`tras ${MAXIMO_DE_INTENTOS} intentos queda «fallida» y deja de reintentarse`, async () => {
      const correo = new CanalFalso('correo');
      correo.respuesta = () => Promise.reject(new Error('caído'));
      const { caso, repositorio, reloj } = montar([correo]);
      const aviso = avisoDePrueba({ canal: 'correo' });
      await guardar(repositorio, aviso);

      for (let i = 0; i < MAXIMO_DE_INTENTOS + 3; i++) {
        await caso.ejecutar();
        reloj.avanzar(2 * 60 * 60_000); // más que cualquier espera
      }

      expect(aviso).toMatchObject({
        estado: 'fallida',
        intentos: MAXIMO_DE_INTENTOS,
      });
      expect(correo.enviados).toHaveLength(MAXIMO_DE_INTENTOS);
      expect(repositorio.intentosDe(aviso)).toHaveLength(MAXIMO_DE_INTENTOS);
    });

    it('las esperas crecen entre un intento y el siguiente', async () => {
      const correo = new CanalFalso('correo');
      correo.respuesta = () => Promise.reject(new Error('caído'));
      const { caso, repositorio, reloj } = montar([correo]);
      const aviso = avisoDePrueba({ canal: 'correo' });
      await guardar(repositorio, aviso);
      const esperas: number[] = [];

      for (let i = 0; i < 4; i++) {
        const antes = reloj.ahora().getTime();
        await caso.ejecutar();
        esperas.push((aviso.proximoIntentoEn.getTime() - antes) / 1000);
        reloj.fijar(aviso.proximoIntentoEn);
      }

      expect(esperas).toEqual([30, 120, 600, 1800]);
    });
  });

  describe('fallos que reintentar no arregla', () => {
    it('un canal que dice que el fallo es definitivo no gasta los cinco intentos', async () => {
      const sms = new CanalFalso('sms');
      sms.respuesta = () =>
        Promise.reject(new FalloDeEnvio('sin teléfono', true));
      const { caso, repositorio } = montar([sms]);
      const aviso = avisoDePrueba({ canal: 'sms' });
      await guardar(repositorio, aviso);

      await caso.ejecutar();

      expect(aviso).toMatchObject({
        estado: 'fallida',
        intentos: 1,
        ultimoError: 'sin teléfono',
      });
    });

    it('un canal que ya no existe en este entorno', async () => {
      const { caso, repositorio } = montar([new CanalFalso('app')]);
      const aviso = avisoDePrueba({ canal: 'whatsapp' });
      await guardar(repositorio, aviso);

      await caso.ejecutar();

      expect(aviso).toMatchObject({ estado: 'fallida', intentos: 1 });
      expect(aviso.ultimoError).toContain('whatsapp no está disponible');
    });

    it('una cuenta eliminada: no hay a quién enviar', async () => {
      const app = new CanalFalso('app');
      const { caso, repositorio } = montar([app], null);
      const aviso = avisoDePrueba({ canal: 'app' });
      await guardar(repositorio, aviso);

      await caso.ejecutar();

      expect(aviso).toMatchObject({
        estado: 'fallida',
        ultimoError: 'La cuenta del destinatario ya no existe',
      });
      expect(app.enviados).toEqual([]);
    });

    it('un tipo de aviso sin plantilla queda fallido sin tumbar a los demás', async () => {
      const app = new CanalFalso('app');
      const { caso, repositorio } = montar([app]);
      const roto = avisoDePrueba({ canal: 'app', tipo: 'inventado:familia' });
      const bueno = avisoDePrueba({ canal: 'app' });
      await guardar(repositorio, roto, bueno);

      await caso.ejecutar();

      expect(roto.estado).toBe('fallida');
      expect(bueno.estado).toBe('entregada');
    });
  });

  describe('un aviso que falla no frena a los demás', () => {
    it('cada aviso va por su cuenta', async () => {
      const correo = new CanalFalso('correo');
      correo.respuesta = () => Promise.reject(new Error('caído'));
      const app = new CanalFalso('app');
      const { caso, repositorio } = montar([app, correo]);
      const porCorreo = avisoDePrueba({ canal: 'correo' });
      const porApp = avisoDePrueba({ canal: 'app' });
      await guardar(repositorio, porCorreo, porApp);

      await caso.ejecutar();

      expect(porCorreo.estado).toBe('pendiente');
      expect(porApp.estado).toBe('entregada');
    });
  });

  describe('evento «notificación entregada» (E11)', () => {
    const deAlerta = (canal: 'app' | 'sms' = 'app') =>
      avisoDePrueba({
        canal,
        prioridad: 'alta',
        tipo: 'alerta_generada:destinatario',
        parametros: { alertaId: 'alerta-1', nombre: 'Doña Carmen' },
      });

    it('al salir el aviso de una alerta, anuncia cuándo y por qué canal', async () => {
      const { caso, repositorio, publicador } = montar([new CanalFalso('app')]);
      const aviso = deAlerta();
      await guardar(repositorio, aviso);

      await caso.ejecutar();

      expect(
        publicador.deTipo('notificaciones.notificacion_entregada'),
      ).toEqual([
        expect.objectContaining({
          datos: {
            notificacionId: aviso.id,
            destinatarioId: aviso.destinatarioId,
            canal: 'app',
            alertaId: 'alerta-1',
            entregadaEn: AHORA,
          },
        }),
      ]);
    });

    it('también cuando el proveedor solo aceptó el mensaje (enviada)', async () => {
      const sms = new CanalFalso('sms');
      sms.respuesta = () => Promise.resolve('enviada');
      const { caso, repositorio, publicador } = montar([sms]);
      await guardar(repositorio, deAlerta('sms'));

      await caso.ejecutar();

      expect(
        publicador.deTipo('notificaciones.notificacion_entregada'),
      ).toHaveLength(1);
    });

    it('si el envío falla, no anuncia nada', async () => {
      const sms = new CanalFalso('sms');
      sms.respuesta = () => Promise.reject(new Error('caído'));
      const { caso, repositorio, publicador } = montar([sms]);
      await guardar(repositorio, deAlerta('sms'));

      await caso.ejecutar();

      expect(publicador.eventos).toEqual([]);
    });

    it('un aviso que no es de una alerta no anuncia nada (sin ruido en el outbox)', async () => {
      const { caso, repositorio, publicador } = montar([new CanalFalso('app')]);
      await guardar(repositorio, avisoDePrueba({ canal: 'app' }));

      await caso.ejecutar();

      expect(publicador.eventos).toEqual([]);
    });
  });

  describe('alertas (prioridad alta)', () => {
    const alerta = (canal: 'app' | 'sms' | 'whatsapp', eventoId = 'evento-1') =>
      avisoDePrueba({ canal, prioridad: 'alta', eventoId });

    it('los canales se envían en paralelo: uno lento no retrasa a los demás', async () => {
      const lento = new CanalFalso('whatsapp');
      let liberar: () => void = () => undefined;
      lento.respuesta = () =>
        new Promise((resolver) => {
          liberar = () => resolver('enviada');
        });
      const rapido = new CanalFalso('sms');
      const { caso, repositorio } = montar([lento, rapido]);
      const porWhatsapp = alerta('whatsapp');
      const porSms = alerta('sms');
      await guardar(repositorio, porWhatsapp, porSms);

      const ejecucion = caso.ejecutar();
      await new Promise((resolver) => setImmediate(resolver));
      // El SMS ya salió mientras WhatsApp sigue esperando.
      const smsYaSalio = porSms.estado === 'entregada';
      liberar();
      await ejecucion;

      expect(smsYaSalio).toBe(true);
      expect(porWhatsapp.estado).toBe('enviada');
    });

    it('si falla un canal pero otro salió, no hay alarma', async () => {
      const sms = new CanalFalso('sms');
      sms.respuesta = () =>
        Promise.reject(new FalloDeEnvio('sin cobertura', true));
      const app = new CanalFalso('app');
      const { caso, repositorio, auditoria } = montar([app, sms]);
      await guardar(repositorio, alerta('app'), alerta('sms'));

      await caso.ejecutar();

      expect(auditoria.entradas).toEqual([]);
    });

    it('si NINGÚN canal la entrega, queda constancia «alerta sin entregar» para avisar al equipo', async () => {
      const sms = new CanalFalso('sms');
      sms.respuesta = () =>
        Promise.reject(new FalloDeEnvio('sin cobertura', true));
      const whatsapp = new CanalFalso('whatsapp');
      whatsapp.respuesta = () =>
        Promise.reject(new FalloDeEnvio('sin cuenta', true));
      const { caso, repositorio, auditoria } = montar([sms, whatsapp]);
      await guardar(
        repositorio,
        alerta('sms', 'evento-9'),
        alerta('whatsapp', 'evento-9'),
      );

      await caso.ejecutar();

      expect(auditoria.entradas).toEqual([
        expect.objectContaining({
          actorId: null,
          accion: 'notificaciones.alerta_sin_entregar',
          recursoTipo: 'evento',
          recursoId: 'evento-9',
          resultado: 'error',
          metadatos: { tipo: 'servicio_confirmado:familia', canales: 2 },
        }),
      ]);
    });

    it('no da la alarma mientras queden canales por reintentar', async () => {
      const sms = new CanalFalso('sms');
      sms.respuesta = () =>
        Promise.reject(new FalloDeEnvio('sin cobertura', true));
      const whatsapp = new CanalFalso('whatsapp');
      whatsapp.respuesta = () => Promise.reject(new Error('caído un rato'));
      const { caso, repositorio, auditoria } = montar([sms, whatsapp]);
      await guardar(repositorio, alerta('sms'), alerta('whatsapp'));

      await caso.ejecutar();

      expect(auditoria.entradas).toEqual([]);
    });

    it('un aviso normal que falla del todo no da alarma de alerta', async () => {
      const correo = new CanalFalso('correo');
      correo.respuesta = () => Promise.reject(new FalloDeEnvio('rebotó', true));
      const { caso, repositorio, auditoria } = montar([correo]);
      await guardar(repositorio, avisoDePrueba({ canal: 'correo' }));

      await caso.ejecutar();

      expect(auditoria.entradas).toEqual([]);
    });
  });
});
