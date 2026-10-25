import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
const files = fs.readdirSync('dist').filter(name => name.endsWith('.js')).map(name => 'dist/' + name);
files.push('supabase/functions/apexgp-social/social.mjs');
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], {stdio: 'inherit'});
  if (result.status) process.exit(result.status);
}
console.log(`${files.length} moduli verificati.`);

