/* eslint-disable @typescript-eslint/no-explicit-any */
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLE_HIERARCHY, RolesGuard, effectiveRoleLevel } from './roles.guard';

const ctx = (user: any, method: string): any => ({
  getHandler: () => 'h', getClass: () => 'c',
  switchToHttp: () => ({ getRequest: () => ({ user, method }) }),
});
const guardFor = (required: string[] | undefined) => {
  const reflector = { getAllAndOverride: () => required } as unknown as Reflector;
  return new RolesGuard(reflector);
};

describe('«Solo lectura»: puede consultar lo de un Auditor, nada más', () => {
  const ro = { id: 'u', role: 'READ_ONLY' };

  it('con GET y HEAD se evalúa como Auditor (consultas de auditorías, papeles y hallazgos)', () => {
    expect(effectiveRoleLevel('READ_ONLY', 'GET')).toBe(ROLE_HIERARCHY.AUDITOR);
    expect(effectiveRoleLevel('READ_ONLY', 'head')).toBe(ROLE_HIERARCHY.AUDITOR);
    expect(guardFor(['AUDITOR']).canActivate(ctx(ro, 'GET'))).toBe(true);
    expect(guardFor(['AUDITEE']).canActivate(ctx(ro, 'GET'))).toBe(true);
  });

  it('no modifica nada: POST, PUT, PATCH, DELETE y métodos desconocidos siguen con su nivel (10)', () => {
    for (const m of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', '', undefined as any]) {
      expect(effectiveRoleLevel('READ_ONLY', m)).toBe(ROLE_HIERARCHY.READ_ONLY);
      expect(() => guardFor(['AUDITOR']).canActivate(ctx(ro, m))).toThrow(ForbiddenException);
    }
  });

  it('no entra a lo que exige gerente o más, ni siquiera con GET (cobranza, cartera, respaldos, administración)', () => {
    for (const required of ['AUDIT_MANAGER', 'CAE', 'ADMIN', 'SUPER_ADMIN']) {
      expect(() => guardFor([required]).canActivate(ctx(ro, 'GET'))).toThrow(ForbiddenException);
    }
    expect(() => guardFor(['AUDIT_MANAGER', 'CAE']).canActivate(ctx(ro, 'GET'))).toThrow(/Se requiere rol/);
  });

  it('los demás roles no cambian: el Auditee y el resto se evalúan por su nivel, con cualquier método', () => {
    for (const role of Object.keys(ROLE_HIERARCHY).filter((r) => r !== 'READ_ONLY')) {
      for (const m of ['GET', 'POST', 'DELETE']) expect(effectiveRoleLevel(role, m)).toBe(ROLE_HIERARCHY[role]);
    }
    expect(() => guardFor(['AUDITOR']).canActivate(ctx({ id: 'a', role: 'AUDITEE' }, 'GET'))).toThrow(ForbiddenException);
    expect(guardFor(['AUDITOR']).canActivate(ctx({ id: 'a', role: 'AUDITOR' }, 'POST'))).toBe(true);
  });

  it('un rol desconocido sigue sin acceso y sin usuario se niega', () => {
    expect(effectiveRoleLevel('INVENTADO', 'GET')).toBe(0);
    expect(() => guardFor(['AUDITOR']).canActivate(ctx({ id: 'x', role: 'INVENTADO' }, 'GET'))).toThrow(ForbiddenException);
    expect(guardFor(['AUDITOR']).canActivate(ctx(undefined, 'GET'))).toBe(false);
  });

  it('un endpoint sin @Roles sigue abierto a cualquier usuario autenticado', () => {
    expect(guardFor(undefined).canActivate(ctx(ro, 'POST'))).toBe(true);
    expect(guardFor([]).canActivate(ctx(ro, 'DELETE'))).toBe(true);
  });
});
