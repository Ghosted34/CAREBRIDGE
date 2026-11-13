import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { ApiError } from '../../api/client';
import { api } from '../../api/endpoints';
import type { FeeType, ProviderFee } from '../../api/types';
import { useAuth } from '../../auth/authContext';
import {
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Field,
  Notice,
  NumberField,
  PageHeader,
  Pill,
  Spinner,
} from '../../components/ui';
import { feeType } from '../../lib/labels';
import { useActiveClinic } from './activeClinic';

const FEE_TYPES: FeeType[] = [
  'consultancy',
  'treatment',
  'late_change',
  'rescheduling',
  'no_show',
  'other',
];

/**
 * Clinic fees, managed by the clinic owner. Each fee type can be set clinic-wide or for one
 * operating centre; a centre's own fee wins. Patients see the consultation fee when they search.
 */
export function FeePage() {
  const { user } = useAuth();
  const { clinicId } = useActiveClinic();
  const clinics = user?.memberships ?? [];
  const queryClient = useQueryClient();

  const clinic = clinics.find((m) => m.provider_id === clinicId) ?? clinics[0];
  const isOwner = clinic?.provider_role === 'owner';
  const providerId = clinic?.provider_id;

  const fees = useQuery({
    queryKey: ['fees', providerId],
    queryFn: () => api.providerFees(providerId!),
    enabled: !!providerId,
  });

  const centres = useQuery({
    queryKey: ['centres', providerId],
    queryFn: () => api.centres(providerId!),
    enabled: !!providerId,
  });
  const centreName = (id: number) =>
    centres.data?.data.find((c) => c.id === id)?.name ?? `Centre #${id}`;

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['fees'] });

  const [formFeeType, setFormFeeType] = useState<FeeType>('consultancy');
  const [formCentreId, setFormCentreId] = useState<number | ''>('');
  const [formAmount, setFormAmount] = useState('');
  const [formCurrency, setFormCurrency] = useState('NGN');
  const [editingFeeId, setEditingFeeId] = useState<number | null>(null);

  const setFee = useMutation({
    mutationFn: () =>
      api.setProviderFee(providerId!, {
        centre_id: formCentreId ? Number(formCentreId) : null,
        fee_type: formFeeType,
        amount: Number(formAmount),
        currency: formCurrency,
      }),
    onSuccess: () => {
      setFormAmount('');
      setEditingFeeId(null);
      refresh();
    },
  });

  const updateFee = useMutation({
    mutationFn: () =>
      api.updateProviderFee(providerId!, editingFeeId!, {
        centre_id: formCentreId ? Number(formCentreId) : null,
        fee_type: formFeeType,
        amount: Number(formAmount),
        currency: formCurrency,
      }),
    onSuccess: () => {
      setFormAmount('');
      setEditingFeeId(null);
      refresh();
    },
  });

  const deleteFee = useMutation({
    mutationFn: (id: number) => api.deleteProviderFee(providerId!, id),
    onSuccess: refresh,
  });

  if (!clinic) {
    return (
      <>
        <PageHeader title="Clinic fees" />
        <Notice tone="warn">
          Your account isn&rsquo;t linked to a verified clinic yet, so there are no fees to manage.
        </Notice>
      </>
    );
  }

  const feeList = fees.data?.data ?? [];
  const fieldErrors = setFee.error instanceof ApiError ? setFee.error.fieldErrors() : {};
  const updateErrors = updateFee.error instanceof ApiError ? updateFee.error.fieldErrors() : {};

  return (
    <>
      <PageHeader
        title="Clinic fees"
        subtitle={`${clinic.display_name} &middot; set prices per fee type, optionally per centre`}
        actions={
          <Pill tone={clinic.verification_status === 'verified' ? 'green' : 'gold'}>
            {clinic.verification_status === 'verified' ? 'Verified' : 'Awaiting verification'}
          </Pill>
        }
      />
      {clinic.verification_status !== 'verified' ? (
        <Notice tone="warn">
          Your facility is awaiting OnDiGoH verification. Fee management unlocks as soon as it is
          verified.
        </Notice>
      ) : (
        <div className="grid grid-2" style={{ alignItems: 'start' }}>
          <Card>
            <h2>Current fees</h2>
            {fees.isPending ? (
              <Spinner />
            ) : feeList.length === 0 ? (
              <EmptyState title="No fees set yet">
                Add your first fee below. Patients see the consultation fee when they search.
              </EmptyState>
            ) : (
              <ul className="list">
                {feeList.map((f: ProviderFee) => (
                  <li className="list-item" key={f.id}>
                    <div className="list-item-main">
                      <div className="list-item-title">
                        {feeType[f.fee_type]}
                        {f.centre_id ? ` · ${centreName(f.centre_id)}` : ' · all centres'}
                      </div>
                      <div className="meta">
                        <span>
                          {f.currency} {f.amount.toLocaleString()}
                        </span>
                        {!f.is_active && <Pill tone="grey">Inactive</Pill>}
                      </div>
                    </div>
                    {isOwner && (
                      <div className="btn-row" style={{ gap: 6 }}>
                        <Button variant="ghost" className="btn-sm" onClick={() => editFee(f)}>
                          Edit
                        </Button>
                        <Button
                          variant="danger"
                          className="btn-sm"
                          busy={deleteFee.isPending && deleteFee.variables === f.id}
                          onClick={() => {
                            if (window.confirm(`Delete ${feeType[f.fee_type]} fee?`)) {
                              deleteFee.mutate(f.id);
                            }
                          }}
                        >
                          Delete
                        </Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <ErrorNote error={setFee.error} />
          </Card>

          <Card>
            <h2>{editingFeeId ? 'Edit fee' : 'Add fee'}</h2>
            {!isOwner ? (
              <p className="muted small">
                Only the clinic owner can set or change fees. Ask your owner if a price needs
                updating.
              </p>
            ) : (
              <form className="form" onSubmit={(e: FormEvent) => e.preventDefault()}>
                <Field label="Fee type">
                  <select
                    required
                    value={formFeeType}
                    onChange={(e) => setFormFeeType(e.target.value as FeeType)}
                  >
                    {FEE_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {feeType[t]}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Amount (NGN)">
                  <NumberField
                    value={formAmount}
                    onValueChange={setFormAmount}
                    min={0}
                    max={10_000_000}
                    required
                  />
                </Field>
                <Field label="Centre (optional)">
                  <select
                    value={formCentreId === '' ? '' : String(formCentreId)}
                    onChange={(e) => setFormCentreId(e.target.value ? Number(e.target.value) : '')}
                  >
                    <option value="">All centres</option>
                    {(centres.data?.data ?? []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Currency">
                  <select value={formCurrency} onChange={(e) => setFormCurrency(e.target.value)}>
                    <option value="NGN">NGN</option>
                    <option value="USD">USD</option>
                    <option value="GBP">GBP</option>
                  </select>
                </Field>
                <ErrorNote error={editingFeeId ? updateErrors.amount : fieldErrors.amount} />
                <div className="btn-row" style={{ gap: 8 }}>
                  <Button
                    type="button"
                    variant={editingFeeId ? 'primary' : 'ghost'}
                    busy={editingFeeId ? updateFee.isPending : setFee.isPending}
                    disabled={!formAmount || Number(formAmount) < 0}
                    onClick={() => {
                      if (editingFeeId) {
                        updateFee.mutate();
                      } else {
                        setFee.mutate();
                      }
                    }}
                  >
                    {editingFeeId ? 'Save changes' : 'Set fee'}
                  </Button>
                  {editingFeeId && (
                    <Button type="button" variant="ghost" onClick={() => setEditingFeeId(null)}>
                      Cancel
                    </Button>
                  )}
                </div>
              </form>
            )}
          </Card>
        </div>
      )}
    </>
  );

  function editFee(f: ProviderFee) {
    setEditingFeeId(f.id);
    setFormFeeType(f.fee_type);
    setFormCentreId(f.centre_id ?? '');
    setFormAmount(String(f.amount));
    setFormCurrency(f.currency);
  }
}
