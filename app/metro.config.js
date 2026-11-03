const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const defaults = config.resolver.blockList;
const excludedDirectories = ['whatsapp-bot', 'desktop', 'dist'];

// The phone bundle must not crawl the bot's live browser profile or server files.
config.resolver.blockList = [
  ...(Array.isArray(defaults) ? defaults : defaults ? [defaults] : []),
  ...excludedDirectories.map((directory) => {
    const absolutePath = path.resolve(__dirname, directory).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`^${absolutePath}(?:[/\\\\]|$)`);
  }),
];
config.maxWorkers = 2;

module.exports = config;
