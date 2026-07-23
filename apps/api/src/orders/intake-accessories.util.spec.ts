import { buildAccessoriesText } from './intake-accessories.util';

describe('buildAccessoriesText', () => {
  it('joins checked accessory labels and the free-text "otro" field', () => {
    expect(buildAccessoriesText(['Llaves', 'Casco'], 'candado de disco')).toBe(
      'Llaves, Casco, candado de disco',
    );
  });

  it('works with only checked labels', () => {
    expect(buildAccessoriesText(['Llaves', 'Cargador'], '')).toBe('Llaves, Cargador');
  });

  it('works with only the "otro" text', () => {
    expect(buildAccessoriesText([], 'silla para bebé')).toBe('silla para bebé');
  });

  it('returns undefined when nothing was provided', () => {
    expect(buildAccessoriesText([], '')).toBeUndefined();
    expect(buildAccessoriesText([], '   ')).toBeUndefined();
  });
});
