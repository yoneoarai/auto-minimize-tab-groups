import { BrowserAdapter } from '../adapters/browser-adapter';
import { ConfigManager } from '../core/config-manager';

const browserAdapter = new BrowserAdapter();
const configManager = new ConfigManager(browserAdapter);

async function refreshDisplay(): Promise<void> {
  const config = configManager.getConfig();

  const toggle = document.getElementById('popup-enable-toggle') as HTMLInputElement;
  if (toggle) {
    toggle.checked = config.enabled ?? true;
  }

  const rulesCountEl = document.getElementById('stat-rules-count');
  if (rulesCountEl) {
    rulesCountEl.textContent = String(config.rules?.length || 0);
  }

  const timeoutEl = document.getElementById('stat-timeout');
  if (timeoutEl) {
    timeoutEl.textContent = `${configManager.getTimeoutSeconds()}s`;
  }

  const groupsCountEl = document.getElementById('stat-groups-count');
  if (groupsCountEl) {
    try {
      const groups = await browserAdapter.queryTabGroups({});
      groupsCountEl.textContent = String(groups.length);
    } catch {
      groupsCountEl.textContent = '0';
    }
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  await configManager.loadConfig();
  await refreshDisplay();

  const toggle = document.getElementById('popup-enable-toggle') as HTMLInputElement;
  if (toggle) {
    toggle.addEventListener('change', async () => {
      await configManager.setEnabled(toggle.checked);
    });
  }

  const openSettingsBtn = document.getElementById('open-settings-btn');
  if (openSettingsBtn) {
    openSettingsBtn.addEventListener('click', () => {
      try {
        if (typeof chrome !== 'undefined' && chrome.runtime?.openOptionsPage) {
          chrome.runtime.openOptionsPage();
        } else if (typeof (globalThis as any).browser !== 'undefined' && (globalThis as any).browser.runtime?.openOptionsPage) {
          (globalThis as any).browser.runtime.openOptionsPage();
        } else {
          window.open('options.html');
        }
      } catch {
        window.open('options.html');
      }
      window.close();
    });
  }

  configManager.onConfigChanged(() => {
    refreshDisplay();
  });
});
