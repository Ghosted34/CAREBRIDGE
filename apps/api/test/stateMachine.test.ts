import { describe, expect, it } from 'vitest';
import { assertTransition, canTransition } from '../src/lib/stateMachine.js';

describe('state machine', () => {
  it('allows defined transitions', () => {
    expect(canTransition('care_request', 'submitted', 'matching')).toBe(true);
    expect(canTransition('provider_offer', 'offered', 'accepted')).toBe(true);
  });
  it('rejects undefined transitions and terminal states', () => {
    expect(canTransition('care_request', 'completed', 'matching')).toBe(false);
    expect(canTransition('provider_offer', 'accepted', 'declined')).toBe(false);
    expect(canTransition('appointment', 'nonsense', 'booked')).toBe(false);
  });
  it('assertTransition throws a 409 AppError', () => {
    expect(() => assertTransition('appointment', 'cancelled', 'confirmed')).toThrow(
      /Cannot move appointment/,
    );
  });
});
