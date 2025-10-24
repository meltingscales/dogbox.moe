/**
 * dogbox.moe Page Initialization
 *
 * Shared initialization code for all pages
 */

async function initializePage() {
    try {
        // Load navbar
        const response = await fetch("/static/navbar.html");
        const html = await response.text();
        const navbarPlaceholder = document.getElementById("navbar-placeholder");

        if (navbarPlaceholder) {
            navbarPlaceholder.innerHTML = html;

            // Set logo and site name from config
            if (window.DogboxConfig) {
                const logoEl = document.getElementById('navbar-logo');
                const siteNameEl = document.getElementById('navbar-sitename');
                if (logoEl) logoEl.textContent = DogboxConfig.logo;
                if (siteNameEl) siteNameEl.textContent = DogboxConfig.siteName;
            }

            // Update banners (test mode and admin message)
            if (typeof window.updateBanners === 'function') {
                await updateBanners();
            }
        }
    } catch (err) {
        console.error('Failed to initialize page:', err);
    }
}

// Export for use in browser
if (typeof window !== 'undefined') {
    window.initializePage = initializePage;
}
