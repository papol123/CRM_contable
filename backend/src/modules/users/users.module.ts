import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../../database/entities/user.entity';
import { Role } from '../../database/entities/role.entity';
import { Permission } from '../../database/entities/permission.entity';
import { RefreshToken } from '../../database/entities/refresh-token.entity';
import { UsersService } from './users.service';
import { RolesService } from './roles.service';
import { TokensUsuarioService } from './tokens-usuario.service';
import { UsersController } from './controllers/users.controller';
import { RolesController } from './controllers/roles.controller';

@Module({
  imports: [TypeOrmModule.forFeature([User, Role, Permission, RefreshToken])],
  controllers: [UsersController, RolesController],
  providers: [UsersService, RolesService, TokensUsuarioService],
  exports: [UsersService, TokensUsuarioService, TypeOrmModule],
})
export class UsersModule {}
