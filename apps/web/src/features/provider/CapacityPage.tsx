import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { api } from '../../api/endpoints';
import type { Caregiver, Centre, ProviderSchedule } from '../../api/types';
import { useAuth } from '../../auth/authContext';
import {
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Field,
  Modal,
  Notice,
  PageHeader,
  Pill,
  Spinner,
} from '../../components/ui';
import { titleCase } from '../../lib/labels';
import { useActiveClinic } from './activeClinic';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const SLOT_LENGTHS = [15, 20, 30, 45, 60, 90];

interface DayHours {
  day_of_week: number;
  open: boolean;
  open_time: string;
  close_time: string;
  slot_duration_minutes: number;
}

const hhmm = (t: string) => t.slice(0, 5);

/** Seven rows from the saved hours; days with no row are closed. */
function toDays(saved: ProviderSchedule[]): DayHours[] {
  return DAYS.map((_, d) => {
    const s = saved.find((x) => x.day_of_week === d);
    return {
      day_of_week: d,
      open: Boolean(s && s.is_active),
      open_time: s ? hhmm(s.open_time) : '09:00',
      close_time: s ? hhmm(s.close_time) : '17:00',
      slot_duration_minutes: s?.slot_duration_minutes ?? 30,
    };
  });
}

/**
 * Operating centres, their opening hours and their dentists. Patients' free times are worked out
 * from the opening hours and existing bookings — there are no slots to generate.
 */
export function CapacityPage() {
  const { user } = useAuth();
  const { clinicId } = useActiveClinic();
  const isOwner =
    user?.memberships.find((m) => m.provider_id === clinicId)?.provider_role === 'owner';
  const [selected, setSelected] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);

  const centres = useQuery({
    queryKey: ['centres', clinicId],
    queryFn: () => api.centres(clinicId!),
    enabled: Boolean(clinicId),
  });
  const list = centres.data?.data ?? [];
  const centre = list.find((c) => c.id === selected) ?? list[0];

  if (!clinicId) return <EmptyState title="No verified clinic yet" />;

  return (
    <>
      <PageHeader
        title="Centres & hours"
        subtitle="Patients see free times worked out from your opening hours and existing bookings."
        actions={isOwner && <Button onClick={() => setAdding(true)}>Add centre</Button>}
      />
      {centres.isPending ? (
        <Spinner />
      ) : centres.isError ? (
        <ErrorNote error={centres.error} />
      ) : list.length === 0 ? (
        <EmptyState title="No centres yet">
          {isOwner
            ? 'Add your first centre so patients can book.'
            : 'The clinic owner adds centres.'}
        </EmptyState>
      ) : (
        <>
          <div className="tabs" role="group" aria-label="Centres">
            {list.map((c) => (
              <button
                key={c.id}
                type="button"
                className="tab"
                aria-pressed={centre?.id === c.id}
                onClick={() => setSelected(c.id)}
              >
                {c.name}
                {!c.is_active && ' (inactive)'}
              </button>
            ))}
          </div>
          {centre && (
            <div className="stack gap-4">
              <CentreSummary
                centre={centre}
                onEdit={isOwner ? () => setEditing(true) : undefined}
              />
              <HoursEditor
                key={centre.id}
                providerId={clinicId}
                centre={centre}
                canEdit={isOwner}
              />
              <Dentists providerId={clinicId} centre={centre} canEdit={isOwner} />
            </div>
          )}
        </>
      )}
      {adding && (
        <CentreForm providerId={clinicId} onClose={() => setAdding(false)} onSaved={setSelected} />
      )}
      {editing && centre && (
        <CentreForm
          providerId={clinicId}
          centre={centre}
          onClose={() => setEditing(false)}
          onSaved={setSelected}
        />
      )}
    </>
  );
}

function CentreSummary({ centre, onEdit }: { centre: Centre; onEdit?: () => void }) {
  return (
    <Card>
      <div className="card-head">
        <div>
          <h2>{centre.name}</h2>
          <div className="muted">
            {centre.address_line}, {centre.city}, {centre.state} {centre.postal_code}
            {centre.phone && ` · ${centre.phone}`}
          </div>
        </div>
        <div className="cluster gap-2">
          <Pill tone={centre.is_active ? 'green' : 'grey'}>
            {centre.is_active ? 'Taking bookings' : 'Not taking bookings'}
          </Pill>
          {onEdit && (
            <Button variant="secondary" className="btn-sm" onClick={onEdit}>
              Edit centre
            </Button>
          )}
        </div>
      </div>
      <p className="hint">
        Patients searching in <strong>{centre.city}</strong> see this centre first, then others in{' '}
        {centre.state}.
      </p>
    </Card>
  );
}

function HoursEditor({
  providerId,
  centre,
  canEdit,
}: {
  providerId: number;
  centre: Centre;
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const saved = useQuery({
    queryKey: ['schedules', providerId, centre.id],
    queryFn: () => api.providerSchedulesByCentre(providerId, centre.id),
  });
  const [edits, setEdits] = useState<DayHours[] | null>(null);
  const days = edits ?? toDays(saved.data?.data ?? []);
  const update = (d: number, patch: Partial<DayHours>) =>
    setEdits(days.map((x) => (x.day_of_week === d ? { ...x, ...patch } : x)));

  const save = useMutation({
    mutationFn: () =>
      api.setProviderSchedules(
        providerId,
        centre.id,
        days
          .filter((d) => d.open)
          .map((d) => ({
            day_of_week: d.day_of_week,
            open_time: d.open_time,
            close_time: d.close_time,
            slot_duration_minutes: d.slot_duration_minutes,
            is_active: true,
          })),
      ),
    onSuccess: () => {
      setEdits(null);
      void queryClient.invalidateQueries({ queryKey: ['schedules', providerId, centre.id] });
    },
  });
  const invalid = days.some((d) => d.open && d.close_time <= d.open_time);
  const noneOpen = !days.some((d) => d.open);

  return (
    <Card>
      <h2 className="mb-2">Opening hours</h2>
      {saved.isPending ? (
        <Spinner />
      ) : (
        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <div className="table-wrap">
            <table className="hours-table">
              <thead>
                <tr>
                  <th>Day</th>
                  <th>Open</th>
                  <th>Opens</th>
                  <th>Closes</th>
                  <th>Appointment length</th>
                </tr>
              </thead>
              <tbody>
                {days.map((d) => (
                  <tr key={d.day_of_week}>
                    <td>{DAYS[d.day_of_week]}</td>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Open on ${DAYS[d.day_of_week]}`}
                        disabled={!canEdit}
                        checked={d.open}
                        onChange={(e) => update(d.day_of_week, { open: e.target.checked })}
                      />
                    </td>
                    <td>
                      <input
                        type="time"
                        step={900}
                        aria-label={`${DAYS[d.day_of_week]} opens`}
                        disabled={!canEdit || !d.open}
                        value={d.open_time}
                        onChange={(e) => update(d.day_of_week, { open_time: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        type="time"
                        step={900}
                        aria-label={`${DAYS[d.day_of_week]} closes`}
                        disabled={!canEdit || !d.open}
                        value={d.close_time}
                        onChange={(e) => update(d.day_of_week, { close_time: e.target.value })}
                      />
                    </td>
                    <td>
                      <select
                        aria-label={`${DAYS[d.day_of_week]} appointment length`}
                        disabled={!canEdit || !d.open}
                        value={d.slot_duration_minutes}
                        onChange={(e) =>
                          update(d.day_of_week, { slot_duration_minutes: Number(e.target.value) })
                        }
                      >
                        {SLOT_LENGTHS.map((m) => (
                          <option key={m} value={m}>
                            {m} min
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {invalid && <Notice tone="warn">Closing time must be after opening time.</Notice>}
          {noneOpen && <Notice tone="warn">Open at least one day so patients can book.</Notice>}
          <ErrorNote error={save.error} />
          {save.isSuccess && !edits && <Notice tone="success">Opening hours saved.</Notice>}
          {canEdit ? (
            <div className="btn-row mt-2">
              <Button type="submit" busy={save.isPending} disabled={!edits || invalid || noneOpen}>
                Save hours
              </Button>
              {edits && (
                <Button variant="ghost" onClick={() => setEdits(null)}>
                  Discard changes
                </Button>
              )}
            </div>
          ) : (
            <p className="hint">Only the clinic owner can change opening hours.</p>
          )}
        </form>
      )}
    </Card>
  );
}

function Dentists({
  providerId,
  centre,
  canEdit,
}: {
  providerId: number;
  centre: Centre;
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const q = useQuery({
    queryKey: ['caregivers', providerId],
    queryFn: () => api.caregivers(providerId),
  });
  const [name, setName] = useState('');
  const [role, setRole] = useState<Caregiver['role']>('dentist');
  const add = useMutation({
    mutationFn: () =>
      api.createCaregiver(providerId, { centre_id: centre.id, full_name: name.trim(), role }),
    onSuccess: () => {
      setName('');
      void queryClient.invalidateQueries({ queryKey: ['caregivers', providerId] });
    },
  });
  const here = (q.data?.data ?? []).filter((c) => c.centre_id === centre.id);

  return (
    <Card>
      <h2 className="mb-2">Dentists at {centre.name}</h2>
      {q.isPending ? (
        <Spinner />
      ) : here.length === 0 ? (
        <p className="muted">No one listed yet. Patients can still book the centre.</p>
      ) : (
        <ul className="list">
          {here.map((c) => (
            <li key={c.id} className="list-item">
              <span>{c.full_name}</span>
              <span className="badge">{titleCase(c.role)}</span>
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <form
          className="form-grid form-grid-3 mt-2"
          aria-label="Add a dentist"
          onSubmit={(e) => {
            e.preventDefault();
            add.mutate();
          }}
        >
          <Field label="Name">
            <input required value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Role">
            <select value={role} onChange={(e) => setRole(e.target.value as Caregiver['role'])}>
              {(['dentist', 'specialist', 'hygienist', 'caregiver'] as const).map((r) => (
                <option key={r} value={r}>
                  {titleCase(r)}
                </option>
              ))}
            </select>
          </Field>
          <div className="btn-row" style={{ alignSelf: 'end' }}>
            <Button type="submit" variant="secondary" busy={add.isPending}>
              Add
            </Button>
          </div>
          <ErrorNote error={add.error} />
        </form>
      )}
    </Card>
  );
}

/** Add a centre, or edit one (`centre` given). Mounted only while open, so it starts from fresh values. */
function CentreForm({
  providerId,
  centre,
  onClose,
  onSaved,
}: {
  providerId: number;
  centre?: Centre;
  onClose: () => void;
  onSaved: (id: number) => void;
}) {
  const queryClient = useQueryClient();
  const [f, setF] = useState({
    name: centre?.name ?? '',
    address_line: centre?.address_line ?? '',
    city: centre?.city ?? '',
    state: centre?.state ?? 'Lagos',
    postal_code: centre?.postal_code ?? '',
    phone: centre?.phone ?? '',
  });
  const [active, setActive] = useState(centre ? Boolean(centre.is_active) : true);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) =>
    setF((x) => ({ ...x, [k]: e.target.value }));
  const save = useMutation({
    mutationFn: () =>
      centre
        ? api.updateCentre(providerId, centre.id, {
            ...f,
            phone: f.phone.trim() || null,
            is_active: active,
          })
        : api.createCentre(providerId, { ...f, phone: f.phone.trim() || undefined }),
    onSuccess: (r) => {
      void queryClient.invalidateQueries({ queryKey: ['centres', providerId] });
      onSaved(r.data.id);
      onClose();
    },
  });
  return (
    <Modal open title={centre ? `Edit ${centre.name}` : 'Add a centre'} onClose={onClose}>
      <form
        className="form"
        aria-label={centre ? 'Edit centre' : 'Add a centre'}
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <div className="form-grid">
          <Field label="Centre name" hint="e.g. Lekki Phase 1">
            <input required minLength={2} value={f.name} onChange={set('name')} />
          </Field>
          <Field label="Street address">
            <input required minLength={2} value={f.address_line} onChange={set('address_line')} />
          </Field>
          <Field
            label="Area / city"
            hint="The area patients search by, e.g. Ikeja or Lekki — not just “Lagos”"
          >
            <input required minLength={2} value={f.city} onChange={set('city')} />
          </Field>
          <Field label="State">
            <input required minLength={2} value={f.state} onChange={set('state')} />
          </Field>
          <Field label="Postal code">
            <input required minLength={2} value={f.postal_code} onChange={set('postal_code')} />
          </Field>
          <Field label="Phone (optional)">
            <input type="tel" value={f.phone} onChange={set('phone')} />
          </Field>
        </div>
        {centre ? (
          <label className="check">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            <span>
              Taking bookings
              <span className="hint">
                {' '}
                — untick to hide this centre from search. Existing bookings are kept.
              </span>
            </span>
          </label>
        ) : (
          <p className="hint">Next, set its opening hours so patients can book.</p>
        )}
        <ErrorNote error={save.error} />
        <div className="btn-row">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" busy={save.isPending}>
            {centre ? 'Save changes' : 'Add centre'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
