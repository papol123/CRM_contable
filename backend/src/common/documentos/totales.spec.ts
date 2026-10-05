import { calcularLinea, calcularTotales, calcularTotalesCompra, redondear } from './totales';

describe('totales de documentos', () => {
  it('línea de venta: descuento antes de IVA', () => {
    expect(calcularLinea({ cantidad: 2, valorUnitario: 100000, pctDescuento: 10, pctIva: 19 })).toEqual({
      lineaBase: 200000,
      descuento: 20000,
      baseGravable: 180000,
      iva: 34200,
      totalLinea: 214200,
    });
  });

  it('remisión: totales con retención en la fuente', () => {
    const t = calcularTotales(
      [
        { cantidad: 1, valorUnitario: 100000, pctDescuento: 10, pctIva: 19 },
        { cantidad: 3, valorUnitario: 5000, pctIva: 0 },
      ],
      2500,
    );
    expect(t).toEqual({
      subtotal: 115000,
      totalDescuento: 10000,
      subtotalNeto: 105000,
      totalIva: 17100,
      retefuente: 2500,
      total: 119600,
    });
  });

  it('redondea medio centavo hacia arriba', () => {
    expect(redondear(1.005)).toBe(1.01);
    expect(redondear(2.675)).toBe(2.68);
  });

  describe('compra con retenciones', () => {
    const lineas = [{ cantidad: 10, costoUnitario: 10000, pctDescuento: 10, pctIva: 19 }];

    it('ReteFuente sobre la base, ReteIVA sobre el IVA y ReteICA por mil', () => {
      const t = calcularTotalesCompra(lineas, { pctRetefuente: 2.5, pctReteIva: 15, tarifaReteIcaPorMil: 9.66 });
      expect(t.base).toBe(90000);
      expect(t.totalIva).toBe(17100);
      expect(t.totalBruto).toBe(107100);
      expect(t.retefuente).toBe(2250);
      expect(t.reteiva).toBe(2565);
      expect(t.reteica).toBe(869.4);
      expect(t.total).toBe(101415.6);
    });

    it('sin tarifas no hay retenciones', () => {
      const t = calcularTotalesCompra(lineas);
      expect(t.totalRetenciones).toBe(0);
      expect(t.total).toBe(107100);
    });

    it('con retenciones guardadas usa los valores fijos (lectura de documentos)', () => {
      const t = calcularTotalesCompra(lineas, {}, { retefuente: '1000', reteiva: '0', reteica: '0' });
      expect(t.retefuente).toBe(1000);
      expect(t.total).toBe(106100);
    });
  });
});
