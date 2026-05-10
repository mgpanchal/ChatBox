import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../modules/prisma/prisma.service';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const userId = req.user?.sub;
    if (!userId) throw new ForbiddenException();
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { isAdmin: true, status: true } });
    if (!u?.isAdmin || u.status !== 'active') throw new ForbiddenException('Admin access required');
    return true;
  }
}
