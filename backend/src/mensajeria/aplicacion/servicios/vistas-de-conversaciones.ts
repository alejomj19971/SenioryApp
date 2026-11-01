import type { ConsultaDeDirectorio } from '../../../directorio/aplicacion/puertos/entrada/consulta-de-directorio.js';
import type { ConsultaDeIdentidad } from '../../../identidad/aplicacion/puertos/entrada/consulta-de-identidad.js';
import type { ConsultaDeReservas } from '../../../reservas/aplicacion/puertos/entrada/consulta-de-reservas.js';
import type { Conversacion } from '../../dominio/conversacion.js';
import type { VistaDeConversacion } from '../vistas.js';
import type { Participante } from './acceso-a-conversaciones.js';

const NOMBRE_SI_NO_HAY = 'Familia';

// Arma lo que se muestra de una conversación: con quién se habla (solo nombre y foto) y si hoy se puede escribir.
export class VistasDeConversaciones {
  constructor(
    private readonly identidad: ConsultaDeIdentidad,
    private readonly directorio: ConsultaDeDirectorio,
    private readonly reservas: ConsultaDeReservas,
  ) {}

  async vistaDe(
    conversacion: Conversacion,
    participante: Participante,
  ): Promise<VistaDeConversacion> {
    const [otraParte, puedeEscribir] = await Promise.all([
      this.otraParte(conversacion, participante),
      this.reservas.hayServicioActivoEntre(
        conversacion.familiarId,
        conversacion.cuidadorId,
      ),
    ]);
    return {
      id: conversacion.id,
      otraParte,
      ultimoMensajeEn: conversacion.ultimoMensajeEn?.toISOString() ?? null,
      puedeEscribir,
    };
  }

  // La familia ve al cuidador (nombre y foto); el cuidador ve a la familia (solo el nombre). Ni el teléfono ni el
  // correo de nadie salen de aquí.
  private async otraParte(
    conversacion: Conversacion,
    participante: Participante,
  ): Promise<{ nombre: string; fotoUrl: string | null }> {
    if (participante.rol === 'familiar') {
      const cuidador = await this.directorio.obtenerContactoDeCuidador(
        conversacion.cuidadorId,
      );
      return {
        nombre: cuidador?.nombre ?? 'Cuidador',
        fotoUrl: cuidador?.fotoUrl ?? null,
      };
    }
    const familia = await this.identidad.obtenerContacto(
      conversacion.familiarId,
    );
    return { nombre: familia?.nombre ?? NOMBRE_SI_NO_HAY, fotoUrl: null };
  }
}
