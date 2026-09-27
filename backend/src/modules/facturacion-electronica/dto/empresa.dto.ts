import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

export class GuardarEmpresaDto {
  @ApiProperty({ example: '900123456-7', description: 'NIT con o sin dígito de verificación' })
  @IsNotEmpty()
  @Matches(/^\d{5,15}(-\d)?$/, { message: 'El NIT debe tener solo dígitos y opcionalmente -DV' })
  nit: string;

  @ApiProperty({ example: 'Repuestos Automotrices SAS' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(200)
  razonSocial: string;

  @ApiPropertyOptional({ example: 'AutoRepuestos' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  nombreComercial?: string;

  @ApiPropertyOptional({ description: 'UUID de la ciudad' })
  @IsOptional()
  @IsUUID()
  idCiudad?: string;

  @ApiPropertyOptional({ example: 'Calle 72 # 24-15' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  direccion?: string;

  @ApiPropertyOptional({ example: '6013456789' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  telefono?: string;

  @ApiPropertyOptional({ example: 'facturacion@empresa.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: true, description: 'Responsable de IVA' })
  @IsOptional()
  @IsBoolean()
  responsableIva?: boolean;

  @ApiPropertyOptional({ example: 'O-13;O-15', description: "Códigos DIAN separados por ';' (R-99-PN = no aplica)" })
  @IsOptional()
  @Matches(/^[A-Z]-\d{2}(-[A-Z]{2})?(;[A-Z]-\d{2}(-[A-Z]{2})?)*$/, {
    message: "Formato de responsabilidades inválido. Ejemplo: 'O-13;O-15'",
  })
  responsabilidadesFiscales?: string;

  @ApiPropertyOptional({ example: '4530', description: 'Código CIIU' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  actividadEconomica?: string;
}
