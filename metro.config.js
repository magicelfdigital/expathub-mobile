const fs = require("fs");
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const IGNORED_WATCH_SEGMENT = `${path.sep}.local${path.sep}`;
const origWatch = fs.watch;
fs.watch = function patchedWatch(target, ...args) {
  if (typeof target === "string" && target.includes(IGNORED_WATCH_SEGMENT)) {
    return {
      close() {},
      ref() { return this; },
      unref() { return this; },
      on() { return this; },
      once() { return this; },
      off() { return this; },
      addListener() { return this; },
      removeListener() { return this; },
      removeAllListeners() { return this; },
      emit() { return false; },
    };
  }
  return origWatch.call(this, target, ...args);
};

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
