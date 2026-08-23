import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { rolesWith } from '../access/permissions';
import { SystemsService } from './systems.service';
import { CreateSystemDto } from './dto/create-system.dto';
import { UpdateSystemDto } from './dto/update-system.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

const STRUCTURE_ADMINS = rolesWith('structure:manage');
const SYSTEM_CREATORS = [...new Set([...STRUCTURE_ADMINS, ...rolesWith('structure:create-system')])];
const ROSTER_MANAGERS = [...new Set([...STRUCTURE_ADMINS, ...rolesWith('structure:manage-roster')])];
const DEACTIVATORS = rolesWith('structure:deactivate');

@ApiTags('Systems')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('systems')
export class SystemsController {
  constructor(private systemsService: SystemsService) {}

  @Get()
  findAll(@CurrentUser() user: any, @Query('companyId') companyId?: string) {
    return this.systemsService.findAll(user, companyId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.systemsService.findOne(id, user);
  }

  @Post()
  @Roles(...SYSTEM_CREATORS)
  create(@Body() dto: CreateSystemDto, @CurrentUser() user: any) {
    return this.systemsService.create(dto, user);
  }

  @Patch(':id')
  @Roles(...STRUCTURE_ADMINS)
  update(@Param('id') id: string, @Body() dto: UpdateSystemDto, @CurrentUser() user: any) {
    return this.systemsService.update(id, dto, user);
  }

  @Patch(':id/deactivate')
  @Roles(...DEACTIVATORS)
  @ApiOperation({ summary: 'Deactivate a system (soft). Same roles as activate.' })
  deactivate(@Param('id') id: string, @CurrentUser() user: any) {
    return this.systemsService.deactivate(id, user);
  }

  @Patch(':id/activate')
  @Roles(...DEACTIVATORS)
  @ApiOperation({ summary: 'Re-activate a previously deactivated system' })
  activate(@Param('id') id: string, @CurrentUser() user: any) {
    return this.systemsService.activate(id, user);
  }

  @Post(':id/users')
  @Roles(...ROSTER_MANAGERS)
  addUser(@Param('id') id: string, @Body('userId') userId: string, @CurrentUser() user: any) {
    return this.systemsService.addUser(id, userId, user);
  }

  @Delete(':id/users/:userId')
  @Roles(...ROSTER_MANAGERS)
  removeUser(@Param('id') id: string, @Param('userId') userId: string, @CurrentUser() user: any) {
    return this.systemsService.removeUser(id, userId, user);
  }
}
