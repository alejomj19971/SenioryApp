import {
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
  ValidateIf,
} from 'class-validator';
import {
  CALIDADES_DE_CONSENTIMIENTO,
  FINALIDADES_DE_CONSENTIMIENTO,
  PARENTESCOS,
} from '../../../dominio/valores-cerrados.js';

// Como en los demás DTO de Identidad, solo se verifica la FORMA: las reglas las aplica el dominio. Los
// campos que no se declaran aquí se rechazan (lista blanca del ValidationPipe).

export class ActualizarPerfilDto {
  // Si viene, no puede ser null: el nombre no se borra.
  @ValidateIf((_dto, valor) => valor !== undefined)
  @IsString({ message: 'El nombre no es válido' })
  @Length(1, 100, { message: 'El nombre debe tener entre 1 y 100 caracteres' })
  nombre?: string;

  // null borra el teléfono; si no viene, queda como está.
  @IsOptional()
  @IsString({ message: 'El teléfono no es válido' })
  @Matches(/^\+[1-9]\d{7,14}$/, {
    message:
      'El teléfono debe tener formato internacional, por ejemplo +573001234567',
  })
  telefono?: string | null;
}

export class RegistroDeAdultoMayorDto {
  @IsString({ message: 'El nombre es obligatorio' })
  @Length(1, 100, { message: 'El nombre debe tener entre 1 y 100 caracteres' })
  nombre!: string;

  @IsString({ message: 'La fecha de nacimiento es obligatoria' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'La fecha de nacimiento debe tener el formato AAAA-MM-DD',
  })
  fechaDeNacimiento!: string;

  @IsIn(PARENTESCOS, {
    message: `El parentesco debe ser uno de: ${PARENTESCOS.join(', ')}`,
  })
  parentesco!: string;
}

export class ConsentimientoDto {
  @IsIn(FINALIDADES_DE_CONSENTIMIENTO, {
    message: `La finalidad debe ser una de: ${FINALIDADES_DE_CONSENTIMIENTO.join(', ')}`,
  })
  finalidad!: string;

  @IsString({ message: 'La versión del texto es obligatoria' })
  @Length(1, 20, { message: 'La versión del texto no es válida' })
  versionDelTexto!: string;

  @IsIn(CALIDADES_DE_CONSENTIMIENTO, {
    message: `La calidad debe ser una de: ${CALIDADES_DE_CONSENTIMIENTO.join(', ')}`,
  })
  calidad!: string;
}
