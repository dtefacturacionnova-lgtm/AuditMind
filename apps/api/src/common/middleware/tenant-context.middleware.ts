import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { createClient } from '@supabase/supabase-js';

@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  private supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  constructor(private prisma: PrismaService) {}

  async use(req: Request, _res: Response, next: NextFunction) {
    const authHeader = req.headers['authorization'];
    if (!authHeader?.startsWith('Bearer ')) return next();

    const token = authHeader.split(' ')[1];

    try {
      const { data: { user }, error } = await this.supabase.auth.getUser(token);
      if (error || !user) return next();

      const orgId = user.app_metadata?.organization_id as string | undefined;
      const role = user.app_metadata?.role as string | undefined;

      if (orgId && role) {
        // Inyecta el tenant context para que RLS funcione con el service_role key
        await this.prisma.$executeRawUnsafe(
          `SELECT set_current_tenant($1, $2)`,
          orgId,
          role,
        );
      }
    } catch {
      // Silencioso — el JwtAuthGuard manejará el error si el token es inválido
    }

    next();
  }
}
