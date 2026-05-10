import { Body, Controller, Ip, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { ZodValidationPipe } from '../../common/zod.pipe';
import { AuthService } from './auth.service';
import { otpRequestSchema, otpVerifySchema, refreshSchema, logoutSchema } from './auth.dto';
import type { OtpRequestDto, OtpVerifyDto, RefreshDto, LogoutDto } from './auth.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('otp/request')
  @UseGuards(ThrottlerGuard)
  @Throttle({ strict: { limit: 10, ttl: 60_000 } })
  request(@Body(new ZodValidationPipe(otpRequestSchema)) body: OtpRequestDto, @Ip() ip: string) {
    return this.auth.requestOtp(body, ip);
  }

  @Post('otp/verify')
  @UseGuards(ThrottlerGuard)
  @Throttle({ strict: { limit: 10, ttl: 60_000 } })
  verify(@Body(new ZodValidationPipe(otpVerifySchema)) body: OtpVerifyDto, @Ip() ip: string) {
    return this.auth.verifyOtp(body, ip);
  }

  @Post('refresh')
  refresh(@Body(new ZodValidationPipe(refreshSchema)) body: RefreshDto, @Ip() ip: string) {
    return this.auth.refresh(body, ip);
  }

  @Post('logout')
  logout(@Body(new ZodValidationPipe(logoutSchema)) body: LogoutDto, @Ip() ip: string) {
    return this.auth.logout(body.refreshToken, ip);
  }
}
