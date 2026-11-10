import { z } from 'zod';
import { Pagination } from '../../lib/validate.js';
import { TEAM_ROLES } from '../../types.js';

/** A clinic owner adding someone to their own team. Owners are appointed by CareBridge, not here. */
export const AddTeamMemberBody = z.object({
  user_id: z.number().int().positive(),
  provider_role: z.enum(TEAM_ROLES),
});

export const SearchStaffQuery = Pagination.extend({
  q: z.string().trim().min(2).max(190),
});
