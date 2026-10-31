import { IsString, Matches } from 'class-validator';

// Solo la FORMA. El precio y el crédito del paquete salen de la base de datos; el cliente nunca los envía. El
// ValidationPipe rechaza cualquier campo no declarado.
export class CompraDeBolsaDto {
  @IsString({ message: 'El paquete no es válido' })
  @Matches(/^[A-Za-z0-9_-]{1,40}$/, { message: 'El paquete no es válido' })
  paquete!: string;
}
