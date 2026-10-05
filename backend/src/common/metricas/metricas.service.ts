import { Injectable } from '@nestjs/common';

interface MetricaRuta {
  peticiones: number;
  errores4xx: number;
  errores5xx: number;
  duracionTotalMs: number;
  duracionMaximaMs: number;
}

const TAMANO_MUESTRA = 2000;

/**
 * Métricas de peticiones HTTP de esta instancia desde su arranque:
 * conteos por código, latencias (p50/p95/p99 sobre las últimas 2000
 * peticiones) y las rutas más usadas. Alimenta GET /admin/metricas.
 */
@Injectable()
export class MetricasService {
  private readonly inicio = Date.now();
  private total = 0;
  private readonly porCodigo = new Map<number, number>();
  private readonly porRuta = new Map<string, MetricaRuta>();
  private readonly muestras: number[] = [];
  private posicion = 0;

  registrar(metodo: string, ruta: string, codigo: number, duracionMs: number) {
    this.total++;
    this.porCodigo.set(codigo, (this.porCodigo.get(codigo) || 0) + 1);

    const clave = `${metodo} ${ruta}`;
    const m = this.porRuta.get(clave) || {
      peticiones: 0,
      errores4xx: 0,
      errores5xx: 0,
      duracionTotalMs: 0,
      duracionMaximaMs: 0,
    };
    m.peticiones++;
    if (codigo >= 500) m.errores5xx++;
    else if (codigo >= 400) m.errores4xx++;
    m.duracionTotalMs += duracionMs;
    m.duracionMaximaMs = Math.max(m.duracionMaximaMs, duracionMs);
    this.porRuta.set(clave, m);

    if (this.muestras.length < TAMANO_MUESTRA) this.muestras.push(duracionMs);
    else this.muestras[this.posicion++ % TAMANO_MUESTRA] = duracionMs;
  }

  resumen() {
    const ordenadas = [...this.muestras].sort((a, b) => a - b);
    const percentil = (p: number) =>
      ordenadas.length ? ordenadas[Math.min(ordenadas.length - 1, Math.floor((p / 100) * ordenadas.length))] : 0;

    let e4 = 0;
    let e5 = 0;
    for (const [codigo, n] of this.porCodigo) {
      if (codigo >= 500) e5 += n;
      else if (codigo >= 400) e4 += n;
    }

    const rutas = [...this.porRuta.entries()]
      .map(([ruta, m]) => ({
        ruta,
        peticiones: m.peticiones,
        errores4xx: m.errores4xx,
        errores5xx: m.errores5xx,
        latenciaPromedioMs: Math.round(m.duracionTotalMs / m.peticiones),
        latenciaMaximaMs: m.duracionMaximaMs,
      }))
      .sort((a, b) => b.peticiones - a.peticiones);

    return {
      desde: new Date(this.inicio).toISOString(),
      peticiones: this.total,
      errores4xx: e4,
      errores5xx: e5,
      tasaError5xxPct: this.total ? Number(((e5 / this.total) * 100).toFixed(2)) : 0,
      porCodigo: Object.fromEntries([...this.porCodigo.entries()].sort((a, b) => a[0] - b[0])),
      latenciaMs: {
        muestras: ordenadas.length,
        p50: percentil(50),
        p95: percentil(95),
        p99: percentil(99),
        max: ordenadas.length ? ordenadas[ordenadas.length - 1] : 0,
      },
      rutasMasUsadas: rutas.slice(0, 15),
      rutasConMasErrores5xx: rutas.filter((r) => r.errores5xx > 0).sort((a, b) => b.errores5xx - a.errores5xx).slice(0, 10),
    };
  }
}
