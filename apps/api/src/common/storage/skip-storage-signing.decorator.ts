import { SetMetadata } from '@nestjs/common';

export const SKIP_STORAGE_SIGNING_KEY = 'skipStorageSigning';

/**
 * El interceptor global de Storage NO toca este controlador o ruta: no firma URLs en la respuesta ni normaliza el
 * cuerpo. Para las rutas públicas sin sesión (firma por enlace, portal PBC): lo que escribe un tercero nunca debe
 * convertirse en un enlace firmado a un archivo del bucket privado (revisión de seguridad F5b, 2026-10-19).
 */
export const SkipStorageSigning = () => SetMetadata(SKIP_STORAGE_SIGNING_KEY, true);
