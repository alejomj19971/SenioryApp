import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

// Los DTO solo verifican la FORMA. Las reglas (contraseña común, correo ya registrado, versión de la
// política vigente) las aplica el dominio. Ninguno declara `rol`: el ValidationPipe global rechaza
// cualquier campo no declarado, así que nadie puede elegir su rol al registrarse.

// Tope generoso: el largo exacto (10 a 128 caracteres, ya normalizado) lo decide el dominio, pero
// sin tope alguien podría mandar 100 KB y obligar a calcular un hash enorme.
const TOPE_DE_CONTRASENA = 512;

// Quien pega su correo desde otra parte suele traer un espacio al final: se recorta antes de validar.
const recortar = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class RegistroDto {
  @IsString({ message: 'El nombre es obligatorio' })
  @Length(1, 100, { message: 'El nombre debe tener entre 1 y 100 caracteres' })
  nombre!: string;

  @Transform(recortar)
  @IsEmail({}, { message: 'El correo no es válido' })
  @MaxLength(254, { message: 'El correo no es válido' })
  correo!: string;

  @IsString({ message: 'La contraseña es obligatoria' })
  @MaxLength(TOPE_DE_CONTRASENA, {
    message: 'La contraseña debe tener entre 10 y 128 caracteres',
  })
  contrasena!: string;

  @IsOptional()
  @IsString({ message: 'El teléfono no es válido' })
  @Matches(/^\+[1-9]\d{7,14}$/, {
    message:
      'El teléfono debe tener formato internacional, por ejemplo +573001234567',
  })
  telefono?: string;

  @IsString({ message: 'Debes aceptar la política de tratamiento de datos' })
  @Length(1, 20, { message: 'La versión de la política no es válida' })
  versionPolitica!: string;
}

export class SolicitudDeRecuperacionDto {
  // Sin validar el formato del correo: un correo mal escrito responde igual que uno sin cuenta.
  @IsString({ message: 'El correo es obligatorio' })
  @MaxLength(254, { message: 'El correo no es válido' })
  correo!: string;
}

export class RestablecimientoDeContrasenaDto {
  // El token del enlace: 43 caracteres. Un largo muy distinto no puede ser un enlace nuestro.
  @IsString({ message: 'El enlace no es válido' })
  @Length(20, 200, { message: 'El enlace no es válido' })
  token!: string;

  @IsString({ message: 'La contraseña es obligatoria' })
  @MaxLength(TOPE_DE_CONTRASENA, {
    message: 'La contraseña debe tener entre 10 y 128 caracteres',
  })
  contrasenaNueva!: string;
}

export class CambioDeContrasenaDto {
  @IsString({ message: 'La contraseña actual es obligatoria' })
  @MaxLength(TOPE_DE_CONTRASENA, {
    message: 'La contraseña actual no es válida',
  })
  contrasenaActual!: string;

  @IsString({ message: 'La contraseña nueva es obligatoria' })
  @MaxLength(TOPE_DE_CONTRASENA, {
    message: 'La contraseña debe tener entre 10 y 128 caracteres',
  })
  contrasenaNueva!: string;
}

export class InicioDeSesionDto {
  @IsString({ message: 'El correo es obligatorio' })
  @MaxLength(254, { message: 'El correo no es válido' })
  correo!: string;

  // Sin largo mínimo: una contraseña de antes de las reglas actuales debe poder seguir entrando.
  @IsString({ message: 'La contraseña es obligatoria' })
  @MaxLength(TOPE_DE_CONTRASENA, { message: 'La contraseña no es válida' })
  contrasena!: string;
}
