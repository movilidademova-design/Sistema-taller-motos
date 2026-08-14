import { ConfigService } from '@nestjs/config';
import { requireJwtSecret } from './jwt-secret.util';

/**
 * Regresión de C-4 y de su reaparición.
 *
 * El valor de reserva escrito en el código estaba DUPLICADO: en la estrategia
 * JWT y en el gateway de tiempo real. Se corrigió el primero y el segundo se
 * quedó atrás, así que un despliegue sin `JWT_ACCESS_SECRET` tenía la API bien
 * protegida y el WebSocket aceptando tokens firmados con una cadena publicada
 * en el repositorio.
 *
 * Ahora el secreto sale de un único sitio. Estos tests protegen ese sitio.
 */
const config = (valor?: string) =>
  ({ get: () => valor }) as unknown as ConfigService;

describe('requireJwtSecret', () => {
  it('devuelve el secreto cuando es válido', () => {
    const bueno = 'a'.repeat(64);
    expect(requireJwtSecret(config(bueno))).toBe(bueno);
  });

  it('falla si no está definido', () => {
    expect(() => requireJwtSecret(config(undefined))).toThrow(
      /no está definido/i,
    );
  });

  it('falla si está vacío', () => {
    expect(() => requireJwtSecret(config(''))).toThrow(/no está definido/i);
  });

  it.each(['change_me', 'dev_access_secret_change_me_in_production'])(
    'rechaza el valor de ejemplo %s',
    (placeholder) => {
      expect(() => requireJwtSecret(config(placeholder))).toThrow(
        /valor de ejemplo/i,
      );
    },
  );

  it('rechaza un secreto demasiado corto', () => {
    expect(() => requireJwtSecret(config('corto'))).toThrow(/demasiado corto/i);
  });

  it('acepta exactamente 32 caracteres, rechaza 31', () => {
    expect(() => requireJwtSecret(config('b'.repeat(32)))).not.toThrow();
    expect(() => requireJwtSecret(config('b'.repeat(31)))).toThrow(
      /demasiado corto/i,
    );
  });

  it('el mensaje explica cómo generar uno', () => {
    expect(() => requireJwtSecret(config(undefined))).toThrow(/randomBytes/);
  });
});
