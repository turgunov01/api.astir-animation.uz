const httpMethods = new Set([
  "delete",
  "get",
  "head",
  "options",
  "patch",
  "post",
  "put",
  "trace"
]);

function collectOperations(document) {
  const operations = [];

  for (const [pathName, pathItem] of Object.entries(document.paths || {})) {
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!httpMethods.has(method)) {
        continue;
      }

      operations.push({
        method: method.toUpperCase(),
        path: pathName,
        summary: operation.summary || pathName
      });
    }
  }

  return operations;
}

function createThemeMetadata({ document, title, description, docsPath, jsonPath, scopes }) {
  const operations = collectOperations(document);
  const tags = document.tags || [];
  const securitySchemes = Object.keys(document.components?.securitySchemes || {});

  return {
    title,
    description,
    docsPath,
    jsonPath,
    operationCount: operations.length,
    tagCount: tags.length,
    securityCount: securitySchemes.length,
    operations: operations.slice(0, 8),
    allDocs: [
      {
        title: "Complete API",
        href: "/api-docs"
      },
      ...scopes.map((scope) => ({
        title: scope.title.replace(/^Astir\s+/, ""),
        href: scope.docsPath
      }))
    ]
  };
}

function serializeForScript(value) {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

function createSwaggerCustomScript(metadata) {
  return `
(function () {
  var meta = ${serializeForScript(metadata)};
  var motionOff = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function escapeHtml(value) {
    var element = document.createElement("span");
    element.textContent = value == null ? "" : String(value);
    return element.innerHTML;
  }

  function methodClass(method) {
    return String(method || "get").toLowerCase();
  }

  function waitForSwagger(callback) {
    var attempts = 0;
    var timer = window.setInterval(function () {
      attempts += 1;
      if (document.querySelector(".swagger-ui") || attempts > 80) {
        window.clearInterval(timer);
        callback();
      }
    }, 50);
  }

  function renderOperations() {
    return meta.operations.map(function (operation, index) {
      return [
        '<div class="astir-route-card astir-route-card-' + (index % 4) + '">',
          '<span class="astir-method astir-method-' + methodClass(operation.method) + '">' + escapeHtml(operation.method) + '</span>',
          '<strong>' + escapeHtml(operation.path) + '</strong>',
          '<small>' + escapeHtml(operation.summary) + '</small>',
        '</div>'
      ].join("");
    }).join("");
  }

  function renderNav() {
    return meta.allDocs.map(function (link) {
      var active = link.href === window.location.pathname ? " astir-scope-active" : "";
      return '<a class="astir-scope-link' + active + '" href="' + escapeHtml(link.href) + '">' + escapeHtml(link.title) + '</a>';
    }).join("");
  }

  function buildChrome() {
    if (document.querySelector(".astir-swagger-console")) {
      return;
    }

    document.title = meta.title + " | Astir Docs";
    document.body.classList.add("astir-swagger-themed");

    var swaggerRoot = document.getElementById("swagger-ui");
    var consoleElement = document.createElement("section");
    consoleElement.className = "astir-swagger-console";
    consoleElement.innerHTML = [
      '<header class="astir-console-bar">',
        '<a class="astir-console-brand" href="/index.html" aria-label="Astir Swagger index">',
          '<span class="astir-console-mark">A</span>',
          '<span>Astir API</span>',
        '</a>',
        '<nav class="astir-console-actions" aria-label="Swagger shortcuts">',
          '<a href="/index.html">Index</a>',
          '<a href="' + escapeHtml(meta.jsonPath) + '">JSON</a>',
          '<a href="/health">Health</a>',
        '</nav>',
      '</header>',
      '<div class="astir-console-hero">',
        '<div class="astir-console-copy">',
          '<p class="astir-kicker">Swagger Workspace</p>',
          '<h1>' + escapeHtml(meta.title) + '</h1>',
          '<p>' + escapeHtml(meta.description) + '</p>',
          '<div class="astir-console-metrics" aria-label="Documentation stats">',
            '<span><strong>' + escapeHtml(meta.operationCount) + '</strong> routes</span>',
            '<span><strong>' + escapeHtml(meta.tagCount) + '</strong> groups</span>',
            '<span><strong>' + escapeHtml(meta.securityCount) + '</strong> auth schemes</span>',
          '</div>',
        '</div>',
        '<div class="astir-api-stage" aria-hidden="true">',
          '<div class="astir-api-deck">' + renderOperations() + '</div>',
        '</div>',
      '</div>',
      '<div class="astir-scope-strip" aria-label="Swagger pages">' + renderNav() + '</div>'
    ].join("");

    if (swaggerRoot) {
      swaggerRoot.parentNode.insertBefore(consoleElement, swaggerRoot);
    } else {
      document.body.insertBefore(consoleElement, document.body.firstChild);
    }
  }

  function tagOperations() {
    document.querySelectorAll(".swagger-ui .opblock").forEach(function (block) {
      if (block.dataset.astirEnhanced === "true") {
        return;
      }

      block.dataset.astirEnhanced = "true";
      var summary = block.querySelector(".opblock-summary");

      if (summary) {
        var chip = document.createElement("span");
        chip.className = "astir-op-chip";
        chip.textContent = "API";
        summary.appendChild(chip);
      }
    });
  }

  function watchSwaggerOperations() {
    tagOperations();

    var root = document.getElementById("swagger-ui");
    if (!root || !window.MutationObserver) {
      return;
    }

    var observer = new MutationObserver(function () {
      tagOperations();
    });

    observer.observe(root, {
      childList: true,
      subtree: true
    });
  }

  function startMotion() {
    if (motionOff || !window.gsap) {
      document.documentElement.classList.add("astir-motion-off");
      return;
    }

    if (window.ScrollTrigger) {
      gsap.registerPlugin(ScrollTrigger);
    }

    gsap.set(".astir-api-stage", {
      perspective: 1000
    });

    gsap.from(".astir-console-bar, .astir-console-copy > *, .astir-scope-strip", {
      y: 24,
      opacity: 0,
      duration: 0.85,
      ease: "power3.out",
      stagger: 0.06
    });

    gsap.from(".astir-route-card", {
      y: 34,
      z: -180,
      rotationX: 18,
      rotationY: -24,
      opacity: 0,
      duration: 1.05,
      ease: "power3.out",
      stagger: 0.06,
      delay: 0.12
    });

    gsap.to(".astir-route-card", {
      y: -8,
      rotationY: 5,
      duration: 3.4,
      yoyo: true,
      repeat: -1,
      ease: "sine.inOut",
      stagger: {
        each: 0.2,
        repeat: -1,
        yoyo: true
      }
    });

    var stage = document.querySelector(".astir-api-stage");
    var deck = document.querySelector(".astir-api-deck");

    if (stage && deck) {
      stage.addEventListener("pointermove", function (event) {
        var rect = stage.getBoundingClientRect();
        var x = (event.clientX - rect.left) / rect.width - 0.5;
        var y = (event.clientY - rect.top) / rect.height - 0.5;

        gsap.to(deck, {
          rotationY: x * 14,
          rotationX: y * -10,
          duration: 0.45,
          ease: "power2.out"
        });
      });

      stage.addEventListener("pointerleave", function () {
        gsap.to(deck, {
          rotationX: 0,
          rotationY: 0,
          duration: 0.7,
          ease: "power3.out"
        });
      });
    }

    if (window.ScrollTrigger) {
      ScrollTrigger.batch(".swagger-ui .opblock", {
        start: "top 88%",
        onEnter: function (batch) {
          gsap.fromTo(batch, {
            y: 22,
            opacity: 0,
            rotationX: 8
          }, {
            y: 0,
            opacity: 1,
            rotationX: 0,
            duration: 0.55,
            ease: "power2.out",
            stagger: 0.04,
            overwrite: true
          });
        }
      });
    }
  }

  window.addEventListener("load", function () {
    waitForSwagger(function () {
      buildChrome();
      watchSwaggerOperations();
      startMotion();
    });
  });
})();
`;
}

export function createSwaggerUiOptions({
  document,
  title = document.info?.title || "Astir API",
  description = document.info?.description || "Astir API documentation.",
  docsPath = "/api-docs",
  jsonPath = "/openapi.json",
  scopes = []
}) {
  const metadata = createThemeMetadata({
    document,
    title,
    description,
    docsPath,
    jsonPath,
    scopes
  });

  return {
    customSiteTitle: `${title} | Astir Docs`,
    customCssUrl: "https://fonts.googleapis.com/css2?family=Rubik:wght@400;500;700&display=swap",
    customJs: [
      "https://cdn.jsdelivr.net/npm/gsap@3/dist/gsap.min.js",
      "https://cdn.jsdelivr.net/npm/gsap@3/dist/ScrollTrigger.min.js"
    ],
    customJsStr: createSwaggerCustomScript(metadata),
    customCss: `
      :root {
        --astir-bg: #f4f7f9;
        --astir-surface: #ffffff;
        --astir-ink: #172033;
        --astir-muted: #5d6678;
        --astir-line: #d6dee6;
        --astir-teal: #0f766e;
        --astir-blue: #175cd3;
        --astir-amber: #b54708;
        --astir-rose: #b42318;
        --astir-slate: #344054;
        --astir-shadow: 0 18px 52px rgba(16, 24, 40, 0.12);
      }

      html,
      body {
        background: var(--astir-bg) !important;
        color: var(--astir-ink);
        font-family: "Rubik", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
      }

      body {
        margin: 0;
      }

      a:focus-visible,
      button:focus-visible,
      input:focus-visible,
      select:focus-visible,
      textarea:focus-visible {
        outline: 3px solid rgba(23, 92, 211, 0.35) !important;
        outline-offset: 3px !important;
      }

      .swagger-ui .topbar {
        display: none;
      }

      .astir-swagger-console {
        position: relative;
        width: min(1180px, calc(100% - 32px));
        margin: 0 auto;
        padding: 20px 0 18px;
        color: var(--astir-ink);
        font-family: "Rubik", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      .astir-console-bar {
        position: sticky;
        top: 0;
        z-index: 30;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        min-height: 66px;
        padding: 10px 0;
        background: rgba(244, 247, 249, 0.9);
        backdrop-filter: blur(14px);
      }

      .astir-console-brand,
      .astir-console-actions,
      .astir-console-actions a,
      .astir-scope-link {
        display: inline-flex;
        align-items: center;
      }

      .astir-console-brand {
        gap: 10px;
        color: var(--astir-ink);
        font-weight: 700;
        text-decoration: none;
      }

      .astir-console-mark {
        display: inline-grid;
        width: 38px;
        height: 38px;
        place-items: center;
        border: 1px solid rgba(15, 118, 110, 0.45);
        border-radius: 8px;
        background: #dff1ee;
        color: var(--astir-teal);
      }

      .astir-console-actions {
        justify-content: flex-end;
        gap: 8px;
        flex-wrap: wrap;
      }

      .astir-console-actions a,
      .astir-scope-link {
        min-height: 38px;
        padding: 9px 12px;
        border: 1px solid transparent;
        border-radius: 8px;
        color: var(--astir-muted);
        font-size: 0.92rem;
        font-weight: 500;
        text-decoration: none;
      }

      .astir-console-actions a:hover,
      .astir-scope-link:hover,
      .astir-scope-active {
        border-color: var(--astir-line);
        background: rgba(255, 255, 255, 0.82);
        color: var(--astir-ink);
      }

      .astir-console-hero {
        display: grid;
        grid-template-columns: minmax(0, 1.02fr) minmax(360px, 0.98fr);
        gap: 32px;
        align-items: center;
        min-height: 390px;
        padding: 34px 0 30px;
      }

      .astir-console-copy {
        max-width: 650px;
      }

      .astir-kicker {
        margin: 0 0 13px;
        color: var(--astir-teal);
        font-size: 0.9rem;
        font-weight: 700;
      }

      .astir-console-copy h1 {
        margin: 0;
        color: var(--astir-ink);
        font-family: "Rubik", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        font-size: 3.55rem;
        line-height: 1.03;
      }

      .astir-console-copy > p:not(.astir-kicker) {
        max-width: 620px;
        margin: 18px 0 0;
        color: #344054;
        font-size: 1.08rem;
        line-height: 1.62;
      }

      .astir-console-metrics {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        margin-top: 24px;
      }

      .astir-console-metrics span {
        display: inline-flex;
        align-items: baseline;
        gap: 7px;
        min-height: 44px;
        padding: 10px 13px;
        border: 1px solid var(--astir-line);
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.82);
        color: var(--astir-muted);
        box-shadow: 0 12px 32px rgba(16, 24, 40, 0.07);
      }

      .astir-console-metrics strong {
        color: var(--astir-ink);
        font-size: 1.2rem;
      }

      .astir-api-stage {
        min-height: 340px;
        padding: 24px;
        border: 1px solid rgba(214, 222, 230, 0.9);
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.7);
        box-shadow: var(--astir-shadow);
        overflow: hidden;
        transform-style: preserve-3d;
      }

      .astir-api-deck {
        position: relative;
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
        min-height: 292px;
        transform-style: preserve-3d;
        will-change: transform;
      }

      .astir-route-card {
        display: flex;
        flex-direction: column;
        justify-content: center;
        min-height: 88px;
        padding: 14px;
        border: 1px solid var(--astir-line);
        border-left: 5px solid var(--astir-teal);
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.92);
        box-shadow: 0 15px 36px rgba(16, 24, 40, 0.1);
        transform-style: preserve-3d;
        backface-visibility: hidden;
      }

      .astir-route-card-1 {
        border-left-color: var(--astir-blue);
      }

      .astir-route-card-2 {
        border-left-color: var(--astir-amber);
      }

      .astir-route-card-3 {
        border-left-color: var(--astir-rose);
      }

      .astir-route-card strong,
      .astir-route-card small {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .astir-route-card strong {
        margin-top: 10px;
        color: var(--astir-ink);
        font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
        font-size: 0.84rem;
      }

      .astir-route-card small {
        margin-top: 6px;
        color: var(--astir-muted);
        font-size: 0.78rem;
      }

      .astir-method {
        align-self: flex-start;
        min-width: 54px;
        padding: 5px 8px;
        border-radius: 8px;
        background: #eef4f3;
        color: var(--astir-teal);
        font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
        font-size: 0.78rem;
        font-weight: 700;
        text-align: center;
      }

      .astir-method-post {
        background: #fff4e5;
        color: var(--astir-amber);
      }

      .astir-method-put,
      .astir-method-patch {
        background: #edf4ff;
        color: var(--astir-blue);
      }

      .astir-method-delete {
        background: #fff1f0;
        color: var(--astir-rose);
      }

      .astir-scope-strip {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        padding: 14px;
        border: 1px solid var(--astir-line);
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.78);
        box-shadow: 0 12px 30px rgba(16, 24, 40, 0.07);
      }

      .swagger-ui {
        width: min(1180px, calc(100% - 32px));
        margin: 0 auto 72px;
        color: var(--astir-ink);
        font-family: "Rubik", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      .swagger-ui .wrapper {
        max-width: none;
        padding: 0;
      }

      .swagger-ui .information-container {
        display: none;
      }

      .swagger-ui .scheme-container {
        margin: 22px 0;
        padding: 18px;
        border: 1px solid var(--astir-line);
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.9);
        box-shadow: 0 12px 30px rgba(16, 24, 40, 0.07);
      }

      .swagger-ui .opblock-tag {
        margin: 34px 0 12px;
        padding: 16px 0 10px;
        border-bottom: 1px solid var(--astir-line);
        color: var(--astir-ink);
        font-family: "Rubik", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        font-size: 1.35rem;
      }

      .swagger-ui .opblock-tag small {
        color: var(--astir-muted);
      }

      .swagger-ui .opblock {
        overflow: hidden;
        border: 1px solid var(--astir-line);
        border-radius: 8px;
        background: var(--astir-surface);
        box-shadow: 0 14px 32px rgba(16, 24, 40, 0.08);
        transform-origin: center top;
      }

      .swagger-ui .opblock:hover {
        box-shadow: var(--astir-shadow);
      }

      .swagger-ui .opblock .opblock-summary {
        min-height: 64px;
        padding: 10px 14px;
      }

      .swagger-ui .opblock .opblock-summary-method {
        min-width: 72px;
        border-radius: 8px;
        font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
        font-size: 0.82rem;
      }

      .swagger-ui .opblock .opblock-summary-path,
      .swagger-ui .opblock .opblock-summary-path__deprecated {
        color: var(--astir-ink);
        font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
        font-size: 0.96rem;
      }

      .swagger-ui .opblock .opblock-summary-description {
        color: var(--astir-muted);
        font-size: 0.95rem;
      }

      .astir-op-chip {
        margin-left: auto;
        padding: 6px 8px;
        border: 1px solid var(--astir-line);
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.82);
        color: var(--astir-muted);
        font-size: 0.76rem;
        font-weight: 700;
      }

      .swagger-ui .opblock.opblock-get {
        border-color: rgba(15, 118, 110, 0.35);
        background: rgba(15, 118, 110, 0.04);
      }

      .swagger-ui .opblock.opblock-post {
        border-color: rgba(181, 71, 8, 0.35);
        background: rgba(181, 71, 8, 0.04);
      }

      .swagger-ui .opblock.opblock-put,
      .swagger-ui .opblock.opblock-patch {
        border-color: rgba(23, 92, 211, 0.35);
        background: rgba(23, 92, 211, 0.04);
      }

      .swagger-ui .opblock.opblock-delete {
        border-color: rgba(180, 35, 24, 0.35);
        background: rgba(180, 35, 24, 0.04);
      }

      .swagger-ui button,
      .swagger-ui .btn,
      .swagger-ui select {
        border-radius: 8px !important;
        font-family: "Rubik", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
      }

      .swagger-ui .btn.authorize {
        border-color: var(--astir-teal);
        color: var(--astir-teal);
      }

      .swagger-ui input,
      .swagger-ui textarea,
      .swagger-ui select {
        border-color: var(--astir-line) !important;
        border-radius: 8px !important;
      }

      .swagger-ui table,
      .swagger-ui .model-box,
      .swagger-ui .responses-inner {
        border-radius: 8px;
      }

      .swagger-ui .model-title,
      .swagger-ui .tab li,
      .swagger-ui .response-col_status,
      .swagger-ui .parameter__name {
        font-family: "Rubik", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
      }

      @media (max-width: 920px) {
        .astir-console-hero {
          grid-template-columns: 1fr;
        }

        .astir-api-stage {
          min-height: 280px;
        }

        .astir-console-copy h1 {
          font-size: 2.75rem;
        }
      }

      @media (max-width: 620px) {
        .astir-console-bar {
          align-items: flex-start;
          flex-direction: column;
        }

        .astir-console-actions {
          justify-content: flex-start;
        }

        .astir-console-copy h1 {
          font-size: 2.25rem;
        }

        .astir-api-deck {
          grid-template-columns: 1fr;
        }

        .astir-route-card {
          min-height: 76px;
        }

        .swagger-ui .opblock .opblock-summary {
          align-items: flex-start;
          flex-wrap: wrap;
          gap: 8px;
        }

        .astir-op-chip {
          display: none;
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
    `,
    swaggerOptions: {
      defaultModelsExpandDepth: 1,
      displayRequestDuration: true,
      docExpansion: "list",
      filter: true,
      persistAuthorization: true,
      tryItOutEnabled: true
    }
  };
}
