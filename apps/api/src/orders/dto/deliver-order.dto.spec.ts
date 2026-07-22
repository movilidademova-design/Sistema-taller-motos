import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DeliverOrderDto } from './deliver-order.dto';

describe('DeliverOrderDto', () => {
  it('accepts a valid 6-digit pickup code', async () => {
    const dto = plainToInstance(DeliverOrderDto, { pickupCode: '482931' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects a non-numeric 6-character code', async () => {
    const dto = plainToInstance(DeliverOrderDto, { pickupCode: 'abcdef' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'pickupCode')).toBe(true);
  });

  it('rejects codes with the wrong length', async () => {
    const short = plainToInstance(DeliverOrderDto, { pickupCode: '1234' });
    const long = plainToInstance(DeliverOrderDto, { pickupCode: '1234567' });
    expect((await validate(short)).some((e) => e.property === 'pickupCode')).toBe(true);
    expect((await validate(long)).some((e) => e.property === 'pickupCode')).toBe(true);
  });
});
