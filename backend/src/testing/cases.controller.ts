import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CasesService } from './cases.service';
import { StepsService } from './steps.service';
import { CreateCaseDto, RecordResultDto, ReorderDto, UpdateCaseDto } from './dto/case.dto';
import { CreateStepDto, UpdateStepDto } from './dto/step.dto';

@ApiTags('Test cases')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class CasesController {
  constructor(
    private cases: CasesService,
    private steps: StepsService,
  ) {}

  @Get('test-suites/:suiteId/cases')
  findBySuite(@Param('suiteId') suiteId: string, @CurrentUser() user: any) {
    return this.cases.findBySuite(suiteId, user);
  }

  @Post('test-suites/:suiteId/cases')
  create(
    @Param('suiteId') suiteId: string,
    @Body() dto: CreateCaseDto,
    @CurrentUser() user: any,
  ) {
    return this.cases.create(suiteId, dto, user);
  }

  @Get('test-cases/:id')
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.cases.findOne(id, user);
  }

  @Patch('test-cases/:id')
  update(@Param('id') id: string, @Body() dto: UpdateCaseDto, @CurrentUser() user: any) {
    return this.cases.update(id, dto, user);
  }

  @Post('test-cases/:id/publish')
  @ApiOperation({ summary: 'DRAFT to ACTIVE. Requires at least one step.' })
  publish(@Param('id') id: string, @CurrentUser() user: any) {
    return this.cases.publish(id, user);
  }

  @Post('test-cases/:id/result')
  @ApiOperation({ summary: 'Record an execution result — writes history and refreshes the rollup' })
  recordResult(
    @Param('id') id: string,
    @Body() dto: RecordResultDto,
    @CurrentUser() user: any,
  ) {
    return this.cases.recordResult(id, dto, user);
  }

  @Post('test-cases/:id/reorder')
  reorder(@Param('id') id: string, @Body() dto: ReorderDto, @CurrentUser() user: any) {
    return this.cases.reorder(id, dto.order, user);
  }

  @Delete('test-cases/:id')
  @ApiOperation({ summary: 'Deletes a DRAFT; archives anything already published' })
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.cases.remove(id, user);
  }

  // ---- steps: shared with bug repro steps, registered once ------------------

  @Get('test-cases/:id/steps')
  findSteps(@Param('id') id: string, @CurrentUser() user: any) {
    return this.steps.findForCase(id, user);
  }

  @Post('test-cases/:id/steps')
  addStep(@Param('id') id: string, @Body() dto: CreateStepDto, @CurrentUser() user: any) {
    return this.steps.addToCase(id, dto, user);
  }

  @Patch('test-steps/:id')
  updateStep(@Param('id') id: string, @Body() dto: UpdateStepDto, @CurrentUser() user: any) {
    return this.steps.update(id, dto, user);
  }

  @Post('test-steps/:id/reorder')
  @ApiOperation({ summary: 'Move a step; siblings are rebalanced to contiguous positions' })
  reorderStep(@Param('id') id: string, @Body() dto: ReorderDto, @CurrentUser() user: any) {
    return this.steps.reorder(id, dto.order, user);
  }

  @Delete('test-steps/:id')
  @ApiOperation({ summary: 'Delete a step and its screenshot' })
  removeStep(@Param('id') id: string, @CurrentUser() user: any) {
    return this.steps.remove(id, user);
  }
}
