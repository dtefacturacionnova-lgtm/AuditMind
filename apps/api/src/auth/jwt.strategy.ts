import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { createClient } from '@supabase/supabase-js';
import { PrismaService } from '../prisma/prisma.service';

export interface JwtPayload {
  sub: string;
  email: string;
  app_metadata: {
    organization_id: string;
    role: string;
  };
  iat: number;
  exp: number;
}

export interface AuthUser {
  id: string;
  supabaseUserId: string;
  email: string;
  name: string;
  role: string;
  organizationId: string;
  aiAssistantPersonality: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private supabaseAdmin = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  constructor(private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      // Supabase tokens are validated via Admin API — use anon key as placeholder secret
      secretOrKey: process.env.SUPABASE_ANON_KEY!,
      ignoreExpiration: true, // Supabase Admin API handles expiration check
    });
  }

  async validate(payload: JwtPayload): Promise<AuthUser> {
    const orgId = payload.app_metadata?.organization_id;
    if (!orgId) {
      throw new UnauthorizedException('Token sin organization_id en app_metadata');
    }

    const user = await this.prisma.user.findUnique({
      where: { supabaseUserId: payload.sub },
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

    if (!user || !user.active) {
      throw new UnauthorizedException('Usuario no encontrado o inactivo');
    }

    return {
      id: user.id,
      supabaseUserId: user.supabaseUserId,
      email: user.email,
      name: user.name,
      role: user.role,
      organizationId: user.organizationId,
      aiAssistantPersonality: user.aiAssistantPersonality,
    };
  }
}
