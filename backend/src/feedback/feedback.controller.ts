import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { FeedbackService } from './feedback.service';
import { CreateFeedbackDto, FilterFeedbackDto, UpdateFeedbackDto } from './dto/feedback.dto';

/**
 * Complaints and improvements on the hub.
 *
 * `JwtAuthGuard` only — every signed-in role may file, and who sees which row
 * is checked in the service. Putting `@Roles` here would duplicate the matrix.
 */
@ApiTags('Feedback')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('feedback')
export class FeedbackController {
  constructor(private feedback: FeedbackService) {}

  @Get()
  @ApiOperation({
    summary: 'Own rows and assigned rows. Leadership sees every row, including general ones.',
  })
  findAll(@Query() filters: FilterFeedbackDto, @CurrentUser() user: any) {
    return this.feedback.findAll(user, filters);
  }

  @Get('inbox-count')
  @ApiOperation({ summary: 'Open rows waiting on the caller (and unassigned, if they triage)' })
  inboxCount(@CurrentUser() user: any) {
    return this.feedback.inboxCount(user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One request. Hidden rows 404.' })
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.feedback.findOne(id, user);
  }

  @Post()
  @ApiOperation({ summary: 'File a complaint, improvement, or inquiry. Anyone signed in.' })
  create(@Body() dto: CreateFeedbackDto, @CurrentUser() user: any) {
    return this.feedback.create(dto, user);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Status / resolution note: assignee or leadership. Reassign: leadership only.',
  })
  update(@Param('id') id: string, @Body() dto: UpdateFeedbackDto, @CurrentUser() user: any) {
    return this.feedback.update(id, dto, user);
  }
}
