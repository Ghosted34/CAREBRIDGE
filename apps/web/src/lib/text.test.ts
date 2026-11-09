import { describe, expect, it } from 'vitest';
import { cleanIdentifier } from './text';

describe('cleanIdentifier', () => {
  it('strips invisible characters pasted from chat apps', () => {
    expect(cleanIdentifier('\u200Bpatient@carebridge.local\u200B')).toBe(
      'patient@carebridge.local',
    );
    expect(cleanIdentifier(' pat\u00ADient@care\uFEFFbridge.local ')).toBe(
      'patient@carebridge.local',
    );
  });
});
