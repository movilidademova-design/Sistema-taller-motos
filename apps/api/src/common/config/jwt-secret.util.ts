import { ConfigService } from '@nestjs/config';

/** Valores del .env.example que no deben llegar nunca a un servidor real. */
const PLACEHOLDER_SECRETS = new Set([
  'change_me',
  'dev_access_secret_change_me_in_production',
]);

/**
 * Único sitio del que sale el secreto de firma de los tokens.
 *
 * Vive aquí, y no dentro de quien lo usa, porque estaba duplicado: la
 * estrategia JWT y el gateway de tiempo real resolvían el secreto cada uno por
 * su cuenta, **los dos con el mismo valor de reserva escrito en el código**
 * (`'dev_access_secret_change_me_in_production'`). Se corrigió el de la
 * estrategia y el del gateway siguió ahí: un despliegue sin la variable
 * arrancaba con la API bien protegida y el WebSocket aceptando tokens firmados
 * con una cadena publicada en el repositorio.
 *
 * Cualquier sitio nuevo que necesite verificar un token debe llamar a esta
 * función, nunca leer `JWT_ACCESS_SECRET` directamente.
 */
export function requireJwtSecret(config: ConfigService): string {
  const secret = config.get<string>('JWT_ACCESS_SECRET');
  if (!secret || PLACEHOLDER_SECRETS.has(secret)) {
    throw new Error(
      'JWT_ACCESS_SECRET no está definido o sigue siendo el valor de ejemplo. ' +
        "Genera uno con: node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\"",
    );
  }
  if (secret.length < 32) {
    throw new Error(
      `JWT_ACCESS_SECRET es demasiado corto (${secret.length} caracteres, mínimo 32).`,
    );
  }
  return secret;
}
