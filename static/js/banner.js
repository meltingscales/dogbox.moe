/**
 * dogbox.moe Banner Utility
 *
 * Handles displaying test mode and admin message banners
 */

let deleteTimestamp = null;
let countdownInterval = null;
let maxUploadSize = null;

function formatCountdown(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
        const remainingHours = hours % 24;
        const remainingMinutes = minutes % 60;
        return `in ${days}d ${remainingHours}h ${remainingMinutes}m`;
    } else if (hours > 0) {
        const remainingMinutes = minutes % 60;
        const remainingSeconds = seconds % 60;
        return `in ${hours}h ${remainingMinutes}m ${remainingSeconds}s`;
    } else if (minutes > 0) {
        const remainingSeconds = seconds % 60;
        return `in ${minutes}m ${remainingSeconds}s`;
    } else if (seconds > 0) {
        return `in ${seconds}s`;
    } else {
        return 'imminently';
    }
}

function updateCountdown() {
    if (!deleteTimestamp) return;

    const deleteTimeEl = document.getElementById('test-delete-time');
    if (!deleteTimeEl) return;

    const now = Date.now();
    const timeUntilDelete = deleteTimestamp - now;

    if (timeUntilDelete <= 0) {
        deleteTimeEl.textContent = 'imminently';
        if (countdownInterval) {
            clearInterval(countdownInterval);
            countdownInterval = null;
        }
    } else {
        deleteTimeEl.textContent = formatCountdown(timeUntilDelete);
    }
}

async function updateBanners() {
    try {
        const response = await fetch('/api/health');
        const data = await response.json();

        // Store max upload size globally
        if (data.max_upload_size) {
            maxUploadSize = data.max_upload_size;
            window.maxUploadSize = maxUploadSize; // Make it available globally

            // Update max upload size display
            const sizeMB = Math.floor(maxUploadSize / (1024 * 1024));

            // Update by ID (index.html)
            const maxUploadEl = document.getElementById('max-upload-size');
            if (maxUploadEl) {
                maxUploadEl.textContent = `${sizeMB}MB`;
            }

            // Update by class (post-types.html and others)
            const maxUploadEls = document.getElementsByClassName('max-upload-size-display');
            for (let el of maxUploadEls) {
                el.textContent = `${sizeMB}MB`;
            }
        }

        // Handle test mode banner
        if (data.test_mode) {
            const banner = document.getElementById('test-mode-banner');
            const deleteTimeEl = document.getElementById('test-delete-time');

            if (banner && deleteTimeEl && data.next_test_delete) {
                deleteTimestamp = new Date(data.next_test_delete).getTime();

                // Show banner
                banner.classList.add('show');

                // Update countdown immediately
                updateCountdown();

                // Start countdown interval if not already running
                if (!countdownInterval) {
                    countdownInterval = setInterval(updateCountdown, 1000);
                }
            }
        }

        // Handle admin message banner
        if (data.admin_message) {
            const adminBanner = document.getElementById('admin-message-banner');
            const adminText = document.getElementById('admin-message-text');

            if (adminBanner && adminText) {
                adminText.textContent = data.admin_message;
                adminBanner.style.display = 'block';
            }
        }
    } catch (err) {
        console.error('Failed to update banners:', err);
    }
}

// Export for use in browser
if (typeof window !== 'undefined') {
    window.updateBanners = updateBanners;
}
