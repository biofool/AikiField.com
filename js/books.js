// Books page — ported from quantumaikido.com (script.js + books/index.html).
// Review/testimonial quotes are about Richard Moon's "Quantum Aikido" book;
// portraits and PDFs stay on quantumaikido.com (absolute URLs, single source).
(function () {
  "use strict";

  var QA = "https://quantumaikido.com";

  // ---- Testimonial data (from quantumaikido.com script.js) ----
  var reviewers = [
    { name: "William Isaacs", initials: "WI", photo: QA + "/ReviewPortraits/WilliamIsaacs.jpeg", title: "Author of Dialogue and the Art of Thinking Together", link: "https://dialogos.com/", quote: "This is an extraordinary treasure of a book. Very few works even attempt—let alone achieve—what this one does: it gives you the felt experience of sitting with a master, guiding you to discover new realms of understanding and awareness within yourself. In earlier times, one sought such a teacher, hoping to be fortunate enough to learn at their side over years of close apprenticeship. Remarkably, Richard Moon offers that same gift here. Through these pages you are invited into a living dialogue that will touch your life and leave you forever changed." },
    { name: "Douglas Stone", initials: "DS", title: "Harvard Law School, Author of Difficult Conversations", link: null, quote: "Richard is not a wizard. He's a person like you and me. His power to move people beyond themselves is not based on some supernatural enlightenment but resides in his very humanness—his studious intelligence, his compassion, his insight." },
    { name: "Richard Strozzi-Heckler", initials: "RS", photo: QA + "/ReviewPortraits/RichardStrozziHeckler.jpg", title: "7th Degree Black Belt, Creator of Strozzi Somatics", link: "https://strozziinstitute.com/", quote: "If you are interested in a transformative path involving a deep connection with self and others, an embodied spiritual practice, and unifying with a universal energy, I highly recommend Quantum Aikido." },
    { name: "Peter Ralston", initials: "PR", photo: QA + "/ReviewPortraits/PeterRalston.jpeg", title: "World Champion Martial Artist, Founder of Cheng Hsin", link: "https://www.chenghsin.com/", quote: "Richard is a committed teacher and investigator, daring to push the envelope attempting to discover deeper truths. The cutting edge of quantum physics and its role in our lives is a new and interesting frontier." },
    { name: "Hiroshi Ikeda", initials: "HI", photo: QA + "/ReviewPortraits/HiroshiIkeda.webp", photoPosition: "85% 15%", title: "Aikido Shihan", link: "https://www.hiroshi-ikeda.com/", quote: "Richard Moon Sensei is a leader who has contributed greatly to the world of Aikido for many years. I believe this book will open a new door for those practicing Aikido in the future." },
    { name: "Bob Noha", initials: "BN", title: "Aikido 7th Dan, Chief Instructor Aikido of Petaluma", link: null, quote: "In language that is both lyrical and clear, Richard shows us the underlying unity of creation through the perspectives of quantum physics, music and Aikido." },
    { name: "Elisabet Lahti, PhD", initials: "EL", photo: QA + "/ReviewPortraits/ElisabetLathi.avif", title: "Author of Gentle Power", link: "https://www.sisulab.com/", quote: "In an age where we are drowning in information on how to be happy and live healthier—Richard Moon's experience-based wisdom offers a missing link." },
    { name: "Christopher Thorsen", initials: "CT", title: "Radical Inquiry", link: null, quote: "In Quantum Aikido, Sensei Moon has captured light in a bottle! Simplicity itself, when facing challenges, Feel More." },
    { name: "Joel & Michelle Levey", initials: "JL", title: "Co-founders, Wisdom at Work", link: null, quote: "Richard's inspiring somatic, energetic, and spiritual teachings link our hearts, minds, and bodies to the lineage of direct transmission of the transformational art of Aikido." },
    { name: "Robert Lengel", initials: "RL", title: "Author & Consultant", link: null, quote: "Quantum Aikido is a brilliant overview of the power of blending the art of attention with the science of action." }
  ];

  var readers = [
    { name: "Gary David, Ph.D.", initials: "GD", title: "Professor Emeritus", quote: "I've known Richard Moon for over 40 years. His way of guiding sneaks up on you with the subtlety of breeze. 'Quantum Aikido' offers a poetic synthesis of his life's work." },
    { name: "Student of Bob Noha Sensei", initials: "SN", title: "Aikido of Petaluma", quote: "The lyricism of Moon Sensei's writing as he unifies complex ideas between the quantum realm and the dojo transforms this manuscript into an Experience I will be revisiting for years." },
    { name: "Amazon Reader", initials: "AR", title: "Verified Purchase", quote: "A profound exploration of consciousness and martial arts. Richard Moon bridges Eastern wisdom and Western science in a way that feels both ancient and cutting-edge." },
    { name: "Barnes & Noble Reader", initials: "BR", title: "Book Club Selection", quote: "Our group discussed this for three meetings. Every chapter opens new doors. The concept of 1+1=1 changed how I approach conflict." },
    { name: "Yoga Practitioner", initials: "YP", title: "40 Years Practice", quote: "Finally, someone who understands that the body knows before the mind. This book is a manual for embodied awareness." },
    { name: "Meditation Teacher", initials: "MT", title: "Insight Meditation", quote: "Richard articulates what I've sensed but couldn't express. The space between stimulus and response is where transformation lives." }
  ];

  // ---- Quote carousel (port of QA bindQuoteCarousel) ----
  function fillQuoteSlot(item, ids) {
    var quoteEl = document.getElementById(ids.quote);
    var nameEl = document.getElementById(ids.name);
    var titleEl = document.getElementById(ids.title);
    var avatarEl = document.getElementById(ids.avatar);
    if (quoteEl) quoteEl.textContent = '"' + item.quote + '"';
    if (nameEl) {
      nameEl.textContent = '';
      if (item.link) {
        var a = document.createElement('a');
        a.href = item.link;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = item.name;
        nameEl.appendChild(a);
      } else {
        nameEl.textContent = item.name;
      }
    }
    if (titleEl) titleEl.textContent = item.title || '';
    if (avatarEl) {
      while (avatarEl.firstChild) avatarEl.removeChild(avatarEl.firstChild);
      avatarEl.textContent = '';
      if (item.photo) {
        var img = document.createElement('img');
        img.src = item.photo;
        img.alt = item.name;
        img.className = 'testimonial-avatar-photo';
        img.style.objectPosition = item.photoPosition || 'center';
        avatarEl.appendChild(img);
      } else {
        avatarEl.textContent = item.initials || item.name.split(' ').map(function (n) { return n[0]; }).join('').substring(0, 2);
      }
    }
  }

  function bindQuoteCarousel(config) {
    var wrap = document.getElementById(config.wrapId);
    if (!wrap || !config.data || !config.data.length) return;
    var index = 0;
    var timer = null;
    var data = config.data;

    function show(i) {
      if (i < 0) i = data.length - 1;
      if (i >= data.length) i = 0;
      index = i;
      fillQuoteSlot(data[i], config.ids);
      var dots = document.getElementById(config.ids.dots);
      if (dots) {
        dots.querySelectorAll('.testimonial-dot').forEach(function (dot, di) {
          dot.classList.toggle('active', di === i);
        });
      }
    }

    function buildDots() {
      var dots = document.getElementById(config.ids.dots);
      if (!dots) return;
      dots.innerHTML = '';
      data.forEach(function (_, i) {
        var dot = document.createElement('button');
        dot.type = 'button';
        dot.className = 'testimonial-dot' + (i === 0 ? ' active' : '');
        dot.setAttribute('aria-label', 'Show quote ' + (i + 1));
        dot.addEventListener('click', function () { show(i); restart(); });
        dots.appendChild(dot);
      });
    }

    function restart() {
      if (timer) clearInterval(timer);
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      timer = setInterval(function () { show(index + 1); }, config.interval || 7000);
    }

    wrap.querySelectorAll('[data-dir]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        show(index + Number(btn.getAttribute('data-dir')));
        restart();
      });
    });

    var touchStartX = 0;
    wrap.addEventListener('touchstart', function (e) {
      touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });
    wrap.addEventListener('touchend', function (e) {
      var diff = touchStartX - e.changedTouches[0].screenX;
      if (Math.abs(diff) > 50) { show(index + (diff > 0 ? 1 : -1)); restart(); }
    }, { passive: true });

    wrap.addEventListener('mouseenter', function () { if (timer) clearInterval(timer); });
    wrap.addEventListener('mouseleave', restart);

    buildDots();
    show(0);
    restart();
  }

  // ---- Book discovery controls (port of QA books/index.html inline JS) ----
  // Search terms are space-separated and AND-combined. books-search.json is
  // lazily fetched on first search input; card hrefs point at
  // quantumaikido.com so keys are normalised back to the bare filename.
  function initBookControls() {
    var controls = document.querySelector('.af-books .book-controls');
    var filters = document.querySelector('.af-books .book-filters');
    var searchWrap = document.querySelector('.af-books .book-search');
    var searchBox = document.getElementById('book-search');
    var count = document.getElementById('book-results-count');
    var clearBtn = document.querySelector('.af-books .book-clear');
    if (!controls || !filters || !searchWrap || !searchBox) return;
    var chips = filters.querySelectorAll('.book-chip');
    var items = document.querySelectorAll('#book-list .book-item');
    var sections = document.querySelectorAll('#book-list .book-section');
    var activeFilter = 'all';
    var index = null;
    var indexPending = false;

    controls.hidden = false;
    filters.hidden = false;
    searchWrap.hidden = false;
    count.hidden = false;

    var hdr = document.querySelector('header.af-header');
    function syncNavTop() {
      if (hdr) controls.style.top = hdr.offsetHeight + 'px';
    }
    syncNavTop();
    window.addEventListener('resize', syncNavTop);

    for (var c = 0; c < chips.length; c++) {
      var f = chips[c].dataset.filter;
      var n = 0;
      for (var m = 0; m < items.length; m++) {
        var mc = (items[m].dataset.cats || '').split(' ');
        if (f === 'all' || mc.indexOf(f) !== -1) n++;
      }
      var badge = document.createElement('span');
      badge.className = 'book-chip-count';
      badge.textContent = n;
      chips[c].appendChild(badge);
    }

    function loadIndex() {
      if (index || indexPending) return;
      indexPending = true;
      fetch('/data/books-search.json')
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (doc) {
          index = {};
          var books = (doc && doc.books) || {};
          for (var href in books) index[href] = books[href];
          apply();
        })
        .catch(function () { index = {}; })
        .finally(function () { indexPending = false; });
    }

    function itemHref(item) {
      var a = item.querySelector('a[href]');
      var href = a ? a.getAttribute('href') : '';
      return href.replace(/^https:\/\/quantumaikido\.com\/books\//, '');
    }

    function matchesQuery(item, terms) {
      if (!terms.length) return true;
      var text = item.textContent.toLowerCase();
      if (!index) {
        for (var i = 0; i < terms.length; i++) {
          if (text.indexOf(terms[i]) === -1) return false;
        }
        return true;
      }
      var bookTerms = index[itemHref(item)] || [];
      var haystack = ' ' + text + ' ';
      for (var j = 0; j < terms.length; j++) {
        var t = terms[j];
        var hit = haystack.indexOf(' ' + t) !== -1;
        if (!hit) {
          for (var k = 0; k < bookTerms.length; k++) {
            if (bookTerms[k].indexOf(t) === 0) { hit = true; break; }
          }
        }
        if (!hit) return false;
      }
      return true;
    }

    function apply() {
      var query = searchBox.value.trim().toLowerCase();
      var terms = query ? query.split(/\s+/) : [];
      var shown = 0;
      for (var j = 0; j < items.length; j++) {
        var cats = (items[j].dataset.cats || '').split(' ');
        var chipOk = activeFilter === 'all' || cats.indexOf(activeFilter) !== -1;
        items[j].hidden = !(chipOk && matchesQuery(items[j], terms));
        if (!items[j].hidden) shown++;
      }
      for (var k = 0; k < sections.length; k++) {
        sections[k].hidden = !sections[k].querySelector('.book-item:not([hidden])');
      }
      count.textContent = (shown === items.length && !query && activeFilter === 'all')
        ? ''
        : 'Showing ' + shown + ' of ' + items.length + ' books';
      if (clearBtn) clearBtn.hidden = !(query || activeFilter !== 'all');
    }

    function setActive(f) {
      activeFilter = f;
      for (var i = 0; i < chips.length; i++) {
        chips[i].setAttribute('aria-pressed', chips[i].dataset.filter === f ? 'true' : 'false');
      }
    }

    filters.addEventListener('click', function (e) {
      var chip = e.target.closest && e.target.closest('.book-chip');
      if (!chip) return;
      setActive(chip.dataset.filter);
      apply();
    });

    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        searchBox.value = '';
        setActive('all');
        apply();
      });
    }

    searchBox.addEventListener('focus', loadIndex);
    searchBox.addEventListener('input', function () { loadIndex(); apply(); });
  }

  document.addEventListener('DOMContentLoaded', function () {
    initBookControls();
    try {
      bindQuoteCarousel({
        wrapId: 'booksReviewersCarousel',
        data: reviewers,
        interval: 8500,
        ids: { quote: 'reviewerQuote', name: 'reviewerName', title: 'reviewerTitle', avatar: 'reviewerAvatar', dots: 'reviewerDots' }
      });
    } catch (err) {
      if (window.console && console.error) console.error('booksReviewersCarousel failed:', err);
    }
    try {
      bindQuoteCarousel({
        wrapId: 'booksReadersCarousel',
        data: readers,
        interval: 7000,
        ids: { quote: 'readerQuote', name: 'readerName', title: 'readerTitle', avatar: 'readerAvatar', dots: 'readerDots' }
      });
    } catch (err) {
      if (window.console && console.error) console.error('booksReadersCarousel failed:', err);
    }
  });
})();
