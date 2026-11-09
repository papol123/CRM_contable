import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Pago, EstadoPago, AplicacionPagoVenta, AplicacionPagoCompra } from '../../database/entities/pagos-gastos.entity';
import { PagosService } from './pagos.service';

/**
 * Servicio de pagos aislado, sin depender de inventario ni ventas: lo usan
 * FinancieroModule (compras de contado, controlador /pagos) y VentasModule
 * (remisiones de contado) sin crear un ciclo Inventario → Ventas → Financiero.
 * PdfService y AuditoriaService vienen de módulos globales.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Pago, EstadoPago, AplicacionPagoVenta, AplicacionPagoCompra])],
  providers: [PagosService],
  exports: [PagosService],
})
export class PagosModule {}
