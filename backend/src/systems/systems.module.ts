import { Module } from '@nestjs/common';
import { SystemsService } from './systems.service';
import { SystemsController } from './systems.controller';

@Module({
  providers: [SystemsService],
  controllers: [SystemsController],
  exports: [SystemsService],
})
export class SystemsModule {}
