/* eslint-disable @typescript-eslint/no-explicit-any */
import { BadRequestException, ConflictException, ForbiddenException, HttpException, NotFoundException } from '@nestjs/common';

const mockInvite = jest.fn();
jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { admin: { inviteUserByEmail: (...a: unknown[]) => mockInvite(...a), updateUserById: jest.fn(), deleteUser: jest.fn() } } }),
}));

import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { inviteConflictMessage } from './invite-messages.util';

/** Invitar un correo que ya existe y reenviar una invitación pendiente (2026-10-29). */
describe('mensajes al invitar un correo que ya existe', () => {
  const base = { email: 'ana@x.com', organizationName: 'Beta SA' };

  it('en la misma organización dice dónde buscarlo y menciona «Reenviar invitación»', () => {
    const m = inviteConflictMessage({ ...base, sameOrganization: true, viewerIsSuperAdmin: false });
    expect(m).toMatch(/ya pertenece a esta organización/);
    expect(m).toMatch(/Reenviar invitación/);
  });

  it('en otra organización NO revela cuál a un administrador común, pero sí al Super Admin', () => {
    const common = inviteConflictMessage({ ...base, sameOrganization: false, viewerIsSuperAdmin: false });
    expect(common).toMatch(/otra organización/);
    expect(common).not.toContain('Beta SA');
    const sup = inviteConflictMessage({ ...base, sameOrganization: false, viewerIsSuperAdmin: true });
    expect(sup).toContain('«Beta SA»');
  });
});

describe('invitar y reenviar la invitación', () => {
  const prisma: any = { user: { findUnique: jest.fn(), findFirst: jest.fn() }, $queryRaw: jest.fn() };
  let auth: AuthService;
  const cae = { id: 'u-cae', role: 'CAE', organizationId: 'org1' };
  const superAdmin = { id: 'u-sa', role: 'SUPER_ADMIN', organizationId: 'orgS' };
  const target = (o: any = {}) => ({ id: 'u-t', email: 'juan@x.com', name: 'Juan', role: 'AUDIT_MANAGER', active: true, supabaseUserId: 'sb-1', ...o });
  const pending = (ids: string[]) => prisma.$queryRaw.mockResolvedValueOnce(ids.map((id) => ({ id })));

  beforeEach(() => {
    jest.resetAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = 'https://auditoria.ejemplo.com/';
    auth = new AuthService(prisma);
  });

  describe('inviteUser con un correo existente', () => {
    const params = { email: ' Juan@X.com ', name: 'Juan', role: 'AUDITOR', organizationId: 'org1' };

    it('misma organización, otra organización y Super Admin dan mensajes distintos y no llegan a Supabase', async () => {
      prisma.user.findUnique.mockResolvedValue({ organizationId: 'org1', organization: { name: 'Mi Despacho' } });
      await expect(auth.inviteUser(params, cae)).rejects.toThrow(/ya pertenece a esta organización/);
      prisma.user.findUnique.mockResolvedValue({ organizationId: 'orgB', organization: { name: 'Beta SA' } });
      await expect(auth.inviteUser(params, cae)).rejects.toThrow(/otra organización/);
      await expect(auth.inviteUser(params, cae)).rejects.not.toThrow(/Beta SA/);
      await expect(auth.inviteUser(params, superAdmin)).rejects.toThrow(/«Beta SA»/);
      expect(mockInvite).not.toHaveBeenCalled();
      expect(prisma.user.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { email: 'juan@x.com' } }));   // el correo se normaliza
    });
  });

  describe('resendInvite', () => {
    it('reenvía con el mismo destino de retorno que la invitación y devuelve el correo', async () => {
      prisma.user.findFirst.mockResolvedValue(target());
      pending(['sb-1']);
      mockInvite.mockResolvedValue({ data: {}, error: null });
      await expect(auth.resendInvite('u-t', cae)).resolves.toEqual({ resent: true, email: 'juan@x.com' });
      expect(mockInvite).toHaveBeenCalledWith('juan@x.com', { data: { name: 'Juan' }, redirectTo: 'https://auditoria.ejemplo.com/auth/callback' });
    });

    it('un administrador solo alcanza a su organización; el Super Admin, a cualquiera', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      await expect(auth.resendInvite('u-t', cae)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.user.findFirst.mock.calls[0][0].where).toEqual({ id: 'u-t', organizationId: 'org1' });
      await expect(auth.resendInvite('u-t', superAdmin)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.user.findFirst.mock.calls[1][0].where).toEqual({ id: 'u-t' });
      expect(mockInvite).not.toHaveBeenCalled();
    });

    it('no se reenvía a uno mismo, ni a alguien de rol igual o superior, ni a un usuario desactivado', async () => {
      prisma.user.findFirst.mockResolvedValue(target({ id: 'u-cae', role: 'CAE' }));
      await expect(auth.resendInvite('u-cae', cae)).rejects.toBeInstanceOf(ForbiddenException);
      prisma.user.findFirst.mockResolvedValue(target({ role: 'ADMIN' }));
      await expect(auth.resendInvite('u-t', cae)).rejects.toBeInstanceOf(ForbiddenException);
      prisma.user.findFirst.mockResolvedValue(target({ active: false }));
      await expect(auth.resendInvite('u-t', cae)).rejects.toThrow(/desactivado/);
      expect(mockInvite).not.toHaveBeenCalled();
    });

    it('quien ya aceptó su invitación no recibe otra: se le indica «¿Olvidaste tu contraseña?»', async () => {
      prisma.user.findFirst.mockResolvedValue(target());
      pending([]);   // la consulta no lo devuelve como pendiente
      await expect(auth.resendInvite('u-t', cae)).rejects.toThrow(/Olvidaste tu contraseña/);
      expect(mockInvite).not.toHaveBeenCalled();
    });

    it('traduce el límite de envíos de Supabase a un 429 y los demás errores a mensajes claros', async () => {
      prisma.user.findFirst.mockResolvedValue(target());
      pending(['sb-1']);
      mockInvite.mockResolvedValue({ data: null, error: { message: 'For security purposes, you can only request this after 59 seconds.' } });
      const e = await auth.resendInvite('u-t', cae).catch((x) => x);
      expect(e).toBeInstanceOf(HttpException);
      expect((e as HttpException).getStatus()).toBe(429);

      pending(['sb-1']);
      mockInvite.mockResolvedValue({ data: null, error: { message: 'A user with this email address has already been registered' } });
      await expect(auth.resendInvite('u-t', cae)).rejects.toBeInstanceOf(ConflictException);

      pending(['sb-1']);
      mockInvite.mockResolvedValue({ data: null, error: { message: 'SMTP down' } });
      await expect(auth.resendInvite('u-t', cae)).rejects.toThrow(BadRequestException);
    });
  });

  describe('pendingInvites', () => {
    it('sin ids no consulta; si la consulta falla devuelve vacío en vez de romper la lista', async () => {
      expect((await auth.pendingInvites([])).size).toBe(0);
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
      prisma.$queryRaw.mockRejectedValueOnce(new Error('permission denied for schema auth'));
      expect((await auth.pendingInvites(['sb-1'])).size).toBe(0);
    });
  });
});

describe('lista de usuarios con invitación pendiente y organización', () => {
  const rows = [
    { id: 'a', name: 'Ana', email: 'a@x.com', role: 'AUDITOR', active: true, createdAt: new Date(), organizationId: 'o1', supabaseUserId: 'sb-a', organization: { name: 'Mi Despacho' } },
    { id: 'b', name: 'Beto', email: 'b@x.com', role: 'AUDITOR', active: true, createdAt: new Date(), organizationId: 'o2', supabaseUserId: 'sb-b', organization: { name: 'Beta SA' } },
  ];
  const mk = () => {
    const prisma: any = { user: { findMany: jest.fn().mockResolvedValue(rows), count: jest.fn().mockResolvedValue(2) } };
    const authService: any = { pendingInvites: jest.fn().mockResolvedValue(new Set(['sb-b'])) };
    return { svc: new UsersService(prisma, authService), prisma, authService };
  };

  it('marca la invitación pendiente, no filtra el id de Supabase y solo el Super Admin ve la organización', async () => {
    const { svc, authService } = mk();
    const asCae: any = await svc.findAll({ id: 'x', role: 'CAE', organizationId: 'o1' } as any);
    expect(authService.pendingInvites).toHaveBeenCalledWith(['sb-a', 'sb-b']);
    expect(asCae.data.map((u: any) => [u.id, u.invitePending])).toEqual([['a', false], ['b', true]]);
    for (const u of asCae.data) { expect(u.supabaseUserId).toBeUndefined(); expect(u.organization).toBeUndefined(); expect(u.organizationName).toBeUndefined(); }

    const asSuper: any = await svc.findAll({ id: 'x', role: 'SUPER_ADMIN', organizationId: 'o1' } as any);
    expect(asSuper.data.map((u: any) => u.organizationName)).toEqual(['Mi Despacho', 'Beta SA']);
  });

  it('un administrador común solo consulta su organización', async () => {
    const { svc, prisma } = mk();
    await svc.findAll({ id: 'x', role: 'CAE', organizationId: 'o1' } as any);
    expect(prisma.user.findMany.mock.calls[0][0].where).toMatchObject({ organizationId: 'o1', active: true });
  });
});
