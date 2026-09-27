/**
 * Catálogo de datos de demostración (terceros y productos).
 * seed-demo.js los inserta y simula la operación sobre ellos.
 * Los NIT y cédulas son ficticios.
 */

// [nit, razón social, ciudad, días de plazo, contacto, cargo, teléfono, email]
const proveedores = [
  ['900123456-1', 'Distribuidora Automotriz de Colombia SAS', 'Bogotá', 30, 'Roberto Méndez', 'Director de Ventas Mayoristas', '6013456789', 'ventas@distriautocol.com.co'],
  ['900789012-3', 'Importadora Frenos & Suspensiones del Valle SAS', 'Cali', 45, 'Camila Sandoval', 'Jefe de Logística', '6024456781', 'pedidos@frenosdelvalle.com.co'],
  ['900456123-5', 'Lubricantes y Filtros Industriales SA', 'Medellín', 60, 'Mauricio Henao', 'Gerente de Cuentas', '6043345678', 'contacto@lubrifiltros.com.co'],
  ['901112233-4', 'Electro Baterías Nacionales SAS', 'Bogotá', 30, 'Paola Ríos', 'Asesora Comercial', '6017788990', 'comercial@electrobaterias.com.co'],
  ['901223344-6', 'Repuestos Japoneses del Caribe SAS', 'Barranquilla', 30, 'Álvaro Pacheco', 'Gerente General', '6053456123', 'ventas@repjapcaribe.com.co'],
  ['901334455-8', 'Correas y Rodamientos Andinos Ltda', 'Bucaramanga', 45, 'Diana Cárdenas', 'Coordinadora de Ventas', '6076543210', 'pedidos@correasandinos.com.co'],
  ['901445566-0', 'Iluminación Vehicular Global SAS', 'Bogotá', 30, 'Felipe Salazar', 'Ejecutivo de Cuenta', '6012233445', 'info@iluminacionglobal.com.co'],
  ['901556677-2', 'Químicos Automotrices del Eje SAS', 'Pereira', 30, 'Natalia Giraldo', 'Directora Comercial', '6063345566', 'ventas@quimicoseje.com.co'],
];

// [documento, nombre, ciudad, tipo, cupo, días de plazo, teléfono, email]
// tipo: FLOTA (lista flotas), TALLER (lista mayorista), NATURAL (lista público)
const clientes = [
  ['901234567-8', 'Taller Mecánico Especializado El Pistón SAS', 'Bogotá', 'TALLER', 25000000, 30, '3109876543', 'facturacion@tallerpiston.com'],
  ['901876543-2', 'Flota de Transporte Metropolitano SA', 'Medellín', 'FLOTA', 60000000, 45, '3147654321', 'mantenimiento@flotametro.com.co'],
  ['901999888-9', 'AutoServicios Santander SAS', 'Bucaramanga', 'TALLER', 15000000, 30, '3176543219', 'compras@autoserviciossantander.com'],
  ['902001122-1', 'Transportes La Sabana SAS', 'Chía', 'FLOTA', 40000000, 45, '3183456712', 'flota@transsabana.com.co'],
  ['902002233-3', 'Taxis Libres del Norte SAS', 'Bogotá', 'FLOTA', 30000000, 30, '3004567812', 'taller@taxislibresnorte.com'],
  ['902003344-5', 'Lubricentro La 80 SAS', 'Medellín', 'TALLER', 12000000, 30, '3015678923', 'lubricentro80@gmail.com'],
  ['902004455-7', 'Serviteca El Dorado SAS', 'Bogotá', 'TALLER', 18000000, 30, '3026789034', 'servitecaeldorado@gmail.com'],
  ['902005566-9', 'Mecánica Rápida Valle SAS', 'Cali', 'TALLER', 10000000, 15, '3037890145', 'mecanicarapidavalle@gmail.com'],
  ['902006677-0', 'Concesionario Motor Andino SA', 'Bogotá', 'TALLER', 45000000, 45, '3048901256', 'posventa@motorandino.com.co'],
  ['902007788-2', 'Expreso Cafetero SAS', 'Pereira', 'FLOTA', 35000000, 45, '3059012367', 'mantenimiento@expresocafetero.com'],
  ['902008899-4', 'Taller Frenos y Clutch Kennedy', 'Bogotá', 'TALLER', 8000000, 15, '3060123478', 'frenoskennedy@hotmail.com'],
  ['902009900-6', 'Logística Integral del Caribe SAS', 'Barranquilla', 'FLOTA', 50000000, 60, '3071234589', 'flota@logicaribe.com.co'],
  ['902010011-8', 'Autopartes y Servicio Envigado SAS', 'Envigado', 'TALLER', 9000000, 30, '3082345690', 'ventas@autopartesenvigado.com'],
  ['902011122-0', 'Centro Automotriz Palmira SAS', 'Palmira', 'TALLER', 7000000, 15, '3093456701', 'centroautopalmira@gmail.com'],
  ['902012233-1', 'Mensajería Veloz Colombia SAS', 'Bogotá', 'FLOTA', 20000000, 30, '3104567812', 'motos@mensajeriaveloz.com'],
  ['1018456789', 'Juan Pablo Montoya Pérez', 'Bogotá', 'NATURAL', 0, 0, '3157891234', 'jp.montoya@gmail.com'],
  ['1020304050', 'Carlos Alberto Rodríguez Ruiz', 'Medellín', 'NATURAL', 0, 0, '3168902345', 'carlos.rodriguez@hotmail.com'],
  ['1032405060', 'Diana Marcela Torres Gómez', 'Bogotá', 'NATURAL', 3000000, 15, '3179013456', 'diana.torres@gmail.com'],
  ['1045678901', 'Luis Fernando Quintero Mesa', 'Cali', 'NATURAL', 0, 0, '3180124567', 'lf.quintero@yahoo.com'],
  ['1056789012', 'Andrea Carolina Beltrán Ruiz', 'Bogotá', 'NATURAL', 0, 0, '3191235678', 'andrea.beltran@gmail.com'],
  ['1067890123', 'Jorge Enrique Castaño Ríos', 'Pereira', 'NATURAL', 2000000, 15, '3202346789', 'jorge.castano@gmail.com'],
  ['1078901234', 'Paula Andrea Murillo Díaz', 'Medellín', 'NATURAL', 0, 0, '3213457890', 'paula.murillo@outlook.com'],
  ['1089012345', 'Hernán Darío Ospina Vélez', 'Bogotá', 'NATURAL', 0, 0, '3224568901', 'hd.ospina@gmail.com'],
  ['1090123456', 'Ricardo José Navarro Pinto', 'Barranquilla', 'NATURAL', 0, 0, '3235679012', 'ricardo.navarro@gmail.com'],
  ['1101234567', 'Gloria Patricia Suárez León', 'Bucaramanga', 'NATURAL', 0, 0, '3246780123', 'gloria.suarez@hotmail.com'],
  ['1112345678', 'Camilo Andrés Vargas Pardo', 'Bogotá', 'NATURAL', 4000000, 30, '3257891234', 'camilo.vargas@gmail.com'],
  ['1123456789', 'Natalia Rendón Arango', 'Envigado', 'NATURAL', 0, 0, '3268902345', 'natalia.rendon@gmail.com'],
  ['1134567890', 'Oscar Iván Moreno Gil', 'Soacha', 'NATURAL', 0, 0, '3279013456', 'oscar.moreno@gmail.com'],
];

// Clientes que pagan tarde o no pagan: generan cartera vencida en la demo
const clientesMorosos = ['902008899-4', '902011122-0', '1032405060'];

// [código, nombre, subcategoría, marca, unidad, costo, stock mínimo, % IVA, NIT proveedor principal]
const productos = [
  ['REP-FRE-001', 'Pastillas de Freno Delanteras Cerámica', 'Frenos y Discos', 'Brembo', 'JGO', 120000, 10, 19, '900789012-3'],
  ['REP-FRE-002', 'Disco de Freno Ventilado Delantero', 'Frenos y Discos', 'Fremax', 'UND', 185000, 6, 19, '900789012-3'],
  ['REP-FRE-003', 'Pastillas de Freno Traseras Semimetálicas', 'Frenos y Discos', 'Bosch', 'JGO', 85000, 10, 19, '900789012-3'],
  ['REP-FRE-004', 'Bandas de Freno Traseras', 'Frenos y Discos', 'Bosch', 'JGO', 72000, 8, 19, '900789012-3'],
  ['REP-FRE-005', 'Líquido de Frenos DOT 4 (500 ml)', 'Aditivos y Líquidos', 'Bosch', 'UND', 18000, 24, 19, '901556677-2'],
  ['REP-FRE-006', 'Cilindro Maestro de Freno', 'Frenos y Discos', 'Bosch', 'UND', 240000, 3, 19, '900789012-3'],
  ['REP-SUS-001', 'Amortiguador Delantero a Gas', 'Suspensión y Dirección', 'Monroe', 'UND', 210000, 8, 19, '900789012-3'],
  ['REP-SUS-002', 'Terminal de Dirección Izquierdo', 'Suspensión y Dirección', '555 Sankei', 'UND', 65000, 12, 19, '901223344-6'],
  ['REP-SUS-003', 'Terminal de Dirección Derecho', 'Suspensión y Dirección', '555 Sankei', 'UND', 65000, 12, 19, '901223344-6'],
  ['REP-SUS-004', 'Rótula de Suspensión Inferior', 'Suspensión y Dirección', '555 Sankei', 'UND', 78000, 10, 19, '901223344-6'],
  ['REP-SUS-005', 'Amortiguador Trasero a Gas', 'Suspensión y Dirección', 'Monroe', 'UND', 180000, 8, 19, '900789012-3'],
  ['REP-SUS-006', 'Kit de Bujes de Tijera', 'Suspensión y Dirección', 'Monroe', 'JGO', 95000, 6, 19, '900789012-3'],
  ['REP-SUS-007', 'Axial de Dirección', 'Suspensión y Dirección', '555 Sankei', 'UND', 58000, 10, 19, '901223344-6'],
  ['REP-MOT-001', 'Kit de Embrague Completo', 'Motor y Transmisión', 'Valeo', 'JGO', 430000, 4, 19, '900123456-1'],
  ['REP-MOT-002', 'Kit de Correa de Repartición con Tensor', 'Motor y Transmisión', 'Gates', 'JGO', 260000, 5, 19, '901334455-8'],
  ['REP-MOT-003', 'Bomba de Agua', 'Refrigeración', 'Gates', 'UND', 175000, 5, 19, '901334455-8'],
  ['REP-MOT-004', 'Correa de Accesorios Poly-V', 'Motor y Transmisión', 'Gates', 'UND', 48000, 12, 19, '901334455-8'],
  ['REP-MOT-005', 'Empaque de Culata', 'Motor y Transmisión', 'Valeo', 'UND', 95000, 5, 19, '900123456-1'],
  ['REP-MOT-006', 'Rodamiento de Rueda Delantero', 'Motor y Transmisión', 'SKF', 'UND', 88000, 8, 19, '901334455-8'],
  ['REP-MOT-007', 'Soporte de Motor Delantero', 'Motor y Transmisión', 'Valeo', 'UND', 110000, 5, 19, '900123456-1'],
  ['REP-MOT-008', 'Kit de Distribución con Cadena', 'Motor y Transmisión', 'SKF', 'JGO', 520000, 2, 19, '901334455-8'],
  ['REP-REF-001', 'Radiador de Aluminio', 'Refrigeración', 'Denso', 'UND', 380000, 3, 19, '901223344-6'],
  ['REP-REF-002', 'Termostato con Carcasa', 'Refrigeración', 'Denso', 'UND', 72000, 8, 19, '901223344-6'],
  ['REP-REF-003', 'Refrigerante Verde Concentrado (1 galón)', 'Aditivos y Líquidos', 'Terpel', 'GAL', 38000, 20, 19, '901556677-2'],
  ['REP-REF-004', 'Electroventilador de Radiador', 'Refrigeración', 'Denso', 'UND', 290000, 3, 19, '901223344-6'],
  ['REP-FIL-001', 'Filtro de Aceite Alto Rendimiento', 'Filtros', 'Bosch', 'UND', 22000, 30, 19, '900456123-5'],
  ['REP-FIL-002', 'Filtro de Aire de Motor', 'Filtros', 'Mann Filter', 'UND', 38000, 20, 19, '900456123-5'],
  ['REP-FIL-003', 'Filtro de Combustible', 'Filtros', 'Mann Filter', 'UND', 42000, 15, 19, '900456123-5'],
  ['REP-FIL-004', 'Filtro de Cabina (Aire Acondicionado)', 'Filtros', 'Mann Filter', 'UND', 35000, 15, 19, '900456123-5'],
  ['REP-FIL-005', 'Filtro de Aceite para Diésel', 'Filtros', 'Mann Filter', 'UND', 48000, 12, 19, '900456123-5'],
  ['REP-LUB-001', 'Aceite Sintético 5W-30 (1 litro)', 'Aceites de Motor', 'Mobil', 'LIT', 38000, 48, 19, '900456123-5'],
  ['REP-LUB-002', 'Aceite Semisintético 10W-40 (1 galón)', 'Aceites de Motor', 'Castrol', 'GAL', 115000, 20, 19, '900456123-5'],
  ['REP-LUB-003', 'Aceite Mineral 20W-50 (1 galón)', 'Aceites de Motor', 'Terpel', 'GAL', 78000, 20, 19, '900456123-5'],
  ['REP-LUB-004', 'Aceite para Diésel 15W-40 (1 galón)', 'Aceites de Motor', 'Mobil', 'GAL', 105000, 15, 19, '900456123-5'],
  ['REP-LUB-005', 'Aceite de Transmisión ATF (1 litro)', 'Aceites de Motor', 'Castrol', 'LIT', 32000, 24, 19, '900456123-5'],
  ['REP-LUB-006', 'Aditivo Limpiador de Inyectores', 'Aditivos y Líquidos', 'Terpel', 'UND', 24000, 20, 19, '901556677-2'],
  ['REP-LUB-007', 'Grasa Multipropósito (1 libra)', 'Aditivos y Líquidos', 'Mobil', 'UND', 19000, 15, 19, '901556677-2'],
  ['REP-ELE-001', 'Batería 12V 800 AMP', 'Baterías y Alternadores', 'Baterías MAC', 'UND', 310000, 5, 19, '901112233-4'],
  ['REP-ELE-002', 'Juego de 4 Bujías de Iridio', 'Bujías e Ignición', 'NGK', 'JGO', 110000, 16, 19, '900123456-1'],
  ['REP-ELE-003', 'Batería 12V 600 AMP', 'Baterías y Alternadores', 'Baterías MAC', 'UND', 245000, 6, 19, '901112233-4'],
  ['REP-ELE-004', 'Alternador Remanufacturado 90A', 'Baterías y Alternadores', 'Bosch', 'UND', 520000, 2, 19, '901112233-4'],
  ['REP-ELE-005', 'Motor de Arranque Remanufacturado', 'Baterías y Alternadores', 'Bosch', 'UND', 480000, 2, 19, '901112233-4'],
  ['REP-ELE-006', 'Juego de Cables de Alta', 'Bujías e Ignición', 'NGK', 'JGO', 95000, 8, 19, '900123456-1'],
  ['REP-ELE-007', 'Bobina de Encendido', 'Bujías e Ignición', 'Denso', 'UND', 165000, 6, 19, '901223344-6'],
  ['REP-ELE-008', 'Juego de 4 Bujías de Cobre', 'Bujías e Ignición', 'NGK', 'JGO', 42000, 20, 19, '900123456-1'],
  ['REP-ELE-009', 'Batería para Moto 12V 7Ah', 'Baterías y Alternadores', 'Baterías MAC', 'UND', 98000, 8, 19, '901112233-4'],
  ['REP-ILU-001', 'Bombillo H4 Halógeno 60/55W', 'Iluminación', 'Philips', 'UND', 18000, 30, 19, '901445566-0'],
  ['REP-ILU-002', 'Kit Luces LED H7', 'Iluminación', 'Philips', 'PAR', 145000, 6, 19, '901445566-0'],
  ['REP-ILU-003', 'Bombillo de Stop 1157', 'Iluminación', 'Philips', 'UND', 4500, 50, 19, '901445566-0'],
  ['REP-ILU-004', 'Farola Delantera Izquierda', 'Iluminación', 'Valeo', 'UND', 320000, 2, 19, '901445566-0'],
  ['REP-ILU-005', 'Stop Trasero Derecho', 'Iluminación', 'Valeo', 'UND', 190000, 2, 19, '901445566-0'],
  ['REP-ACC-001', 'Plumillas Limpiaparabrisas 22"', 'Plumillas y Exteriores', 'Bosch', 'PAR', 42000, 20, 19, '901445566-0'],
  ['REP-ACC-002', 'Plumillas Limpiaparabrisas 18"', 'Plumillas y Exteriores', 'Bosch', 'PAR', 38000, 20, 19, '901445566-0'],
  ['REP-ACC-003', 'Espejo Retrovisor Lateral', 'Plumillas y Exteriores', 'Valeo', 'UND', 125000, 3, 19, '901445566-0'],
  ['REP-ACC-004', 'Líquido Limpiaparabrisas (1 litro)', 'Aditivos y Líquidos', 'Terpel', 'LIT', 9000, 30, 19, '901556677-2'],
  ['REP-ACC-005', 'Kit de Carretera Reglamentario', 'Plumillas y Exteriores', 'Bosch', 'JGO', 85000, 6, 19, '901445566-0'],
];

module.exports = { proveedores, clientes, clientesMorosos, productos };
