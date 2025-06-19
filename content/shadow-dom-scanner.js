/**
 * Shadow DOM Scanner
 * Detects and scans inputs within Shadow DOM (encapsulated inputs)
 */

class ShadowDOMScanner {
  constructor() {
    this.scannedShadowRoots = new WeakSet();
    this.detectionUtil = null;
    this.initialized = false;
    // Initialize asynchronously without blocking constructor
    Promise.resolve().then(() => this.initialize());
  }

  async initialize() {
    // Wait for the SensitiveInfoDetectionUtil class to be available and create our own instance
    await this.waitForUtilityClass();
    this.detectionUtil = new window.SensitiveInfoDetectionUtil();
    this.scanExistingShadowRoots();
    this.observeNewShadowRoots();
    this.setupShadowRootDetection();
    this.initialized = true;
  }

  async waitForUtilityClass() {
    return new Promise((resolve) => {
      const checkUtilClass = () => {
        if (window.SensitiveInfoDetectionUtil) {
          resolve();
        } else {
          setTimeout(checkUtilClass, 100);
        }
      };
      checkUtilClass();
    });
  }

  scanExistingShadowRoots() {
    // Wait for DOM to be ready before scanning
    const doScan = () => {
      // Scan all elements that might have shadow roots
      const elementsWithPossibleShadowRoots = document.querySelectorAll('*');
      elementsWithPossibleShadowRoots.forEach(element => {
        if (element.shadowRoot) {
          this.scanShadowRoot(element.shadowRoot);
        }
      });
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', doScan);
    } else {
      doScan();
    }
  }

  observeNewShadowRoots() {
    // Override attachShadow to detect new shadow roots
    const originalAttachShadow = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function(options) {
      const shadowRoot = originalAttachShadow.call(this, options);
      
      // Scan the new shadow root after a short delay to allow content to be added
      setTimeout(() => {
        window.shadowDOMScanner?.scanShadowRoot(shadowRoot);
      }, 100);
      
      return shadowRoot;
    };

    // Also observe DOM mutations to catch shadow roots created in other ways
    const observer = new MutationObserver((mutations) => {
      this.processMutations(mutations);
    });

    // Wait for document.body to be available
    if (document.body) {
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeOldValue: true
      });
    } else {
      // If body is not ready, wait for DOM to load
      document.addEventListener('DOMContentLoaded', () => {
        if (document.body) {
          observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeOldValue: true
          });
        }
      });
    }
  }

  processMutations(mutations) {
    mutations.forEach((mutation) => {
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            this.checkForShadowRoots(node);
          }
        });
      }
    });
  }

  checkForShadowRoots(element) {
    // Check the element itself
    if (element.shadowRoot) {
      this.scanShadowRoot(element.shadowRoot);
    }

    // Check all descendants
    const descendants = element.querySelectorAll('*');
    descendants.forEach(descendant => {
      if (descendant.shadowRoot) {
        this.scanShadowRoot(descendant.shadowRoot);
      }
    });
  }

  setupShadowRootDetection() {
    // Use a more aggressive approach to detect shadow roots
    // by periodically scanning for new shadow roots
    setInterval(() => {
      this.deepScanForShadowRoots();
    }, 5000); // Scan every 5 seconds
  }

  deepScanForShadowRoots() {
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_ELEMENT,
      {
        acceptNode: function(node) {
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    let node;
    while (node = walker.nextNode()) {
      if (node.shadowRoot && !this.scannedShadowRoots.has(node.shadowRoot)) {
        this.scanShadowRoot(node.shadowRoot);
      }
    }
  }

  scanShadowRoot(shadowRoot) {
    if (this.scannedShadowRoots.has(shadowRoot)) {
      return;
    }

    this.scannedShadowRoots.add(shadowRoot);

    try {
      // Inject our detection script into the shadow root
      this.injectDetectionIntoShadowRoot(shadowRoot);
      
      // Scan existing inputs in the shadow root
      this.scanShadowRootInputs(shadowRoot);
      
      // Observe changes within the shadow root
      this.observeShadowRootChanges(shadowRoot);

    } catch (error) {
      console.warn('Error scanning shadow root:', error.message);
    }
  }

  injectDetectionIntoShadowRoot(shadowRoot) {
    // Create style element for warnings using class-based approach
    this.injectShadowStyles(shadowRoot);
    
    // Add event listeners directly without script injection
    this.addShadowEventListeners(shadowRoot);
  }

  injectShadowStyles(shadowRoot) {
    // Inject the shared warning styles into shadow root
    const style = document.createElement('style');
    
    // Get the shared CSS from the main document
    const mainStylesheet = document.querySelector('link[href*="warning.css"]');
    if (mainStylesheet) {
      // Try to get CSS from main document
      fetch(chrome.runtime.getURL('styles/warning.css'))
        .then(response => response.text())
        .then(css => {
          style.textContent = css;
        })
        .catch(() => {
          // Fallback to inline styles if fetch fails
          this.injectFallbackStyles(style);
        });
    } else {
      // Fallback to inline styles
      this.injectFallbackStyles(style);
    }
    
    shadowRoot.appendChild(style);
  }

  injectFallbackStyles(style) {
    // Use the same styles as the main warning system for consistency
    // These are fallback styles that match warning.css
    style.textContent = `
      .sensitive-info-warning {
        position: absolute;
        background: linear-gradient(135deg, #ff4444, #cc0000);
        color: white;
        border: 2px solid #990000;
        border-radius: 8px;
        padding: 12px;
        box-shadow: 0 4px 20px rgba(255, 68, 68, 0.3);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 13px;
        line-height: 1.4;
        max-width: 320px;
        min-width: 280px;
        z-index: 999999;
        pointer-events: auto;
      }

      .sensitive-info-warning::before {
        content: '';
        position: absolute;
        top: -8px;
        left: 20px;
        width: 0;
        height: 0;
        border-left: 8px solid transparent;
        border-right: 8px solid transparent;
        border-bottom: 8px solid #ff4444;
      }

      .warning-header {
        display: flex;
        align-items: center;
        margin-bottom: 8px;
        font-weight: 600;
      }

      .warning-icon {
        font-size: 16px;
        margin-right: 8px;
      }

      .warning-title {
        font-size: 14px;
        font-weight: bold;
      }

      .warning-content p {
        margin: 6px 0;
        font-size: 12px;
      }

      .warning-content strong {
        font-weight: 600;
      }

      .warning-actions {
        margin-top: 10px;
        display: flex;
        gap: 8px;
      }

      .warning-btn {
        padding: 6px 12px;
        border: none;
        border-radius: 4px;
        font-size: 11px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s ease;
      }

      .warning-btn.proceed {
        background: rgba(255, 255, 255, 0.2);
        color: white;
        border: 1px solid rgba(255, 255, 255, 0.3);
      }

      .warning-btn.proceed:hover {
        background: rgba(255, 255, 255, 0.3);
      }

      .warning-btn.clear {
        background: #ffffff;
        color: #ff4444;
        font-weight: 600;
      }

      .warning-btn.clear:hover {
        background: #f0f0f0;
        transform: translateY(-1px);
      }

      /* Severity-based styling */
      .sensitive-info-warning.severity-high {
        border-color: #cc0000;
        background: linear-gradient(135deg, #ff0000, #cc0000);
      }

      .sensitive-info-warning.severity-medium {
        border-color: #ff8800;
        background: linear-gradient(135deg, #ff9900, #ff6600);
      }

      .sensitive-info-warning.severity-low {
        border-color: #ffaa00;
        background: linear-gradient(135deg, #ffbb00, #ff9900);
      }

      /* Ensure shadow root container supports absolute positioning */
      :host {
        position: relative;
      }
    `;
  }

  addShadowEventListeners(shadowRoot) {
    const scanShadowInput = (input) => {
      const value = input.value || input.textContent || '';
      if (!value.trim()) return;

      // Use the shared detection utility instead of local patterns
      const detected = this.detectionUtil?.detectSensitiveInfo(value) || [];

      if (detected.length > 0 && window.location.protocol !== 'https:') {
        this.showShadowWarning(input, detected, shadowRoot);
      }
    };

    shadowRoot.addEventListener('input', (e) => {
      if (this.detectionUtil?.isInputElement(e.target)) {
        scanShadowInput(e.target);
      }
    }, true);

    shadowRoot.addEventListener('paste', (e) => {
      setTimeout(() => {
        if (this.detectionUtil?.isInputElement(e.target)) {
          scanShadowInput(e.target);
        }
      }, 10);
    }, true);
  }

  showShadowWarning(input, detectedTypes, shadowRoot) {
    // Remove existing warning
    const existingWarning = shadowRoot.querySelector('.sensitive-info-warning');
    if (existingWarning) {
      existingWarning.remove();
    }

    // Use the shared warning creation utility for consistency
    const warning = this.detectionUtil?.createWarningElement(detectedTypes, 'shadow');
    if (!warning) {
      console.warn('Could not create warning - detection utility unavailable');
      return;
    }
    
    // Position the warning relative to the input within the shadow DOM
    try {
      // First, ensure the shadow host has relative positioning for proper context
      const shadowHost = shadowRoot.host;
      const hostStyles = getComputedStyle(shadowHost);
      
      if (hostStyles.position === 'static') {
        shadowHost.style.position = 'relative';
      }
      
      // Get input position within the shadow DOM
      const inputRect = input.getBoundingClientRect();
      const shadowHostRect = shadowHost.getBoundingClientRect();
      
      // Calculate position relative to shadow host
      const relativeTop = inputRect.bottom - shadowHostRect.top + 5;
      const relativeLeft = inputRect.left - shadowHostRect.left;
      
      // Use absolute positioning within the shadow root context
      warning.style.position = 'absolute';
      warning.style.top = Math.max(0, relativeTop) + 'px';
      warning.style.left = Math.max(0, relativeLeft) + 'px';
      warning.style.zIndex = '10000';
      
    } catch (error) {
      // Fallback positioning within shadow root - position relative to input
      console.warn('Could not position warning relative to input:', error.message);
      warning.style.position = 'relative';
      warning.style.display = 'block';
      warning.style.marginTop = '5px';
      warning.style.zIndex = '10000';
    }
    
    // Add event listeners to the warning buttons
    const buttons = warning.querySelectorAll('.warning-btn');
    buttons.forEach(button => {
      if (button.classList.contains('proceed')) {
        button.addEventListener('click', () => {
          warning.style.display = 'none';
        });
      } else if (button.classList.contains('clear')) {
        button.addEventListener('click', () => {
          input.value = '';
          input.textContent = '';
          warning.style.display = 'none';
        });
      }
    });
    
    // Ensure the warning is appended to the shadow root, not the main document
    shadowRoot.appendChild(warning);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
      if (warning.parentNode === shadowRoot) {
        shadowRoot.removeChild(warning);
      }
    }, 5000);

    // Notify main page
    window.postMessage({
      type: 'shadowSensitiveInfo',
      detected: detectedTypes.map(d => d.type || d.name),
      source: 'shadowDOM'
    }, window.location.origin);
  }

  scanShadowRootInputs(shadowRoot) {
    const inputs = shadowRoot.querySelectorAll('input, textarea, [contenteditable="true"]');
    inputs.forEach(input => {
      if (input.value || input.textContent) {
        // Trigger a scan of this input
        const event = new Event('input', { bubbles: true });
        input.dispatchEvent(event);
      }
    });
  }

  observeShadowRootChanges(shadowRoot) {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // Check if new inputs were added
            if (this.detectionUtil?.isInputElement(node)) {
              // Add event listeners to new input
              this.addShadowEventListeners(shadowRoot);
            }
            
            // Check for inputs within the added node
            const inputs = node.querySelectorAll('input, textarea, [contenteditable="true"]');
            if (inputs.length > 0) {
              this.addShadowEventListeners(shadowRoot);
            }
          }
        });
      });
    });

    // Shadow roots should always have a valid target to observe
    try {
      observer.observe(shadowRoot, {
        childList: true,
        subtree: true
      });
    } catch (error) {
      console.warn('Could not observe shadow root changes:', error.message);
    }
  }
}

// Initialize shadow DOM scanner - wait for detection utility class to be ready
let shadowDOMScanner;

// Function to initialize the scanner when detection utility class is ready
const initializeShadowDOMScanner = () => {
  shadowDOMScanner = new ShadowDOMScanner();
  
  // Make it globally available for the attachShadow override
  if (typeof window !== 'undefined') {
    window.shadowDOMScanner = shadowDOMScanner;
  }
};

// Wait for the detection utility class to be available before initializing
if (window.SensitiveInfoDetectionUtil) {
  initializeShadowDOMScanner();
} else {
  // Poll for the detection utility class
  const checkForUtilClass = () => {
    if (window.SensitiveInfoDetectionUtil) {
      initializeShadowDOMScanner();
    } else {
      setTimeout(checkForUtilClass, 100);
    }
  };
  checkForUtilClass();
}
