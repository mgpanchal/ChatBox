import { Controller, Delete, ForbiddenException, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../../common/jwt.guard';
import { CurrentUser } from '../../common/current-user.decorator';
import type { AccessClaims } from '../auth/token.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { processAvatar, AVATAR_SIZES, type AvatarSizeKey } from '../storage/image-pipeline';
import { randomUUID } from 'crypto';
import * as fs from 'fs';

export type PhotoUrls = { thumb: string; sm: string; md: string; lg: string };

/**
 * Returns photo variants for a user.
 *
 * Strategy:
 *  - `thumb` (64×64) is embedded as a base64 `data:` URL — no second HTTP roundtrip,
 *    no expiring token, no host coordination needed. Thumbnails are tiny (~3–8 KB WebP)
 *    so the response cost is negligible vs. the reliability gain. This is what 95% of
 *    UI surfaces (bubble avatars, chat list, mention popover, etc.) actually render.
 *  - `sm`/`md`/`lg` stay as relative signed URLs — used only on the You page and other
 *    larger renders, where one extra fetch is fine.
 */
export async function signAvatarVariants(storage: StorageService, stem: string | null | undefined): Promise<PhotoUrls | null> {
  if (!stem) return null;
  const out: Record<string, string> = {};
  await Promise.all(
    (Object.keys(AVATAR_SIZES) as AvatarSizeKey[]).map(async (key) => {
      const objKey = `${stem}/${key}.webp`;
      if (key === 'thumb' && storage.isLocal()) {
        try {
          const buf = await fs.promises.readFile(storage.resolveLocalPath(objKey));
          out[key] = `data:image/webp;base64,${buf.toString('base64')}`;
          return;
        } catch {
          // fall through to signed URL
        }
      }
      out[key] = await storage.signedDownloadUrl(objKey, undefined, 3600);
    }),
  );
  return out as PhotoUrls;
}

@Controller('me/photo')
@UseGuards(JwtAuthGuard)
export class PhotoController {
  constructor(private readonly prisma: PrismaService, private readonly storage: StorageService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  async upload(@CurrentUser() c: AccessClaims, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new ForbiddenException('No file');
    if (!file.mimetype.startsWith('image/')) throw new ForbiddenException('Image required');

    const profile = await this.prisma.employeeProfile.findUnique({ where: { userId: c.sub } });
    if (!profile) throw new ForbiddenException();

    const variants = await processAvatar(file.buffer);
    const stem = `avatar/${c.sub}/${randomUUID()}`;

    await Promise.all(
      (Object.entries(variants) as [AvatarSizeKey, Buffer][]).map(([key, buf]) =>
        this.storage.putObject(`${stem}/${key}.webp`, buf, 'image/webp'),
      ),
    );

    await this.prisma.employeeProfile.update({
      where: { userId: c.sub },
      data: { photoStorageKey: stem },
    });

    const photoUrls = await signAvatarVariants(this.storage, stem);
    return { ok: true, photoUrls };
  }

  @Delete()
  async remove(@CurrentUser() c: AccessClaims) {
    await this.prisma.employeeProfile.update({
      where: { userId: c.sub },
      data: { photoStorageKey: null },
    });
    return { ok: true };
  }
}
