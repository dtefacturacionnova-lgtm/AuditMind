import { Injectable, BadRequestException } from '@nestjs/common';
import JSZip from 'jszip';
import { AuditBackupManifest } from './audit-backup.types';

/**
 * Empaquetado del backup en un único .zip portable (BKP-05):
 *   manifest.json   — firmado, igual patrón que el manifiesto del motor de Excel
 *   data.json       — todas las filas de AUDIT_SCOPED_MODELS, agrupadas por modelo
 *   files/<ruta>    — bytes reales de cada adjunto, con la misma ruta relativa
 *                     que tenían en Storage (facilita re-subir con la misma
 *                     estructura al restaurar)
 */
@Injectable()
export class AuditBackupPackageService {
  async empaquetar(
    manifest: AuditBackupManifest, dataJson: string, archivos: Map<string, Buffer>,
  ): Promise<Buffer> {
    const zip = new JSZip();
    zip.file('manifest.json', JSON.stringify(manifest));
    zip.file('data.json', dataJson);
    const carpeta = zip.folder('files')!;
    for (const [ruta, contenido] of archivos) {
      carpeta.file(ruta, contenido);
    }
    return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  }

  async desempaquetar(buffer: Buffer): Promise<{
    manifestCrudo: unknown; dataJson: string; archivos: Map<string, Buffer>;
  }> {
    let zip: JSZip;
    try {
      zip = await JSZip.loadAsync(buffer);
    } catch {
      throw new BadRequestException('El archivo no es un backup .zip válido');
    }

    const manifestEntry = zip.file('manifest.json');
    const dataEntry = zip.file('data.json');
    if (!manifestEntry || !dataEntry) {
      throw new BadRequestException('El archivo no tiene la estructura esperada de un backup de AuditMind');
    }

    let manifestCrudo: unknown;
    try {
      manifestCrudo = JSON.parse(await manifestEntry.async('string'));
    } catch {
      throw new BadRequestException('El manifiesto del backup no se pudo interpretar');
    }
    const dataJson = await dataEntry.async('string');

    const archivos = new Map<string, Buffer>();
    const carpeta = zip.folder('files');
    if (carpeta) {
      const entradas: Promise<void>[] = [];
      carpeta.forEach((rutaRelativa, entry) => {
        if (entry.dir) return;
        entradas.push(
          entry.async('nodebuffer').then(contenido => { archivos.set(rutaRelativa, contenido); }),
        );
      });
      await Promise.all(entradas);
    }

    return { manifestCrudo, dataJson, archivos };
  }
}
