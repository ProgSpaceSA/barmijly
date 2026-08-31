import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { ReorderTaskDto } from './dto/reorder-task.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Tasks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class TasksController {
  constructor(private tasksService: TasksService) {}

  @Get('tickets/:ticketId/tasks')
  findByTicket(@Param('ticketId') ticketId: string, @CurrentUser() user: any) {
    return this.tasksService.findByTicket(ticketId, user);
  }

  @Post('tickets/:ticketId/tasks')
  create(
    @Param('ticketId') ticketId: string,
    @Body() dto: CreateTaskDto,
    @CurrentUser() user: any,
  ) {
    return this.tasksService.create(ticketId, dto, user);
  }

  @Get('tasks/my')
  findMyTasks(@CurrentUser() user: any) {
    return this.tasksService.findMyTasks(user);
  }

  @Patch('tasks/:id')
  update(@Param('id') id: string, @Body() dto: UpdateTaskDto, @CurrentUser() user: any) {
    return this.tasksService.update(id, dto, user);
  }

  @Post('tasks/:id/reorder')
  @ApiOperation({ summary: 'Move a task; siblings rebalance to a contiguous order' })
  reorder(@Param('id') id: string, @Body() dto: ReorderTaskDto, @CurrentUser() user: any) {
    return this.tasksService.reorder(id, dto.order, user);
  }

  @Delete('tasks/:id')
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.tasksService.remove(id, user);
  }
}
