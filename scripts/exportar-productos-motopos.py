#!/usr/bin/env python3
"""Convierte motopos/motopos.db en un .xlsx con el formato de la plantilla
de importación del POS (Referencia, Nombre, Categoría, Color, Proveedor,
Precio venta, Costo, Stock).

Se corre UNA sola vez, para la carga inicial de los 50 productos. El .xlsx
que produce no se carga por ningún atajo: se sube por la pantalla normal de
importación (/pos/productos/importar), así la primera carga queda probada
con el mismo camino que el usuario usará siempre.

Uso:
    python scripts/exportar-productos-motopos.py [ruta_db] [ruta_salida.xlsx]

Por defecto lee motopos/motopos.db y escribe motopos/productos-motopos.xlsx.
"""

import sqlite3
import sys
from pathlib import Path

from openpyxl import Workbook

HEADERS = [
    "Referencia",
    "Nombre",
    "Categoría",
    "Color",
    "Proveedor",
    "Precio venta",
    "Costo",
    "Stock",
]


def main() -> None:
    repo_root = Path(__file__).resolve().parent.parent
    db_path = Path(sys.argv[1]) if len(sys.argv) > 1 else repo_root / "motopos" / "motopos.db"
    out_path = (
        Path(sys.argv[2])
        if len(sys.argv) > 2
        else repo_root / "motopos" / "productos-motopos.xlsx"
    )

    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        """
        SELECT nombre, categoria, precio, costo, stock, referencia, color, proveedor
        FROM productos
        WHERE activo = 1
        ORDER BY id
        """
    ).fetchall()
    conn.close()

    wb = Workbook()
    sheet = wb.active
    sheet.title = "Inventario"
    sheet.append(HEADERS)

    costo_en_cero = 0
    sin_referencia = 0
    for row in rows:
        costo = row["costo"] or 0
        if costo == 0:
            costo_en_cero += 1
        referencia = (row["referencia"] or "").strip()
        if not referencia:
            sin_referencia += 1
        sheet.append(
            [
                referencia,
                row["nombre"],
                # MotoPos guarda la categoría en minúsculas (moto, taller); el
                # enum del POS la espera en mayúsculas.
                (row["categoria"] or "").strip().upper(),
                (row["color"] or "").strip(),
                (row["proveedor"] or "").strip(),
                row["precio"] or 0,
                costo,
                row["stock"] or 0,
            ]
        )

    out_path.parent.mkdir(parents=True, exist_ok=True)
    wb.save(str(out_path))

    print(f"{len(rows)} productos escritos en {out_path}")
    if costo_en_cero:
        print(
            f"AVISO: {costo_en_cero} producto(s) tienen costo en 0 en MotoPos. "
            "Los reportes de ganancia saldrán inflados hasta que se llene el costo real."
        )
    if sin_referencia:
        print(
            f"AVISO: {sin_referencia} producto(s) no tienen referencia. "
            "Al importarlos, siempre se crean como nuevos (nunca se emparejan con uno existente)."
        )


if __name__ == "__main__":
    main()
