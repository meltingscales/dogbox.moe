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

    // Limits (maxFileSize will be fetched from API)
    defaultExpiryHours: 24,
    maxExpiryHours: 168, // 7 days

    /**
     * Get max upload size in human readable format
     * Falls back to API value from window.maxUploadSize
     */
    getMaxUploadSizeFormatted: function() {
        const bytes = window.maxUploadSize || (5 * 1024 * 1024 * 1024); // Default to 5GB if not yet loaded
        const gb = bytes / (1024 * 1024 * 1024);
        const mb = bytes / (1024 * 1024);

        if (gb >= 1) {
            return `${gb.toFixed(0)}GB`;
        } else {
            return `${mb.toFixed(0)}MB`;
        }
    }
};

// Export for use in browser
if (typeof window !== 'undefined') {
    window.DogboxConfig = DogboxConfig;
}
