import { Global, Module } from '@nestjs/common';
import { AlmacenamientoService } from './almacenamiento/almacenamiento.service';
import { CorreoService } from './correo/correo.service';
import { PdfService } from './pdf/pdf.service';
import { JobsService } from './jobs/jobs.service';
import { MetricasService } from './metricas/metricas.service';
import { IdempotenciaInterceptor } from './idempotencia/idempotencia';
import { AdjuntosService } from './archivos/adjuntos.service';

/** Servicios transversales disponibles para todos los módulos. */
@Global()
@Module({
  providers: [
    AlmacenamientoService,
    CorreoService,
    PdfService,
    JobsService,
    MetricasService,
    IdempotenciaInterceptor,
    AdjuntosService,
  ],
  exports: [
    AlmacenamientoService,
    CorreoService,
    PdfService,
    JobsService,
    MetricasService,
    IdempotenciaInterceptor,
    AdjuntosService,
  ],
})
export class InfraestructuraModule {}
