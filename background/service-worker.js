/**
 * Background Service Worker
 * Handles extension disable detection and other background tasks
 */

class ExtensionMonitor {
  constructor() {
    this.isEnabled = true;
    this.checkInterval = 5000; // Check every 5 seconds
    this.lastHeartbeat = Date.now();
    this.init();
  }

  init() {
    this.setupHeartbeat();
    this.setupStorageSync();
    this.setupTabListeners();
    this.setupManagementListeners();
    this.setupAlarms();
  }

  setupHeartbeat() {
    // Send heartbeat to content scripts
    setInterval(() => {
      this.sendHeartbeat();
    }, this.checkInterval);
  }

  async sendHeartbeat() {
    try {
      const tabs = await chrome.tabs.query({ active: true });
      
      for (const tab of tabs) {
        if (tab.url && (tab.url.startsWith('http://') || tab.url.startsWith('https://')) && tab.active) {
          try {
            await chrome.tabs.sendMessage(tab.id, {
              type: 'heartbeat',
              timestamp: Date.now()
            });
          } catch (error) {
            // Tab might not have content script injected - this is expected behavior
            console.warn('Could not send heartbeat to tab:', tab.id, error.message);
          }
        }
      }
    } catch (error) {
      console.error('Error sending heartbeat:', error);
    }
  }

  setupStorageSync() {
    // Listen for storage changes (custom patterns)
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === 'sync' && changes.customPatterns) {
        this.notifyContentScripts('updatePatterns');
      }
    });
  }

  setupTabListeners() {
    // Listen for tab updates to check HTTPS status
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === 'complete' && tab.url) {
        this.checkPageSecurity(tab);
      }
    });

    // Listen for tab activation
    chrome.tabs.onActivated.addListener(async (activeInfo) => {
      try {
        const tab = await chrome.tabs.get(activeInfo.tabId);
        this.checkPageSecurity(tab);
      } catch (error) {
        console.warn('Could not get active tab:', error);
      }
    });
  }

  setupManagementListeners() {
    // Listen for extension disable/enable events
    chrome.management.onDisabled.addListener((info) => {
      if (info.id === chrome.runtime.id) {
        // Extension is being disabled - send warning to all tabs
        this.warnAboutDisable();
      }
    });

    chrome.management.onEnabled.addListener((info) => {
      if (info.id === chrome.runtime.id) {
        this.isEnabled = true;
        console.log('Extension re-enabled');
      }
    });
  }

  setupAlarms() {
    // Create periodic alarm for health checks if alarms API is available
    if (chrome.alarms) {
      chrome.alarms.create('healthCheck', { periodInMinutes: 1 });
      
      chrome.alarms.onAlarm.addListener((alarm) => {
        if (alarm.name === 'healthCheck') {
          this.performHealthCheck();
        }
      });
    } else {
      // Fallback to setInterval if alarms API is not available
      setInterval(() => {
        this.performHealthCheck();
      }, 60000); // 1 minute
    }
  }

  async trySetWarningIcon(tabId) {
    try {
      // First, try to set the warning icon
      await chrome.action.setIcon({
        tabId: tabId,
        path: {
          16: 'icons/icon16-warning.png',
          48: 'icons/icon48-warning.png',
          128: 'icons/icon128-warning.png'
        }
      });
      return true;
    } catch (error) {
      console.warn('Warning icons not available, using badge fallback:', error.message);
      return false;
    }
  }

  async tryResetIcon(tabId) {
    try {
      // Try to reset to normal icon
      await chrome.action.setIcon({
        tabId: tabId,
        path: {
          16: 'icons/icon16.png',
          48: 'icons/icon48.png',
          128: 'icons/icon128.png'
        }
      });
      return true;
    } catch (error) {
      console.warn('Could not reset icon:', error.message);
      return false;
    }
  }

  // Enhanced version that tries icons first, falls back to badge
  async checkPageSecurityWithIconFallback(tab) {
    if (!tab.url) return;

    const isHttps = tab.url.startsWith('https://');
    const isLocalhost = tab.url.includes('localhost') || tab.url.includes('127.0.0.1');
    
    if (!isHttps && !isLocalhost) {
      // Try warning icon first, fallback to badge
      const iconSuccess = await this.trySetWarningIcon(tab.id);
      
      try {
        await chrome.action.setBadgeText({
          tabId: tab.id,
          text: iconSuccess ? '' : '⚠'  // Only show badge if icon failed
        });
        
        await chrome.action.setBadgeBackgroundColor({
          tabId: tab.id,
          color: '#ff4444'
        });
        
        await chrome.action.setTitle({
          tabId: tab.id,
          title: 'Sensitive Information Detector - WARNING: Insecure HTTP page!'
        });
      } catch (error) {
        console.warn('Could not update extension badge:', error);
      }
    } else {
      // Reset to normal state
      await this.tryResetIcon(tab.id);
      
      try {
        await chrome.action.setBadgeText({
          tabId: tab.id,
          text: ''
        });
        
        await chrome.action.setTitle({
          tabId: tab.id,
          title: 'Sensitive Information Detector'
        });
      } catch (error) {
        console.warn('Could not reset extension state:', error);
      }
    }
  }

  async checkPageSecurity(tab) {
    if (!tab.url) return;

    const isHttps = tab.url.startsWith('https://');
    const isLocalhost = tab.url.includes('localhost') || tab.url.includes('127.0.0.1');
    
    if (!isHttps && !isLocalhost) {
      // Use badge to indicate non-secure page instead of changing icons
      try {
        await chrome.action.setBadgeText({
          tabId: tab.id,
          text: '⚠'
        });
        
        await chrome.action.setBadgeBackgroundColor({
          tabId: tab.id,
          color: '#ff4444'
        });
        
        await chrome.action.setTitle({
          tabId: tab.id,
          title: 'Sensitive Information Detector - WARNING: Insecure HTTP page!'
        });
      } catch (error) {
        console.warn('Could not update extension badge:', error);
      }
    } else {
      // Reset to normal state
      try {
        await chrome.action.setBadgeText({
          tabId: tab.id,
          text: ''
        });
        
        await chrome.action.setTitle({
          tabId: tab.id,
          title: 'Sensitive Information Detector'
        });
      } catch (error) {
        console.warn('Could not reset extension badge:', error);
      }
    }
  }

  async warnAboutDisable() {
    try {
      const tabs = await chrome.tabs.query({});
      
      for (const tab of tabs) {
        if (tab.url && (tab.url.startsWith('http://') || tab.url.startsWith('https://'))) {
          try {
            await chrome.tabs.sendMessage(tab.id, {
              type: 'extensionDisabled',
              message: 'Sensitive Information Detector extension has been disabled!'
            });
          } catch (error) {
            // Tab might not have content script - this is expected for some tabs
            console.warn('Could not warn tab about disable:', tab.id, error.message);
          }
        }
      }
    } catch (error) {
      console.error('Error warning about extension disable:', error);
    }
  }

  async notifyContentScripts(type, data = {}) {
    try {
      const tabs = await chrome.tabs.query({});
      
      for (const tab of tabs) {
        if (tab.url && (tab.url.startsWith('http://') || tab.url.startsWith('https://'))) {
          try {
            await chrome.tabs.sendMessage(tab.id, {
              type: type,
              ...data
            });
          } catch (error) {
            // Tab might not have content script - this is expected for some tabs
            console.warn('Could not notify tab:', tab.id, error.message);
          }
        }
      }
    } catch (error) {
      console.error('Error notifying content scripts:', error);
    }
  }

async performHealthCheck() {
  try {
    const info = await chrome.management.getSelf();

    if (info.enabled === false && this.isEnabled === true) {
      this.isEnabled = false;
      this.warnAboutDisable();  // Gửi cảnh báo
    }

    // Update heartbeat
    this.lastHeartbeat = Date.now();
  } catch (error) {
    console.error('Health check failed:', error);
  }
}
}

// Message handling for popup and content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'getCustomPatterns':
      handleGetCustomPatterns(sendResponse);
      return true; // Keep channel open for async response
      
    case 'saveCustomPatterns':
      handleSaveCustomPatterns(message.patterns, sendResponse);
      return true;
      
    case 'getSecurityStatus':
      handleGetSecurityStatus(sender.tab, sendResponse);
      return true;
      
    case 'reportSensitiveData':
      handleSensitiveDataReport(message, sender);
      break;
      
    default:
      console.warn('Unknown message type:', message.type);
  }
});

async function handleGetCustomPatterns(sendResponse) {
  try {
    const result = await chrome.storage.sync.get('customPatterns');
    sendResponse({ success: true, patterns: result.customPatterns || [] });
  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
}

async function handleSaveCustomPatterns(patterns, sendResponse) {
  try {
    await chrome.storage.sync.set({ customPatterns: patterns });
    sendResponse({ success: true });
    
    // Notify all content scripts about pattern update
    extensionMonitor.notifyContentScripts('updatePatterns');
  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
}

async function handleGetSecurityStatus(sendResponse) {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];

    const url = tab?.url || '';
    const isHttps = url.startsWith('https://');
    const isLocalhost = url.includes('localhost') || url.includes('127.0.0.1') || url.startsWith('chrome://') || url.startsWith('file://');
console.log('[getSecurityStatus] Active tab URL:', url);

    sendResponse({
      success: true,
      isSecure: isHttps || isLocalhost,
      isHttps,
      url
    });
  } catch (error) {
    console.error('[getSecurityStatus] Error:', error);
    sendResponse({
      success: false,
      error: error.message
    });
  }
}


function handleSensitiveDataReport(message, sender) {
  // Log sensitive data detection for analytics/monitoring
  console.log('Sensitive data detected:', {
    url: sender.tab?.url,
    types: message.detectedTypes,
    timestamp: new Date().toISOString(),
    isHttps: sender.tab?.url?.startsWith('https://')
  });
  
  // Could potentially send to analytics service here
  // (with user consent and proper privacy protection)
}

// Initialize the extension monitor
const extensionMonitor = new ExtensionMonitor();

// Handle extension startup
chrome.runtime.onStartup.addListener(() => {
  console.log('Sensitive Information Detector extension started');
});

// Handle extension install
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('Sensitive Information Detector extension installed');
    
    // Set default custom patterns
    chrome.storage.sync.set({
      customPatterns: []
    });
  } else if (details.reason === 'update') {
    console.log('Sensitive Information Detector extension updated');
  }
});
