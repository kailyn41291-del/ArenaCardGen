// Ad-hoc codesign for macOS Electron app.
// Required on macOS 14+ for hardened runtime.
// Does NOT replace Apple notarization — users still run `xattr -cr` once
// to remove the quarantine flag from browser-downloaded .dmg.

const { execSync } = require('child_process');
const path = require('path');

exports.default = async function (context) {
  if (context.electronPlatformName !== 'darwin') return;

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(context.appOutDir, `${appName}.app`);
  const entitlementsPath = path.join(__dirname, '..', 'build', 'entitlements.mac.plist');

  console.log(`\n[sign-mac] ad-hoc signing: ${appPath}`);

  execSync(
    `codesign --force --deep --sign - --options runtime ` +
      `--entitlements "${entitlementsPath}" "${appPath}"`,
    { stdio: 'inherit' }
  );

  execSync(`codesign --verify --verbose=2 "${appPath}"`, { stdio: 'inherit' });

  console.log('[sign-mac] done\n');
};
