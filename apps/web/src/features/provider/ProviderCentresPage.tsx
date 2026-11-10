import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { api } from '../../api/endpoints';
import type { ProviderCentre } from '../../api/types';
import {
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Field,
  Modal,
  PageHeader,
  Pill,
  Spinner,
} from '../../components/ui';
import { formatDateTime } from '../../lib/time';
import { useActiveClinic } from './activeClinic';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function ProviderCentresPage() {
  const queryClient = useQueryClient();
  const { clinicId } = useActiveClinic();

  const centres = useQuery({
    queryKey: ['centres', clinicId],
    queryFn: () => (clinicId ? api.providerCentres(clinicId) : null),
    enabled: Boolean(clinicId),
  });

  const addCentre = useMutation({
    mutationFn: (body: { name: string; address: string; city: string; phone: string }) =>
      api.addCentre(clinicId!, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['centres', clinicId] });
    },
  });

  const [addOpen, setAddOpen] = useState(false);
  const [centreName, setCentreName] = useState('');
  const [centreAddress, setCentreAddress] = useState('');
  const [centreCity, setCentreCity] = useState('Lagos');
  const [centrePhone, setCentrePhone] = useState('');

  return (
    <>
      <PageHeader
        title="Operating centres"
        subtitle={
          clinicId
            ? "Your clinic's locations. Patients book appointments at a specific centre."
            : 'Select a clinic in the top bar to manage its centres.'
        }
      />
      <ErrorNote error={addCentre.error} />
      {clinicId && centres.isPending ? (
        <Spinner />
      ) : clinicId && centres.isError ? (
        <ErrorNote error={centres.error} />
      ) : (
        <div className="stack gap-4">
          <div className="section-head">
            <div>
              <h2>Operating centres</h2>
              <p className="hint">
                Add each location your clinic operates from. Each centre keeps its own opening hours
                and bookable slots.
              </p>
            </div>
            <Button onClick={() => setAddOpen(true)}>Add centre</Button>
          </div>

          {centres.data?.data.length === 0 ? (
            <EmptyState title="No centres yet">
              Add your first operating centre so patients can book real appointment times.
            </EmptyState>
          ) : (
            <div className="grid grid-2 gap-4">
              {(centres.data?.data ?? []).map((c) => (
                <CentreCard key={c.id} centre={c} queryClient={queryClient} />
              ))}
            </div>
          )}

          <Modal open={addOpen} title="Add operating centre" onClose={() => setAddOpen(false)}>
            <form
              className="form"
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                addCentre.mutate({
                  name: centreName,
                  address: centreAddress,
                  city: centreCity,
                  phone: centrePhone,
                });
              }}
            >
              <Field label="Centre name">
                <input
                  required
                  maxLength={190}
                  value={centreName}
                  onChange={(e) => setCentreName(e.target.value)}
                />
              </Field>
              <Field label="Address">
                <input
                  required
                  maxLength={255}
                  value={centreAddress}
                  onChange={(e) => setCentreAddress(e.target.value)}
                />
              </Field>
              <Field label="City">
                <input
                  required
                  maxLength={100}
                  value={centreCity}
                  onChange={(e) => setCentreCity(e.target.value)}
                />
              </Field>
              <Field label="Phone">
                <input
                  maxLength={50}
                  value={centrePhone}
                  onChange={(e) => setCentrePhone(e.target.value)}
                />
              </Field>
              <ErrorNote error={addCentre.error} />
              <div className="btn-row">
                <Button type="button" variant="ghost" onClick={() => setAddOpen(false)}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  busy={addCentre.isPending}
                  disabled={!centreName || !centreAddress}
                >
                  Add centre
                </Button>
              </div>
            </form>
          </Modal>
        </div>
      )}
    </>
  );
}

function CentreCard({ centre, queryClient }: { centre: ProviderCentre; queryClient: QueryClient }) {
  const [schedulesOpen, setSchedulesOpen] = useState(false);
  const [slotsOpen, setSlotsOpen] = useState(false);
  const [caregiversOpen, setCaregiversOpen] = useState(false);

  const schedules = useQuery({
    queryKey: ['centre-schedules', centre.id],
    queryFn: () => api.providerCentreSchedules(centre.id),
    enabled: schedulesOpen,
  });
  const slots = useQuery({
    queryKey: ['centre-slots', centre.id],
    queryFn: () => api.providerCentreSlots(centre.id),
    enabled: slotsOpen,
  });
  const caregivers = useQuery({
    queryKey: ['centre-caregivers', centre.id],
    queryFn: () => api.centreCaregivers(centre.id),
    enabled: caregiversOpen,
  });

  const generateSlots = useMutation({
    mutationFn: (body: { start_date: string; end_date: string }) =>
      api.generateCentreSlots(centre.id, body),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['centre-slots', centre.id] }),
  });
  const [genStart, setGenStart] = useState('');
  const [genEnd, setGenEnd] = useState('');

  return (
    <Card className="centre-card">
      <div className="card-head">
        <div>
          <h3>{centre.name}</h3>
          <div className="meta">
            {centre.address}, {centre.city}
          </div>
          {centre.phone && <div className="meta small">{centre.phone}</div>}
        </div>
        <Pill tone={centre.is_active ? 'green' : 'grey'}>
          {centre.is_active ? 'Active' : 'Inactive'}
        </Pill>
      </div>
      <div className="btn-row" style={{ marginTop: 10 }}>
        <Button variant="ghost" onClick={() => setSchedulesOpen(!schedulesOpen)}>
          Opening hours
        </Button>
        <Button variant="ghost" onClick={() => setSlotsOpen(!slotsOpen)}>
          Bookable slots
        </Button>
        <Button variant="ghost" onClick={() => setCaregiversOpen(!caregiversOpen)}>
          Caregivers
        </Button>
      </div>

      {schedulesOpen && (
        <div className="stack gap-2" style={{ marginTop: 10 }}>
          {schedules.isPending ? (
            <p>Loading opening hours…</p>
          ) : schedules.data?.data.length === 0 ? (
            <p className="muted small">No opening hours configured.</p>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Day</th>
                    <th>Hours</th>
                    <th>Slot duration</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(schedules.data?.data ?? []).map((s) => (
                    <tr key={s.id}>
                      <td>{DAYS[s.day_of_week]}</td>
                      <td>
                        {s.open_time} – {s.close_time}
                      </td>
                      <td>{s.slot_duration_minutes} min</td>
                      <td>
                        <Pill tone={s.is_active ? 'green' : 'grey'}>
                          {s.is_active ? 'Active' : 'Closed'}
                        </Pill>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {slotsOpen && (
        <div className="stack gap-2" style={{ marginTop: 10 }}>
          {slots.isPending ? (
            <p>Loading slots…</p>
          ) : slots.data?.data.length === 0 ? (
            <p className="muted small">No slots generated yet.</p>
          ) : (
            <div className="table-wrap" style={{ maxHeight: '300px', overflowY: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Time (Lagos)</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(slots.data?.data ?? []).slice(0, 40).map((s) => (
                    <tr key={s.id}>
                      <td>{formatDateTime(s.start_time)}</td>
                      <td>
                        <Pill tone={'available' === s.status ? 'green' : 'teal'}>{s.status}</Pill>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="form-grid gap-2" style={{ marginTop: 8 }}>
            <Field label="From">
              <input
                type="date"
                required
                value={genStart}
                onChange={(e) => setGenStart(e.target.value)}
              />
            </Field>
            <Field label="To">
              <input
                type="date"
                required
                value={genEnd}
                onChange={(e) => setGenEnd(e.target.value)}
              />
            </Field>
            <Button
              type="button"
              busy={generateSlots.isPending}
              onClick={() => generateSlots.mutate({ start_date: genStart, end_date: genEnd })}
              disabled={!genStart || !genEnd}
            >
              Generate slots
            </Button>
          </div>
        </div>
      )}

      {caregiversOpen && (
        <div className="stack gap-2" style={{ marginTop: 10 }}>
          {caregivers.isPending ? (
            <p>Loading caregivers…</p>
          ) : caregivers.data?.data.length === 0 ? (
            <p className="muted small">No caregivers linked to this centre.</p>
          ) : (
            <ul className="list">
              {(caregivers.data?.data ?? []).map((c) => (
                <li className="list-item" key={c.user_id}>
                  <div className="list-item-main">
                    <div className="list-item-title">{c.full_name}</div>
                    <div className="meta">
                      <Pill tone={c.is_active ? 'green' : 'grey'}>
                        {c.is_active ? 'Active' : 'Inactive'}
                      </Pill>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}
