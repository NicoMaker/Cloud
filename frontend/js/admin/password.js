// =============================================
//  ADMIN: PASSWORD (toggle visibilità + validazione forza)
// =============================================

function togglePassword(inputId, iconId) {
  const input = document.getElementById(inputId);
  const icon = document.getElementById(iconId);
  if (!input || !icon) return;

  if (input.type === "password") {
    input.type = "text";
    icon.classList.replace("fa-eye", "fa-eye-slash");
  } else {
    input.type = "password";
    icon.classList.replace("fa-eye-slash", "fa-eye");
  }
}

// Genera una password casuale che rispetta tutti i requisiti e la mostra in chiaro
function generatePassword(inputId, iconId) {
  const sets = {
    upper: "ABCDEFGHJKLMNPQRSTUVWXYZ",
    lower: "abcdefghijkmnopqrstuvwxyz",
    number: "23456789",
    special: "!@#$%^&*",
  };
  const all = Object.values(sets).join("");
  const rnd = (max) => {
    const buf = new Uint32Array(1);
    const limit = Math.floor(0x100000000 / max) * max;
    do {
      crypto.getRandomValues(buf);
    } while (buf[0] >= limit);
    return buf[0] % max;
  };
  const pick = (chars) => chars[rnd(chars.length)];

  const chars = Object.values(sets).map(pick);
  while (chars.length < 14) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = rnd(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  const input = document.getElementById(inputId);
  input.value = chars.join("");
  input.type = "text";
  const icon = document.getElementById(iconId);
  if (icon) icon.className = "fas fa-eye-slash";
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

async function copyPassword(inputId, buttonId) {
  const input = document.getElementById(inputId);
  const btn = document.getElementById(buttonId);
  if (!input || !input.value) return;
  try {
    await navigator.clipboard.writeText(input.value);
  } catch (e) {
    input.select();
    document.execCommand("copy");
  }
  if (btn) {
    const old = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-check"></i> Copiata';
    setTimeout(() => (btn.innerHTML = old), 1500);
  }
}

function setupPasswordValidation() {
  const passwordInput = document.getElementById("password");
  const editPasswordInput = document.getElementById("editPassword");

  if (passwordInput) {
    passwordInput.addEventListener("input", (e) =>
      validatePasswordStrength(
        e.target.value,
        "passwordStrength",
        "createUserBtn",
      ),
    );
  }

  if (editPasswordInput) {
    editPasswordInput.addEventListener("input", (e) =>
      validatePasswordStrength(e.target.value, "editPasswordStrength"),
    );
  }
}

function validatePasswordStrength(
  password,
  strengthElementId,
  buttonId = null,
) {
  const strengthElement = document.getElementById(strengthElementId);
  const button = buttonId ? document.getElementById(buttonId) : null;

  const requirements = {
    length: password.length >= 8,
    upper: /[A-Z]/.test(password),
    lower: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[!@#$%^&*(),.?":{}|<>]/.test(password),
  };

  if (strengthElementId === "passwordStrength") {
    updateRequirementIndicators(requirements);
  }

  const validCount = Object.values(requirements).filter(Boolean).length;

  if (password.length === 0) {
    strengthElement.style.width = "0%";
    strengthElement.className = "pw-strength-fill";
  } else if (validCount < 3) {
    strengthElement.className = "pw-strength-fill strength-weak";
  } else if (validCount < 5) {
    strengthElement.className = "pw-strength-fill strength-medium";
  } else {
    strengthElement.className = "pw-strength-fill strength-strong";
  }

  if (button) {
    button.disabled =
      !Object.values(requirements).every(Boolean) || password.length === 0;
  }
}

function updateRequirementIndicators(requirements) {
  const indicators = {
    "req-length": requirements.length,
    "req-upper": requirements.upper,
    "req-lower": requirements.lower,
    "req-number": requirements.number,
    "req-special": requirements.special,
  };

  Object.entries(indicators).forEach(([id, valid]) => {
    const element = document.getElementById(id);
    if (element) element.classList.toggle("valid", valid);
  });
}

// Esposizione globale (togglePassword è chiamata da onclick inline)
window.togglePassword = togglePassword;
window.generatePassword = generatePassword;
window.copyPassword = copyPassword;
window.setupPasswordValidation = setupPasswordValidation;
window.validatePasswordStrength = validatePasswordStrength;
