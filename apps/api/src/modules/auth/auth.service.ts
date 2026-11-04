import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { SignOptions } from 'jsonwebtoken';
import type { z } from 'zod';
import { env } from '../../config/env.js';
import { pool } from '../../db/pool.js';
import { audit } from '../../lib/audit.js';
import { AppError } from '../../lib/errors.js';
import type { LoginBody, RegisterBody } from './auth.schema.js';
import * as repo from './auth.repo.js';

// Compared against when the email is unknown, so response time does not reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

export async function register(input: z.infer<typeof RegisterBody>, ip: string | null) {
  const password_hash = await bcrypt.hash(input.password, env.BCRYPT_ROUNDS);
  // Provider staff stay pending until an admin approves them and links them to a provider.
  const status = input.role === 'provider_staff' ? 'pending' : 'active';
  try {
    const id = await repo.insertUser(pool, { ...input, password_hash, status });
    await audit(pool, {
      actorUserId: id,
      action: 'USER_REGISTERED',
      entityType: 'user',
      entityId: id,
      ip,
      metadata: { role: input.role },
    });
    return { id, role: input.role, status };
  } catch (err) {
    if ((err as { code?: string }).code === 'ER_DUP_ENTRY') {
      throw AppError.conflict('ALREADY_REGISTERED', 'Email or phone already registered');
    }
    throw err;
  }
}

export async function login(input: z.infer<typeof LoginBody>, ip: string | null) {
  const user = await repo.findUserByEmail(pool, input.email);
  const valid = await bcrypt.compare(input.password, user?.password_hash ?? DUMMY_HASH);
  if (!user || !valid) throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  if (user.status !== 'active') {
    throw new AppError(
      403,
      'ACCOUNT_NOT_ACTIVE',
      user.status === 'pending' ? 'Account is awaiting approval' : 'Account is not active',
    );
  }
  const token = jwt.sign({ role: user.role }, env.JWT_SECRET, {
    subject: String(user.id),
    expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'],
  });
  await audit(pool, {
    actorUserId: user.id,
    action: 'USER_LOGGED_IN',
    entityType: 'user',
    entityId: user.id,
    ip,
  });
  return {
    token,
    user: { id: user.id, full_name: user.full_name, email: user.email, role: user.role },
  };
}

export async function me(userId: number) {
  const profile = await repo.findProfile(pool, userId);
  if (!profile) throw AppError.notFound('User');
  const memberships =
    profile.role === 'provider_staff' ? await repo.findMemberships(pool, userId) : [];
  return { ...profile, memberships };
}
