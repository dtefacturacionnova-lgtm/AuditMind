// Copiado de dtes-y-analítica-sv (src/lib/dte-json.ts), donde se probó con documentos reales de ambas versiones.
// Se usa al importar JSON de DTE (DteJsonUpload) y es la misma lectura tolerante que usa ese sistema al recibirlos por correo.
/**
 * Lectura tolerante del JSON de un DTE recibido por correo o subido a mano. Funciones puras.
 *
 * Algunos emisores entregan el archivo con defectos que `JSON.parse` rechaza o que dañan el texto, y el DTE se quedaba fuera (o con el
 * nombre dañado) aunque el documento fuera válido. Se repara lo que se sabe seguro, anotando en `repairs` qué se hizo:
 *  - BOM (﻿) al inicio.
 *  - Texto sobrante DESPUÉS del primer documento completo.
 *  - Un objeto SIN NOMBRE incrustado en el documento (caso real de un sistema de facturación: pega la respuesta del MH,
 *    `{"ambiente":"01","idEnvio":…,"selloRecibido":…}`, dentro del DTE sin darle clave). Se le pone el nombre `responseMH`, que es donde
 *    el sistema ya espera encontrar el sello y el estado.
 *  - Codificación: un archivo que no es UTF-8 válido (por ejemplo Latin-1, donde «Ñ» es el byte 0xD1) se lee como Latin-1 en vez de
 *    llenarse de «�».
 *
 * Lo demás (JSON truncado o inválido de verdad) sigue lanzando el mismo error de siempre.
 */

export interface TolerantParse<T = any> {
  value: T;
  /** Qué hubo que corregir, para dejarlo en el registro: vacío si el texto era JSON limpio. */
  repairs: string[];
}

/** Máximo de objetos sin nombre que se reparan en un mismo documento. */
const MAX_KEYLESS_REPAIRS = 3;

/**
 * Bytes de un adjunto → texto. UTF-8 si es válido; si no, Latin-1 (los archivos con «Ñ» o tildes de emisores que no usan UTF-8).
 * `repairs` dice si hubo que usar el respaldo.
 */
export function decodeDteBytes(bytes: Uint8Array): { text: string; latin1: boolean } {
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), latin1: false };
  } catch {
    return { text: new TextDecoder('latin1').decode(bytes), latin1: true };
  }
}

export function parseDteJson<T = any>(content: string): TolerantParse<T> {
  const repairs: string[] = [];
  let text = content;
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
    repairs.push('BOM inicial');
  }

  let keyless = 0;
  for (;;) {
    try {
      return { value: JSON.parse(text), repairs };
    } catch (error: any) {
      const message = String(error?.message ?? '');

      // «Unexpected non-whitespace character after JSON at position N»: el documento terminó en N y lo demás es sobrante
      const after = /after JSON at position (\d+)/.exec(message);
      if (after) {
        const end = Number(after[1]);
        if (end > 0) {
          const value = JSON.parse(text.slice(0, end)); // si el primer documento tampoco es válido, lanza como siempre
          repairs.push(`texto sobrante después del JSON (desde la posición ${end})`);
          return { value, repairs };
        }
        throw error;
      }

      // Un «{» donde se esperaba el nombre de una propiedad: un objeto incrustado sin clave
      const keyPos = /(?:Expected double-quoted property name|Unexpected token '?\{'?) in JSON at position (\d+)/.exec(message);
      if (keyPos && keyless < MAX_KEYLESS_REPAIRS) {
        const at = Number(keyPos[1]);
        if (text[at] === '{') {
          text = `${text.slice(0, at)}"responseMH":${text.slice(at)}`;
          keyless++;
          repairs.push('objeto sin nombre incrustado (la respuesta del MH) guardado como responseMH');
          continue;
        }
      }
      throw error;
    }
  }
}
