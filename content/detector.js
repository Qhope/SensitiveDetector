/**
 * Shared Sensitive Information Detection Utility
 * Used across all scanners for consistency
 */
class SensitiveInfoDetectionUtil {
  constructor() {
    this.sensitivePatterns = {
      creditCard: {
        pattern: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,
        name: 'Credit Card Number',
        severity: 'high'
      },
      ssn: {
        pattern: /\b\d{3}-?\d{2}-?\d{4}\b/g,
        name: 'Social Security Number',
        severity: 'high'
      },
      email: {
        pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
        name: 'Email Address',
        severity: 'medium'
      },
      phone: {
        pattern: /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
        name: 'Phone Number',
        severity: 'medium'
      },
      bankAccount: {
        pattern: /\b\d{8,17}\b/g,
        name: 'Bank Account Number',
        severity: 'high'
      },
      passport: {
        pattern: /\b[A-Z]{1,2}\d{6,9}\b/g,
        name: 'Passport Number',
        severity: 'high'
      }
    };
    
    this.customPatterns = [];
    // Initialize custom patterns asynchronously
    Promise.resolve().then(() => this.loadCustomPatterns());
  }

  async loadCustomPatterns() {
    try {
      const result = await chrome.storage.sync.get('customPatterns');
      this.customPatterns = result.customPatterns || [];
    } catch (error) {
      console.warn('Failed to load custom patterns:', error);
    }
  }

  detectSensitiveInfo(text) {
    const detected = [];
    
    // Check built-in patterns
    for (const [type, config] of Object.entries(this.sensitivePatterns)) {
      if (config.pattern.test(text)) {
        detected.push({
          type,
          name: config.name,
          severity: config.severity
        });
        config.pattern.lastIndex = 0; // Reset regex state
      }
    }

    // Check custom patterns
    for (const customPattern of this.customPatterns) {
      try {
        const regex = new RegExp(customPattern.pattern, 'gi');
        if (regex.test(text)) {
          detected.push({
            type: 'custom',
            name: customPattern.name,
            severity: customPattern.severity || 'medium'
          });
        }
      } catch (error) {
        // Invalid custom pattern - log the error and continue
        console.warn('Invalid custom pattern will be skipped:', customPattern.pattern, error.message);
      }
    }

    return detected;
  }

  isInputElement(element) {
    const tagName = element.tagName?.toLowerCase();
    return (
      tagName === 'input' ||
      tagName === 'textarea' ||
      element.contentEditable === 'true'
    );
  }

  getSeverityLevel(detectedTypes) {
    const severityLevels = detectedTypes.map(t => {
      if (t.severity === 'high') return 3;
      if (t.severity === 'medium') return 2;
      return 1;
    });
    return Math.max(...severityLevels);
  }

  getSeverityClass(severityLevel) {
    if (severityLevel === 3) return 'severity-high';
    if (severityLevel === 2) return 'severity-medium';
    return 'severity-low';
  }

  createWarningElement(detectedTypes, context = 'main') {
    const warning = document.createElement('div');
    warning.className = 'sensitive-info-warning';
    
    const severityLevels = detectedTypes.map(t => {
      if (t.severity === 'high') return 3;
      if (t.severity === 'medium') return 2;
      return 1;
    });
    const severityLevel = Math.max(...severityLevels);
    
    let severityClass;
    if (severityLevel === 3) {
      severityClass = 'high';
    } else if (severityLevel === 2) {
      severityClass = 'medium';
    } else {
      severityClass = 'low';
    }
    
    warning.classList.add(`severity-${severityClass}`);
    
    // Create consistent warning content
    this.updateWarningContent(warning, detectedTypes, context);
    
    return warning;
  }

  updateWarningContent(warning, detectedTypes, context = 'main') {
    const typesList = detectedTypes.map(t => t.name).join(', ');
    const contextLabel = this.getContextLabel(context);
    
    // Create header
    const header = document.createElement('div');
    header.className = 'warning-header';
    
    const icon = document.createElement('span');
    icon.className = 'warning-icon';
    icon.textContent = '⚠️';
    
    const title = document.createElement('span');
    title.className = 'warning-title';
    title.textContent = `${contextLabel} Sensitive Information Detected!`;
    
    header.appendChild(icon);
    header.appendChild(title);
    
    // Create content
    const content = document.createElement('div');
    content.className = 'warning-content';
    
    const detectedPara = document.createElement('p');
    const detectedStrong = document.createElement('strong');
    detectedStrong.textContent = 'Detected: ';
    detectedPara.appendChild(detectedStrong);
    detectedPara.appendChild(document.createTextNode(typesList));
    
    const riskPara = document.createElement('p');
    const riskStrong = document.createElement('strong');
    riskStrong.textContent = 'Risk: ';
    riskPara.appendChild(riskStrong);
    riskPara.appendChild(document.createTextNode('This page is not using HTTPS. Your sensitive information may be intercepted.'));
    
    content.appendChild(detectedPara);
    content.appendChild(riskPara);
    
    // Create actions
    const actions = document.createElement('div');
    actions.className = 'warning-actions';
    
    const proceedBtn = document.createElement('button');
    proceedBtn.className = 'warning-btn proceed';
    proceedBtn.textContent = 'Continue Anyway';
    
    const clearBtn = document.createElement('button');
    clearBtn.className = 'warning-btn clear';
    clearBtn.textContent = 'Clear Input';
    
    actions.appendChild(proceedBtn);
    actions.appendChild(clearBtn);
    content.appendChild(actions);
    
    // Clear existing content and add new structure
    warning.innerHTML = '';
    warning.appendChild(header);
    warning.appendChild(content);
    
    return { proceedBtn, clearBtn };
  }

  getContextLabel(context) {
    switch (context) {
      case 'shadow': return 'Shadow DOM';
      case 'iframe': return 'Iframe';
      case 'main': 
      default: return '';
    }
  }
}

// Export the utility class for use by other scanners
if (typeof window !== 'undefined') {
  window.SensitiveInfoDetectionUtil = SensitiveInfoDetectionUtil;
  // Create shared instance for backward compatibility
  window.sensitiveInfoDetectionUtil = new SensitiveInfoDetectionUtil();
}

/**
 * Main sensitive information detector
 * Scans inputs and warns users about sensitive data on non-HTTPS pages
 */

class SensitiveInfoDetector {
  constructor() {
    this.detectionUtil = new SensitiveInfoDetectionUtil();
    this.isHttps = window.location.protocol === 'https:';
    this.warningElements = new Map();
    this.lastHeartbeat = Date.now();
    
    // Initialize asynchronously to avoid async constructor
    setTimeout(() => {
      this.initAsync();
    }, 0);
  }

  async initAsync() {
    // The shared detection utility handles custom patterns
    this.injectStyles();
    this.setupEventListeners();
    this.scanExistingInputs();
    this.observeNewElements();
  }

  injectStyles() {
    const styleLink = document.createElement('link');
    styleLink.rel = 'stylesheet';
    styleLink.href = chrome.runtime.getURL('styles/warning.css');
    (document.head || document.documentElement).appendChild(styleLink);
  }

  setupEventListeners() {
    // Listen for input events
    document.addEventListener('input', this.handleInput.bind(this), true);
    document.addEventListener('paste', this.handlePaste.bind(this), true);
    document.addEventListener('focus', this.handleFocus.bind(this), true);
    document.addEventListener('blur', this.handleBlur.bind(this), true);

    // Listen for custom pattern updates
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'updatePatterns') {
        this.loadCustomPatterns();
      } else if (message.type === 'extensionDisabled') {
        this.showExtensionDisabledWarning(message.message);
      } else if (message.type === 'heartbeat') {
        // Extension is still active - no action needed
        this.lastHeartbeat = message.timestamp;
      }
    });

    // Check for missing heartbeats (extension might be disabled)
    setInterval(() => {
      const now = Date.now();
      if (this.lastHeartbeat && (now - this.lastHeartbeat) > 15000) { // 15 seconds
        this.showExtensionDisabledWarning('Extension may have been disabled - sensitive data protection inactive!');
      }
    }, 10000); // Check every 10 seconds
  }

  handleInput(event) {
    const input = event.target;
    if (this.detectionUtil?.isInputElement(input)) {
      this.scanInput(input);
    }
  }

  handlePaste(event) {
    setTimeout(() => {
      const input = event.target;
      if (this.detectionUtil?.isInputElement(input)) {
        this.scanInput(input);
      }
    }, 10);
  }

  handleFocus(event) {
    const input = event.target;
    if (this.detectionUtil?.isInputElement(input)) {
      this.scanInput(input);
      // Make warning visible on focus
      const warning = this.warningElements.get(input);
      if (warning) {
        warning.style.display = 'block';
      }
    }
  }

  handleBlur(event) {
    const input = event.target;
    if (this.detectionUtil?.isInputElement(input) && this.warningElements.has(input)) {
      const warning = this.warningElements.get(input);
      if (warning) {
        warning.style.display = 'none';
      }
    }
  }

  isInputElement(element) {
    const tagName = element.tagName.toLowerCase();
    return (
      tagName === 'input' ||
      tagName === 'textarea' ||
      element.contentEditable === 'true'
    );
  }

  scanInput(input) {
    const value = input.value || input.textContent || '';
    console.log(`Scanning input: ${input.tagName} - Value: "${value}"`);
    if (!value.trim()) {
      this.hideWarning(input);
      return;
    }

    const detectedTypes = this.detectionUtil?.detectSensitiveInfo(value) || [];
    
    if (detectedTypes.length > 0 && !this.isHttps) {
      this.showWarning(input, detectedTypes);
    } else {
      this.hideWarning(input);
    }
  }

  showWarning(input, detectedTypes) {
    let warning = this.warningElements.get(input);
    
    if (!warning) {
      warning = this.detectionUtil.createWarningElement(detectedTypes);
      this.warningElements.set(input, warning);
    } else {
      this.detectionUtil.updateWarningContent(warning, detectedTypes);
    }

    this.positionWarning(warning, input);
    document.body.appendChild(warning);
    warning.style.display = 'block';
  }

  positionWarning(warning, input) {
    const rect = input.getBoundingClientRect();
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
    
    warning.style.position = 'absolute';
    warning.style.top = (rect.bottom + scrollTop + 5) + 'px';
    warning.style.left = (rect.left + scrollLeft) + 'px';
    warning.style.zIndex = '10000';
  }

  hideWarning(input) {
    const warning = this.warningElements.get(input);
    if (warning) {
      warning.style.display = 'none';
      this.warningElements.delete(input);
        // Remove from DOM if no longer needed
    }
  }

  scanExistingInputs() {
    // Wait for DOM to be ready before scanning
    const doScan = () => {
      const inputs = document.querySelectorAll('input, textarea, [contenteditable="true"]');
      inputs.forEach(input => {
        if (input.value || input.textContent) {
          this.scanInput(input);
        }
      });
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', doScan);
    } else {
      doScan();
    }
  }

  observeNewElements() {
    const observer = new MutationObserver((mutations) => {
      this.processMutations(mutations);
    });

    // Wait for document.body to be available
    if (document.body) {
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
    } else {
      // If body is not ready, wait for DOM to load
      document.addEventListener('DOMContentLoaded', () => {
        if (document.body) {
          observer.observe(document.body, {
            childList: true,
            subtree: true
          });
        }
      });
    }
  }

  processMutations(mutations) {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          this.processAddedNode(node);
        }
      });
    });
  }

  processAddedNode(node) {
    // Scan new input elements
    if (this.detectionUtil?.isInputElement(node)) {
      this.scanInput(node);
    }
    
    // Scan inputs within new elements
    const inputs = node.querySelectorAll('input, textarea, [contenteditable="true"]');
    inputs.forEach(input => this.scanInput(input));
  }

  showExtensionDisabledWarning(message) {
    // Remove any existing disable warning
    const existingWarning = document.querySelector('.extension-disabled-warning');
    if (existingWarning) {
      existingWarning.remove();
    }

    const warning = document.createElement('div');
    warning.className = 'extension-disabled-warning';
    warning.innerHTML = `
      <div style="font-weight: bold; color: #ff0000; margin-bottom: 8px;">🚨 Security Alert</div>
      <div>${message}</div>
      <div style="margin-top: 8px; font-size: 11px;">
        Please re-enable the Sensitive Information Detector extension to continue protection.
      </div>
    `;

    warning.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(255, 0, 0, 0.95);
      color: white;
      padding: 20px;
      border-radius: 8px;
      z-index: 999999;
      font-family: Arial, sans-serif;
      font-size: 14px;
      max-width: 400px;
      text-align: center;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5);
      border: 3px solid #cc0000;
    `;

    document.body.appendChild(warning);

    // Auto-remove after 10 seconds
    setTimeout(() => {
      if (warning.parentElement) {
        warning.remove();
      }
    }, 10000);
  }
}

// Initialize the detector when the DOM is ready
let sensitiveInfoDetector;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    sensitiveInfoDetector = new SensitiveInfoDetector();
  });
} else {
  sensitiveInfoDetector = new SensitiveInfoDetector();
}

// Make detector available globally for debugging
if (typeof window !== 'undefined') {
  window.sensitiveInfoDetector = sensitiveInfoDetector;
}
