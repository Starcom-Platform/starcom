// Hides the static preloader in index.html once the app's own preloader takes over,
// and removes it after three seconds if the app never loads.
//
// This was an inline <script> in index.html; see globals.js beside it for why it is a
// file now.
window.hideInitialPreloader = function() {
  const initialPreloader = document.getElementById('initial-preloader');
  if (initialPreloader) {
    initialPreloader.style.opacity = '0';
    initialPreloader.style.transition = 'opacity 0.3s ease-out';
    setTimeout(function() {
      initialPreloader.remove();
    }, 300);
  }
};

// Fallback: Remove initial preloader after reasonable time if React doesn't load
setTimeout(function() {
  if (document.getElementById('initial-preloader')) {
    console.warn('Initial preloader removed by fallback timer');
    window.hideInitialPreloader();
  }
}, 3000);
