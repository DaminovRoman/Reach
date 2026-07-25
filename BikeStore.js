/* ============================================================
   VELOCITY ATELIER — Interaction Layer
   Vanilla JS. No dependencies. GPU-friendly (opacity/transform only).
   ============================================================ */

(() => {
  "use strict";

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isTouch = window.matchMedia("(hover: none)").matches;

  /* ==========================================================
     0. PRELOADER
     Trigger: runs immediately (IIFE scope), independent of init()
              so it can start counting before DOMContentLoaded
     Progress: an eased fake-progress ramp gives early feedback,
               then yields to the real "load" event (fonts +
               hero image decoded) so the bar never lies — it
               only completes once the page is actually ready
     Exit:    fades out over 700ms (see CSS), then removed from
               DOM so it can't intercept focus/clicks
     Floor:   hard 5s timeout in case "load" never fires (e.g.
               a slow/broken asset), so users are never stuck
     ========================================================== */
  function initPreloader() {
    const el = document.getElementById("preloader");
    if (!el) return;

    const fill = document.getElementById("preloaderFill");
    const count = document.getElementById("preloaderCount");
    let progress = 0;
    let rafId = null;
    let finished = false;
    let pageReady = false;

    const RAMP_MS = 3000;
    const startedAt = (window.performance && performance.now) ? performance.now() : Date.now();

    function now() {
      return (window.performance && performance.now) ? performance.now() : Date.now();
    }

    function setProgress(value) {
      progress = Math.min(value, 100);
      if (fill) fill.style.width = `${progress}%`;
      if (count) count.textContent = `${String(Math.floor(progress)).padStart(2, "0")}%`;
    }

    function easeOutCubic(t) {
      return 1 - Math.pow(1 - t, 3);
    }

    function finishExitSequence() {
      el.classList.add("is-hidden");
      el.setAttribute("aria-hidden", "true");
      document.body.classList.remove("is-loading");
      window.setTimeout(() => el.remove(), 750);
    }

    // Single continuous tick: 0 → 100 always plays out smoothly across
    // the full RAMP_MS, whether real page-load finishes early or late.
    // Real readiness only decides whether we're allowed to exit once we
    // hit 100 — it never speeds up or truncates the count itself.
    function tick() {
      if (finished) return;
      const elapsed = now() - startedAt;
      const t = Math.min(elapsed / RAMP_MS, 1);
      setProgress(easeOutCubic(t) * 100);

      if (t < 1) {
        rafId = requestAnimationFrame(tick);
      } else if (pageReady) {
        finished = true;
        finishExitSequence();
      }
      // if ramp finished but page isn't ready yet, hold at 100 and
      // wait for markReady() to trigger the exit below.
    }

    function release() {
      if (finished) return;
      finished = true;
      if (rafId) cancelAnimationFrame(rafId);
      setProgress(100);
      finishExitSequence();
    }

    function finish() {
      if (finished) return;
      // If the 3s ramp already completed (bar sitting at 100), exit now.
      // Otherwise let the running tick() reach 100 on its own and exit then.
      if (progress >= 100) release();
    }

    function markReady() {
      pageReady = true;
      finish();
    }

    setProgress(0);

    if (prefersReducedMotion) {
      // No animated ramp — jump straight to 100 and wait for real readiness.
      setProgress(100);
      if (document.readyState === "complete") {
        markReady();
      } else {
        window.addEventListener("load", markReady, { once: true });
      }
    } else {
      rafId = requestAnimationFrame(tick);
      if (document.readyState === "complete") {
        markReady();
      } else {
        window.addEventListener("load", markReady, { once: true });
      }
    }

    // Safety ceiling: never leave the user staring at a stuck preloader.
    window.setTimeout(() => { pageReady = true; finish(); }, 6000);
  }

  /* ==========================================================
     1. SOFT REVEAL — IntersectionObserver
     Trigger: element crosses 18% into viewport (rootMargin pulls
              the line up so content settles before it's centered)
     Delay:   staggered by sibling position within its section,
              60ms per index, capped at 5 so long grids don't lag
     Duration: 900ms (defined in CSS var --dur-slow)
     Easing:   cubic-bezier(0.22,1,0.36,1) — decelerates like
               something settling under its own weight, no bounce
     GPU:      toggles a class that animates opacity+transform only;
               will-change is removed after animation completes
     Purpose:  each section arrives calmly, reinforcing the "nothing
               rushed" feeling the brief asks for — never a fade-in
               wall, always a considered sequence
     ========================================================== */
  function initReveal() {
    const items = document.querySelectorAll("[data-reveal]");
    if (!items.length) return;

    if (prefersReducedMotion) {
      items.forEach((el) => el.classList.add("is-visible"));
      return;
    }

    // Group by parent to compute stagger relative to siblings entering together
    const groups = new Map();
    items.forEach((el) => {
      const key = el.parentElement;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(el);
    });
    groups.forEach((siblings) => {
      siblings.forEach((el, i) => {
        el.style.setProperty("--stagger", `${Math.min(i, 5) * 70}ms`);
      });
    });

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.18, rootMargin: "0px 0px -8% 0px" }
    );

    items.forEach((el) => observer.observe(el));
  }

  /* ==========================================================
     2. HEADER STATE — scroll-aware background + dark-hero contrast
     Trigger: scroll position vs. 40px threshold, and hero bounds
     GPU: class toggle only, transition handled in CSS
     Purpose: header stays legible over both the photographic hero
              and the light body sections without a hard cut
     ========================================================== */
  function initHeader() {
    const header = document.getElementById("siteHeader");
    const hero = document.getElementById("hero");
    if (!header) return;

    let ticking = false;

    function update() {
      const scrolled = window.scrollY > 40;
      header.classList.toggle("scrolled", scrolled);

      if (hero) {
        const heroBottom = hero.getBoundingClientRect().bottom;
        header.classList.toggle("on-dark", heroBottom > 80);
      }
      ticking = false;
    }

    window.addEventListener(
      "scroll",
      () => {
        if (!ticking) {
          requestAnimationFrame(update);
          ticking = true;
        }
      },
      { passive: true }
    );
    update();
  }

  /* ==========================================================
     3. HERO PARALLAX — depth on scroll + slow zoom-out on load
     Trigger: rAF loop bound to scroll, scoped to hero height only
     Duration: continuous, tied to scroll position (not time)
     Easing: linear mapping (parallax feels wrong with easing lag)
     GPU: transform: translate3d + scale, will-change scoped to hero
     Purpose: "Depth Parallax" + "Momentum Scroll" from the brief —
              the image drifts slower than scroll, suggesting mass,
              like the bike is genuinely sitting in the landscape
     ========================================================== */
  function initHeroParallax() {
    const hero = document.getElementById("hero");
    const img = document.getElementById("heroImg");
    if (!hero || !img || prefersReducedMotion) return;

    let ticking = false;

    function update() {
      const rect = hero.getBoundingClientRect();
      if (rect.bottom > 0 && rect.top < window.innerHeight) {
        const progress = Math.min(Math.max(-rect.top / rect.height, 0), 1);
        const translateY = progress * 60;
        const scale = 1.08 - progress * 0.03;
        img.style.transform = `translate3d(0, ${translateY}px, 0) scale(${scale})`;
      }
      ticking = false;
    }

    window.addEventListener(
      "scroll",
      () => {
        if (!ticking) {
          requestAnimationFrame(update);
          ticking = true;
        }
      },
      { passive: true }
    );
    update();
  }

  /* ==========================================================
     4. HERO WEIGHT COUNTER — number settles on load
     Trigger: page load, after a short delay so hero text reveals first
     Duration: 1400ms count-up
     Easing: ease-out-quart — fast start, gentle settle on final digit
     GPU: text content update only (no layout thrash, isolated node)
     Purpose: turns an abstract engineering claim ("every gram matters")
              into something that visibly resolves to a precise number,
              the same way a scale settles on a reading
     ========================================================== */
  function initWeightCounter() {
    const el = document.getElementById("heroWeight");
    if (!el) return;

    if (prefersReducedMotion) {
      el.textContent = "6.8";
      return;
    }

    const target = 6.8;
    const duration = 1400;
    let startTime = null;

    function easeOutQuart(t) {
      return 1 - Math.pow(1 - t, 4);
    }

    function tick(ts) {
      if (startTime === null) startTime = ts;
      const elapsed = ts - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeOutQuart(progress);
      const value = (eased * target).toFixed(1);
      el.textContent = value;
      if (progress < 1) requestAnimationFrame(tick);
    }

    setTimeout(() => requestAnimationFrame(tick), 900);
  }

  /* ==========================================================
     5. CURSOR TRAIL — "маршрут" под курсором в hero
     Trigger: pointermove within .hero, throttled via rAF
     Duration: each dot fades over 900ms independently
     Easing: linear opacity decay (fits a physical trail, not UI motion)
     GPU: absolutely positioned dots, opacity + transform only,
          pool capped at 24 nodes to bound memory/paint cost
     Purpose: "Floating Geometry" + a literal nod to the brief's own
              idea — a route/trajectory tracing itself, echoing the
              mountain road in the hero photograph
     ========================================================== */
  function initCursorTrail() {
    if (isTouch || prefersReducedMotion) return;
    const hero = document.getElementById("hero");
    const canvas = document.querySelector(".trail-canvas");
    if (!hero || !canvas) return;

    const pool = [];
    const MAX_DOTS = 24;
    let lastX = null;
    let lastY = null;
    let raf = null;
    let pending = null;

    function spawnDot(x, y) {
      let dot = pool.find((d) => d.free);
      if (!dot) {
        if (pool.length >= MAX_DOTS) return;
        const node = document.createElement("div");
        node.className = "trail-dot";
        canvas.appendChild(node);
        dot = { node, free: true };
        pool.push(dot);
      }
      dot.free = false;
      dot.node.style.left = `${x}px`;
      dot.node.style.top = `${y}px`;
      dot.node.style.opacity = "0.55";
      dot.node.style.transform = "translate(-50%, -50%) scale(1)";
      requestAnimationFrame(() => {
        dot.node.style.transition = "opacity 900ms linear, transform 900ms ease-out";
        dot.node.style.opacity = "0";
        dot.node.style.transform = "translate(-50%, -50%) scale(0.3)";
      });
      setTimeout(() => {
        dot.free = true;
        dot.node.style.transition = "none";
      }, 950);
    }

    function handleMove(e) {
      pending = e;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        if (!pending) return;
        const rect = hero.getBoundingClientRect();
        const x = pending.clientX;
        const y = pending.clientY - rect.top;
        if (lastX !== null) {
          const dist = Math.hypot(x - lastX, y - lastY);
          if (dist > 26) {
            spawnDot(x, pending.clientY);
            lastX = x;
            lastY = y;
          }
        } else {
          lastX = x;
          lastY = y;
        }
        pending = null;
      });
    }

    hero.addEventListener("pointermove", handleMove);
    hero.addEventListener("pointerleave", () => {
      lastX = null;
      lastY = null;
    });
  }

  /* ==========================================================
     6. MAGNETIC BUTTONS
     Trigger: pointermove over .magnetic elements, bounded to a
              120% radius around the element so the pull feels
              intentional rather than global
     Duration: continuous while hovering; 450ms snap-back on leave
     Easing: ease-soft on leave, direct 1:1 follow while active
             (magnetic pull should feel physically attached, not lagged)
     GPU: transform: translate3d only
     Purpose: "Magnetic Buttons" from the brief — reinforces precision
              engineering metaphor, buttons feel machined, not just clicked
     ========================================================== */
  function initMagnetic() {
    if (isTouch || prefersReducedMotion) return;
    const targets = document.querySelectorAll(".btn-primary, .btn-outline");

    targets.forEach((el) => {
      el.classList.add("magnetic");
      let bounds = null;

      el.addEventListener("pointerenter", () => {
        bounds = el.getBoundingClientRect();
        el.style.transition = "transform 120ms ease-out";
      });

      el.addEventListener("pointermove", (e) => {
        if (!bounds) bounds = el.getBoundingClientRect();
        const relX = e.clientX - bounds.left - bounds.width / 2;
        const relY = e.clientY - bounds.top - bounds.height / 2;
        const pullX = relX * 0.28;
        const pullY = relY * 0.38;
        el.style.transform = `translate3d(${pullX}px, ${pullY}px, 0)`;
      });

      el.addEventListener("pointerleave", () => {
        el.style.transition = "transform 450ms cubic-bezier(0.22,1,0.36,1)";
        el.style.transform = "translate3d(0, 0, 0)";
        bounds = null;
      });
    });
  }

  /* ==========================================================
     7. ACCORDION — FAQ
     Trigger: click on .accordion-trigger
     Duration: 480ms (CSS var --dur-base)
     Easing: ease-in-out — symmetric open/close feels mechanical,
             matching "precision" rather than a bouncy reveal
     Height is measured via scrollHeight and set as an explicit
     max-height in px before the class toggles, so the browser
     animates to a known target on the very first frame — no
     mid-transition recalculation/stutter like grid-template-rows: 1fr
     (an intrinsic-content value) can cause on the open animation.
     Purpose: minimalist accordion per brief, single-open-at-a-time
              keeps the list calm rather than accumulating clutter
     ========================================================== */
  function initAccordion() {
    const items = document.querySelectorAll(".accordion-item");

    function setHeight(item, open) {
      const panel = item.querySelector(".accordion-panel");
      if (!panel) return;
      if (open) {
        panel.style.maxHeight = panel.scrollHeight + "px";
      } else {
        panel.style.maxHeight = "0px";
      }
    }

    items.forEach((item) => {
      const trigger = item.querySelector(".accordion-trigger");
      const panel = item.querySelector(".accordion-panel");
      trigger.addEventListener("click", () => {
        const isOpen = item.classList.contains("open");

        items.forEach((other) => {
          if (other !== item) {
            other.classList.remove("open");
            other.querySelector(".accordion-trigger").setAttribute("aria-expanded", "false");
            setHeight(other, false);
          }
        });

        if (!isOpen) {
          item.classList.add("open");
          trigger.setAttribute("aria-expanded", "true");
          setHeight(item, true);
        } else {
          item.classList.remove("open");
          trigger.setAttribute("aria-expanded", "false");
          setHeight(item, false);
        }
      });

      // keep open panel's height correct if fonts/viewport change
      window.addEventListener("resize", () => {
        if (item.classList.contains("open")) {
          panel.style.maxHeight = panel.scrollHeight + "px";
        }
      });
    });
  }

  /* ==========================================================
     8. MOBILE NAV
     Trigger: click on .menu-toggle
     Duration: 480ms slide (CSS transition on .mobile-nav)
     Easing: ease-in-out
     GPU: transform: translateX only
     ========================================================== */
  function initMobileNav() {
    const toggle = document.getElementById("menuToggle");
    const nav = document.getElementById("mobileNav");
    const header = document.getElementById("siteHeader");
    if (!toggle || !nav) return;

    function close() {
      nav.classList.remove("open");
      toggle.setAttribute("aria-expanded", "false");
      document.body.style.overflow = "";
      if (header) header.classList.remove("menu-open");
    }
    function open() {
      nav.classList.add("open");
      toggle.setAttribute("aria-expanded", "true");
      document.body.style.overflow = "hidden";
      if (header) header.classList.add("menu-open");
    }

    toggle.addEventListener("click", () => {
      const isOpen = nav.classList.contains("open");
      isOpen ? close() : open();
    });

    nav.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", close);
    });

    document.getElementById("mobileConsultBtn")?.addEventListener("click", () => {
      close();
      openModal();
    });

    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") close();
    });
  }

  /* ==========================================================
     9. CONSULT MODAL — Glass Morphing entrance
     Trigger: click on any consult button
     Duration: 480ms
     Easing: ease-soft
     GPU: opacity + transform (translateY + scale) + backdrop-filter
          (backdrop-filter is composited on modern browsers; scoped
          to a single fixed overlay so cost stays bounded)
     Purpose: "Glass Morphing" from the brief — panel emerges from
              a blurred frost rather than snapping in
     ========================================================== */
  let modalOverlay, modalPanel, modalForm, lastFocusedEl;

  function openModal() {
    if (!modalOverlay) return;
    lastFocusedEl = document.activeElement;
    modalOverlay.classList.add("open");
    modalOverlay.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    const firstInput = modalForm?.querySelector("input");
    setTimeout(() => firstInput?.focus(), 300);
  }

  function closeModal() {
    if (!modalOverlay) return;
    modalOverlay.classList.remove("open");
    modalOverlay.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    lastFocusedEl?.focus();
  }

  function initModal() {
    modalOverlay = document.getElementById("consultModal");
    modalPanel = document.querySelector(".modal-panel");
    modalForm = document.getElementById("modalForm");
    if (!modalOverlay) return;

    const openers = [
      document.getElementById("consultBtn"),
      document.getElementById("ctaConsultBtn"),
      document.getElementById("heroConsultBtn"),
    ].filter(Boolean);
    openers.forEach((btn) => btn.addEventListener("click", openModal));

    document.getElementById("modalClose")?.addEventListener("click", closeModal);
    modalOverlay.addEventListener("click", (e) => {
      if (e.target === modalOverlay) closeModal();
    });
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && modalOverlay.classList.contains("open")) closeModal();
    });

    modalForm?.addEventListener("submit", (e) => {
      e.preventDefault();
      modalPanel?.classList.add("submitted");
      setTimeout(() => {
        closeModal();
        setTimeout(() => {
          modalPanel?.classList.remove("submitted");
          modalForm.reset();
        }, 500);
      }, 2200);
    });
  }

  /* ==========================================================
     10. SMOOTH ANCHOR SCROLL — accounts for fixed header offset
     Trigger: click on in-page anchor links
     Duration: browser-native smooth scroll (CSS scroll-behavior)
     Purpose: keeps section headings clear of the fixed header
     ========================================================== */
  function initAnchorOffset() {
    const header = document.getElementById("siteHeader");
    document.querySelectorAll('a[href^="#"]').forEach((link) => {
      link.addEventListener("click", (e) => {
        const id = link.getAttribute("href");
        if (id.length <= 1) return;
        const target = document.querySelector(id);
        if (!target) return;
        e.preventDefault();
        const headerHeight = header ? header.offsetHeight : 0;
        const top = target.getBoundingClientRect().top + window.scrollY - headerHeight - 12;
        window.scrollTo({ top, behavior: prefersReducedMotion ? "auto" : "smooth" });
      });
    });
  }

  /* ==========================================================
     11. STORY CARD DEPTH TILT (Ambient Shadows)
     Trigger: pointermove over .story-card
     Duration: continuous while hovering, 400ms reset on leave
     Easing: ease-soft on reset
     GPU: transform: perspective + rotate only
     Purpose: "Ambient Shadows" / "Liquid Hover" — subtle tilt makes
              the card feel like a physical object catching light,
              kept small in magnitude to stay "light, never abrupt"
     ========================================================== */
  function initCardTilt() {
    if (isTouch || prefersReducedMotion) return;
    const cards = document.querySelectorAll(".story-card, .philosophy-card");

    cards.forEach((card) => {
      card.addEventListener("pointermove", (e) => {
        const rect = card.getBoundingClientRect();
        const relX = (e.clientX - rect.left) / rect.width - 0.5;
        const relY = (e.clientY - rect.top) / rect.height - 0.5;
        card.style.transition = "transform 60ms linear";
        card.style.transform = `perspective(900px) rotateX(${relY * -3}deg) rotateY(${relX * 3}deg) translateY(-2px)`;
      });
      card.addEventListener("pointerleave", () => {
        card.style.transition = "transform 400ms cubic-bezier(0.22,1,0.36,1)";
        card.style.transform = "perspective(900px) rotateX(0) rotateY(0) translateY(0)";
      });
    });
  }

  /* ==========================================================
     INIT
     ========================================================== */
  function init() {
    initReveal();
    initHeader();
    initHeroParallax();
    initWeightCounter();
    initCursorTrail();
    initMagnetic();
    initAccordion();
    initMobileNav();
    initModal();
    initAnchorOffset();
    initCardTilt();
  }

  // Preloader starts as soon as this script parses — no need to wait for
  // DOMContentLoaded, since the script tag sits at the end of <body> and
  // the preloader markup is already in the DOM by the time it runs.
  initPreloader();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
