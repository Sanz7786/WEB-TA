import React from 'react';
import { useNavigate } from 'react-router-dom';
import MainLayout from '../components/MainLayout';
import '../assets/vars_Welcome.css';

const quickActions = [
  {
    badge: 'LACT',
    title: 'Tools LACT',
    desc: 'Susun Cover, Daftar Isi, BOQ, 12 Lampiran Evidence, OPM, OTDR, Mancore & KML.',
    href: '/lact?mode=cover',
  },
  {
    badge: 'BAUT',
    title: 'Tools BAUT',
    desc: 'Buat Berita Acara Uji Terima lengkap dengan import NDE, BA Tambah Kurang & BA ABD.',
    href: '/baut?mode=cover',
  },
  {
    badge: 'Utility',
    title: 'Kompres Foto',
    desc: 'Perkecil ukuran foto beresolusi besar di browser tanpa menghilangkan watermark koordinat.',
    href: '/lact?mode=compress',
  },
];

const Welcome: React.FC = () => {
  const navigate = useNavigate();

  return (
    <MainLayout activeMenu="welcome" pageTitle="Welcome">
      <div className="lw-wrapper">
        {/* Latar grid tipis + radial glow ala Linear versi terang */}
        <div className="lw-bg-grid" aria-hidden="true" />
        <div className="lw-bg-glow" aria-hidden="true" />

        <div className="lw-hero">
          <div className="lw-pill lw-reveal lw-d1">
            <span className="lw-pill-dot" />
            <span>Telkom Akses • Internal Document Tools</span>
          </div>

          <div className="lw-verita-hero lw-reveal lw-d2">
            <img
              src={`${import.meta.env.BASE_URL}verita-icon.svg`}
              alt="Logo Verita"
              className="lw-verita-icon"
            />
            <div className="lw-verita-text">
              <span className="lw-verita-name">Verita</span>
              <span className="lw-verita-sub">Evidence &amp; Document Builder</span>
            </div>
          </div>

          <h1 className="lw-title lw-reveal lw-d3">
            Susun Dokumen LACT &amp; BAUT <br />
            <span className="lw-title-accent">Lebih Cepat &amp; Terstruktur.</span>
          </h1>

          <p className="lw-desc lw-reveal lw-d4">
            Isi data proyek, unggah foto di setiap template evidence, lalu gabungkan dan unduh
            hasilnya sebagai satu paket PDF terkompresi langsung dari browser.
          </p>

          <div className="lw-cta-group lw-reveal lw-d5">
            <button
              type="button"
              className="lw-btn lw-btn-primary"
              onClick={() => navigate('/lact?mode=cover')}
            >
              Mulai Tools LACT <span className="lw-arrow">→</span>
            </button>
            <button
              type="button"
              className="lw-btn lw-btn-secondary"
              onClick={() => navigate('/baut?mode=cover')}
            >
              Buka Tools BAUT
            </button>
          </div>
        </div>

        <div className="lw-cards lw-reveal lw-d6">
          {quickActions.map((item) => (
            <div
              key={item.title}
              role="button"
              tabIndex={0}
              className="lw-card"
              onClick={() => navigate(item.href)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  navigate(item.href);
                }
              }}
            >
              <div className="lw-card-top">
                <span className="lw-card-badge">{item.badge}</span>
                <span className="lw-card-arrow">↗</span>
              </div>
              <h3 className="lw-card-title">{item.title}</h3>
              <p className="lw-card-desc">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </MainLayout>
  );
};

export default Welcome;
