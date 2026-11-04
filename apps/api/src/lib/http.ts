import type { Request, Response } from 'express';
import { currentUser } from '../middleware/auth.js';
import type { AuthUser } from '../types.js';
import type { Pagination } from './validate.js';

/** Who is acting and from where — passed from routes into services. */
export interface Ctx {
  user: AuthUser;
  ip: string | null;
}
export const ctx = (req: Request): Ctx => ({ user: currentUser(req), ip: req.ip ?? null });

/** Response envelope: single resources are `{ data }`, lists are `{ data, meta }`. */
export const ok = (res: Response, data: unknown) => res.status(200).json({ data });
export const created = (res: Response, data: unknown) => res.status(201).json({ data });
export const list = (res: Response, data: unknown[], page: Pagination) =>
  res
    .status(200)
    .json({ data, meta: { limit: page.limit, offset: page.offset, count: data.length } });
