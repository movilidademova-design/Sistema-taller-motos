import { BadRequestException } from '@nestjs/common';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';

/**
 * Reglas de subida para TODA imagen que acepta la API.
 *
 * Vive en un solo sitio a propósito: antes estaban escritas a mano dentro de
 * `orders.controller.ts` y el endpoint de fotos de `photos.controller.ts` se
 * quedó sin ellas, así que aceptaba cualquier fichero de cualquier tamaño. Un
 * `.html` con script subido por ahí acababa servido como text/html desde
 * /uploads, sin autenticación. Cualquier endpoint nuevo que reciba imágenes
 * debe usar esta constante en lugar de repetir los límites.
 */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const ALLOWED_IMAGE_MIME = /^image\/(jpeg|png|webp)$/;

/** Extensión canónica por mimetype. No se confía en el nombre que envía el cliente. */
export const IMAGE_EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

export const IMAGE_UPLOAD_OPTIONS: MulterOptions = {
  limits: { fileSize: MAX_IMAGE_BYTES },
  fileFilter: (_req, file, callback) => {
    if (!ALLOWED_IMAGE_MIME.test(file.mimetype)) {
      callback(
        new BadRequestException('Solo se permiten imágenes JPEG, PNG o WEBP'),
        false,
      );
      return;
    }
    callback(null, true);
  },
};
