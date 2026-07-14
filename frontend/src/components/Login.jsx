import React, { useState } from 'react';
import { Lock } from 'lucide-react';
import { login } from '../auth';

// Basit ortak-parola giriş ekranı. Başarılı girişte onSuccess() çağrılır.
export default function Login({ onSuccess, lang = 'en' }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const tr = lang === 'tr'
    ? { title: 'Nova Workspace', sub: 'Devam etmek için parolanızı girin', ph: 'Parola', btn: 'Giriş Yap', busy: 'Kontrol ediliyor…', err: 'Hatalı parola' }
    : { title: 'Nova Workspace', sub: 'Enter your password to continue', ph: 'Password', btn: 'Log in', busy: 'Checking…', err: 'Wrong password' };

  const submit = async (e) => {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError('');
    const res = await login(password);
    setBusy(false);
    if (res.ok) {
      onSuccess();
    } else {
      setError(res.error || tr.err);
      setPassword('');
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg-app, #FDF8F6)', padding: '20px'
    }}>
      <form onSubmit={submit} style={{
        width: '100%', maxWidth: '360px', background: 'var(--bg-card, #fff)',
        border: '1px solid var(--border-card, #eadfd9)', borderRadius: '20px',
        padding: '36px 28px', boxShadow: 'var(--shadow-lg, 0 10px 40px rgba(0,0,0,0.08))',
        display: 'flex', flexDirection: 'column', gap: '16px', textAlign: 'center'
      }}>
        <div style={{
          width: '56px', height: '56px', borderRadius: '50%', margin: '0 auto',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--bg-nav-active, #f4735822)', color: 'var(--accent, #f47358)'
        }}>
          <Lock size={26} />
        </div>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 700, margin: 0, color: 'var(--text-main, #2b1d18)' }}>{tr.title}</h1>
          <p style={{ fontSize: '13.5px', color: 'var(--text-muted, #8a7a72)', margin: '6px 0 0' }}>{tr.sub}</p>
        </div>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={tr.ph}
          autoFocus
          style={{
            width: '100%', padding: '12px 14px', borderRadius: '12px',
            border: '1px solid var(--border-card, #e2d6cf)', fontSize: '15px',
            background: 'var(--bg-app, #fff)', color: 'var(--text-main, #2b1d18)', outline: 'none'
          }}
        />
        {error && <div style={{ color: '#d14343', fontSize: '13px', marginTop: '-4px' }}>{error}</div>}
        <button
          type="submit"
          disabled={busy}
          style={{
            width: '100%', padding: '12px', borderRadius: '12px', border: 'none',
            background: 'var(--accent, #f47358)', color: '#fff', fontSize: '15px',
            fontWeight: 600, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.7 : 1
          }}
        >
          {busy ? tr.busy : tr.btn}
        </button>
      </form>
    </div>
  );
}
