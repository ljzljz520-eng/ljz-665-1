'use strict';
const crypto = require('crypto');

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password, stored) {
  try {
    const [algo, salt, hash] = String(stored).split('$');
    if (algo !== 'scrypt' || !salt || !hash) return false;
    const calc = crypto.scryptSync(String(password), salt, 64);
    return crypto.timingSafeEqual(calc, Buffer.from(hash, 'hex'));
  } catch {
    return false;
  }
}

module.exports = { hashPassword, verifyPassword };
