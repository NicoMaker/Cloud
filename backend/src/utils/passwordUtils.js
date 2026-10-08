// =============================================
//  UTILITÀ GESTIONE PASSWORD
// =============================================

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

// ---------------------------------------------------------
//  Copia CIFRATA (AES-256-GCM) della password, così l'admin
//  può rivederla nel pannello. Chiave: variabile d'ambiente
//  PASSWORD_VIEW_KEY oppure file backend/db/.pwkey (generato
//  al primo avvio). Chi ottiene DB + chiave legge le password!
// ---------------------------------------------------------
let cachedKey = null;
function getViewKey() {
  if (cachedKey) return cachedKey;
  if (process.env.PASSWORD_VIEW_KEY) {
    cachedKey = crypto
      .createHash("sha256")
      .update(process.env.PASSWORD_VIEW_KEY)
      .digest();
    return cachedKey;
  }
  const dir = path.join(__dirname, "..", "..", "db");
  const file = path.join(dir, ".pwkey");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, crypto.randomBytes(32).toString("hex"), {
      mode: 0o600,
    });
  }
  cachedKey = Buffer.from(fs.readFileSync(file, "utf8").trim(), "hex");
  return cachedKey;
}

function encryptPassword(password) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getViewKey(), iv);
  const enc = Buffer.concat([cipher.update(password, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, enc].map((b) => b.toString("hex")).join(":");
}

function decryptPassword(stored) {
  if (!stored) return null;
  try {
    const [iv, tag, enc] = stored.split(":").map((h) => Buffer.from(h, "hex"));
    const decipher = crypto.createDecipheriv("aes-256-gcm", getViewKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString(
      "utf8",
    );
  } catch (e) {
    return null; // chiave cambiata o dato corrotto
  }
}

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
  encryptPassword,
  decryptPassword,
  validatePassword,
};
