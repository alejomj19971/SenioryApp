import {
  Body,
  Controller,
  Get,
  Headers,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  Sse,
  type MessageEvent,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import type { Observable } from 'rxjs';
import type { UsuarioAutenticado } from '../../../../compartido/aplicacion/puertos/verificador-de-tokens.js';
import {
  Roles,
  UsuarioActual,
} from '../../../../compartido/http/decoradores.js';
import {
  AbrirConversacion,
  ListarMisConversaciones,
} from '../../../aplicacion/casos-de-uso/conversaciones.js';
import {
  EnviarMensaje,
  ListarMensajes,
  type PaginaDeVistasDeMensajes,
} from '../../../aplicacion/casos-de-uso/mensajes.js';
import type {
  VistaDeConversacion,
  VistaDeMensaje,
} from '../../../aplicacion/vistas.js';
import { decodificarCursor } from '../../../dominio/cursor-de-mensajes.js';
import type { ConversacionId } from '../../../dominio/ids.js';
import { FlujoDeMensajes } from '../sse/flujo-de-mensajes.js';
import {
  AperturaDeConversacionDto,
  EnvioDeMensajeDto,
  ListadoDeMensajesDto,
} from './dto-de-mensajeria.js';

const UN_MINUTO_MS = 60_000;

// El chat entre la familia y el cuidador. Solo las dos partes de una conversación la leen o escriben: cualquier otra
// persona recibe 404, igual que si no existiera. El texto es texto plano: la interfaz lo muestra como texto, nunca
// como HTML.
@Controller()
export class ConversacionesController {
  constructor(
    @Inject(AbrirConversacion) private readonly abrir: AbrirConversacion,
    @Inject(ListarMisConversaciones)
    private readonly listar: ListarMisConversaciones,
    @Inject(ListarMensajes) private readonly mensajes: ListarMensajes,
    @Inject(EnviarMensaje) private readonly enviar: EnviarMensaje,
    @Inject(FlujoDeMensajes) private readonly flujo: FlujoDeMensajes,
  ) {}

  // Obtiene o crea la conversación con ese cuidador: 201 si la creó, 200 si ya existía.
  @Roles('familiar')
  @Throttle({ default: { limit: 30, ttl: UN_MINUTO_MS } })
  @Post('conversaciones')
  async abrirConversacion(
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Body() cuerpo: AperturaDeConversacionDto,
    @Res({ passthrough: true }) respuesta: Response,
  ): Promise<{ conversacion: VistaDeConversacion }> {
    const { conversacion, creada } = await this.abrir.ejecutar(
      usuario,
      cuerpo.cuidadorId,
    );
    respuesta.status(creada ? HttpStatus.CREATED : HttpStatus.OK);
    return { conversacion };
  }

  @Roles('familiar', 'cuidador')
  @Get('conversaciones')
  async misConversaciones(
    @UsuarioActual() usuario: UsuarioAutenticado,
  ): Promise<{ conversaciones: VistaDeConversacion[] }> {
    return { conversaciones: await this.listar.ejecutar(usuario) };
  }

  // Del más reciente al más antiguo; `?antes=` pide los anteriores.
  @Roles('familiar', 'cuidador')
  @Get('conversaciones/:id/mensajes')
  listarMensajes(
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() consulta: ListadoDeMensajesDto,
  ): Promise<PaginaDeVistasDeMensajes> {
    return this.mensajes.ejecutar(usuario, id as ConversacionId, consulta);
  }

  // 201 cuando se crea; 200 cuando es el reenvío de un mensaje ya enviado (mismo `idDeCliente`).
  @Roles('familiar', 'cuidador')
  @Throttle({ default: { limit: 60, ttl: UN_MINUTO_MS } })
  @Post('conversaciones/:id/mensajes')
  async enviarMensaje(
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() cuerpo: EnvioDeMensajeDto,
    @Res({ passthrough: true }) respuesta: Response,
  ): Promise<{ mensaje: VistaDeMensaje }> {
    const { mensaje, creado } = await this.enviar.ejecutar(
      usuario,
      id as ConversacionId,
      cuerpo,
    );
    respuesta.status(creado ? HttpStatus.CREATED : HttpStatus.OK);
    return { mensaje };
  }

  // Los mensajes nuevos de todas mis conversaciones, en vivo (Server-Sent Events). Tras una desconexión, el navegador
  // se reconecta con `Last-Event-ID` y el flujo sigue desde ahí. Ver `FlujoDeMensajes`.
  @Roles('familiar', 'cuidador')
  @Throttle({ default: { limit: 20, ttl: UN_MINUTO_MS } })
  @Sse('mensajeria/eventos')
  eventos(
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Headers('last-event-id') ultimoEvento: string | undefined,
  ): Observable<MessageEvent> {
    // Un `Last-Event-ID` que no es nuestro responde 400 antes de empezar a transmitir.
    const retomarDesde =
      ultimoEvento === undefined || ultimoEvento === ''
        ? null
        : decodificarCursor(ultimoEvento);
    return this.flujo.abrir(usuario, retomarDesde);
  }
}
