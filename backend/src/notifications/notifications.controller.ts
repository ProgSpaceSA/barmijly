import { Controller, Get, Patch, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private notificationsService: NotificationsService) {}

  @Get()
  findAll(
    @CurrentUser() user: any,
    @Query('unreadOnly') unreadOnly?: string,
    @Query('page')  page?:  string,
    @Query('limit') limit?: string,
  ) {
    return this.notificationsService.findAll(
      user,
      unreadOnly === 'true',
      page  ? parseInt(page)  : 1,
      limit ? parseInt(limit) : 20,
    );
  }

  @Get('unread-count')
  countUnread(@CurrentUser() user: any) {
    return this.notificationsService.countUnread(user);
  }

  @Patch('ticket/:ticketId/read')
  @ApiOperation({ summary: 'Mark all unread notifications for a ticket as read' })
  markTicketRead(@Param('ticketId') ticketId: string, @CurrentUser() user: any) {
    return this.notificationsService.markTicketRead(ticketId, user.id);
  }

  @Patch(':id/read')
  markRead(@Param('id') id: string, @CurrentUser() user: any) {
    return this.notificationsService.markRead(id, user.id);
  }

  @Patch('read-all')
  markAllRead(@CurrentUser() user: any) {
    return this.notificationsService.markAllRead(user.id);
  }
}
