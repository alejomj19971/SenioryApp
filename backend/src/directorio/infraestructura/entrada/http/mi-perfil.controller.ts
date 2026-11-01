import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import type { UsuarioAutenticado } from '../../../../compartido/aplicacion/puertos/verificador-de-tokens.js';
import { ErrorDeValidacion } from '../../../../compartido/dominio/errores.js';
import {
  Roles,
  UsuarioActual,
} from '../../../../compartido/http/decoradores.js';
import {
  ActualizarMiPerfil,
  CrearMiPerfil,
  ObtenerMiPerfil,
  RenovarVerificacion,
  SolicitarRevision,
  SubirDocumento,
} from '../../../aplicacion/casos-de-uso/mi-postulacion.js';
import type {
  VistaDeDocumento,
  VistaDeMiPerfil,
} from '../../../aplicacion/vistas-de-postulacion.js';
import { TAMANO_MAXIMO_DE_DOCUMENTO } from '../../../dominio/documento.js';
import {
  controlDesdeTexto,
  tipoDeDocumentoDesdeTexto,
} from '../../../dominio/valores-cerrados.js';
import { leerCuerpoCrudo } from './cuerpo-crudo.js';
import {
  CambiosDePerfilDto,
  PerfilDeCuidadorDto,
} from './dto-de-postulacion.js';

const UN_MINUTO_MS = 60_000;
const TIPOS_QUE_SE_ACEPTAN = ['application/pdf', 'image/jpeg', 'image/png'];

// El propio cuidador: arma su perfil, sube sus documentos y pide la revisión. Va ANTES de `CuidadoresController` en el
// módulo para que `yo` no se tome por el id de un cuidador. Solo cuentas con rol cuidador, y cada una ve únicamente
// lo suyo: no hay ningún id de otra persona en estas rutas.
@Controller('cuidadores/yo')
export class MiPerfilController {
  constructor(
    @Inject(CrearMiPerfil) private readonly crear: CrearMiPerfil,
    @Inject(ObtenerMiPerfil) private readonly obtener: ObtenerMiPerfil,
    @Inject(ActualizarMiPerfil) private readonly actualizar: ActualizarMiPerfil,
    @Inject(SubirDocumento) private readonly subir: SubirDocumento,
    @Inject(SolicitarRevision) private readonly revision: SolicitarRevision,
    @Inject(RenovarVerificacion)
    private readonly renovar: RenovarVerificacion,
  ) {}

  @Roles('cuidador')
  @Throttle({ default: { limit: 10, ttl: UN_MINUTO_MS } })
  @Post()
  async crearPerfil(
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Body() cuerpo: PerfilDeCuidadorDto,
  ): Promise<{ perfil: VistaDeMiPerfil }> {
    return { perfil: await this.crear.ejecutar(usuario, cuerpo) };
  }

  @Roles('cuidador')
  @Get()
  async miPerfil(
    @UsuarioActual() usuario: UsuarioAutenticado,
  ): Promise<{ perfil: VistaDeMiPerfil }> {
    return { perfil: await this.obtener.ejecutar(usuario) };
  }

  @Roles('cuidador')
  @Throttle({ default: { limit: 30, ttl: UN_MINUTO_MS } })
  @Patch()
  async cambiarPerfil(
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Body() cambios: CambiosDePerfilDto,
  ): Promise<{ perfil: VistaDeMiPerfil }> {
    return { perfil: await this.actualizar.ejecutar(usuario, cambios) };
  }

  // El archivo viaja como el cuerpo de la petición (sin multipart ni base64), con su `Content-Type`. El tipo que dice
  // el cliente solo se usa para descartar lo evidente: el servidor mira el CONTENIDO. El cuerpo se lee DESPUÉS de
  // verificar la sesión, con tope de tamaño.
  @Roles('cuidador')
  @Throttle({ default: { limit: 20, ttl: UN_MINUTO_MS } })
  @HttpCode(HttpStatus.CREATED)
  @Put('documentos/:tipo')
  async subirDocumento(
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Param('tipo') tipo: string,
    @Headers('content-type') tipoDeContenido: string | undefined,
    @Headers('x-nombre-de-archivo') nombre: string | undefined,
    @Req() peticion: Request,
  ): Promise<{ documento: VistaDeDocumento }> {
    const tipoDeDocumento = tipoDeDocumentoDesdeTexto(tipo);
    const declarado = (tipoDeContenido ?? '').split(';')[0]?.trim() ?? '';
    if (!TIPOS_QUE_SE_ACEPTAN.includes(declarado)) {
      throw new ErrorDeValidacion(
        'El archivo debe enviarse como PDF, JPEG o PNG',
        'documento.formato_invalido',
      );
    }
    const contenido = await leerCuerpoCrudo(
      peticion,
      TAMANO_MAXIMO_DE_DOCUMENTO,
    );
    const documento = await this.subir.ejecutar(usuario, {
      tipo: tipoDeDocumento,
      nombreOriginal: decodificarNombre(nombre),
      contenido,
    });
    return { documento };
  }

  @Roles('cuidador')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: UN_MINUTO_MS } })
  @Post('revision')
  async solicitarRevision(
    @UsuarioActual() usuario: UsuarioAutenticado,
  ): Promise<{ perfil: VistaDeMiPerfil }> {
    return { perfil: await this.revision.ejecutar(usuario) };
  }

  @Roles('cuidador')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: UN_MINUTO_MS } })
  @Post('verificaciones/:control/renovacion')
  async renovarVerificacion(
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Param('control') control: string,
  ): Promise<{ perfil: VistaDeMiPerfil }> {
    return {
      perfil: await this.renovar.ejecutar(usuario, controlDesdeTexto(control)),
    };
  }
}

// El nombre llega codificado en la cabecera (admite tildes). Si viene mal codificado, se ignora: es solo una etiqueta.
function decodificarNombre(valor: string | undefined): string {
  if (valor === undefined) return 'archivo';
  try {
    return decodeURIComponent(valor);
  } catch {
    return 'archivo';
  }
}
