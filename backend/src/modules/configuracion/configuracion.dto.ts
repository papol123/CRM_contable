import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
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

export class EmpresaDto {
  @ApiPropertyOptional({ example: 'Distribuidora de Repuestos Automotrices S.A.S.' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  razonSocial?: string;

  @ApiPropertyOptional({ example: 'Repuestos El Pistón' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  nombreComercial?: string;

  @ApiPropertyOptional({ example: '901234567-8' })
  @IsOptional()
  @Matches(/^[0-9.-]{5,20}$/, { message: 'NIT inválido' })
  nit?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  idCiudad?: string;

  @ApiPropertyOptional({ example: 'Cra 50 # 45-67, Bogotá' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  direccion?: string;

  @ApiPropertyOptional({ example: '6012345678' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  telefono?: string;

  @ApiPropertyOptional({ example: 'contacto@empresa.com' })
  @IsOptional()
  @IsEmail()
  @MaxLength(150)
  email?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  responsableIva?: boolean;
}

export class AlertasDto {
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  stockMinimoActivo?: boolean;

  @ApiPropertyOptional({ example: 30, description: 'Días de mora para considerar crítica una cuenta' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3650)
  diasMoraCartera?: number;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000000)
  umbralStockCritico?: number;
}

/** La contraseña SMTP no se recibe ni se guarda: se configura en SMTP_PASSWORD (Secret Manager). */
export class CorreoDto {
  @ApiPropertyOptional({ example: 'smtp.gmail.com' })
  @IsOptional()
  @Matches(/^[A-Za-z0-9.-]{1,253}$/, { message: 'Host SMTP inválido' })
  host?: string;

  @ApiPropertyOptional({ example: 587 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  puerto?: number;

  @ApiPropertyOptional({ example: 'notificaciones@empresa.com' })
  @IsOptional()
  @IsEmail()
  @MaxLength(150)
  remitente?: string;

  @ApiPropertyOptional({ example: 'notificaciones@empresa.com', description: 'Usuario SMTP (vacío si el servidor no autentica)' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  usuario?: string;

  @ApiPropertyOptional({ example: false, description: 'TLS implícito (puerto 465)' })
  @IsOptional()
  @IsBoolean()
  ssl?: boolean;
}
