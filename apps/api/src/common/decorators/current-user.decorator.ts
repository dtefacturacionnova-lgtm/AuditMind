import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthUser } from '../../auth/jwt.strategy';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const request = ctx.switchToHttp().getRequest<{ user: AuthUser }>();
    return request.user;
  },
);

export const CurrentOrg = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<{ user: AuthUser }>();
    return request.user.organizationId;
  },
);
