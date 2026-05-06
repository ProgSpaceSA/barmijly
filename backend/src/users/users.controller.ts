import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get()
  @Roles(UserRole.PROGRAMMING_HEAD, UserRole.PROJECT_MANAGER, UserRole.SENIOR_MANAGEMENT)
  findAll(
    @Query('role') role?: UserRole,
    @Query('companyId') companyId?: string,
    @Query('isActive') isActive?: string,
  ) {
    return this.usersService.findAll({
      role,
      companyId,
      isActive: isActive !== undefined ? isActive === 'true' : undefined,
    });
  }

  @Get('developers')
  @Roles(UserRole.PROGRAMMING_HEAD, UserRole.PROJECT_MANAGER)
  getDevelopers() {
    return this.usersService.getDevelopers();
  }

  @Get(':id')
  @Roles(UserRole.PROGRAMMING_HEAD, UserRole.PROJECT_MANAGER, UserRole.SENIOR_MANAGEMENT)
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Post()
  @Roles(UserRole.PROGRAMMING_HEAD, UserRole.PROJECT_MANAGER)
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Patch(':id')
  @Roles(UserRole.PROGRAMMING_HEAD, UserRole.PROJECT_MANAGER)
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.update(id, dto);
  }

  @Patch(':id/deactivate')
  @Roles(UserRole.PROGRAMMING_HEAD)
  deactivate(@Param('id') id: string) {
    return this.usersService.deactivate(id);
  }

  @Patch(':id/activate')
  @Roles(UserRole.PROGRAMMING_HEAD)
  activate(@Param('id') id: string) {
    return this.usersService.activate(id);
  }
}
