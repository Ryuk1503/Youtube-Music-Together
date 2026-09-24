const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { gzip } = require('node:zlib');
const { promisify } = require('node:util');

async function saveResetBackup(snapshot, directory = path.join(os.homedir(), '.ytm-together-backups')) {
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const target = path.join(directory, 'database-reset.json.gz');
  const temporary = target + '.tmp';
  let file;
  try {
    const compressed = await promisify(gzip)(JSON.stringify(snapshot));
    file = await fs.open(temporary, 'w', 0o600);
    await file.writeFile(compressed);
    await file.sync();
    await file.close();
    file = null;
    // Replace only after the new backup is fully written. This file is outside public/.
    await fs.rename(temporary, target);
  } finally {
    if (file) await file.close();
    await fs.rm(temporary, { force: true });
  }
}
module.exports = { saveResetBackup };
