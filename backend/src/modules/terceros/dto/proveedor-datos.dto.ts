import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateProveedorDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', description: 'UUID de tipo de documento' })
  @IsNotEmpty()
  @IsUUID('4')
  idTipoDocumento: string;

  @ApiProperty({ example: '900123456-1', description: 'NIT o documento único' })
  @IsNotEmpty()
  @IsString()
  numeroDocumento: string;

  @ApiProperty({ example: 'Distribuidora Automotriz de Colombia SAS' })
  @IsNotEmpty()
  @IsString()
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
  @IsNumber()
  diasPlazo?: number;

  @ApiPropertyOptional({ example: '6013456789' })
  @IsOptional()
  @IsString()
  telefono?: string;

  @ApiPropertyOptional({ example: 'ventas@distribuidoraauto.com.co' })
  @IsOptional()
  @IsString()
  email?: string;
}

export class UpdateProveedorDto {
  @ApiPropertyOptional({ example: 'Distribuidora Automotriz de Colombia SAS' })
  @IsOptional()
  @IsString()
  razonSocial?: string;

  @ApiPropertyOptional({ example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d' })
  @IsOptional()
  @IsUUID('4')
  idCiudad?: string;

  @ApiPropertyOptional({ example: 45 })
  @IsOptional()
  @IsNumber()
  diasPlazo?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

export class AddTelefonoDto {
  @ApiProperty({ example: '3119876543' })
  @IsNotEmpty()
  @IsString()
  numero: string;

  @ApiPropertyOptional({ example: 'MOVIL' })
  @IsOptional()
  @IsString()
  tipo?: string;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  principal?: boolean;
}

export class AddEmailDto {
  @ApiProperty({ example: 'contacto@empresa.com' })
  @IsNotEmpty()
  @IsString()
  email: string;

  @ApiPropertyOptional({ example: 'FACTURACION' })
  @IsOptional()
  @IsString()
  tipo?: string;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  principal?: boolean;
}
