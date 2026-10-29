'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';

/*
 * DBG PROJECT — Login / Landing Screen (Screen 1 dari 5)
 * Style guide tokens (palet, tipografi, spacing, radius) didefinisikan
 * sebagai CSS variables di .dbg-login agar konsisten dengan mockup Figma.
 * Layout responsif: panel kiri (brand + style guide preview), panel kanan (form login).
 */

const css = `
.dbg-login{
  --p50:#EEF2FF;--p100:#E0E7FF;--p500:#6366F1;--p600:#4F46E5;--p700:#4338CA;
  --n900:#0F172A;--n700:#334155;--n500:#64748B;--n300:#CBD5E1;--n200:#E2E8F0;--n100:#F1F5F9;--n50:#F8FAFC;
  --success:#10B981;--warning:#F59E0B;--danger:#EF4444;
  --s1:4px;--s2:8px;--s3:12px;--s4:16px;--s6:24px;--s8:32px;--s12:48px;--s16:64px;
  --r-sm:8px;--r-md:12px;--r-lg:16px;
  --font:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
  font-family:var(--font);
  min-height:100vh;display:flex;background:var(--n50);color:var(--n900);
  -webkit-font-smoothing:antialiased;
}
.dbg-login *{box-sizing:border-box;margin:0;padding:0}
.dbg-brand{
  flex:1.1;display:flex;flex-direction:column;justify-content:space-between;gap:var(--s8);
  padding:var(--s12) var(--s16);color:#fff;
  background:linear-gradient(160deg,var(--n900) 0%,#1E1B4B 60%,var(--p700) 130%);
}
.dbg-logo{display:flex;align-items:center;gap:var(--s3);font-weight:700;font-size:20px;letter-spacing:-0.02em}
.dbg-logo-mark{
  width:36px;height:36px;border-radius:var(--r-sm);display:grid;place-items:center;
  background:var(--p500);font-size:14px;font-weight:800;color:#fff;
  box-shadow:0 0 0 4px rgba(99,102,241,0.25);
}
.dbg-hero h1{font-size:40px;line-height:48px;font-weight:800;letter-spacing:-0.03em;max-width:520px}
.dbg-hero h1 em{font-style:normal;color:#A5B4FC}
.dbg-hero>p{margin-top:var(--s4);font-size:16px;line-height:24px;color:var(--n300);max-width:460px}
.dbg-guide{
  margin-top:var(--s8);background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);
  border-radius:var(--r-lg);padding:var(--s6);max-width:560px;
}
.dbg-guide>h3{font-size:12px;line-height:16px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:#A5B4FC;margin-bottom:var(--s4)}
.dbg-swatches{display:flex;gap:var(--s2);flex-wrap:wrap}
.dbg-swatch{width:40px;height:40px;border-radius:var(--r-sm);border:1px solid rgba(255,255,255,0.15);position:relative}
.dbg-swatch span{position:absolute;bottom:-16px;left:0;font-size:10px;color:var(--n300)}
.dbg-guide-block{margin-top:var(--s8)}
.dbg-guide-block>h3{font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:#A5B4FC;margin-bottom:var(--s2)}
.dbg-type{display:flex;flex-direction:column;gap:var(--s2)}
.dbg-type div{display:flex;align-items:baseline;gap:var(--s3);color:#E2E8F0}
.dbg-type small{width:56px;color:var(--n500);font-size:11px}
.dbg-comp{display:flex;flex-direction:column;gap:var(--s3);margin-top:var(--s2)}
.dbg-btn{
  display:inline-flex;align-items:center;justify-content:center;gap:var(--s2);
  font-family:var(--font);font-size:14px;font-weight:600;line-height:20px;
  padding:10px var(--s4);border-radius:var(--r-sm);border:1px solid transparent;
  cursor:pointer;transition:all .15s ease;text-decoration:none;
}
.dbg-btn-primary{background:var(--p600);color:#fff}
.dbg-btn-primary:hover{background:var(--p700)}
.dbg-btn-secondary{background:transparent;color:#fff;border-color:rgba(255,255,255,0.3)}
.dbg-btn-secondary:hover{border-color:#fff}
.dbg-btn-ghost{background:transparent;color:var(--n300)}
.dbg-btn-ghost:hover{color:#fff;background:rgba(255,255,255,0.08)}
.dbg-btn-sm{padding:6px var(--s3);font-size:12px;line-height:16px}
.dbg-btn:disabled{opacity:0.6;cursor:not-allowed}
.dbg-mini-card{
  background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);
  border-radius:var(--r-md);padding:var(--s4);display:flex;flex-direction:column;gap:var(--s2);
}
.dbg-mini-card b{font-size:14px}
.dbg-mini-card span{font-size:12px;color:var(--n300)}
.dbg-pill{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:600;padding:2px 8px;border-radius:999px}
.dbg-pill i{width:6px;height:6px;border-radius:50%;display:inline-block}
.dbg-pill-ok{background:rgba(16,185,129,0.15);color:#6EE7B7}
.dbg-pill-ok i{background:var(--success)}
.dbg-pill-warn{background:rgba(245,158,11,0.15);color:#FCD34D}
.dbg-pill-warn i{background:var(--warning)}
.dbg-table{width:100%;border-collapse:collapse;font-size:12px;color:#E2E8F0;margin-top:var(--s2)}
.dbg-table th{text-align:left;font-weight:600;color:var(--n300);padding:6px var(--s2);border-bottom:1px solid rgba(255,255,255,0.15)}
.dbg-table td{padding:6px var(--s2);border-bottom:1px solid rgba(255,255,255,0.07)}
.dbg-foot{font-size:12px;color:var(--n500)}
.dbg-panel{flex:1;display:flex;align-items:center;justify-content:center;padding:var(--s8) var(--s6)}
.dbg-card{
  width:100%;max-width:420px;background:#fff;border:1px solid var(--n200);
  border-radius:var(--r-lg);padding:var(--s8);box-shadow:0 20px 40px -20px rgba(15,23,42,0.25);
}
.dbg-card h2{font-size:24px;line-height:32px;font-weight:700;letter-spacing:-0.02em}
.dbg-card>p{margin-top:var(--s2);font-size:14px;line-height:20px;color:var(--n500)}
.dbg-field{margin-top:var(--s4);display:flex;flex-direction:column;gap:6px}
.dbg-field label{font-size:14px;font-weight:600;color:var(--n700)}
.dbg-input{
  font-family:var(--font);font-size:14px;line-height:20px;color:var(--n900);
  padding:10px var(--s3);border:1px solid var(--n300);border-radius:var(--r-sm);
  background:#fff;outline:none;transition:border-color .15s,box-shadow .15s;width:100%;
}
.dbg-input::placeholder{color:var(--n300)}
.dbg-input:focus{border-color:var(--p500);box-shadow:0 0 0 3px var(--p100)}
.dbg-input-error{border-color:var(--danger)}
.dbg-input-error:focus{border-color:var(--danger);box-shadow:0 0 0 3px rgba(239,68,68,0.15)}
.dbg-row{display:flex;align-items:center;justify-content:space-between;margin-top:var(--s4)}
.dbg-check{display:flex;align-items:center;gap:var(--s2);font-size:14px;color:var(--n700);cursor:pointer}
.dbg-check input{width:16px;height:16px;accent-color:var(--p600);cursor:pointer}
.dbg-link{font-size:14px;font-weight:600;color:var(--p600);text-decoration:none}
.dbg-link:hover{text-decoration:underline}
.dbg-alert{
  margin-top:var(--s4);background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.3);
  color:var(--danger);font-size:13px;padding:10px var(--s3);border-radius:var(--r-sm);
}
.dbg-submit{width:100%;margin-top:var(--s6)}
.dbg-divider{display:flex;align-items:center;gap:var(--s3);margin:var(--s6) 0;color:var(--n500);font-size:12px}
.dbg-divider::before,.dbg-divider::after{content:'';flex:1;height:1px;background:var(--n200)}
.dbg-sso{display:grid;grid-template-columns:1fr 1fr;gap:var(--s3)}
.dbg-signup{margin-top:var(--s6);text-align:center;font-size:14px;color:var(--n500)}
@media (max-width:960px){
  .dbg-login{flex-direction:column}
  .dbg-brand{padding:var(--s8) var(--s6)}
  .dbg-hero h1{font-size:32px;line-height:40px}
  .dbg-guide{display:none}
  .dbg-panel{padding:var(--s6) var(--s4)}
  .dbg-card{padding:var(--s6)}
}
`;

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    if (!email.trim() || !password) {
      setError('Email dan password wajib diisi.');
      return;
    }
    setLoading(true);
    window.setTimeout(() => {
      setLoading(false);
      window.location.href = '/dashboard';
    }, 900);
  }

  return (
    <div className='dbg-login'>
      <style>{css}</style>

      <aside className='dbg-brand'>
        <div className='dbg-logo'>
          <div className='dbg-logo-mark'>DB</div>
          dbg&nbsp;project
        </div>

        <div className='dbg-hero'>
          <h1>
            Debug database <em>lebih cepat</em>, dengan percaya diri.
          </h1>
          <p>
            DBG Project membantu tim engineering memantau query, menelusuri error,
            dan mengamankan akses database dari satu dashboard terpusat.
          </p>

          <section className='dbg-guide' aria-label='Style guide preview'>
            <h3>Style Guide v1.0</h3>

            <div className='dbg-swatches'>
              <div className='dbg-swatch' style={{ background: '#4F46E5' }}><span>500</span></div>
              <div className='dbg-swatch' style={{ background: '#6366F1' }}><span>400</span></div>
              <div className='dbg-swatch' style={{ background: '#0F172A' }}><span>900</span></div>
              <div className='dbg-swatch' style={{ background: '#64748B' }}><span>500</span></div>
              <div className='dbg-swatch' style={{ background: '#E2E8F0' }}><span>200</span></div>
              <div className='dbg-swatch' style={{ background: '#10B981' }}><span>OK</span></div>
              <div className='dbg-swatch' style={{ background: '#F59E0B' }}><span>WRN</span></div>
              <div className='dbg-swatch' style={{ background: '#EF4444' }}><span>ERR</span></div>
            </div>

            <div className='dbg-guide-block dbg-type'>
              <div><small>40/48</small><span style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em' }}>Display</span></div>
              <div><small>24/32</small><span style={{ fontSize: 20, fontWeight: 700 }}>Heading</span></div>
              <div><small>16/24</small><span style={{ fontSize: 16 }}>Body — Inter Regular</span></div>
              <div><small>12/16</small><span style={{ fontSize: 12, color: '#94A3B8' }}>Caption — Inter Medium</span></div>
            </div>

            <div className='dbg-guide-block'>
              <h3>Components</h3>
              <div className='dbg-comp'>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button type='button' className='dbg-btn dbg-btn-primary dbg-btn-sm'>Primary</button>
                  <button type='button' className='dbg-btn dbg-btn-secondary dbg-btn-sm'>Secondary</button>
                  <button type='button' className='dbg-btn dbg-btn-ghost dbg-btn-sm'>Ghost</button>
                </div>
                <div className='dbg-mini-card'>
                  <b>Slow query terdeteksi</b>
                  <span>SELECT * FROM orders — 4.2s di prod-cluster-01</span>
                  <div><span className='dbg-pill dbg-pill-warn'><i />Warning</span></div>
                </div>
                <table className='dbg-table'>
                  <thead>
                    <tr><th>Query</th><th>Durasi</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    <tr><td>getUserById</td><td>12ms</td><td><span className='dbg-pill dbg-pill-ok'><i />OK</span></td></tr>
                    <tr><td>joinOrders</td><td>840ms</td><td><span className='dbg-pill dbg-pill-warn'><i />Slow</span></td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </div>

        <div className='dbg-foot'>
          Spacing 4·8·12·16·24·32·48·64 — Radius 8/12/16 — Font Inter — Palet Indigo x Slate
        </div>
      </aside>

      <main className='dbg-panel'>
        <form className='dbg-card' onSubmit={handleSubmit} noValidate>
          <h2>Masuk ke DBG</h2>
          <p>Gunakan akun tim engineering Anda untuk melanjutkan.</p>

          {error ? <div className='dbg-alert' role='alert'>{error}</div> : null}

          <div className='dbg-field'>
            <label htmlFor='email'>Email</label>
            <input
              id='email'
              type='email'
              className={'dbg-input' + (error && !email.trim() ? ' dbg-input-error' : '')}
              placeholder='nama@perusahaan.com'
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete='email'
            />
          </div>

          <div className='dbg-field'>
            <label htmlFor='password'>Password</label>
            <input
              id='password'
              type='password'
              className={'dbg-input' + (error && !password ? ' dbg-input-error' : '')}
              placeholder='••••••••'
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete='current-password'
            />
          </div>

          <div className='dbg-row'>
            <label className='dbg-check'>
              <input type='checkbox' checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              Ingat saya
            </label>
            <a className='dbg-link' href='/forgot-password'>Lupa password?</a>
          </div>

          <button type='submit' className='dbg-btn dbg-btn-primary dbg-submit' disabled={loading}>
            {loading ? 'Memproses…' : 'Masuk'}
          </button>

          <div className='dbg-divider'>atau lanjut dengan</div>

          <div className='dbg-sso'>
            <button type='button' className='dbg-btn dbg-btn-secondary' style={{ color: '#334155', borderColor: '#CBD5E1' }}>
              GitHub
            </button>
            <button type='button' className='dbg-btn dbg-btn-secondary' style={{ color: '#334155', borderColor: '#CBD5E1' }}>
              Google
            </button>
          </div>

          <p className='dbg-signup'>
            Belum punya akun? <a className='dbg-link' href='/register'>Daftar sekarang</a>
          </p>
        </form>
      </main>
    </div>
  );
}
