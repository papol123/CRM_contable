import { Module } from '@nestjs/common';
import { MantenimientoController } from './mantenimiento.controller';
import { MantenimientoService } from './mantenimiento.service';
import { CloudSqlBackups } from './cloud-sql-backups';

@Module({
  controllers: [MantenimientoController],
  providers: [MantenimientoService, CloudSqlBackups],
})
export class MantenimientoModule {}
