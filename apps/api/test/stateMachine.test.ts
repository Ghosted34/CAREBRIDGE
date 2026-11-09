import { describe, expect, it } from 'vitest';
import { assertTransition, canTransition } from '../src/lib/stateMachine.js';

describe('state machine', () => {
  it('allows defined transitions', () => {
    expect(canTransition('care_request', 'submitted', 'matching')).toBe(true);
    expect(canTransition('provider_offer', 'offered', 'accepted')).toBe(true);
    expect(canTransition('clinical_referral', 'sent', 'accepted')).toBe(true);
    expect(canTransition('clinical_referral', 'accepted', 'completed')).toBe(true);
    expect(canTransition('service_estimate', 'issued', 'accepted')).toBe(true);
    expect(canTransition('payment', 'pending', 'successful')).toBe(true);
    expect(canTransition('provider_slot', 'available', 'booked')).toBe(true);
  });
  it('rejects undefined transitions and terminal states', () => {
    expect(canTransition('care_request', 'completed', 'matching')).toBe(false);
    expect(canTransition('provider_offer', 'accepted', 'declined')).toBe(false);
    expect(canTransition('appointment', 'nonsense', 'booked')).toBe(false);
    expect(canTransition('clinical_referral', 'declined', 'accepted')).toBe(false);
    expect(canTransition('service_estimate', 'rejected', 'accepted')).toBe(false);
    expect(canTransition('payment', 'failed', 'successful')).toBe(false);
  });
  it('assertTransition throws a 409 AppError', () => {
    expect(() => assertTransition('appointment', 'cancelled', 'confirmed')).toThrow(
      /Cannot move appointment/,
    );
    expect(() => assertTransition('service_estimate', 'accepted', 'rejected')).toThrow(
      /Cannot move service_estimate/,
    );
  });
});
