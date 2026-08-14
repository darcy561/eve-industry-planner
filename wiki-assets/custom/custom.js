/**
 * Custom JavaScript for Otter Wiki - Theme Sync Only
 * 
 * This script syncs the wiki's theme with the main application's theme
 * preference using cookies (shared across subdomains).
 * 
 * No custom styling is applied - Otter Wiki uses its default Halfmoon styling.
 */

(function() {
  'use strict';
  
  // Theme sync manager - only handles cookie syncing, no styling
  const ThemeSync = {
    COOKIE_NAME: 'eip-theme', // Shared cookie name for theme
    
    init: function() {
      // Sync theme from main app cookie
      this.syncThemeFromMainApp();
      
      // Update toggle button icon
      this.updateToggleIcon();
      
      // Watch for cookie changes from main app
      this.watchCookieChanges();
      
      // Watch for theme changes in Otter Wiki to update cookie
      this.watchWikiThemeChanges();
      
      // Watch for theme changes to update icon
      this.watchThemeForIcon();
    },
    
    updateToggleIcon: function() {
      // Find the toggle dark mode link
      const toggleLink = Array.from(document.querySelectorAll('a')).find(a => 
        a.textContent.toLowerCase().includes('toggle dark mode') ||
        (a.getAttribute('onclick') && a.getAttribute('onclick').includes('toggleDarkMode'))
      );
      
      if (toggleLink) {
        // Find the icon element (could be Font Awesome or we'll convert it)
        let iconElement = toggleLink.querySelector('i.fa-moon, i.fa-sun, i.far, i.fas, i.fa');
        
        if (!iconElement) {
          // If no icon element exists, find the dropdown-icon span
          const iconContainer = toggleLink.querySelector('.dropdown-icon');
          if (iconContainer) {
            iconElement = iconContainer.querySelector('i') || iconContainer;
          }
        }
        
        if (iconElement) {
          // Check current theme state
          const isDark = document.body.classList.contains('dark-mode') ||
                        document.documentElement.classList.contains('dark-mode') ||
                        localStorage.getItem('halfmoon_preferredMode') === 'dark-mode';
          
          // Load Material Icons font if not already loaded
          this.loadMaterialIcons();
          
          // Replace with Material Icons to match main app
          // Main app logic: light mode shows DarkModeIcon, dark mode shows LightModeIcon
          // So: if dark mode, show light_mode icon (clicking switches to light)
          //     if light mode, show dark_mode icon (clicking switches to dark)
          if (isDark) {
            // Dark mode active - show light_mode icon (clicking will switch to light)
            iconElement.className = 'material-icons';
            iconElement.textContent = 'light_mode';
            iconElement.style.fontFamily = 'Material Icons';
          } else {
            // Light mode active - show dark_mode icon (clicking will switch to dark)
            iconElement.className = 'material-icons';
            iconElement.textContent = 'dark_mode';
            iconElement.style.fontFamily = 'Material Icons';
          }
        }
      }
    },
    
    loadMaterialIcons: function() {
      // Check if Material Icons font is already loaded
      if (document.querySelector('link[href*="material-icons"]') || 
          document.querySelector('link[href*="fonts.googleapis.com"]')) {
        return; // Already loaded
      }
      
      // Load Material Icons font from Google Fonts
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/icon?family=Material+Icons';
      document.head.appendChild(link);
    },
    
    watchThemeForIcon: function() {
      // Watch for class changes on body/html to update icon
      const observer = new MutationObserver(() => {
        this.updateToggleIcon();
      });
      
      observer.observe(document.body, {
        attributes: true,
        attributeFilter: ['class']
      });
      
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class']
      });
    },
    
    getCookie: function(name) {
      const value = `; ${document.cookie}`;
      const parts = value.split(`; ${name}=`);
      if (parts.length === 2) return parts.pop().split(';').shift();
      return null;
    },
    
    setCookie: function(name, value, days = 365) {
      // Set cookie on parent domain so both subdomains can access it
      const domain = this.getParentDomain();
      const expires = new Date();
      expires.setTime(expires.getTime() + (days * 24 * 60 * 60 * 1000));
      document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/;domain=${domain}`;
    },
    
    getParentDomain: function() {
      const hostname = window.location.hostname;
      // For localhost, return as-is
      if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return hostname;
      }
      // For production, return parent domain (e.g., .eveindustryplanner.com)
      const parts = hostname.split('.');
      if (parts.length > 2) {
        return '.' + parts.slice(-2).join('.');
      }
      return hostname;
    },
    
    syncThemeFromMainApp: function() {
      // Try to get theme from cookie (set by main app)
      const cookieTheme = this.getCookie(this.COOKIE_NAME);
      
      if (cookieTheme) {
        // Map main app theme to Otter Wiki theme
        // Main app uses "dark" or "light", Otter Wiki uses "dark-mode" or "light-mode"
        const otterWikiTheme = cookieTheme === 'dark' ? 'dark-mode' : 'light-mode';
        
        // Set Otter Wiki's theme if it's different
        const currentOtterTheme = localStorage.getItem('halfmoon_preferredMode');
        if (currentOtterTheme !== otterWikiTheme) {
          localStorage.setItem('halfmoon_preferredMode', otterWikiTheme);
          // Trigger Halfmoon's theme change if available
          if (typeof halfmoon !== 'undefined') {
            // Check if we need to toggle
            const bodyHasDark = document.body.classList.contains('dark-mode');
            const shouldBeDark = otterWikiTheme === 'dark-mode';
            if (bodyHasDark !== shouldBeDark) {
              halfmoon.toggleDarkMode();
            }
          }
        }
      }
    },
    
    watchCookieChanges: function() {
      // Poll for cookie changes (since there's no direct cookie change event)
      let lastCookieValue = this.getCookie(this.COOKIE_NAME);
      
      setInterval(() => {
        const currentCookieValue = this.getCookie(this.COOKIE_NAME);
        if (currentCookieValue !== lastCookieValue) {
          lastCookieValue = currentCookieValue;
          this.syncThemeFromMainApp();
          // Update icon after theme sync
          setTimeout(() => this.updateToggleIcon(), 200);
        }
      }, 500); // Check every 500ms
    },
    
    watchWikiThemeChanges: function() {
      // Watch for changes in localStorage (Halfmoon stores theme preference there)
      const originalSetItem = localStorage.setItem;
      localStorage.setItem = function(key, value) {
        originalSetItem.apply(this, arguments);
        if (key === 'halfmoon_preferredMode') {
          // Update cookie when Otter Wiki theme changes
          const theme = value === 'dark-mode' ? 'dark' : 'light';
          ThemeSync.setCookie(ThemeSync.COOKIE_NAME, theme);
          // Update icon after a short delay to ensure theme has applied
          setTimeout(() => ThemeSync.updateToggleIcon(), 100);
        }
      };
      
      // Watch for clicks on the theme toggle (Otter Wiki's existing toggle)
      document.addEventListener('click', (e) => {
        const target = e.target.closest('a, button');
        if (target && (
          target.textContent.toLowerCase().includes('toggle dark mode') ||
          target.textContent.toLowerCase().includes('dark mode') ||
          target.getAttribute('onclick')?.includes('dark') ||
          target.getAttribute('onclick')?.includes('theme')
        )) {
          // Wait for Halfmoon to update, then sync cookie and update icon
          setTimeout(() => {
            const halfmoonTheme = localStorage.getItem('halfmoon_preferredMode');
            if (halfmoonTheme) {
              const theme = halfmoonTheme === 'dark-mode' ? 'dark' : 'light';
              ThemeSync.setCookie(ThemeSync.COOKIE_NAME, theme);
              ThemeSync.updateToggleIcon();
            }
          }, 300);
        }
      }, true);
    }
  };
  
  // Initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => ThemeSync.init());
  } else {
    ThemeSync.init();
  }
})();
