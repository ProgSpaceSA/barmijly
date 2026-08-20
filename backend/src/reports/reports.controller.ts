import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { rolesWith } from '../access/permissions';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('reports')
export class ReportsController {
  constructor(private reportsService: ReportsService) {}

  @Roles(...rolesWith('report:read'))
  @Get('dashboard')
  getDashboard(@CurrentUser() user: any, @Query('companyId') companyId?: string) {
    return this.reportsService.getDashboardStats(user.id, user.role, companyId);
  }

  @Roles(...rolesWith('report:read'))
  @Get('overdue')
  getOverdue(@CurrentUser() user: any, @Query('companyId') companyId?: string) {
    return this.reportsService.getOverdueTickets(user.id, user.role, companyId);
  }

  @Roles(...rolesWith('report:read-team'))
  @Get('developers')
  getDeveloperStats(@CurrentUser() user: any, @Query('from') from?: string, @Query('to') to?: string) {
    return this.reportsService.getDeveloperStats(
      user,
      from ? new Date(from) : undefined,
      to ? new Date(to) : undefined,
    );
  }

  @Roles(...rolesWith('report:read-team'))
  @Get('systems')
  getSystemStats(@CurrentUser() user: any, @Query('companyId') companyId?: string) {
    return this.reportsService.getSystemStats(user, companyId);
  }

  @Roles(...rolesWith('report:read-team'))
  @Get('companies')
  getCompanyStats(@CurrentUser() user: any, @Query('companyId') companyId?: string) {
    return this.reportsService.getCompanyStats(user, companyId);
  }

  @Roles(...rolesWith('report:read-team'))
  @Get('trend')
  getTrend(@CurrentUser() user: any, @Query('months') months?: string, @Query('companyId') companyId?: string) {
    return this.reportsService.getTicketTrend(user, months ? parseInt(months) : 6, companyId);
  }
}
