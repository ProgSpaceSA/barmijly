import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('Reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.PROGRAMMING_HEAD, UserRole.PROJECT_MANAGER, UserRole.SENIOR_MANAGEMENT)
@Controller('reports')
export class ReportsController {
  constructor(private reportsService: ReportsService) {}

  @Get('dashboard')
  getDashboard(@Query('companyId') companyId?: string) {
    return this.reportsService.getDashboardStats(companyId);
  }

  @Get('developers')
  getDeveloperStats(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reportsService.getDeveloperStats(
      from ? new Date(from) : undefined,
      to ? new Date(to) : undefined,
    );
  }

  @Get('systems')
  getSystemStats(@Query('companyId') companyId?: string) {
    return this.reportsService.getSystemStats(companyId);
  }

  @Get('companies')
  getCompanyStats(@Query('companyId') companyId?: string) {
    return this.reportsService.getCompanyStats(companyId);
  }

  @Get('overdue')
  getOverdue(@Query('companyId') companyId?: string) {
    return this.reportsService.getOverdueTickets(companyId);
  }

  @Get('trend')
  getTrend(@Query('months') months?: string, @Query('companyId') companyId?: string) {
    return this.reportsService.getTicketTrend(months ? parseInt(months) : 6, companyId);
  }
}
