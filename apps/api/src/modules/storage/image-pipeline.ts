import sharp from 'sharp';

export const AVATAR_SIZES = { thumb: 64, sm: 128, md: 256, lg: 512 } as const;
export type AvatarSizeKey = keyof typeof AVATAR_SIZES;

export const ATTACH_THUMB = 200;
export const ATTACH_PREVIEW_LONGEDGE = 1280;

export type ProcessedAvatar = Record<AvatarSizeKey, Buffer>;

export type ProcessedAttachmentImage = {
  thumb: Buffer;
  preview: Buffer;
  original: Buffer;
  width: number;
  height: number;
};

export async function processAvatar(input: Buffer): Promise<ProcessedAvatar> {
  const base = sharp(input).rotate().removeAlpha();
  const out: any = {};
  await Promise.all(
    (Object.entries(AVATAR_SIZES) as [AvatarSizeKey, number][]).map(async ([key, size]) => {
      out[key] = await base
        .clone()
        .resize(size, size, { fit: 'cover', position: sharp.strategy.attention })
        .webp({ quality: 86, effort: 4 })
        .toBuffer();
    }),
  );
  return out as ProcessedAvatar;
}

export async function processAttachmentImage(input: Buffer): Promise<ProcessedAttachmentImage> {
  const meta = await sharp(input).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;

  const thumb = await sharp(input)
    .rotate()
    .resize(ATTACH_THUMB, ATTACH_THUMB, { fit: 'cover', position: sharp.strategy.attention })
    .webp({ quality: 80, effort: 4 })
    .toBuffer();

  const preview = await sharp(input)
    .rotate()
    .resize({
      width: ATTACH_PREVIEW_LONGEDGE,
      height: ATTACH_PREVIEW_LONGEDGE,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: 84, effort: 4 })
    .toBuffer();

  return { thumb, preview, original: input, width, height };
}
