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
let currentEffect = localStorage.getItem("selectedEffect") || "stars";
let fadeContainer = document.getElementById("particles-js");
let isLoading = false;
initParticles(currentEffect);

document.querySelectorAll(".particle-button").forEach((btn) => {
  btn.addEventListener("click", () => {
    const effect = btn.dataset.effect;
    if (effect !== currentEffect && !isLoading) switchEffect(effect);
  });
});

function switchEffect(effect) {
  isLoading = true;
  fadeContainer.style.opacity = 0;
  setTimeout(() => {
    initParticles(effect);
    fadeContainer.style.opacity = 1;
    isLoading = false;
  }, 500);
}

function initParticles(effect) {
  currentEffect = effect;
  localStorage.setItem("selectedEffect", effect);
  if (window.pJSDom && window.pJSDom.length > 0) {
    window.pJSDom[0].pJS.fn.vendors.destroypJS();
    window.pJSDom = [];
  }
  particlesJS("particles-js", particleOptions[effect]);
}

// ================= Settings Button ================= //
const settingsBtn = document.getElementById("settings-btn");
settingsBtn.addEventListener("click", () => {
  let videoContainer = document.getElementById("video-container");
  let videoIframe = document.getElementById("video-iframe");
  let closeVideoX = document.getElementById("close-video-x");

  if (!videoContainer) {
    videoContainer = document.createElement("div");
    videoContainer.id = "video-container";
    Object.assign(videoContainer.style, {
      position: "fixed",
      top: "0",
      left: "0",
      width: "100%",
      height: "100%",
      background: "rgba(0,0,0,0.85)",
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      zIndex: "200"
    });

    const videoWrapper = document.createElement("div");
    videoWrapper.id = "video-wrapper";
    Object.assign(videoWrapper.style, {
      position: "relative",
      width: "75vw",
      height: "75vh",
      maxWidth: "1200px",
      maxHeight: "800px",
      background: "#000",
      borderRadius: "12px",
      boxShadow: "0 4px 20px rgba(239,239,136,0.3)",
      overflow: "hidden"
    });

    closeVideoX = document.createElement("span");
    closeVideoX.id = "close-video-x";
    closeVideoX.innerHTML = "&times;";
    Object.assign(closeVideoX.style, {
      position: "absolute",
      top: "10px",
      right: "15px",
      color: "#efef88",
      fontSize: "32px",
      fontWeight: "bold",
      cursor: "pointer",
      zIndex: "250",
      transition: "color 0.3s ease"
    });

    videoIframe = document.createElement("iframe");
    videoIframe.id = "video-iframe";
    videoIframe.setAttribute("frameborder", "0");
    videoIframe.setAttribute(
      "allow",
      "autoplay; fullscreen; encrypted-media; picture-in-picture"
    );
    videoIframe.setAttribute("allowfullscreen", "");
    Object.assign(videoIframe.style, {
      width: "100%",
      height: "100%",
      border: "none",
      display: "block"
    });

    videoWrapper.appendChild(closeVideoX);
    videoWrapper.appendChild(videoIframe);
    videoContainer.appendChild(videoWrapper);
    document.body.appendChild(videoContainer);
  }

  videoIframe.src = "/settings.html";
  videoContainer.style.display = "flex";

  const hideOverlay = () => {
    videoIframe.src = "";
    videoContainer.style.display = "none";
  };
  closeVideoX.onclick = hideOverlay;
  videoContainer.onclick = (e) => {
    if (e.target === videoContainer) hideOverlay();
  };
});

window.addEventListener("message", (event) => {
  if (!event.data || event.data.type !== "particleEffect") return;
  const effect = event.data.effect;
  if (effect && effect !== currentEffect) {
    switchEffect(effect);
  }
});

// Hamburger toggle function
function toggleMenu(btn) {
  btn.classList.toggle("active");
  const navbar = document.getElementById("navbar");
  navbar.classList.toggle("active");
}
