import { buildIntakeReason } from './intake-reason.util';

describe('buildIntakeReason', () => {
  it('joins quick-service labels and the free-text description', () => {
    expect(buildIntakeReason(['Mantenimiento 3ro', 'Cambio de batería'], 'No enciende')).toBe(
      'Mantenimiento 3ro, Cambio de batería — No enciende',
    );
  });

  it('works with only quick-service labels', () => {
    expect(buildIntakeReason(['Diagnóstico'], '')).toBe('Diagnóstico');
  });

  it('works with only free text', () => {
    expect(buildIntakeReason([], 'La moto no enciende')).toBe('La moto no enciende');
  });
});
