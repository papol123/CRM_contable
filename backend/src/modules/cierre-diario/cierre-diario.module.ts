import { Module } from '@nestjs/common';
import { VentasModule } from '../ventas/ventas.module';
import { FinancieroModule } from '../financiero/financiero.module';
import { CierreDiarioController } from './cierre-diario.controller';
import { CierreDiarioService } from './cierre-diario.service';

@Module({
  imports: [VentasModule, FinancieroModule],
  controllers: [CierreDiarioController],
  providers: [CierreDiarioService],
})
export class CierreDiarioModule {}
