import { Module } from '@nestjs/common';
import {
  AUDITORIA,
  type Auditoria,
} from '../compartido/aplicacion/puertos/auditoria.js';
import {
  CONTEXTO_DE_PETICION,
  type ContextoDePeticion,
} from '../compartido/aplicacion/puertos/contexto-de-peticion.js';
import {
  GENERADOR_DE_IDS,
  type GeneradorDeIds,
} from '../compartido/aplicacion/puertos/generador-de-ids.js';
import {
  PUBLICADOR_DE_EVENTOS,
  type PublicadorDeEventos,
} from '../compartido/aplicacion/puertos/publicador-de-eventos.js';
import { RELOJ, type Reloj } from '../compartido/aplicacion/puertos/reloj.js';
import {
  UNIDAD_DE_TRABAJO,
  type UnidadDeTrabajo,
} from '../compartido/aplicacion/puertos/unidad-de-trabajo.js';
import { VERIFICADOR_DE_TOKENS } from '../compartido/aplicacion/puertos/verificador-de-tokens.js';
import { ContextoTransaccional } from '../compartido/infraestructura/base-de-datos/contexto-transaccional.js';
import { CONFIGURACION } from '../configuracion/configuracion.module.js';
import type { Configuracion } from '../configuracion/variables-de-entorno.js';
import { CerrarSesion } from './aplicacion/casos-de-uso/cerrar-sesion.js';
import { IniciarSesion } from './aplicacion/casos-de-uso/iniciar-sesion.js';
import { RegistrarFamiliar } from './aplicacion/casos-de-uso/registrar-familiar.js';
import { RenovarSesion } from './aplicacion/casos-de-uso/renovar-sesion.js';
import {
  EMISOR_DE_TOKENS,
  type EmisorDeTokens,
} from './aplicacion/puertos/salida/emisor-de-tokens.js';
import {
  GENERADOR_DE_TOKENS_OPACOS,
  type GeneradorDeTokensOpacos,
} from './aplicacion/puertos/salida/generador-de-tokens-opacos.js';
import {
  HASH_DE_CONTRASENAS,
  type HashDeContrasenas,
} from './aplicacion/puertos/salida/hash-de-contrasenas.js';
import {
  REPOSITORIO_ACEPTACIONES_DE_POLITICA,
  type RepositorioAceptacionesDePolitica,
} from './aplicacion/puertos/salida/repositorio-aceptaciones-de-politica.js';
import { REPOSITORIO_SESIONES } from './aplicacion/puertos/salida/repositorio-sesiones.js';
import type { RepositorioSesiones } from './aplicacion/puertos/salida/repositorio-sesiones.js';
import {
  REPOSITORIO_USUARIOS,
  type RepositorioUsuarios,
} from './aplicacion/puertos/salida/repositorio-usuarios.js';
import { EmisorDeSesiones } from './aplicacion/servicios/emisor-de-sesiones.js';
import type { DiccionarioDeContrasenasComunes } from './dominio/contrasena.js';
import { AuthController } from './infraestructura/entrada/http/auth.controller.js';
import { DiccionarioDeContrasenasComunesDeArchivo } from './infraestructura/salida/contrasenas/diccionario-de-contrasenas-comunes.js';
import { RepositorioAceptacionesDePoliticaDrizzle } from './infraestructura/salida/persistencia/repositorio-aceptaciones-de-politica-drizzle.js';
import { RepositorioSesionesDrizzle } from './infraestructura/salida/persistencia/repositorio-sesiones-drizzle.js';
import { RepositorioUsuariosDrizzle } from './infraestructura/salida/persistencia/repositorio-usuarios-drizzle.js';
import { GeneradorDeTokensOpacosAleatorio } from './infraestructura/salida/seguridad/generador-de-tokens-opacos-aleatorio.js';
import { HashDeContrasenasArgon2 } from './infraestructura/salida/seguridad/hash-de-contrasenas-argon2.js';
import { TokensJwt } from './infraestructura/salida/seguridad/tokens-jwt.js';

const DICCIONARIO_DE_CONTRASENAS = Symbol('DiccionarioDeContrasenasComunes');
const TOKENS_JWT = Symbol('TokensJwt');
const MS_POR_MINUTO = 60_000;
const MS_POR_DIA = 24 * 60 * MS_POR_MINUTO;

// Módulo de Identidad (M1). Exporta SOLO lo que otros módulos pueden usar: hoy, el verificador de
// tokens para el guard global; `CONSULTA_DE_IDENTIDAD` llega con el PR 4. Repositorios, hash y emisor
// de tokens son privados: si otro módulo intenta inyectarlos, Nest falla al arrancar. Las clases se
// crean con fábricas para que la capa de aplicación no dependa de decoradores de Nest.
@Module({
  controllers: [AuthController],
  providers: [
    // Persistencia
    {
      provide: REPOSITORIO_USUARIOS,
      inject: [ContextoTransaccional],
      useFactory: (contexto: ContextoTransaccional) =>
        new RepositorioUsuariosDrizzle(contexto),
    },
    {
      provide: REPOSITORIO_SESIONES,
      inject: [ContextoTransaccional],
      useFactory: (contexto: ContextoTransaccional) =>
        new RepositorioSesionesDrizzle(contexto),
    },
    {
      provide: REPOSITORIO_ACEPTACIONES_DE_POLITICA,
      inject: [ContextoTransaccional],
      useFactory: (contexto: ContextoTransaccional) =>
        new RepositorioAceptacionesDePoliticaDrizzle(contexto),
    },

    // Seguridad
    {
      provide: HASH_DE_CONTRASENAS,
      useFactory: () => new HashDeContrasenasArgon2(),
    },
    {
      provide: GENERADOR_DE_TOKENS_OPACOS,
      useFactory: () => new GeneradorDeTokensOpacosAleatorio(),
    },
    {
      provide: DICCIONARIO_DE_CONTRASENAS,
      useFactory: () => new DiccionarioDeContrasenasComunesDeArchivo(),
    },
    {
      provide: TOKENS_JWT,
      inject: [CONFIGURACION, RELOJ],
      useFactory: (configuracion: Configuracion, reloj: Reloj) =>
        new TokensJwt(
          {
            secreto: configuracion.secretoJwtAcceso,
            idDeClave: configuracion.idClaveJwt,
            duracionDelAccesoMs:
              configuracion.duracionAccesoMin * MS_POR_MINUTO,
          },
          reloj,
        ),
    },
    { provide: EMISOR_DE_TOKENS, useExisting: TOKENS_JWT },
    // Reemplaza al verificador que rechazaba todo (M0): ahora el guard global valida los tokens reales.
    { provide: VERIFICADOR_DE_TOKENS, useExisting: TOKENS_JWT },

    // Casos de uso
    {
      provide: EmisorDeSesiones,
      inject: [
        REPOSITORIO_SESIONES,
        EMISOR_DE_TOKENS,
        GENERADOR_DE_TOKENS_OPACOS,
        GENERADOR_DE_IDS,
        CONFIGURACION,
      ],
      useFactory: (
        sesiones: RepositorioSesiones,
        emisor: EmisorDeTokens,
        tokensOpacos: GeneradorDeTokensOpacos,
        ids: GeneradorDeIds,
        configuracion: Configuracion,
      ) =>
        new EmisorDeSesiones(
          sesiones,
          emisor,
          tokensOpacos,
          ids,
          configuracion.duracionRefrescoDias * MS_POR_DIA,
        ),
    },
    {
      provide: RegistrarFamiliar,
      inject: [
        REPOSITORIO_USUARIOS,
        REPOSITORIO_ACEPTACIONES_DE_POLITICA,
        HASH_DE_CONTRASENAS,
        DICCIONARIO_DE_CONTRASENAS,
        EmisorDeSesiones,
        UNIDAD_DE_TRABAJO,
        PUBLICADOR_DE_EVENTOS,
        AUDITORIA,
        RELOJ,
        GENERADOR_DE_IDS,
        CONTEXTO_DE_PETICION,
        CONFIGURACION,
      ],
      useFactory: (
        usuarios: RepositorioUsuarios,
        aceptaciones: RepositorioAceptacionesDePolitica,
        hash: HashDeContrasenas,
        comunes: DiccionarioDeContrasenasComunes,
        sesiones: EmisorDeSesiones,
        unidadDeTrabajo: UnidadDeTrabajo,
        publicador: PublicadorDeEventos,
        auditoria: Auditoria,
        reloj: Reloj,
        ids: GeneradorDeIds,
        contexto: ContextoDePeticion,
        configuracion: Configuracion,
      ) =>
        new RegistrarFamiliar(
          usuarios,
          aceptaciones,
          hash,
          comunes,
          sesiones,
          unidadDeTrabajo,
          publicador,
          auditoria,
          reloj,
          ids,
          contexto,
          configuracion.versionPoliticaVigente,
        ),
    },
    {
      provide: IniciarSesion,
      inject: [
        REPOSITORIO_USUARIOS,
        HASH_DE_CONTRASENAS,
        EmisorDeSesiones,
        UNIDAD_DE_TRABAJO,
        AUDITORIA,
        RELOJ,
      ],
      useFactory: (
        usuarios: RepositorioUsuarios,
        hash: HashDeContrasenas,
        sesiones: EmisorDeSesiones,
        unidadDeTrabajo: UnidadDeTrabajo,
        auditoria: Auditoria,
        reloj: Reloj,
      ) =>
        new IniciarSesion(
          usuarios,
          hash,
          sesiones,
          unidadDeTrabajo,
          auditoria,
          reloj,
        ),
    },
    {
      provide: RenovarSesion,
      inject: [
        REPOSITORIO_SESIONES,
        REPOSITORIO_USUARIOS,
        EmisorDeSesiones,
        GENERADOR_DE_TOKENS_OPACOS,
        UNIDAD_DE_TRABAJO,
        AUDITORIA,
        RELOJ,
      ],
      useFactory: (
        sesiones: RepositorioSesiones,
        usuarios: RepositorioUsuarios,
        emisorDeSesiones: EmisorDeSesiones,
        tokensOpacos: GeneradorDeTokensOpacos,
        unidadDeTrabajo: UnidadDeTrabajo,
        auditoria: Auditoria,
        reloj: Reloj,
      ) =>
        new RenovarSesion(
          sesiones,
          usuarios,
          emisorDeSesiones,
          tokensOpacos,
          unidadDeTrabajo,
          auditoria,
          reloj,
        ),
    },
    {
      provide: CerrarSesion,
      inject: [
        REPOSITORIO_SESIONES,
        GENERADOR_DE_TOKENS_OPACOS,
        UNIDAD_DE_TRABAJO,
        AUDITORIA,
        RELOJ,
      ],
      useFactory: (
        sesiones: RepositorioSesiones,
        tokensOpacos: GeneradorDeTokensOpacos,
        unidadDeTrabajo: UnidadDeTrabajo,
        auditoria: Auditoria,
        reloj: Reloj,
      ) =>
        new CerrarSesion(
          sesiones,
          tokensOpacos,
          unidadDeTrabajo,
          auditoria,
          reloj,
        ),
    },
  ],
  exports: [VERIFICADOR_DE_TOKENS],
})
export class IdentidadModule {}
