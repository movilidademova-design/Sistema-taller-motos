import {
  ArgumentsHost,
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
  InternalServerErrorException,
} from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';

/**
 * Lo que se protege aquí: que NINGÚN detalle interno salga hacia el cliente.
 *
 * Antes, cualquier excepción que no fuera HttpException devolvía
 * `exception.message` tal cual. Los mensajes de Prisma incluyen la invocación
 * completa con nombres de tabla, de columna y de restricción — reconocimiento
 * gratis para un atacante, y texto incomprensible para el usuario.
 */
function makeHost() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ method: 'POST', url: '/api/pos/sales' }),
    }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

/** Réplica de la forma de un error de Prisma: lo que importa es `.code`. */
function prismaError(code: string) {
  const err = new Error(
    `Invalid \`prisma.posSale.create()\` invocation:\n` +
      `Unique constraint failed on the fields: (\`tenantId\`,\`branchId\`,\`invoiceNumber\`)`,
  );
  (err as Error & { code: string }).code = code;
  return err;
}

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;
  beforeEach(() => {
    filter = new HttpExceptionFilter();
    jest.spyOn(filter['logger'], 'error').mockImplementation(() => undefined);
  });

  it('no filtra el mensaje interno de Prisma al cliente', () => {
    const { host, status, json } = makeHost();

    filter.catch(prismaError('P2002'), host);

    expect(status).toHaveBeenCalledWith(409);
    const [body] = json.mock.calls[0] as [{ message: string }];
    // Lo esencial: nada de la estructura de la base de datos sale de aquí.
    expect(body.message).not.toMatch(/prisma\./i);
    expect(body.message).not.toMatch(/invoiceNumber/);
    expect(body.message).not.toMatch(/Unique constraint/i);
    expect(body.message).not.toMatch(/tenantId/);
    expect(body.message).toContain('ya existe');
  });

  it('traduce P2025 (registro inexistente) a 404', () => {
    const { host, status, json } = makeHost();
    filter.catch(prismaError('P2025'), host);
    expect(status).toHaveBeenCalledWith(404);
    const [body] = json.mock.calls[0] as [{ message: string }];
    expect(body.message).not.toMatch(/prisma\./i);
  });

  it('oculta el mensaje de un error inesperado detrás de un 500 genérico', () => {
    const { host, status, json } = makeHost();

    filter.catch(
      new Error('connect ECONNREFUSED 10.0.0.5:5432 password=hunter2'),
      host,
    );

    expect(status).toHaveBeenCalledWith(500);
    const [body] = json.mock.calls[0] as [{ message: string }];
    expect(body.message).toBe('Error interno del servidor');
    expect(body.message).not.toMatch(/ECONNREFUSED|10\.0\.0\.5|hunter2/);
  });

  it('registra el detalle completo en el log del servidor, que es donde sí debe verse', () => {
    const { host } = makeHost();
    const spy = jest.spyOn(filter['logger'], 'error');

    filter.catch(new Error('detalle interno'), host);

    expect(spy).toHaveBeenCalled();
  });

  it('conserva intactos los mensajes de las excepciones propias de la aplicación', () => {
    const { host, status, json } = makeHost();

    filter.catch(
      new BadRequestException('Stock insuficiente para Casco'),
      host,
    );

    expect(status).toHaveBeenCalledWith(400);
    const [body] = json.mock.calls[0] as [{ message: string }];
    // Estos mensajes están escritos para el usuario: no deben taparse.
    expect(body.message).toBe('Stock insuficiente para Casco');
  });

  it('conserva el mensaje de un 404 propio', () => {
    const { host, status, json } = makeHost();
    filter.catch(new NotFoundException('Venta no encontrada'), host);
    expect(status).toHaveBeenCalledWith(404);
    const [body] = json.mock.calls[0] as [{ message: string }];
    expect(body.message).toBe('Venta no encontrada');
  });
});

describe('HttpExceptionFilter — 5xx intencionales vs inesperados', () => {
  let filter: HttpExceptionFilter;
  beforeEach(() => {
    filter = new HttpExceptionFilter();
    jest.spyOn(filter['logger'], 'error').mockImplementation(() => undefined);
  });

  /**
   * Regresión de un choque entre dos arreglos de la misma auditoría: el saneado
   * de errores (A-4) genericizaba TODO lo que fuera 5xx, y con eso tapó el
   * mensaje de un `ServiceUnavailableException` escrito a propósito para el
   * usuario («el correo no está configurado, usa WhatsApp»). Lo que se oculta
   * no es «lo que sea 5xx», es «lo que no controlamos».
   */
  it('conserva el mensaje de un 503 lanzado a propósito por la aplicación', () => {
    const { host, status, json } = makeHost();

    filter.catch(
      new ServiceUnavailableException(
        'El envío de correo no está configurado en este servidor. Usa WhatsApp.',
      ),
      host,
    );

    expect(status).toHaveBeenCalledWith(503);
    const [body] = json.mock.calls[0] as [{ message: string }];
    expect(body.message).toMatch(/correo no está configurado/i);
    expect(body.message).not.toBe('Error interno del servidor');
  });

  it('sigue ocultando un 500 que NO lanzamos nosotros', () => {
    const { host, status, json } = makeHost();
    filter.catch(new Error('connect ECONNREFUSED 10.0.0.5:5432'), host);
    expect(status).toHaveBeenCalledWith(500);
    const [body] = json.mock.calls[0] as [{ message: string }];
    expect(body.message).toBe('Error interno del servidor');
  });

  it('un InternalServerErrorException nuestro conserva su texto', () => {
    const { host, json } = makeHost();
    filter.catch(
      new InternalServerErrorException('No se pudo generar el PDF'),
      host,
    );
    const [body] = json.mock.calls[0] as [{ message: string }];
    expect(body.message).toBe('No se pudo generar el PDF');
  });
});
