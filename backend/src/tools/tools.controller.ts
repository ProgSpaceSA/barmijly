import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ToolsService } from './tools.service';
import {
  CreateToolDto,
  DecideToolDto,
  FilterToolsDto,
  UpdateToolDto,
} from './dto/tool.dto';

/**
 * The dev hub's tools catalogue.
 *
 * `JwtAuthGuard` only — every role may read, and the request/decide split is a
 * matter of which action the caller holds, checked in the service. Putting
 * `@Roles` here as well would duplicate a list that is already in the matrix.
 */
@ApiTags('Tools')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('tools')
export class ToolsController {
  constructor(private tools: ToolsService) {}

  @Get()
  @ApiOperation({
    summary: 'The catalogue. Non-managers see approved tools plus their own requests.',
  })
  findAll(@Query() filters: FilterToolsDto, @CurrentUser() user: any) {
    return this.tools.findAll(user, filters);
  }

  @Get('pending-count')
  @ApiOperation({ summary: 'Requests awaiting a decision — 0 for roles that cannot decide' })
  pendingCount(@CurrentUser() user: any) {
    return this.tools.pendingCount(user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One tool with who asked and who decided' })
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.tools.findOne(id, user);
  }

  @Post()
  @ApiOperation({ summary: 'Ask for a tool. Always lands at REQUESTED.' })
  create(@Body() dto: CreateToolDto, @CurrentUser() user: any) {
    return this.tools.create(dto, user);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit name, link, description, steps or categories' })
  update(@Param('id') id: string, @Body() dto: UpdateToolDto, @CurrentUser() user: any) {
    return this.tools.update(id, dto, user);
  }

  @Post(':id/approve')
  @ApiOperation({ summary: 'Into the catalogue — REQUESTED only' })
  approve(@Param('id') id: string, @CurrentUser() user: any) {
    return this.tools.approve(id, user);
  }

  @Post(':id/decline')
  @ApiOperation({ summary: 'No, with a reason. The row stays so the ask does not return.' })
  decline(@Param('id') id: string, @Body() dto: DecideToolDto, @CurrentUser() user: any) {
    return this.tools.decline(id, dto, user);
  }

  @Post(':id/retire')
  @ApiOperation({ summary: 'Stop using an approved tool. Never deleted.' })
  retire(@Param('id') id: string, @Body() dto: DecideToolDto, @CurrentUser() user: any) {
    return this.tools.retire(id, dto, user);
  }
}
