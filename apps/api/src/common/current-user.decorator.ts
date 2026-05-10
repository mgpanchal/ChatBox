import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AccessClaims } from '../modules/auth/token.service';

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AccessClaims => {
    return ctx.switchToHttp().getRequest().user;
  },
);
