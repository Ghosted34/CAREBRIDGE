import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { pool, type Row } from '../db/pool.js';
import { AppError } from '../lib/errors.js';
import type { AuthUser, Role } from '../types.js';

interface TokenClaims {
  sub: string;
}

/**
 * Verifies the bearer token, then reloads the user so a suspended account or a
 * role change takes effect immediately instead of when the token expires.
 */
export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? '';
  const token = header.replace(/^Bearer\s+/i, '');
  if (!token) throw AppError.unauthorized();

  let claims: TokenClaims;
  try {
    claims = jwt.verify(token, env.JWT_SECRET) as TokenClaims;
  } catch {
    throw AppError.unauthorized('Invalid or expired token');
  }

  const [rows] = await pool.execute<Row[]>(
    'SELECT id, role, full_name, status FROM users WHERE id = ?',
    [Number(claims.sub)],
  );
  const u = rows[0];
  if (!u) throw AppError.unauthorized('Invalid or expired token');
  if (u.status !== 'active') throw AppError.forbidden('Account is not active');

  req.user = { id: u.id, role: u.role, full_name: u.full_name } satisfies AuthUser;
  next();
}

/** Platform-role gate. Provider-membership checks happen in services (see lib/access.ts). */
export const allow =
  (...roles: Role[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) throw AppError.forbidden();
    next();
  };

/** Narrow `req.user` for handlers mounted behind `authenticate`. */
export function currentUser(req: Request): AuthUser {
  if (!req.user) throw AppError.unauthorized();
  return req.user;
}
