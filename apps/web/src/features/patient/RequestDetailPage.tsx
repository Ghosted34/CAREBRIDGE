import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useParams } from 'react-router';
import { api } from '../../api/endpoints';
import { BookingForm } from '../../components/BookingForm';
import { JourneyTimeline } from '../../components/Journey';
import {
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Notice,
  PageHeader,
  Pill,
  Spinner,
} from '../../components/ui';
import {
  appointmentStatus,
  appointmentType,
  requestStatus,
  titleCase,
  urgency,
} from '../../lib/labels';
import { formatDateTime, formatTimeRange } from '../../lib/time';

const BOOKABLE = ['provider_accepted', 'assessment', 'treatment_planned', 'in_progress'];

export function RequestDetailPage() {
  const id = Number(useParams().id);
  const justCreated = (useLocation().state as { created?: boolean } | null)?.created;
  const queryClient = useQueryClient();

  const request = useQuery({ queryKey: ['requests', id], queryFn: () => api.request(id) });
  const offers = useQuery({
    queryKey: ['requests', id, 'offers'],
    queryFn: () => api.offersForRequest(id),
  });
  const appointments = useQuery({
    queryKey: ['appointments', 'mine'],
    queryFn: api.myAppointments,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['requests'] });
    void queryClient.invalidateQueries({ queryKey: ['appointments'] });
  };
  const respond = useMutation({
    mutationFn: ({ offerId, accept }: { offerId: number; accept: boolean }) =>
      accept ? api.acceptOffer(offerId) : api.declineOffer(offerId),
    onSuccess: refresh,
  });
  const cancel = useMutation({ mutationFn: () => api.cancelRequest(id), onSuccess: refresh });
  const cancelAppt = useMutation({
    mutationFn: (apptId: number) => api.appointmentAction(apptId, 'cancel'),
    onSuccess: refresh,
  });

  if (request.isPending) return <Spinner />;
  if (request.isError) return <ErrorNote error={request.error} />;
  const r = request.data.data;
  const s = requestStatus[r.status];
  const myAppts = (appointments.data?.data ?? []).filter((a) => a.care_request_id === id);
  const openOffers = (offers.data?.data ?? []).filter((o) => o.status === 'offered');
  const canCancel = !['completed', 'cancelled'].includes(r.status);
  const accepted = offers.data?.data.find((o) => o.status === 'accepted');

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
          Request sent. We’ll show provider offers here as they arrive.
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

          {r.status === 'submitted' || r.status === 'matching' ? (
            <Card>
              <h2>Provider offers</h2>
              {offers.isPending ? (
                <Spinner />
              ) : openOffers.length === 0 ? (
                <EmptyState title="No offers yet">
                  Verified providers are reviewing your request.
                </EmptyState>
              ) : (
                <ul className="list">
                  {openOffers.map((o) => (
                    <li className="list-item" key={o.id}>
                      <div className="list-item-main">
                        <div className="list-item-title">{o.provider}</div>
                        <div className="meta">{o.provider_address}</div>
                        {o.message && <div className="quote">{o.message}</div>}
                        <div className="meta">Offered {formatDateTime(o.offered_at)}</div>
                      </div>
                      <div className="btn-row">
                        <Button
                          busy={
                            respond.isPending &&
                            respond.variables?.offerId === o.id &&
                            respond.variables.accept
                          }
                          onClick={() => respond.mutate({ offerId: o.id, accept: true })}
                        >
                          Choose
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => respond.mutate({ offerId: o.id, accept: false })}
                        >
                          Decline
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <ErrorNote error={respond.error} />
            </Card>
          ) : (
            accepted && (
              <Card>
                <h2>Your provider</h2>
                <div className="list-item-title">{accepted.provider}</div>
                <div className="muted small">{accepted.provider_address}</div>
              </Card>
            )
          )}

          {BOOKABLE.includes(r.status) && (
            <Card>
              <h2>Book an appointment</h2>
              <BookingForm careRequestId={r.id} />
            </Card>
          )}
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
        </div>
      </div>
    </>
  );
}
