import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SuitesService } from './suites.service';
import { CreateSuiteDto, FilterSuitesDto, LinkTicketDto, UpdateSuiteDto } from './dto/suite.dto';

/**
 * Nested paths on a bare `@Controller()`, as in `tasks.controller.ts` — the
 * suite is the parent of its cases, and the URL says so.
 */
@ApiTags('Test suites')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class SuitesController {
  constructor(private suites: SuitesService) {}

  @Get('test-suites')
  findAll(@Query() filters: FilterSuitesDto, @CurrentUser() user: any) {
    return this.suites.findAll(user, filters);
  }

  @Post('test-suites')
  create(@Body() dto: CreateSuiteDto, @CurrentUser() user: any) {
    return this.suites.create(dto, user);
  }

  @Get('test-suites/:id')
  @ApiOperation({ summary: 'Suite with its cases, linked tickets and rollup counts' })
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.suites.findOne(id, user);
  }

  @Patch('test-suites/:id')
  update(@Param('id') id: string, @Body() dto: UpdateSuiteDto, @CurrentUser() user: any) {
    return this.suites.update(id, dto, user);
  }

  @Post('test-suites/:id/publish')
  @ApiOperation({ summary: 'DRAFT to ACTIVE' })
  publish(@Param('id') id: string, @CurrentUser() user: any) {
    return this.suites.publish(id, user);
  }

  @Post('test-suites/:id/archive')
  @ApiOperation({ summary: 'Archive — suites are never hard-deleted' })
  archive(@Param('id') id: string, @CurrentUser() user: any) {
    return this.suites.archive(id, user);
  }

  @Post('test-suites/:id/unarchive')
  @ApiOperation({ summary: 'Restore an archived suite to ACTIVE' })
  unarchive(@Param('id') id: string, @CurrentUser() user: any) {
    return this.suites.unarchive(id, user);
  }

  @Post('test-suites/:id/tickets')
  linkTicket(@Param('id') id: string, @Body() dto: LinkTicketDto, @CurrentUser() user: any) {
    return this.suites.linkTicket(id, dto.ticketId, user);
  }

  @Delete('test-suites/:id/tickets/:ticketId')
  unlinkTicket(
    @Param('id') id: string,
    @Param('ticketId') ticketId: string,
    @CurrentUser() user: any,
  ) {
    return this.suites.unlinkTicket(id, ticketId, user);
  }

  @Get('tickets/:id/testing')
  @ApiOperation({ summary: 'Suites, cases and bugs for the ticket page section' })
  findForTicket(@Param('id') id: string, @CurrentUser() user: any) {
    return this.suites.findForTicket(id, user);
  }
}
