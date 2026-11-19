// Particle options
const particleOptions = {
  stars: {
    particles: {
      number: { value: 570, density: { enable: true, value_area: 800 } },
      color: { value: "#efef88" },
      shape: {
        type: "circle",
        stroke: { width: 0, color: "#000000" }
      },
      opacity: {
        value: 1,
        random: true,
        anim: { enable: true, speed: 1, opacity_min: 0, sync: false }
      },
      size: { value: 3, random: true, anim: { enable: false } },
      line_linked: { enable: false },
      move: {
        enable: true,
        speed: 5,
        direction: "none",
        random: true,
        straight: false,
        out_mode: "out"
      }
    },
    interactivity: {
      detect_on: "canvas",
      events: { onhover: { enable: false }, onclick: { enable: false } }
    },
    retina_detect: true
  },
  shapes: {
    particles: {
      number: { value: 100, density: { enable: true, value_area: 800 } },
      color: { value: "#efef88" },
      shape: { type: "circle" },
      opacity: { value: 0.5 },
      size: { value: 4, random: true },
      line_linked: {
        enable: true,
        distance: 150,
        color: "#efef88",
        opacity: 0.4,
        width: 1
      },
      move: {
        enable: true,
        speed: 6,
        direction: "none",
        straight: false,
        out_mode: "out"
      }
    },
    interactivity: {
      detect_on: "canvas",
      events: { onhover: { enable: false }, onclick: { enable: false } }
    },
    retina_detect: true
  },
  bubbles: {
    particles: {
      number: { value: 9, density: { enable: true, value_area: 800 } },
      color: { value: "#efef88" },
      shape: { type: "polygon" },
      opacity: { value: 0.1, random: true },
      size: { value: 160, anim: { enable: true, speed: 16 } },
      line_linked: { enable: false },
      move: { enable: true, speed: 8, direction: "none" }
    },
    interactivity: {
      detect_on: "canvas",
      events: { onhover: { enable: false }, onclick: { enable: false } }
    },
    retina_detect: true
  },
  snow: {
    particles: {
      number: { value: 400, density: { enable: true, value_area: 800 } },
      color: { value: "#efef88" },
      shape: { type: "circle" },
      opacity: { value: 0.5, random: true },
      size: { value: 10, random: true },
      line_linked: { enable: false },
      move: {
        enable: true,
        speed: 6,
        direction: "bottom",
        straight: false,
        out_mode: "out"
      }
    },
    interactivity: {
      detect_on: "canvas",
      events: { onhover: { enable: false }, onclick: { enable: false } }
    },
    retina_detect: true
  }
};

// Particle effect control
const PARTICLE_STORAGE_KEY = "selectedEffect";
const VALID_EFFECTS = [...Object.keys(particleOptions), "off"];
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
let currentEffect = localStorage.getItem(PARTICLE_STORAGE_KEY) || (reducedMotion.matches ? "off" : "stars");
let slowdown;

function initParticles(effect = currentEffect) {
  currentEffect = VALID_EFFECTS.includes(effect) ? effect : "stars";
  document.documentElement.classList.toggle("motion-off", currentEffect === "off");
  clearInterval(slowdown);
  const previous = window.pJSDom?.[0]?.pJS;
  if (previous) {
    previous.fn.vendors.destroypJS();
    window.pJSDom = [];
  }
  if (currentEffect === "off" || !document.getElementById("particles-js")) return;
  particlesJS("particles-js", particleOptions[currentEffect]);
  const instance = window.pJSDom[0].pJS;
  let steps = 0;
  slowdown = setInterval(() => {
    instance.particles.move.speed *= 0.7;
    if (++steps === 12) {
      clearInterval(slowdown);
      cancelAnimationFrame(instance.fn.drawAnimFrame);
    }
  }, 300);
}

// Settings page controls its own buttons. Main pages only need the particles + Settings modal.
initParticles(currentEffect);

if (document.getElementById("settings-btn")) {
  const settingsBtn = document.getElementById("settings-btn");
  let settingsOverlay = null;

  function closeSettings() {
    if (!settingsOverlay) return;
    settingsOverlay.style.display = "none";
    document.body.style.overflow = "";
    const frame = settingsOverlay.querySelector("iframe");
    if (frame) frame.src = "about:blank";
  }

  function openSettings() {
    if (!settingsOverlay) {
      settingsOverlay = document.createElement("div");
      settingsOverlay.id = "settings-overlay";
      settingsOverlay.innerHTML = `
        <div class="settings-modal" role="dialog" aria-modal="true" aria-label="Particle settings">
          <button type="button" class="settings-close" aria-label="Close settings">&times;</button>
          <iframe title="Particle Settings" src="about:blank" frameborder="0" allowtransparency="true"></iframe>
        </div>`;
      Object.assign(settingsOverlay.style, {
        position: "fixed", inset: "0", display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,.82)", zIndex: "99999", padding: "20px",
        backdropFilter: "blur(6px)"
      });
      const modal = settingsOverlay.querySelector(".settings-modal");
      Object.assign(modal.style, {
        position: "relative", width: "min(900px, 95vw)", height: "min(650px, 90vh)",
        background: "#0d0d0d", borderRadius: "16px", overflow: "hidden",
        boxShadow: "0 20px 80px rgba(0,0,0,.6)"
      });
      const frame = settingsOverlay.querySelector("iframe");
      Object.assign(frame.style, { width: "100%", height: "100%", border: "0" });
      const close = settingsOverlay.querySelector(".settings-close");
      Object.assign(close.style, {
        position: "absolute", top: "8px", right: "12px", zIndex: "2", background: "rgba(0,0,0,.65)",
        color: "#efef88", border: "0", borderRadius: "50%", width: "40px", height: "40px",
        fontSize: "28px", lineHeight: "40px", cursor: "pointer"
      });
      close.addEventListener("click", closeSettings);
      settingsOverlay.addEventListener("click", (e) => { if (e.target === settingsOverlay) closeSettings(); });
      document.body.appendChild(settingsOverlay);
    }

    const frame = settingsOverlay.querySelector("iframe");
    frame.src = "/settings.html";
    settingsOverlay.style.display = "flex";
    document.body.style.overflow = "hidden";
    settingsOverlay.querySelector(".settings-close")?.focus();
  }

  settingsBtn.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    openSettings();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeSettings();
  });

  window.addEventListener("message", (event) => {
    if (event.origin !== window.location.origin) return;
    if (event.source !== settingsOverlay?.querySelector("iframe")?.contentWindow) return;
    if (event.data?.type === "catalogLanguage") { location.reload(); return; }
    if (event.data?.type !== "particleEffect") return;
    const effect = event.data.effect;
    if (VALID_EFFECTS.includes(effect) && effect !== currentEffect) initParticles(effect);
  });
}

// Hamburger toggle function
function toggleMenu(btn) {
  if (!btn) return;
  btn.setAttribute("aria-expanded", btn.classList.toggle("active"));
  const navbar = document.getElementById("navbar");
  if (navbar) navbar.classList.toggle("active");
}

document.addEventListener("click", (event) => {
  const navbar = document.getElementById("navbar");
  const menuToggle = document.querySelector(".menu-toggle");
  if (!navbar || !menuToggle) return;
  if (navbar.classList.contains("active") && !navbar.contains(event.target) && !menuToggle.contains(event.target)) {
    navbar.classList.remove("active");
    menuToggle.classList.remove("active");
    menuToggle.setAttribute("aria-expanded", "false");
  }
});

// Fade out to black
document.querySelectorAll("a.nav-button").forEach((link) => {
  link.addEventListener("click", () => {
    let fade = document.getElementById("page-fade");
    if (!fade) {
      fade = document.createElement("div");
      fade.id = "page-fade";
      Object.assign(fade.style, {
        position: "fixed", top: "0", left: "0", width: "100%", height: "100%",
        background: "black", opacity: "0", transition: "opacity 0.5s ease-in",
        zIndex: "99999", pointerEvents: "none"
      });
      document.body.appendChild(fade);
    }
    requestAnimationFrame(() => { fade.style.opacity = "1"; });
  });
});

