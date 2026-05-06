import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { SystemsService } from './systems.service';
import { CreateSystemDto } from './dto/create-system.dto';
import { UpdateSystemDto } from './dto/update-system.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('Systems')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('systems')
export class SystemsController {
  constructor(private systemsService: SystemsService) {}

  @Get()
  findAll(@Query('companyId') companyId?: string) {
    return this.systemsService.findAll(companyId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.systemsService.findOne(id);
  }

  @Post()
  @Roles(UserRole.PROGRAMMING_HEAD, UserRole.PROJECT_MANAGER)
  create(@Body() dto: CreateSystemDto) {
    return this.systemsService.create(dto);
  }

  @Patch(':id')
  @Roles(UserRole.PROGRAMMING_HEAD, UserRole.PROJECT_MANAGER)
  update(@Param('id') id: string, @Body() dto: UpdateSystemDto) {
    return this.systemsService.update(id, dto);
  }

  @Patch(':id/deactivate')
  @Roles(UserRole.PROGRAMMING_HEAD)
  deactivate(@Param('id') id: string) {
    return this.systemsService.deactivate(id);
  }
}
