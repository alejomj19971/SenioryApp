import type { INestApplicationContext } from '@nestjs/common';
import {
  RELOJ,
  type Reloj,
} from '../../../../compartido/aplicacion/puertos/reloj.js';
import {
  UNIDAD_DE_TRABAJO,
  type UnidadDeTrabajo,
} from '../../../../compartido/aplicacion/puertos/unidad-de-trabajo.js';
import { CONFIGURACION } from '../../../../configuracion/configuracion.module.js';
import type { Configuracion } from '../../../../configuracion/variables-de-entorno.js';
import {
  HASH_DE_CONTRASENAS,
  type HashDeContrasenas,
} from '../../../aplicacion/puertos/salida/hash-de-contrasenas.js';
import {
  REPOSITORIO_ACEPTACIONES_DE_POLITICA,
  type RepositorioAceptacionesDePolitica,
} from '../../../aplicacion/puertos/salida/repositorio-aceptaciones-de-politica.js';
import {
  REPOSITORIO_ADULTOS_MAYORES,
  type RepositorioAdultosMayores,
} from '../../../aplicacion/puertos/salida/repositorio-adultos-mayores.js';
import {
  REPOSITORIO_CONSENTIMIENTOS,
  type RepositorioConsentimientos,
} from '../../../aplicacion/puertos/salida/repositorio-consentimientos.js';
import {
  REPOSITORIO_USUARIOS,
  type RepositorioUsuarios,
} from '../../../aplicacion/puertos/salida/repositorio-usuarios.js';
import {
  REPOSITORIO_VINCULOS,
  type RepositorioVinculos,
} from '../../../aplicacion/puertos/salida/repositorio-vinculos.js';
import type { DiccionarioDeContrasenasComunes } from '../../../dominio/contrasena.js';
import { DICCIONARIO_DE_CONTRASENAS } from '../../salida/contrasenas/diccionario-de-contrasenas-comunes.js';
import type { DependenciasDeSemillas } from './semillas-de-identidad.js';

// Toma de la aplicación en marcha lo que necesitan las semillas. Los símbolos no son públicos (el
// módulo no los exporta), por eso se piden con `strict: false`: solo lo hace la consola del servidor.
export function dependenciasDeSemillas(
  aplicacion: INestApplicationContext,
): DependenciasDeSemillas {
  const tomar = <T>(simbolo: symbol) =>
    aplicacion.get<T>(simbolo, { strict: false });
  const configuracion = tomar<Configuracion>(CONFIGURACION);
  return {
    usuarios: tomar<RepositorioUsuarios>(REPOSITORIO_USUARIOS),
    adultosMayores: tomar<RepositorioAdultosMayores>(
      REPOSITORIO_ADULTOS_MAYORES,
    ),
    vinculos: tomar<RepositorioVinculos>(REPOSITORIO_VINCULOS),
    consentimientos: tomar<RepositorioConsentimientos>(
      REPOSITORIO_CONSENTIMIENTOS,
    ),
    aceptaciones: tomar<RepositorioAceptacionesDePolitica>(
      REPOSITORIO_ACEPTACIONES_DE_POLITICA,
    ),
    hash: tomar<HashDeContrasenas>(HASH_DE_CONTRASENAS),
    comunes: tomar<DiccionarioDeContrasenasComunes>(DICCIONARIO_DE_CONTRASENAS),
    unidadDeTrabajo: tomar<UnidadDeTrabajo>(UNIDAD_DE_TRABAJO),
    reloj: tomar<Reloj>(RELOJ),
    zonaHorariaNegocio: configuracion.zonaHorariaNegocio,
    versionDePolitica: configuracion.versionPoliticaVigente,
    versionDelConsentimiento: configuracion.versionConsentimientoSaludVigente,
  };
}
