import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateClientDto } from '../../clients/dto/create-client.dto';
import { CreateSupplierDto } from '../../inventory/suppliers/dto/supplier.dto';

/**
 * Regresión de un bug que llegó hasta la interfaz: no se podía crear un cliente
 * sin correo.
 *
 * `@IsOptional()` salta la validación con `undefined` y con `null`, pero NO con
 * la cadena vacía. Un formulario web inicializa sus campos a `''` y los envía
 * así aunque el usuario no los toque, de modo que el `@IsEmail()` de un campo
 * opcional recibía `''` y tumbaba la petición entera con
 * `400 ["email must be an email"]`.
 */
function errores(cls: new () => object, payload: Record<string, unknown>) {
  const dto = plainToInstance(cls, payload);
  return validateSync(dto).flatMap((e) => Object.values(e.constraints ?? {}));
}

describe('Campos opcionales enviados como cadena vacía', () => {
  it('acepta un cliente con el correo vacío (el caso que rompía la interfaz)', () => {
    expect(
      errores(CreateClientDto, {
        firstName: 'Ana',
        lastName: 'Pérez',
        documentId: '123',
        phone: '3001112222',
        email: '',
        address: '',
        notes: '',
      }),
    ).toEqual([]);
  });

  it('acepta una fecha de nacimiento vacía', () => {
    expect(
      errores(CreateClientDto, {
        firstName: 'Ana',
        lastName: 'Pérez',
        birthDate: '',
      }),
    ).toEqual([]);
  });

  it('sigue rechazando un correo que de verdad está mal escrito', () => {
    const e = errores(CreateClientDto, {
      firstName: 'Ana',
      lastName: 'Pérez',
      email: 'esto-no-es-un-correo',
    });
    expect(e.join(' ')).toMatch(/email/i);
  });

  it('sigue rechazando una fecha con formato inválido', () => {
    const e = errores(CreateClientDto, {
      firstName: 'Ana',
      lastName: 'Pérez',
      birthDate: 'ayer',
    });
    expect(e.length).toBeGreaterThan(0);
  });

  it('sigue exigiendo los campos que sí son obligatorios', () => {
    expect(
      errores(CreateClientDto, { email: 'a@b.com' }).length,
    ).toBeGreaterThan(0);
  });

  it('vale también para otros DTOs con correo opcional (proveedores)', () => {
    expect(errores(CreateSupplierDto, { name: 'ACME', email: '' })).toEqual([]);
  });

  it('un correo con solo espacios cuenta como vacío, no como inválido', () => {
    expect(
      errores(CreateClientDto, { firstName: 'A', lastName: 'B', email: '   ' }),
    ).toEqual([]);
  });
});
