import { BrowserAPI } from './browser-api';

interface ValidationResult {
  isValid: boolean;
  errorMessage?: string;
}

/**
 * Validates the timeout input value
 * @param value The input value to validate
 * @returns Validation result with error message if invalid
 */
function validateTimeoutInput(value: string): ValidationResult {
  const numValue = Number(value);
  
  if (!value.trim()) {
    return { isValid: false, errorMessage: "Please enter a timeout value." };
  }
  
  if (isNaN(numValue)) {
    return { isValid: false, errorMessage: "Please enter a valid number." };
  }
  
  if (numValue < 1) {
    return { isValid: false, errorMessage: "Timeout must be at least 1 second." };
  }
  
  if (numValue > 3600) {
    return { isValid: false, errorMessage: "Timeout cannot exceed 1 hour (3600 seconds)." };
  }
  
  return { isValid: true };
}

/**
 * Shows a message to the user
 * @param message The message to display
 * @param isError Whether this is an error message
 */
function showMessage(message: string, isError: boolean) {
  const container = document.getElementById('message-container');
  if (!container) return;
  
  // Remove any existing messages
  const existingMessage = container.querySelector('.message');
  if (existingMessage) {
    existingMessage.remove();
  }
  
  const messageElement = document.createElement('div');
  messageElement.className = `message ${isError ? 'error' : 'success'}`;
  messageElement.textContent = message;
  
  container.appendChild(messageElement);
  
  // Auto-remove messages after 3 seconds
  setTimeout(() => {
    if (messageElement.parentNode) {
      messageElement.remove();
    }
  }, 3000);
}

/**
 * Updates the status section with current information
 */
function updateStatus() {
  BrowserAPI.storageGet(['timeout']).then((data) => {
    const timeout = (data.timeout || 30000) / 1000;
    const currentTimeoutEl = document.getElementById('current-timeout');
    if (currentTimeoutEl) {
      currentTimeoutEl.textContent = `${timeout}s`;
    }
  }).catch((error) => {
    console.error('Failed to load timeout from storage:', error);
  });
}

/**
 * Sets button loading state
 * @param button The button element
 * @param isLoading Whether the button should show loading state
 */
function setButtonLoading(button: HTMLButtonElement, isLoading: boolean) {
  button.disabled = isLoading;
  button.textContent = isLoading ? 'Saving...' : 'Save';
}

document.addEventListener('DOMContentLoaded', function () {
  const form = document.getElementById('settings-form') as HTMLFormElement;
  const timeoutInput = document.getElementById('timeout') as HTMLInputElement;
  const saveBtn = document.getElementById('save-btn') as HTMLButtonElement;
  const resetBtn = document.getElementById('reset-btn') as HTMLButtonElement;
  
  if (!form || !timeoutInput || !saveBtn || !resetBtn) {
    console.error('Required DOM elements not found');
    return;
  }

  // Load current timeout value
  BrowserAPI.storageGet(['timeout']).then((data) => {
    const timeout = (data.timeout || 30000) / 1000; // Convert to seconds
    timeoutInput.value = timeout.toString();
  }).catch((error) => {
    console.error('Failed to load timeout from storage:', error);
    showMessage('Failed to load current settings.', true);
  });

  // Update status information
  updateStatus();

  // Input validation on blur
  timeoutInput.addEventListener('blur', function() {
    const validation = validateTimeoutInput(timeoutInput.value);
    if (!validation.isValid) {
      showMessage(validation.errorMessage!, true);
    }
  });

  // Form submission with validation
  form.addEventListener('submit', function (event) {
    event.preventDefault();
    
    // Validate input
    const validation = validateTimeoutInput(timeoutInput.value);
    if (!validation.isValid) {
      showMessage(validation.errorMessage!, true);
      return;
    }
    
    const timeoutValue = Number(timeoutInput.value) * 1000; // Convert to milliseconds
    
    setButtonLoading(saveBtn, true);
    
    // Save to storage
    BrowserAPI.storageSet({ timeout: timeoutValue }).then(() => {
      setButtonLoading(saveBtn, false);
      console.log(`Timeout value saved: ${timeoutValue}ms`);
      showMessage(`Settings saved! Groups will minimize after ${timeoutInput.value} seconds.`, false);
      
      // Update status display
      updateStatus();
    }).catch((error) => {
      setButtonLoading(saveBtn, false);
      console.error('Failed to save timeout to storage:', error);
      showMessage('Failed to save settings. Please try again.', true);
    });
  });

  // Reset button functionality
  resetBtn.addEventListener('click', function() {
    timeoutInput.value = '30'; // Default 30 seconds
    
    BrowserAPI.storageSet({ timeout: 30000 }).then(() => {
      showMessage('Settings reset to default (30 seconds).', false);
      updateStatus();
    }).catch((error) => {
      console.error('Failed to reset timeout:', error);
      showMessage('Failed to reset settings.', true);
    });
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', function(event) {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      form.dispatchEvent(new Event('submit'));
    }
  });
});
