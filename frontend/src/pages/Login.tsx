import { FormEvent, useState } from 'react';
import { DEMO_PASSWORD, DEMO_USERNAME, useAuth } from '../AuthContext';

export function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (login(username.trim(), password)) {
      setError(null);
    } else {
      setError('Invalid username or password.');
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">CaseFlow</div>
        <p className="login-sub">Sign in to continue</p>
        <form className="form" onSubmit={onSubmit}>
          <div>
            <label htmlFor="username">Username</label>
            <input
              id="username"
              autoFocus
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && <div className="login-error">{error}</div>}
          <button className="btn" type="submit">
            Sign in
          </button>
        </form>
        <div className="login-hint">
          <strong>Demo credentials</strong>
          <div>
            Username: <code>{DEMO_USERNAME}</code>
          </div>
          <div>
            Password: <code>{DEMO_PASSWORD}</code>
          </div>
          <p>Fake login for the sample app — no real authentication.</p>
        </div>
      </div>
    </div>
  );
}
