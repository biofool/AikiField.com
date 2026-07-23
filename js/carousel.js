// AikiField — Hero carousel
// Auto-rotating carousel with dots, arrows, progress bar, and keyboard support.
(function () {
  "use strict";

  var INTERVAL = 6000; // ms per slide
  var TICK = 50;       // progress bar update interval

  function init() {
    var carousel = document.querySelector(".af-carousel");
    if (!carousel) return;

    var slides = Array.prototype.slice.call(carousel.querySelectorAll(".af-carousel__slide"));
    var dots = Array.prototype.slice.call(carousel.querySelectorAll(".af-carousel__dot"));
    var prevBtn = carousel.querySelector(".af-carousel__arrow--prev");
    var nextBtn = carousel.querySelector(".af-carousel__arrow--next");
    var progressBar = carousel.querySelector(".af-carousel__progress-bar");
    if (slides.length === 0) return;

    var current = 0;
    var elapsed = 0;
    var timerId = null;
    var progressId = null;
    var paused = false;

    function show(idx) {
      current = (idx + slides.length) % slides.length;
      slides.forEach(function (s, i) {
        s.classList.toggle("af-carousel__slide--active", i === current);
      });
      dots.forEach(function (d, i) {
        d.classList.toggle("af-carousel__dot--active", i === current);
        d.setAttribute("aria-selected", i === current ? "true" : "false");
      });
      resetProgress();
    }

    function next() { show(current + 1); }
    function prev() { show(current - 1); }

    function resetProgress() {
      elapsed = 0;
      if (progressBar) progressBar.style.width = "0%";
    }

    function start() {
      stop();
      timerId = setInterval(function () {
        if (!paused) next();
      }, INTERVAL);
      if (progressBar) {
        progressId = setInterval(function () {
          if (paused) return;
          elapsed += TICK;
          progressBar.style.width = Math.min(100, (elapsed / INTERVAL) * 100) + "%";
        }, TICK);
      }
    }

    function stop() {
      if (timerId) { clearInterval(timerId); timerId = null; }
      if (progressId) { clearInterval(progressId); progressId = null; }
    }

    // Dot navigation
    dots.forEach(function (dot, i) {
      dot.addEventListener("click", function () { show(i); start(); });
    });

    // Arrow navigation
    if (prevBtn) prevBtn.addEventListener("click", function () { prev(); start(); });
    if (nextBtn) nextBtn.addEventListener("click", function () { next(); start(); });

    // Keyboard navigation
    carousel.setAttribute("tabindex", "0");
    carousel.addEventListener("keydown", function (e) {
      if (e.key === "ArrowLeft") { prev(); start(); e.preventDefault(); }
      else if (e.key === "ArrowRight") { next(); start(); e.preventDefault(); }
    });

    // Pause on hover/focus
    carousel.addEventListener("mouseenter", function () { paused = true; });
    carousel.addEventListener("mouseleave", function () { paused = false; });
    carousel.addEventListener("focusin", function () { paused = true; });
    carousel.addEventListener("focusout", function () { paused = false; });

    // Pause when tab is hidden
    document.addEventListener("visibilitychange", function () {
      paused = document.hidden;
    });

    // Touch swipe support
    var touchStartX = 0;
    carousel.addEventListener("touchstart", function (e) {
      touchStartX = e.touches[0].clientX;
    }, { passive: true });
    carousel.addEventListener("touchend", function (e) {
      var dx = e.changedTouches[0].clientX - touchStartX;
      if (Math.abs(dx) > 50) { dx < 0 ? next() : prev(); start(); }
    }, { passive: true });

    // Respect reduced motion
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      show(0);
      return;
    }

    show(0);
    start();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
