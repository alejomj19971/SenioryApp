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
import { ActualizarPerfilPropio } from './aplicacion/casos-de-uso/actualizar-perfil-propio.js';
import { CrearAdministrador } from './aplicacion/casos-de-uso/crear-administrador.js';
import { ObtenerAdultoMayor } from './aplicacion/casos-de-uso/obtener-adulto-mayor.js';
import { ObtenerPerfilPropio } from './aplicacion/casos-de-uso/obtener-perfil-propio.js';
import { OtorgarConsentimiento } from './aplicacion/casos-de-uso/otorgar-consentimiento.js';
import { RegistrarAdultoMayor } from './aplicacion/casos-de-uso/registrar-adulto-mayor.js';
import { RevocarConsentimiento } from './aplicacion/casos-de-uso/revocar-consentimiento.js';
import {
  CONSULTA_DE_IDENTIDAD,
  type ConsultaDeIdentidad,
} from './aplicacion/puertos/entrada/consulta-de-identidad.js';
import {
  REPOSITORIO_ADULTOS_MAYORES,
  type RepositorioAdultosMayores,
} from './aplicacion/puertos/salida/repositorio-adultos-mayores.js';
import {
  REPOSITORIO_CONSENTIMIENTOS,
  type RepositorioConsentimientos,
} from './aplicacion/puertos/salida/repositorio-consentimientos.js';
import {
  REPOSITORIO_VINCULOS,
  type RepositorioVinculos,
} from './aplicacion/puertos/salida/repositorio-vinculos.js';
import { ConsultaDeIdentidadServicio } from './aplicacion/servicios/consulta-de-identidad-servicio.js';
import { EventosDeIdentidad } from './aplicacion/servicios/eventos-de-identidad.js';
import { VistasDeAdultosMayores } from './aplicacion/servicios/vistas-de-adultos-mayores.js';
import { AdultosMayoresController } from './infraestructura/entrada/http/adultos-mayores.controller.js';
import { AuthController } from './infraestructura/entrada/http/auth.controller.js';
import { ConsentimientosController } from './infraestructura/entrada/http/consentimientos.controller.js';
import { PerfilController } from './infraestructura/entrada/http/perfil.controller.js';
import { RepositorioAdultosMayoresDrizzle } from './infraestructura/salida/persistencia/repositorio-adultos-mayores-drizzle.js';
import { RepositorioConsentimientosDrizzle } from './infraestructura/salida/persistencia/repositorio-consentimientos-drizzle.js';
import { RepositorioVinculosDrizzle } from './infraestructura/salida/persistencia/repositorio-vinculos-drizzle.js';
import {
  DICCIONARIO_DE_CONTRASENAS,
  DiccionarioDeContrasenasComunesDeArchivo,
} from './infraestructura/salida/contrasenas/diccionario-de-contrasenas-comunes.js';
import { RepositorioAceptacionesDePoliticaDrizzle } from './infraestructura/salida/persistencia/repositorio-aceptaciones-de-politica-drizzle.js';
import { RepositorioSesionesDrizzle } from './infraestructura/salida/persistencia/repositorio-sesiones-drizzle.js';
import { RepositorioUsuariosDrizzle } from './infraestructura/salida/persistencia/repositorio-usuarios-drizzle.js';
import { GeneradorDeTokensOpacosAleatorio } from './infraestructura/salida/seguridad/generador-de-tokens-opacos-aleatorio.js';
import { HashDeContrasenasArgon2 } from './infraestructura/salida/seguridad/hash-de-contrasenas-argon2.js';
import { TokensJwt } from './infraestructura/salida/seguridad/tokens-jwt.js';

const TOKENS_JWT = Symbol('TokensJwt');
const MS_POR_MINUTO = 60_000;
const MS_POR_DIA = 24 * 60 * MS_POR_MINUTO;

// Módulo de Identidad (M1). Exporta SOLO lo que otros módulos pueden usar: el verificador de tokens
// para el guard global y `CONSULTA_DE_IDENTIDAD`. Repositorios, hash y emisor
// de tokens son privados: si otro módulo intenta inyectarlos, Nest falla al arrancar. Las clases se
// crean con fábricas para que la capa de aplicación no dependa de decoradores de Nest.
@Module({
  controllers: [
    AuthController,
    PerfilController,
    AdultosMayoresController,
    ConsentimientosController,
  ],
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

    {
      provide: REPOSITORIO_ADULTOS_MAYORES,
      inject: [ContextoTransaccional],
      useFactory: (contexto: ContextoTransaccional) =>
        new RepositorioAdultosMayoresDrizzle(contexto),
    },
    {
      provide: REPOSITORIO_VINCULOS,
      inject: [ContextoTransaccional],
      useFactory: (contexto: ContextoTransaccional) =>
        new RepositorioVinculosDrizzle(contexto),
    },
    {
      provide: REPOSITORIO_CONSENTIMIENTOS,
      inject: [ContextoTransaccional],
      useFactory: (contexto: ContextoTransaccional) =>
        new RepositorioConsentimientosDrizzle(contexto),
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
        EventosDeIdentidad,
        AUDITORIA,
        RELOJ,
        GENERADOR_DE_IDS,
        CONFIGURACION,
      ],
      useFactory: (
        usuarios: RepositorioUsuarios,
        aceptaciones: RepositorioAceptacionesDePolitica,
        hash: HashDeContrasenas,
        comunes: DiccionarioDeContrasenasComunes,
        sesiones: EmisorDeSesiones,
        unidadDeTrabajo: UnidadDeTrabajo,
        eventos: EventosDeIdentidad,
        auditoria: Auditoria,
        reloj: Reloj,
        ids: GeneradorDeIds,
        configuracion: Configuracion,
      ) =>
        new RegistrarFamiliar(
          usuarios,
          aceptaciones,
          hash,
          comunes,
          sesiones,
          unidadDeTrabajo,
          eventos,
          auditoria,
          reloj,
          ids,
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
    // Perfil, personas mayores y consentimientos
    {
      provide: EventosDeIdentidad,
      inject: [PUBLICADOR_DE_EVENTOS, GENERADOR_DE_IDS, CONTEXTO_DE_PETICION],
      useFactory: (
        publicador: PublicadorDeEventos,
        ids: GeneradorDeIds,
        contexto: ContextoDePeticion,
      ) => new EventosDeIdentidad(publicador, ids, contexto),
    },
    {
      provide: VistasDeAdultosMayores,
      inject: [
        REPOSITORIO_ADULTOS_MAYORES,
        REPOSITORIO_CONSENTIMIENTOS,
        RELOJ,
        CONFIGURACION,
      ],
      useFactory: (
        adultosMayores: RepositorioAdultosMayores,
        consentimientos: RepositorioConsentimientos,
        reloj: Reloj,
        configuracion: Configuracion,
      ) =>
        new VistasDeAdultosMayores(
          adultosMayores,
          consentimientos,
          reloj,
          configuracion.zonaHorariaNegocio,
        ),
    },
    {
      provide: ObtenerPerfilPropio,
      inject: [
        REPOSITORIO_USUARIOS,
        REPOSITORIO_VINCULOS,
        VistasDeAdultosMayores,
      ],
      useFactory: (
        usuarios: RepositorioUsuarios,
        vinculos: RepositorioVinculos,
        vistas: VistasDeAdultosMayores,
      ) => new ObtenerPerfilPropio(usuarios, vinculos, vistas),
    },
    {
      provide: ActualizarPerfilPropio,
      inject: [REPOSITORIO_USUARIOS, UNIDAD_DE_TRABAJO, AUDITORIA, RELOJ],
      useFactory: (
        usuarios: RepositorioUsuarios,
        unidadDeTrabajo: UnidadDeTrabajo,
        auditoria: Auditoria,
        reloj: Reloj,
      ) =>
        new ActualizarPerfilPropio(usuarios, unidadDeTrabajo, auditoria, reloj),
    },
    {
      provide: RegistrarAdultoMayor,
      inject: [
        REPOSITORIO_ADULTOS_MAYORES,
        REPOSITORIO_VINCULOS,
        UNIDAD_DE_TRABAJO,
        EventosDeIdentidad,
        AUDITORIA,
        RELOJ,
        GENERADOR_DE_IDS,
        CONFIGURACION,
      ],
      useFactory: (
        adultosMayores: RepositorioAdultosMayores,
        vinculos: RepositorioVinculos,
        unidadDeTrabajo: UnidadDeTrabajo,
        eventos: EventosDeIdentidad,
        auditoria: Auditoria,
        reloj: Reloj,
        ids: GeneradorDeIds,
        configuracion: Configuracion,
      ) =>
        new RegistrarAdultoMayor(
          adultosMayores,
          vinculos,
          unidadDeTrabajo,
          eventos,
          auditoria,
          reloj,
          ids,
          configuracion.zonaHorariaNegocio,
        ),
    },
    {
      provide: ObtenerAdultoMayor,
      inject: [REPOSITORIO_VINCULOS, VistasDeAdultosMayores, AUDITORIA],
      useFactory: (
        vinculos: RepositorioVinculos,
        vistas: VistasDeAdultosMayores,
        auditoria: Auditoria,
      ) => new ObtenerAdultoMayor(vinculos, vistas, auditoria),
    },
    {
      provide: OtorgarConsentimiento,
      inject: [
        REPOSITORIO_ADULTOS_MAYORES,
        REPOSITORIO_VINCULOS,
        REPOSITORIO_CONSENTIMIENTOS,
        UNIDAD_DE_TRABAJO,
        EventosDeIdentidad,
        AUDITORIA,
        RELOJ,
        GENERADOR_DE_IDS,
        CONFIGURACION,
      ],
      useFactory: (
        adultosMayores: RepositorioAdultosMayores,
        vinculos: RepositorioVinculos,
        consentimientos: RepositorioConsentimientos,
        unidadDeTrabajo: UnidadDeTrabajo,
        eventos: EventosDeIdentidad,
        auditoria: Auditoria,
        reloj: Reloj,
        ids: GeneradorDeIds,
        configuracion: Configuracion,
      ) =>
        new OtorgarConsentimiento(
          adultosMayores,
          vinculos,
          consentimientos,
          unidadDeTrabajo,
          eventos,
          auditoria,
          reloj,
          ids,
          configuracion.versionConsentimientoSaludVigente,
        ),
    },
    {
      provide: RevocarConsentimiento,
      inject: [
        REPOSITORIO_ADULTOS_MAYORES,
        REPOSITORIO_VINCULOS,
        REPOSITORIO_CONSENTIMIENTOS,
        UNIDAD_DE_TRABAJO,
        EventosDeIdentidad,
        AUDITORIA,
        RELOJ,
      ],
      useFactory: (
        adultosMayores: RepositorioAdultosMayores,
        vinculos: RepositorioVinculos,
        consentimientos: RepositorioConsentimientos,
        unidadDeTrabajo: UnidadDeTrabajo,
        eventos: EventosDeIdentidad,
        auditoria: Auditoria,
        reloj: Reloj,
      ) =>
        new RevocarConsentimiento(
          adultosMayores,
          vinculos,
          consentimientos,
          unidadDeTrabajo,
          eventos,
          auditoria,
          reloj,
        ),
    },

    // Lo que corre desde la consola del servidor (npm run crear-admin); no tiene ruta en la API.
    {
      provide: CrearAdministrador,
      inject: [
        REPOSITORIO_USUARIOS,
        HASH_DE_CONTRASENAS,
        DICCIONARIO_DE_CONTRASENAS,
        AUDITORIA,
        RELOJ,
        GENERADOR_DE_IDS,
      ],
      useFactory: (
        usuarios: RepositorioUsuarios,
        hash: HashDeContrasenas,
        comunes: DiccionarioDeContrasenasComunes,
        auditoria: Auditoria,
        reloj: Reloj,
        ids: GeneradorDeIds,
      ) =>
        new CrearAdministrador(usuarios, hash, comunes, auditoria, reloj, ids),
    },

    // Lo que otros módulos pueden usar
    {
      provide: CONSULTA_DE_IDENTIDAD,
      inject: [
        REPOSITORIO_USUARIOS,
        REPOSITORIO_ADULTOS_MAYORES,
        REPOSITORIO_VINCULOS,
        REPOSITORIO_CONSENTIMIENTOS,
        RELOJ,
        CONFIGURACION,
      ],
      useFactory: (
        usuarios: RepositorioUsuarios,
        adultosMayores: RepositorioAdultosMayores,
        vinculos: RepositorioVinculos,
        consentimientos: RepositorioConsentimientos,
        reloj: Reloj,
        configuracion: Configuracion,
      ): ConsultaDeIdentidad =>
        new ConsultaDeIdentidadServicio(
          usuarios,
          adultosMayores,
          vinculos,
          consentimientos,
          reloj,
          configuracion.zonaHorariaNegocio,
        ),
    },
  ],
  exports: [VERIFICADOR_DE_TOKENS, CONSULTA_DE_IDENTIDAD],
})
export class IdentidadModule {}
