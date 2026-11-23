import { delimiter, join } from 'node:path';
import { bundledPuppeteerChrome, resolveChromeForLaunch, resolveSystemChrome, type ChromeProbe } from './system-chrome';

const noFile: ChromeProbe['isFile'] = () => false;

function probe(partial: Partial<ChromeProbe> & { files?: string[] }): ChromeProbe {
  const files = new Set(partial.files ?? []);
  return {
    platform: partial.platform ?? 'linux',
    env: partial.env ?? {},
    isFile: partial.isFile ?? (path => files.has(path)),
  };
}

describe('resolveSystemChrome', () => {
  it('uses the macOS Google Chrome application before Edge', () => {
    const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    const edge = '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge';
    expect(resolveSystemChrome(probe({ platform: 'darwin', files: [chrome, edge] }))).toBe(chrome);
  });

  it('uses Chrome under the home Applications folder', () => {
    const chrome = join('/Users/dev', 'Applications', 'Google Chrome.app', 'Contents', 'MacOS', 'Google Chrome');
    expect(resolveSystemChrome(probe({ platform: 'darwin', env: { HOME: '/Users/dev' }, files: [chrome] }))).toBe(
      chrome,
    );
  });

  it('uses the Windows per-user Chrome install', () => {
    const chrome = join('C:\\Users\\dev\\AppData\\Local', 'Google', 'Chrome', 'Application', 'chrome.exe');
    expect(
      resolveSystemChrome(
        probe({ platform: 'win32', env: { LOCALAPPDATA: 'C:\\Users\\dev\\AppData\\Local' }, files: [chrome] }),
      ),
    ).toBe(chrome);
  });

  it('uses a Chrome binary on PATH when no fixed path exists', () => {
    const chrome = join('/opt/google', 'google-chrome');
    expect(
      resolveSystemChrome(
        probe({ platform: 'linux', env: { PATH: ['/usr/bin', '/opt/google'].join(delimiter) }, files: [chrome] }),
      ),
    ).toBe(chrome);
  });

  it('returns undefined when this laptop has no browser', () => {
    expect(
      resolveSystemChrome(probe({ platform: 'linux', env: { PATH: '/usr/bin' }, isFile: noFile })),
    ).toBeUndefined();
  });
});

describe('resolveChromeForLaunch', () => {
  it('keeps an operator path ahead of Puppeteer and the system browser', () => {
    expect(
      resolveChromeForLaunch({
        configured: '/usr/bin/chromium',
        bundled: () => '/cache/chrome',
        system: () => '/Applications/Google Chrome',
      }),
    ).toEqual({ path: '/usr/bin/chromium', source: 'configured' });
  });

  it('uses Puppeteer Chrome when the cache has it', () => {
    expect(
      resolveChromeForLaunch({
        bundled: () => '/cache/chrome',
        system: () => '/usr/bin/google-chrome',
      }),
    ).toEqual({ path: '/cache/chrome', source: 'puppeteer' });
  });

  it('uses the system browser when Puppeteer cannot find its downloaded Chrome', () => {
    expect(
      resolveChromeForLaunch({
        bundled: () => {
          throw new Error('Could not find Chrome');
        },
        system: () => '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      }),
    ).toEqual({
      path: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      source: 'system',
    });
  });

  it('reports none when neither cache nor system has a browser', () => {
    expect(resolveChromeForLaunch({ bundled: () => undefined, system: () => undefined })).toEqual({ source: 'none' });
  });
});

describe('bundledPuppeteerChrome', () => {
  it('does not throw when the Jest Puppeteer mock has no downloaded Chrome', () => {
    expect(bundledPuppeteerChrome()).toBeUndefined();
  });
});
