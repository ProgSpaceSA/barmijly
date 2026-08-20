import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AccessService } from './access.service';

/**
 * Global on purpose: scope checks belong in every feature module, and making
 * each one re-import this is how a module ends up shipping without them.
 */
@Global()
@Module({
  imports: [PrismaModule],
  providers: [AccessService],
  exports: [AccessService],
})
export class AccessModule {}
