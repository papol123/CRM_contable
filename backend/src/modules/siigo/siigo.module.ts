import { Module } from '@nestjs/common';
import { SiigoController } from './siigo.controller';
import { SiigoService } from './siigo.service';

@Module({
  controllers: [SiigoController],
  providers: [SiigoService],
  exports: [SiigoService],
})
export class SiigoModule {}
