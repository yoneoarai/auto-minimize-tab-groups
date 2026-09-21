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
    const emptySpan = document.createElement('span');
    emptySpan.style.color = '#9aa0a6';
    emptySpan.style.fontSize = '12px';
    emptySpan.textContent = 'No patterns added yet.';
    container.appendChild(emptySpan);
    return;
  }

  patterns.forEach((pattern, index) => {
    const tag = document.createElement('span');
    tag.className = 'pattern-tag';
    tag.textContent = pattern;

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.textContent = '×';
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
  const patternInput = document.getElementById('pattern-input') as HTMLInputElement;
  if (!testerInput || !testerResult) return;

  const url = testerInput.value.trim();
  if (!url) {
    testerResult.textContent = '';
    return;
  }

  // Check all added patterns plus any pending pattern currently typed in patternInput
  const patternsToTest = [...currentModalPatterns];
  const pendingPattern = patternInput?.value.trim();
  if (pendingPattern && !patternsToTest.includes(pendingPattern)) {
    patternsToTest.unshift(pendingPattern);
  }

  if (patternsToTest.length === 0) {
    testerResult.textContent = 'Add a pattern to test against';
    testerResult.className = 'tester-result';
    return;
  }

  let matched = false;
  let matchingPattern = '';
  for (const pattern of patternsToTest) {
    if (RuleEngine.testPattern(pattern, url)) {
      matched = true;
      matchingPattern = pattern;
      break;
    }
  }

  if (matched) {
    testerResult.textContent = `✅ Matches "${matchingPattern}"`;
    testerResult.className = 'tester-result tester-success';
  } else {
    testerResult.textContent = '❌ No match';
    testerResult.className = 'tester-result tester-fail';
  }
}

function updatePriorityStateForFallback(isFallback: boolean, evaluateLast: boolean): void {
  const priorityInput = document.getElementById('rule-priority-input') as HTMLInputElement;
  const priorityHint = document.getElementById('rule-priority-hint');
  const evalLastCheckbox = document.getElementById('rule-eval-last-input') as HTMLInputElement;
  const evalLastContainer = document.getElementById('fallback-eval-last-container');

  if (!priorityInput) return;

  if (isFallback) {
    if (evalLastContainer) evalLastContainer.style.display = 'block';
    if (evalLastCheckbox) evalLastCheckbox.checked = evaluateLast;
    if (evaluateLast) {
      priorityInput.disabled = true;
      if (priorityHint) priorityHint.textContent = 'Fallback group is evaluated after all other rules.';
    } else {
      priorityInput.disabled = false;
      if (priorityHint) priorityHint.textContent = 'Matching precedence (1 = tested first).';
    }
  } else {
    if (evalLastContainer) evalLastContainer.style.display = 'none';
    priorityInput.disabled = false;
    if (priorityHint) priorityHint.textContent = 'Matching precedence (1 = tested first).';
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

  rules.forEach((rule, index) => {
    const item = document.createElement('div');
    item.className = `rule-item${rule.isFallback ? ' fallback-rule-item' : ''}`;
    item.draggable = true;
    item.dataset.id = rule.id;

    let collapseBadge = 'Default timeout';
    if (!rule.collapse.enabled) {
      collapseBadge = 'Collapse: Disabled';
    } else if (rule.collapse.timeoutMs !== null) {
      collapseBadge = `Collapse: ${Math.round(rule.collapse.timeoutMs / 1000)}s`;
    }

    const priorityNum = typeof rule.priority === 'number' ? rule.priority : (rule.order ?? index) + 1;
    const isFallback = Boolean(rule.isFallback);

    let priorityBadgeHtml = '';
    if (isFallback) {
      if (rule.evaluateLast !== false) {
        priorityBadgeHtml = `<span class="priority-badge" title="Evaluated last after all other rules">Priority: Last</span>`;
      } else {
        priorityBadgeHtml = `<span class="priority-badge ${priorityNum === 1 ? 'p1' : ''}" title="Evaluation Priority ${priorityNum}">Priority ${priorityNum}</span>`;
      }
    } else {
      priorityBadgeHtml = `<span class="priority-badge ${priorityNum === 1 ? 'p1' : ''}" title="Evaluation Priority ${priorityNum}">Priority ${priorityNum}</span>`;
    }

    const fallbackBadgeHtml = isFallback
      ? `<span class="fallback-badge">Fallback</span>`
      : '';

    const patternsText = isFallback
      ? 'Matches all unmatched tabs'
      : rule.patterns.join(', ');

    const deleteBtnHtml = isFallback
      ? ''
      : `<button class="btn btn-danger btn-sm delete-rule-btn">Delete</button>`;

    item.innerHTML = `
      <div class="rule-left">
        <span class="drag-handle" title="Drag to reorder tab strip position">⋮⋮</span>
        <div class="color-dot color-${rule.color}"></div>
        <div class="rule-info">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="rule-name"></span>
            ${fallbackBadgeHtml}
            ${priorityBadgeHtml}
          </div>
          <span class="rule-patterns" style="${isFallback ? 'font-style: italic; color: var(--text-secondary);' : ''}">${patternsText}</span>
          <span class="rule-badge">${collapseBadge}</span>
        </div>
      </div>
      <div class="rule-actions">
        <button class="btn btn-secondary btn-sm edit-rule-btn">Edit</button>
        ${deleteBtnHtml}
      </div>
    `;

    item.querySelector('.rule-name')!.textContent = rule.name;

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
      showToast('Tab group order updated');
    });

    // Action buttons
    item.querySelector('.edit-rule-btn')?.addEventListener('click', () => {
      openRuleDialog(rule);
    });

    if (!isFallback) {
      item.querySelector('.delete-rule-btn')?.addEventListener('click', async () => {
        if (confirm(`Delete rule "${rule.name}"?`)) {
          await configManager.deleteRule(rule.id);
          renderRulesList();
          showToast('Rule deleted');
        }
      });
    }

    container.appendChild(item);
  });

  // Container-level drop listener ensures drops in margins/padding are persisted
  container.addEventListener('dragover', (e) => {
    e.preventDefault();
  });

  container.addEventListener('drop', async (e) => {
    e.preventDefault();
    const updatedIds = Array.from(container.querySelectorAll('.rule-item')).map(
      (el) => (el as HTMLElement).dataset.id!
    );
    await configManager.reorderRules(updatedIds);
    showToast('Rules reordered');
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
  const testerRow = document.getElementById('tester-row');
  if (testerRow) testerRow.style.display = 'none';
  if (testerInput) testerInput.value = '';
  updateTesterResult();

  const priorityInput = document.getElementById('rule-priority-input') as HTMLInputElement;
  const orderInput = document.getElementById('rule-order-input') as HTMLInputElement;
  const fallbackInfo = document.getElementById('fallback-info-container');
  const patternsContainer = document.getElementById('standard-patterns-container');
  const existingRules = configManager.getRules();
  const isFallback = Boolean(rule?.isFallback);

  if (fallbackInfo) fallbackInfo.style.display = isFallback ? 'block' : 'none';
  if (patternsContainer) patternsContainer.style.display = isFallback ? 'none' : 'block';

  if (rule) {
    activeEditingRuleId = rule.id;
    title.textContent = isFallback ? 'Edit Catch-All Fallback Group' : 'Edit Rule';
    nameInput.value = rule.name;
    currentModalColor = rule.color;
    currentModalPatterns = isFallback ? [] : [...rule.patterns];

    if (priorityInput) {
      const prio = typeof rule.priority === 'number' ? rule.priority : (rule.order ?? 0) + 1;
      priorityInput.value = String(prio);
      priorityInput.min = '1';
      priorityInput.removeAttribute('max');
    }

    if (orderInput) {
      const currentIdx = existingRules.findIndex((r) => r.id === rule.id);
      const pos = currentIdx !== -1 ? currentIdx + 1 : (rule.order ?? 0) + 1;
      orderInput.value = String(pos);
      orderInput.min = '1';
      orderInput.max = String(Math.max(1, existingRules.length));
    }

    updatePriorityStateForFallback(isFallback, isFallback ? (rule.evaluateLast !== false) : false);

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
    if (customTimeoutInput) {
      customTimeoutInput.value = '5';
    }
    if (priorityInput) {
      priorityInput.value = '1';
      priorityInput.min = '1';
      priorityInput.removeAttribute('max');
    }
    if (orderInput) {
      const nextPos = existingRules.length + 1;
      orderInput.value = String(nextPos);
      orderInput.min = '1';
      orderInput.max = String(nextPos);
    }
    updatePriorityStateForFallback(false, false);
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

  // Permission Warning Banner check
  const permBanner = document.getElementById('permission-banner');
  const grantPermBtn = document.getElementById('grant-permission-btn');
  const updatePermissionBanner = async () => {
    try {
      if (browserAdapter.hasPermission) {
        const hasPerm = await browserAdapter.hasPermission(['tabs']);
        if (permBanner) {
          permBanner.style.display = hasPerm ? 'none' : 'block';
        }
      }
    } catch {
      if (permBanner) permBanner.style.display = 'none';
    }
  };
  await updatePermissionBanner();

  grantPermBtn?.addEventListener('click', async () => {
    try {
      if (browserAdapter.requestPermission) {
        const granted = await browserAdapter.requestPermission(['tabs']);
        if (granted) {
          showToast('Tabs permission granted');
          await updatePermissionBanner();
        }
      }
    } catch (e) {
      console.warn('Could not request permission:', e);
    }
  });

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

  // 3. Catch-All Group Toggle
  const catchAllToggle = document.getElementById('catch-all-toggle') as HTMLInputElement;
  if (catchAllToggle) {
    catchAllToggle.checked = config.unmatchedTabBehavior === 'general-group';
    catchAllToggle.addEventListener('change', async () => {
      const behavior = catchAllToggle.checked ? 'general-group' : 'leave-ungrouped';
      await configManager.setUnmatchedBehavior(behavior);
      renderRulesList();
      showToast(catchAllToggle.checked ? 'Catch-all group enabled' : 'Catch-all group disabled');
    });
  }

  // Fallback dialog priority toggle listener
  const evalLastCheckbox = document.getElementById('rule-eval-last-input') as HTMLInputElement;
  evalLastCheckbox?.addEventListener('change', () => {
    updatePriorityStateForFallback(true, evalLastCheckbox.checked);
  });

  // 4. Group Ordering
  const orderingManual = document.getElementById('ordering-manual') as HTMLInputElement;
  const orderingAlpha = document.getElementById('ordering-alphabetical') as HTMLInputElement;
  const orderingHint = document.getElementById('ordering-hint');

  const updateOrderingHint = (isAlpha: boolean) => {
    if (orderingHint) {
      orderingHint.textContent = isAlpha
        ? 'Alphabetical: tab groups in browser will be sorted A-Z'
        : 'Manual: drag to arrange tab groups';
    }
  };

  if (orderingManual && orderingAlpha) {
    if (config.groupOrdering === 'alphabetical') {
      orderingAlpha.checked = true;
      updateOrderingHint(true);
    } else {
      orderingManual.checked = true;
      updateOrderingHint(false);
    }

    document.querySelectorAll('input[name="group-ordering"]').forEach((r) => {
      r.addEventListener('change', async () => {
        const mode = orderingAlpha.checked ? 'alphabetical' : 'manual';
        updateOrderingHint(orderingAlpha.checked);
        await configManager.setGroupOrdering(mode);
        showToast(`Group ordering set to ${mode}`);
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
          showToast('Configuration imported successfully!');
          setTimeout(() => {
            window.location.reload();
          }, 400);
        } catch (err: any) {
          alert(`Failed to import configuration: ${err?.message || 'Invalid JSON file.'}`);
          importInput.value = '';
        }
      };
      reader.readAsText(file);
    });
  }

  const resetAllBtn = document.getElementById('reset-all-btn');
  if (resetAllBtn) {
    resetAllBtn.addEventListener('click', async () => {
      const confirmed = confirm(
        'Are you sure you want to reset all settings to defaults?\n\n' +
        '⚠️ This will permanently delete all of your group rules, URL patterns, and configurations. This cannot be undone.'
      );
      if (confirmed) {
        await configManager.resetToDefault();
        window.location.reload();
      }
    });
  }

  // 7. Add Rule Flow with optional permission check
  const addRuleBtn = document.getElementById('add-rule-btn');
  if (addRuleBtn) {
    addRuleBtn.addEventListener('click', async () => {
      // Check for 'tabs' permission safely
      try {
        if (browserAdapter.hasPermission && browserAdapter.requestPermission) {
          const hasPerm = await browserAdapter.hasPermission(['tabs']);
          if (!hasPerm) {
            const granted = await browserAdapter.requestPermission(['tabs']);
            if (!granted) {
              alert('Notice: Tabbi requires the "tabs" permission to read URLs and organize tabs into groups.');
            }
          }
        }
      } catch (err) {
        console.warn('Could not check or request tabs permission:', err);
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
    } else {
      showToast(`Pattern "${raw}" is already added.`);
      patternInput.value = '';
    }
  };

  addPatternBtn?.addEventListener('click', addCurrentPattern);
  patternInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addCurrentPattern();
    }
  });

  const toggleTestBtn = document.getElementById('toggle-test-btn');
  const testerRow = document.getElementById('tester-row');
  toggleTestBtn?.addEventListener('click', () => {
    if (!testerRow) return;
    const isVisible = testerRow.style.display !== 'none';
    testerRow.style.display = isVisible ? 'none' : 'block';
    if (!isVisible && testerInput) {
      testerInput.focus();
      updateTesterResult();
    }
  });

  // Automatically test URL as user types it
  testerInput?.addEventListener('input', updateTesterResult);

  // Automatically test when pattern input changes
  patternInput?.addEventListener('input', () => {
    if (testerRow && testerRow.style.display !== 'none') {
      updateTesterResult();
    }
  });

  // Prevent Enter key in name or timeout from prematurely submitting form
  ruleForm?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const target = e.target as HTMLElement;
      if (target.id === 'pattern-input') {
        return; // Handled by patternInput keydown
      }
      if (target.tagName === 'INPUT') {
        e.preventDefault();
      }
    }
  });

  // Form submit
  ruleForm?.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Auto-add any pending pattern typed in the pattern input box
    if (patternInput && patternInput.value.trim()) {
      addCurrentPattern();
    }

    const nameInput = document.getElementById('rule-name-input') as HTMLInputElement;
    const name = nameInput.value.trim();
    if (!name) {
      alert('Please enter a group name.');
      return;
    }

    const editingRule = activeEditingRuleId ? configManager.getRuleById(activeEditingRuleId) : undefined;
    const isFallback = Boolean(editingRule?.isFallback);

    if (!isFallback && currentModalPatterns.length === 0) {
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

    const priorityInput = document.getElementById('rule-priority-input') as HTMLInputElement;
    const priorityVal = parseInt(priorityInput?.value || '1', 10);
    const targetPriority = !isNaN(priorityVal) && priorityVal >= 1 ? priorityVal : 1;

    const orderInput = document.getElementById('rule-order-input') as HTMLInputElement;
    const orderVal = parseInt(orderInput?.value || '1', 10);
    const targetOrder = !isNaN(orderVal) && orderVal >= 1 ? orderVal - 1 : undefined;

    const evalLastInput = document.getElementById('rule-eval-last-input') as HTMLInputElement;
    const evaluateLast = isFallback ? (evalLastInput ? evalLastInput.checked : true) : undefined;

    try {
      if (activeEditingRuleId) {
        await configManager.updateRule(activeEditingRuleId, {
          name,
          color: currentModalColor,
          patterns: isFallback ? [] : currentModalPatterns,
          collapse,
          priority: targetPriority,
          order: targetOrder,
          evaluateLast,
        });
        showToast(isFallback ? `Catch-all group "${name}" updated` : `Rule "${name}" updated`);
      } else {
        await configManager.addRule({
          name,
          color: currentModalColor,
          patterns: currentModalPatterns,
          collapse,
          priority: targetPriority,
          order: targetOrder,
        });
        showToast(`Rule "${name}" created`);
      }

      ruleDialog.close();
      renderRulesList();
    } catch (err: any) {
      alert(err.message || 'Error saving rule');
    }
  });

  // Listen for config changes from popup or background
  configManager.onConfigChanged((updatedConfig) => {
    renderRulesList();
    if (globalToggle) {
      globalToggle.checked = updatedConfig.enabled ?? true;
    }
    if (catchAllToggle) {
      catchAllToggle.checked = updatedConfig.unmatchedTabBehavior === 'general-group';
    }
    if (defaultTimeoutInput && document.activeElement !== defaultTimeoutInput) {
      defaultTimeoutInput.value = String(configManager.getTimeoutSeconds());
    }
  });

  // Render initial list
  renderRulesList();
});
