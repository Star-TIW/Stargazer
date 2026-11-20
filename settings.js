const protection = document.getElementById("popup-protection");
protection.checked = localStorage.getItem("blockExternalPlayerPopups") === "on";
protection.onchange = () => localStorage.setItem("blockExternalPlayerPopups", protection.checked ? "on" : "off");

const language = document.getElementById("language");
language.value = localStorage.getItem("catalogLanguage") || "en-US";
language.onchange = () => {
  localStorage.setItem("catalogLanguage", language.value);
  window.parent.postMessage({type:"catalogLanguage"}, location.origin);
};

const buttons = document.querySelectorAll("[data-effect]");
function highlight() {
  buttons.forEach(button => {
    const selected = button.dataset.effect === currentEffect;
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-pressed", selected);
  });
}
highlight();
buttons.forEach(button => button.onclick = () => {
  localStorage.setItem("selectedEffect", button.dataset.effect);
  initParticles(button.dataset.effect);
  highlight();
  window.parent.postMessage({type:"particleEffect", effect:currentEffect}, location.origin);
});
