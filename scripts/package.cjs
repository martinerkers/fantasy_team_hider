const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const dest = path.join(root, 'dist', 'hltv-fantasy-team-hider');
fs.mkdirSync(dest, { recursive: true });
for (const file of fs.readdirSync(path.join(root, 'extension'))) {
  fs.copyFileSync(path.join(root, 'extension', file), path.join(dest, file));
}
fs.copyFileSync(path.join(root, 'README.md'), path.join(dest, 'README.md'));
if (process.platform === 'win32') {
  const quote = value => "'" + value.replaceAll("'", "''") + "'";
  const archive = path.join(root, 'dist', 'hltv-fantasy-team-hider.zip');
  execFileSync('powershell.exe', ['-NoProfile', '-Command', `Compress-Archive -LiteralPath ${quote(dest)} -DestinationPath ${quote(archive)} -Force`]);
  console.log(archive);
} else {
  console.log(`Unpacked extension: ${dest}`);
}
