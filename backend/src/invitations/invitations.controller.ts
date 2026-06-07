import { Controller, Get, Post, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { InvitationsService } from './invitations.service';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Invitations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.PROGRAMMING_HEAD, UserRole.PROJECT_MANAGER, UserRole.SENIOR_MANAGEMENT)
@Controller('invitations')
export class InvitationsController {
  constructor(private invitationsService: InvitationsService) {}

  @Get()
  findAll() {
    return this.invitationsService.findAll();
  }

  @Post()
  create(@Body() dto: CreateInvitationDto, @CurrentUser() user: any) {
    return this.invitationsService.create(dto, user);
  }

  @Patch(':id/resend')
  resend(@Param('id') id: string) {
    return this.invitationsService.resend(id);
  }

  @Patch(':id/revoke')
  revoke(@Param('id') id: string) {
    return this.invitationsService.revoke(id);
  }
}
