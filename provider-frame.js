// A compatibility choice belongs to the current player session only.
function providerModeControl(reload) {
  const label = document.createElement("label");
  label.className = "provider-mode";
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  label.append(checkbox, " Compatibility mode (allows popups)");
  checkbox.addEventListener("change", reload);
  return {
    label,
    reset() { checkbox.checked = false; },
    configure(frame) {
      if (checkbox.checked) frame.removeAttribute("sandbox");
      else frame.setAttribute("sandbox", "allow-scripts allow-same-origin allow-presentation");
    }
  };
}
