import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { rolesWith } from '../access/permissions';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

// Derived from the action matrix rather than restated here, so a change to
// `ROLE_ACTIONS` moves the endpoint with it.
const READERS = rolesWith('user:read');
const MANAGERS = rolesWith('user:manage');
// The assign picker, not the staff directory: whoever may assign a ticket needs
// the list of developers they can assign it to.
const ASSIGNERS = rolesWith('ticket:assign');

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get('mentionable')
  @ApiOperation({
    summary: 'People the caller may mention; pass ticketId to match what the API accepts',
  })
  findMentionable(@CurrentUser() user: any, @Query('ticketId') ticketId?: string) {
    return this.usersService.findMentionable(user, ticketId);
  }

  @Get()
  @Roles(...READERS)
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
  @Roles(...ASSIGNERS)
  @ApiOperation({ summary: 'Assignable developers; pass ticketId to scope to that ticket' })
  getDevelopers(@CurrentUser() user: any, @Query('ticketId') ticketId?: string) {
    return this.usersService.getDevelopers(user, ticketId);
  }

  @Get(':id/comments')
  @Roles(...READERS)
  getUserComments(@Param('id') id: string) {
    return this.usersService.getUserComments(id);
  }

  @Get(':id')
  @Roles(...READERS)
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Post()
  @Roles(...MANAGERS)
  create(@Body() dto: CreateUserDto, @CurrentUser() user: any) {
    return this.usersService.create(dto, user);
  }

  @Patch(':id')
  @Roles(...MANAGERS)
  update(@Param('id') id: string, @Body() dto: UpdateUserDto, @CurrentUser() user: any) {
    return this.usersService.update(id, dto, user);
  }

  @Patch(':id/deactivate')
  @Roles(...MANAGERS)
  deactivate(@Param('id') id: string, @CurrentUser() user: any) {
    return this.usersService.deactivate(id, user);
  }

  @Patch(':id/activate')
  @Roles(...MANAGERS)
  activate(@Param('id') id: string) {
    return this.usersService.activate(id);
  }
}
