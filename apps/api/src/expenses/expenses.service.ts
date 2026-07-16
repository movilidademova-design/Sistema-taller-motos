import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';

@Injectable()
export class ExpensesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(tenantId: string, storeId: string | null, from?: string, to?: string) {
    return this.prisma.expense.findMany({
      where: {
        tenantId,
        ...(storeId ? { storeId } : {}),
        ...(from || to
          ? {
              expenseDate: {
                ...(from ? { gte: new Date(from) } : {}),
                ...(to ? { lte: new Date(to) } : {}),
              },
            }
          : {}),
      },
      orderBy: { expenseDate: 'desc' },
      include: { createdBy: { select: { firstName: true, lastName: true } } },
    });
  }

  async findOne(tenantId: string, storeId: string | null, id: string) {
    const expense = await this.prisma.expense.findFirst({
      where: { id, tenantId, ...(storeId ? { storeId } : {}) },
      include: { createdBy: { select: { firstName: true, lastName: true } } },
    });
    if (!expense) throw new NotFoundException('Gasto no encontrado');
    return expense;
  }

  async create(
    tenantId: string,
    storeId: string | null,
    createdById: string,
    dto: CreateExpenseDto,
  ) {
    if (!storeId) {
      throw new BadRequestException('Selecciona una sucursal específica para registrar un gasto');
    }
    return this.prisma.expense.create({
      data: {
        tenantId,
        storeId,
        createdById,
        concept: dto.concept,
        category: dto.category,
        amount: dto.amount,
        expenseDate: dto.expenseDate ? new Date(dto.expenseDate) : undefined,
        notes: dto.notes,
      },
    });
  }

  async update(tenantId: string, storeId: string | null, id: string, dto: UpdateExpenseDto) {
    await this.findOne(tenantId, storeId, id);
    return this.prisma.expense.update({
      where: { id },
      data: {
        ...dto,
        expenseDate: dto.expenseDate ? new Date(dto.expenseDate) : undefined,
      },
    });
  }

  async remove(tenantId: string, storeId: string | null, id: string) {
    await this.findOne(tenantId, storeId, id);
    return this.prisma.expense.delete({ where: { id } });
  }
}
