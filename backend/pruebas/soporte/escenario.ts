import type { NestExpressApplication } from '@nestjs/platform-express';
import type { EntradaDeCuidadorImportado } from '../../src/directorio/aplicacion/casos-de-uso/importar-cuidador.js';
import { ImportarCuidador } from '../../src/directorio/aplicacion/casos-de-uso/importar-cuidador.js';
import {
  EMISOR_DE_TOKENS,
  type EmisorDeTokens,
} from '../../src/identidad/aplicacion/puertos/salida/emisor-de-tokens.js';
import type { UsuarioId } from '../../src/identidad/dominio/ids.js';
import { como, conSesion, registrarFamiliar, type Persona } from './api.js';
import { conectarBd, nuevoId } from './bd.js';
import { REVISOR_DE_PRUEBA } from './directorio.js';
import type { RelojFalso } from './dobles.js';

// Personas listas para las pruebas de API que recorren varios módulos: una familia con su persona mayor y su
// consentimiento, y un cuidador verificado con sesión. Las construye con las rutas y casos de uso reales.

export const TELEFONO_DEL_CUIDADOR = '+573104445566';

export interface Familia {
  persona: Persona;
  adultoMayorId: string;
  cookie: string;
}

export interface Cuidador {
  cuidadorId: string;
  usuarioId: string;
  nombre: string;
  cookie: () => Promise<string>;
}

export async function nuevaFamilia(
  app: NestExpressApplication,
  conConsentimiento = true,
): Promise<Familia> {
  const cliente = como(app);
  const persona = await registrarFamiliar(cliente);
  const cookie = conSesion(persona.sesion);
  const adulto = await cliente
    .post('/api/v1/adultos-mayores')
    .set('Cookie', cookie)
    .send({
      nombre: 'Carmen Gómez',
      fechaDeNacimiento: '1950-03-01',
      parentesco: 'hijo_hija',
    });
  const adultoMayorId = (adulto.body as { adultoMayor: { id: string } })
    .adultoMayor.id;
  if (conConsentimiento) {
    await cliente
      .post(`/api/v1/adultos-mayores/${adultoMayorId}/consentimientos`)
      .set('Cookie', cookie)
      .send({
        finalidad: 'datos_de_salud',
        versionDelTexto: 'v1',
        calidad: 'representante',
      });
  }
  return { persona, adultoMayorId, cookie };
}

// El cuidador no conoce su contraseña (nace aleatoria): se le emite el token directamente.
export async function cookieDeCuidador(
  app: NestExpressApplication,
  reloj: RelojFalso,
  usuarioId: string,
): Promise<string> {
  const emisor = app.get<EmisorDeTokens>(EMISOR_DE_TOKENS, { strict: false });
  const { token } = await emisor.emitirAcceso(
    { id: usuarioId as UsuarioId, rol: 'cuidador' },
    reloj.ahora(),
  );
  return `seniory_acceso=${token}`;
}

export async function nuevoCuidador(
  app: NestExpressApplication,
  reloj: RelojFalso,
  cambios: Partial<EntradaDeCuidadorImportado> & {
    aceptacionAutomatica?: boolean;
  } = {},
): Promise<Cuidador> {
  const { aceptacionAutomatica, ...resto } = cambios;
  const marca = nuevoId().slice(0, 8);
  const nombre = `Marta ${marca}`;
  const { cuidadorId, usuarioId } = await app
    .get(ImportarCuidador, { strict: false })
    .ejecutar(
      {
        nombre,
        correo: `${marca}@cuidadores.seniory.invalid`,
        telefono: TELEFONO_DEL_CUIDADOR,
        especialidad: 'enfermeria',
        titulo: 'Enfermera profesional',
        aniosExperiencia: 6,
        tarifaHora: 20_000,
        zona: `Zona${marca}`,
        disponibilidad: ['manana', 'tarde', 'noche'],
        bio: 'Cuido con paciencia.',
        controles: [
          { control: 'antecedentes', vigenteHasta: '2031-01-01' },
          { control: 'titulos', vigenteHasta: null },
          { control: 'psicotecnica', vigenteHasta: '2031-01-01' },
        ],
        ...resto,
      },
      REVISOR_DE_PRUEBA,
    );
  if (aceptacionAutomatica === true) {
    const bd = conectarBd();
    try {
      await bd.query(
        'update directorio.cuidadores set aceptacion_automatica = true where id = $1',
        [cuidadorId],
      );
    } finally {
      await bd.end();
    }
  }
  return {
    cuidadorId,
    usuarioId,
    nombre,
    cookie: () => cookieDeCuidador(app, reloj, usuarioId),
  };
}
