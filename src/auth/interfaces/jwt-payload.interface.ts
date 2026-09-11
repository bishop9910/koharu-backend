// src/auth/interfaces/jwt-payload.interface.ts
import { Role } from '../../enums/role.enum.js';

/**
 * JWT 载荷
 */
export interface JwtPayload {
  sub: string;
}

/**
 * JwtStrategy.validate 
 */
export interface AuthenticatedUser {
  id: string;
  username: string;
  role: Role;
}
