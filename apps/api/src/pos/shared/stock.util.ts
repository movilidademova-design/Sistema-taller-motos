import { BadRequestException } from '@nestjs/common';

/**
 * Descuenta stock comprobando la disponibilidad EN LA MISMA operación.
 *
 * El patrón anterior era comprobar y descontar por separado:
 *
 *     if (product.stock < qty) throw ...        // en resolveItem, al principio
 *     ...                                       // resto de la transacción
 *     update({ data: { stock: { decrement: qty } } })   // mucho después
 *
 * La comprobación es correcta en secuencial y no sirve de nada en concurrencia:
 * entre la lectura y la escritura corren N consultas de producto, el cálculo de
 * totales, el escaneo de números de factura y la creación de la venta con sus
 * ítems y pagos. En ese hueco otra transacción lee el mismo stock y pasa la
 * misma comprobación. Reproducido contra PostgreSQL real: dos ventas de la
 * última unidad dejaron el stock en -1.
 *
 * `updateMany` con `stock: { gte: quantity }` en el WHERE resuelve las dos
 * cosas a la vez: PostgreSQL evalúa la condición y aplica la resta bajo el
 * mismo bloqueo de fila. Si otra transacción se llevó las existencias, la
 * condición ya no se cumple, se actualizan 0 filas y abortamos.
 */
interface StockUpdater {
  posProduct: {
    updateMany(args: {
      where: { id: string; stock?: { gte: number } };
      data: { stock: { decrement: number } };
    }): Promise<{ count: number }>;
  };
}

export async function decrementStock(
  tx: StockUpdater,
  productId: string,
  quantity: number,
  productName: string,
): Promise<void> {
  const { count } = await tx.posProduct.updateMany({
    where: { id: productId, stock: { gte: quantity } },
    data: { stock: { decrement: quantity } },
  });

  if (count === 0) {
    // Lanzar aquí deshace toda la transacción: la venta no se guarda a medias.
    throw new BadRequestException(
      `Stock insuficiente para ${productName}. Otra caja pudo haber vendido las últimas unidades; vuelve a consultar el inventario.`,
    );
  }
}
