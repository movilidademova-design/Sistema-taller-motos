import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * Traduce los errores conocidos de Prisma a una respuesta con sentido para el
 * usuario. Se detectan por el código (`P2002`, `P2025`…) en vez de importando
 * las clases del cliente generado, para no atar este filtro a Prisma.
 *
 * Devuelve `null` si no es un error de Prisma reconocido, y entonces el filtro
 * aplica su tratamiento genérico.
 */
function describePrismaError(
  exception: unknown,
): { status: number; message: string } | null {
  if (typeof exception !== 'object' || exception === null) return null;
  const code = (exception as { code?: unknown }).code;
  if (typeof code !== 'string' || !/^P\d{4}$/.test(code)) return null;

  switch (code) {
    case 'P2002':
      return {
        status: HttpStatus.CONFLICT,
        message:
          'Ese registro ya existe. Si otra persona guardó al mismo tiempo, vuelve a intentarlo.',
      };
    case 'P2025':
      return {
        status: HttpStatus.NOT_FOUND,
        message: 'El registro no existe o ya fue eliminado.',
      };
    case 'P2003':
      return {
        status: HttpStatus.CONFLICT,
        message:
          'No se puede completar: el registro está siendo usado por otro dato del sistema.',
      };
    default:
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Error interno del servidor',
      };
  }
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const prisma = describePrismaError(exception);

    const status: number =
      exception instanceof HttpException
        ? exception.getStatus()
        : (prisma?.status ?? HttpStatus.INTERNAL_SERVER_ERROR);

    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : null;

    const rawMessage =
      exceptionResponse && typeof exceptionResponse === 'object'
        ? (exceptionResponse as Record<string, unknown>).message
        : exception instanceof Error
          ? exception.message
          : 'Internal server error';

    const isServerError = status >= 500;
    if (isServerError || prisma) {
      // El detalle completo va SIEMPRE al log del servidor: es donde hay que
      // mirar cuando algo falla, y ahí sí puede llevar nombres de tabla.
      this.logger.error(
        `${request.method} ${request.url} -> ${status}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    // Lo que sale hacia el cliente nunca lleva interioridades. Los mensajes de
    // error de Prisma incluyen la consulta entera, con nombres de tabla, de
    // columna y de restricción: eso es reconocimiento gratis para un atacante,
    // y para el usuario final es un texto incomprensible.
    //
    // Pero una HttpException la escribió alguien de este equipo A PROPÓSITO,
    // también las 5xx: un `ServiceUnavailableException` que dice «el correo no
    // está configurado, usa WhatsApp» es exactamente lo que el usuario necesita
    // leer. Genericizar por el mero hecho de ser 5xx tapaba ese mensaje y
    // dejaba un inútil «Error interno del servidor» — comprobado en vivo.
    // La regla correcta no es el código de estado, es el origen: se oculta lo
    // que NO controlamos.
    const esIntencional = exception instanceof HttpException;
    const message = prisma
      ? prisma.message
      : isServerError && !esIntencional
        ? 'Error interno del servidor'
        : rawMessage;

    response.status(status).json({
      statusCode: status,
      path: request.url,
      timestamp: new Date().toISOString(),
      message,
    });
  }
}
