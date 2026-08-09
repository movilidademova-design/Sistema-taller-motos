import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PosPrismaService } from '../pos-prisma.service';
import { CreatePosListDto } from './dto/list.dto';

@Injectable()
export class PosListsService {
  constructor(private readonly prisma: PosPrismaService) {}

  // Mismo aislamiento por sucursal que los productos: los colores, proveedores
  // y métodos de pago de Calle 80 no se mezclan con los de Ciudadela.
  findAll(tenantId: string, branchId: string, type?: string) {
    return this.prisma.posList.findMany({
      where: { tenantId, branchId, ...(type ? { type } : {}) },
      orderBy: { value: 'asc' },
    });
  }

  async create(tenantId: string, branchId: string, dto: CreatePosListDto) {
    const existing = await this.prisma.posList.findUnique({
      where: {
        tenantId_branchId_type_value: {
          tenantId,
          branchId,
          type: dto.type,
          value: dto.value,
        },
      },
    });
    // El original devolvía un 400 genérico ("Ya existe"); aquí un 409 deja
    // claro que el problema es un conflicto, no un dato inválido.
    if (existing)
      throw new ConflictException('Ese valor ya existe en la lista');
    return this.prisma.posList.create({ data: { ...dto, tenantId, branchId } });
  }

  async remove(tenantId: string, branchId: string, id: string) {
    const item = await this.prisma.posList.findFirst({
      where: { id, tenantId, branchId },
    });
    if (!item) throw new NotFoundException('Valor no encontrado');
    return this.prisma.posList.delete({ where: { id } });
  }
}
