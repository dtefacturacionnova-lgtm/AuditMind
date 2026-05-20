import {
  Injectable, CanActivate, ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createClient } from '@supabase/supabase-js';
import { PrismaService } from '../../prisma/prisma.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AuthUser } from '../../auth/jwt.strategy';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private supabaseAdmin = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const authHeader: string | undefined = request.headers['authorization'];
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Token de autorización requerido');
    }

    const token = authHeader.slice(7);

    // Validate token with Supabase Admin API
    const { data: { user: sbUser }, error } = await this.supabaseAdmin.auth.getUser(token);
    if (error || !sbUser) {
      throw new UnauthorizedException('Token inválido o expirado');
    }

    // Load from our database
    const dbUser = await this.prisma.user.findUnique({
      where: { supabaseUserId: sbUser.id },
      select: {
        id: true,
        supabaseUserId: true,
        email: true,
        name: true,
        role: true,
        organizationId: true,
        aiAssistantPersonality: true,
        active: true,
      },
    });

    if (!dbUser || !dbUser.active) {
      throw new UnauthorizedException('Usuario no encontrado o inactivo');
    }

    const authUser: AuthUser = {
      id: dbUser.id,
      supabaseUserId: dbUser.supabaseUserId,
      email: dbUser.email,
      name: dbUser.name,
      role: dbUser.role,
      organizationId: dbUser.organizationId,
      aiAssistantPersonality: dbUser.aiAssistantPersonality,
    };

    request.user = authUser;
    return true;
  }
}
