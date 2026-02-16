/* ═══════════════════════════════════════════
   BiFlow Finance — JavaScript
   ═══════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {

    // ═══════════════════════════════════════════
    // SCROLL REVEAL (IntersectionObserver)
    // ═══════════════════════════════════════════
    const revealElements = document.querySelectorAll('.reveal');
    const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                revealObserver.unobserve(entry.target);
            }
        });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

    revealElements.forEach(el => revealObserver.observe(el));

    // ═══════════════════════════════════════════
    // NAVBAR
    // ═══════════════════════════════════════════
    const navbar = document.getElementById('navbar');

    window.addEventListener('scroll', () => {
        if (window.scrollY > 60) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    }, { passive: true });

    // Mobile menu
    const hamburger = document.getElementById('hamburger');
    const navLinks = document.getElementById('navLinks');

    const navOverlay = document.createElement('div');
    navOverlay.classList.add('nav-overlay');
    document.body.appendChild(navOverlay);

    function toggleMenu() {
        hamburger.classList.toggle('active');
        navLinks.classList.toggle('open');
        navOverlay.classList.toggle('active');
        document.body.style.overflow = navLinks.classList.contains('open') ? 'hidden' : '';
    }

    hamburger.addEventListener('click', toggleMenu);
    navOverlay.addEventListener('click', toggleMenu);

    navLinks.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => {
            if (navLinks.classList.contains('open')) toggleMenu();
        });
    });

    // ═══════════════════════════════════════════
    // SMOOTH SCROLL
    // ═══════════════════════════════════════════
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            const targetId = this.getAttribute('href');
            if (targetId === '#') return;
            const targetEl = document.querySelector(targetId);
            if (targetEl) {
                e.preventDefault();
                closeAllPopups();
                const offset = navbar.offsetHeight + 20;
                const targetPosition = targetEl.getBoundingClientRect().top + window.scrollY - offset;
                window.scrollTo({ top: targetPosition, behavior: 'smooth' });
            }
        });
    });

    // ═══════════════════════════════════════════
    // COUNTER ANIMATIONS (Social Proof)
    // ═══════════════════════════════════════════
    const counters = document.querySelectorAll('.counter');
    const counterObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const counter = entry.target;
                const target = parseInt(counter.dataset.target);
                const prefix = counter.dataset.prefix || '';
                animateCounter(counter, target, prefix);
                counterObserver.unobserve(counter);
            }
        });
    }, { threshold: 0.5 });

    counters.forEach(c => counterObserver.observe(c));

    function animateCounter(el, target, prefix) {
        const duration = 2000;
        const startTime = performance.now();

        function formatNumber(n) {
            return n.toLocaleString('es-AR');
        }

        function update(currentTime) {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            const current = Math.round(eased * target);
            el.textContent = prefix + formatNumber(current);
            if (progress < 1) {
                requestAnimationFrame(update);
            }
        }

        requestAnimationFrame(update);
    }

    // ═══════════════════════════════════════════
    // FAQ ACCORDION
    // ═══════════════════════════════════════════
    const faqItems = document.querySelectorAll('[data-faq]');

    faqItems.forEach(item => {
        const question = item.querySelector('.faq__question');
        question.addEventListener('click', () => {
            const isActive = item.classList.contains('active');

            // Close all others
            faqItems.forEach(other => {
                other.classList.remove('active');
                other.querySelector('.faq__question').setAttribute('aria-expanded', 'false');
            });

            // Toggle current
            if (!isActive) {
                item.classList.add('active');
                question.setAttribute('aria-expanded', 'true');
                // TRACKING: faq_item_open
            }
        });
    });

    // ═══════════════════════════════════════════
    // CTA FORM VALIDATION
    // ═══════════════════════════════════════════
    const ctaForm = document.getElementById('ctaForm');
    const ctaSuccess = document.getElementById('ctaSuccess');

    if (ctaForm) {
        ctaForm.addEventListener('submit', (e) => {
            e.preventDefault();

            const name = document.getElementById('ctaName');
            const email = document.getElementById('ctaEmail');
            const phone = document.getElementById('ctaPhone');

            let valid = true;

            // Reset errors
            [name, email, phone].forEach(f => f.classList.remove('error'));

            // Validate name
            if (!name.value.trim()) {
                name.classList.add('error');
                valid = false;
            }

            // Validate email
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email.value.trim())) {
                email.classList.add('error');
                valid = false;
            }

            // Validate phone
            if (!phone.value.trim() || phone.value.trim().length < 8) {
                phone.classList.add('error');
                valid = false;
            }

            if (valid) {
                // Redirigir directamente a la registración con los datos precargados
                const params = new URLSearchParams({
                    email: email.value.trim(),
                    name: name.value.trim(),
                    action: 'register'
                });

                // Simular una pequeña carga para feedback visual
                ctaSubmit.disabled = true;
                ctaSubmit.textContent = 'Preparando tu auditoría...';

                setTimeout(() => {
                    window.location.href = `app/login.html?${params.toString()}`;
                }, 800);
            }
        });

        // Real-time validation: remove error on input
        ['ctaName', 'ctaEmail', 'ctaPhone'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('input', () => el.classList.remove('error'));
            }
        });
    }

    // ═══════════════════════════════════════════
    // POPUP SYSTEM
    // ═══════════════════════════════════════════
    // Implements the rules from popup-strategy.md:
    // - 3 popups, mutually exclusive per session
    // - Priority: Exit-intent > Time-delayed > Scroll
    // - Exclusion: converted users, logged-in users, already-shown
    // - localStorage for frequency control

    const popupOverlay = document.getElementById('popupOverlay');
    const popupExitIntent = document.getElementById('popupExitIntent');
    const popupScroll = document.getElementById('popupScroll');
    const popupTimedelay = document.getElementById('popupTimedelay');

    const popupState = {
        shownThisSession: false,
        converted: localStorage.getItem('biflow_converted') === 'true',
        ctaClicked: false,
        timeOnPage: 0,
        scrollPercent: 0,
        exitIntentReady: false,
    };

    // Check if any popup was dismissed recently
    function wasRecentlyDismissed(popupId, daysThreshold) {
        const dismissedAt = localStorage.getItem(`biflow_popup_${popupId}_dismissed`);
        if (!dismissedAt) return false;
        const daysSince = (Date.now() - parseInt(dismissedAt)) / (1000 * 60 * 60 * 24);
        return daysSince < daysThreshold;
    }

    // Show a popup
    function showPopup(popupEl) {
        if (popupState.shownThisSession || popupState.converted || popupState.ctaClicked) return;

        popupEl.classList.add('active');
        if (popupEl.classList.contains('popup--modal')) {
            popupOverlay.classList.add('active');
        }
        popupState.shownThisSession = true;

        // Track impression
        const popupId = popupEl.id;
        // TRACKING: popup_impression (popupId)
    }

    // Close a specific popup
    function closePopup(popupEl) {
        popupEl.classList.remove('active');
        popupOverlay.classList.remove('active');

        // Record dismissal
        const popupId = popupEl.id;
        localStorage.setItem(`biflow_popup_${popupId}_dismissed`, Date.now().toString());

        // TRACKING: popup_close (popupId)
    }

    // Close all popups
    function closeAllPopups() {
        [popupExitIntent, popupScroll, popupTimedelay].forEach(p => {
            if (p && p.classList.contains('active')) {
                closePopup(p);
            }
        });
    }

    // Bind close buttons
    document.querySelectorAll('.popup__close').forEach(btn => {
        btn.addEventListener('click', () => {
            const popup = btn.closest('.popup');
            closePopup(popup);
        });
    });

    // Bind dismiss buttons (secondary CTAs)
    document.querySelectorAll('[data-popup-dismiss]').forEach(btn => {
        btn.addEventListener('click', () => {
            const popup = btn.closest('.popup');
            closePopup(popup);
            // TRACKING: popup_dismiss_click
        });
    });

    // Bind primary CTA clicks — close popup and mark conversion interest
    document.querySelectorAll('.popup__cta-primary').forEach(btn => {
        btn.addEventListener('click', () => {
            const popup = btn.closest('.popup');
            closePopup(popup);
            popupState.ctaClicked = true;
            // TRACKING: popup_cta_click
        });
    });

    // Overlay click closes modal popups
    if (popupOverlay) {
        popupOverlay.addEventListener('click', closeAllPopups);
    }

    // Track CTA clicks on the main page — suppress all popups
    document.querySelectorAll('.btn').forEach(btn => {
        if (btn.closest('.popup')) return; // Skip popup buttons
        btn.addEventListener('click', () => {
            popupState.ctaClicked = true;
            // TRACKING: page_cta_click
        });
    });

    // ── POPUP 1: EXIT-INTENT ──
    // Trigger: cursor leaves viewport (desktop) / inactive for popup rules
    // Delay: 15s minimum on page
    // Frequency: 1x per 7 days
    if (!popupState.converted && !wasRecentlyDismissed('popupExitIntent', 7)) {
        // Wait 15 seconds before arming exit-intent
        setTimeout(() => {
            popupState.exitIntentReady = true;
        }, 15000);

        document.addEventListener('mouseleave', (e) => {
            if (e.clientY <= 0 && popupState.exitIntentReady && !popupState.shownThisSession && !popupState.ctaClicked) {
                showPopup(popupExitIntent);
            }
        });
    }

    // ── POPUP 2: TIME-DELAYED 45s ──
    // Trigger: 45s on page without clicking any CTA
    // Frequency: 1x per user FOREVER
    // Priority: 2nd (only if exit-intent hasn't fired)
    if (!popupState.converted && !localStorage.getItem('biflow_popup_popupTimedelay_shown_ever')) {
        setTimeout(() => {
            if (!popupState.shownThisSession && !popupState.ctaClicked && !popupState.converted) {
                showPopup(popupTimedelay);
                localStorage.setItem('biflow_popup_popupTimedelay_shown_ever', 'true');
            }
        }, 45000);
    }

    // ── POPUP 3: SCROLL 50% ──
    // Trigger: scroll to 50% of page
    // Delay: 2s after reaching 50%
    // Frequency: 1x per 14 days
    // Don't show if user already past 80%
    if (!popupState.converted && !wasRecentlyDismissed('popupScroll', 14)) {
        let scrollTriggered = false;

        window.addEventListener('scroll', () => {
            if (scrollTriggered || popupState.shownThisSession || popupState.ctaClicked) return;

            const scrollTop = window.scrollY;
            const docHeight = document.documentElement.scrollHeight - window.innerHeight;
            const scrollPercent = (scrollTop / docHeight) * 100;

            if (scrollPercent >= 50 && scrollPercent < 80) {
                scrollTriggered = true;
                // 2-second delay after reaching 50%
                setTimeout(() => {
                    if (!popupState.shownThisSession && !popupState.ctaClicked) {
                        showPopup(popupScroll);
                    }
                }, 2000);
            }
        }, { passive: true });
    }

    // ESC key closes popups
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeAllPopups();
        }
    });

    // ═══════════════════════════════════════════
    // HERO PARTICLES (decorative)
    // ═══════════════════════════════════════════
    const particlesContainer = document.getElementById('heroParticles');
    if (particlesContainer) {
        for (let i = 0; i < 20; i++) {
            const particle = document.createElement('div');
            particle.style.cssText = `
        position: absolute;
        width: ${Math.random() * 3 + 1}px;
        height: ${Math.random() * 3 + 1}px;
        background: rgba(0, 214, 143, ${Math.random() * 0.3 + 0.1});
        border-radius: 50%;
        top: ${Math.random() * 100}%;
        left: ${Math.random() * 100}%;
        animation: particleFloat ${Math.random() * 8 + 6}s ease-in-out infinite;
        animation-delay: ${Math.random() * 5}s;
      `;
            particlesContainer.appendChild(particle);
        }

        // Add the keyframe animation
        const style = document.createElement('style');
        style.textContent = `
      @keyframes particleFloat {
        0%, 100% { transform: translate(0, 0) scale(1); opacity: 0.3; }
        25% { transform: translate(${Math.random() * 40 - 20}px, ${Math.random() * -60 - 20}px) scale(1.5); opacity: 0.7; }
        50% { transform: translate(${Math.random() * 60 - 30}px, ${Math.random() * -40 - 10}px) scale(1); opacity: 0.4; }
        75% { transform: translate(${Math.random() * 20 - 10}px, ${Math.random() * -80 - 20}px) scale(1.3); opacity: 0.6; }
      }
    `;
        document.head.appendChild(style);
    }

});
