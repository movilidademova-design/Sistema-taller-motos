import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { IntakeOrderDto } from './intake-order.dto';

describe('IntakeOrderDto', () => {
  it('validates successfully with a JSON-string newClient and newMotorcycle (as arrives via multipart/form-data)', async () => {
    const raw = {
      newClient: JSON.stringify({
        documentId: '123',
        firstName: 'Ana',
        lastName: 'Gómez',
      }),
      newMotorcycle: JSON.stringify({
        vehicleType: 'MOTO',
        brand: 'Volt',
        model: 'X1',
      }),
      description: 'No enciende',
    };
    const dto = plainToInstance(IntakeOrderDto, raw);
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects a newClient missing required fields', async () => {
    const raw = {
      newClient: JSON.stringify({ documentId: '123' }),
      newMotorcycle: JSON.stringify({ vehicleType: 'MOTO', brand: 'Volt', model: 'X1' }),
      description: 'No enciende',
    };
    const dto = plainToInstance(IntakeOrderDto, raw);
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'newClient')).toBe(true);
  });

  it('allows omitting newClient/newMotorcycle entirely when clientId/motorcycleId are used instead', async () => {
    const raw = {
      clientId: '11111111-1111-4111-8111-111111111111',
      motorcycleId: '22222222-2222-4222-8222-222222222222',
      description: 'No enciende',
    };
    const dto = plainToInstance(IntakeOrderDto, raw);
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('throws a BadRequestException for malformed JSON in newClient', () => {
    const raw = { newClient: '{not valid json', description: 'x' };
    expect(() => plainToInstance(IntakeOrderDto, raw)).toThrow('newClient');
  });
});
