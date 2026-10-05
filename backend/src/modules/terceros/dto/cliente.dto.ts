import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaginacionDto } from '../../../common/paginacion/paginacion';

export const PATRON_DOCUMENTO = /^[0-9A-Za-z.-]{3,30}$/;

export class CreateClienteDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', description: 'UUID de tipo de documento (NIT, CC)' })
  @IsNotEmpty()
  @IsUUID('4')
  idTipoDocumento: string;

  @ApiProperty({ example: '901234567-8', description: 'Número de documento o NIT único' })
  @IsNotEmpty()
  @IsString()
  @Matches(PATRON_DOCUMENTO, { message: 'El documento admite números, letras, punto y guion (3 a 30 caracteres)' })
  numeroDocumento: string;

  @ApiProperty({ example: 'Taller Mecánico Especializado El Pistón SAS', description: 'Razón social o nombre completo' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(200)
  razonSocial: string;

  @ApiProperty({ example: 'JURIDICA', enum: ['NATURAL', 'JURIDICA'] })
  @IsNotEmpty()
  @IsIn(['NATURAL', 'JURIDICA'])
  tipoPersona: 'NATURAL' | 'JURIDICA';

  @ApiPropertyOptional({ example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', description: 'UUID de la ciudad' })
  @IsOptional()
  @IsUUID('4')
  idCiudad?: string;

  @ApiPropertyOptional({ example: 25000000.0, description: 'Cupo de crédito. Requiere el permiso cartera.gestionar' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9999999999999)
  cupoCredito?: number;

  @ApiPropertyOptional({ example: 30, description: 'Días de plazo. Requiere el permiso cartera.gestionar' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  diasPlazo?: number;

  @ApiPropertyOptional({ example: '3109876543' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  telefono?: string;

  @ApiPropertyOptional({ example: 'facturacion@tallerpiston.com' })
  @IsOptional()
  @IsEmail({}, { message: 'El correo electrónico no es válido' })
  @MaxLength(150)
  email?: string;

  @ApiPropertyOptional({ example: 'Carrera 28 # 63G - 12' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  direccion?: string;

  @ApiPropertyOptional({ example: 'O-13;O-15', description: "Responsabilidades fiscales separadas por ';'" })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  responsabilidadesFiscales?: string;
}

/** Datos de contacto y dirección. Cupo y plazo se cambian con PATCH /clientes/{id}/cupo-credito. */
export class UpdateClienteDto {
  @ApiPropertyOptional({ example: 'Taller Mecánico El Pistón Actualizado SAS' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  razonSocial?: string;

  @ApiPropertyOptional({ example: 'NATURAL', enum: ['NATURAL', 'JURIDICA'] })
  @IsOptional()
  @IsIn(['NATURAL', 'JURIDICA'])
  tipoPersona?: 'NATURAL' | 'JURIDICA';

  @ApiPropertyOptional({ example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d' })
  @IsOptional()
  @IsUUID('4')
  idCiudad?: string;

  @ApiPropertyOptional({ example: true, description: 'Reactivar o desactivar requiere el permiso terceros.eliminar' })
  @IsOptional()
  @IsBoolean()
  activo?: boolean;

  @ApiPropertyOptional({ example: 'O-13;O-15', description: "Responsabilidades fiscales separadas por ';'" })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  responsabilidadesFiscales?: string;
}

export class UpdateCupoCreditoDto {
  @ApiProperty({ example: 35000000.0, description: 'Nuevo cupo de crédito' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9999999999999)
  cupoCredito: number;

  @ApiProperty({ example: 45, description: 'Días de plazo' })
  @IsInt()
  @Min(0)
  @Max(365)
  diasPlazo: number;

  @ApiPropertyOptional({ example: 'Revisión anual de crédito' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  motivo?: string;
}

export class BloqueoCreditoDto {
  @ApiProperty({ example: 'Cartera vencida a más de 90 días', description: 'Obligatorio: queda en la bitácora' })
  @IsString()
  @IsNotEmpty()
  @MinLength(5)
  @MaxLength(500)
  motivo: string;
}

export class ConsultaTercerosDto extends PaginacionDto {
  @ApiPropertyOptional({ description: 'Busca por documento o razón social' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  ciudadId?: string;
}

export class HistorialComprasDto extends PaginacionDto {
  @ApiPropertyOptional({ example: '2026-01-01' })
  @IsOptional()
  @IsDateString()
  desde?: string;

  @ApiPropertyOptional({ example: '2026-09-30' })
  @IsOptional()
  @IsDateString()
  hasta?: string;
}
