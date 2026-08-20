import { Module } from '@nestjs/common';
import { EmailModule } from '../email/email.module';
import { DigestService } from './digest.service';

/** Cron only — the digest has no HTTP surface by design. */
@Module({
  imports: [EmailModule],
  providers: [DigestService],
})
export class DigestModule {}
