import { v5 as uuidv5 } from 'uuid';
import type { Reloj } from '../../../../compartido/aplicacion/puertos/reloj.js';
import type { UnidadDeTrabajo } from '../../../../compartido/aplicacion/puertos/unidad-de-trabajo.js';
import { FechaCivil } from '../../../../compartido/dominio/fecha-civil.js';
import type { Id } from '../../../../compartido/dominio/id.js';
import type { HashDeContrasenas } from '../../../aplicacion/puertos/salida/hash-de-contrasenas.js';
import type { RepositorioAceptacionesDePolitica } from '../../../aplicacion/puertos/salida/repositorio-aceptaciones-de-politica.js';
import type { RepositorioAdultosMayores } from '../../../aplicacion/puertos/salida/repositorio-adultos-mayores.js';
import type { RepositorioConsentimientos } from '../../../aplicacion/puertos/salida/repositorio-consentimientos.js';
import type { RepositorioUsuarios } from '../../../aplicacion/puertos/salida/repositorio-usuarios.js';
import type { RepositorioVinculos } from '../../../aplicacion/puertos/salida/repositorio-vinculos.js';
import { AceptacionDePolitica } from '../../../dominio/aceptacion-de-politica.js';
import { AdultoMayor } from '../../../dominio/adulto-mayor.js';
import { Consentimiento } from '../../../dominio/consentimiento.js';
import {
  Contrasena,
  type DiccionarioDeContrasenasComunes,
} from '../../../dominio/contrasena.js';
import { Correo } from '../../../dominio/correo.js';
import { Credencial } from '../../../dominio/credencial.js';
import { NombrePersona } from '../../../dominio/nombre-persona.js';
import { Usuario } from '../../../dominio/usuario.js';
import { VersionDeTexto } from '../../../dominio/version-de-texto.js';
import { Vinculo } from '../../../dominio/vinculo.js';
import { ErrorDeComando } from './comando-crear-administrador.js';

// Datos de DESARROLLO (M1 §4.8): una familia de ejemplo para trabajar en local, en las pruebas y en
// staging. Nunca llegan a producción: el comando se niega a correr allí, y estas cuentas usan el dominio
// reservado `.invalid`, que no recibe correo.
//
// Los IDs se derivan de los del prototipo (`f-andrea`, `am-carmen`) con UUID v5: son siempre los mismos
// y el comando se puede repetir sin duplicar nada.

const ESPACIO_DE_LAS_SEMILLAS = '3f0a4c1e-8d52-4e0b-9b7a-6c2f1d9e4a10';

function idDe<Marca extends string>(nombre: string): Id<Marca> {
  return uuidv5(nombre, ESPACIO_DE_LAS_SEMILLAS) as Id<Marca>;
}

export const CORREO_DE_ANDREA = 'andrea@prueba.seniory.invalid';

export interface DependenciasDeSemillas {
  usuarios: RepositorioUsuarios;
  adultosMayores: RepositorioAdultosMayores;
  vinculos: RepositorioVinculos;
  consentimientos: RepositorioConsentimientos;
  aceptaciones: RepositorioAceptacionesDePolitica;
  hash: HashDeContrasenas;
  comunes: DiccionarioDeContrasenasComunes;
  unidadDeTrabajo: UnidadDeTrabajo;
  reloj: Reloj;
  zonaHorariaNegocio: string;
  versionDePolitica: string;
  versionDelConsentimiento: string;
}

// Crea (o completa) a Andrea, a Doña Carmen, su vínculo y el consentimiento de salud. Devuelve qué hizo.
export async function sembrarIdentidad(
  entorno: Record<string, string | undefined>,
  deps: DependenciasDeSemillas,
): Promise<string[]> {
  if (entorno.NODE_ENV === 'production') {
    throw new ErrorDeComando(
      'Las semillas son datos de ejemplo y no se pueden correr en producción.',
    );
  }
  const clave = entorno.CONTRASENA_DE_PRUEBA ?? '';
  if (clave.trim() === '') {
    throw new ErrorDeComando(
      'Falta CONTRASENA_DE_PRUEBA: es la contraseña de Andrea y no se guarda en el repositorio. ' +
        'Ejemplo (PowerShell): $env:CONTRASENA_DE_PRUEBA="una contraseña larga"; npm run semillas',
    );
  }
  // Las mismas reglas que el registro público: una semilla no debe ser la puerta de una cuenta débil.
  const contrasena = Contrasena.crear(clave, deps.comunes);

  const ahora = deps.reloj.ahora();
  const hoy = FechaCivil.hoy(deps.reloj, deps.zonaHorariaNegocio);
  const andreaId = idDe<'Usuario'>('f-andrea');
  const carmenId = idDe<'AdultoMayor'>('am-carmen');
  const hecho: string[] = [];

  await deps.unidadDeTrabajo.ejecutar(async () => {
    let andrea = await deps.usuarios.buscarPorId(andreaId);
    if (andrea === null) {
      andrea = Usuario.registrarFamiliar({
        id: andreaId,
        correo: Correo.crear(CORREO_DE_ANDREA),
        nombre: NombrePersona.crear('Andrea'),
        credencial: Credencial.nueva(
          andreaId,
          await deps.hash.calcular(contrasena),
          ahora,
        ),
        ahora,
      });
      await deps.usuarios.guardar(andrea);
      hecho.push(`Creada la familiar Andrea (${CORREO_DE_ANDREA}).`);
    } else {
      hecho.push('Andrea ya existía: no se tocó su contraseña.');
    }
    // Idempotente: conserva la primera aceptación.
    await deps.aceptaciones.guardar(
      AceptacionDePolitica.registrar({
        usuarioId: andreaId,
        version: VersionDeTexto.crear(deps.versionDePolitica),
        aceptadaEn: ahora,
      }),
    );

    let carmen = await deps.adultosMayores.buscarPorId(carmenId);
    if (carmen === null) {
      carmen = AdultoMayor.registrar({
        id: carmenId,
        nombre: NombrePersona.crear('Doña Carmen'),
        // 78 años y unos meses: así la edad es 78 el día en que se siembra.
        fechaDeNacimiento: hoy.sumarDias(-(78 * 365 + 19 + 180)),
        creadoPor: andreaId,
        hoy,
        ahora,
      });
      await deps.adultosMayores.guardar(carmen);
      hecho.push('Creada la persona mayor Doña Carmen.');
    } else {
      hecho.push('Doña Carmen ya existía.');
    }

    let vinculo = await deps.vinculos.buscarActivo(andreaId, carmenId);
    if (vinculo === null) {
      vinculo = Vinculo.crear({
        id: idDe<'Vinculo'>('v-andrea-carmen'),
        familiarId: andreaId,
        adultoMayorId: carmenId,
        parentesco: 'hijo_hija',
        esResponsable: true,
        ahora,
      });
      await deps.vinculos.guardar(vinculo);
      hecho.push('Vinculada Andrea como responsable de Doña Carmen.');
    }

    const vigente = await deps.consentimientos.buscarVigente(
      carmenId,
      'datos_de_salud',
    );
    if (vigente === null) {
      await deps.consentimientos.guardar(
        Consentimiento.otorgar({
          id: idDe<'Consentimiento'>('cs-carmen-salud'),
          adultoMayor: carmen,
          finalidad: 'datos_de_salud',
          otorgadoPor: andreaId,
          calidad: 'representante',
          versionDelTexto: VersionDeTexto.crear(deps.versionDelConsentimiento),
          vinculoDelOtorgante: vinculo,
          vigente: null,
          ahora,
        }),
      );
      hecho.push('Otorgado el consentimiento de datos de salud.');
    }
  });
  return hecho;
}
