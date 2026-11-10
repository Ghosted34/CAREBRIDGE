import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type ChangeEvent } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import { api } from '../../api/endpoints';
import type { Appointment } from '../../api/types';
import { BookingForm } from '../../components/BookingForm';
import { JourneyTimeline } from '../../components/Journey';
import {
  Button,
  Card,
  ErrorNote,
  Field,
  Modal,
  Notice,
  NumberField,
  PageHeader,
  Pill,
  Spinner,
} from '../../components/ui';
import {
  appointmentStatus,
  appointmentType,
  estimateStatus,
  paymentStatus,
  requestStatus,
  titleCase,
  urgency,
} from '../../lib/labels';
import { formatDateTime, formatTimeRange } from '../../lib/time';

const BOOKABLE = ['provider_accepted', 'assessment', 'treatment_planned', 'in_progress'];

const isFuture = (iso: string) => new Date(iso).getTime() > Date.now();

export function RequestDetailPage() {
  const id = Number(useParams().id);
  const justCreated = (useLocation().state as { created?: boolean } | null)?.created;
  const queryClient = useQueryClient();
  const [payModalOpen, setPayModalOpen] = useState(false);
  // Amounts are edited as digits-only text (see NumberField) and parsed when the payment starts.
  const [payAmount, setPayAmount] = useState('15000');
  const [uploadDocType, setUploadDocType] = useState<'photo' | 'xray' | 'report' | 'other'>(
    'photo',
  );

  const request = useQuery({ queryKey: ['requests', id], queryFn: () => api.request(id) });
  const appointments = useQuery({
    queryKey: ['appointments', 'mine'],
    queryFn: () => api.myAppointments(),
  });
  const estimates = useQuery({
    queryKey: ['estimates', id],
    queryFn: () => api.estimatesForRequest(id),
  });
  const documents = useQuery({
    queryKey: ['documents', id],
    queryFn: () => api.documentsForRequest(id),
  });
  const payments = useQuery({
    queryKey: ['payments', id],
    queryFn: () => api.paymentsForRequest(id),
  });
  const matches = useQuery({
    queryKey: ['matches', id],
    queryFn: () => api.matchesForRequest(id),
    enabled: Boolean(
      request.data?.data && ['submitted', 'matching'].includes(request.data.data.status),
    ),
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['requests'] });
    void queryClient.invalidateQueries({ queryKey: ['appointments'] });
    void queryClient.invalidateQueries({ queryKey: ['estimates', id] });
    void queryClient.invalidateQueries({ queryKey: ['documents', id] });
    void queryClient.invalidateQueries({ queryKey: ['payments', id] });
  };

  const cancel = useMutation({ mutationFn: () => api.cancelRequest(id), onSuccess: refresh });
  const cancelAppt = useMutation({
    mutationFn: (apptId: number) => api.appointmentAction(apptId, 'cancel'),
    onSuccess: refresh,
  });

  const respondEstimate = useMutation({
    mutationFn: ({ estimateId, accept }: { estimateId: number; accept: boolean }) =>
      accept ? api.acceptEstimate(estimateId) : api.rejectEstimate(estimateId),
    onSuccess: refresh,
  });

  const initPayment = useMutation({
    mutationFn: () => api.initializePayment(id, { amount: Number(payAmount), currency: 'NGN' }),
    onSuccess: () => {
      setPayModalOpen(false);
      refresh();
    },
  });

  const simulatePay = useMutation({
    mutationFn: (paymentId: number) => api.simulatePaymentSuccess(paymentId),
    onSuccess: refresh,
  });

  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const { data: urlData } = await api.requestUploadUrl(id, {
        document_type: uploadDocType,
        file_name: file.name,
        mime_type: file.type || 'application/octet-stream',
        file_size_bytes: file.size,
      });

      // Upload file to pre-signed URL (mock or S3)
      await fetch(urlData.upload_url, {
        method: urlData.method,
        headers: urlData.headers,
        body: file,
      });

      await api.confirmUpload(id, {
        storage_key: urlData.storage_key,
        document_type: uploadDocType,
        file_name: file.name,
        mime_type: file.type || 'application/octet-stream',
        file_size_bytes: file.size,
      });

      refresh();
    } catch {
      // Non-fatal, error caught in UI
    }
  };

  if (request.isPending) return <Spinner />;
  if (request.isError) return <ErrorNote error={request.error} />;
  const r = request.data.data;
  const s = requestStatus[r.status];
  const myAppts = (appointments.data?.data ?? []).filter((a) => a.care_request_id === id);
  // One upcoming visit is enough: the clinic books the next one after that visit, so we show a
  // summary instead of the booking form (and nobody double-books) while an appointment is live.
  const isUpcoming = (a: Appointment) =>
    (a.status === 'booked' || a.status === 'confirmed') && isFuture(a.ends_at);
  const hasActiveAppointment = myAppts.some(isUpcoming);
  const nextAppointment = myAppts
    .filter(isUpcoming)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0];
  const canCancel = !['completed', 'cancelled'].includes(r.status);
  const estList = estimates.data?.data ?? [];
  const docList = documents.data?.data ?? [];
  const payList = payments.data?.data ?? [];
  const matchList = matches.data?.data ?? [];

  return (
    <>
      <PageHeader
        title={`${titleCase(r.specialty)} · ${r.service_type}`}
        subtitle={
          <>
            <Link to="/patient">My care</Link> / Request #{r.id}
          </>
        }
        actions={<Pill tone={s.tone}>{s.label}</Pill>}
      />
      {justCreated && (
        <Notice tone="success">
          Request sent. We’ll show nearby clinics with open slots so you can book directly.
        </Notice>
      )}

      <div className="grid grid-2" style={{ marginTop: 16, alignItems: 'start' }}>
        <div className="stack">
          <Card>
            <JourneyTimeline status={r.status} />
            <p className="muted small" style={{ marginTop: 8 }}>
              {s.hint}
            </p>
          </Card>

          {r.assigned_provider && (
            <Card>
              <h2>Your provider</h2>
              <div className="list-item-title">{r.assigned_provider}</div>
            </Card>
          )}
          {r.status === 'submitted' || r.status === 'matching' ? (
            <Card>
              <h2>Matching clinics</h2>
              <p className="muted small">
                Verified clinics near you are being matched. Once a clinic accepts, you can book
                your appointment directly.
              </p>
            </Card>
          ) : null}

          {BOOKABLE.includes(r.status) && !hasActiveAppointment && (
            <Card>
              <h2>Book an appointment</h2>
              <BookingForm careRequestId={r.id} />
            </Card>
          )}

          {BOOKABLE.includes(r.status) && nextAppointment && (
            <Card>
              <h2>Upcoming appointment</h2>
              <dl className="kv">
                <dt>When</dt>
                <dd>{formatTimeRange(nextAppointment.starts_at, nextAppointment.ends_at)}</dd>
                <dt>Where</dt>
                <dd>{nextAppointment.provider}</dd>
                <dt>Type</dt>
                <dd>{appointmentType[nextAppointment.appointment_type]}</dd>
                <dt>Status</dt>
                <dd>
                  <Pill tone={appointmentStatus[nextAppointment.status].tone}>
                    {appointmentStatus[nextAppointment.status].label}
                  </Pill>
                </dd>
              </dl>
              <p className="muted small" style={{ marginTop: 10 }}>
                You can book another visit once this one is over. Need a different time? Cancel it
                under Appointments, then book again.
              </p>
            </Card>
          )}

          {/* Service Estimates */}
          {estList.length > 0 && (
            <Card>
              <h2>Cost estimates</h2>
              <ul className="list">
                {estList.map((est) => {
                  const meta = estimateStatus[est.status];
                  return (
                    <li className="list-item" key={est.id}>
                      <div className="list-item-main">
                        <div className="list-item-title">
                          {est.currency} {Number(est.amount).toLocaleString()}
                        </div>
                        {est.inclusions && <div className="meta">Includes: {est.inclusions}</div>}
                        {est.exclusions && <div className="meta">Excludes: {est.exclusions}</div>}
                      </div>
                      <div className="btn-row">
                        <Pill tone={meta.tone}>{meta.label}</Pill>
                        {est.status === 'issued' && (
                          <>
                            <Button
                              className="btn-sm"
                              busy={respondEstimate.isPending}
                              onClick={() =>
                                respondEstimate.mutate({ estimateId: est.id, accept: true })
                              }
                            >
                              Approve
                            </Button>
                            <Button
                              variant="ghost"
                              className="btn-sm"
                              onClick={() =>
                                respondEstimate.mutate({ estimateId: est.id, accept: false })
                              }
                            >
                              Decline
                            </Button>
                          </>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}

          {/* Payments & Deposits */}
          <Card>
            <div className="cluster justify-between items-center mb-2">
              <h2>Payments & Deposits</h2>
              {r.assigned_provider_id && (
                <Button className="btn-sm" onClick={() => setPayModalOpen(true)}>
                  Make payment
                </Button>
              )}
            </div>
            {payList.length === 0 ? (
              <p className="muted small">No payment transactions recorded yet.</p>
            ) : (
              <ul className="list">
                {payList.map((p) => {
                  const meta = paymentStatus[p.status];
                  return (
                    <li className="list-item" key={p.id}>
                      <div className="list-item-main">
                        <div className="list-item-title">
                          {p.currency} {Number(p.amount).toLocaleString()}
                        </div>
                        <div className="meta">
                          Ref: {p.provider_reference} · {p.payment_provider}
                        </div>
                      </div>
                      <div className="btn-row">
                        <Pill tone={meta.tone}>{meta.label}</Pill>
                        {p.status === 'pending' && (
                          <Button
                            variant="ghost"
                            className="btn-sm"
                            busy={simulatePay.isPending}
                            onClick={() => simulatePay.mutate(p.id)}
                          >
                            Simulate pay
                          </Button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>

        <div className="stack">
          <Card>
            <h2>Your request</h2>
            <dl className="kv">
              <dt>Urgency</dt>
              <dd>
                <Pill tone={urgency[r.urgency].tone}>{urgency[r.urgency].label}</Pill>
              </dd>
              <dt>Area</dt>
              <dd>{r.preferred_city}</dd>
              <dt>Sent</dt>
              <dd>{formatDateTime(r.created_at)}</dd>
            </dl>
            <div className="quote">{r.description}</div>
            {canCancel && (
              <Button
                variant="danger"
                className="btn-sm"
                busy={cancel.isPending}
                onClick={() => {
                  if (
                    window.confirm(
                      'Cancel this request? Any booked appointments will be cancelled too.',
                    )
                  )
                    cancel.mutate();
                }}
              >
                Cancel request
              </Button>
            )}
            <ErrorNote error={cancel.error} />
          </Card>

          <Card>
            <h2>Appointments</h2>
            {myAppts.length === 0 ? (
              <p className="muted">None yet.</p>
            ) : (
              <ul className="list">
                {myAppts.map((a) => (
                  <li className="list-item" key={a.id}>
                    <div className="list-item-main">
                      <div className="list-item-title">{appointmentType[a.appointment_type]}</div>
                      <div className="meta">
                        {formatTimeRange(a.starts_at, a.ends_at)} · {a.provider}
                      </div>
                    </div>
                    <div className="btn-row">
                      <Pill tone={appointmentStatus[a.status].tone}>
                        {appointmentStatus[a.status].label}
                      </Pill>
                      {(a.status === 'booked' || a.status === 'confirmed') && (
                        <Button
                          variant="ghost"
                          className="btn-sm"
                          onClick={() => cancelAppt.mutate(a.id)}
                        >
                          Cancel
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <ErrorNote error={cancelAppt.error} />
          </Card>

          {/* Secure Clinical Documents */}
          <Card>
            <h2>Clinical documents & X-rays</h2>
            <p className="muted small mb-2">
              Attach diagnostic photos or X-rays. Files are stored securely with encrypted access.
            </p>
            <div className="form-grid mb-3">
              <Field label="Document type">
                <select
                  value={uploadDocType}
                  onChange={(e) =>
                    setUploadDocType(e.target.value as 'photo' | 'xray' | 'report' | 'other')
                  }
                >
                  <option value="photo">Photo</option>
                  <option value="xray">X-ray</option>
                  <option value="report">Lab report</option>
                  <option value="other">Other</option>
                </select>
              </Field>
              <Field label="File" hint="JPG, PNG or PDF, up to 20 MB.">
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png,.pdf"
                  onChange={(e) => void handleFileUpload(e)}
                />
              </Field>
            </div>
            {docList.length === 0 ? (
              <p className="muted small">No documents attached yet.</p>
            ) : (
              <ul className="list">
                {docList.map((doc) => (
                  <li className="list-item" key={doc.id}>
                    <div className="list-item-main">
                      <div className="list-item-title">{doc.file_name}</div>
                      <div className="meta">
                        {doc.document_type.toUpperCase()} · {Math.round(doc.file_size_bytes / 1024)}{' '}
                        KB · by {doc.uploader_name}
                      </div>
                    </div>
                    {doc.download_url && (
                      <a
                        href={doc.download_url}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-sm btn-ghost"
                      >
                        Download
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Matching Score Breakdown */}
          {matchList.length > 0 && (
            <Card>
              <h2>Clinic match ranking</h2>
              <p className="muted small mb-2">
                Intelligent matching score based on specialty, proximity, and clinic capacity.
              </p>
              <ul className="list">
                {matchList.slice(0, 3).map((m) => (
                  <li className="list-item" key={m.provider_id}>
                    <div className="list-item-main">
                      <div className="list-item-title">{m.display_name}</div>
                      <div className="meta">
                        {m.city} · {m.specialties.join(', ')}
                      </div>
                      <div className="meta">
                        Fit: {m.score.breakdown.clinical_fit}/40 · Location:{' '}
                        {m.score.breakdown.location_fit}/20 · Slots:{' '}
                        {m.score.breakdown.availability}/10
                      </div>
                    </div>
                    <Pill tone={m.score.tier === 'excellent' ? 'green' : 'gold'}>
                      {m.score.total}% Match
                    </Pill>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>

      <Modal
        open={payModalOpen}
        title="Make payment or deposit"
        onClose={() => setPayModalOpen(false)}
      >
        <div className="stack gap-3">
          <p className="hint">
            Pay consultation fee or initial treatment deposit securely via Paystack.
          </p>
          <Field label="Amount (NGN)" hint="Whole naira, at least 1,000.">
            <NumberField value={payAmount} onValueChange={setPayAmount} max={5_000_000} required />
          </Field>
          <div className="btn-row">
            <Button variant="ghost" onClick={() => setPayModalOpen(false)}>
              Cancel
            </Button>
            <Button
              busy={initPayment.isPending}
              disabled={!payAmount || Number(payAmount) < 1000}
              onClick={() => initPayment.mutate()}
            >
              Initialize payment
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
