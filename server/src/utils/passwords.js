const crypto = require('node:crypto');
const { promisify } = require('node:util');
const scrypt = promisify(crypto.scrypt);
let active = 0;
const validPassword = value => typeof value === 'string' && value.length > 0;
async function derive(password, salt) {
  if (active >= 2) throw Object.assign(new Error('Máy chủ đang bận, vui lòng thử lại sau.'), { status: 429 });
  active++;
  try { return await scrypt(password, salt, 64, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 }); }
  finally { active--; }
}
async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `scrypt$32768$8$3$${salt}$${(await derive(password, salt)).toString('hex')}`;
}
async function verifyPassword(password, hash) {
  if (!validPassword(password)) return false;
  const parts = String(hash || '').split('$');
  const good = parts.length === 6 && parts[0] === 'scrypt' && parts[1] === '32768' && parts[2] === '8' && parts[3] === '3' && /^[a-f0-9]{32}$/.test(parts[4]) && /^[a-f0-9]{128}$/.test(parts[5]);
  const result = await derive(password, good ? parts[4] : '00000000000000000000000000000000');
  return good && crypto.timingSafeEqual(result, Buffer.from(parts[5], 'hex'));
}
module.exports = { validPassword, hashPassword, verifyPassword };
