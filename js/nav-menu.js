/*
 * Primary-nav submenus (Services ▸ Process/Approach, Digital Experience).
 *
 * Disclosure pattern: each .af-nav__group has one <button aria-expanded>
 * that controls its .af-nav__submenu. CSS shows the submenu when the button
 * is expanded (and, on wide hover-capable screens, on hover). This script:
 *  - toggles aria-expanded on click (one submenu open at a time),
 *  - closes on Escape and returns focus to the button (WCAG 2.1.2),
 *  - closes when focus or a click leaves the group,
 *  - on Escape also suppresses the hover reveal until the pointer leaves,
 *    so hover-shown content is dismissable (WCAG 1.4.13).
 * No matchMedia here — breakpoints live only in css/redesign.css.
 */
(function () {
  'use strict';
  var groups = document.querySelectorAll('.af-nav__group');
  if (!groups.length) return;

  function buttonOf(group) {
    return group.querySelector('button[aria-controls]');
  }

  function close(group, refocus) {
    var btn = buttonOf(group);
    if (!btn) return;
    btn.setAttribute('aria-expanded', 'false');
    if (refocus) btn.focus();
  }

  function closeAll(except) {
    for (var i = 0; i < groups.length; i++) {
      if (groups[i] !== except) close(groups[i], false);
    }
  }

  for (var i = 0; i < groups.length; i++) {
    (function (group) {
      var btn = buttonOf(group);
      if (!btn) return;

      btn.addEventListener('click', function () {
        var open = btn.getAttribute('aria-expanded') === 'true';
        closeAll(group);
        btn.setAttribute('aria-expanded', open ? 'false' : 'true');
        group.classList.remove('af-nav__group--dismissed');
      });

      group.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape') return;
        var wasOpen = btn.getAttribute('aria-expanded') === 'true';
        group.classList.add('af-nav__group--dismissed');
        if (wasOpen || group.contains(document.activeElement)) {
          e.stopPropagation();
          close(group, true);
        }
      });

      group.addEventListener('focusout', function () {
        window.requestAnimationFrame(function () {
          if (!group.contains(document.activeElement)) close(group, false);
        });
      });

      group.addEventListener('mouseleave', function () {
        group.classList.remove('af-nav__group--dismissed');
      });
    })(groups[i]);
  }

  document.addEventListener('click', function (e) {
    if (!(e.target.closest && e.target.closest('.af-nav__group'))) closeAll(null);
  });
})();
