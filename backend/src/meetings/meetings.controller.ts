import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { MeetingsService } from './meetings.service';
import {
  AddAttendeeDto,
  CapturePointDto,
  CreateMeetingDto,
  CreatePointDto,
  FilterMeetingsDto,
  ReorderPointDto,
  SetMeetingSystemsDto,
  UpdateMeetingDto,
  UpdatePointDto,
} from './dto/meeting.dto';

/**
 * Meetings and their minutes. Every route is gated on `meeting:read` /
 * `meeting:manage` inside the service, so a role that reaches the controller
 * still gets a 403 rather than an empty list.
 */
@ApiTags('Meetings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('meetings')
export class MeetingsController {
  constructor(private meetings: MeetingsService) {}

  @Get()
  @ApiOperation({ summary: 'Meetings the caller may see, newest first' })
  findAll(@Query() filters: FilterMeetingsDto, @CurrentUser() user: any) {
    return this.meetings.findAll(user, filters);
  }

  @Post()
  @ApiOperation({ summary: 'Schedule a meeting against one company' })
  create(@Body() dto: CreateMeetingDto, @CurrentUser() user: any) {
    return this.meetings.create(dto, user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Meeting with attendees, systems, ordered minutes and files' })
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.meetings.findOne(id, user);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateMeetingDto, @CurrentUser() user: any) {
    return this.meetings.update(id, dto, user);
  }

  @Post(':id/hold')
  @ApiOperation({ summary: 'Mark the meeting as held — stamps heldAt when empty' })
  hold(@Param('id') id: string, @CurrentUser() user: any) {
    return this.meetings.hold(id, user);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string, @CurrentUser() user: any) {
    return this.meetings.cancel(id, user);
  }

  @Post(':id/archive')
  @ApiOperation({ summary: 'Archive — meetings are never hard-deleted' })
  archive(@Param('id') id: string, @CurrentUser() user: any) {
    return this.meetings.archive(id, user);
  }

  @Post(':id/unarchive')
  unarchive(@Param('id') id: string, @CurrentUser() user: any) {
    return this.meetings.unarchive(id, user);
  }

  @Post(':id/attendees')
  @ApiOperation({ summary: 'Add an internal account or an external guest' })
  addAttendee(@Param('id') id: string, @Body() dto: AddAttendeeDto, @CurrentUser() user: any) {
    return this.meetings.addAttendee(id, dto, user);
  }

  @Delete(':id/attendees/:attendeeId')
  removeAttendee(
    @Param('id') id: string,
    @Param('attendeeId') attendeeId: string,
    @CurrentUser() user: any,
  ) {
    return this.meetings.removeAttendee(id, attendeeId, user);
  }

  @Put(':id/systems')
  @ApiOperation({ summary: 'Replace the systems this meeting covers' })
  setSystems(
    @Param('id') id: string,
    @Body() dto: SetMeetingSystemsDto,
    @CurrentUser() user: any,
  ) {
    return this.meetings.setSystems(id, dto, user);
  }

  @Post(':id/points')
  @ApiOperation({ summary: 'Append a minutes line' })
  addPoint(@Param('id') id: string, @Body() dto: CreatePointDto, @CurrentUser() user: any) {
    return this.meetings.addPoint(id, dto, user);
  }

  @Post(':id/points/reorder')
  @ApiOperation({ summary: 'Move a line; siblings rebalance to a contiguous order' })
  reorderPoints(
    @Param('id') id: string,
    @Body() dto: ReorderPointDto,
    @CurrentUser() user: any,
  ) {
    return this.meetings.reorderPoints(id, dto, user);
  }

  @Patch(':id/points/:pointId')
  updatePoint(
    @Param('id') id: string,
    @Param('pointId') pointId: string,
    @Body() dto: UpdatePointDto,
    @CurrentUser() user: any,
  ) {
    return this.meetings.updatePoint(id, pointId, dto, user);
  }

  @Delete(':id/points/:pointId')
  removePoint(
    @Param('id') id: string,
    @Param('pointId') pointId: string,
    @CurrentUser() user: any,
  ) {
    return this.meetings.removePoint(id, pointId, user);
  }

  @Post(':id/points/:pointId/capture')
  @ApiOperation({
    summary: 'Capture the line as a tracked requirement (source = MEETING)',
  })
  capturePoint(
    @Param('id') id: string,
    @Param('pointId') pointId: string,
    @Body() dto: CapturePointDto,
    @CurrentUser() user: any,
  ) {
    return this.meetings.capturePoint(id, pointId, dto, user);
  }
}
