/* eslint-disable @typescript-eslint/no-explicit-any */
import { Controller, Delete, Get, INestApplication, Patch, Post } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { Roles } from '../decorators/roles.decorator';
import { RolesGuard } from './roles.guard';

/**
 * «Solo lectura» con peticiones HTTP REALES contra un servidor de Nest levantado en la prueba (no con objetos simulados): confirma que el método que
 * lee el guardián es el de la petición de verdad. El rol del usuario llega en la cabecera `x-test-role` (un middleware de la prueba lo pone en `req.user`).
 */
@Controller('t')
class ProbeController {
  @Get('papel') @Roles('AUDITOR') leerPapel() { return { ok: true }; }
  @Post('papel') @Roles('AUDITOR') crearPapel() { return { ok: true }; }
  @Patch('papel') @Roles('AUDITOR') editarPapel() { return { ok: true }; }
  @Delete('papel') @Roles('AUDITOR') borrarPapel() { return { ok: true }; }
  @Get('cobranza') @Roles('AUDIT_MANAGER') leerCobranza() { return { ok: true }; }
  @Get('respaldo') @Roles('CAE') leerRespaldo() { return { ok: true }; }
  @Get('abierto') abierto() { return { ok: true }; }
}

describe('Solo lectura por HTTP real', () => {
  let app: INestApplication;
  let base: string;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ controllers: [ProbeController], providers: [{ provide: APP_GUARD, useClass: RolesGuard }] }).compile();
    app = mod.createNestApplication();
    app.use((req: any, _res: any, next: () => void) => { req.user = req.headers['x-test-role'] ? { id: 'u1', role: req.headers['x-test-role'] } : undefined; next(); });
    await app.listen(0);
    base = `http://127.0.0.1:${(app.getHttpServer().address() as any).port}/t`;
  });
  afterAll(async () => { await app?.close(); });

  const call = async (role: string | null, method: string, path: string) =>
    (await fetch(`${base}/${path}`, { method, headers: role ? { 'x-test-role': role } : {} })).status;

  it('consulta lo de un Auditor (GET) pero no modifica (POST, PATCH, DELETE → 403)', async () => {
    expect(await call('READ_ONLY', 'GET', 'papel')).toBe(200);
    expect(await call('READ_ONLY', 'POST', 'papel')).toBe(403);
    expect(await call('READ_ONLY', 'PATCH', 'papel')).toBe(403);
    expect(await call('READ_ONLY', 'DELETE', 'papel')).toBe(403);
  });

  it('no entra a lo de gerente o dirección, ni siquiera con GET', async () => {
    expect(await call('READ_ONLY', 'GET', 'cobranza')).toBe(403);
    expect(await call('READ_ONLY', 'GET', 'respaldo')).toBe(403);
  });

  it('el Auditor y el gerente siguen igual, y un Auditee sigue sin entrar a lo de Auditor', async () => {
    expect(await call('AUDITOR', 'POST', 'papel')).toBe(201);
    expect(await call('AUDITOR', 'GET', 'cobranza')).toBe(403);
    expect(await call('AUDIT_MANAGER', 'GET', 'cobranza')).toBe(200);
    expect(await call('AUDITEE', 'GET', 'papel')).toBe(403);
  });

  it('sin sesión no pasa lo protegido, y lo abierto lo ve cualquier usuario', async () => {
    expect(await call(null, 'GET', 'papel')).toBe(403);
    expect(await call('READ_ONLY', 'GET', 'abierto')).toBe(200);
  });
});
