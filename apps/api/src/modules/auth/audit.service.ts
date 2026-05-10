import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type AuditEntry = {
  userId?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
};

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  log(entry: AuditEntry): Promise<void> {
    return this.prisma.auditLog
      .create({
        data: {
          userId: entry.userId ?? null,
          action: entry.action,
          targetType: entry.targetType,
          targetId: entry.targetId,
          metadata: entry.metadata as any,
          ipAddress: entry.ipAddress,
        },
      })
      .then(() => undefined);
  }
}
