import { describe, expect, it } from 'vitest';
import {
  appointmentStatus,
  estimateStatus,
  paymentStatus,
  referralStatus,
  requestStatus,
  slaCategory,
  slotStatus,
} from './labels';

describe('labels and tones', () => {
  it('maps care request statuses to user-facing labels', () => {
    expect(requestStatus.submitted.label).toBe('Submitted');
    expect(requestStatus.completed.tone).toBe('green');
  });

  it('maps appointment statuses to tones', () => {
    expect(appointmentStatus.booked.label).toBe('Booked');
    expect(appointmentStatus.confirmed.tone).toBe('teal');
  });

  it('maps referral statuses', () => {
    expect(referralStatus.sent.label).toBe('Sent');
    expect(referralStatus.accepted.tone).toBe('green');
    expect(referralStatus.completed.label).toBe('Completed');
  });

  it('maps service estimate statuses', () => {
    expect(estimateStatus.issued.label).toBe('Pending Review');
    expect(estimateStatus.accepted.tone).toBe('green');
    expect(estimateStatus.rejected.tone).toBe('red');
  });

  it('maps payment statuses', () => {
    expect(paymentStatus.pending.label).toBe('Pending');
    expect(paymentStatus.successful.tone).toBe('green');
    expect(paymentStatus.failed.tone).toBe('red');
  });

  it('maps capacity slot statuses', () => {
    expect(slotStatus.available.tone).toBe('green');
    expect(slotStatus.booked.label).toBe('Booked');
  });

  it('maps SLA categories to alert tones', () => {
    expect(slaCategory.unmatched_breach.tone).toBe('red');
    expect(slaCategory.unmatched_warning.tone).toBe('gold');
    expect(slaCategory.standard.tone).toBe('green');
  });
});
