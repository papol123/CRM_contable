import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Pais } from '../../database/entities/pais.entity';
import { Departamento } from '../../database/entities/departamento.entity';
import { Ciudad } from '../../database/entities/ciudad.entity';
import { TipoDocumento } from '../../database/entities/tipo-documento.entity';
import { CategoriaProducto } from '../../database/entities/categoria-producto.entity';
import { UnidadMedida } from '../../database/entities/unidad-medida.entity';
import { Impuesto } from '../../database/entities/impuesto.entity';
import { MetodoPago } from '../../database/entities/metodo-pago.entity';
import { Bodega } from '../../database/entities/bodega.entity';
import { CategoriaGasto } from '../../database/entities/categoria-gasto.entity';
import { Marca } from '../../database/entities/marca.entity';
import { Producto } from '../../database/entities/producto.entity';
import { CatalogosController } from './catalogos.controller';
import { CatalogosService } from './catalogos.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Pais,
      Departamento,
      Ciudad,
      TipoDocumento,
      CategoriaProducto,
      UnidadMedida,
      Impuesto,
      MetodoPago,
      Bodega,
      CategoriaGasto,
      Marca,
      Producto,
    ]),
  ],
  controllers: [CatalogosController],
  providers: [CatalogosService],
  exports: [CatalogosService],
})
export class CatalogosModule {}
