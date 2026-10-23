/**
 * On this page (issues #152 / #154).
 *
 * Progressive enhancement for the in-page table of contents (<nav class="toc">).
 * Wide viewports get a sticky right-hand rail (CSS only, see styles.css).
 * Below the rail breakpoint the list collapses behind a hamburger toggle so it
 * does not push the article down the screen.
 *
 * The markup is baked into 14 pages, so the button is created here rather than
 * added to each file. Without JS the list simply stays open.
 */
(function () {
    'use strict';

    // Match the CSS rail breakpoint in styles.css (min-width: 1600px).
    var RAIL_QUERY = '(min-width: 1600px)';

    function enhance(toc, index) {
        var list = toc.querySelector('ol, ul');
        if (!list) return;

        if (!list.id) list.id = 'toc-list-' + index;

        var titleEl = toc.querySelector('.toc-title');
        var label = titleEl ? titleEl.textContent.trim() : 'On this page';

        var toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'toc-toggle';
        toggle.setAttribute('aria-expanded', 'false');
        toggle.setAttribute('aria-controls', list.id);
        toggle.innerHTML =
            '<span class="toc-toggle-icon" aria-hidden="true">&#9776;</span>' +
            '<span class="toc-toggle-label"></span>' +
            '<span class="toc-toggle-caret" aria-hidden="true">&#9662;</span>';
        toggle.querySelector('.toc-toggle-label').textContent = label;

        toc.insertBefore(toggle, list);
        toc.classList.add('toc-collapsible');

        function setOpen(open) {
            toc.classList.toggle('toc-open', open);
            toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        }

        toggle.addEventListener('click', function () {
            setOpen(!toc.classList.contains('toc-open'));
        });

        // Jumping to a section closes the panel so the target is visible.
        list.addEventListener('click', function (e) {
            if (e.target.closest && e.target.closest('a')) setOpen(false);
        });

        document.addEventListener('keydown', function (e) {
            if (e.key !== 'Escape') return;
            if (!toc.classList.contains('toc-open')) return;
            setOpen(false);
            toggle.focus();
        });

        // The rail is always expanded; reset the collapsed state when the
        // viewport crosses back under the breakpoint.
        var mq = window.matchMedia(RAIL_QUERY);
        var onChange = function () {
            if (mq.matches) setOpen(false);
        };
        if (mq.addEventListener) {
            mq.addEventListener('change', onChange);
        } else if (mq.addListener) {
            mq.addListener(onChange);
        }
    }

    function init() {
        var tocs = document.querySelectorAll('main .toc');
        for (var i = 0; i < tocs.length; i++) enhance(tocs[i], i);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
