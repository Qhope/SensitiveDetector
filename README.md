# Sensitive Information Detector Chrome Extension

A Chrome extension that detects and warns users about sensitive information being entered on non-HTTPS pages, protecting against data interception and security vulnerabilities.

## Features

### 🔍 **Sensitive Information Detection**
- **Credit Card Numbers**: Detects card number patterns
- **Social Security Numbers**: Identifies SSN formats
- **Email Addresses**: Recognizes email patterns
- **Phone Numbers**: Detects various phone number formats
- **Bank Account Numbers**: Identifies account number patterns
- **Passport Numbers**: Recognizes passport number formats

### 🛡️ **Advanced Security Measures**
- **HTTPS Verification**: Only warns on non-HTTPS pages
- **Real-time Scanning**: Monitors input as you type
- **Custom Pattern Support**: Add your own sensitive data patterns
- **Multiple Input Types**: Supports regular inputs, textareas, and contenteditable elements

### 🎯 **Bypass Resistance**
- **Iframe Scanning**: Detects sensitive data in embedded iframes
- **Shadow DOM Support**: Scans inputs within Shadow DOM (encapsulated components)
- **Dynamic Content**: Monitors dynamically added content
- **Extension Disable Warning**: Alerts users when the extension is disabled

### 🎨 **User Experience**
- **Visual Warnings**: Clear, actionable warning messages
- **Severity Levels**: Color-coded alerts based on data sensitivity
- **Non-intrusive**: Warnings appear near the relevant input fields
- **Customizable**: Configure patterns and settings via popup interface

## Installation

### From Source (Developer Mode)

1. **Download or Clone** this repository
2. **Open Chrome** and navigate to `chrome://extensions/`
3. **Enable Developer Mode** (toggle in top right)
4. **Click "Load unpacked"** and select the extension directory
5. **Pin the extension** to your toolbar for easy access

### Manual Installation
1. **Pack the extension** into a `.crx` file
2. **Install** by dragging the `.crx` file to `chrome://extensions/`

## Usage

### Basic Operation
1. **Navigate** to any website
2. **Enter sensitive information** in form fields
3. **Warning appears** if on non-HTTPS page
4. **Choose action**: Continue, clear input, or navigate to secure version

### Managing Custom Patterns
1. **Click extension icon** in toolbar
2. **Navigate to "Custom Patterns"** section
3. **Click "Add Custom Pattern"**
4. **Enter pattern details**:
   - **Name**: Descriptive name for the pattern
   - **Regex**: JavaScript regular expression
   - **Severity**: Low, Medium, or High
   - **Test**: Validate your pattern with sample text
5. **Save** the pattern

### Settings Configuration
- **Scan iframes**: Enable/disable iframe content scanning
- **Scan Shadow DOM**: Enable/disable Shadow DOM scanning
- **Show notifications**: Enable/disable desktop notifications

### Export/Import Settings
- **Export**: Save your custom patterns and settings to a JSON file
- **Import**: Load previously exported settings

## Technical Details

### Architecture
```
├── manifest.json              # Extension configuration
├── content/
│   ├── detector.js           # Main detection logic
│   ├── iframe-scanner.js     # Iframe content scanning
│   ├── shadow-dom-scanner.js # Shadow DOM scanning
│   └── injected-script.js    # Cross-origin iframe communication
├── background/
│   └── service-worker.js     # Background tasks and extension monitoring
├── popup/
│   ├── popup.html           # Extension popup interface
│   ├── popup.css            # Popup styling
│   └── popup.js             # Popup functionality
├── styles/
│   └── warning.css          # Warning element styles
└── icons/                   # Extension icons
```

### Security Features

#### Pattern Detection
- **Built-in Patterns**: Pre-configured for common sensitive data types
- **Custom Patterns**: User-definable regex patterns with validation
- **False Positive Reduction**: Context-aware detection algorithms

#### Bypass Prevention
- **Iframe Protection**: Injects detection scripts into all iframes
- **Shadow DOM Scanning**: Penetrates encapsulated component boundaries
- **Dynamic Content Monitoring**: Observes DOM mutations for new inputs
- **Extension Monitoring**: Detects when extension is disabled

#### Privacy Protection
- **Local Processing**: All detection happens locally in the browser
- **No Data Collection**: Sensitive information never leaves your device
- **Minimal Permissions**: Only requests necessary browser permissions

### Browser Compatibility
- **Chrome**: Version 88+
- **Chromium**: Version 88+
- **Edge**: Version 88+ (Chromium-based)

## Development

### Setup Development Environment
```bash
# Clone the repository
git clone <repository-url>
cd chrome_extension

# Load in Chrome Developer Mode
# 1. Open chrome://extensions/
# 2. Enable Developer Mode
# 3. Click "Load unpacked"
# 4. Select this directory
```

### File Structure
- **Content Scripts**: Run on web pages to detect sensitive information
- **Background Script**: Handles extension lifecycle and cross-tab communication
- **Popup Interface**: Provides user configuration and status information
- **Injected Scripts**: Handle cross-origin iframe communication

### Adding New Detection Patterns
1. **Edit** `content/detector.js`
2. **Add pattern** to `sensitivePatterns` object:
```javascript
newPattern: {
  pattern: /your-regex-here/g,
  name: 'Pattern Name',
  severity: 'high|medium|low'
}
```

### Customizing Warning Styles
1. **Edit** `styles/warning.css`
2. **Modify** existing classes or add new ones
3. **Update** severity-based styling as needed

## Security Considerations

### Data Protection
- **No Network Requests**: Extension operates entirely offline
- **Local Storage Only**: Custom patterns stored in Chrome sync storage
- **No Analytics**: No usage data collected or transmitted

### Permission Justification
- **activeTab**: Required to access current page content
- **storage**: Needed for saving custom patterns and settings
- **tabs**: Required for security status checking
- **management**: Needed to detect extension disable events

### Threat Model
- **Man-in-the-Middle Attacks**: Primary threat on HTTP sites
- **Network Eavesdropping**: Unencrypted data transmission
- **Extension Bypass**: Attempts to disable or circumvent warnings

## Troubleshooting

### Common Issues

#### Extension Not Working
1. **Check permissions**: Ensure all required permissions are granted
2. **Reload extension**: Disable and re-enable in chrome://extensions/
3. **Check console**: Look for errors in browser developer tools

#### Warnings Not Appearing
1. **Verify HTTPS status**: Extension only warns on HTTP pages
2. **Check pattern matching**: Ensure entered data matches detection patterns
3. **Disable conflicts**: Other extensions might interfere

#### Custom Patterns Not Working
1. **Validate regex**: Test pattern syntax in popup test area
2. **Check escaping**: Ensure proper regex escaping for special characters
3. **Reload page**: Refresh page after adding new patterns

### Debug Mode
1. **Enable debug logging** in developer tools console
2. **Check content script injection** in page elements
3. **Monitor background script** in extension service worker

## Contributing

### Guidelines
1. **Follow existing code style** and patterns
2. **Test thoroughly** across different websites and scenarios
3. **Document changes** and update README as needed
4. **Consider security implications** of any modifications

### Development Workflow
1. **Fork** the repository
2. **Create feature branch** for your changes
3. **Test extensively** in developer mode
4. **Submit pull request** with detailed description

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Changelog

### Version 1.0.0
- Initial release
- Basic sensitive information detection
- Custom pattern support
- Iframe and Shadow DOM scanning
- Extension disable detection
- Popup configuration interface

## Support

For issues, questions, or feature requests, please create an issue in the repository or contact the development team.

---

**⚠️ Security Notice**: This extension is designed to protect against accidental data exposure on insecure sites. It should not be considered a complete security solution. Always use HTTPS websites when entering sensitive information.
