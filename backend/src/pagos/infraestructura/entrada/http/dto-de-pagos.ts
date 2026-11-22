import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

// Solo la FORMA. El precio y el crédito del paquete salen de la base de datos; el cliente nunca los envía. El
// ValidationPipe rechaza cualquier campo no declarado.
export class CompraDeBolsaDto {
  @IsString({ message: 'El paquete no es válido' })
  @Matches(/^[A-Za-z0-9_-]{1,40}$/, { message: 'El paquete no es válido' })
  paquete!: string;
}

// Lo que escribe el administrador al confirmar que ya transfirió de verdad (por fuera del sistema): siempre
// debe quedar un rastro de qué se hizo, nunca vacío.
export class ConfirmarPagoDeLiquidacionDto {
  @IsString({ message: 'La referencia no es válida' })
  @IsNotEmpty({ message: 'La referencia no puede estar vacía' })
  @MaxLength(200, { message: 'La referencia es demasiado larga' })
  referencia!: string;
}
