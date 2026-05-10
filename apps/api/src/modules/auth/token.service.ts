import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { randomBytes, randomUUID } from 'crypto';

export type AccessClaims = {
  sub: string;
  did: string;
  sid: string;
};

@Injectable()
export class TokenService {
  constructor(private readonly jwt: JwtService) {}

  signAccess(claims: AccessClaims): string {
    const minutes = Number(process.env.ACCESS_TTL_MINUTES ?? 15);
    return this.jwt.sign(claims, { expiresIn: `${minutes}m` });
  }

  verifyAccess(token: string): AccessClaims {
    return this.jwt.verify<AccessClaims>(token);
  }

  generateRefresh(): { token: string; hash: string; family: string } {
    const token = randomBytes(48).toString('base64url');
    return {
      token,
      hash: bcrypt.hashSync(token, 10),
      family: randomUUID(),
    };
  }

  async compareRefresh(token: string, hash: string): Promise<boolean> {
    return bcrypt.compare(token, hash);
  }

  refreshExpiry(): Date {
    const days = Number(process.env.REFRESH_TTL_DAYS ?? 30);
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  }
}
