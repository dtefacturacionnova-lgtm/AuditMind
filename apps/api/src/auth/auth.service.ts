import {
  Injectable, Logger, UnauthorizedException, ConflictException, BadRequestException, NotFoundException, HttpException, HttpStatus,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { PrismaService } from '../prisma/prisma.service';
import { assertCanManageUser } from '../common/utils/tenant.util';
import { inviteConflictMessage, isAlreadyRegistered, isEmailRateLimit } from './invite-messages.util';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private supabaseAdmin: SupabaseClient;

  constructor(private prisma: PrismaService) {
    this.supabaseAdmin = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
  }

  /** URL pública de la app — destino del link del correo de invitación. */
  private get appUrl(): string {
    return (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'https://auditoria.ianovatechsystems.com')
      .replace(/\/+$/, '');
  }

  async inviteUser(params: {
    email: string;
    name: string;
    role: string;
    organizationId: string;
  }, requester?: { role: string }) {
    const email = params.email.trim().toLowerCase();

    const existing = await this.prisma.user.findUnique({
      where: { email }, select: { organizationId: true, organization: { select: { name: true } } },
    });
    if (existing) {
      throw new ConflictException(inviteConflictMessage({
        email,
        sameOrganization: existing.organizationId === params.organizationId,
        organizationName: existing.organization.name,
        viewerIsSuperAdmin: requester?.role === 'SUPER_ADMIN',
      }));
    }

    // Crea el usuario en Supabase Auth con el rol en app_metadata.
    // `redirectTo` va a /auth/callback: ahí el token del correo se convierte en
    // sesión y, por ser una invitación, lleva a /auth/set-password.
    const { data, error } = await this.supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      data: { name: params.name },
      redirectTo: `${this.appUrl}/auth/callback`,
    });

    if (error) {
      // No es un 401 (sesión inválida): el correo ya existe en Auth o es inválido.
      if (isAlreadyRegistered(error.message)) {
        throw new ConflictException(`El correo ${email} ya está registrado en el sistema de autenticación`);
      }
      throw new BadRequestException(`No se pudo enviar la invitación: ${error.message}`);
    }

    // Si algo falla de aquí en adelante, se borra el usuario de Auth recién
    // creado — si no, quedaría un huérfano que bloquea reintentar con ese correo.
    const rollbackAuthUser = async () => {
      await this.supabaseAdmin.auth.admin.deleteUser(data.user.id).catch(() => undefined);
    };

    // Actualiza app_metadata con organization_id y role
    const { error: metaError } = await this.supabaseAdmin.auth.admin.updateUserById(data.user.id, {
      app_metadata: {
        organization_id: params.organizationId,
        role: params.role,
      },
    });
    if (metaError) {
      await rollbackAuthUser();
      throw new BadRequestException(`No se pudo asignar el rol: ${metaError.message}`);
    }

    // Crea el registro en nuestra tabla users
    try {
      return await this.prisma.user.create({
        data: {
          supabaseUserId: data.user.id,
          email,
          name: params.name,
          role: params.role as any,
          organizationId: params.organizationId,
        },
      });
    } catch (err) {
      await rollbackAuthUser();
      throw err;
    }
  }

  /**
   * De estos usuarios de la app (por su id de Supabase), cuáles tienen la invitación PENDIENTE: ya existen en la autenticación pero nunca confirmaron
   * su correo ni entraron. Se lee del esquema `auth` en una sola consulta; si no se puede leer, devuelve vacío (la lista de usuarios no se rompe).
   */
  async pendingInvites(supabaseUserIds: string[]): Promise<Set<string>> {
    const ids = [...new Set(supabaseUserIds.filter(Boolean))];
    if (ids.length === 0) return new Set();
    try {
      const rows = await this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT id::text AS id FROM auth.users
        WHERE id::text IN (${Prisma.join(ids)}) AND email_confirmed_at IS NULL AND last_sign_in_at IS NULL AND deleted_at IS NULL`);
      return new Set(rows.map((r) => r.id));
    } catch (e) {
      this.logger.warn(`No se pudo leer el estado de las invitaciones: ${(e as Error).message}`);
      return new Set();
    }
  }

  /**
   * Reenvía la invitación a quien nunca la aceptó (los enlaces vencen). Solo a un usuario de la misma organización (el Super Admin, de cualquiera),
   * activo, de rol menor al de quien reenvía, y con la invitación realmente pendiente: quien ya entró usa «¿Olvidaste tu contraseña?».
   */
  async resendInvite(targetId: string, requester: { id: string; role: string; organizationId: string }) {
    const target = await this.prisma.user.findFirst({
      where: { id: targetId, ...(requester.role !== 'SUPER_ADMIN' && { organizationId: requester.organizationId }) },
      select: { id: true, email: true, name: true, role: true, active: true, supabaseUserId: true },
    });
    if (!target) throw new NotFoundException('Usuario no encontrado');
    assertCanManageUser(requester, target);
    if (!target.active) throw new ConflictException('El usuario está desactivado: no se le reenvía la invitación.');

    const pending = await this.pendingInvites([target.supabaseUserId]);
    if (!pending.has(target.supabaseUserId)) {
      throw new ConflictException(
        'Esa persona ya aceptó su invitación o ya entró al sistema. Si olvidó su contraseña, que use «¿Olvidaste tu contraseña?» en el inicio de sesión.',
      );
    }

    const { error } = await this.supabaseAdmin.auth.admin.inviteUserByEmail(target.email, {
      data: { name: target.name },
      redirectTo: `${this.appUrl}/auth/callback`,
    });
    if (error) {
      if (isEmailRateLimit(error.message)) {
        throw new HttpException('Ya se le envió un correo hace instantes: espera un minuto antes de reenviar.', HttpStatus.TOO_MANY_REQUESTS);
      }
      if (isAlreadyRegistered(error.message)) {
        throw new ConflictException('Esa persona ya aceptó su invitación. Si olvidó su contraseña, que use «¿Olvidaste tu contraseña?».');
      }
      throw new BadRequestException(`No se pudo reenviar la invitación: ${error.message}`);
    }
    this.logger.log(`Invitación reenviada a ${target.email} por ${requester.id}`);
    return { resent: true, email: target.email };
  }

  async updateUserRole(userId: string, newRole: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });

    // Actualiza app_metadata en Supabase Auth. Si falla, NO se toca la BD:
    // antes el error se ignoraba y el rol de la BD y el del token divergían.
    const { error } = await this.supabaseAdmin.auth.admin.updateUserById(user.supabaseUserId, {
      app_metadata: { role: newRole, organization_id: user.organizationId },
    });
    if (error) throw new BadRequestException(`No se pudo actualizar el rol: ${error.message}`);

    // Actualiza en nuestra BD
    return this.prisma.user.update({
      where: { id: userId },
      data: { role: newRole as any },
    });
  }

  // DEV ONLY — remove before production
  async setupDemo() {
    const demoUsers = [
      { email: 'cae@demo.cl',      password: 'Auditoria2026$', role: 'CAE' },
      { email: 'gerente@demo.cl',  password: 'Auditoria2026$', role: 'AUDIT_MANAGER' },
      { email: 'senior@demo.cl',   password: 'Auditoria2026$', role: 'SENIOR_AUDITOR' },
      { email: 'auditor@demo.cl',  password: 'Auditoria2026$', role: 'AUDITOR' },
      { email: 'auditor2@demo.cl', password: 'Auditoria2026$', role: 'AUDITOR' },
    ];

    const results: Array<{ email: string; status: string; supabaseUserId?: string }> = [];

    for (const demo of demoUsers) {
      const dbUser = await this.prisma.user.findUnique({
        where: { email: demo.email },
        select: { id: true, email: true, organizationId: true, role: true },
      });

      if (!dbUser) {
        results.push({ email: demo.email, status: 'skipped — not in DB' });
        continue;
      }

      // Find or create Supabase Auth user
      const { data: listData } = await this.supabaseAdmin.auth.admin.listUsers();
      let sbUser = listData?.users.find((u) => u.email === demo.email);

      if (!sbUser) {
        const { data: created, error } = await this.supabaseAdmin.auth.admin.createUser({
          email: demo.email,
          password: demo.password,
          email_confirm: true,
          app_metadata: {
            organization_id: dbUser.organizationId,
            role: dbUser.role,
          },
        });
        if (error || !created?.user) {
          results.push({ email: demo.email, status: `error: ${error?.message}` });
          continue;
        }
        sbUser = created.user;
      } else {
        // Ensure app_metadata is correct
        await this.supabaseAdmin.auth.admin.updateUserById(sbUser.id, {
          password: demo.password,
          app_metadata: {
            organization_id: dbUser.organizationId,
            role: dbUser.role,
          },
        });
      }

      // Sync supabaseUserId in our DB
      await this.prisma.user.update({
        where: { id: dbUser.id },
        data: { supabaseUserId: sbUser.id },
      });

      results.push({ email: demo.email, status: 'synced', supabaseUserId: sbUser.id });
    }

    return { results };
  }

  async validateToken(token: string) {
    const { data: { user }, error } = await this.supabaseAdmin.auth.getUser(token);
    if (error || !user) throw new UnauthorizedException('Token inválido');

    const dbUser = await this.prisma.user.findUnique({
      where: { supabaseUserId: user.id },
    });
    if (!dbUser || !dbUser.active) {
      throw new UnauthorizedException('Usuario no encontrado o inactivo');
    }

    return dbUser;
  }
}
