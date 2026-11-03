const { withAndroidManifest } = require('expo/config-plugins');

// Old Birge builds disabled ImagePicker's microphone permission. Incremental
// prebuild preserves that tools:node="remove" entry unless it is cleared.
module.exports = function withVoicePermission(config) {
  return withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults.manifest;
    const permissions = manifest['uses-permission'] || [];
    const name = 'android.permission.RECORD_AUDIO';
    manifest['uses-permission'] = permissions.filter((entry) => entry.$['android:name'] !== name);
    manifest['uses-permission'].push({ $: { 'android:name': name } });
    return mod;
  });
};
