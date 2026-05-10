import { Injectable, Logger } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { randomInt } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);
  private readonly length = Number(process.env.OTP_LENGTH ?? 6);
  private readonly ttlSeconds = Number(process.env.OTP_TTL_SECONDS ?? 300);
  private readonly maxAttempts = Number(process.env.OTP_MAX_ATTEMPTS ?? 5);
  private readonly resendCooldownSeconds = Number(process.env.OTP_RESEND_COOLDOWN_SECONDS ?? 30);
  private readonly hourlyIssueLimit = Number(process.env.OTP_HOURLY_LIMIT ?? 5);

  constructor(private readonly prisma: PrismaService) {}

  async issue(mobileNumber: string): Promise<{ expiresAt: Date; devCode?: string }> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const issuedLastHour = await this.prisma.otpCode.count({
      where: { mobileNumber, purpose: 'login', createdAt: { gt: oneHourAgo } },
    });
    if (issuedLastHour >= this.hourlyIssueLimit) {
      const err: any = new Error('Too many OTP requests. Try again in an hour.');
      err.status = 429;
      throw err;
    }

    const recent = await this.prisma.otpCode.findFirst({
      where: { mobileNumber, purpose: 'login', consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (recent) {
      const sinceMs = Date.now() - recent.createdAt.getTime();
      if (sinceMs < this.resendCooldownSeconds * 1000) {
        const wait = Math.ceil((this.resendCooldownSeconds * 1000 - sinceMs) / 1000);
        const err: any = new Error(`Wait ${wait}s before resending`);
        err.status = 429;
        throw err;
      }
    }

    const code = String(randomInt(0, 10 ** this.length)).padStart(this.length, '0');
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + this.ttlSeconds * 1000);

    await this.prisma.otpCode.updateMany({
      where: { mobileNumber, purpose: 'login', consumedAt: null },
      data: { consumedAt: new Date() },
    });

    await this.prisma.otpCode.create({
      data: { mobileNumber, codeHash, expiresAt, purpose: 'login' },
    });

    this.logger.log(`OTP for ${mobileNumber}: ${code} (expires ${expiresAt.toISOString()})`);

    return {
      expiresAt,
      devCode: process.env.NODE_ENV !== 'production' ? code : undefined,
    };
  }

  async verify(mobileNumber: string, code: string): Promise<boolean> {
    const otp = await this.prisma.otpCode.findFirst({
      where: { mobileNumber, purpose: 'login', consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!otp) return false;

    if (otp.attempts >= this.maxAttempts) {
      await this.prisma.otpCode.update({ where: { id: otp.id }, data: { consumedAt: new Date() } });
      return false;
    }

    const ok = await bcrypt.compare(code, otp.codeHash);
    if (!ok) {
      await this.prisma.otpCode.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
      return false;
    }

    await this.prisma.otpCode.update({ where: { id: otp.id }, data: { consumedAt: new Date() } });
    return true;
  }
}
