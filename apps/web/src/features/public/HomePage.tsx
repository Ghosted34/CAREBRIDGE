import { Link } from 'react-router';
import { homePathFor, useAuth } from '../../auth/authContext';

export function HomePage() {
  const { user } = useAuth();
  return (
    <>
      <section className="hero">
        <div>
          <div className="eyebrow">Lagos dental-care pilot</div>
          <h1>The right care, without the runaround.</h1>
          <p>
            Tell us what you need once. Verified clinics and specialists respond, you choose, and
            OnDiGoH keeps every step — assessment, treatment and follow-up — in one place.
          </p>
          <div className="btn-row">
            {user ? (
              <Link to={homePathFor(user.role)} className="btn btn-gold">
                Go to your dashboard →
              </Link>
            ) : (
              <>
                <Link to="/register" className="btn btn-gold">
                  Book a dental visit →
                </Link>
                <Link to="/providers" className="btn btn-ghost">
                  Browse verified providers
                </Link>
              </>
            )}
          </div>
        </div>
        <div className="hero-card">
          <h3>How it works</h3>
          <ol>
            <li>Pick your problem and the days you're free.</li>
            <li>See verified clinics near you with open times.</li>
            <li>Send a booking request; the clinic confirms it.</li>
            <li>After your visit, read the clinic's notes and follow-ups.</li>
          </ol>
        </div>
      </section>

      <h2 className="section-title">Built for patients, clinics and the team in between</h2>
      <div className="grid grid-3">
        <div className="card">
          <h3>Patients</h3>
          <p className="muted">
            No more calling clinic after clinic. See real open times and fees near you.
          </p>
        </div>
        <div className="card">
          <h3>Clinics & specialists</h3>
          <p className="muted">
            Bookings that match your services, across all your centres, with notes after each visit.
          </p>
        </div>
        <div className="card">
          <h3>OnDiGoH operators</h3>
          <p className="muted">
            Spot unconfirmed bookings and visits with no outcome, and nudge clinics.
          </p>
        </div>
      </div>
      <div className="notice notice-warn" style={{ marginTop: 24 }}>
        <strong>Emergency?</strong> OnDiGoH is not an emergency service. Call <strong>112</strong>{' '}
        or go to the nearest emergency department.
      </div>
    </>
  );
}
