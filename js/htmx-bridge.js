/**
 * htmx-bridge.js - Client-Side HTMX Bridge & Extension
 * Enables HTMX (hx-get, hx-post, hx-target, hx-swap) to operate 100% client-side
 * on static GitHub Pages without requiring a backend server.
 */

(function () {
  if (typeof htmx === 'undefined') {
    console.warn('[HTMX Bridge] HTMX library not detected yet.');
    return;
  }

  /**
   * Define custom HTMX extension 'client-api'
   * Intercepts HTMX AJAX requests and fulfills them with client-rendered HTML templates.
   */
  htmx.defineExtension('client-api', {
    onEvent: function (name, evt) {
      if (name === 'htmx:beforeRequest') {
        const xhr = evt.detail.xhr;
        const elt = evt.detail.elt;
        const requestConfig = evt.detail.requestConfig;
        const path = requestConfig.path;
        const verb = requestConfig.verb.toLowerCase();
        const parameters = requestConfig.parameters || {};

        // Prevent actual network fetch
        evt.preventDefault();

        // Process request through client-side router
        setTimeout(async () => {
          try {
            const htmlResult = await window.app.renderPartial(path, verb, parameters, elt);
            
            // Fulfill HTMX target
            const targetSelector = elt.getAttribute('hx-target') || '#content-area';
            const targetEl = targetSelector === 'this' ? elt : document.querySelector(targetSelector);
            const swapSpec = elt.getAttribute('hx-swap') || 'innerHTML';

            if (targetEl) {
              if (swapSpec === 'outerHTML') {
                targetEl.outerHTML = htmlResult;
              } else {
                targetEl.innerHTML = htmlResult;
              }
              htmx.process(targetEl);
              
              // Post-swap hook for syntax highlighting and markdown
              if (window.app && window.app.onContentSwapped) {
                window.app.onContentSwapped(targetEl);
              }
            }
          } catch (err) {
            console.error('[HTMX Bridge] Error rendering client route:', err);
          }
        }, 10);
      }
    }
  });

  console.log('[HTMX Bridge] Extension "client-api" successfully registered.');
})();
