import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tercero } from '../../database/entities/tercero.entity';
import { Cliente } from '../../database/entities/cliente.entity';
import { Proveedor } from '../../database/entities/proveedor.entity';
import {
  Contacto,
  Telefono,
  Email,
  Direccion,
} from '../../database/entities/contacto-datos.entity';
import { ClientesController } from './controllers/clientes.controller';
import { ProveedoresController } from './controllers/proveedores.controller';
import { ClientesService } from './clientes.service';
import { ProveedoresService } from './proveedores.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Tercero,
      Cliente,
      Proveedor,
      Contacto,
      Telefono,
      Email,
      Direccion,
    ]),
  ],
  controllers: [ClientesController, ProveedoresController],
  providers: [ClientesService, ProveedoresService],
  exports: [ClientesService, ProveedoresService],
})
export class TercerosModule {}
