import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirementsService } from './requirements.service';
import {
  ChangeRequirementStatusDto,
  CreateRequirementDto,
  FilterRequirementsDto,
  PromoteRequirementDto,
  UpdateRequirementDto,
} from './dto/requirement.dto';

/**
 * The backlog. `POST /requirements/:id/comments` and its edit / delete live on
 * `RequirementCommentsController` in the comments module — one thread
 * implementation serves tickets and requirements, so registering it twice would
 * be two routes for one behaviour.
 */
@ApiTags('Requirements')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('requirements')
export class RequirementsController {
  constructor(private requirements: RequirementsService) {}

  @Get()
  @ApiOperation({ summary: 'Requirements the caller may see, newest first' })
  findAll(@Query() filters: FilterRequirementsDto, @CurrentUser() user: any) {
    return this.requirements.findAll(user, filters);
  }

  @Get('open-count')
  @ApiOperation({ summary: 'Open-requirement badge for the sidebar' })
  openCount(@CurrentUser() user: any) {
    return this.requirements.openCount(user);
  }

  @Post()
  @ApiOperation({ summary: 'File a standalone ask — WhatsApp, email, a call' })
  create(@Body() dto: CreateRequirementDto, @CurrentUser() user: any) {
    return this.requirements.create(dto, user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Requirement with origin, thread, files, history and tickets' })
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.requirements.findOne(id, user);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Triage — owner, system, priority, due date, wording' })
  update(@Param('id') id: string, @Body() dto: UpdateRequirementDto, @CurrentUser() user: any) {
    return this.requirements.update(id, dto, user);
  }

  @Post(':id/status')
  @ApiOperation({ summary: 'Change status — writes a RequirementStatusHistory row' })
  changeStatus(
    @Param('id') id: string,
    @Body() dto: ChangeRequirementStatusDto,
    @CurrentUser() user: any,
  ) {
    return this.requirements.changeStatus(id, dto, user);
  }

  @Post(':id/promote')
  @ApiOperation({
    summary: 'Create the linked ticket. Lands at DRAFT — no approval bypass.',
  })
  promote(
    @Param('id') id: string,
    @Body() dto: PromoteRequirementDto,
    @CurrentUser() user: any,
  ) {
    return this.requirements.promote(id, user, dto);
  }

  @Post(':id/archive')
  @ApiOperation({ summary: 'Archive — requirements are never hard-deleted' })
  archive(@Param('id') id: string, @CurrentUser() user: any) {
    return this.requirements.archive(id, user);
  }

  @Post(':id/unarchive')
  unarchive(@Param('id') id: string, @CurrentUser() user: any) {
    return this.requirements.unarchive(id, user);
  }
}
