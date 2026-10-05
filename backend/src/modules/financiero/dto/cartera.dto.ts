import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { PaginacionDto } from '../../../common/paginacion/paginacion';

export class ConsultaCuentasCobrarDto extends PaginacionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  clienteId?: string;
}

export class ConsultaCuentasPagarDto extends PaginacionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  proveedorId?: string;
}

export class ProximasVencerDto extends PaginacionDto {
  @ApiPropertyOptional({ example: 7, default: 7 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(365)
  dias?: number;
}

export class RecordatoriosDto {
  @ApiPropertyOptional({ example: 1, description: 'Solo clientes con al menos N días de mora (por defecto 1)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3650)
  diasMoraMinimo?: number;

  @ApiPropertyOptional({ type: [String], description: 'Limitar a estos clientes' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1000)
  @IsUUID('all', { each: true })
  idClientes?: string[];
}
