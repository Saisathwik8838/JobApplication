import { useEffect, useState } from 'react';
import { get, put } from '../api/client.js';

export function Profile() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [success, setSuccess] = useState('');

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [location, setLocation] = useState('');
  const [portfolioUrl, setPortfolioUrl] = useState('');
  const [linkedInUrl, setLinkedInUrl] = useState('');
  const [githubUrl, setGithubUrl] = useState('');

  const [experienceLevel, setExperienceLevel] = useState('mid');
  const [totalYears, setTotalYears] = useState(3);
  const [targetRoles, setTargetRoles] = useState('');
  const [targetLocations, setTargetLocations] = useState('');
  const [minSalary, setMinSalary] = useState('');
  const [workAuthorization, setWorkAuthorization] = useState('Authorized to work');
  const [skills, setSkills] = useState('');
  const [masterResume, setMasterResume] = useState('');

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    get('/api/profile')
      .then((data) => {
        if (!mounted) return;
        const p = data.profile || {};
        const id = p.identity || p.candidate || {};
        const exp = p.experience || {};
        const pref = p.preferences || {};

        setName(id.name || data.user?.name || '');
        setEmail(id.email || data.user?.email || '');
        setPhone(id.phone || '');
        setLocation(id.location || '');
        setPortfolioUrl(id.portfolioUrl || '');
        setLinkedInUrl(id.linkedInUrl || '');
        setGithubUrl(id.githubUrl || '');

        const rawLevel = String(exp.level || '').toLowerCase();
        let normLevel = 'mid';
        if (rawLevel.includes('intern')) normLevel = 'intern';
        else if (rawLevel.includes('entry') || rawLevel.includes('junior')) normLevel = 'entry';
        else if (rawLevel.includes('senior')) normLevel = 'senior';
        else if (rawLevel.includes('staff')) normLevel = 'staff';
        else if (rawLevel.includes('principal') || rawLevel.includes('director')) normLevel = 'principal';
        setExperienceLevel(normLevel);
        setTotalYears(exp.totalYears ?? exp.years ?? 0);

        const rolesList = pref.roles || [];
        setTargetRoles(Array.isArray(rolesList) ? rolesList.join(', ') : String(rolesList || ''));

        const locList = pref.locations || [];
        setTargetLocations(Array.isArray(locList) ? locList.join(', ') : String(locList || ''));

        setMinSalary(pref.minSalary != null ? String(pref.minSalary) : '');
        setWorkAuthorization(pref.workAuthorization || 'Indian citizen — no sponsorship required');

        const rawSkills = p.skills || [];
        let skillsList = [];
        if (Array.isArray(rawSkills)) {
          skillsList = rawSkills.flatMap((s) => (typeof s === 'object' && s !== null ? Object.values(s) : [s]));
        } else if (typeof rawSkills === 'object' && rawSkills !== null) {
          skillsList = Object.values(rawSkills).flatMap((v) => (Array.isArray(v) ? v : [v]));
        }
        setSkills(skillsList.join(', '));

        setMasterResume(data.masterResume || '');
        setLoading(false);
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err.message || 'Failed to load profile');
        setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    setError('');
    setFieldErrors({});
    setSuccess('');
    setSaving(true);

    try {
      const updatedProfile = {
        identity: {
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim(),
          location: location.trim(),
          portfolioUrl: portfolioUrl.trim(),
          linkedInUrl: linkedInUrl.trim(),
          githubUrl: githubUrl.trim(),
        },
        experience: {
          level: experienceLevel,
          totalYears: Number(totalYears) || 0,
        },
        preferences: {
          roles: targetRoles
            .split(',')
            .map((r) => r.trim())
            .filter(Boolean),
          locations: targetLocations
            .split(',')
            .map((l) => l.trim())
            .filter(Boolean),
          minSalary: minSalary ? Number(minSalary) : undefined,
          workAuthorization: workAuthorization.trim(),
        },
        skills: skills
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      };

      await put('/api/profile', {
        profile: updatedProfile,
        masterResume,
      });

      setSuccess('Profile and Master Resume updated successfully!');
    } catch (err) {
      setError(err.message || 'Failed to update profile');
      if (err.details?.fieldErrors) {
        setFieldErrors(err.details.fieldErrors);
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
        Loading candidate profile…
      </div>
    );
  }

  return (
    <section style={{ maxWidth: '850px', margin: '0 auto', paddingBottom: '3rem' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ margin: '0 0 0.25rem 0', color: '#0f172a' }}>Candidate Profile &amp; Resume</h2>
        <small style={{ color: '#64748b' }}>
          Configure your factual candidate identity, seniority level, preferences, and master resume. All applications strictly draw truthful answers from this data.
        </small>
      </div>

      {error && (
        <div role="alert" style={{ background: '#fee2e2', border: '1px solid #fca5a5', color: '#991b1b', padding: '0.75rem 1rem', borderRadius: '6px', marginBottom: '1.25rem' }}>
          <strong>Error:</strong> {error}
          {Object.keys(fieldErrors).length > 0 && (
            <ul style={{ margin: '0.5rem 0 0 1.25rem', padding: 0 }}>
              {Object.entries(fieldErrors).map(([field, msgs]) => (
                <li key={field}>
                  <strong>{field}:</strong> {Array.isArray(msgs) ? msgs.join(', ') : msgs}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {success && (
        <div role="status" style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#065f46', padding: '0.75rem 1rem', borderRadius: '6px', marginBottom: '1.25rem' }}>
          {success}
        </div>
      )}

      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {/* Section 1: Candidate Identity */}
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1.5rem' }}>
          <h3 style={{ margin: '0 0 1rem 0', color: '#1e293b', fontSize: '1.15rem' }}>
            👤 Personal &amp; Contact Details
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
            <div>
              <label htmlFor="prof-name" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>Full Name</label>
              <input
                id="prof-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                style={{ width: '100%', padding: '0.55rem', border: '1px solid #cbd5e1', borderRadius: '6px' }}
              />
            </div>
            <div>
              <label htmlFor="prof-email" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>Email</label>
              <input
                id="prof-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={{ width: '100%', padding: '0.55rem', border: '1px solid #cbd5e1', borderRadius: '6px' }}
              />
            </div>
            <div>
              <label htmlFor="prof-phone" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>Phone</label>
              <input
                id="prof-phone"
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 98765 43210"
                style={{ width: '100%', padding: '0.55rem', border: '1px solid #cbd5e1', borderRadius: '6px' }}
              />
            </div>
            <div>
              <label htmlFor="prof-location" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>Location / City, Country</label>
              <input
                id="prof-location"
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Hyderabad, Bengaluru, or Remote"
                style={{ width: '100%', padding: '0.55rem', border: '1px solid #cbd5e1', borderRadius: '6px' }}
              />
            </div>
            <div>
              <label htmlFor="prof-linkedin" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>LinkedIn Profile URL</label>
              <input
                id="prof-linkedin"
                type="url"
                value={linkedInUrl}
                onChange={(e) => setLinkedInUrl(e.target.value)}
                placeholder="https://linkedin.com/in/..."
                style={{ width: '100%', padding: '0.55rem', border: '1px solid #cbd5e1', borderRadius: '6px' }}
              />
            </div>
            <div>
              <label htmlFor="prof-github" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>GitHub Profile URL</label>
              <input
                id="prof-github"
                type="url"
                value={githubUrl}
                onChange={(e) => setGithubUrl(e.target.value)}
                placeholder="https://github.com/..."
                style={{ width: '100%', padding: '0.55rem', border: '1px solid #cbd5e1', borderRadius: '6px' }}
              />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label htmlFor="prof-portfolio" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>Portfolio / Website URL</label>
              <input
                id="prof-portfolio"
                type="url"
                value={portfolioUrl}
                onChange={(e) => setPortfolioUrl(e.target.value)}
                placeholder="https://mysite.com"
                style={{ width: '100%', padding: '0.55rem', border: '1px solid #cbd5e1', borderRadius: '6px' }}
              />
            </div>
          </div>
        </div>

        {/* Section 2: Experience & Seniority Tier */}
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1.5rem' }}>
          <h3 style={{ margin: '0 0 1rem 0', color: '#1e293b', fontSize: '1.15rem' }}>
            💼 Seniority &amp; Experience Level
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
            <div>
              <label htmlFor="prof-level" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>
                Seniority Tier
              </label>
              <select
                id="prof-level"
                value={experienceLevel}
                onChange={(e) => setExperienceLevel(e.target.value)}
                style={{ width: '100%', padding: '0.55rem', border: '1px solid #cbd5e1', borderRadius: '6px', background: '#fff' }}
              >
                <option value="intern">Intern / Trainee</option>
                <option value="entry">Entry Level (0-2 years)</option>
                <option value="mid">Mid-Level (3-5 years)</option>
                <option value="senior">Senior (5+ years)</option>
                <option value="staff">Staff / Lead</option>
                <option value="principal">Principal / Director</option>
              </select>
              <small style={{ color: '#64748b', display: 'block', marginTop: '0.25rem' }}>
                Used for deterministic seniority eligibility checks to avoid applying to roles far above your tier.
              </small>
            </div>

            <div>
              <label htmlFor="prof-years" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>
                Total Years of Experience
              </label>
              <input
                id="prof-years"
                type="number"
                min="0"
                max="50"
                value={totalYears}
                onChange={(e) => setTotalYears(e.target.value)}
                style={{ width: '100%', padding: '0.55rem', border: '1px solid #cbd5e1', borderRadius: '6px' }}
              />
            </div>

            <div>
              <label htmlFor="prof-auth" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>
                Work Authorization
              </label>
              <input
                id="prof-auth"
                type="text"
                value={workAuthorization}
                onChange={(e) => setWorkAuthorization(e.target.value)}
                placeholder="Indian citizen / Requires visa sponsorship / OCI"
                style={{ width: '100%', padding: '0.55rem', border: '1px solid #cbd5e1', borderRadius: '6px' }}
              />
            </div>

            <div>
              <label htmlFor="prof-minsalary" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>
                Minimum Annual Salary (INR, LPA)
              </label>
              <input
                id="prof-minsalary"
                type="number"
                min="0"
                step="0.5"
                value={minSalary}
                onChange={(e) => setMinSalary(e.target.value)}
                placeholder="e.g. 12"
                style={{ width: '100%', padding: '0.55rem', border: '1px solid #cbd5e1', borderRadius: '6px' }}
              />
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label htmlFor="prof-roles" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>
                Target Roles (comma-separated)
              </label>
              <input
                id="prof-roles"
                type="text"
                value={targetRoles}
                onChange={(e) => setTargetRoles(e.target.value)}
                placeholder="Backend Engineer, Full Stack Developer, Software Engineer"
                style={{ width: '100%', padding: '0.55rem', border: '1px solid #cbd5e1', borderRadius: '6px' }}
              />
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label htmlFor="prof-locations" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>
                Preferred Locations (comma-separated)
              </label>
              <input
                id="prof-locations"
                type="text"
                value={targetLocations}
                onChange={(e) => setTargetLocations(e.target.value)}
                placeholder="Hyderabad, Bengaluru, Pune, Remote"
                style={{ width: '100%', padding: '0.55rem', border: '1px solid #cbd5e1', borderRadius: '6px' }}
              />
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label htmlFor="prof-skills" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>
                Skills &amp; Technologies (comma-separated)
              </label>
              <input
                id="prof-skills"
                type="text"
                value={skills}
                onChange={(e) => setSkills(e.target.value)}
                placeholder="Node.js, PostgreSQL, TypeScript, React, Docker, Python"
                style={{ width: '100%', padding: '0.55rem', border: '1px solid #cbd5e1', borderRadius: '6px' }}
              />
            </div>
          </div>
        </div>

        {/* Section 3: Master Resume */}
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1.5rem' }}>
          <h3 style={{ margin: '0 0 0.5rem 0', color: '#1e293b', fontSize: '1.15rem' }}>
            📄 Master Resume Text
          </h3>
          <p style={{ margin: '0 0 1rem 0', color: '#64748b', fontSize: '0.85rem' }}>
            Your full, untruncated master resume in Markdown or plain text. LLM tailored resumes are generated strictly by highlighting and organizing true content from this text without inventing achievements.
          </p>
          <textarea
            id="prof-resume"
            rows={14}
            value={masterResume}
            onChange={(e) => setMasterResume(e.target.value)}
            placeholder="# Your Name&#10;&#10;## Summary&#10;..."
            style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.9rem', padding: '0.75rem', border: '1px solid #cbd5e1', borderRadius: '6px', lineHeight: 1.5 }}
          />
        </div>

        <div>
          <button
            type="submit"
            disabled={saving}
            style={{ padding: '0.75rem 2rem', background: '#0284c7', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 700, fontSize: '1rem', cursor: 'pointer' }}
          >
            {saving ? 'Saving Profile…' : 'Save Profile & Resume'}
          </button>
        </div>
      </form>
    </section>
  );
}
