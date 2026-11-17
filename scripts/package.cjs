const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const source = path.join(root, 'extension');
const manifest = JSON.parse(fs.readFileSync(path.join(source, 'manifest.json'), 'utf8'));
const firefox = require('./firefox-manifest.json');

for (const browser of ['chrome', 'firefox']) {
  const name = `hltv-fantasy-team-hider${browser === 'firefox' ? '-firefox' : ''}`;
  const dest = path.join(root, 'dist', name);
  fs.mkdirSync(dest, { recursive: true });
  for (const file of fs.readdirSync(source)) {
    fs.copyFileSync(path.join(source, file), path.join(dest, file));
  }
  fs.writeFileSync(path.join(dest, 'manifest.json'), JSON.stringify({
    ...manifest, ...(browser === 'firefox' ? firefox : {})
  }, null, 2) + '\n');
  fs.copyFileSync(path.join(root, 'README.md'), path.join(dest, 'README.md'));
  if (process.platform === 'win32') {
    const quote = value => "'" + value.replaceAll("'", "''") + "'";
    const archive = path.join(root, 'dist', `${name}.zip`);
    // Firefox requires manifest.json at the archive root, without a wrapper folder.
    execFileSync('powershell.exe', ['-NoProfile', '-Command',
      `$ErrorActionPreference = 'Stop'; Compress-Archive -Path ${quote(path.join(dest, '*'))} -DestinationPath ${quote(archive)} -Force`]);
    console.log(archive);
  } else {
    console.log(`Unpacked ${browser} extension: ${dest}`);
  }
}
