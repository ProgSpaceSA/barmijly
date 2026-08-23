import { Module } from '@nestjs/common';
import { SystemsService } from './systems.service';
import { SystemsController } from './systems.controller';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  providers: [SystemsService],
  controllers: [SystemsController],
  exports: [SystemsService],
})
export class SystemsModule {}
