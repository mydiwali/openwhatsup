import { createRequire } from 'node:module';
import { statSync } from 'node:fs';
import { delimiter, join } from 'node:path';

const nodeRequire = createRequire(__filename);

/** How the browser path passed to Puppeteer was chosen. */
export type ChromeSource = 'configured' | 'puppeteer' | 'system' | 'none';

export interface ChromeProbe {
  platform: NodeJS.Platform;
  env: NodeJS.ProcessEnv;
  isFile: (path: string) => boolean;
}

const UNIX_NAMES = [
  'google-chrome',
  'google-chrome-stable',
  'chromium',
  'chromium-browser',
  'microsoft-edge',
  'microsoft-edge-stable',
];

const WINDOWS_NAMES = ['chrome.exe', 'msedge.exe'];

/**
 * Chrome, Chromium, and Edge paths that are not on PATH. Edge is last: it is a Chromium build
 * present on a stock Windows laptop when Chrome itself was never installed.
 */
export function systemChromeCandidates(platform: NodeJS.Platform, env: NodeJS.ProcessEnv): string[] {
  const home = env.HOME || env.USERPROFILE;
  if (platform === 'darwin') {
    const roots = ['/Applications', home ? join(home, 'Applications') : undefined].filter((root): root is string =>
      Boolean(root),
    );
    return roots.flatMap(root => [
      join(root, 'Google Chrome.app', 'Contents', 'MacOS', 'Google Chrome'),
      join(root, 'Chromium.app', 'Contents', 'MacOS', 'Chromium'),
      join(root, 'Microsoft Edge.app', 'Contents', 'MacOS', 'Microsoft Edge'),
    ]);
  }
  if (platform === 'win32') {
    const roots = [env.PROGRAMFILES, env['PROGRAMFILES(X86)'], env.LOCALAPPDATA].filter((root): root is string =>
      Boolean(root),
    );
    return roots.flatMap(root => [
      join(root, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      join(root, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    ]);
  }
  return [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
  ];
}

/** First installed system browser, or undefined when this laptop has none of the known binaries. */
export function resolveSystemChrome(probe: ChromeProbe): string | undefined {
  for (const candidate of systemChromeCandidates(probe.platform, probe.env)) {
    if (probe.isFile(candidate)) return candidate;
  }
  const names = probe.platform === 'win32' ? WINDOWS_NAMES : UNIX_NAMES;
  for (const dir of (probe.env.PATH ?? '').split(delimiter)) {
    if (!dir) continue;
    for (const name of names) {
      const candidate = join(dir, name);
      if (probe.isFile(candidate)) return candidate;
    }
  }
  return undefined;
}

/**
 * Browser Puppeteer should launch.
 *
 * An operator path wins. Otherwise the Chrome Puppeteer downloaded into its cache wins, which is
 * what a source install and the Docker image already use. Only when that cache has no Chrome —
 * the "Could not find Chrome" session failure — does a system browser on this laptop fill in.
 */
export function resolveChromeForLaunch(input: {
  configured?: string;
  bundled?: () => string | undefined;
  system?: () => string | undefined;
}): { path?: string; source: ChromeSource } {
  const configured = input.configured?.trim();
  if (configured) return { path: configured, source: 'configured' };
  try {
    const bundled = input.bundled?.();
    if (bundled) return { path: bundled, source: 'puppeteer' };
  } catch {
    // puppeteer.executablePath() throws when its downloaded Chrome is not in the cache.
  }
  const system = input.system?.();
  if (system) return { path: system, source: 'system' };
  return { source: 'none' };
}

/** Puppeteer's downloaded Chrome, or undefined when the cache (or the Jest mock) has none. */
export function bundledPuppeteerChrome(): string | undefined {
  try {
    const puppeteer = nodeRequire('puppeteer') as { executablePath?: () => string };
    if (typeof puppeteer.executablePath !== 'function') return undefined;
    const found = puppeteer.executablePath();
    return typeof found === 'string' && found.length > 0 ? found : undefined;
  } catch {
    return undefined;
  }
}

export function defaultChromeProbe(): ChromeProbe {
  return {
    platform: process.platform,
    env: process.env,
    isFile: path => {
      try {
        return statSync(path).isFile();
      } catch {
        return false;
      }
    },
  };
}
