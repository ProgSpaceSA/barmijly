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

// Derived from the action matrix rather than restated here, so a change to
// `ROLE_ACTIONS` moves these endpoints with it.
const MANAGERS = rolesWith('structure:manage');
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
  @Roles(...MANAGERS)
  create(@Body() dto: CreateSystemDto) {
    return this.systemsService.create(dto);
  }

  @Patch(':id')
  @Roles(...MANAGERS)
  update(@Param('id') id: string, @Body() dto: UpdateSystemDto) {
    return this.systemsService.update(id, dto);
  }

  @Patch(':id/deactivate')
  @Roles(...DEACTIVATORS)
  @ApiOperation({ summary: 'Deactivate a system (soft). Same roles as activate.' })
  deactivate(@Param('id') id: string) {
    return this.systemsService.deactivate(id);
  }

  @Patch(':id/activate')
  @Roles(...DEACTIVATORS)
  @ApiOperation({ summary: 'Re-activate a previously deactivated system' })
  activate(@Param('id') id: string) {
    return this.systemsService.activate(id);
  }

  @Post(':id/users')
  @Roles(...MANAGERS)
  addUser(@Param('id') id: string, @Body('userId') userId: string) {
    return this.systemsService.addUser(id, userId);
  }

  @Delete(':id/users/:userId')
  @Roles(...MANAGERS)
  removeUser(@Param('id') id: string, @Param('userId') userId: string) {
    return this.systemsService.removeUser(id, userId);
  }
}
