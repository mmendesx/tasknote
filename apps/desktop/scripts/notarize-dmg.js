// electron-builder notarizes the .app before wrapping it in the dmg, so the
// disk image itself ships signed but unnotarized. This hook submits the built
// dmg and staples its own ticket, so `spctl -t install` accepts it too.
//
// No-ops when notarization credentials are absent (local builds).
const { execFileSync } = require('child_process');

const TEAM_ID = 'RMS6H5M4K7';

exports.default = async function notarizeDmg({ artifactPaths }) {
  const { APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD } = process.env;
  if (!APPLE_ID || !APPLE_APP_SPECIFIC_PASSWORD) {
    console.log('  • skipped dmg notarization  reason=credentials absent');
    return;
  }

  const dmgs = artifactPaths.filter((p) => p.endsWith('.dmg'));
  for (const dmg of dmgs) {
    console.log(`  • notarizing dmg  file=${dmg}`);
    execFileSync(
      'xcrun',
      ['notarytool', 'submit', dmg, '--apple-id', APPLE_ID, '--team-id', TEAM_ID,
       '--password', APPLE_APP_SPECIFIC_PASSWORD, '--wait'],
      { stdio: 'inherit' },
    );
    execFileSync('xcrun', ['stapler', 'staple', dmg], { stdio: 'inherit' });
    console.log(`  • dmg notarized and stapled  file=${dmg}`);
  }
};
