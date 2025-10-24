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

    // Limits
    maxFileSize: 100 * 1024 * 1024, // 100MB in bytes
    maxFileSizeMB: 100,
    defaultExpiryHours: 24,
    maxExpiryHours: 168, // 7 days
};

// Export for use in browser
if (typeof window !== 'undefined') {
    window.DogboxConfig = DogboxConfig;
}
