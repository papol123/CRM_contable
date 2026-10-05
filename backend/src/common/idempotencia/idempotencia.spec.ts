import { jsonEstable } from './idempotencia';

describe('jsonEstable', () => {
  it('no depende del orden de las claves', () => {
    expect(jsonEstable({ b: 1, a: { d: [1, { y: 2, x: 1 }], c: null } })).toBe(
      jsonEstable({ a: { c: null, d: [1, { x: 1, y: 2 }] }, b: 1 }),
    );
  });

  it('distingue valores y orden de los arreglos', () => {
    expect(jsonEstable({ items: [1, 2] })).not.toBe(jsonEstable({ items: [2, 1] }));
    expect(jsonEstable({ monto: 100 })).not.toBe(jsonEstable({ monto: '100' }));
  });

  it('trata undefined como null en la raíz', () => {
    expect(jsonEstable(undefined)).toBe('null');
  });
});
