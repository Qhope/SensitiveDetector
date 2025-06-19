/**
 * Iframe Scanner
 * Detects and scans content within iframes for sensitive information
 */

class IframeScanner {
  constructor() {
    this.scannedIframes = new Set();
    this.detectionUtil = null;
    this.initialized = false;
    // Initialize asynchronously without blocking constructor
    Promise.resolve().then(() => this.initialize());
  }

  async initialize() {
    // Wait for the SensitiveInfoDetectionUtil class to be available and create our own instance
    await this.waitForUtilityClass();
    this.detectionUtil = new window.SensitiveInfoDetectionUtil();
    this.injectStyles();
    this.scanExistingIframes();
    this.observeNewIframes();
    this.setupCrossFrameMessaging();
    this.initialized = true;
  }

  injectStyles() {
    // Inject warning.css into the main document for iframe overlay warnings
    const styleLink = document.createElement('link');
    styleLink.rel = 'stylesheet';
    styleLink.href = chrome.runtime.getURL('styles/warning.css');
    (document.head || document.documentElement).appendChild(styleLink);
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

  scanExistingIframes() {
    // Wait for DOM to be ready before scanning
    const doScan = () => {
      const iframes = document.querySelectorAll('iframe');
      iframes.forEach(iframe => this.scanIframe(iframe));
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', doScan);
    } else {
      doScan();
    }
  }

  observeNewIframes() {
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
    if (node.tagName === 'IFRAME') {
      this.scanIframe(node);
    }
    
    // Check for iframes within the added node
    const iframes = node.querySelectorAll('iframe');
    iframes.forEach(iframe => this.scanIframe(iframe));
  }

  scanIframe(iframe) {
    if (this.scannedIframes.has(iframe)) {
      return;
    }

    this.scannedIframes.add(iframe);

    try {
      // Try to access iframe content (will fail for cross-origin)
      iframe.addEventListener('load', () => {
        try {
          const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
          if (iframeDoc) {
            this.injectDetectorIntoIframe(iframe, iframeDoc);
          }
        } catch (error) {
          // Check if this is a data: URL iframe
          if (iframe.src?.startsWith('data:')) {
            console.log('Detected data: URL iframe, trying direct access');
            this.scanDataUrlIframe(iframe);
          } else {
            // Cross-origin iframe - use postMessage communication
            console.warn('Cross-origin iframe detected, using postMessage:', error.message);
            this.setupCrossOriginIframeScanning(iframe);
          }
        }
      });
    } catch (error) {
      console.warn('Unable to scan iframe:', error);
    }
  }

  scanDataUrlIframe(iframe) {
    // For data: URL iframes, try to access content directly if same-origin
    try {
      const iframeDoc = iframe.contentDocument;
      if (iframeDoc) {
        console.log('Scanning data: URL iframe content directly');
        // Inject styles first to ensure warnings display properly
        this.injectIframeStyles(iframeDoc);
        // Then set up detection with immediate scanning
        this.setupIframeDetection(iframeDoc);
      } else {
        console.log('Cannot access data: URL iframe content - different origin');
      }
    } catch (error) {
      console.warn('Failed to scan data: URL iframe:', error.message);
    }
  }

  injectDetectorIntoIframe(iframe, iframeDoc) {
    // Inject styles safely
    this.injectIframeStyles(iframeDoc);
    
    // Set up detection using event listeners instead of script injection
    this.setupIframeDetection(iframeDoc);
  }

  injectIframeStyles(iframeDoc) {
    // Inject the shared warning.css into the iframe
    const styleLink = iframeDoc.createElement('link');
    styleLink.rel = 'stylesheet';
    styleLink.href = chrome.runtime.getURL('styles/warning.css');
    
    if (iframeDoc.head) {
      iframeDoc.head.appendChild(styleLink);
    } else {
      // Wait for head to be available
      const observer = new MutationObserver((mutations, obs) => {
        if (iframeDoc.head) {
          iframeDoc.head.appendChild(styleLink);
          obs.disconnect();
        }
      });
      observer.observe(iframeDoc, { childList: true, subtree: true });
    }
  }

  setupIframeDetection(iframeDoc) {
    const scanInput = (input) => {
      const value = input.value || input.textContent || '';
      if (!value.trim()) return;

      // Use shared detection utility if available
      const detectedTypes = this.detectionUtil?.detectSensitiveInfo(value) || 
        this.fallbackDetection(value);

      if (detectedTypes.length > 0 && window.location.protocol !== 'https:') {
        this.showIframeWarning(iframeDoc, input, detectedTypes);
        
        // Also send message to parent frame with proper origin for coordination
        try {
          window.parent.postMessage({
            type: 'sensitiveInfoDetected',
            detected: detectedTypes,
            source: 'iframe'
          }, window.location.origin);
        } catch (error) {
          // Fallback for cross-origin restrictions
          console.warn('Could not notify parent frame:', error.message);
        }
      }
    };

    // Set up event listeners directly
    const handleInput = (e) => {
      const target = e.target;
      if (this.detectionUtil?.isInputElement(target)) {
        scanInput(target);
      }
    };

    const handlePaste = (e) => {
      setTimeout(() => {
        const target = e.target;
        if (this.detectionUtil?.isInputElement(target)) {
          scanInput(target);
        }
      }, 10);
    };

    // Add event listeners to iframe document
    iframeDoc.addEventListener('input', handleInput, true);
    iframeDoc.addEventListener('paste', handlePaste, true);

    // Scan existing inputs
    const scanExistingInputs = () => {
      const inputs = iframeDoc.querySelectorAll('input, textarea, [contenteditable="true"]');
      console.log(`Found ${inputs.length} input elements in data: URL iframe`);
      
      inputs.forEach((input, index) => {
        const value = input.value || input.textContent || '';
        console.log(`Scanning input ${index + 1}: "${value}" (length: ${value.length})`);
        scanInput(input);
      });
      
      if (inputs.length === 0) {
        console.log('No input elements found in data: URL iframe - will monitor for dynamically added inputs');
      }
    };

    // Helper function to process newly added input elements
    const processNewInput = (input) => {
      console.log('New input element detected in iframe:', input);
      const value = input.value || input.textContent || '';
      if (value.trim()) {
        scanInput(input);
      }
    };

    // Helper function to process newly added nodes
    const processAddedNode = (node) => {
      if (node.nodeType === Node.ELEMENT_NODE) {
        // Check if the added node itself is an input
        if (this.detectionUtil?.isInputElement(node)) {
          processNewInput(node);
        }
        // Check for inputs within the added node
        const newInputs = node.querySelectorAll('input, textarea, [contenteditable="true"]');
        if (newInputs.length > 0) {
          console.log(`${newInputs.length} new input elements found in added content`);
          newInputs.forEach(processNewInput);
        }
      }
    };

    // Scan immediately and after DOM changes
    if (iframeDoc.readyState === 'loading') {
      iframeDoc.addEventListener('DOMContentLoaded', scanExistingInputs);
    } else {
      scanExistingInputs();
    }
    
    // Set up mutation observer to detect dynamically added inputs
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach(processAddedNode);
      });
    });
    
    // Start observing the iframe document for changes
    observer.observe(iframeDoc.body || iframeDoc, {
      childList: true,
      subtree: true
    });
  }

  showIframeWarning(iframeDoc, input, detectedTypes) {
    // Remove any existing warnings for this input
    const existingWarning = iframeDoc.querySelector('.sensitive-info-warning');
    if (existingWarning) {
      existingWarning.remove();
    }

    // Create warning using the shared utility
    const warning = this.detectionUtil.createWarningElement(detectedTypes, 'iframe');
    const { proceedBtn, clearBtn } = this.detectionUtil.updateWarningContent(warning, detectedTypes, 'iframe');

    // Position the warning near the input
    warning.style.position = 'absolute';
    warning.style.zIndex = '999999';
    
    // Calculate position relative to the input
    try {
      const inputRect = input.getBoundingClientRect();
      const docRect = iframeDoc.documentElement.getBoundingClientRect();
      
      warning.style.top = Math.max(0, inputRect.bottom - docRect.top + 5) + 'px';
      warning.style.left = Math.max(0, inputRect.left - docRect.left) + 'px';
    } catch (error) {
      // Fallback positioning if getBoundingClientRect fails
      console.warn('Failed to position iframe warning, using fallback:', error.message);
      warning.style.top = '10px';
      warning.style.right = '10px';
      warning.style.left = 'auto';
    }

    // Add event listeners for warning buttons
    proceedBtn.addEventListener('click', () => {
      warning.remove();
    });

    clearBtn.addEventListener('click', () => {
      if (input.tagName.toLowerCase() === 'input' || input.tagName.toLowerCase() === 'textarea') {
        input.value = '';
      } else if (input.contentEditable === 'true') {
        input.textContent = '';
      }
      warning.remove();
    });

    // Append to iframe document body
    if (iframeDoc.body) {
      iframeDoc.body.appendChild(warning);
    } else {
      // Wait for body to be available
      const observer = new MutationObserver((mutations, obs) => {
        if (iframeDoc.body) {
          iframeDoc.body.appendChild(warning);
          obs.disconnect();
        }
      });
      observer.observe(iframeDoc, { childList: true, subtree: true });
    }

    // Auto-remove after 10 seconds
    setTimeout(() => {
      if (warning.parentElement) {
        warning.remove();
      }
    }, 10000);
  }

  // Fallback detection method if shared utility is not available
  fallbackDetection(text) {
    const patterns = new Map([
      ['creditCard', /\b(?:\d{4}[-\s]?){3}\d{4}\b/g],
      ['ssn', /\b\d{3}-?\d{2}-?\d{4}\b/g],
      ['email', /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g],
      ['phone', /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g]
    ]);

    const detected = [];
    for (const [type, pattern] of patterns) {
      if (pattern.test(text)) {
        detected.push({
          type,
          name: type.charAt(0).toUpperCase() + type.slice(1),
          severity: 'medium'
        });
        pattern.lastIndex = 0; // Reset regex state
      }
    }
    return detected;
  }

  setupCrossOriginIframeScanning(iframe) {
    // For cross-origin iframes, we can't directly inject scripts
    // But we can monitor for postMessage communications
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('content/injected-script.js');
    script.onload = function() {
      try {
        // Check if iframe has a valid src that supports postMessage
        const iframeSrc = iframe.src;
        let targetOrigin = '*';
        
        // Handle different iframe src types
        if (!iframeSrc || iframeSrc === 'about:blank') {
          // Skip postMessage for about:blank iframes
          console.log('Skipping postMessage for about:blank iframe');
          return;
        } else if (iframeSrc.startsWith('data:')) {
          // For data URLs, we need to use a different approach
          console.log('Skipping postMessage for data: URL iframe - using alternative detection');
          return;
        } else if (iframeSrc.startsWith('http://') || iframeSrc.startsWith('https://')) {
          // For HTTP/HTTPS URLs, use the origin
          try {
            const url = new URL(iframeSrc);
            targetOrigin = url.origin;
          } catch (urlError) {
            console.warn('Invalid iframe URL, using wildcard origin:', urlError.message);
            targetOrigin = '*';
          }
        }
        
        // Only send postMessage if we have a valid target
        iframe.contentWindow.postMessage({
          type: 'initSensitiveDetector'
        }, targetOrigin);
        
      } catch (error) {
        console.warn('Unable to message iframe:', error.message);
        // For data: URLs or other special cases, try alternative detection methods
        if (iframe.src?.startsWith('data:')) {
          console.log('Attempting alternative detection for data: URL iframe');
          this.scanDataUrlIframe(iframe);
        }
      }
    };
    document.head.appendChild(script);
  }

  setupCrossFrameMessaging() {
    window.addEventListener('message', (event) => {
      // Verify origin for security
      if (!this.isValidOrigin(event.origin)) {
        return;
      }
      
      if (event.data && event.data.type === 'sensitiveInfoDetected') {
        this.handleIframeSensitiveInfo(event);
      }
    });
  }

  isValidOrigin(origin) {
    // Allow same origin and common trusted origins
    return origin === window.location.origin || 
           origin.startsWith('https://') || 
           origin === 'null'; // For local files
  }

  handleIframeSensitiveInfo(event) {
    // Create a warning overlay for iframe-detected sensitive info using shared utility
    const detectedTypes = event.data.detected || [];
    const warning = this.detectionUtil.createWarningElement(detectedTypes, 'iframe');
    const { proceedBtn } = this.detectionUtil.updateWarningContent(warning, detectedTypes, 'iframe');
    
    // Position as fixed overlay
    warning.style.position = 'fixed';
    warning.style.top = '10px';
    warning.style.right = '10px';
    warning.style.zIndex = '10001';

    // Add dismiss functionality to proceed button
    proceedBtn.addEventListener('click', () => {
      warning.remove();
    });

    document.body.appendChild(warning);

    // Auto-remove after 10 seconds
    setTimeout(() => {
      if (warning.parentElement) {
        warning.remove();
      }
    }, 10000);
  }
}

// Initialize iframe scanner - wait for detection utility class to be ready
let iframeScanner;

// Function to initialize the scanner when detection utility class is ready
const initializeIframeScanner = () => {
  iframeScanner = new IframeScanner();
  
  // Export for potential use by other scripts
  if (typeof window !== 'undefined') {
    window.iframeScanner = iframeScanner;
  }
};

// Wait for the detection utility class to be available before initializing
if (window.SensitiveInfoDetectionUtil) {
  initializeIframeScanner();
} else {
  // Poll for the detection utility class
  const checkForUtilClass = () => {
    if (window.SensitiveInfoDetectionUtil) {
      initializeIframeScanner();
    } else {
      setTimeout(checkForUtilClass, 100);
    }
  };
  checkForUtilClass();
}
