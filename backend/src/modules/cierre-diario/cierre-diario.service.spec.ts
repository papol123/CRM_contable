import { calcularCuadre } from './cierre-diario.service';

describe('calcularCuadre', () => {
  const base = { remisiones: [], gastos: [], compras: [], facturadoDiaAnterior: 0, efectivoReal: 0 };

  it('día vacío: todo en cero', () => {
    expect(calcularCuadre(base)).toEqual({
      totalVentas: 0,
      ventasCobradas: 0,
      ventasCredito: 0,
      totalGastos: 0,
      totalComprasPagadas: 0,
      saldoEsperado: 0,
      diferencia: 0,
    });
  });

  it('saldo esperado = cobradas + facturado anterior − gastos − compras pagadas', () => {
    const c = calcularCuadre({
      remisiones: [
        { total: 100000, pagada: true },
        { total: 50000, pagada: false },
        { total: 30000.5, pagada: true },
      ],
      gastos: [{ monto: 20000 }, { monto: 5000 }],
      compras: [
        { monto: 40000, pagada: true },
        { monto: 90000, pagada: false },
      ],
      facturadoDiaAnterior: 10000,
      efectivoReal: 80000,
    });
    expect(c.totalVentas).toBe(180000.5);
    expect(c.ventasCobradas).toBe(130000.5);
    expect(c.ventasCredito).toBe(50000);
    expect(c.totalGastos).toBe(25000);
    expect(c.totalComprasPagadas).toBe(40000);
    expect(c.saldoEsperado).toBe(75000.5);
    expect(c.diferencia).toBe(4999.5);
  });

  it('faltante de caja da diferencia negativa', () => {
    const c = calcularCuadre({ ...base, remisiones: [{ total: 50000, pagada: true }], efectivoReal: 45000 });
    expect(c.diferencia).toBe(-5000);
  });
});
