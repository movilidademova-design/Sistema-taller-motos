import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import { IMAGE_EXTENSION_BY_MIME } from '../common/upload/image-upload.options';

/** Extensiones no-imagen que la aplicación genera ella misma (PDF de cotización). */
const SAFE_EXTENSIONS = new Set(['.pdf', '.xlsx']);

/**
 * Abstracts object storage so the rest of the app never talks to S3/R2 or the
 * filesystem directly. Swap STORAGE_DRIVER=s3 (works for both Amazon S3 and
 * Cloudflare R2, since R2 exposes an S3-compatible API) once credentials are
 * available; local disk is used for zero-config development.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly driver: string;
  private readonly bucket: string;
  private readonly s3Client?: S3Client;
  private readonly uploadsDir = path.join(process.cwd(), 'uploads');

  constructor(private readonly config: ConfigService) {
    this.driver = this.config.get<string>('STORAGE_DRIVER') ?? 'local';
    this.bucket = this.config.get<string>('S3_BUCKET') ?? 'taller-motos';

    if (this.driver === 's3') {
      this.s3Client = new S3Client({
        region: this.config.get<string>('S3_REGION') ?? 'auto',
        endpoint: this.config.get<string>('S3_ENDPOINT'),
        credentials: {
          accessKeyId: this.config.get<string>('S3_ACCESS_KEY_ID') ?? '',
          secretAccessKey:
            this.config.get<string>('S3_SECRET_ACCESS_KEY') ?? '',
        },
      });
    }
  }

  async upload(
    buffer: Buffer,
    originalName: string,
    mimeType: string,
    folder = 'misc',
  ): Promise<string> {
    // La extensión sale del mimetype ya validado, NO del nombre que envía el
    // cliente. Con `path.extname(originalName)` un fichero llamado `x.html`
    // conservaba esa extensión y el servidor de estáticos lo devolvía como
    // text/html — es decir, contenido arbitrario ejecutándose en el origen de
    // la API. Un mimetype desconocido cae en `.bin`, que ningún navegador
    // interpreta.
    const extension =
      IMAGE_EXTENSION_BY_MIME[mimeType] ??
      (SAFE_EXTENSIONS.has(path.extname(originalName).toLowerCase())
        ? path.extname(originalName).toLowerCase()
        : '.bin');
    const key = `${folder}/${randomUUID()}${extension}`;

    if (this.driver === 's3' && this.s3Client) {
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: buffer,
          ContentType: mimeType,
        }),
      );
      const publicUrl = this.config.get<string>('S3_PUBLIC_URL');
      return publicUrl ? `${publicUrl}/${key}` : key;
    }

    const destPath = path.join(this.uploadsDir, key);
    await fs.mkdir(path.dirname(destPath), { recursive: true });
    await fs.writeFile(destPath, buffer);
    this.logger.debug(`Stored local file at ${destPath}`);
    return `/uploads/${key}`;
  }
}
