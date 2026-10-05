import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PATRON_DOCUMENTO } from './cliente.dto';

export class CreateProveedorDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', description: 'UUID de tipo de documento' })
  @IsNotEmpty()
  @IsUUID('4')
  idTipoDocumento: string;

  @ApiProperty({ example: '900123456-1', description: 'NIT o documento único' })
  @IsNotEmpty()
  @IsString()
  @Matches(PATRON_DOCUMENTO, { message: 'El documento admite números, letras, punto y guion (3 a 30 caracteres)' })
  numeroDocumento: string;

  @ApiProperty({ example: 'Distribuidora Automotriz de Colombia SAS' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(200)
  razonSocial: string;

  @ApiProperty({ example: 'JURIDICA', enum: ['NATURAL', 'JURIDICA'] })
  @IsNotEmpty()
  @IsIn(['NATURAL', 'JURIDICA'])
  tipoPersona: 'NATURAL' | 'JURIDICA';

  @ApiPropertyOptional({ example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d' })
  @IsOptional()
  @IsUUID('4')
  idCiudad?: string;

  @ApiPropertyOptional({ example: 30, description: 'Días de plazo pactados' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  diasPlazo?: number;

  @ApiPropertyOptional({ example: '6013456789' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  telefono?: string;

  @ApiPropertyOptional({ example: 'ventas@distribuidoraauto.com.co' })
  @IsOptional()
  @IsEmail({}, { message: 'El correo electrónico no es válido' })
  @MaxLength(150)
  email?: string;
}

export class UpdateProveedorDto {
  @ApiPropertyOptional({ example: 'Distribuidora Automotriz de Colombia SAS' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  razonSocial?: string;

  @ApiPropertyOptional({ example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d' })
  @IsOptional()
  @IsUUID('4')
  idCiudad?: string;

  @ApiPropertyOptional({ example: 45 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  diasPlazo?: number;

  @ApiPropertyOptional({ example: true, description: 'Reactivar o desactivar requiere el permiso terceros.eliminar' })
  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

export class AddTelefonoDto {
  @ApiProperty({ example: '3119876543' })
  @IsNotEmpty()
  @IsString()
  @Matches(/^[0-9+()\s-]{5,30}$/, { message: 'Teléfono inválido' })
  numero: string;

  @ApiPropertyOptional({ example: 'MOVIL', enum: ['MOVIL', 'FIJO', 'WHATSAPP', 'OTRO'] })
  @IsOptional()
  @IsIn(['MOVIL', 'FIJO', 'WHATSAPP', 'OTRO'])
  tipo?: string;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  principal?: boolean;
}

export class AddEmailDto {
  @ApiProperty({ example: 'contacto@empresa.com' })
  @IsEmail({}, { message: 'El correo electrónico no es válido' })
  @MaxLength(150)
  email: string;

  @ApiPropertyOptional({ example: 'FACTURACION' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  tipo?: string;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  principal?: boolean;
}
