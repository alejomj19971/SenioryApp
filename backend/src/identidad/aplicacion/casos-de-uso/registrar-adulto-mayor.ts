import type { Auditoria } from '../../../compartido/aplicacion/puertos/auditoria.js';
import type { GeneradorDeIds } from '../../../compartido/aplicacion/puertos/generador-de-ids.js';
import type { Reloj } from '../../../compartido/aplicacion/puertos/reloj.js';
import type { UnidadDeTrabajo } from '../../../compartido/aplicacion/puertos/unidad-de-trabajo.js';
import { FechaCivil } from '../../../compartido/dominio/fecha-civil.js';
import { AdultoMayor } from '../../dominio/adulto-mayor.js';
import type { UsuarioId } from '../../dominio/ids.js';
import { NombrePersona } from '../../dominio/nombre-persona.js';
import { parentescoDesdeTexto } from '../../dominio/valores-cerrados.js';
import { Vinculo } from '../../dominio/vinculo.js';
import type { RepositorioAdultosMayores } from '../puertos/salida/repositorio-adultos-mayores.js';
import type { RepositorioVinculos } from '../puertos/salida/repositorio-vinculos.js';
import type { EventosDeIdentidad } from '../servicios/eventos-de-identidad.js';
import { vistaDeAdultoMayor, type VistaDeAdultoMayor } from '../vistas.js';

export interface EntradaDeAdultoMayor {
  nombre: string;
  // «AAAA-MM-DD»
  fechaDeNacimiento: string;
  parentesco: string;
}

// Un familiar registra a la persona que cuida. Quien la registra queda vinculado como su responsable,
// en la misma transacción: no puede quedar una persona sin nadie vinculado, ni un vínculo sin persona.
export class RegistrarAdultoMayor {
  constructor(
    private readonly adultosMayores: RepositorioAdultosMayores,
    private readonly vinculos: RepositorioVinculos,
    private readonly unidadDeTrabajo: UnidadDeTrabajo,
    private readonly eventos: EventosDeIdentidad,
    private readonly auditoria: Auditoria,
    private readonly reloj: Reloj,
    private readonly ids: GeneradorDeIds,
    private readonly zonaHorariaNegocio: string,
  ) {}

  async ejecutar(
    usuarioId: string,
    entrada: EntradaDeAdultoMayor,
  ): Promise<VistaDeAdultoMayor> {
    const nombre = NombrePersona.crear(entrada.nombre);
    const fechaDeNacimiento = FechaCivil.desdeTexto(entrada.fechaDeNacimiento);
    const parentesco = parentescoDesdeTexto(entrada.parentesco);

    const ahora = this.reloj.ahora();
    const hoy = FechaCivil.hoy(this.reloj, this.zonaHorariaNegocio);
    const familiarId = usuarioId as UsuarioId;
    const adultoMayor = AdultoMayor.registrar({
      id: this.ids.nuevo<'AdultoMayor'>(),
      nombre,
      fechaDeNacimiento,
      creadoPor: familiarId,
      hoy,
      ahora,
    });
    const vinculo = Vinculo.crear({
      id: this.ids.nuevo<'Vinculo'>(),
      familiarId,
      adultoMayorId: adultoMayor.id,
      parentesco,
      esResponsable: true,
      ahora,
    });

    await this.unidadDeTrabajo.ejecutar(async () => {
      await this.adultosMayores.guardar(adultoMayor);
      await this.vinculos.guardar(vinculo);
      await this.eventos.publicar(
        'identidad.adulto_mayor_registrado',
        { adultoMayorId: adultoMayor.id, registradoPor: familiarId },
        ahora,
      );
      await this.eventos.publicar(
        'identidad.vinculo_creado',
        { vinculoId: vinculo.id, familiarId, adultoMayorId: adultoMayor.id },
        ahora,
      );
    });

    await this.auditoria.registrar({
      actorId: familiarId,
      accion: 'identidad.registrar_adulto_mayor',
      recursoTipo: 'adulto_mayor',
      recursoId: adultoMayor.id,
      resultado: 'permitido',
    });
    await this.auditoria.registrar({
      actorId: familiarId,
      accion: 'identidad.crear_vinculo',
      recursoTipo: 'vinculo',
      recursoId: vinculo.id,
      resultado: 'permitido',
      metadatos: { adultoMayorId: adultoMayor.id },
    });
    // Recién registrada: todavía no hay consentimiento.
    return vistaDeAdultoMayor(
      adultoMayor,
      vinculo,
      adultoMayor.edadEn(hoy),
      false,
    );
  }
}
