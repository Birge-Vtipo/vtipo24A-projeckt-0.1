const fs = require('node:fs/promises');
const path = require('node:path');
const { AndroidConfig, withAndroidManifest, withDangerousMod, withMainApplication } = require('expo/config-plugins');

const PACKAGE = 'kz.birge.notifications';
const SERVICE = `${PACKAGE}.BirgeLiveNotificationsService`;
const IMPORT = `import ${PACKAGE}.BirgeLiveNotificationsPackage`;

module.exports = function withLiveNotifications(config) {
  config = withAndroidManifest(config, mod => {
    const manifest = mod.modResults.manifest;
    const required = ['android.permission.POST_NOTIFICATIONS', 'android.permission.FOREGROUND_SERVICE', 'android.permission.FOREGROUND_SERVICE_REMOTE_MESSAGING'];
    manifest['uses-permission'] = (manifest['uses-permission'] || []).filter(entry => !required.includes(entry.$['android:name']));
    manifest['uses-permission'].push(...required.map(name => ({ $: { 'android:name': name } })));
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(mod.modResults);
    application.service = (application.service || []).filter(entry => entry.$['android:name'] !== SERVICE);
    application.service.push({ $: { 'android:name': SERVICE, 'android:exported': 'false', 'android:foregroundServiceType': 'remoteMessaging', 'android:stopWithTask': 'false' } });
    return mod;
  });
  config = withMainApplication(config, mod => {
    if (mod.modResults.language !== 'kt') throw new Error('Birge live notifications requires the Expo Kotlin MainApplication template.');
    let contents = mod.modResults.contents;
    if (!contents.includes(IMPORT)) contents = contents.replace(/^(package [^\r\n]+)\r?\n/m, `$1\n\n${IMPORT}\n`);
    if (!contents.includes('add(BirgeLiveNotificationsPackage())')) {
      const marker = /PackageList\(this\)\.packages\.apply\s*\{/;
      if (!marker.test(contents)) throw new Error('Cannot register the Birge live notifications package in MainApplication.');
      contents = contents.replace(marker, '$&\n          add(BirgeLiveNotificationsPackage())');
    }
    mod.modResults.contents = contents;
    return mod;
  });
  return withDangerousMod(config, ['android', async mod => {
    const root = mod.modRequest.platformProjectRoot;
    const destination = path.join(root, 'app', 'src', 'main', 'java', ...PACKAGE.split('.'));
    await fs.mkdir(destination, { recursive: true });
    for (const name of ['LiveCredentials.kt', 'BirgeLiveNotificationsModule.kt', 'BirgeLiveNotificationsPackage.kt', 'BirgeLiveNotificationsService.kt']) {
      await fs.copyFile(path.join(__dirname, 'android', name), path.join(destination, name));
    }
    const drawable = path.join(root, 'app', 'src', 'main', 'res', 'drawable');
    await fs.mkdir(drawable, { recursive: true });
    await fs.copyFile(path.join(__dirname, 'android', 'birge_live_notification.xml'), path.join(drawable, 'birge_live_notification.xml'));
    return mod;
  }]);
};
