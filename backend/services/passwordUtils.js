// =============================================
//  UTILITÀ GESTIONE PASSWORD
// =============================================

const crypto = require("crypto");

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto
    .pbkdf2Sync(password, salt, 10000, 64, "sha512")
    .toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, hashedPassword) {
  const [salt, hash] = hashedPassword.split(":");
  const verifyHash = crypto
    .pbkdf2Sync(password, salt, 10000, 64, "sha512")
    .toString("hex");
  return hash === verifyHash;
}

function validatePassword(password) {
  const errors = [];

  if (password.length < 8) {
    errors.push("La password deve essere di almeno 8 caratteri");
  }

  if (!/[A-Z]/.test(password)) {
    errors.push("La password deve contenere almeno una lettera maiuscola");
  }

  if (!/[a-z]/.test(password)) {
    errors.push("La password deve contenere almeno una lettera minuscola");
  }

  if (!/[0-9]/.test(password)) {
    errors.push("La password deve contenere almeno un numero");
  }

  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    errors.push("La password deve contenere almeno un carattere speciale");
  }

  return errors;
}

module.exports = {
  hashPassword,
  verifyPassword,
  validatePassword,
};