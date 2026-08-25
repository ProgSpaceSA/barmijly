import {
  Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { TicketsService } from './tickets.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { ApproveTicketDto } from './dto/approve-ticket.dto';
import { AssignTicketDto } from './dto/assign-ticket.dto';
import { FilterTicketsDto } from './dto/filter-tickets.dto';
import { CloseTicketDto } from './dto/close-ticket.dto';
import { ForceStatusDto } from './dto/force-status.dto';
import { SetAssigneeDto } from './dto/set-assignee.dto';
import { PauseTicketDto, ResumeTicketDto } from './dto/pause-ticket.dto';
import { RequestChangesDto } from './dto/request-changes.dto';
import { AddDependencyDto } from './dto/add-dependency.dto';
import { UpdateTicketPlanDto } from './dto/update-ticket-plan.dto';
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

  @Get('my-created')
  findMyCreated(@CurrentUser() user: any) {
    return this.ticketsService.findMyCreated(user);
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

  @Patch(':id/plan')
  updatePlan(@Param('id') id: string, @Body() dto: UpdateTicketPlanDto, @CurrentUser() user: any) {
    return this.ticketsService.updatePlan(id, dto, user);
  }

  @Get(':id/assignees')
  listAssignees(@Param('id') id: string, @CurrentUser() user: any) {
    return this.ticketsService.listAssignees(id, user);
  }

  @Post(':id/assignees')
  addAssignee(@Param('id') id: string, @Body() dto: SetAssigneeDto, @CurrentUser() user: any) {
    return this.ticketsService.addAssignee(id, dto.developerId, user);
  }

  @Delete(':id/assignees/:developerId')
  removeAssignee(
    @Param('id') id: string,
    @Param('developerId') developerId: string,
    @CurrentUser() user: any,
  ) {
    return this.ticketsService.removeAssignee(id, developerId, user);
  }

  @Patch(':id/lead')
  setLead(@Param('id') id: string, @Body() dto: SetAssigneeDto, @CurrentUser() user: any) {
    return this.ticketsService.setLead(id, dto.developerId, user);
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

  @Patch(':id/request-changes')
  requestChanges(@Param('id') id: string, @Body() dto: RequestChangesDto, @CurrentUser() user: any) {
    return this.ticketsService.requestChanges(id, dto, user);
  }

  @Get(':id/timeline')
  timeline(@Param('id') id: string, @CurrentUser() user: any) {
    return this.ticketsService.timeline(id, user);
  }

  @Get(':id/dependencies')
  listDependencies(@Param('id') id: string, @CurrentUser() user: any) {
    return this.ticketsService.listDependencies(id, user);
  }

  @Post(':id/dependencies')
  addDependency(@Param('id') id: string, @Body() dto: AddDependencyDto, @CurrentUser() user: any) {
    return this.ticketsService.addDependency(id, dto, user);
  }

  @Delete(':id/dependencies/:otherTicketId')
  removeDependency(
    @Param('id') id: string,
    @Param('otherTicketId') otherTicketId: string,
    @CurrentUser() user: any,
  ) {
    return this.ticketsService.removeDependency(id, otherTicketId, user);
  }

  @Patch(':id/block')
  block(@Param('id') id: string, @Body() dto: PauseTicketDto, @CurrentUser() user: any) {
    return this.ticketsService.block(id, dto, user);
  }

  @Patch(':id/hold')
  hold(@Param('id') id: string, @Body() dto: PauseTicketDto, @CurrentUser() user: any) {
    return this.ticketsService.hold(id, dto, user);
  }

  @Patch(':id/resume')
  resume(@Param('id') id: string, @Body() dto: ResumeTicketDto, @CurrentUser() user: any) {
    return this.ticketsService.resume(id, dto, user);
  }

  @Patch(':id/close')
  close(@Param('id') id: string, @Body() dto: CloseTicketDto, @CurrentUser() user: any) {
    return this.ticketsService.close(id, dto, user);
  }

  @Patch(':id/archive')
  archive(@Param('id') id: string, @CurrentUser() user: any) {
    return this.ticketsService.archive(id, user);
  }

  @Patch(':id/unarchive')
  unarchive(@Param('id') id: string, @CurrentUser() user: any) {
    return this.ticketsService.unarchive(id, user);
  }

  @Patch(':id/reopen')
  reopen(@Param('id') id: string, @CurrentUser() user: any) {
    return this.ticketsService.reopen(id, user);
  }

  @Patch(':id/force-status')
  forceStatus(@Param('id') id: string, @Body() dto: ForceStatusDto, @CurrentUser() user: any) {
    return this.ticketsService.forceStatus(id, dto, user);
  }

  @Post(':id/duplicate')
  duplicate(@Param('id') id: string, @CurrentUser() user: any) {
    return this.ticketsService.duplicate(id, user);
  }
}
