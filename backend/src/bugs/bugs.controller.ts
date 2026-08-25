import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { BugsService } from './bugs.service';
import { StepsService } from '../testing/steps.service';
import { CreateStepDto } from '../testing/dto/step.dto';
import {
  ChangeBugStatusDto,
  CreateBugDto,
  FilterBugsDto,
  PromoteBugDto,
  UpdateBugDto,
} from './dto/bug.dto';

/**
 * `PATCH /test-steps/:id`, its reorder and its delete are shared with test-case
 * steps and are registered once, on `CasesController` — the rows are the same
 * table and the same service, so a second registration would be a second route
 * for one behaviour.
 */
@ApiTags('Bugs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('bugs')
export class BugsController {
  constructor(
    private bugs: BugsService,
    private steps: StepsService,
  ) {}

  @Get()
  findAll(@Query() filters: FilterBugsDto, @CurrentUser() user: any) {
    return this.bugs.findAll(user, filters);
  }

  @Get('open-count')
  @ApiOperation({ summary: 'Open-bug badge for the sidebar' })
  openCount(@CurrentUser() user: any) {
    return this.bugs.openCount(user);
  }

  @Post()
  @ApiOperation({ summary: 'File a bug — from a case, or standalone with a system' })
  create(@Body() dto: CreateBugDto, @CurrentUser() user: any) {
    return this.bugs.create(dto, user);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.bugs.findOne(id, user);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateBugDto, @CurrentUser() user: any) {
    return this.bugs.update(id, dto, user);
  }

  @Get(':id/steps')
  findSteps(@Param('id') id: string, @CurrentUser() user: any) {
    return this.steps.findForBug(id, user);
  }

  @Post(':id/steps')
  addStep(@Param('id') id: string, @Body() dto: CreateStepDto, @CurrentUser() user: any) {
    return this.steps.addToBug(id, dto, user);
  }

  @Post(':id/status')
  @ApiOperation({ summary: 'Change status — writes a BugStatusHistory row' })
  changeStatus(
    @Param('id') id: string,
    @Body() dto: ChangeBugStatusDto,
    @CurrentUser() user: any,
  ) {
    return this.bugs.changeStatus(id, dto, user);
  }

  @Post(':id/promote')
  @ApiOperation({ summary: 'Create the linked BUG_FIX ticket. Lands at DRAFT — no approval bypass.' })
  promote(@Param('id') id: string, @Body() dto: PromoteBugDto, @CurrentUser() user: any) {
    return this.bugs.promote(id, user, dto);
  }

  @Post(':id/archive')
  archive(@Param('id') id: string, @CurrentUser() user: any) {
    return this.bugs.archive(id, user);
  }

  @Post(':id/unarchive')
  unarchive(@Param('id') id: string, @CurrentUser() user: any) {
    return this.bugs.unarchive(id, user);
  }
}
