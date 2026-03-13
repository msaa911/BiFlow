'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import './landing.css';

export default function LandingPage() {
  // --- States ---
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [activeFaq, setActiveFaq] = useState<number | null>(null);

  // Popup States
  const [showExitPopup, setShowExitPopup] = useState(false);
  const [showScrollPopup, setShowScrollPopup] = useState(false);
  const [showTimerPopup, setShowTimerPopup] = useState(false);
  const [popupOverlayActive, setPopupOverlayActive] = useState(false);

  // Refs for tracking state inside event listeners
  const popupState = useRef({
    shownThisSession: false,
    converted: false,
    ctaClicked: false,
    exitIntentReady: false,
  });

  // --- Effects ---

  // 1. Initial Setup & Global Listeners
  useEffect(() => {
    // Check local storage for conversion
    if (typeof window !== 'undefined') {
      popupState.current.converted = localStorage.getItem('biflow_converted') === 'true';
    }

    // Scroll Listener for Navbar
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 60);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // 2. Reveal Animations (Scroll Reveal)
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    );

    document.querySelectorAll('.reveal').forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, []);

  // 3. Counter Animations
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.target instanceof HTMLElement) {
            const counter = entry.target;
            const targetVal = parseInt(counter.dataset.target || '0');
            const prefix = counter.dataset.prefix || '';
            animateCounter(counter, targetVal, prefix);
            observer.unobserve(counter);
          }
        });
      },
      { threshold: 0.5 }
    );

    document.querySelectorAll('.counter').forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, []);

  const animateCounter = (el: HTMLElement, target: number, prefix: string) => {
    const duration = 2000;
    const startTime = performance.now();

    const update = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(eased * target);
      el.textContent = prefix + current.toLocaleString('es-AR');
      if (progress < 1) {
        requestAnimationFrame(update);
      }
    };
    requestAnimationFrame(update);
  };

  // 4. Hero Particles
  useEffect(() => {
    const container = document.getElementById('heroParticles');
    if (!container) return;

    // Clear existing particles if any (React strict mode might double render)
    container.innerHTML = '';

    const fragment = document.createDocumentFragment();
    for (let i = 0; i < 20; i++) {
      const particle = document.createElement('div');
      // Random values
      const width = Math.random() * 3 + 1;
      const height = Math.random() * 3 + 1;
      const opacity = Math.random() * 0.3 + 0.1;
      const top = Math.random() * 100;
      const left = Math.random() * 100;
      const animDuration = Math.random() * 8 + 6;
      const animDelay = Math.random() * 5;
      const tx1 = Math.random() * 40 - 20;
      const ty1 = Math.random() * -60 - 20;
      const tx2 = Math.random() * 60 - 30;
      const ty2 = Math.random() * -40 - 10;
      const tx3 = Math.random() * 20 - 10;
      const ty3 = Math.random() * -80 - 20;

      // Inline styles for the particle
      particle.style.position = 'absolute';
      particle.style.width = `${width}px`;
      particle.style.height = `${height}px`;
      particle.style.background = `rgba(0, 214, 143, ${opacity})`;
      particle.style.borderRadius = '50%';
      particle.style.top = `${top}%`;
      particle.style.left = `${left}%`;
      particle.style.animation = `particleFloat-${i} ${animDuration}s ease-in-out infinite`;
      particle.style.animationDelay = `${animDelay}s`;

      // We need unique keyframes for each particle to match the chaotic effect
      const style = document.createElement('style');
      style.textContent = `
        @keyframes particleFloat-${i} {
          0%, 100% { transform: translate(0, 0) scale(1); opacity: 0.3; }
          25% { transform: translate(${tx1}px, ${ty1}px) scale(1.5); opacity: 0.7; }
          50% { transform: translate(${tx2}px, ${ty2}px) scale(1); opacity: 0.4; }
          75% { transform: translate(${tx3}px, ${ty3}px) scale(1.3); opacity: 0.6; }
        }
      `;
      document.head.appendChild(style);
      fragment.appendChild(particle);
    }
    container.appendChild(fragment);
  }, []);

  // 5. Popup Logic
  useEffect(() => {
    // Helper: Was recently dismissed?
    const wasRecentlyDismissed = (popupId: string, daysThreshold: number) => {
      const dismissedAt = localStorage.getItem(`biflow_popup_${popupId}_dismissed`);
      if (!dismissedAt) return false;
      const daysSince = (Date.now() - parseInt(dismissedAt)) / (1000 * 60 * 60 * 24);
      return daysSince < daysThreshold;
    };

    // Helper: Show Popup
    const triggerPopup = (type: 'exit' | 'scroll' | 'timer') => {
      if (popupState.current.shownThisSession || popupState.current.converted || popupState.current.ctaClicked) return;

      popupState.current.shownThisSession = true;
      if (type === 'exit') {
        setShowExitPopup(true);
        setPopupOverlayActive(true);
      } else if (type === 'scroll') {
        setShowScrollPopup(true);
      } else if (type === 'timer') {
        setShowTimerPopup(true);
        setPopupOverlayActive(true);
      }
    };

    // A. Exit Intent (15s delay to arm)
    if (!popupState.current.converted && !wasRecentlyDismissed('popupExitIntent', 7)) {
      setTimeout(() => {
        popupState.current.exitIntentReady = true;
      }, 15000);

      const handleMouseLeave = (e: MouseEvent) => {
        if (
          e.clientY <= 0 &&
          popupState.current.exitIntentReady &&
          !popupState.current.shownThisSession &&
          !popupState.current.ctaClicked
        ) {
          triggerPopup('exit');
        }
      };
      document.addEventListener('mouseleave', handleMouseLeave);
      return () => document.removeEventListener('mouseleave', handleMouseLeave);
    }

    // B. Timer (45s)
    if (!popupState.current.converted && !localStorage.getItem('biflow_popup_popupTimedelay_shown_ever')) {
      const timer = setTimeout(() => {
        if (!popupState.current.shownThisSession && !popupState.current.ctaClicked && !popupState.current.converted) {
          triggerPopup('timer');
          localStorage.setItem('biflow_popup_popupTimedelay_shown_ever', 'true');
        }
      }, 45000); // 45s
      return () => clearTimeout(timer);
    }

    // C. Scroll (50%)
    if (!popupState.current.converted && !wasRecentlyDismissed('popupScroll', 14)) {
      let scrollTriggered = false;
      const handleScrollPopup = () => {
        if (scrollTriggered || popupState.current.shownThisSession || popupState.current.ctaClicked) return;

        const scrollTop = window.scrollY;
        const docHeight = document.documentElement.scrollHeight - window.innerHeight;
        const scrollPercent = (scrollTop / docHeight) * 100;

        if (scrollPercent >= 50 && scrollPercent < 80) {
          scrollTriggered = true;
          setTimeout(() => {
            if (!popupState.current.shownThisSession && !popupState.current.ctaClicked) {
              triggerPopup('scroll');
            }
          }, 2000);
        }
      };
      window.addEventListener('scroll', handleScrollPopup, { passive: true });
      return () => window.removeEventListener('scroll', handleScrollPopup);
    }
  }, []);

  // --- Handlers ---

  const handleCtaClick = () => {
    popupState.current.ctaClicked = true;
  };

  const closePopups = () => {
    setShowExitPopup(false);
    setShowScrollPopup(false);
    setShowTimerPopup(false);
    setPopupOverlayActive(false);
  };

  const dismissPopup = (id: string) => {
    localStorage.setItem(`biflow_popup_${id}_dismissed`, Date.now().toString());
    closePopups();
  };

  const toggleFaq = (index: number) => {
    setActiveFaq(activeFaq === index ? null : index);
  };

  // Smooth scroll handler
  const handleSmoothScroll = (e: React.MouseEvent<HTMLAnchorElement, MouseEvent>, href: string) => {
    e.preventDefault();
    if (href === '#') return;
    const target = document.querySelector(href);
    if (target) {
      closePopups();
      setIsMenuOpen(false);
      const navbarHeight = 80; // approx
      const targetPosition = target.getBoundingClientRect().top + window.scrollY - navbarHeight;
      window.scrollTo({ top: targetPosition, behavior: 'smooth' });
    }
  };

  return (
    <div className="font-sans text-white bg-[--bg-primary]">
      {/* ───────────── NAVBAR ───────────── */}
      <nav className={`navbar ${isScrolled ? 'scrolled' : ''}`} id="navbar">
        <div className="container navbar__inner">
          <Link href="/" className="navbar__logo">
            <span className="logo-icon">◈</span> BiFlow<span className="logo-accent">Finance</span>
          </Link>
          <ul className={`navbar__links ${isMenuOpen ? 'open' : ''}`} id="navLinks">
            <li><a href="#beneficios" onClick={(e) => handleSmoothScroll(e, '#beneficios')}>Beneficios</a></li>
            <li><a href="#como-funciona" onClick={(e) => handleSmoothScroll(e, '#como-funciona')}>Cómo funciona</a></li>
            <li><a href="#pricing" onClick={(e) => handleSmoothScroll(e, '#pricing')}>Planes</a></li>
            <li><a href="#faq" onClick={(e) => handleSmoothScroll(e, '#faq')}>FAQ</a></li>
            <li><Link href="/login" className="navbar__login">Ingresar</Link></li>
            <li><a href="#cta-final" className="navbar__cta" onClick={(e) => { handleSmoothScroll(e, '#cta-final'); handleCtaClick(); }}>Auditoría gratuita</a></li>
          </ul>
          <button
            className={`navbar__hamburger ${isMenuOpen ? 'active' : ''}`}
            id="hamburger"
            aria-label="Menú"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
          >
            <span></span><span></span><span></span>
          </button>
        </div>
      </nav>

      {/* Overlay for mobile menu */}
      <div
        className={`nav-overlay ${isMenuOpen ? 'active' : ''}`}
        onClick={() => setIsMenuOpen(false)}
      ></div>

      {/* ───────────── HERO ───────────── */}
      <header className="hero" id="hero">
        <div className="hero__bg-glow"></div>
        <div className="hero__particles" id="heroParticles">
          {/* Particles injected via useEffect */}
        </div>
        <div className="container hero__content">
          <div className="hero__badge">Inteligencia Artificial Financiera · Tu Director Financiero con IA</div>
          <h1 className="hero__headline">
            Las PyMEs argentinas pierden entre <span className="highlight">2% y 5%</span> de su facturación en fugas de caja
            que nadie audita.<br />
            <span className="hero__headline-accent">¿Cuánto se escapa de la tuya?</span>
          </h1>
          <p className="hero__sub">
            Comisiones que tu banco cambió sin avisarte. Retenciones de IIBB y SIRCREB que llevan meses sin reclamar. Lotes
            de pagos que subiste a Interbanking sin cruzar contra cheques entrantes. Saldos parados en cuenta corriente que
            la inflación devora día a día. BiFlow usa inteligencia artificial para procesar tus archivos Interbanking y planillas financieras — detecta cada
            peso que se escapa y simula tus pagos antes de ejecutarlos. Es como tener un director financiero con IA
            trabajando 24/7 sobre tu caja. Sin claves bancarias. Sin integración técnica. Subís
            tus archivos y en 5&nbsp;minutos tienes el diagnóstico.
          </p>
          <div className="hero__actions">
            <a href="#cta-final" className="btn btn--primary btn--lg" id="heroCta" onClick={(e) => { handleSmoothScroll(e, '#cta-final'); handleCtaClick(); }}>
              Quiero ver cuánto pierde mi caja
              <span className="btn__arrow">→</span>
            </a>
          </div>
          <p className="hero__trust-line">Sin tarjeta de crédito · Sin claves bancarias · Primer informe en 5 minutos</p>
        </div>
      </header>

      {/* ───────────── SOCIAL PROOF BAR ───────────── */}
      <section className="social-proof-bar" id="social-proof">
        <div className="container">
          <div className="social-proof-bar__quote">
            &quot;Ya auditamos la caja de +120 PyMEs argentinas y detectamos fugas en el 78% de ellas.&quot;
          </div>
          <div className="social-proof-bar__metrics">
            <div className="metric">
              <span className="metric__number counter" data-target="15000" data-prefix="+">0</span>
              <span className="metric__label">Archivos procesados</span>
            </div>
            <div className="metric__divider"></div>
            <div className="metric">
              <span className="metric__number counter" data-target="120" data-prefix="+">0</span>
              <span className="metric__label">PyMEs auditadas</span>
            </div>
            <div className="metric__divider"></div>
            <div className="metric">
              <span className="metric__number">2,8%</span>
              <span className="metric__label">Fugas promedio detectadas</span>
            </div>
          </div>
        </div>
      </section>

      {/* ───────────── BENEFICIO 1: AUDITORÍA ───────────── */}
      <section className="benefit" id="beneficios">
        <div className="container benefit__inner reveal">
          <div className="benefit__icon-wrap">
            <div className="benefit__icon">🛡️</div>
            <span className="benefit__label">Auditoría y Control de Fugas</span>
          </div>
          <div className="benefit__content">
            <h2 className="benefit__title">
              El <span className="highlight">78% de las PyMEs</span> que auditamos tenían al menos 3 tipos de fuga activa.
              Comisiones mal cobradas, pagos duplicados y retenciones sin reclamar — todo en el mismo mes.
            </h2>
            <p className="benefit__body">
              Tu contador revisa los números una vez cada 30 días. En esos 30 días, las retenciones de IIBB y SIRCREB se
              acumulan sin reclamo — son créditos fiscales a tu favor que prescribirán si nadie los gestiona. Las comisiones
              bancarias aumentan sin aviso y nadie las cruza contra el acuerdo comercial firmado. Los pagos duplicados por
              error de carga se procesan sin control. Tu responsable de finanzas lo sabe, pero auditar cada línea de cada
              extracto de cada
              banco, cada día, es físicamente imposible.
            </p>
            <p className="benefit__body benefit__body--solution">
              Nuestra IA procesa tus archivos Interbanking y planillas de movimientos, comparando cada operación contra tus acuerdos
              comerciales y registros anteriores. Detecta anomalías en segundos — pagos duplicados, comisiones que no
              coinciden con lo pactado, retenciones impositivas que puedes reclamar — y te entrega un informe con acciones
              concretas: qué reclamar, a qué banco, por cuánto.
            </p>
            <ul className="benefit__bullets">
              <li>
                <span className="bullet-icon">◆</span>
                <div><strong>Detección de duplicados</strong> — Identifica pagos con montos idénticos al mismo destino en
                  ventanas de 7, 15 y 30 días.</div>
              </li>
              <li>
                <span className="bullet-icon">◆</span>
                <div><strong>Auditoría de comisiones</strong> — Cruza cada cargo bancario contra tus convenios vigentes. Si
                  el banco te cobró de más, lo señala con monto y fecha.</div>
              </li>
              <li>
                <span className="bullet-icon">◆</span>
                <div><strong>Radar de créditos fiscales</strong> — Extrae y consolida retenciones de IIBB, SIRCREB y
                  Ganancias para que tu contador las compense antes de que prescriban.</div>
              </li>
            </ul>
            <p className="benefit__urgency">
              ⚠️ Tus retenciones de IIBB acumuladas tienen fecha de vencimiento. Cada mes sin reclamarlas es un mes más
              cerca de perderlas.
            </p>
            <a href="#cta-final" className="btn btn--secondary" onClick={(e) => { handleSmoothScroll(e, '#cta-final'); handleCtaClick(); }}>
              Descubrí qué fugas tiene tu caja hoy <span className="btn__arrow">→</span>
            </a>
          </div>
        </div>
      </section>

      {/* ───────────── TESTIMONIAL / CASO DE USO ───────────── */}
      <section className="testimonials" id="testimonios">
        <div className="container">
          <div className="testimonials__grid reveal">
            {/* Testimonio Dueño */}
            <div className="testimonial-card">
              <div className="testimonial-card__quote">
                &quot;Pensábamos que nuestro contador controlaba todo. BiFlow encontró $340.000 en retenciones de IIBB sin
                reclamar en nuestros primeros 3 extractos. Recuperamos eso en el primer mes — mucho más de lo que cuesta el
                plan.&quot;
              </div>
              <div className="testimonial-card__author">
                <div className="testimonial-card__avatar">MR</div>
                <div>
                  <div className="testimonial-card__name">Martín R.</div>
                  <div className="testimonial-card__role">Dueño · Distribuidora industrial · 32 empleados</div>
                </div>
              </div>
            </div>
            {/* Testimonio CFO */}
            <div className="testimonial-card">
              <div className="testimonial-card__quote">
                &quot;El módulo de comisiones bancarias se pagó solo. Identificamos cobros de mantenimiento en cuentas que
                deberían ser bonificadas. El banco nos devolvió la diferencia sin chistar.&quot;
              </div>
              <div className="testimonial-card__author">
                <div className="testimonial-card__avatar">LC</div>
                <div>
                  <div className="testimonial-card__name">Laura C.</div>
                  <div className="testimonial-card__role">Gerente Financiera · Empresa de servicios · 58 empleados</div>
                </div>
              </div>
            </div>
            {/* Caso numérico */}
            <div className="testimonial-card testimonial-card--case">
              <div className="testimonial-card__tag">CASO REAL</div>
              <div className="testimonial-card__case-title">PyME industrial · 45 empleados · 6 bancos</div>
              <div className="testimonial-card__case-stats">
                <div className="case-stat">
                  <span className="case-stat__value">$890.000</span>
                  <span className="case-stat__label">Fugas detectadas / mes</span>
                </div>
                <div className="case-stat">
                  <span className="case-stat__value">$2.670.000</span>
                  <span className="case-stat__label">Recuperados en 90 días</span>
                </div>
                <div className="case-stat">
                  <span className="case-stat__value">7,4x</span>
                  <span className="case-stat__label">ROI sobre Plan Pro</span>
                </div>
              </div>
              <div className="testimonial-card__quote testimonial-card__quote--small">
                &quot;Sabíamos que algo se escapaba, pero no teníamos tiempo de auditar cada extracto. BiFlow lo encontró en la
                primera carga de archivos.&quot;
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ───────────── BENEFICIO 2: SIMULADOR + LIQUIDEZ ───────────── */}
      <section className="benefit benefit--alt">
        <div className="container benefit__inner reveal">
          <div className="benefit__icon-wrap">
            <div className="benefit__icon">🚦</div>
            <span className="benefit__label">Simulador de Cash Flow + Liquidez</span>
          </div>
          <div className="benefit__content">
            <h2 className="benefit__title">
              Cada lote de pagos que subís a Interbanking sin simular es una apuesta contra tu saldo. <span
                className="highlight">Y cada peso parado en cuenta corriente pierde 0,5% de valor por semana.</span>
            </h2>
            <p className="benefit__body">
              Hoy armas el lote de pagos con el saldo que ves en pantalla — el de ayer. No cruzas contra el cheque de $2M
              que se acredita mañana ni contra la cobranza que entra en 48&nbsp;horas. Esa decisión con datos viejos te
              obliga a mantener colchones de liquidez innecesarios. Los $5M que dejás &quot;por las dudas&quot; en cuenta corriente
              sin remunerar pierden poder adquisitivo cada día. En un mes, esos $5M ya compran lo que compraban $4,75M.
            </p>
            <p className="benefit__body benefit__body--solution">
              La inteligencia artificial de BiFlow intercepta tu archivo de pagos antes de la ejecución. Cruza cada egreso
              contra fondos por ingresar,
              cheques en cartera y vencimientos próximos. Te devuelve un borrador optimizado: qué pagar hoy, qué postergar
              48hs, qué agrupar para reducir comisiones. Y sobre el excedente real — el dinero que no necesitas en las
              próximas 72&nbsp;horas — te sugiere colocación inmediata en Money Market para que tu capital trabaje en lugar
              de devaluarse.
            </p>
            <ul className="benefit__bullets">
              <li>
                <span className="bullet-icon">◆</span>
                <div><strong>Stress Test pre-upload</strong> — Simula el impacto del lote completo sobre tu saldo proyectado
                  a 72 horas, cruzando ingresos confirmados y probables.</div>
              </li>
              <li>
                <span className="bullet-icon">◆</span>
                <div><strong>Reordenamiento de prioridades</strong> — Sugiere qué pagos adelantar (proveedores con
                  descuento) y cuáles postergar sin penalidad, maximizando la caja disponible.</div>
              </li>
              <li>
                <span className="bullet-icon">◆</span>
                <div><strong>Alerta de saldos ociosos</strong> — Te avisa cuando el saldo excede el colchón operativo
                  necesario y calcula cuánto perderías por no colocarlo.</div>
              </li>
            </ul>
            <a href="#cta-final" className="btn btn--secondary" onClick={(e) => { handleSmoothScroll(e, '#cta-final'); handleCtaClick(); }}>
              Simula tu próximo lote antes de subirlo <span className="btn__arrow">→</span>
            </a>
          </div>
        </div>
      </section>

      {/* ───────────── BENEFICIO 3: VISIBILIDAD + RIESGO ───────────── */}
      <section className="benefit">
        <div className="container benefit__inner reveal">
          <div className="benefit__icon-wrap">
            <div className="benefit__icon">👁️</div>
            <span className="benefit__label">Visibilidad Total + Monitoreo de Riesgo</span>
          </div>
          <div className="benefit__content">
            <h2 className="benefit__title">
              Tu responsable de finanzas dedica <span className="highlight">6 horas semanales</span> a descargar extractos y
              armar reportes.
              Mientras tanto, aceptas echeqs de clientes que ya figuran en categoría 3 del BCRA.
            </h2>
            <p className="benefit__body">
              &quot;¿Cómo estamos de caja?&quot; El dueño hace esa pregunta y recibe un Excel armado a mano, con datos del jueves
              pasado, sin visibilidad sobre retenciones pendientes ni cheques por vencer. El reporte llega 3 días tarde.
              Peor: mientras tu equipo concilia datos manualmente, la empresa acepta cheques y echeqs de clientes cuya
              situación crediticia cambió la semana pasada — y nadie lo sabe hasta que el cheque rebota.
            </p>
            <p className="benefit__body benefit__body--solution">
              La IA de BiFlow centraliza todos tus bancos en un dashboard único. Genera un &quot;Reporte de 1 Minuto&quot; diario con
              3&nbsp;cifras: salud de caja (pesos disponibles vs. compromisos próximos), riesgos detectados (fugas,
              vencimientos, contrapartes deterioradas) y oportunidades de mejora (saldos ociosos, retenciones recuperables).
              El dueño abre, lee, decide — en 60&nbsp;segundos. Y con el monitoreo de riesgo, BiFlow vigila cada CUIT de
              tus clientes en la Central de Deudores del BCRA y te alerta el mismo día que una contraparte baja de categoría.
            </p>
            <ul className="benefit__bullets">
              <li>
                <span className="bullet-icon">◆</span>
                <div><strong>Dashboard multibanco en tiempo real</strong> — Saldos, movimientos y posición consolidada de
                  cada banco, actualizados con cada extracto que subís. Sin tokens ni claves.</div>
              </li>
              <li>
                <span className="bullet-icon">◆</span>
                <div><strong>Reporte de 1 Minuto</strong> — 3 indicadores ejecutivos enviados al dueño cada mañana: salud,
                  riesgo y oportunidades. No espera al cierre mensual.</div>
              </li>
              <li>
                <span className="bullet-icon">◆</span>
                <div><strong>Alerta de deterioro de contraparte</strong> — Si un cliente que te debe $1M pasa de categoría 1
                  a 3 en el BCRA, lo sabes antes de aceptar su próximo cheque.</div>
              </li>
            </ul>
            <a href="#cta-final" className="btn btn--secondary" onClick={(e) => { handleSmoothScroll(e, '#cta-final'); handleCtaClick(); }}>
              Genera tu primer reporte ejecutivo <span className="btn__arrow">→</span>
            </a>
          </div>
        </div>
      </section>

      {/* ───────────── COMPARACIÓN VS STATUS QUO ───────────── */}
      <section className="comparison" id="comparacion">
        <div className="container">
          <div className="comparison__header reveal">
            <h2 className="comparison__title">Tu operación actual vs. BiFlow</h2>
            <p className="comparison__sub">¿Cómo gestionas tu caja hoy? Compará con lo que podrías tener.</p>
          </div>
          <div className="comparison__table-wrap reveal">
            <table className="comparison__table">
              <thead>
                <tr>
                  <th>Capacidad</th>
                  <th className="comparison__col--old">Excel / ERP actual</th>
                  <th className="comparison__col--new">BiFlow Finance</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Auditoría de comisiones bancarias</td>
                  <td className="comparison__col--old">Manual, 1 vez por mes</td>
                  <td className="comparison__col--new">Automática, 24/7</td>
                </tr>
                <tr>
                  <td>Detección de pagos duplicados</td>
                  <td className="comparison__col--old">Si alguien lo nota</td>
                  <td className="comparison__col--new">Algorítmica, en cada carga</td>
                </tr>
                <tr>
                  <td>Reclamo de retenciones (IIBB/SIRCREB)</td>
                  <td className="comparison__col--old">Depende del contador</td>
                  <td className="comparison__col--new">Radar automático + alertas</td>
                </tr>
                <tr>
                  <td>Simulación de flujo de pagos</td>
                  <td className="comparison__col--old">No existe</td>
                  <td className="comparison__col--new">Stress test pre-upload</td>
                </tr>
                <tr>
                  <td>Optimización de saldos ociosos</td>
                  <td className="comparison__col--old">No existe</td>
                  <td className="comparison__col--new">Alerta + sugerencia de colocación</td>
                </tr>
                <tr>
                  <td>Monitoreo de riesgo de contraparte</td>
                  <td className="comparison__col--old">Consulta manual BCRA</td>
                  <td className="comparison__col--new">Vigilancia automática de CUITs</td>
                </tr>
                <tr>
                  <td>Dashboard consolidado multi-banco</td>
                  <td className="comparison__col--old">Excel manual, datos viejos</td>
                  <td className="comparison__col--new">Tiempo real, sin claves</td>
                </tr>
                <tr>
                  <td>Reporte ejecutivo para el dueño</td>
                  <td className="comparison__col--old">Pedirlo y esperar</td>
                  <td className="comparison__col--new">Reporte de 1 Minuto, cada mañana</td>
                </tr>
                <tr>
                  <td>Tiempo de setup</td>
                  <td className="comparison__col--old">Semanas de implementación</td>
                  <td className="comparison__col--new">5 minutos, sin equipo técnico</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ───────────── CÓMO FUNCIONA ───────────── */}
      <section className="how-it-works" id="como-funciona">
        <div className="container">
          <div className="how-it-works__header reveal">
            <h2 className="how-it-works__title">De cero a diagnóstico en 3 pasos y 5 minutos. <span className="highlight">Sin equipo técnico. Sin permisos bancarios.</span></h2>
            <p className="how-it-works__sub">BiFlow no pide claves bancarias, no instala nada en tus servidores y no ejecuta transacciones. Solo lee los archivos que tu banco ya te entrega — y te muestra lo que encuentra.</p>
          </div>
          <div className="steps reveal">
            <div className="step">
              <div className="step__number">1</div>
              <h3 className="step__title">Registrate <span className="step__time">(30 seg)</span></h3>
              <p className="step__desc">Nombre, email y teléfono. Verificamos tu correo y activamos tu cuenta de prueba al instante.</p>
            </div>
            <div className="step__connector"></div>
            <div className="step">
              <div className="step__number">2</div>
              <h3 className="step__title">Subí tus archivos <span className="step__time">(2 min)</span></h3>
              <p className="step__desc">Arrastra tus archivos de Interbanking (.dat/.txt) y tu listado de CUITs a tu centro de comando privado.</p>
            </div>
            <div className="step__connector"></div>
            <div className="step">
              <div className="step__number">3</div>
              <h3 className="step__title">Recibí el diagnóstico <span className="step__time">(3 min)</span></h3>
              <p className="step__desc">Nuestra IA analiza tus archivos y te entrega: fugas detectadas con montos, simulación de tu próximo lote de pagos y estado de riesgo de cada contraparte.</p>
            </div>
          </div>
          <div className="how-it-works__cta reveal">
            <a href="#cta-final" className="btn btn--secondary" onClick={(e) => { handleSmoothScroll(e, '#cta-final'); handleCtaClick(); }}>
              Empezá tu auditoría gratuita ahora <span className="btn__arrow">→</span>
            </a>
          </div>
        </div>
      </section>

      {/* ───────────── PRICING ───────────── */}
      <section className="pricing" id="pricing">
        <div className="container">
          <div className="pricing__header reveal">
            <h2 className="pricing__title">
              Desde USD 50/mes. Si tu auditoría gratuita no encuentra fugas por encima de esa cifra, no pagas.
            </h2>
            <p className="pricing__sub">
              Cada plan arranca con una auditoría forense gratuita sobre tus archivos reales. Sin datos de prueba. Sin demos genéricas. Ves las fugas de tu empresa — con montos, fechas y bancos — antes de pagar un peso. Sin permanencia. Sin letra chica.
            </p>
          </div>

          <div className="pricing__grid reveal">
            {/* Starter */}
            <div className="pricing-card">
              <div className="pricing-card__header">
                <h3 className="pricing-card__name">Starter</h3>
                <div className="pricing-card__price">
                  <span className="pricing-card__currency">USD</span>
                  <span className="pricing-card__amount">50</span>
                  <span className="pricing-card__period">/mes</span>
                </div>
                <p className="pricing-card__desc">Para PyMEs con hasta 5 cuentas bancarias que hoy no auditan su caja.</p>
              </div>
              <ul className="pricing-card__features">
                <li>Procesamiento de archivos Interbanking (.dat/.txt) y planillas Excel</li>
                <li>Detección de comisiones indebidas y pagos duplicados</li>
                <li>Monitoreo de retenciones impositivas (IIBB, SIRCREB)</li>
                <li>Dashboard de flujo de caja consolidado</li>
                <li>Reporte de 1 Minuto diario para el dueño</li>
                <li>Soporte por email en menos de 24h</li>
              </ul>
              <a href="#cta-final" className="btn btn--outline btn--full" onClick={(e) => { handleSmoothScroll(e, '#cta-final'); handleCtaClick(); }}>
                Ver qué fugas detecta Starter →
              </a>
            </div>

            {/* Pro */}
            <div className="pricing-card pricing-card--featured">
              <div className="pricing-card__badge">⭐ Más elegido</div>
              <div className="pricing-card__header">
                <h3 className="pricing-card__name">Pro</h3>
                <div className="pricing-card__price">
                  <span className="pricing-card__currency">USD</span>
                  <span className="pricing-card__amount">120</span>
                  <span className="pricing-card__period">/mes</span>
                </div>
                <p className="pricing-card__desc">Para empresas con 6+ bancos que necesitan simular pagos, optimizar liquidez y monitorear contrapartes.</p>
              </div>
              <ul className="pricing-card__features">
                <li>Todo lo de Starter, más:</li>
                <li>Cuentas bancarias ilimitadas</li>
                <li>Simulador de Cash Flow: stress test de lotes contra ingresos pendientes</li>
                <li>Alerta de saldos ociosos + sugerencia de colocación en Money Market</li>
                <li>Monitoreo de CUITs en Central de Deudores (BCRA) con alertas de deterioro</li>
                <li>Alertas con montos, bancos y acciones específicas</li>
                <li>Reportes semanales: fugas detectadas, evitadas y ahorro acumulado</li>
                <li>Soporte prioritario en menos de 4h</li>
              </ul>
              <a href="#cta-final" className="btn btn--primary btn--full" onClick={(e) => { handleSmoothScroll(e, '#cta-final'); handleCtaClick(); }}>
                Ver qué fugas detecta Pro →
              </a>
            </div>

            {/* Enterprise */}
            <div className="pricing-card">
              <div className="pricing-card__header">
                <h3 className="pricing-card__name">Enterprise</h3>
                <div className="pricing-card__price">
                  <span className="pricing-card__amount pricing-card__amount--custom">A medida</span>
                </div>
                <p className="pricing-card__desc">Para grupos con 3+ razones sociales que necesitan un centro de comando financiero unificado.</p>
              </div>
              <ul className="pricing-card__features">
                <li>Todo lo de Pro, más:</li>
                <li>Consolidación multi-empresa con auditoría cruzada entre razones sociales</li>
                <li>Validación de escenarios financieros por empresa y consolidados</li>
                <li>API de integración con tu ERP existente</li>
                <li>Onboarding 1:1 con un especialista en tesorería</li>
                <li>SLA de soporte dedicado con canal directo</li>
                <li>Reportes ejecutivos a medida para directorio</li>
              </ul>
              <a href="#cta-final" className="btn btn--outline btn--full" onClick={(e) => { handleSmoothScroll(e, '#cta-final'); handleCtaClick(); }}>
                Hablar con un especialista →
              </a>
            </div>
          </div>

          <p className="pricing__note reveal">
            ¿No sabes cuánto pierdes por mes? Tu auditoría gratuita escanea archivos reales de tu empresa y te da el número exacto — con detalle de cada fuga, monto y banco.
            <a href="#cta-final" className="pricing__note-link" onClick={(e) => { handleSmoothScroll(e, '#cta-final'); handleCtaClick(); }}>Descubrí tu número → Auditoría gratuita</a>
          </p>
        </div>
      </section>

      {/* ───────────── FAQ ───────────── */}
      <section className="faq" id="faq">
        <div className="container">
          <div className="faq__header reveal">
            <h2 className="faq__title">Preguntas frecuentes</h2>
          </div>
          <div className="faq__list reveal">
            {[
              {
                q: "¿Ya tengo un ERP — para qué necesito BiFlow?",
                a: "Tu ERP registra lo que pasó. BiFlow audita lo que pasa ahora y simula lo que va a pasar. Son complementarios. Tu ERP no cruza comisiones bancarias contra acuerdos comerciales, no detecta duplicados algorítmicamente y no simula flujos de pagos antes de ejecutarlos."
              },
              {
                q: "No confío en subir archivos financieros a una plataforma",
                a: "Procesamos archivos de solo lectura. No accedemos a cuentas ni ejecutamos transacciones. Tus datos viajan encriptados con AES-256 en tránsito y en reposo, y se eliminan cuando vos lo decidís. No pedimos claves bancarias ni credenciales de ningún tipo."
              },
              {
                q: "Mi contador ya se encarga de todo esto",
                a: "Tu contador revisa 1 vez por mes. BiFlow audita 24/7. Las fugas no esperan al cierre contable. Los pagos duplicados se acumulan, las comisiones indebidas se repiten y las retenciones prescriben — todo entre un cierre y el siguiente. BiFlow no reemplaza a tu contador: le da datos que hoy no tiene."
              },
              {
                q: "USD 50/mes es mucho para una PyME",
                a: "La auditoría gratuita te muestra cuánto pierdes por mes. Si las fugas detectadas no superan USD 50, no tiene sentido contratarnos — y te lo decimos. En el 78% de los casos, las fugas superan ampliamente el costo del plan. El ROI promedio es de 7x en los primeros 90 días."
              },
              {
                q: "¿Qué tan precisa es la detección de fugas?",
                a: "BiFlow procesa tus extractos bancarios reales — no estimaciones. Cada fuga que detecta incluye monto exacto, fecha, banco y tipo de anomalía. La auditoría gratuita te muestra resultados concretos con tus propios archivos antes de que pagues un peso."
              }
            ].map((item, index) => (
              <div className={`faq__item ${activeFaq === index ? 'active' : ''}`} key={index}>
                <button
                  className="faq__question"
                  aria-expanded={activeFaq === index}
                  onClick={() => toggleFaq(index)}
                >
                  <span>{item.q}</span>
                  <span className="faq__toggle">+</span>
                </button>
                <div className="faq__answer">
                  <p>{item.a}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ───────────── TRUST ───────────── */}
      <section className="trust" id="confianza">
        <div className="container trust__inner reveal">
          <div className="trust__icon">🔒</div>
          <h2 className="trust__title">Procesamos archivos de solo lectura. No accedemos a tus cuentas. No movemos un peso. Nunca.</h2>
          <p className="trust__body">
            BiFlow trabaja exclusivamente con los .dat, .txt y planillas Excel que tu banco ya te entrega. No pedimos credenciales
            bancarias. No ejecutamos transacciones. No tenemos acceso operativo a tu dinero. Tus datos viajan encriptados
            con AES-256 en tránsito y en reposo, y se eliminan cuando vos lo decidís. No instalamos nada en tus servidores.
            Solo leemos los archivos — y te mostramos lo que encontramos.
          </p>
          <div className="trust__badges">
            <div className="trust__badge-item">
              <span className="trust__badge-icon">🔐</span>
              <span>AES-256 (tránsito y reposo)</span>
            </div>
            <div className="trust__badge-item">
              <span className="trust__badge-icon">📄</span>
              <span>Solo lectura — cero escritura</span>
            </div>
            <div className="trust__badge-item">
              <span className="trust__badge-icon">🚫</span>
              <span>Sin credenciales bancarias</span>
            </div>
            <div className="trust__badge-item">
              <span className="trust__badge-icon">🗑️</span>
              <span>Eliminación bajo tu control</span>
            </div>
          </div>
          <div className="trust__cta">
            <a href="#cta-final" className="btn btn--secondary" onClick={(e) => { handleSmoothScroll(e, '#cta-final'); handleCtaClick(); }}>
              Probá la auditoría gratuita con total seguridad <span className="btn__arrow">→</span>
            </a>
          </div>
        </div>
      </section>

      {/* ───────────── CTA FINAL ───────────── */}
      <section className="cta-final" id="cta-final">
        <div className="container cta-final__inner reveal">
          <h2 className="cta-final__title">
            Ahora mismo hay fugas activas en tu caja. Retenciones sin reclamar. Comisiones mal cobradas. Saldos que se devalúan.<br />
            <span className="cta-final__accent">En 5 minutos puedes ver cuáles son y cuánto te cuestan.</span>
          </h2>
          <p className="cta-final__body">
            Cada día sin auditoría es un día más de retenciones que prescriben, comisiones que se acumulan y saldos que
            pierden valor. No necesitas instalar nada, ni dar claves, ni esperar a tu contador. Subí tus archivos, mirá el
            informe forense con montos reales y empezá a decidir con datos de hoy — no del mes pasado.
          </p>

          <div className="cta-form-container">
            <div className="cta-form bg-[--bg-card] border border-[--border] rounded-[--radius-xl] p-8 backdrop-blur-md text-left">
              <div className="cta-form__fields grid grid-cols-1 gap-4 mb-5">
                <div className="cta-form__group flex flex-col gap-2">
                  <label htmlFor="ctaName" className="cta-form__label text-xs font-semibold text-[--text-muted] uppercase tracking-wide">Nombre</label>
                  <input type="text" id="ctaName" name="name" className="cta-form__input p-3.5 bg-[--bg-primary] border border-[--border] rounded-[--radius-sm] text-[--text-primary] text-sm focus:border-[--accent] focus:ring-2 focus:ring-[--accent-glow] outline-none" placeholder="Tu nombre" />
                </div>
                <div className="cta-form__group flex flex-col gap-2">
                  <label htmlFor="ctaEmail" className="cta-form__label text-xs font-semibold text-[--text-muted] uppercase tracking-wide">Email corporativo</label>
                  <input type="email" id="ctaEmail" name="email" className="cta-form__input p-3.5 bg-[--bg-primary] border border-[--border] rounded-[--radius-sm] text-[--text-primary] text-sm focus:border-[--accent] focus:ring-2 focus:ring-[--accent-glow] outline-none" placeholder="tu@empresa.com" />
                </div>
                <div className="cta-form__group flex flex-col gap-2">
                  <label htmlFor="ctaPhone" className="cta-form__label text-xs font-semibold text-[--text-muted] uppercase tracking-wide">WhatsApp</label>
                  <input type="tel" id="ctaPhone" name="phone" className="cta-form__input p-3.5 bg-[--bg-primary] border border-[--border] rounded-[--radius-sm] text-[--text-primary] text-sm focus:border-[--accent] focus:ring-2 focus:ring-[--accent-glow] outline-none" placeholder="+54 11 ..." />
                </div>
              </div>
              <Link href="/login" className="btn btn--primary btn--lg btn--full w-full justify-center" onClick={handleCtaClick}>
                Quiero auditar mi caja ahora
                <span className="btn__arrow">→</span>
              </Link>
              <p className="cta-final__trust-line text-xs text-[--text-muted] mt-3 text-center">Sin tarjeta de crédito · Sin claves bancarias · Primer informe en 5 minutos</p>
            </div>
          </div>
        </div>
      </section>

      {/* ───────────── FOOTER ───────────── */}
      <footer className="footer">
        <div className="container footer__inner">
          <div className="footer__top">
            <div className="footer__brand">
              <span className="logo-icon">◈</span> BiFlow<span className="logo-accent">Finance</span>
              <p className="footer__tagline">Centro de Comando Financiero para PyMEs</p>
            </div>
            <div className="footer__links">
              <div className="footer__col">
                <h4>Producto</h4>
                <a href="#beneficios" onClick={(e) => handleSmoothScroll(e, '#beneficios')}>Auditoría de fugas</a>
                <a href="#beneficios" onClick={(e) => handleSmoothScroll(e, '#beneficios')}>Simulador de pagos</a>
                <a href="#beneficios" onClick={(e) => handleSmoothScroll(e, '#beneficios')}>Monitoreo de riesgo</a>
                <a href="#pricing" onClick={(e) => handleSmoothScroll(e, '#pricing')}>Planes y precios</a>
              </div>
              <div className="footer__col">
                <h4>Recursos</h4>
                <a href="#como-funciona" onClick={(e) => handleSmoothScroll(e, '#como-funciona')}>Cómo funciona</a>
                <a href="#faq" onClick={(e) => handleSmoothScroll(e, '#faq')}>Preguntas frecuentes</a>
                <a href="#confianza" onClick={(e) => handleSmoothScroll(e, '#confianza')}>Seguridad de datos</a>
              </div>
              <div className="footer__col">
                <h4>Empresa</h4>
                <a href="#">Contacto</a>
                <a href="#">Política de privacidad</a>
                <a href="#">Términos de servicio</a>
              </div>
            </div>
          </div>
          <div className="footer__bottom">
            <p className="footer__copy">© {new Date().getFullYear()} BiFlow Finance. Todos los derechos reservados.</p>
          </div>
        </div>
      </footer>

      {/* ───────────── POPUPS ───────────── */}

      {/* Overlay */}
      <div
        className={`popup-overlay ${popupOverlayActive ? 'active' : ''}`}
        id="popupOverlay"
        onClick={closePopups}
      ></div>

      {/* POPUP 1 — Exit-Intent */}
      <div className={`popup popup--modal ${showExitPopup ? 'active' : ''}`} id="popupExitIntent" role="dialog" aria-modal="true">
        <button className="popup__close" aria-label="Cerrar" onClick={() => dismissPopup('popupExitIntent')}>×</button>
        <div className="popup__icon">⚠️</div>
        <h3 className="popup__headline">Antes de irte: ¿sabés cuánto se fugó de tu caja este mes?</h3>
        <p className="popup__body">
          Comisiones indebidas. Retenciones de IIBB sin reclamar. Pagos duplicados que nadie detectó.
          Mientras operás sin auditoría, las fugas se acumulan día tras día.
        </p>
        <p className="popup__body">
          Subí un extracto bancario y en 5 minutos tenés el diagnóstico. Gratis. Sin tarjeta. Sin integración.
        </p>
        <p className="popup__cta-lead">Quiero mi diagnóstico de fugas</p>
        <Link href="/login" className="btn btn--primary btn--full popup__cta-primary justify-center" onClick={() => { handleCtaClick(); closePopups(); }}>
          Auditoría gratuita <span className="btn__arrow">→</span>
        </Link>
        <button className="popup__cta-secondary" onClick={() => dismissPopup('popupExitIntent')}>
          No, prefiero seguir sin auditar mi caja
        </button>
        <p className="popup__trust">✓ 5 min · ✓ Sin tarjeta · ✓ AES-256</p>
      </div>

      {/* POPUP 2 — Scroll 50% */}
      <div className={`popup popup--slide ${showScrollPopup ? 'active' : ''}`} id="popupScroll" role="dialog" aria-modal="false">
        <button className="popup__close" aria-label="Cerrar" onClick={() => dismissPopup('popupScroll')}>×</button>
        <div className="popup__tag">CASO REAL</div>
        <h3 className="popup__headline">Una PyME industrial de 45 empleados recuperó ARS $890.000 en retenciones no reclamadas en su primer mes con BiFlow.</h3>
        <div className="popup__findings">
          <div className="popup__finding">🔍 Retenciones de IIBB cobradas de más por 2 bancos</div>
          <div className="popup__finding">🔍 3 comisiones duplicadas (5 meses sin detectarse)</div>
          <div className="popup__finding">🔍 1 pago duplicado no identificado por el ERP</div>
        </div>
        <blockquote className="popup__quote">
          &quot;BiFlow lo encontró en la primera carga de archivos.&quot;
          <cite>— Gerente Financiero, PyME industrial</cite>
        </blockquote>
        <p className="popup__cta-lead">Descubrí qué se escapa de tu caja</p>
        <Link href="/login" className="btn btn--primary btn--full popup__cta-primary justify-center" onClick={() => { handleCtaClick(); closePopups(); }}>
          Auditoría gratuita <span className="btn__arrow">→</span>
        </Link>
        <a href="#testimonios" className="popup__cta-secondary-link" onClick={(e) => { handleSmoothScroll(e, '#testimonios'); dismissPopup('popupScroll'); }}>Ver más casos de estudio →</a>
      </div>

      {/* POPUP 3 — Time-Delayed 45s */}
      <div className={`popup popup--modal ${showTimerPopup ? 'active' : ''}`} id="popupTimedelay" role="dialog" aria-modal="true">
        <button className="popup__close" aria-label="Cerrar" onClick={() => dismissPopup('popupTimedelay')}>×</button>
        <div className="popup__offer-badge">🚀 OFERTA DE LANZAMIENTO</div>
        <h3 className="popup__headline">Primeras 50 empresas: 3 meses de Plan Pro al precio de Starter.</h3>
        <p className="popup__body">
          Estamos en fase de lanzamiento y buscamos 50 PyMEs que quieran probar la auditoría completa — con Borrador
          Inteligente, cruce contra Central de Deudores y alertas con montos — al precio del plan básico.
        </p>
        <ul className="popup__checklist">
          <li>✓ Auditoría forense inicial gratuita</li>
          <li>✓ 3 meses de Plan Pro (USD 120/mes) a precio de Starter (USD 50/mes)</li>
          <li>✓ Ahorro total: USD 210 durante el periodo</li>
          <li>✓ Sin permanencia — cancelás cuando quieras</li>
        </ul>
        <div className="popup__progress">
          <div className="popup__progress-bar">
            <div className="popup__progress-fill" style={{ width: '62%' }}></div>
          </div>
          <span className="popup__progress-text">Quedan 19 de 50 lugares</span>
        </div>
        <p className="popup__cta-lead">Quiero mi lugar</p>
        <Link href="/login" className="btn btn--primary btn--full popup__cta-primary justify-center" onClick={() => { handleCtaClick(); closePopups(); }}>
          Auditoría gratuita <span className="btn__arrow">→</span>
        </Link>
        <button className="popup__cta-secondary" onClick={() => dismissPopup('popupTimedelay')}>
          No, prefiero el precio regular
        </button>
        <p className="popup__legal">Oferta válida hasta completar las 50 plazas. Al finalizar los 3 meses, el plan pasa a tarfa Pro estándar. Podés cancelar o cambiar de plan en cualquier momento.</p>
      </div>

    </div>
  );
}
