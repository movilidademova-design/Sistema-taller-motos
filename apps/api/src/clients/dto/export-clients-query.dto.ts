import { OmitType } from '@nestjs/swagger';
import { ExportQueryDto } from '../../common/dto/export-query.dto';

/**
 * `branchId` se excluye a propósito: los clientes son compartidos por todo el
 * taller (ver la "Nota de diseño — revertida" en
 * `docs/superpowers/specs/2026-07-28-sucursales-fase1-design.md`), así que este
 * export no filtra por sucursal. Heredar el campo sin usarlo haría que Swagger
 * anunciara un filtro que el endpoint ignora en silencio.
 */
export class ExportClientsQueryDto extends OmitType(ExportQueryDto, [
  'branchId',
] as const) {}
