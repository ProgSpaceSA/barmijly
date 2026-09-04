import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { GuidesController } from './guides.controller';
import { GuidesService } from './guides.service';

@Module({
  imports: [AuditModule],
  providers: [GuidesService],
  controllers: [GuidesController],
})
export class GuidesModule {}
