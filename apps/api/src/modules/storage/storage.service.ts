import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { S3Client, PutObjectCommand, GetObjectCommand, CreateBucketCommand, HeadBucketCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

type Driver = 'local' | 's3';

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly driver: Driver = (process.env.STORAGE_DRIVER === 's3' ? 's3' : 'local') as Driver;
  private readonly localDir = path.resolve(process.env.LOCAL_UPLOADS_DIR ?? './uploads');
  private readonly publicUrl = (process.env.API_PUBLIC_URL ?? 'http://localhost:4000').replace(/\/+$/, '');
  private readonly s3?: S3Client;
  private readonly bucket = process.env.S3_BUCKET ?? 'chatbox';
  private readonly jwt = new JwtService({ secret: process.env.JWT_SECRET ?? 'dev', signOptions: { algorithm: 'HS256' } });

  constructor() {
    if (this.driver === 's3') {
      this.s3 = new S3Client({
        region: process.env.S3_REGION ?? 'us-east-1',
        endpoint: process.env.S3_ENDPOINT ?? 'http://localhost:9000',
        forcePathStyle: true,
        credentials: {
          accessKeyId: process.env.S3_ACCESS_KEY ?? 'minioadmin',
          secretAccessKey: process.env.S3_SECRET_KEY ?? 'minioadmin',
        },
      });
    }
  }

  async onModuleInit() {
    if (this.driver === 'local') {
      fs.mkdirSync(this.localDir, { recursive: true });
      this.logger.log(`Storage: local filesystem at ${this.localDir}`);
      return;
    }
    try {
      await this.s3!.send(new HeadBucketCommand({ Bucket: this.bucket }));
      this.logger.log(`Storage: S3 bucket "${this.bucket}" ready.`);
    } catch {
      try {
        await this.s3!.send(new CreateBucketCommand({ Bucket: this.bucket }));
        this.logger.log(`Storage: S3 bucket "${this.bucket}" created.`);
      } catch (e) {
        this.logger.warn(`Storage: could not verify S3 bucket "${this.bucket}": ${(e as Error).message}`);
      }
    }
  }

  newKey(prefix: string, fileName: string): string {
    const safe = fileName.replace(/[^\w.\-]/g, '_').slice(-100);
    return `${prefix}/${randomUUID()}-${safe}`;
  }

  async putObject(key: string, body: Buffer, contentType: string): Promise<void> {
    if (this.driver === 'local') {
      const fullPath = path.join(this.localDir, key);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, body);
      return;
    }
    await this.s3!.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  async signedDownloadUrl(key: string, fileName?: string, expiresIn = 600): Promise<string> {
    if (this.driver === 'local') {
      const token = this.jwt.sign({ k: key, n: fileName ?? '' }, { expiresIn: `${expiresIn}s` });
      // Relative URL — each client (web on localhost, mobile on LAN) resolves to whatever host it's already talking to.
      return `/v1/files?t=${encodeURIComponent(token)}`;
    }
    const cmd = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ResponseContentDisposition: fileName ? `inline; filename="${fileName.replace(/"/g, '')}"` : undefined,
    });
    return getSignedUrl(this.s3!, cmd, { expiresIn });
  }

  resolveLocalPath(key: string): string {
    return path.join(this.localDir, key);
  }

  verifyDownloadToken(token: string): { k: string; n: string } | null {
    try {
      return this.jwt.verify<{ k: string; n: string }>(token);
    } catch {
      return null;
    }
  }

  isLocal(): boolean {
    return this.driver === 'local';
  }
}
