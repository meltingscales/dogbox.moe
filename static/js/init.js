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

            // Initialize mobile menu toggle (since scripts in innerHTML don't execute)
            initializeNavbarToggle();

            // Update banners (test mode and admin message)
            if (typeof window.updateBanners === 'function') {
                await updateBanners();
            }
        }
    } catch (err) {
        console.error('Failed to initialize page:', err);
    }
}

function initializeNavbarToggle() {
    const navbarToggle = document.getElementById('navbar-toggle');
    const navbarNav = document.getElementById('navbar-nav');

    if (navbarToggle && navbarNav) {
        navbarToggle.addEventListener('click', function() {
            navbarNav.classList.toggle('show');
        });

        // Close menu when clicking a link
        const navLinks = navbarNav.querySelectorAll('.navbar-link');
        navLinks.forEach(link => {
            link.addEventListener('click', function() {
                navbarNav.classList.remove('show');
            });
        });

        // Close menu when clicking outside
        document.addEventListener('click', function(event) {
            if (!navbarToggle.contains(event.target) && !navbarNav.contains(event.target)) {
                navbarNav.classList.remove('show');
            }
        });
    }
}

// Export for use in browser
if (typeof window !== 'undefined') {
    window.initializePage = initializePage;
}
