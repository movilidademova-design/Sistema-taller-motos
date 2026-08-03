/**
 * Utilidades compartidas por los specs de los métodos `exportToExcel`.
 *
 * Los cinco reportes de esta fase se prueban igual: se le pasa al servicio un
 * `prisma` de mentira, se lo deja construir la consulta, y se mira el `where`
 * con el que llamó a `findMany`. Sin esto, cada spec repetiría el mismo
 * andamiaje cambiando solo el nombre de la entidad.
 */

/** El primer argumento con el que se llamó a un `findMany` simulado. */
export function findManyArgs(findMany: jest.Mock): Record<string, unknown> {
  expect(findMany).toHaveBeenCalled();
  const [args] = findMany.mock.calls[0] as [Record<string, unknown>];
  return args;
}

/** El `where` con el que se llamó a un `findMany` simulado. */
export function whereOf(findMany: jest.Mock): Record<string, unknown> {
  return findManyArgs(findMany).where as Record<string, unknown>;
}

/**
 * Un `prisma` simulado con un solo modelo, para los servicios que exportan con
 * un `findMany` suelto (no dentro de `$transaction`).
 */
export function stubPrisma(model: string, findMany: jest.Mock) {
  return { [model]: { findMany } } as never;
}

/** Un `ExcelService` simulado; `generate` devuelve un Buffer vacío. */
export function stubExcel(generate: jest.Mock = jest.fn()) {
  generate.mockResolvedValue(Buffer.from(''));
  return { generate } as never;
}
