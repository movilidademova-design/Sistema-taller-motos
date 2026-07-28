import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * WhatsApp integration — ARCHITECTURE ONLY, per product requirements.
 *
 * The real integration (WhatsApp Business Cloud API, Twilio, etc.) is not
 * wired up yet. This service defines the templates the business already
 * knows it needs, and routes every call through a provider interface so
 * that plugging in a real provider later is a one-file change
 * (implement WhatsappProvider and set WHATSAPP_PROVIDER accordingly).
 */
export type WhatsappTemplate =
  | 'ORDER_RECEIVED'
  | 'QUOTATION_READY'
  | 'MAINTENANCE_REMINDER';

export interface WhatsappProvider {
  sendTemplate(
    toPhone: string,
    template: WhatsappTemplate,
    params: Record<string, string>,
  ): Promise<void>;
}

class NoopWhatsappProvider implements WhatsappProvider {
  private readonly logger = new Logger('WhatsappProvider(noop)');

  sendTemplate(
    toPhone: string,
    template: WhatsappTemplate,
    params: Record<string, string>,
  ): Promise<void> {
    this.logger.log(
      `[preparado, sin enviar] WhatsApp -> ${toPhone} | plantilla=${template} | datos=${JSON.stringify(params)}`,
    );
    return Promise.resolve();
  }
}

@Injectable()
export class WhatsappService {
  private readonly provider: WhatsappProvider;

  constructor(private readonly config: ConfigService) {
    // Only 'none' is implemented today. When a real provider is added,
    // branch here based on WHATSAPP_PROVIDER (e.g. 'meta-cloud-api', 'twilio').
    this.provider = new NoopWhatsappProvider();
  }

  notifyOrderReceived(phone: string, orderNumber: string) {
    return this.provider.sendTemplate(phone, 'ORDER_RECEIVED', {
      orderNumber,
    });
  }

  notifyQuotationReady(phone: string, orderNumber: string) {
    return this.provider.sendTemplate(phone, 'QUOTATION_READY', {
      orderNumber,
    });
  }

  sendMaintenanceReminder(
    phone: string,
    clientName: string,
    motorcycleLabel: string,
  ) {
    return this.provider.sendTemplate(phone, 'MAINTENANCE_REMINDER', {
      clientName,
      motorcycleLabel,
    });
  }
}
