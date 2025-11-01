    // Mobile navbar toggle
    document.addEventListener('DOMContentLoaded', function() {
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

        // Update banners (test mode, admin message, max upload size)
        if (typeof updateBanners === 'function') {
            updateBanners();
        }
    });
