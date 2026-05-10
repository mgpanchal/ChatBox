import { Controller, Get, NotFoundException, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { StorageService } from './storage.service';

@Controller('files')
export class FilesController {
  constructor(private readonly storage: StorageService) {}

  @Get()
  serve(@Query('t') token: string, @Res() res: Response) {
    if (!token || !this.storage.isLocal()) throw new NotFoundException();
    const claims = this.storage.verifyDownloadToken(token);
    if (!claims) throw new NotFoundException();

    const file = this.storage.resolveLocalPath(claims.k);
    if (!fs.existsSync(file)) throw new NotFoundException();

    const filename = claims.n || path.basename(file);
    const stat = fs.statSync(file);
    const mime = guessMime(filename);

    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Length', String(stat.size));
    res.setHeader('Content-Disposition', `inline; filename="${filename.replace(/"/g, '')}"`);
    res.setHeader('Cache-Control', 'private, max-age=600');

    fs.createReadStream(file).pipe(res);
  }
}

function guessMime(name: string): string {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  const map: Record<string, string> = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml',
    pdf: 'application/pdf', txt: 'text/plain', json: 'application/json', csv: 'text/csv',
    mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
    mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4',
    doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
  return map[ext] ?? 'application/octet-stream';
}
