import { liquidarEmpleado } from './nomina.service';

const parametros = { smmlv: 1423500, auxilioTransporte: 200000, topeAuxilioSmmlv: 2, pctSalud: 4, pctPension: 4 };
const sinNovedades = { diasTrabajados: 30, horasExtras: 0, bonificaciones: 0, otrasDeducciones: 0 };

describe('liquidarEmpleado', () => {
  it('salario mínimo con auxilio de transporte y aportes del 4 %', () => {
    expect(liquidarEmpleado(1423500, sinNovedades, parametros)).toEqual({
      salarioDevengado: 1423500,
      auxilioTransporte: 200000,
      deduccionSalud: 56940,
      deduccionPension: 56940,
      neto: 1509620,
    });
  });

  it('prorratea salario y auxilio por días; horas extras suman a la base de aportes', () => {
    const l = liquidarEmpleado(1423500, { ...sinNovedades, diasTrabajados: 15, horasExtras: 100000 }, parametros);
    expect(l.salarioDevengado).toBe(711750);
    expect(l.auxilioTransporte).toBe(100000);
    expect(l.deduccionSalud).toBe(32470);
    expect(l.neto).toBe(846810);
  });

  it('sin auxilio por encima de 2 SMMLV y con otras deducciones', () => {
    const l = liquidarEmpleado(3000000, { ...sinNovedades, otrasDeducciones: 100000 }, parametros);
    expect(l.auxilioTransporte).toBe(0);
    expect(l.neto).toBe(3000000 - 120000 - 120000 - 100000);
  });

  it('acota los días entre 0 y 30', () => {
    expect(liquidarEmpleado(1423500, { ...sinNovedades, diasTrabajados: 45 }, parametros).salarioDevengado).toBe(1423500);
    expect(liquidarEmpleado(1423500, { ...sinNovedades, diasTrabajados: -3 }, parametros).neto).toBe(0);
  });
});
