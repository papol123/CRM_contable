import { StreamableFile } from '@nestjs/common';

/** Respuesta binaria con nombre de descarga (PDF, CSV, adjuntos). */
export function archivo(
  contenido: Buffer,
  nombre: string,
  tipoMime: string,
  disposicion: 'inline' | 'attachment' = 'inline',
): StreamableFile {
  const seguro = nombre.replace(/[^\w.\-]/g, '_');
  return new StreamableFile(contenido, {
    type: tipoMime,
    disposition: `${disposicion}; filename="${seguro}"`,
    length: contenido.length,
  });
}
