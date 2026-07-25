import { Module } from '@nestjs/common';
import { SignupRequestsService } from './signup-requests.service';
import { SignupRequestsController } from './signup-requests.controller';
import { InvitationsModule } from '../invitations/invitations.module';

@Module({
  imports: [InvitationsModule],
  providers: [SignupRequestsService],
  controllers: [SignupRequestsController],
})
export class SignupRequestsModule {}
