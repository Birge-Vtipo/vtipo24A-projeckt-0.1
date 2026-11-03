const { defineConfig, globalIgnores } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  globalIgnores(['dist/**', 'ios/**', 'android/**', '.expo/**', 'whatsapp-bot/private/**']),
  expoConfig,
]);
