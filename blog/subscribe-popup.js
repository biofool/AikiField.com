// Subscribe popup — shows on window blur unless already a Sangha member
(function() {
    // Don't show if already subscribed
    if (localStorage.getItem('sangha_member') === 'true') return;

    // Don't show on the sangha subscribe page itself
    if (location.pathname.indexOf('sangha.html') !== -1) return;

    // Don't show if already shown this session
    if (sessionStorage.getItem('popup_shown')) return;

    // Inject popup HTML
    var overlay = document.createElement('div');
    overlay.id = 'subscribe-popup';
    overlay.style.cssText = 'display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);z-index:9999;align-items:center;justify-content:center;';
    overlay.innerHTML =
        '<div style="background:#0f172a;border:1px solid #334155;border-radius:12px;padding:2.5rem;max-width:420px;text-align:center;position:relative;box-shadow:0 25px 50px rgba(0,0,0,0.5);">' +
            '<button id="popup-close" style="position:absolute;top:1rem;right:1rem;background:none;border:none;color:#94a3b8;font-size:1.5rem;cursor:pointer;line-height:1;">&times;</button>' +
            '<h2 style="color:#a78bfa;margin-bottom:1rem;font-size:1.5rem;">Before You Go...</h2>' +
            '<p style="color:#cbd5e1;margin-bottom:1.5rem;line-height:1.6;">Get Chapter One of <strong>Quantum Aikido</strong> free and join Richard Moon\'s community.</p>' +
            '<a href="https://quantumaikido.com/sangha" style="display:inline-block;background:#8b5cf6;color:white;padding:1rem 2rem;border-radius:6px;text-decoration:none;font-weight:500;">Get Free Chapter</a>' +
            '<p style="color:#94a3b8;font-size:0.85rem;margin-top:1rem;">No spam. Unsubscribe anytime.</p>' +
        '</div>';
    document.body.appendChild(overlay);

    function showPopup() {
        if (sessionStorage.getItem('popup_shown')) return;
        if (localStorage.getItem('sangha_member') === 'true') return;
        overlay.style.display = 'flex';
        sessionStorage.setItem('popup_shown', 'true');
    }

    function closePopup() {
        overlay.style.display = 'none';
    }

    // Show on tab/window blur
    window.addEventListener('blur', showPopup);

    // Close button
    document.getElementById('popup-close').addEventListener('click', closePopup);

    // Close on click outside
    overlay.addEventListener('click', function(e) {
        if (e.target === overlay) closePopup();
    });

    // Close on Escape
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') closePopup();
    });
})();
