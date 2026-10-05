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

export class CreateClienteDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', description: 'UUID de tipo de documento (NIT, CC)' })
  @IsNotEmpty()
  @IsUUID('4')
  idTipoDocumento: string;

  @ApiProperty({ example: '901234567-8', description: 'Número de documento o NIT único' })
  @IsNotEmpty()
  @IsString()
  numeroDocumento: string;

  @ApiProperty({ example: 'Taller Mecánico Especializado El Pistón SAS', description: 'Razón social o nombre completo' })
  @IsNotEmpty()
  @IsString()
  razonSocial: string;

  @ApiProperty({ example: 'JURIDICA', enum: ['NATURAL', 'JURIDICA'] })
  @IsNotEmpty()
  @IsIn(['NATURAL', 'JURIDICA'])
  tipoPersona: 'NATURAL' | 'JURIDICA';

  @ApiPropertyOptional({ example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', description: 'UUID de la ciudad' })
  @IsOptional()
  @IsUUID('4')
  idCiudad?: string;

  @ApiPropertyOptional({ example: 25000000.00, description: 'Cupo de crédito asignado' })
  @IsOptional()
  @IsNumber()
  cupoCredito?: number;

  @ApiPropertyOptional({ example: 30, description: 'Días de plazo para crédito' })
  @IsOptional()
  @IsNumber()
  diasPlazo?: number;

  @ApiPropertyOptional({ example: '3109876543' })
  @IsOptional()
  @IsString()
  telefono?: string;

  @ApiPropertyOptional({ example: 'facturacion@tallerpiston.com' })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional({ example: 'Carrera 28 # 63G - 12' })
  @IsOptional()
  @IsString()
  direccion?: string;

  @ApiPropertyOptional({ example: 'O-13;O-15', description: "Responsabilidades fiscales DIAN separadas por ';' (vacío = R-99-PN)" })
  @IsOptional()
  @IsString()
  responsabilidadesFiscales?: string;
}

export class UpdateClienteDto {
  @ApiPropertyOptional({ example: 'Taller Mecánico El Pistón Actualizado SAS' })
  @IsOptional()
  @IsString()
  razonSocial?: string;

  @ApiPropertyOptional({ example: 'NATURAL', enum: ['NATURAL', 'JURIDICA'] })
  @IsOptional()
  @IsIn(['NATURAL', 'JURIDICA'])
  tipoPersona?: 'NATURAL' | 'JURIDICA';

  @ApiPropertyOptional({ example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d' })
  @IsOptional()
  @IsUUID('4')
  idCiudad?: string;

  @ApiPropertyOptional({ example: 30000000.00 })
  @IsOptional()
  @IsNumber()
  cupoCredito?: number;

  @ApiPropertyOptional({ example: 45 })
  @IsOptional()
  @IsNumber()
  diasPlazo?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  activo?: boolean;

  @ApiPropertyOptional({ example: 'O-13;O-15', description: "Responsabilidades fiscales DIAN separadas por ';' (vacío = R-99-PN)" })
  @IsOptional()
  @IsString()
  responsabilidadesFiscales?: string;
}

export class UpdateCupoCreditoDto {
  @ApiProperty({ example: 35000000.00, description: 'Nuevo cupo de crédito' })
  @IsNotEmpty()
  @IsNumber()
  cupoCredito: number;

  @ApiProperty({ example: 45, description: 'Días de plazo' })
  @IsNotEmpty()
  @IsNumber()
  diasPlazo: number;
}
