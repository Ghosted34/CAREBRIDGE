import { AppError } from './errors.js';

/**
 * Allowed status transitions for every stateful entity.
 * Every status change MUST go through `assertTransition` so the rules live in one place.
 */
export const transitions = {
  care_request: {
    submitted: ['matching', 'provider_accepted', 'cancelled'],
    matching: ['provider_accepted', 'cancelled'],
    provider_accepted: ['assessment', 'cancelled'],
    assessment: ['treatment_planned', 'completed', 'cancelled'],
    treatment_planned: ['in_progress', 'cancelled'],
    in_progress: ['completed', 'cancelled'],
    completed: [],
    cancelled: [],
  },
  provider_offer: {
    offered: ['accepted', 'declined', 'expired', 'withdrawn'],
    accepted: [],
    declined: [],
    expired: [],
    withdrawn: [],
  },
  appointment: {
    booked: ['confirmed', 'cancelled'],
    confirmed: ['checked_in', 'cancelled', 'no_show'],
    checked_in: ['completed'],
    completed: [],
    cancelled: [],
    no_show: [],
  },
} as const;

type Machines = typeof transitions;
export type Entity = keyof Machines;
export type StatusOf<E extends Entity> = keyof Machines[E] & string;

export function canTransition<E extends Entity>(entity: E, from: string, to: string): boolean {
  const allowed = (transitions[entity] as Record<string, readonly string[]>)[from];
  return !!allowed && allowed.includes(to);
}

export function assertTransition<E extends Entity>(entity: E, from: string, to: StatusOf<E>): void {
  if (!canTransition(entity, from, to)) {
    throw AppError.conflict(
      'INVALID_TRANSITION',
      `Cannot move ${entity} from '${from}' to '${to}'`,
    );
  }
}
