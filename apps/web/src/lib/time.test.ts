import { describe, expect, it } from 'vitest';
import { addMinutes, defaultSlot, formatTimeRange, lagosLocalToIso, toLagosLocal } from './time';

describe('Lagos time helpers', () => {
  it('converts a datetime-local value to an ISO string at +01:00', () => {
    expect(lagosLocalToIso('2026-11-10T09:30')).toBe('2026-11-10T09:30:00+01:00');
    expect(new Date(lagosLocalToIso('2026-11-10T09:30')).toISOString()).toBe(
      '2026-11-10T08:30:00.000Z',
    );
  });

  it('rejects malformed input', () => {
    expect(() => lagosLocalToIso('10/11/2026 09:30')).toThrow();
  });

  it('round-trips an instant to Lagos wall-clock time', () => {
    expect(toLagosLocal(new Date('2026-11-10T23:30:00Z'))).toBe('2026-11-11T00:30');
  });

  it('defaults to 09:00 the next Lagos day', () => {
    expect(defaultSlot(new Date('2026-11-04T23:30:00Z'))).toBe('2026-11-06T09:00');
    expect(defaultSlot(new Date('2026-11-04T10:00:00Z'))).toBe('2026-11-05T09:00');
  });

  it('adds minutes and formats ranges in Lagos time', () => {
    const start = '2026-11-10T08:00:00.000Z';
    expect(addMinutes(start, 45)).toBe('2026-11-10T08:45:00.000Z');
    expect(formatTimeRange(start, addMinutes(start, 45))).toMatch(/09:00.*09:45/);
  });
});

describe('booking input constraints', () => {
  it('default slot is on a 5-minute step counted from a midnight min', () => {
    const slot = defaultSlot(new Date('2026-11-04T16:17:00Z'));
    const minutes = Number(slot.slice(11, 13)) * 60 + Number(slot.slice(14, 16));
    expect(minutes % 5).toBe(0);
  });
});
