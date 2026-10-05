import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FacturaVenta } from '../../database/entities/factura-venta.entity';
import { Empresa } from '../../database/entities/empresa.entity';
import { FacturacionElectronicaController } from './facturacion-electronica.controller';
import { FacturacionElectronicaService } from './facturacion-electronica.service';
import {
  PROVEEDOR_FACTURACION,
  ProveedorFacturacion,
  ProveedorNoConfigurado,
} from './proveedores/proveedor-facturacion';

@Module({
  imports: [TypeOrmModule.forFeature([FacturaVenta, Empresa])],
  controllers: [FacturacionElectronicaController],
  providers: [
    FacturacionElectronicaService,
    {
      // Aquí se conectará el proveedor tecnológico o la integración directa con la
      // DIAN según FACTURACION_PROVEEDOR. Por ahora solo existe 'ninguno'.
      provide: PROVEEDOR_FACTURACION,
      inject: [ConfigService],
      useFactory: (config: ConfigService): ProveedorFacturacion => {
        const nombre = config.get<string>('FACTURACION_PROVEEDOR', 'ninguno');
        switch (nombre) {
          default:
            return new ProveedorNoConfigurado();
        }
      },
    },
  ],
  exports: [FacturacionElectronicaService],
})
export class FacturacionElectronicaModule {}
