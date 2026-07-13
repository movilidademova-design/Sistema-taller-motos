import { SetMetadata } from '@nestjs/common';

export const AUDIT_ENTITY_KEY = 'auditEntity';
/** Marks a handler for automatic audit logging under the given entity name (e.g. "Order", "Client"). */
export const Audit = (entity: string) => SetMetadata(AUDIT_ENTITY_KEY, entity);
