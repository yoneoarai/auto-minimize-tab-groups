import { BrowserAdapter } from '../adapters/browser-adapter';
import { ConfigManager } from '../core/config-manager';
import { DEFAULT_TIMEOUT_MS } from '../common/constants';

const browserAdapter = new BrowserAdapter();
const configManager = new ConfigManager(browserAdapter);

function showMessage(message: string, isError: boolean): void {
  const container = document.getElementById('message-container');
  if (!container) return;

  const existingMessage = container.querySelector('.message');
  if (existingMessage) {
    existingMessage.remove();
  }

  const messageElement = document.createElement('div');
  messageElement.className = `message ${isError ? 'error' : 'success'}`;
  messageElement.textContent = message;

  container.appendChild(messageElement);

  setTimeout(() => {
    if (messageElement.parentNode) {
      messageElement.remove();
    }
  }, 3000);
}

function updateStatusDisplay(seconds: number): void {
  const currentTimeoutEl = document.getElementById('current-timeout');
  if (currentTimeoutEl) {
    currentTimeoutEl.textContent = `${seconds}s`;
  }
}

function setButtonLoading(button: HTMLButtonElement, isLoading: boolean): void {
  button.disabled = isLoading;
  button.textContent = isLoading ? 'Saving...' : 'Save';
}

document.addEventListener('DOMContentLoaded', async () => {
  const form = document.getElementById('settings-form') as HTMLFormElement;
  const timeoutInput = document.getElementById('timeout') as HTMLInputElement;
  const saveBtn = document.getElementById('save-btn') as HTMLButtonElement;
  const resetBtn = document.getElementById('reset-btn') as HTMLButtonElement;

  if (!form || !timeoutInput || !saveBtn || !resetBtn) {
    console.error('Required popup DOM elements not found');
    return;
  }

  // Load configuration
  try {
    await configManager.loadConfig();
    const currentSeconds = configManager.getTimeoutSeconds();
    timeoutInput.value = currentSeconds.toString();
    updateStatusDisplay(currentSeconds);
  } catch (error) {
    console.error('Failed to load settings:', error);
    showMessage('Failed to load current settings.', true);
  }

  // Listen to external config changes (e.g. from storage sync)
  configManager.onConfigChanged((config) => {
    const seconds = Math.round((config.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS) / 1000);
    updateStatusDisplay(seconds);
  });

  // Blur validation
  timeoutInput.addEventListener('blur', () => {
    const validation = ConfigManager.validateTimeoutSeconds(timeoutInput.value);
    if (!validation.isValid && validation.errorMessage) {
      showMessage(validation.errorMessage, true);
    }
  });

  // Form submission
  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const validation = ConfigManager.validateTimeoutSeconds(timeoutInput.value);
    if (!validation.isValid && validation.errorMessage) {
      showMessage(validation.errorMessage, true);
      return;
    }

    const seconds = Number(timeoutInput.value);
    setButtonLoading(saveBtn, true);

    try {
      await configManager.setTimeoutSeconds(seconds);
      setButtonLoading(saveBtn, false);
      showMessage(`Settings saved! Inactive groups will minimize after ${seconds}s.`, false);
      updateStatusDisplay(seconds);
    } catch (error: any) {
      setButtonLoading(saveBtn, false);
      showMessage(error?.message || 'Failed to save settings.', true);
    }
  });

  // Reset to default
  resetBtn.addEventListener('click', async () => {
    try {
      await configManager.resetToDefault();
      const defaultSeconds = configManager.getTimeoutSeconds();
      timeoutInput.value = defaultSeconds.toString();
      updateStatusDisplay(defaultSeconds);
      showMessage(`Settings reset to default (${defaultSeconds}s).`, false);
    } catch (error) {
      console.error('Failed to reset settings:', error);
      showMessage('Failed to reset settings.', true);
    }
  });

  // Keyboard shortcut (Cmd+Enter or Ctrl+Enter)
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      form.dispatchEvent(new Event('submit'));
    }
  });
});
