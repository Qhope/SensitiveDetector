/**
 * Popup JavaScript
 * Handles the extension popup interface and custom pattern management
 */

class PopupManager {
  constructor() {
    this.customPatterns = [];
    this.init();
  }

  init() {
    this.loadElements();
    this.setupEventListeners();
    this.loadSecurityStatus();
    this.loadCustomPatterns();
    this.loadSettings();
  }

  loadElements() {
    // Security status elements
    this.statusIndicator = document.getElementById('statusIndicator');
    this.statusText = document.getElementById('statusText');
    
    // Custom patterns elements
    this.customPatternsContainer = document.getElementById('customPatterns');
    this.addPatternBtn = document.getElementById('addPatternBtn');
    
    // Modal elements
    this.modal = document.getElementById('addPatternModal');
    this.modalClose = document.getElementById('modalClose');
    this.cancelBtn = document.getElementById('cancelBtn');
    this.savePatternBtn = document.getElementById('savePatternBtn');
    
    // Form elements
    this.patternName = document.getElementById('patternName');
    this.patternRegex = document.getElementById('patternRegex');
    this.patternSeverity = document.getElementById('patternSeverity');
    this.patternTest = document.getElementById('patternTest');
    this.testResult = document.getElementById('testResult');
    
    // Settings elements
    this.scanIframes = document.getElementById('scanIframes');
    this.scanShadowDOM = document.getElementById('scanShadowDOM');
    this.showNotifications = document.getElementById('showNotifications');
    
    // Export/Import elements
    this.exportBtn = document.getElementById('exportBtn');
    this.importBtn = document.getElementById('importBtn');
    this.importFile = document.getElementById('importFile');
  }

  setupEventListeners() {
    // Modal controls
    this.addPatternBtn.addEventListener('click', () => this.openModal());
    this.modalClose.addEventListener('click', () => this.closeModal());
    this.cancelBtn.addEventListener('click', () => this.closeModal());
    this.savePatternBtn.addEventListener('click', () => this.savePattern());
    
    // Form validation
    this.patternRegex.addEventListener('input', () => this.testPattern());
    this.patternTest.addEventListener('input', () => this.testPattern());
    
    // Settings
    this.scanIframes.addEventListener('change', () => this.saveSettings());
    this.scanShadowDOM.addEventListener('change', () => this.saveSettings());
    this.showNotifications.addEventListener('change', () => this.saveSettings());
    
    // Export/Import
    this.exportBtn.addEventListener('click', () => this.exportSettings());
    this.importBtn.addEventListener('click', () => this.importFile.click());
    this.importFile.addEventListener('change', (e) => this.importSettings(e));
    
    // Close modal on outside click
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) {
        this.closeModal();
      }
    });
  }

  async loadSecurityStatus() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'getSecurityStatus' });
      
      if (response.success) {
        this.updateSecurityStatus(response);
      } else {
        this.statusIndicator.className = 'status-indicator checking';
        this.statusText.textContent = 'Unable to check security status';
      }
    } catch (error) {
      console.error('Error loading security status:', error);
      this.statusIndicator.className = 'status-indicator checking';
      this.statusText.textContent = 'Security check failed';
    }
  }

  updateSecurityStatus(status) {
    if (status.isSecure) {
      this.statusIndicator.className = 'status-indicator secure';
      this.statusText.textContent = status.isHttps ? 
        'Secure HTTPS connection' : 
        'Local development (secure)';
    } else {
      this.statusIndicator.className = 'status-indicator insecure';
      this.statusText.textContent = 'Insecure HTTP connection - Sensitive data at risk!';
    }
  }

  async loadCustomPatterns() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'getCustomPatterns' });
      
      if (response.success) {
        this.customPatterns = response.patterns;
        this.renderCustomPatterns();
      }
    } catch (error) {
      console.error('Error loading custom patterns:', error);
    }
  }

  renderCustomPatterns() {
    this.customPatternsContainer.innerHTML = '';
    
    if (this.customPatterns.length === 0) {
      this.customPatternsContainer.innerHTML = `
        <div class="pattern-item" style="opacity: 0.6;">
          <span class="pattern-name">No custom patterns added</span>
        </div>
      `;
      return;
    }

    this.customPatterns.forEach((pattern, index) => {
      const patternElement = document.createElement('div');
      patternElement.className = 'custom-pattern';
      
      patternElement.innerHTML = `
        <div class="custom-pattern-info">
          <div class="custom-pattern-name">${this.escapeHtml(pattern.name)}</div>
          <div class="custom-pattern-regex">${this.escapeHtml(pattern.pattern)}</div>
        </div>
        <div class="custom-pattern-actions">
          <button class="action-btn edit" data-index="${index}">Edit</button>
          <button class="action-btn delete" data-index="${index}">Delete</button>
        </div>
      `;
      
      this.customPatternsContainer.appendChild(patternElement);
    });
    
    // Add event listeners for edit/delete buttons
    this.customPatternsContainer.addEventListener('click', (e) => {
      if (e.target.classList.contains('edit')) {
        const index = parseInt(e.target.dataset.index);
        this.editPattern(index);
      } else if (e.target.classList.contains('delete')) {
        const index = parseInt(e.target.dataset.index);
        this.deletePattern(index);
      }
    });
  }

  openModal(editIndex = null) {
    this.editingIndex = editIndex;
    
    if (editIndex !== null) {
      const pattern = this.customPatterns[editIndex];
      this.patternName.value = pattern.name;
      this.patternRegex.value = pattern.pattern;
      this.patternSeverity.value = pattern.severity;
    } else {
      this.patternName.value = '';
      this.patternRegex.value = '';
      this.patternSeverity.value = 'medium';
    }
    
    this.patternTest.value = '';
    this.testResult.style.display = 'none';
    this.modal.style.display = 'flex';
  }

  closeModal() {
    this.modal.style.display = 'none';
    this.editingIndex = null;
  }

  testPattern() {
    const pattern = this.patternRegex.value.trim();
    const testText = this.patternTest.value.trim();
    
    if (!pattern || !testText) {
      this.testResult.style.display = 'none';
      return;
    }

    try {
      const regex = new RegExp(pattern, 'gi');
      const matches = testText.match(regex);
      
      if (matches) {
        this.testResult.className = 'test-result success';
        this.testResult.textContent = `✓ Pattern matches: ${matches.join(', ')}`;
      } else {
        this.testResult.className = 'test-result error';
        this.testResult.textContent = '✗ No matches found';
      }
      
      this.testResult.style.display = 'block';
    } catch (error) {
      this.testResult.className = 'test-result error';
      this.testResult.textContent = `✗ Invalid regex: ${error.message}`;
      this.testResult.style.display = 'block';
    }
  }

  async savePattern() {
    const name = this.patternName.value.trim();
    const pattern = this.patternRegex.value.trim();
    const severity = this.patternSeverity.value;
    
    if (!name || !pattern) {
      alert('Please fill in all required fields');
      return;
    }

    try {
      // Validate regex
      new RegExp(pattern);
    } catch (error) {
      alert('Invalid regular expression: ' + error.message);
      return;
    }

    const newPattern = { name, pattern, severity };
    
    if (this.editingIndex !== null) {
      this.customPatterns[this.editingIndex] = newPattern;
    } else {
      this.customPatterns.push(newPattern);
    }

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'saveCustomPatterns',
        patterns: this.customPatterns
      });
      
      if (response.success) {
        this.renderCustomPatterns();
        this.closeModal();
      } else {
        alert('Failed to save pattern: ' + response.error);
      }
    } catch (error) {
      console.error('Error saving pattern:', error);
      alert('Failed to save pattern');
    }
  }

  editPattern(index) {
    this.openModal(index);
  }

  async deletePattern(index) {
    if (confirm('Are you sure you want to delete this pattern?')) {
      this.customPatterns.splice(index, 1);
      
      try {
        const response = await chrome.runtime.sendMessage({
          type: 'saveCustomPatterns',
          patterns: this.customPatterns
        });
        
        if (response.success) {
          this.renderCustomPatterns();
        } else {
          alert('Failed to delete pattern: ' + response.error);
        }
      } catch (error) {
        console.error('Error deleting pattern:', error);
        alert('Failed to delete pattern');
      }
    }
  }

  async loadSettings() {
    try {
      const result = await chrome.storage.sync.get(['scanIframes', 'scanShadowDOM', 'showNotifications']);
      
      this.scanIframes.checked = result.scanIframes !== false; // Default true
      this.scanShadowDOM.checked = result.scanShadowDOM !== false; // Default true
      this.showNotifications.checked = result.showNotifications !== false; // Default true
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  }

  async saveSettings() {
    try {
      await chrome.storage.sync.set({
        scanIframes: this.scanIframes.checked,
        scanShadowDOM: this.scanShadowDOM.checked,
        showNotifications: this.showNotifications.checked
      });
    } catch (error) {
      console.error('Error saving settings:', error);
    }
  }

  async exportSettings() {
    try {
      const data = {
        customPatterns: this.customPatterns,
        settings: {
          scanIframes: this.scanIframes.checked,
          scanShadowDOM: this.scanShadowDOM.checked,
          showNotifications: this.showNotifications.checked
        },
        exportDate: new Date().toISOString(),
        version: '1.0'
      };
      
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `sensitive-info-detector-settings-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting settings:', error);
      alert('Failed to export settings');
    }
  }

  async importSettings(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      
      if (data.customPatterns) {
        // Validate patterns
        for (const pattern of data.customPatterns) {
          if (!pattern.name || !pattern.pattern) {
            throw new Error('Invalid pattern format');
          }
          new RegExp(pattern.pattern); // Validate regex
        }
        
        this.customPatterns = data.customPatterns;
        await chrome.runtime.sendMessage({
          type: 'saveCustomPatterns',
          patterns: this.customPatterns
        });
        this.renderCustomPatterns();
      }
      
      if (data.settings) {
        await chrome.storage.sync.set(data.settings);
        this.loadSettings();
      }
      
      alert('Settings imported successfully!');
    } catch (error) {
      console.error('Error importing settings:', error);
      alert('Failed to import settings: ' + error.message);
    } finally {
      event.target.value = ''; // Reset file input
    }
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  const popupManager = new PopupManager();
  
  // Make it globally available for debugging
  if (typeof window !== 'undefined') {
    window.popupManager = popupManager;
  }
});
