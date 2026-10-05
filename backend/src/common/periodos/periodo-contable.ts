import { UnprocessableEntityException } from '@nestjs/common';
import { EntityManager } from 'typeorm';

/**
 * Un periodo contable cerrado no admite documentos ni movimientos con fecha
 * dentro de él (catálogo §34: "Modificación de periodo cerrado").
 * Toma un bloqueo compartido sobre la fila del periodo para que un cierre
 * simultáneo espere a que termine la transacción en curso.
 */
export async function validarPeriodoAbierto(
  db: EntityManager,
  fecha: string | Date,
  operacion = 'registrar la operación',
): Promise<void> {
  const iso = fecha instanceof Date ? fecha.toISOString().slice(0, 10) : String(fecha).slice(0, 10);
  const [anio, mes] = iso.split('-').map(Number);

  const [periodo] = await db.query(
    `SELECT abierto FROM periodos_contables WHERE anio = $1 AND mes = $2 FOR SHARE`,
    [anio, mes],
  );
  if (periodo && !periodo.abierto) {
    throw new UnprocessableEntityException({
      message: `El periodo contable ${anio}-${String(mes).padStart(2, '0')} está cerrado: no se puede ${operacion} con fecha ${iso}`,
      tipo: 'periodo-cerrado',
    });
  }
}
