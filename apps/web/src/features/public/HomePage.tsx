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
            CareBridge keeps every step — assessment, treatment and follow-up — in one place.
          </p>
          <div className="btn-row">
            {user ? (
              <Link to={homePathFor(user.role)} className="btn btn-gold">
                Go to your dashboard →
              </Link>
            ) : (
              <>
                <Link to="/register" className="btn btn-gold">
                  Request dental care →
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
            <li>Describe your problem and where you are.</li>
            <li>Verified providers offer to see you.</li>
            <li>Pick one and book a time that suits you.</li>
            <li>Track assessment, treatment and follow-up.</li>
          </ol>
        </div>
      </section>

      <h2 className="section-title">Built for everyone in the journey</h2>
      <div className="grid grid-3">
        <div className="card">
          <h3>Patients</h3>
          <p className="muted">
            One request instead of calling clinic after clinic. See who responded and why.
          </p>
        </div>
        <div className="card">
          <h3>Clinics & specialists</h3>
          <p className="muted">
            Qualified requests that match your services, and a clear view of your patients.
          </p>
        </div>
        <div className="card">
          <h3>CareBridge operators</h3>
          <p className="muted">
            Spot stuck requests, match by hand when needed and keep journeys moving.
          </p>
        </div>
      </div>
      <div className="notice notice-warn" style={{ marginTop: 24 }}>
        <strong>Emergency?</strong> CareBridge is not an emergency service. Call{' '}
        <strong>112</strong> or go to the nearest emergency department.
      </div>
    </>
  );
}
