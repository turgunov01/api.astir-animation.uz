const tones = ["teal", "blue", "amber", "rose", "slate"];

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function countOperations(scopes) {
  const operations = new Set();

  for (const scope of scopes) {
    for (const operation of scope.operations || []) {
      operations.add(operation);
    }
  }

  return operations.size;
}

function renderMetric(value, label) {
  return `
          <div class="metric">
            <strong>${escapeHtml(value)}</strong>
            <span>${escapeHtml(label)}</span>
          </div>`;
}

function renderHeroTrack(links, rowIndex) {
  const repeatedLinks = [...links, ...links];

  return `
        <div class="scene-track scene-track-${rowIndex + 1}">
          ${repeatedLinks
            .map((link, index) => `
          <div class="endpoint-chip endpoint-chip-${tones[(index + rowIndex) % tones.length]}">
            <strong>${escapeHtml(link.title)}</strong>
            <span>${escapeHtml(link.href)}</span>
          </div>`)
            .join("")}
        </div>`;
}

function renderDocCards(links, label) {
  return links
    .map((link, index) => `
        <li class="doc-card doc-card-${tones[index % tones.length]}">
          <a href="${escapeHtml(link.href)}" aria-label="Open ${escapeHtml(link.title)}">
            <span class="card-label">${escapeHtml(label)}</span>
            <strong>${escapeHtml(link.title)}</strong>
            <small>${escapeHtml(link.href)}</small>
            ${link.description ? `<p>${escapeHtml(link.description)}</p>` : ""}
          </a>
        </li>`)
    .join("");
}

export function createSwaggerIndexPage(scopes) {
  const legacyOperationCount = 140;
  const legacySwaggerLink = {
    href: "/legacy-api-docs",
    title: "Astir Streaming API",
    description: "Legacy Swagger UI duplicated from the old Astir Streaming API contract."
  };
  const legacyOpenApiLink = {
    href: "/legacy-doc.json",
    title: "Astir Streaming API JSON",
    description: "Legacy Swagger 2.0 document with local host and /api/v1 base path."
  };
  const swaggerLinks = [
    {
      href: "/api-docs",
      title: "Astir API",
      description: "Complete Swagger UI for every API endpoint."
    },
    legacySwaggerLink,
    ...scopes.map((scope) => ({
      href: scope.docsPath,
      title: scope.title,
      description: scope.description
    }))
  ];

  const openApiLinks = [
    {
      href: "/openapi.json",
      title: "Astir OpenAPI JSON",
      description: "Complete raw OpenAPI document."
    },
    legacyOpenApiLink,
    ...scopes.map((scope) => ({
      href: scope.jsonPath,
      title: `${scope.title} JSON`,
      description: scope.description
    }))
  ];

  const metrics = [
    { value: swaggerLinks.length, label: "Swagger pages" },
    { value: scopes.length, label: "Focused APIs" },
    { value: countOperations(scopes) + legacyOperationCount, label: "Documented routes" },
    { value: openApiLinks.length, label: "JSON files" }
  ];

  const sceneRows = [
    swaggerLinks,
    openApiLinks,
    [...swaggerLinks].reverse()
  ];

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Astir Swagger Index</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Rubik:wght@400;500;700&display=swap" rel="stylesheet">
    <style>
      :root {
        color-scheme: light;
        font-family: "Rubik", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: #172033;
        background: #f4f7f9;
        --bg: #f4f7f9;
        --surface: #ffffff;
        --surface-soft: #eef4f3;
        --ink: #172033;
        --muted: #5d6678;
        --line: #d6dee6;
        --teal: #0f766e;
        --blue: #175cd3;
        --amber: #b54708;
        --rose: #b42318;
        --slate: #344054;
        --shadow: 0 20px 60px rgba(16, 24, 40, 0.12);
      }

      * {
        box-sizing: border-box;
      }

      html {
        scroll-behavior: smooth;
      }

      body {
        margin: 0;
        min-height: 100vh;
        background: var(--bg);
      }

      a {
        color: inherit;
      }

      a:focus-visible,
      button:focus-visible {
        outline: 3px solid rgba(23, 92, 211, 0.35);
        outline-offset: 4px;
      }

      .page-shell {
        overflow: hidden;
      }

      .site-header {
        position: sticky;
        top: 0;
        z-index: 20;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 24px;
        width: min(1180px, calc(100% - 32px));
        min-height: 72px;
        margin: 0 auto;
        padding: 14px 0;
        background: rgba(244, 247, 249, 0.88);
        backdrop-filter: blur(14px);
      }

      .brand {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        color: var(--ink);
        font-weight: 700;
        text-decoration: none;
      }

      .brand-mark {
        display: inline-grid;
        width: 38px;
        height: 38px;
        place-items: center;
        border: 1px solid rgba(15, 118, 110, 0.45);
        border-radius: 8px;
        background: #dff1ee;
        color: var(--teal);
      }

      .site-nav {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
        justify-content: flex-end;
      }

      .site-nav a {
        min-height: 38px;
        padding: 10px 12px;
        border-radius: 8px;
        color: var(--muted);
        font-size: 0.92rem;
        font-weight: 500;
        text-decoration: none;
      }

      .site-nav a:hover {
        background: rgba(255, 255, 255, 0.72);
        color: var(--ink);
      }

      main {
        width: 100%;
      }

      .hero {
        position: relative;
        display: flex;
        align-items: center;
        min-height: min(680px, 72svh);
        padding: 64px 0 72px;
      }

      .hero::after {
        position: absolute;
        inset: 0;
        z-index: 1;
        content: "";
        background: rgba(244, 247, 249, 0.68);
      }

      .hero-scene {
        position: absolute;
        inset: 0;
        z-index: 0;
        display: flex;
        flex-direction: column;
        justify-content: center;
        gap: 18px;
        transform: rotate(-4deg) scale(1.05);
        opacity: 0.86;
      }

      .scene-track {
        display: flex;
        gap: 14px;
        width: max-content;
        will-change: transform;
      }

      .scene-track-1 {
        margin-left: -70px;
      }

      .scene-track-2 {
        margin-left: -280px;
      }

      .scene-track-3 {
        margin-left: -150px;
      }

      .endpoint-chip {
        display: flex;
        flex-direction: column;
        justify-content: center;
        width: 230px;
        min-height: 82px;
        padding: 15px 16px;
        border: 1px solid var(--line);
        border-left-width: 5px;
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.82);
        box-shadow: 0 16px 44px rgba(16, 24, 40, 0.08);
        text-decoration: none;
      }

      .endpoint-chip strong {
        overflow: hidden;
        color: var(--ink);
        font-size: 0.92rem;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .endpoint-chip span {
        margin-top: 6px;
        overflow: hidden;
        color: var(--muted);
        font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
        font-size: 0.78rem;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .endpoint-chip-teal,
      .doc-card-teal {
        border-left-color: var(--teal);
      }

      .endpoint-chip-blue,
      .doc-card-blue {
        border-left-color: var(--blue);
      }

      .endpoint-chip-amber,
      .doc-card-amber {
        border-left-color: var(--amber);
      }

      .endpoint-chip-rose,
      .doc-card-rose {
        border-left-color: var(--rose);
      }

      .endpoint-chip-slate,
      .doc-card-slate {
        border-left-color: var(--slate);
      }

      .hero-content {
        position: relative;
        z-index: 2;
        display: grid;
        gap: 28px;
        width: min(1180px, calc(100% - 32px));
        margin: 0 auto;
      }

      .hero-copy {
        max-width: 760px;
      }

      .eyebrow {
        margin: 0 0 16px;
        color: var(--teal);
        font-size: 0.92rem;
        font-weight: 700;
      }

      h1 {
        max-width: 760px;
        margin: 0;
        color: var(--ink);
        font-size: 4rem;
        line-height: 1.02;
      }

      .hero-copy > p:not(.eyebrow) {
        max-width: 650px;
        margin: 20px 0 0;
        color: #344054;
        font-size: 1.16rem;
        line-height: 1.62;
      }

      .hero-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        margin-top: 30px;
      }

      .button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 46px;
        padding: 12px 18px;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: var(--surface);
        color: var(--ink);
        font-weight: 700;
        text-decoration: none;
        box-shadow: 0 12px 30px rgba(16, 24, 40, 0.08);
        transition: transform 180ms ease, border-color 180ms ease, background 180ms ease;
      }

      .button:hover {
        transform: translateY(-2px);
        border-color: rgba(23, 92, 211, 0.5);
      }

      .button-primary {
        border-color: var(--teal);
        background: var(--teal);
        color: #ffffff;
      }

      .button-primary:hover {
        border-color: #0b5f59;
        background: #0b5f59;
      }

      .hero-metrics {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 12px;
        max-width: 900px;
      }

      .metric {
        min-height: 96px;
        padding: 18px;
        border: 1px solid rgba(214, 222, 230, 0.95);
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.86);
        box-shadow: 0 12px 36px rgba(16, 24, 40, 0.07);
      }

      .metric strong {
        display: block;
        color: var(--ink);
        font-size: 2rem;
        line-height: 1;
      }

      .metric span {
        display: block;
        margin-top: 10px;
        color: var(--muted);
        font-size: 0.93rem;
        font-weight: 500;
      }

      .content-section {
        width: min(1180px, calc(100% - 32px));
        margin: 0 auto;
        padding: 74px 0 0;
      }

      .content-section:last-of-type {
        padding-bottom: 84px;
      }

      .section-heading {
        display: flex;
        align-items: end;
        justify-content: space-between;
        gap: 24px;
        margin-bottom: 22px;
      }

      .section-heading h2 {
        margin: 0;
        color: var(--ink);
        font-size: 2rem;
        line-height: 1.12;
      }

      .section-heading p {
        max-width: 520px;
        margin: 0;
        color: var(--muted);
        line-height: 1.55;
      }

      .card-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        gap: 16px;
        padding: 0;
        margin: 0;
        list-style: none;
      }

      .doc-card {
        min-height: 210px;
        border: 1px solid var(--line);
        border-left-width: 5px;
        border-radius: 8px;
        background: var(--surface);
        box-shadow: 0 16px 38px rgba(16, 24, 40, 0.08);
        transition: transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease;
      }

      .doc-card:hover {
        transform: translateY(-4px);
        box-shadow: var(--shadow);
      }

      .doc-card a {
        display: flex;
        flex-direction: column;
        min-height: 100%;
        padding: 20px;
        text-decoration: none;
      }

      .card-label {
        color: var(--muted);
        font-size: 0.78rem;
        font-weight: 700;
      }

      .doc-card strong {
        margin-top: 16px;
        color: var(--ink);
        font-size: 1.12rem;
        line-height: 1.3;
      }

      .doc-card small {
        display: block;
        margin-top: 10px;
        overflow-wrap: anywhere;
        color: var(--blue);
        font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
        font-size: 0.82rem;
        line-height: 1.4;
      }

      .doc-card p {
        margin: 16px 0 0;
        color: #344054;
        line-height: 1.48;
      }

      .footer {
        width: min(1180px, calc(100% - 32px));
        margin: 0 auto;
        padding: 0 0 44px;
        color: var(--muted);
        font-size: 0.92rem;
      }

      @media (max-width: 820px) {
        .site-header {
          align-items: flex-start;
          flex-direction: column;
          min-height: auto;
        }

        .site-nav {
          justify-content: flex-start;
        }

        .hero {
          min-height: min(700px, 78svh);
          padding: 48px 0 58px;
        }

        .hero-scene {
          transform: rotate(-6deg) scale(1.12);
          opacity: 0.5;
        }

        h1 {
          font-size: 3rem;
          line-height: 1.08;
        }

        .hero-copy > p:not(.eyebrow) {
          font-size: 1.03rem;
        }

        .hero-metrics {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .section-heading {
          align-items: flex-start;
          flex-direction: column;
        }
      }

      @media (max-width: 520px) {
        .site-nav a {
          padding-right: 10px;
          padding-left: 10px;
        }

        .hero {
          min-height: auto;
        }

        h1 {
          font-size: 2.35rem;
        }

        .hero-actions,
        .button {
          width: 100%;
        }

        .hero-metrics {
          grid-template-columns: 1fr;
        }

        .content-section {
          padding-top: 54px;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        *,
        *::before,
        *::after {
          scroll-behavior: auto !important;
          transition-duration: 0.01ms !important;
          animation-duration: 0.01ms !important;
          animation-iteration-count: 1 !important;
        }
      }
    </style>
  </head>
  <body>
    <div class="page-shell">
      <header class="site-header">
        <a class="brand" href="/index.html" aria-label="Astir API index">
          <span class="brand-mark">A</span>
          <span>Astir API</span>
        </a>
        <nav class="site-nav" aria-label="Primary">
          <a href="/api-docs">Swagger</a>
          <a href="/legacy-api-docs">Legacy</a>
          <a href="/openapi.json">OpenAPI</a>
          <a href="/health">Health</a>
        </nav>
      </header>

      <main>
        <section class="hero" aria-labelledby="hero-title">
          <div class="hero-scene" aria-hidden="true">
            ${sceneRows.map(renderHeroTrack).join("")}
          </div>

          <div class="hero-content">
            <div class="hero-copy">
              <p class="eyebrow">Local API Documentation</p>
              <h1 id="hero-title">Astir Swagger Index</h1>
              <p>One generated entry point for the complete Astir API, focused Swagger pages, and raw OpenAPI JSON files.</p>
              <div class="hero-actions">
                <a class="button button-primary" href="/api-docs">Open Complete Swagger</a>
                <a class="button" href="/legacy-api-docs">Open Legacy Streaming API</a>
                <a class="button" href="/parent-docs">Open Parent API</a>
              </div>
            </div>

            <div class="hero-metrics" aria-label="Documentation summary">
              ${metrics.map((metric) => renderMetric(metric.value, metric.label)).join("")}
            </div>
          </div>
        </section>

        <section class="content-section reveal" aria-labelledby="swagger-pages">
          <div class="section-heading">
            <h2 id="swagger-pages">Swagger UI Pages</h2>
            <p>Open the full API surface or use a focused page for parent, device, content, pairing, tariff, and watch-session work.</p>
          </div>
          <ul class="card-grid">${renderDocCards(swaggerLinks, "Swagger UI")}
          </ul>
        </section>

        <section class="content-section reveal" aria-labelledby="openapi-json">
          <div class="section-heading">
            <h2 id="openapi-json">OpenAPI JSON</h2>
            <p>Use these files for client generation, automated checks, or sharing an API contract without the Swagger UI shell.</p>
          </div>
          <ul class="card-grid">${renderDocCards(openApiLinks, "OpenAPI JSON")}
          </ul>
        </section>
      </main>

      <footer class="footer">
        Served by the Astir backend. Links are generated from the mounted Swagger scopes.
      </footer>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/gsap@3/dist/gsap.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/gsap@3/dist/ScrollTrigger.min.js"></script>
    <script>
      (function () {
        var prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

        if (prefersReducedMotion || !window.gsap) {
          document.documentElement.classList.add("motion-off");
          return;
        }

        if (window.ScrollTrigger) {
          gsap.registerPlugin(ScrollTrigger);
        }

        gsap.from(".brand, .site-nav a", {
          y: -12,
          opacity: 0,
          duration: 0.55,
          ease: "power2.out",
          stagger: 0.05
        });

        gsap.from(".hero-copy > *, .metric", {
          y: 26,
          opacity: 0,
          duration: 0.85,
          ease: "power3.out",
          stagger: 0.08,
          delay: 0.08
        });

        gsap.utils.toArray(".scene-track").forEach(function (track, index) {
          gsap.to(track, {
            xPercent: index % 2 === 0 ? -35 : 35,
            duration: index === 1 ? 30 : 38,
            ease: "none",
            repeat: -1
          });
        });

        if (!window.ScrollTrigger) {
          return;
        }

        gsap.utils.toArray(".reveal").forEach(function (section) {
          gsap.from(section.querySelector(".section-heading"), {
            y: 24,
            opacity: 0,
            duration: 0.72,
            ease: "power2.out",
            scrollTrigger: {
              trigger: section,
              start: "top 82%",
              toggleActions: "play none none reverse"
            }
          });
        });

        gsap.set(".doc-card", { y: 28, opacity: 0 });
        ScrollTrigger.batch(".doc-card", {
          start: "top 86%",
          onEnter: function (batch) {
            gsap.to(batch, {
              y: 0,
              opacity: 1,
              duration: 0.66,
              ease: "power2.out",
              stagger: 0.08,
              overwrite: true
            });
          },
          onLeaveBack: function (batch) {
            gsap.to(batch, {
              y: 28,
              opacity: 0,
              duration: 0.35,
              ease: "power2.in",
              stagger: 0.04,
              overwrite: true
            });
          }
        });

        if (document.fonts && document.fonts.ready) {
          document.fonts.ready.then(function () {
            ScrollTrigger.refresh();
          });
        }
      })();
    </script>
  </body>
</html>`;
}
