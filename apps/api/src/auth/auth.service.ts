import { Injectable, UnauthorizedException, ConflictException, BadRequestException } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
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
  }) {
    const email = params.email.trim().toLowerCase();

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException(`El usuario ${email} ya existe`);
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
      if (/already|registered|exists/i.test(error.message)) {
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

  async updateUserRole(userId: string, newRole: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });

    // Actualiza app_metadata en Supabase Auth
    await this.supabaseAdmin.auth.admin.updateUserById(user.supabaseUserId, {
      app_metadata: { role: newRole },
    });

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
