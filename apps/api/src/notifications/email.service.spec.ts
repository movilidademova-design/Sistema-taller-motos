import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailService } from './email.service';

/**
 * Regresión de un fallo silencioso encontrado en la auditoría del 2026-08-13.
 *
 * Con SMTP sin configurar, `send()` sólo dejaba un aviso en el log y devolvía
 * como si todo hubiera ido bien. Los dos sitios que lo llaman son endpoints
 * cuyo trabajo ES enviar el correo, así que la notificación quedaba marcada
 * como «SENT / EMAIL» con su fecha — comprobado en la base — **sin que saliera
 * ningún correo**. El taller creía haber avisado al cliente.
 */
const config = (valores: Record<string, string | undefined>) =>
  ({ get: (k: string) => valores[k] }) as unknown as ConfigService;

describe('EmailService sin SMTP configurado', () => {
  it('lanza en vez de fingir que envió', async () => {
    const service = new EmailService(config({}));
    await expect(
      service.send({ to: 'a@b.com', subject: 'x', html: '<p>y</p>' }),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('el mensaje ofrece una alternativa al usuario', async () => {
    const service = new EmailService(config({ SMTP_HOST: '' }));
    await expect(
      service.send({ to: 'a@b.com', subject: 'x', html: '<p>y</p>' }),
    ).rejects.toThrow(/copiar el mensaje|WhatsApp/i);
  });

  it('también falla en los envíos con adjunto (cotización, factura)', async () => {
    const service = new EmailService(config({}));
    await expect(
      service.sendQuotationReady('a@b.com', '00010001', Buffer.from('pdf')),
    ).rejects.toThrow(ServiceUnavailableException);
    await expect(
      service.sendInvoice('a@b.com', 'FAC-1', Buffer.from('pdf')),
    ).rejects.toThrow(ServiceUnavailableException);
  });
});

describe('EmailService — escapado de HTML', () => {
  /**
   * El mensaje de notificación es texto libre escrito por el personal. Sin
   * escapar, cualquier `<` del texto rompería el HTML del correo, y una carga
   * deliberada podría inyectar marcado en el buzón del cliente.
   */
  it('escapa el marcado del mensaje libre', async () => {
    const enviados: { html: string }[] = [];
    const service = new EmailService(
      config({ SMTP_HOST: 'smtp.test', SMTP_PORT: '587' }),
    );
    // Sustituye el transporte real por uno que sólo recuerda lo que se le pidió.
    (service as unknown as { transporter: unknown }).transporter = {
      sendMail: (o: { html: string }) => {
        enviados.push(o);
        return Promise.resolve();
      },
    };

    await service.sendNotificationMessage(
      'a@b.com',
      '00010001',
      '<script>alert(1)</script> y <b>negrita</b>',
    );

    expect(enviados).toHaveLength(1);
    expect(enviados[0].html).not.toContain('<script>');
    expect(enviados[0].html).toContain('&lt;script&gt;');
  });

  it('escapa también el nombre del cliente y el del taller', async () => {
    const enviados: { html: string }[] = [];
    const service = new EmailService(config({ SMTP_HOST: 'smtp.test' }));
    (service as unknown as { transporter: unknown }).transporter = {
      sendMail: (o: { html: string }) => {
        enviados.push(o);
        return Promise.resolve();
      },
    };

    await service.sendIntakeConfirmation('a@b.com', {
      clientFirstName: '<img src=x onerror=alert(1)>',
      orderNumber: '00010001',
      pickupCode: '123456',
      tenantName: '<b>Taller</b>',
    });

    expect(enviados[0].html).not.toContain('<img');
    expect(enviados[0].html).not.toContain('<b>Taller</b>');
  });
});

describe('EmailService — el servidor SMTP falla', () => {
  /**
   * Regresión: con SMTP configurado pero caído, el error de nodemailer
   * (ECONNREFUSED) subía sin capturar y el usuario recibía «Error interno del
   * servidor», que no le dice qué hacer. El detalle técnico debe ir al log y
   * el usuario merece una instrucción.
   */
  const configSmtp = () =>
    ({ get: (k: string) => ({ SMTP_HOST: 'smtp.test', SMTP_PORT: '587' })[k] }) as unknown as ConfigService;

  function servicioConEnvioRoto(error: Error) {
    const s = new EmailService(configSmtp());
    (s as unknown as { transporter: unknown }).transporter = {
      sendMail: () => Promise.reject(error),
    };
    jest.spyOn(s['logger'], 'error').mockImplementation(() => undefined);
    return s;
  }

  it('traduce un fallo de conexión a 503 con instrucciones', async () => {
    const s = servicioConEnvioRoto(new Error('connect ECONNREFUSED 127.0.0.1:1025'));
    await expect(
      s.send({ to: 'a@b.com', subject: 'x', html: '<p>y</p>' }),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('NO filtra el detalle técnico al usuario', async () => {
    const s = servicioConEnvioRoto(new Error('connect ECONNREFUSED 10.0.0.5:587 user=admin'));
    await expect(
      s.send({ to: 'a@b.com', subject: 'x', html: '<p>y</p>' }),
    ).rejects.not.toThrow(/ECONNREFUSED|10\.0\.0\.5|user=admin/);
  });

  it('el detalle técnico SÍ va al log del servidor', async () => {
    const s = servicioConEnvioRoto(new Error('535 Authentication failed'));
    const spy = jest.spyOn(s['logger'], 'error');
    await s.send({ to: 'a@b.com', subject: 'x', html: '<p>y</p>' }).catch(() => undefined);
    expect(spy).toHaveBeenCalled();
  });

  it('unas credenciales rechazadas también dan 503, no 500', async () => {
    const s = servicioConEnvioRoto(new Error('535 5.7.8 Authentication credentials invalid'));
    await expect(
      s.sendInvoice('a@b.com', 'FAC-1', Buffer.from('pdf')),
    ).rejects.toThrow(ServiceUnavailableException);
  });
});
