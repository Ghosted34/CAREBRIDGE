import { describe, expect, it } from 'vitest';
import {
  appointmentStatus,
  estimateStatus,
  paymentStatus,
  referralStatus,
  requestStatus,
  slaCategory,
  noteAuthors,
  money,
} from './labels';

describe('labels and tones', () => {
  it('maps care request statuses to user-facing labels', () => {
    expect(requestStatus.provider_accepted.label).toBe('Open');
    expect(requestStatus.completed.label).toBe('Closed');
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

  it('maps SLA categories to alert tones', () => {
    expect(slaCategory.request_unconfirmed_breach.tone).toBe('red');
    expect(slaCategory.request_unconfirmed_warning.tone).toBe('gold');
    expect(slaCategory.notes_missing.tone).toBe('gold');
  });

  it('only dentists and owners write prescriptions and referrals (mirrors the API)', () => {
    expect(noteAuthors.prescription).toEqual(['owner', 'clinician']);
    expect(noteAuthors.referral).not.toContain('scheduler');
    expect(noteAuthors.follow_up).toContain('scheduler');
    expect(noteAuthors.closing_consultancy).not.toContain('receptionist');
  });

  it('formats naira without kobo', () => {
    expect(money(15000)).toMatch(/15,000/);
    expect(money(15000)).not.toMatch(/\.00/);
  });
});
