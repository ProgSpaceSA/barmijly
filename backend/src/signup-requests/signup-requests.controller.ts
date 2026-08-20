import { Controller, Get, Post, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { rolesWith } from '../access/permissions';
import { SignupRequestsService } from './signup-requests.service';
import { CreateSignupRequestDto } from './dto/create-signup-request.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';

const REVIEWERS = rolesWith('signup:review');

@ApiTags('Signup Requests')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('signup-requests')
export class SignupRequestsController {
  constructor(private service: SignupRequestsService) {}

  @Public()
  @Post()
  create(@Body() dto: CreateSignupRequestDto) {
    return this.service.create(dto);
  }

  @ApiBearerAuth()
  @Roles(...REVIEWERS)
  @Get()
  findAll() {
    return this.service.findAll();
  }

  @ApiBearerAuth()
  @Roles(...REVIEWERS)
  @Patch(':id/approve')
  approve(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.approve(id, user);
  }

  @ApiBearerAuth()
  @Roles(...REVIEWERS)
  @Patch(':id/reject')
  reject(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.reject(id, user);
  }
}
