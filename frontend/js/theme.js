// =============================================
//  TEMA — chiaro / scuro (segue il sistema, con override manuale)
// =============================================
(function () {
  const KEY = "theme";
  const root = document.documentElement;
  const media = window.matchMedia("(prefers-color-scheme: dark)");

  function stored() {
    try {
      return localStorage.getItem(KEY);
    } catch (e) {
      return null;
    }
  }

  function apply(theme) {
    root.setAttribute("data-theme", theme);
    root.setAttribute("data-bs-theme", theme);
    document.querySelectorAll(".theme-toggle i, .theme-fab i").forEach((i) => {
      i.className = theme === "dark" ? "fas fa-sun" : "fas fa-moon";
    });
  }

  apply(stored() || (media.matches ? "dark" : "light"));

  media.addEventListener("change", (e) => {
    if (!stored()) apply(e.matches ? "dark" : "light");
  });

  function toggle() {
    const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
    try {
      localStorage.setItem(KEY, next);
    } catch (e) {}
    apply(next);
  }

  document.addEventListener("DOMContentLoaded", () => {
    const actions = document.querySelector(".topbar-actions");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.title = "Cambia tema";
    btn.setAttribute("aria-label", "Cambia tema");
    btn.innerHTML = '<i class="fas fa-moon"></i>';
    btn.addEventListener("click", toggle);

    if (actions) {
      btn.className = "tb-btn tb-btn-ghost theme-toggle";
      actions.prepend(btn);
    } else {
      btn.className = "theme-fab";
      document.body.appendChild(btn);
    }
    apply(root.getAttribute("data-theme"));
  });
})();
