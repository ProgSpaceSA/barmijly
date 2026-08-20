import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { PrismaModule } from './prisma/prisma.module';
import { AccessModule } from './access/access.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { CompaniesModule } from './companies/companies.module';
import { DepartmentsModule } from './departments/departments.module';
import { SystemsModule } from './systems/systems.module';
import { TicketsModule } from './tickets/tickets.module';
import { CommentsModule } from './comments/comments.module';
import { AttachmentsModule } from './attachments/attachments.module';
import { NotificationsModule } from './notifications/notifications.module';
import { EmailModule } from './email/email.module';
import { AuditModule } from './audit/audit.module';
import { InvitationsModule } from './invitations/invitations.module';
import { ReportsModule } from './reports/reports.module';
import { SignupRequestsModule } from './signup-requests/signup-requests.module';
import { TasksModule } from './tasks/tasks.module';
import { DigestModule } from './digest/digest.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'uploads'),
      serveRoot: '/uploads',
    }),
    PrismaModule,
    AccessModule,
    AuthModule,
    UsersModule,
    CompaniesModule,
    DepartmentsModule,
    SystemsModule,
    TicketsModule,
    CommentsModule,
    AttachmentsModule,
    NotificationsModule,
    EmailModule,
    AuditModule,
    InvitationsModule,
    ReportsModule,
    SignupRequestsModule,
    TasksModule,
    DigestModule,
  ],
})
export class AppModule {}
