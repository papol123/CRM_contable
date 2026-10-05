import { generarCsv } from './csv';

describe('generarCsv', () => {
  const texto = (b: Buffer) => b.toString('utf8').replace(/^﻿/, '');

  it('usa ; como separador, BOM UTF-8 y escapa comillas y saltos', () => {
    const csv = generarCsv([{ cliente: 'Taller "El Pistón"; SAS', total: 1500.5, nota: 'línea1\nlínea2' }]);
    expect(csv.subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]));
    expect(texto(csv)).toBe('cliente;total;nota\r\n"Taller ""El Pistón""; SAS";1500.5;"línea1\nlínea2"');
  });

  it('neutraliza fórmulas al abrir en Excel, pero no números negativos', () => {
    const csv = texto(generarCsv([{ a: '=HYPERLINK("http://x")', b: '+57 300', c: '-1500', d: '@SUM(A1)' }]));
    const [, fila] = csv.split('\r\n');
    expect(fila).toBe(`"'=HYPERLINK(""http://x"")";'+57 300;-1500;'@SUM(A1)`);
  });

  it('respeta el orden de columnas indicado y deja vacíos los nulos', () => {
    expect(texto(generarCsv([{ b: 2, a: null }], ['a', 'b']))).toBe('a;b\r\n;2');
  });
});
