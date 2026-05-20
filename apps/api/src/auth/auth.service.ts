import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
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

  async inviteUser(params: {
    email: string;
    name: string;
    role: string;
    organizationId: string;
  }) {
    const existing = await this.prisma.user.findUnique({
      where: { email: params.email },
    });
    if (existing) {
      throw new ConflictException(`El usuario ${params.email} ya existe`);
    }

    // Crea el usuario en Supabase Auth con el rol en app_metadata
    const { data, error } = await this.supabaseAdmin.auth.admin.inviteUserByEmail(
      params.email,
      {
        data: {
          name: params.name,
        },
        redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
      },
    );

    if (error) throw new UnauthorizedException(error.message);

    // Actualiza app_metadata con organization_id y role
    await this.supabaseAdmin.auth.admin.updateUserById(data.user.id, {
      app_metadata: {
        organization_id: params.organizationId,
        role: params.role,
      },
    });

    // Crea el registro en nuestra tabla users
    const user = await this.prisma.user.create({
      data: {
        supabaseUserId: data.user.id,
        email: params.email,
        name: params.name,
        role: params.role as any,
        organizationId: params.organizationId,
      },
    });

    return user;
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
