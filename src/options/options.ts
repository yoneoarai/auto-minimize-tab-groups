import { BrowserAdapter } from '../adapters/browser-adapter';
import { ConfigManager } from '../core/config-manager';
import { RuleEngine } from '../core/rule-engine';
import { GroupRule, TabGroupColor } from '../types/rules';
import { TAB_GROUP_COLORS, DEFAULT_TIMEOUT_MS } from '../common/constants';

const browserAdapter = new BrowserAdapter();
const configManager = new ConfigManager(browserAdapter);

let activeEditingRuleId: string | null = null;
let currentModalPatterns: string[] = [];
let currentModalColor: TabGroupColor = 'blue';

function showToast(message: string): void {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
  }, 2500);
}

function renderColorPicker(
  containerId: string,
  selectedColor: TabGroupColor,
  onSelect: (color: TabGroupColor) => void
): void {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';

  TAB_GROUP_COLORS.forEach((color) => {
    const choice = document.createElement('div');
    choice.className = `color-choice color-${color}${color === selectedColor ? ' selected' : ''}`;
    choice.title = color;
    choice.addEventListener('click', () => {
      container.querySelectorAll('.color-choice').forEach((el) => el.classList.remove('selected'));
      choice.classList.add('selected');
      onSelect(color);
    });
    container.appendChild(choice);
  });
}

function renderPatternTags(containerId: string, patterns: string[]): void {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';

  if (patterns.length === 0) {
    container.innerHTML = '<span style="color: #9aa0a6; font-size: 12px;">No patterns added yet.</span>';
    return;
  }

  patterns.forEach((pattern, index) => {
    const tag = document.createElement('span');
    tag.className = 'pattern-tag';
    tag.textContent = pattern;

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.innerHTML = '&times;';
    removeBtn.title = 'Remove pattern';
    removeBtn.addEventListener('click', () => {
      patterns.splice(index, 1);
      renderPatternTags(containerId, patterns);
      updateTesterResult();
    });

    tag.appendChild(removeBtn);
    container.appendChild(tag);
  });
}

function updateTesterResult(): void {
  const testerInput = document.getElementById('tester-input') as HTMLInputElement;
  const testerResult = document.getElementById('tester-result');
  if (!testerInput || !testerResult) return;

  const url = testerInput.value.trim();
  if (!url) {
    testerResult.textContent = 'Enter a URL to test against the patterns above';
    testerResult.className = 'tester-result';
    return;
  }

  let matched = false;
  let matchingPattern = '';
  for (const pattern of currentModalPatterns) {
    if (RuleEngine.testPattern(pattern, url)) {
      matched = true;
      matchingPattern = pattern;
      break;
    }
  }

  if (matched) {
    testerResult.textContent = `✅ Matches pattern "${matchingPattern}"`;
    testerResult.className = 'tester-result tester-success';
  } else {
    testerResult.textContent = '❌ Does not match any pattern';
    testerResult.className = 'tester-result tester-fail';
  }
}

function renderRulesList(): void {
  const container = document.getElementById('rules-container');
  if (!container) return;
  container.innerHTML = '';

  const rules = configManager.getRules();

  if (rules.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        No rules configured yet. Click "+ Add Rule" to create your first tab group rule!
      </div>
    `;
    return;
  }

  let draggedItem: HTMLElement | null = null;

  rules.forEach((rule) => {
    const item = document.createElement('div');
    item.className = 'rule-item';
    item.draggable = true;
    item.dataset.id = rule.id;

    let collapseBadge = 'Default timeout';
    if (!rule.collapse.enabled) {
      collapseBadge = 'Collapse: Disabled';
    } else if (rule.collapse.timeoutMs !== null) {
      collapseBadge = `Collapse: ${Math.round(rule.collapse.timeoutMs / 1000)}s`;
    }

    item.innerHTML = `
      <div class="rule-left">
        <span class="drag-handle" title="Drag to reorder">≡</span>
        <div class="color-dot color-${rule.color}"></div>
        <div class="rule-info">
          <span class="rule-name">${rule.name}</span>
          <span class="rule-patterns">${rule.patterns.join(', ')}</span>
          <span class="rule-badge">${collapseBadge}</span>
        </div>
      </div>
      <div class="rule-actions">
        <button class="btn btn-secondary btn-sm edit-rule-btn">Edit</button>
        <button class="btn btn-danger btn-sm delete-rule-btn">Delete</button>
      </div>
    `;

    // Drag and drop events
    item.addEventListener('dragstart', () => {
      draggedItem = item;
      item.classList.add('dragging');
    });

    item.addEventListener('dragend', () => {
      item.classList.remove('dragging');
      draggedItem = null;
    });

    item.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (!draggedItem || draggedItem === item) return;

      const children = Array.from(container.children);
      const curIndex = children.indexOf(item);
      const draggedIndex = children.indexOf(draggedItem);

      if (curIndex < draggedIndex) {
        container.insertBefore(draggedItem, item);
      } else {
        container.insertBefore(draggedItem, item.nextSibling);
      }
    });

    item.addEventListener('drop', async (e) => {
      e.preventDefault();
      const updatedIds = Array.from(container.querySelectorAll('.rule-item')).map(
        (el) => (el as HTMLElement).dataset.id!
      );
      await configManager.reorderRules(updatedIds);
      showToast('Rules reordered');
    });

    // Action buttons
    item.querySelector('.edit-rule-btn')?.addEventListener('click', () => {
      openRuleDialog(rule);
    });

    item.querySelector('.delete-rule-btn')?.addEventListener('click', async () => {
      if (confirm(`Delete rule "${rule.name}"?`)) {
        await configManager.deleteRule(rule.id);
        renderRulesList();
        showToast('Rule deleted');
      }
    });

    container.appendChild(item);
  });
}

function openRuleDialog(rule?: GroupRule): void {
  const dialog = document.getElementById('rule-dialog') as HTMLDialogElement;
  const title = document.getElementById('dialog-title');
  const nameInput = document.getElementById('rule-name-input') as HTMLInputElement;
  const patternInput = document.getElementById('pattern-input') as HTMLInputElement;
  const customTimeoutInput = document.getElementById('rule-custom-timeout') as HTMLInputElement;
  const testerInput = document.getElementById('tester-input') as HTMLInputElement;

  if (!dialog || !title || !nameInput || !patternInput) return;

  patternInput.value = '';
  if (testerInput) testerInput.value = '';
  updateTesterResult();

  if (rule) {
    activeEditingRuleId = rule.id;
    title.textContent = 'Edit Rule';
    nameInput.value = rule.name;
    currentModalColor = rule.color;
    currentModalPatterns = [...rule.patterns];

    if (!rule.collapse.enabled) {
      (document.querySelector('input[name="rule-collapse"][value="disabled"]') as HTMLInputElement).checked = true;
    } else if (rule.collapse.timeoutMs !== null) {
      (document.querySelector('input[name="rule-collapse"][value="custom"]') as HTMLInputElement).checked = true;
      if (customTimeoutInput) {
        customTimeoutInput.value = String(Math.round(rule.collapse.timeoutMs / 1000));
      }
    } else {
      (document.querySelector('input[name="rule-collapse"][value="default"]') as HTMLInputElement).checked = true;
    }
  } else {
    activeEditingRuleId = null;
    title.textContent = 'Add Rule';
    nameInput.value = '';
    currentModalColor = 'blue';
    currentModalPatterns = [];
    (document.querySelector('input[name="rule-collapse"][value="default"]') as HTMLInputElement).checked = true;
  }

  renderColorPicker('rule-color-picker', currentModalColor, (c) => {
    currentModalColor = c;
  });

  renderPatternTags('patterns-tags', currentModalPatterns);

  dialog.showModal();
}

document.addEventListener('DOMContentLoaded', async () => {
  const config = await configManager.loadConfig();

  // 1. Global Enable Toggle
  const globalToggle = document.getElementById('global-enable-toggle') as HTMLInputElement;
  if (globalToggle) {
    globalToggle.checked = config.enabled ?? true;
    globalToggle.addEventListener('change', async () => {
      await configManager.setEnabled(globalToggle.checked);
      showToast(globalToggle.checked ? 'Tabbi enabled' : 'Tabbi disabled');
    });
  }

  // 2. Default Timeout
  const defaultTimeoutInput = document.getElementById('default-timeout-input') as HTMLInputElement;
  if (defaultTimeoutInput) {
    defaultTimeoutInput.value = String(configManager.getTimeoutSeconds());
    defaultTimeoutInput.addEventListener('change', async () => {
      const validation = ConfigManager.validateTimeoutSeconds(defaultTimeoutInput.value);
      if (validation.isValid) {
        await configManager.setTimeoutSeconds(Number(defaultTimeoutInput.value));
        showToast('Default timeout saved');
      } else {
        alert(validation.errorMessage);
        defaultTimeoutInput.value = String(configManager.getTimeoutSeconds());
      }
    });
  }

  // 3. Unmatched Tabs Settings
  const unmatchedLeave = document.getElementById('unmatched-leave') as HTMLInputElement;
  const unmatchedGeneral = document.getElementById('unmatched-general') as HTMLInputElement;
  const generalSettingsDiv = document.getElementById('general-group-settings');
  const generalNameInput = document.getElementById('general-group-name') as HTMLInputElement;

  const updateGeneralVisibility = () => {
    if (generalSettingsDiv) {
      generalSettingsDiv.style.display = unmatchedGeneral.checked ? 'block' : 'none';
    }
  };

  if (unmatchedLeave && unmatchedGeneral) {
    if (config.unmatchedTabBehavior === 'general-group') {
      unmatchedGeneral.checked = true;
    } else {
      unmatchedLeave.checked = true;
    }
    updateGeneralVisibility();

    document.querySelectorAll('input[name="unmatched-behavior"]').forEach((r) => {
      r.addEventListener('change', async () => {
        updateGeneralVisibility();
        const behavior = unmatchedGeneral.checked ? 'general-group' : 'leave-ungrouped';
        await configManager.setUnmatchedBehavior(behavior);
        showToast('Unmatched tab settings saved');
      });
    });
  }

  if (generalNameInput) {
    generalNameInput.value = config.generalGroup?.name || 'General';
    generalNameInput.addEventListener('change', async () => {
      const name = generalNameInput.value.trim() || 'General';
      await configManager.setGeneralGroup({
        name,
        color: config.generalGroup?.color || 'grey',
        collapse: config.generalGroup?.collapse || { enabled: true, timeoutMs: null },
      });
      showToast('General group updated');
    });
  }

  renderColorPicker('general-group-colors', config.generalGroup?.color || 'grey', async (color) => {
    await configManager.setGeneralGroup({
      name: config.generalGroup?.name || 'General',
      color,
      collapse: config.generalGroup?.collapse || { enabled: true, timeoutMs: null },
    });
    showToast('General group color updated');
  });

  // 4. Group Ordering
  const orderingManual = document.getElementById('ordering-manual') as HTMLInputElement;
  const orderingAlpha = document.getElementById('ordering-alphabetical') as HTMLInputElement;
  if (orderingManual && orderingAlpha) {
    if (config.groupOrdering === 'alphabetical') {
      orderingAlpha.checked = true;
    } else {
      orderingManual.checked = true;
    }

    document.querySelectorAll('input[name="group-ordering"]').forEach((r) => {
      r.addEventListener('change', async () => {
        const mode = orderingAlpha.checked ? 'alphabetical' : 'manual';
        await configManager.setGroupOrdering(mode);
        showToast('Group ordering updated');
      });
    });
  }

  // 5. Reorganize on change
  const reorganizeCheckbox = document.getElementById('reorganize-on-change') as HTMLInputElement;
  if (reorganizeCheckbox) {
    reorganizeCheckbox.checked = config.reorganizeOnRuleChange ?? true;
    reorganizeCheckbox.addEventListener('change', async () => {
      await configManager.setReorganizeOnRuleChange(reorganizeCheckbox.checked);
      showToast('Setting saved');
    });
  }

  // 6. Export / Import / Reset
  const exportBtn = document.getElementById('export-btn');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(configManager.getConfig(), null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', dataStr);
      downloadAnchor.setAttribute('download', 'tabbi-settings.json');
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    });
  }

  const importInput = document.getElementById('import-input') as HTMLInputElement;
  if (importInput) {
    importInput.addEventListener('change', (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const contents = event.target?.result as string;
          await configManager.importConfig(contents);
          window.location.reload();
        } catch {
          alert('Failed to import configuration: Invalid JSON file.');
        }
      };
      reader.readAsText(file);
    });
  }

  const resetAllBtn = document.getElementById('reset-all-btn');
  if (resetAllBtn) {
    resetAllBtn.addEventListener('click', async () => {
      if (confirm('Are you sure you want to reset all settings to defaults? This cannot be undone.')) {
        await configManager.resetToDefault();
        window.location.reload();
      }
    });
  }

  // 7. Add Rule Flow with optional permission check
  const addRuleBtn = document.getElementById('add-rule-btn');
  if (addRuleBtn) {
    addRuleBtn.addEventListener('click', async () => {
      // Check for 'tabs' permission
      if (browserAdapter.hasPermission && browserAdapter.requestPermission) {
        const hasPerm = await browserAdapter.hasPermission(['tabs']);
        if (!hasPerm) {
          const granted = await browserAdapter.requestPermission(['tabs']);
          if (!granted) {
            alert('Notice: Tabbi requires the "tabs" permission to read URLs and organize tabs into groups.');
          }
        }
      }
      openRuleDialog();
    });
  }

  // Modal dialog controls
  const ruleDialog = document.getElementById('rule-dialog') as HTMLDialogElement;
  const closeDialogBtn = document.getElementById('close-dialog-btn');
  const cancelDialogBtn = document.getElementById('cancel-dialog-btn');
  const patternInput = document.getElementById('pattern-input') as HTMLInputElement;
  const addPatternBtn = document.getElementById('add-pattern-btn');
  const testerInput = document.getElementById('tester-input') as HTMLInputElement;
  const ruleForm = document.getElementById('rule-form') as HTMLFormElement;

  const closeDialog = () => ruleDialog?.close();
  closeDialogBtn?.addEventListener('click', closeDialog);
  cancelDialogBtn?.addEventListener('click', closeDialog);

  const addCurrentPattern = () => {
    if (!patternInput) return;
    const raw = patternInput.value.trim();
    if (!raw) return;

    const validation = RuleEngine.validatePattern(raw);
    if (!validation.isValid) {
      alert(validation.errorMessage);
      return;
    }

    if (!currentModalPatterns.includes(raw)) {
      currentModalPatterns.push(raw);
      renderPatternTags('patterns-tags', currentModalPatterns);
      patternInput.value = '';
      updateTesterResult();
    }
  };

  addPatternBtn?.addEventListener('click', addCurrentPattern);
  patternInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addCurrentPattern();
    }
  });

  testerInput?.addEventListener('input', updateTesterResult);

  // Form submit
  ruleForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nameInput = document.getElementById('rule-name-input') as HTMLInputElement;
    const name = nameInput.value.trim();
    if (!name) {
      alert('Please enter a group name.');
      return;
    }

    if (currentModalPatterns.length === 0) {
      alert('Please add at least one URL pattern.');
      return;
    }

    const collapseChoice = (
      document.querySelector('input[name="rule-collapse"]:checked') as HTMLInputElement
    )?.value;
    const customTimeoutInput = document.getElementById('rule-custom-timeout') as HTMLInputElement;

    let collapse: GroupRule['collapse'] = { enabled: true, timeoutMs: null };
    if (collapseChoice === 'disabled') {
      collapse = { enabled: false, timeoutMs: null };
    } else if (collapseChoice === 'custom') {
      const customSeconds = Number(customTimeoutInput.value);
      collapse = { enabled: true, timeoutMs: customSeconds * 1000 };
    }

    try {
      if (activeEditingRuleId) {
        await configManager.updateRule(activeEditingRuleId, {
          name,
          color: currentModalColor,
          patterns: currentModalPatterns,
          collapse,
        });
        showToast(`Rule "${name}" updated`);
      } else {
        await configManager.addRule({
          name,
          color: currentModalColor,
          patterns: currentModalPatterns,
          collapse,
        });
        showToast(`Rule "${name}" created`);
      }

      ruleDialog.close();
      renderRulesList();
    } catch (err: any) {
      alert(err.message || 'Error saving rule');
    }
  });

  // Render initial list
  renderRulesList();
});
