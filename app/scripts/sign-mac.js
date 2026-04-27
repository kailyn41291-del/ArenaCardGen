// Ad-hoc codesign for macOS Electron app.
// Required on macOS 14+ for hardened runtime; without this the app may fail to
// launch even after `xattr -cr` removes the quarantine flag.
// Does NOT replace Apple notarization — users still need to run `xattr -cr`
// once on first install. See README.

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
