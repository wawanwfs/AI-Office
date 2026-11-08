import React from 'react'
import OrbitalSculpture from './OrbitalSculpture.jsx'
import './landing.css'

const steps = [
  { number: '01', title: 'Plan', description: 'Tentukan tujuan, pecah pekerjaan, dan prioritaskan task dalam satu workspace.' },
  { number: '02', title: 'Build', description: 'Koordinasikan agent, jalankan task, dan inspeksi output lewat panel proyek.' },
  { number: '03', title: 'Review', description: 'Pantau progres, hasil QA, dan aktivitas tim sebelum menyerahkan pekerjaan.' },
]

export default function Landing() {
  return (
    <main className="hq-landing" id="main-content">
      <a href="#choose" className="landing-skip">Lewati ke pilihan workspace</a>
      <header className="landing-header">
        <a className="landing-brand" href="/" aria-label="WFS HQ home">
          <span className="landing-monogram" aria-hidden="true">w.</span>
          <span className="landing-brand-name">WFS <b>PROJECT</b><small>AI SOFTWARE HOUSE</small></span>
        </a>
        <nav className="landing-header-nav" aria-label="Navigasi utama">
          <a href="#capabilities">Cara kerja</a>
          <a href="#choose">Workspace</a>
        </nav>
        <a className="landing-header-link" href="/app/?mode=dashboard">Buka workspace <span aria-hidden="true">↗</span></a>
      </header>

      <section className="landing-hero" aria-labelledby="landing-title">
        <div className="landing-hero-glow" aria-hidden="true" />
        <div className="landing-hero-copy">
          <p className="landing-eyebrow"><span className="landing-eyebrow-dot" aria-hidden="true" /> WFS PROJECT / AUTONOMOUS AI SOFTWARE HOUSE</p>
          <h1 id="landing-title">A new shape<br />of <em>work.</em></h1>
          <p className="landing-intro">From your idea to working software.<br />Direct the AI team. See the work unfold.</p>
          <div className="landing-hero-actions">
            <a className="landing-button landing-button-primary" href="/app/?mode=dashboard">Mulai dari dashboard <span aria-hidden="true">↗</span></a>
            <a className="landing-button landing-button-secondary" href="/app/?mode=office">Jelajahi kantor 3D <span aria-hidden="true">→</span></a>
          </div>
          <div className="landing-hero-footnote">
            <span className="landing-footnote-rule" aria-hidden="true" />
            <span>ONE WORKSPACE</span><span className="landing-footnote-sep" aria-hidden="true">·</span>
            <span>HUMAN DIRECTION + AI EXECUTION</span>
          </div>
        </div>
        <OrbitalSculpture />
        <div className="landing-art-caption"><span>THE ORBITAL COMMONS / 001</span><span>Built around collaboration.</span></div>
      </section>

      <section className="landing-capabilities" id="capabilities" aria-labelledby="landing-capabilities-title">
        <div className="landing-section-heading">
          <p className="landing-eyebrow">FROM IDEA TO DELIVERY</p>
          <h2 id="landing-capabilities-title">A clearer way to <em>build.</em></h2>
          <p>Your AI team, project context, and execution controls in one place.</p>
        </div>
        <div className="landing-step-grid">
          {steps.map(step => (
            <article className="landing-step" key={step.number}>
              <span className="landing-step-number">{step.number}</span>
              <h3>{step.title}</h3>
              <p>{step.description}</p>
              <span className="landing-step-line" aria-hidden="true" />
            </article>
          ))}
        </div>
      </section>

      <section className="landing-choices" id="choose" aria-labelledby="landing-choose-title">
        <div className="landing-choice-heading">
          <p className="landing-eyebrow">CHOOSE YOUR PERSPECTIVE</p>
          <h2 id="landing-choose-title">One platform.<br /><em>Two ways in.</em></h2>
          <p>Berpindah mode tanpa kehilangan konteks pekerjaan.</p>
        </div>
        <a className="landing-choice landing-choice-dashboard" href="/app/?mode=dashboard" aria-label="Open dashboard">
          <span className="landing-choice-top"><span className="landing-choice-icon" aria-hidden="true">▤</span><span>FOCUS ON THE WORK</span><span className="landing-choice-arrow" aria-hidden="true">↗</span></span>
          <h3>Dashboard</h3>
          <p>Tasks, conversations, projects, dan status operasional. Antarmuka ringan untuk fokus eksekusi.</p>
          <span className="landing-choice-action">Open dashboard <span aria-hidden="true">→</span></span>
        </a>
        <a className="landing-choice landing-choice-office" href="/app/?mode=office" aria-label="Enter full AI office">
          <span className="landing-choice-top"><span className="landing-choice-icon" aria-hidden="true">◇</span><span>SEE THE BIGGER PICTURE</span><span className="landing-choice-arrow" aria-hidden="true">↗</span></span>
          <h3>Full AI Office</h3>
          <p>Visualisasi kantor virtual 3D, peran agent, interaksi tim, serta progres pekerjaan.</p>
          <span className="landing-choice-action">Enter full AI office <span aria-hidden="true">→</span></span>
        </a>
      </section>
      <footer className="landing-footer">
        <span className="landing-footer-brand">WFS PROJECT <span>HQ</span></span>
        <span>Created by WFS Project · Built for ambitious ideas.</span>
        <a href="#main-content">Back to top ↑</a>
      </footer>
    </main>
  )
}
