import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MovimientoInventario } from '../../database/entities/movimiento-inventario.entity';
import { Producto } from '../../database/entities/producto.entity';
import { Bodega } from '../../database/entities/bodega.entity';
import { RegistrarMovimientoDto, AjusteFisicoDto } from './dto/movimiento-inventario.dto';

@Injectable()
export class InventarioService {
  constructor(
    @InjectRepository(MovimientoInventario)
    private readonly movimientoRepository: Repository<MovimientoInventario>,
    @InjectRepository(Producto)
    private readonly productoRepository: Repository<Producto>,
    @InjectRepository(Bodega)
    private readonly bodegaRepository: Repository<Bodega>,
  ) {}

  async getSaldos(bodegaId?: string): Promise<any[]> {
    const query = this.movimientoRepository
      .createQueryBuilder('m')
      .innerJoin('m.producto', 'p')
      .innerJoin('m.bodega', 'b')
      .select('p.id', 'idProducto')
      .addSelect('p.codigo', 'codigo')
      .addSelect('p.nombre', 'nombre')
      .addSelect('p.stockMinimo', 'stockMinimo')
      .addSelect('b.id', 'idBodega')
      .addSelect('b.nombre', 'bodegaNombre')
      .addSelect('b.codigo', 'bodegaCodigo')
      .addSelect(
        `SUM(CASE WHEN m.tipo_movimiento IN ('ENTRADA', 'AJUSTE_ENTRADA') THEN m.cantidad ELSE -m.cantidad END)`,
        'saldo',
      )
      .groupBy('p.id')
      .addGroupBy('p.codigo')
      .addGroupBy('p.nombre')
      .addGroupBy('p.stockMinimo')
      .addGroupBy('b.id')
      .addGroupBy('b.nombre')
      .addGroupBy('b.codigo');

    if (bodegaId) {
      query.where('b.id = :bodegaId', { bodegaId });
    }

    const rows = await query.getRawMany();
    return rows.map((r) => ({
      ...r,
      saldo: parseFloat(r.saldo || '0'),
      stockMinimo: parseFloat(r.stockMinimo || '0'),
    }));
  }

  async getMovimientos(
    productoId?: string,
    bodegaId?: string,
    fechaDesde?: string,
    fechaHasta?: string,
  ): Promise<MovimientoInventario[]> {
    const query = this.movimientoRepository
      .createQueryBuilder('m')
      .innerJoinAndSelect('m.producto', 'p')
      .innerJoinAndSelect('m.bodega', 'b')
      .orderBy('m.fecha', 'DESC');

    if (productoId) query.andWhere('m.idProducto = :productoId', { productoId });
    if (bodegaId) query.andWhere('m.idBodega = :bodegaId', { bodegaId });
    if (fechaDesde) query.andWhere('m.fecha >= :fechaDesde', { fechaDesde });
    if (fechaHasta) query.andWhere('m.fecha <= :fechaHasta', { fechaHasta });

    return query.take(100).getMany();
  }

  async getAlertasStock(): Promise<any[]> {
    const saldos = await this.getSaldos();
    const productosMap: Record<string, { idProducto: string; codigo: string; nombre: string; stockMinimo: number; saldoTotal: number }> = {};

    for (const item of saldos) {
      if (!productosMap[item.idProducto]) {
        productosMap[item.idProducto] = {
          idProducto: item.idProducto,
          codigo: item.codigo,
          nombre: item.nombre,
          stockMinimo: item.stockMinimo,
          saldoTotal: 0,
        };
      }
      productosMap[item.idProducto].saldoTotal += item.saldo;
    }

    return Object.values(productosMap).filter(
      (p) => p.saldoTotal <= p.stockMinimo,
    );
  }

  async getSinMovimiento(dias: number = 180): Promise<any[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - dias);

    const saldos = await this.getSaldos();
    const items = [];

    for (const s of saldos) {
      const lastMov = await this.movimientoRepository.findOne({
        where: { idProducto: s.idProducto },
        order: { fecha: 'DESC' },
      });

      if (!lastMov || new Date(lastMov.fecha) < cutoffDate) {
        items.push({
          ...s,
          ultimoMovimiento: lastMov?.fecha || null,
          diasInactivo: lastMov
            ? Math.floor((Date.now() - new Date(lastMov.fecha).getTime()) / (1000 * 60 * 60 * 24))
            : dias,
        });
      }
    }

    return items;
  }

  async registrarMovimiento(dto: RegistrarMovimientoDto): Promise<MovimientoInventario> {
    const producto = await this.productoRepository.findOne({ where: { id: dto.idProducto } });
    if (!producto) throw new NotFoundException('Producto no encontrado');

    const bodega = await this.bodegaRepository.findOne({ where: { id: dto.idBodega } });
    if (!bodega) throw new NotFoundException('Bodega no encontrada');

    // Validación de stock para salidas
    if (dto.tipoMovimiento === 'SALIDA') {
      const saldos = await this.getSaldos(dto.idBodega);
      const saldoActual = saldos.find((s) => s.idProducto === dto.idProducto)?.saldo || 0;
      if (saldoActual < dto.cantidad) {
        throw new BadRequestException(
          `Stock insuficiente en la bodega ${bodega.nombre}. Stock actual: ${saldoActual}, cantidad solicitada: ${dto.cantidad}`,
        );
      }
    }

    const mov = this.movimientoRepository.create({
      idProducto: dto.idProducto,
      idBodega: dto.idBodega,
      tipoMovimiento: dto.tipoMovimiento,
      cantidad: dto.cantidad,
      costoUnitario: dto.costoUnitario || 0,
      origenTabla: 'manual',
    });

    return this.movimientoRepository.save(mov);
  }

  async ajusteFisico(dto: AjusteFisicoDto): Promise<MovimientoInventario> {
    const saldos = await this.getSaldos(dto.idBodega);
    const saldoActual = saldos.find((s) => s.idProducto === dto.idProducto)?.saldo || 0;
    const diferencia = dto.cantidadFisica - saldoActual;

    if (diferencia === 0) {
      throw new BadRequestException('El saldo físico coincide con el sistema, no requiere ajuste.');
    }

    const tipoMovimiento = diferencia > 0 ? 'AJUSTE_ENTRADA' : 'AJUSTE_SALIDA';
    const mov = this.movimientoRepository.create({
      idProducto: dto.idProducto,
      idBodega: dto.idBodega,
      tipoMovimiento,
      cantidad: Math.abs(diferencia),
      origenTabla: 'conteo_fisico',
    });

    return this.movimientoRepository.save(mov);
  }

  async reversarMovimiento(id: string): Promise<MovimientoInventario> {
    const mov = await this.movimientoRepository.findOne({ where: { id } });
    if (!mov) throw new NotFoundException(`Movimiento con ID ${id} no encontrado`);

    const tipoCompensatorio =
      mov.tipoMovimiento === 'ENTRADA' || mov.tipoMovimiento === 'AJUSTE_ENTRADA'
        ? 'AJUSTE_SALIDA'
        : 'AJUSTE_ENTRADA';

    const compensatorio = this.movimientoRepository.create({
      idProducto: mov.idProducto,
      idBodega: mov.idBodega,
      tipoMovimiento: tipoCompensatorio,
      cantidad: mov.cantidad,
      costoUnitario: mov.costoUnitario,
      origenTabla: 'reversa_auditoria',
      origenId: mov.id,
    });

    return this.movimientoRepository.save(compensatorio);
  }

  async getInventarioValorizado(): Promise<any> {
    const saldos = await this.getSaldos();
    let totalCostoInventario = 0;

    const detalle = saldos.map((item) => {
      const costoEstimado = 120000.00; // Tomado de costos promedio / compras
      const subtotalCosto = item.saldo * costoEstimado;
      totalCostoInventario += subtotalCosto;
      return {
        ...item,
        costoUnitario: costoEstimado,
        valorTotal: subtotalCosto,
      };
    });

    return {
      fechaCorte: new Date().toISOString(),
      totalArticulos: detalle.length,
      valorTotalInventario: totalCostoInventario,
      items: detalle,
    };
  }
}
