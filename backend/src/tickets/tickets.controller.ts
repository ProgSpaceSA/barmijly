import {
  Controller, Get, Post, Patch, Param, Body, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { TicketsService } from './tickets.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { ApproveTicketDto } from './dto/approve-ticket.dto';
import { AssignTicketDto } from './dto/assign-ticket.dto';
import { FilterTicketsDto } from './dto/filter-tickets.dto';
import { CloseTicketDto } from './dto/close-ticket.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Tickets')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('tickets')
export class TicketsController {
  constructor(private ticketsService: TicketsService) {}

  @Get()
  findAll(@CurrentUser() user: any, @Query() filters: FilterTicketsDto) {
    return this.ticketsService.findAll(user, filters);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.ticketsService.findOne(id, user);
  }

  @Post()
  create(@Body() dto: CreateTicketDto, @CurrentUser() user: any) {
    return this.ticketsService.create(dto, user);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTicketDto, @CurrentUser() user: any) {
    return this.ticketsService.update(id, dto, user);
  }

  @Patch(':id/submit')
  submit(@Param('id') id: string, @CurrentUser() user: any) {
    return this.ticketsService.submit(id, user);
  }

  @Patch(':id/approve')
  approve(@Param('id') id: string, @Body() dto: ApproveTicketDto, @CurrentUser() user: any) {
    return this.ticketsService.approve(id, dto, user);
  }

  @Patch(':id/assign')
  assign(@Param('id') id: string, @Body() dto: AssignTicketDto, @CurrentUser() user: any) {
    return this.ticketsService.assign(id, dto, user);
  }

  @Patch(':id/start')
  startWork(@Param('id') id: string, @CurrentUser() user: any) {
    return this.ticketsService.startWork(id, user);
  }

  @Patch(':id/submit-for-testing')
  submitForTesting(@Param('id') id: string, @CurrentUser() user: any) {
    return this.ticketsService.submitForTesting(id, user);
  }

  @Patch(':id/approve-completion')
  approveCompletion(@Param('id') id: string, @CurrentUser() user: any) {
    return this.ticketsService.approveCompletion(id, user);
  }

  @Patch(':id/close')
  close(@Param('id') id: string, @Body() dto: CloseTicketDto, @CurrentUser() user: any) {
    return this.ticketsService.close(id, dto, user);
  }

  @Patch(':id/archive')
  archive(@Param('id') id: string, @CurrentUser() user: any) {
    return this.ticketsService.archive(id, user);
  }

  @Patch(':id/reopen')
  reopen(@Param('id') id: string, @CurrentUser() user: any) {
    return this.ticketsService.reopen(id, user);
  }

  @Post(':id/duplicate')
  duplicate(@Param('id') id: string, @CurrentUser() user: any) {
    return this.ticketsService.duplicate(id, user);
  }
}
