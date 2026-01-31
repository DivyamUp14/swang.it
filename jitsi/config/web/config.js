// Jitsi Meet configuration.

var config = {};

config.hosts = {};
config.hosts.domain = 'meet.jitsi';

var subdir = '<!--# echo var="subdir" default="" -->';
var subdomain = '<!--# echo var="subdomain" default="" -->';
if (subdir.startsWith('<!--')) {
    subdir = '';
}
if (subdomain) {
    subdomain = subdomain.substring(0,subdomain.length-1).split('.').join('_').toLowerCase() + '.';
}
config.hosts.muc = 'muc.' + subdomain + 'meet.jitsi';
config.bosh = 'https://http://localhost:8088/' + subdir + 'http-bind';
config.bridgeChannel = {
    preferSctp: true
};


// Video configuration.
//

config.resolution = 720;
config.constraints = {
    video: {
        height: { ideal: 720, max: 720, min: 180 },
        width: { ideal: 1280, max: 1280, min: 320},
    }
};

config.startVideoMuted = 10;
config.startWithVideoMuted = false;

config.flags = {
    sourceNameSignaling: true,
    sendMultipleVideoStreams: true,
    receiveMultipleVideoStreams: true
};

// ScreenShare Configuration.
//

// Audio configuration.
//

config.enableNoAudioDetection = true;
config.enableTalkWhileMuted = false;
config.disableAP = false;
config.disableAGC = false;

config.audioQuality = {
    stereo: false
};

config.startAudioOnly = false;
config.startAudioMuted = 10;
config.startWithAudioMuted = false;
config.startSilent = false;
config.enableOpusRed = false;
config.disableAudioLevels = false;
config.enableNoisyMicDetection = true;


// Peer-to-Peer options.
//

config.p2p = {
    enabled: true,
    codecPreferenceOrder: ["AV1", "VP9", "VP8", "H264"],
    mobileCodecPreferenceOrder: ["VP8", "VP9", "H264", "AV1"]
};

// Breakout Rooms
//

config.hideAddRoomButton = false;


// Etherpad
//

// Recording.
//

// Local recording configuration.
config.localRecording = {
    disable: false,
    notifyAllParticipants: false,
    disableSelfRecording: false
};


// Analytics.
//

config.analytics = {};

// Dial in/out services.
//


// Calendar service integration.
//

config.enableCalendarIntegration = false;

// Invitation service.
//

// Miscellaneous.
//

// Prejoin page.
config.prejoinConfig = {
    enabled: true,

    // Hides the participant name editing field in the prejoin screen.
    hideDisplayName: false
};

// List of buttons to hide from the extra join options dropdown on prejoin screen.
// Welcome page.
config.welcomePage = {
    disabled: false
};

// Close page.
config.enableClosePage = false;

// Default language.
// Require users to always specify a display name.
config.requireDisplayName = false;

// Chrome extension banner.
// Disables profile and the edit of all fields from the profile settings (display name and email)
config.disableProfile = false;

// Room password (false for anything, number for max digits)
config.roomPasswordNumberOfDigits = false;
// Advanced.
//

// Transcriptions (subtitles and buttons can be configured in interface_config)
config.transcription = {
    enabled: false,
    disableClosedCaptions: true,
    translationLanguages: [],
    translationLanguagesHead: ['en'],
    useAppLanguage: true,
    preferredLanguage: 'en-US',
    disableStartForAll: false,
    autoCaptionOnRecord: false,
};

// Dynamic branding
// Deployment information.
//

config.deploymentInfo = {};

// Deep Linking
config.disableDeepLinking = false;

// P2P preferred codec
// Video quality settings.
//

config.videoQuality = {};
config.videoQuality.codecPreferenceOrder = ["AV1", "VP9", "VP8", "H264"];
config.videoQuality.mobileCodecPreferenceOrder = ["VP8", "VP9", "H264", "AV1"];
config.videoQuality.enableAdaptiveMode = true;

config.videoQuality.av1 = {};

config.videoQuality.h264 = {};

config.videoQuality.vp8 = {};

config.videoQuality.vp9 = {};

// Reactions
config.disableReactions = false;

// Polls
config.disablePolls = false;

// Configure toolbar buttons
// Hides the buttons at pre-join screen
// Configure remote participant video menu
config.remoteVideoMenu = {
    disabled: false,
    disableKick: false,
    disableGrantModerator: false,
    disablePrivateChat: false
};

// Configure e2eping
config.e2eping = {
    enabled: false
};



// Settings for the Excalidraw whiteboard integration.
config.whiteboard = {
    enabled: false,
};

// JaaS support: pre-configure image if JAAS_APP_ID was set.
// Testing
config.testing = {
    enableCodecSelectionAPI: true
};
// Jitsi configuration for HTTPS with IP address support
// This works with both domain names and IP addresses over HTTPS

var subdir = ''; // force empty to avoid unresolved SSI fragments

// Detect if we're using an IP address
function isIPAddress(host) {
    // IPv4 regex
    var ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}(:\d+)?$/;
    // IPv6 regex (basic check)
    var ipv6Regex = /^\[?([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}\]?(:\d+)?$/i;
    return ipv4Regex.test(host) || ipv6Regex.test(host);
}

function isLocalhost(host) {
    return host === 'localhost' || host === '127.0.0.1' || host.startsWith('localhost:') || host.startsWith('127.0.0.1:');
}

var currentLocation = (typeof window !== 'undefined' && window.location) ? window.location : { protocol: 'https:', host: '72.61.110.120:8443' };
var host = currentLocation.host || '72.61.110.120:8443';
var isIP = isIPAddress(host) || isLocalhost(host);

// Respect the protocol being used (HTTPS for production, HTTP for localhost)
var protocol = currentLocation.protocol || 'https:';
var hostWithoutProtocol = host.replace(/^https?:\/\//i, '').replace(/\/$/, '');

// Construct the origin with current protocol
var jitsiOrigin = protocol + '//' + hostWithoutProtocol;

// Set BOSH and service URLs
config.bosh = jitsiOrigin.replace(/\/$/, '') + '/http-bind';
config.serviceUrl = config.bosh;

// For IP addresses with HTTPS, use BOSH (no WebSocket to avoid mixed content issues)
config.websocket = null;
config.transports = ['bosh'];
config.preferHTTP = isLocalhost(host); // Only prefer HTTP for localhost

// For IP addresses, set serverURL to help with browser compatibility
if (isIP) {
    config.serverURL = jitsiOrigin;
}

// For IP addresses, configure to work with self-signed certificates
if (isIP) {
    config.enableInsecureRoomNameWarning = false;
    config.enableWelcomePage = false;
    config.enableBrowserWarning = false;
    config.enableClosePage = false;
    // Try to bypass browser checks for IP addresses
    config.deploymentInfo = config.deploymentInfo || {};
    if (typeof navigator !== 'undefined') {
        config.deploymentInfo.userAgent = navigator.userAgent;
    }
}

// Disable browser compatibility warnings - this must be set BEFORE Jitsi loads
if (typeof interfaceConfig !== 'undefined') {
    interfaceConfig.UNSUPPORTED_BROWSERS = [];
    interfaceConfig.OPTIMAL_BROWSERS = ['chrome', 'chromium', 'firefox', 'electron', 'safari', 'webkit', 'edge'];
}

