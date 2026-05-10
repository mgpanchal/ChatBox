import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { TokenService, type AccessClaims } from '../modules/auth/token.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly tokens: TokenService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const header = req.headers.authorization as string | undefined;
    if (!header?.startsWith('Bearer ')) throw new UnauthorizedException('Missing bearer token');
    try {
      const claims = this.tokens.verifyAccess(header.slice(7));
      (req as any).user = claims;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
