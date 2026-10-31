import { IsInt, IsUUID, Max, Min } from 'class-validator';
import {
  HORAS_MAXIMAS,
  HORAS_MINIMAS,
} from '../../../dominio/calculo-de-servicio.js';

// Solo la FORMA. Ni la tarifa ni las comisiones se envían: salen del directorio y de la política vigente, así
// que nadie puede cotizar un precio a su gusto. El ValidationPipe rechaza cualquier campo no declarado.
export class CotizacionDto {
  @IsUUID(undefined, { message: 'El cuidador no es válido' })
  cuidadorId!: string;

  @IsInt({ message: 'Las horas deben ser un número entero' })
  @Min(HORAS_MINIMAS, {
    message: `Las horas deben estar entre ${HORAS_MINIMAS} y ${HORAS_MAXIMAS}`,
  })
  @Max(HORAS_MAXIMAS, {
    message: `Las horas deben estar entre ${HORAS_MINIMAS} y ${HORAS_MAXIMAS}`,
  })
  horas!: number;
}
