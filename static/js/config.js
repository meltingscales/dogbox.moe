/**
 * dogbox.moe Site Configuration
 * Centralized configuration for branding and constants
 */

const DogboxConfig = {
    // Site branding
    logo: '🐕🐾🦴💨',
    siteName: 'dogbox.moe',
    tagline: 'Privacy-focused file hosting with end-to-end encryption',

    // URLs
    apiDocs: '/docs',
    sourceCode: 'https://github.com/meltingscales/dogbox.moe',

    // Limits (fetched dynamically from API, with defaults as fallback)
    get maxFileSize() {
        return window.maxUploadSize || (100 * 1024 * 1024); // Fallback to 100MB
    },
    get maxFileSizeMB() {
        return Math.floor((window.maxUploadSize || (100 * 1024 * 1024)) / (1024 * 1024));
    },
    defaultExpiryHours: 24,
    maxExpiryHours: 168, // 7 days
};

// Export for use in browser
if (typeof window !== 'undefined') {
    window.DogboxConfig = DogboxConfig;
}
