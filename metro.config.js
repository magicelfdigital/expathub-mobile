const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

const blockedDirs = [
  path.resolve(__dirname, ".local"),
  path.resolve(__dirname, "web", "dist"),
];

const escapeRegExp = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const dirToRegex = (dir) => {
  const escaped = escapeRegExp(dir).replace(/[/\\]/g, "[/\\\\]");
  return new RegExp(`^${escaped}(?:[/\\\\].*)?$`);
};

config.resolver = config.resolver || {};
config.resolver.blockList = [
  ...(Array.isArray(config.resolver.blockList)
    ? config.resolver.blockList
    : config.resolver.blockList
    ? [config.resolver.blockList]
    : []),
  ...blockedDirs.map(dirToRegex),
];

config.watchFolders = (config.watchFolders || []).filter(
  (folder) => !blockedDirs.some((blocked) => folder === blocked || folder.startsWith(blocked + path.sep))
);

module.exports = config;
