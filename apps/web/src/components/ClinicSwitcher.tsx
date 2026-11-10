import { useActiveClinic } from '../features/provider/activeClinic';
import { Field } from './ui';

/**
 * Topbar switcher for staff who belong to more than one accredited clinic: the queue,
 * appointments, offers and capacity all follow the clinic selected here.
 */
export function ClinicSwitcher() {
  const { clinicId, clinics, canSwitch, setClinicId } = useActiveClinic();
  if (!canSwitch) return null;
  return (
    <Field label="Active clinic" className="clinic-switcher">
      <select value={clinicId ?? ''} onChange={(e) => setClinicId(Number(e.target.value))}>
        {clinics.map((m) => (
          <option key={m.provider_id} value={m.provider_id}>
            {m.display_name}
          </option>
        ))}
      </select>
    </Field>
  );
}
