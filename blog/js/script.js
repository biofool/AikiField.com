// Unified testimonials system
let currentMode = 'reviewers';
let currentIndex = 0;
let autoScrollInterval = null;

function i18nText(key, fallback) {
    if (window.QALocale && typeof QALocale.t === 'function' && key) {
        const translated = QALocale.t(key);
        if (translated && translated !== key) return translated;
    }
    return fallback;
}

const quoteCarouselRefreshers = [];

// Reviewers data
const reviewers = [
    {
        name: "William Isaacs",
        initials: "WI",
        photo: "ReviewPortraits/WilliamIsaacs.jpeg",
        title: "Author of Dialogue and the Art of Thinking Together",
        titleKey: "reviewer.william_isaacs.title",
        quoteKey: "reviewer.william_isaacs.quote",
        link: "https://dialogos.com/",
        quote: "This is an extraordinary treasure of a book. Very few works even attempt—let alone achieve—what this one does: it gives you the felt experience of sitting with a master, guiding you to discover new realms of understanding and awareness within yourself. In earlier times, one sought such a teacher, hoping to be fortunate enough to learn at their side over years of close apprenticeship. Remarkably, Richard Moon offers that same gift here. Through these pages you are invited into a living dialogue that will touch your life and leave you forever changed."
    },
    {
        name: "Douglas Stone",
        initials: "DS",
        title: "Harvard Law School, Author of Difficult Conversations",
        titleKey: "reviewer.douglas_stone.title",
        quoteKey: "reviewer.douglas_stone.quote",
        link: null,
        quote: "Richard is not a wizard. He's a person like you and me. His power to move people beyond themselves is not based on some supernatural enlightenment but resides in his very humanness—his studious intelligence, his compassion, his insight."
    },
    {
        name: "Richard Strozzi-Heckler",
        initials: "RS",
        photo: "ReviewPortraits/RichardStrozziHeckler.jpg",
        title: "7th Degree Black Belt, Creator of Strozzi Somatics",
        titleKey: "reviewer.richard_strozzi_heckler.title",
        quoteKey: "reviewer.richard_strozzi_heckler.quote",
        link: "https://strozziinstitute.com/",
        quote: "If you are interested in a transformative path involving a deep connection with self and others, an embodied spiritual practice, and unifying with a universal energy, I highly recommend Quantum Aikido."
    },
    {
        name: "Peter Ralston",
        initials: "PR",
        photo: "ReviewPortraits/PeterRalston.jpeg",
        title: "World Champion Martial Artist, Founder of Cheng Hsin",
        titleKey: "reviewer.peter_ralston.title",
        quoteKey: "reviewer.peter_ralston.quote",
        link: "https://www.chenghsin.com/",
        quote: "Richard is a committed teacher and investigator, daring to push the envelope attempting to discover deeper truths. The cutting edge of quantum physics and its role in our lives is a new and interesting frontier."
    },
    {
        name: "Hiroshi Ikeda",
        initials: "HI",
        photo: "ReviewPortraits/HiroshiIkeda.webp",
        photoPosition: "85% 15%",
        title: "Aikido Shihan",
        titleKey: "reviewer.hiroshi_ikeda.title",
        quoteKey: "reviewer.hiroshi_ikeda.quote",
        link: "https://www.hiroshi-ikeda.com/",
        quote: "Richard Moon Sensei is a leader who has contributed greatly to the world of Aikido for many years. I believe this book will open a new door for those practicing Aikido in the future."
    },
    {
        name: "Bob Noha",
        initials: "BN",
        title: "Aikido 7th Dan, Chief Instructor Aikido of Petaluma",
        titleKey: "reviewer.bob_noha.title",
        quoteKey: "reviewer.bob_noha.quote",
        link: null,
        quote: "In language that is both lyrical and clear, Richard shows us the underlying unity of creation through the perspectives of quantum physics, music and Aikido."
    },
    {
        name: "Elisabet Lahti, PhD",
        initials: "EL",
        photo: "ReviewPortraits/ElisabetLathi.avif",
        title: "Author of Gentle Power",
        titleKey: "reviewer.elisabet_lahti.title",
        quoteKey: "reviewer.elisabet_lahti.quote",
        link: "https://www.sisulab.com/",
        quote: "In an age where we are drowning in information on how to be happy and live healthier—Richard Moon's experience-based wisdom offers a missing link."
    },
    {
        name: "Christopher Thorsen",
        initials: "CT",
        title: "Radical Inquiry",
        titleKey: "reviewer.christopher_thorsen.title",
        quoteKey: "reviewer.christopher_thorsen.quote",
        link: null,
        quote: "In Quantum Aikido, Sensei Moon has captured light in a bottle! Simplicity itself, when facing challenges, Feel More."
    },
    {
        name: "Joel & Michelle Levey",
        initials: "JL",
        title: "Co-founders, Wisdom at Work",
        titleKey: "reviewer.joel_michelle_levey.title",
        quoteKey: "reviewer.joel_michelle_levey.quote",
        link: null,
        quote: "Richard's inspiring somatic, energetic, and spiritual teachings link our hearts, minds, and bodies to the lineage of direct transmission of the transformational art of Aikido."
    },
    {
        name: "Robert Lengel",
        initials: "RL",
        title: "Author & Consultant",
        titleKey: "reviewer.robert_lengel.title",
        quoteKey: "reviewer.robert_lengel.quote",
        link: null,
        quote: "Quantum Aikido is a brilliant overview of the power of blending the art of attention with the science of action."
    }
];

let currentReviewer = 0;

// Build the reviewer list
function buildReviewerList() {
    const listEl = document.getElementById('reviewersList');
    if (!listEl) return;
    listEl.innerHTML = '';
    reviewers.forEach((r, index) => {
        const item = document.createElement('div');
        item.className = 'viewfinder-item' + (index === 0 ? ' active' : '');
        item.onclick = () => showReviewer(index);
        item.innerHTML = `
            <h4>${r.name}</h4>
            <p class="item-title">${i18nText(r.titleKey, r.title)}</p>
        `;
        listEl.appendChild(item);
    });
}

function showReviewer(index) {
    currentReviewer = index;
    const r = reviewers[index];
    if (!r) return;

    const quoteEl = document.getElementById('reviewerQuote');
    if (quoteEl) quoteEl.textContent = '"' + i18nText(r.quoteKey, r.quote) + '"';
    const avatarEl = document.getElementById('reviewerAvatar');
    if (avatarEl) {
        if (r.photo) {
            clearChildren(avatarEl);
            avatarEl.textContent = '';
            avatarEl.style.backgroundImage = 'url(' + r.photo + ')';
            avatarEl.style.backgroundSize = 'cover';
            avatarEl.style.backgroundPosition = r.photoPosition || 'center';
        } else {
            avatarEl.style.backgroundImage = '';
            clearChildren(avatarEl);
            avatarEl.textContent = r.initials;
        }
    }
    const titleEl = document.getElementById('reviewerTitle');
    if (titleEl) titleEl.textContent = i18nText(r.titleKey, r.title || '');

    const nameEl = document.getElementById('reviewerName');
    if (nameEl) {
        if (r.link) {
            nameEl.innerHTML = '<a href="' + r.link + '" target="_blank" rel="noopener noreferrer">' + r.name + '</a>';
        } else {
            nameEl.textContent = r.name;
        }
    }

    // Update active state
    const items = document.querySelectorAll('#reviewersList .viewfinder-item');
    items.forEach((item, i) => {
        item.classList.toggle('active', i === index);
    });
}

function navigateReviewer(direction) {
    let newIndex = currentReviewer + direction;
    if (newIndex < 0) newIndex = reviewers.length - 1;
    if (newIndex >= reviewers.length) newIndex = 0;
    showReviewer(newIndex);
}

// Coaching quotes data
const coachingQuotes = [
    {
        quote: "You can't get there from not here.",
        context: "On presence and being grounded in the moment"
    },
    {
        quote: "The enemy of truth is not lies; it is convictions.",
        context: "On remaining open to inquiry and learning"
    },
    {
        quote: "Listen to the whisperings of the universal intelligence.",
        context: "On accessing deeper wisdom and guidance"
    },
    {
        quote: "The space between stimulus and response is where infinite possibility lives.",
        context: "On the Quantum Pause"
    },
    {
        quote: "Conflict is energy. When you stop trying to defeat it and start trying to transform it, everything changes.",
        context: "On energy transformation"
    },
    {
        quote: "Standing on the floating bridge of heaven means holding both sides of any duality until they complete each other. That's where 1+1=1.",
        context: "On the unified field experience"
    },
    {
        quote: "Your state of being creates your reality. Change your state, change your world.",
        context: "On the Observer Effect"
    },
    {
        quote: "Feel where you are—mentally, emotionally, spiritually. Presence begins with feeling.",
        context: "On somatic awareness and grounding"
    },
    {
        quote: "The sword that cuts things together is sharper than the sword that cuts things apart.",
        context: "On the power of harmony (O Sensei's vision)"
    },
    {
        quote: "Fixed in our opinions, our learning stops. Inquiry positions us to learn together creatively.",
        context: "On maintaining wonder and adaptability"
    }
];

// Render coaching quotes
function renderCoachingQuotes() {
    const coachingCarouselEl = document.getElementById('coachingCarousel');
    if (!coachingCarouselEl) return;
    coachingQuotes.forEach(q => {
        const item = document.createElement('div');
        item.className = 'carousel-item';
        item.innerHTML = `
            <p style="font-style: italic; margin-bottom: 0.5rem;">"${q.quote}"</p>
            <p style="font-size: 0.65rem; color: var(--accent-light);">— ${q.context}</p>
        `;
        coachingCarouselEl.appendChild(item);
    });
}

function scrollCoachings(direction) {
    const carousel = document.getElementById('coachingCarousel');
    if (!carousel) return;
    const scrollAmount = 290;
    carousel.scrollBy({ left: direction * scrollAmount, behavior: 'smooth' });
}

// Auto-scroll coachings
let coachingAutoScroll;
function startCoachingAutoScroll() {
    coachingAutoScroll = setInterval(() => {
        const carousel = document.getElementById('coachingCarousel');
        if (!carousel) return;
        const maxScroll = carousel.scrollWidth - carousel.clientWidth;
        if (carousel.scrollLeft >= maxScroll - 10) {
            carousel.scrollTo({ left: 0, behavior: 'smooth' });
        } else {
            carousel.scrollBy({ left: 290, behavior: 'smooth' });
        }
    }, 4000);
}

// Random heading options
const headingOptions = [
    "What the Masters Wanted to Share",
    "What the Masters Wanted You to Know",
    "What Masters of the Practice Wanted to Share",
    "What the Masters Recognized",
    "What Masters Wanted to Pass Forward"
];

// Initialize everything when DOM is ready
// Readers testimonials data
const readers = [
    { name: "Gary David, Ph.D.", nameKey: "reader.gary_david.name", title: "Professor Emeritus", titleKey: "reader.gary_david.title", quoteKey: "reader.gary_david.quote", quote: "I've known Richard Moon for over 40 years. His way of guiding sneaks up on you with the subtlety of breeze. 'Quantum Aikido' offers a poetic synthesis of his life's work." },
    { name: "Student of Bob Noha Sensei", nameKey: "reader.bob_noha_student.name", title: "Aikido of Petaluma", titleKey: "reader.bob_noha_student.title", quoteKey: "reader.bob_noha_student.quote", quote: "The lyricism of Moon Sensei's writing as he unifies complex ideas between the quantum realm and the dojo transforms this manuscript into an Experience I will be revisiting for years." },
    { name: "Amazon Reader", nameKey: "reader.amazon_reader.name", title: "Verified Purchase", titleKey: "reader.amazon_reader.title", quoteKey: "reader.amazon_reader.quote", quote: "A profound exploration of consciousness and martial arts. Richard Moon bridges Eastern wisdom and Western science in a way that feels both ancient and cutting-edge." },
    { name: "Barnes & Noble Reader", nameKey: "reader.barnes_noble_reader.name", title: "Book Club Selection", titleKey: "reader.barnes_noble_reader.title", quoteKey: "reader.barnes_noble_reader.quote", quote: "Our group discussed this for three meetings. Every chapter opens new doors. The concept of 1+1=1 changed how I approach conflict." },
    { name: "Yoga Practitioner", nameKey: "reader.yoga_practitioner.name", title: "40 Years Practice", titleKey: "reader.yoga_practitioner.title", quoteKey: "reader.yoga_practitioner.quote", quote: "Finally, someone who understands that the body knows before the mind. This book is a manual for embodied awareness." },
    { name: "Meditation Teacher", nameKey: "reader.meditation_teacher.name", title: "Insight Meditation", titleKey: "reader.meditation_teacher.title", quoteKey: "reader.meditation_teacher.quote", quote: "Richard articulates what I've sensed but couldn't express. The space between stimulus and response is where transformation lives." }
];

// Unified testimonials functions
function getCurrentData() {
    return currentMode === 'reviewers' ? reviewers : readers;
}

function switchTestimonials(mode) {
    currentMode = mode;
    currentIndex = 0;

    const btnReviewers = document.getElementById('btnReviewers');
    const btnReaders = document.getElementById('btnReaders');
    if (btnReviewers) btnReviewers.classList.toggle('active', mode === 'reviewers');
    if (btnReaders) btnReaders.classList.toggle('active', mode === 'readers');

    buildTestimonialDots();
    showTestimonial(0);
    startTestimonialAutoScroll();
}

function clearChildren(el) {
    if (!el) return;
    while (el.firstChild) el.removeChild(el.firstChild);
}

function buildTestimonialDots() {
    const dotsContainer = document.getElementById('testimonialDots');
    if (!dotsContainer) return;

    const data = getCurrentData();
    dotsContainer.innerHTML = '';
    data.forEach((_, i) => {
        const dot = document.createElement('span');
        dot.className = 'testimonial-dot' + (i === 0 ? ' active' : '');
        dot.onclick = () => showTestimonial(i);
        dotsContainer.appendChild(dot);
    });
}

function showTestimonial(index) {
    const data = getCurrentData();
    if (data.length === 0) return;

    // Handle wrap-around
    if (index < 0) index = data.length - 1;
    if (index >= data.length) index = 0;
    currentIndex = index;

    const item = data[index];

    // Update display
    const quoteEl = document.getElementById('testimonialQuote');
    const nameEl = document.getElementById('testimonialName');
    const titleEl = document.getElementById('testimonialTitle');
    const avatarEl = document.getElementById('testimonialAvatar');

    if (quoteEl) quoteEl.textContent = '"' + i18nText(item.quoteKey, item.quote) + '"';
    if (nameEl) nameEl.textContent = i18nText(item.nameKey, item.name);
    if (titleEl) titleEl.textContent = i18nText(item.titleKey, item.title || '');

    if (avatarEl) {
        if (item.photo) {
            avatarEl.style.backgroundImage = `url(${item.photo})`;
            avatarEl.style.backgroundPosition = item.photoPosition || 'center';
            avatarEl.textContent = '';
        } else {
            avatarEl.style.backgroundImage = '';
            avatarEl.textContent = item.initials || item.name.split(' ').map(n => n[0]).join('').substring(0, 2);
        }
    }

    // Update dots
    document.querySelectorAll('.testimonial-dot').forEach((dot, i) => {
        dot.classList.toggle('active', i === index);
    });
}

function navigateTestimonial(direction) {
    showTestimonial(currentIndex + direction);
    startTestimonialAutoScroll(); // Reset auto-scroll timer
}

function startTestimonialAutoScroll() {
    if (autoScrollInterval) clearInterval(autoScrollInterval);
    autoScrollInterval = setInterval(() => {
        showTestimonial(currentIndex + 1);
    }, 6000);
}

function initTestimonials() {
    if (!document.getElementById('testimonialQuote')) return;
    buildTestimonialDots();
    showTestimonial(0);
    startTestimonialAutoScroll();

    const carousel = document.querySelector('.testimonials-carousel');
    if (carousel) {
        // Pause on hover
        carousel.addEventListener('mouseenter', () => clearInterval(autoScrollInterval));
        carousel.addEventListener('mouseleave', startTestimonialAutoScroll);

        // Swipe support for mobile
        let touchStartX = 0;
        let touchEndX = 0;
        carousel.addEventListener('touchstart', (e) => {
            touchStartX = e.changedTouches[0].screenX;
        }, { passive: true });
        carousel.addEventListener('touchend', (e) => {
            touchEndX = e.changedTouches[0].screenX;
            const diff = touchStartX - touchEndX;
            if (Math.abs(diff) > 50) {
                navigateTestimonial(diff > 0 ? 1 : -1);
            }
        }, { passive: true });
    }
}

function fillQuoteSlot(item, ids) {
    const quoteEl = document.getElementById(ids.quote);
    const nameEl = document.getElementById(ids.name);
    const titleEl = document.getElementById(ids.title);
    const avatarEl = document.getElementById(ids.avatar);
    if (quoteEl) quoteEl.textContent = '"' + i18nText(item.quoteKey, item.quote) + '"';
    if (nameEl) nameEl.textContent = i18nText(item.nameKey, item.name);
    if (titleEl) titleEl.textContent = i18nText(item.titleKey, item.title || '');
    if (avatarEl) {
        clearChildren(avatarEl);
        avatarEl.style.backgroundImage = '';
        avatarEl.textContent = '';
        if (item.photo) {
            const img = document.createElement('img');
            img.src = item.photo;
            img.alt = item.name;
            img.className = 'testimonial-avatar-photo';
            img.style.objectPosition = item.photoPosition || 'center';
            avatarEl.appendChild(img);
        } else {
            const initials = item.initials || item.name.split(' ').map(function (n) { return n[0]; }).join('').substring(0, 2);
            avatarEl.textContent = initials;
        }
    }
    markQuoteOverflow(quoteEl);
}

function markQuoteOverflow(quoteEl) {
    if (!quoteEl) return;
    const card = quoteEl.closest('.testimonials-display');
    if (!card) return;
    card.classList.remove('is-overflowing');
    card.removeAttribute('tabindex');
    requestAnimationFrame(function () {
        if (quoteEl.scrollHeight > quoteEl.clientHeight + 1) {
            card.classList.add('is-overflowing');
            card.tabIndex = 0;
        }
    });
}

function bindQuoteCarousel(config) {
    const wrap = document.getElementById(config.wrapId);
    if (!wrap || !config.data || !config.data.length) return;
    let index = 0;
    let timer = null;
    const data = config.data;

    function show(i) {
        if (i < 0) i = data.length - 1;
        if (i >= data.length) i = 0;
        index = i;
        fillQuoteSlot(data[i], config.ids);
        const dots = document.getElementById(config.ids.dots);
        if (dots) {
            dots.querySelectorAll('.testimonial-dot').forEach(function (dot, di) {
                dot.classList.toggle('active', di === i);
            });
        }
    }

    function buildDots() {
        const dots = document.getElementById(config.ids.dots);
        if (!dots) return;
        dots.innerHTML = '';
        data.forEach(function (_, i) {
            const dot = document.createElement('button');
            dot.type = 'button';
            dot.className = 'testimonial-dot' + (i === 0 ? ' active' : '');
            dot.setAttribute('aria-label', 'Show quote ' + (i + 1));
            dot.addEventListener('click', function () {
                show(i);
                restart();
            });
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

    let touchStartX = 0;
    wrap.addEventListener('touchstart', function (e) {
        touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });
    wrap.addEventListener('touchend', function (e) {
        const diff = touchStartX - e.changedTouches[0].screenX;
        if (Math.abs(diff) > 50) {
            show(index + (diff > 0 ? 1 : -1));
            restart();
        }
    }, { passive: true });

    wrap.addEventListener('mouseenter', function () { if (timer) clearInterval(timer); });
    wrap.addEventListener('mouseleave', restart);

    buildDots();
    show(0);
    restart();
    quoteCarouselRefreshers.push(function () { show(index); });
}

function fillHeroReviewerPhotos() {
    const host = document.getElementById('heroReviewerPhotos');
    if (!host || typeof reviewers === 'undefined') return;
    clearChildren(host);
    reviewers.filter(function (r) { return r.photo; }).forEach(function (r) {
        const fig = document.createElement('figure');
        fig.className = 'hero-reviewer-photo';
        const img = document.createElement('img');
        img.src = r.photo;
        img.alt = r.name;
        img.style.objectPosition = r.photoPosition || 'center';
        const cap = document.createElement('figcaption');
        const name = document.createElement('span');
        name.textContent = r.name;
        cap.appendChild(name);
        fig.appendChild(img);
        fig.appendChild(cap);
        host.appendChild(fig);
    });
}

function initHomeWisdomCarousels() {
    if (!document.getElementById('homeWisdomPair')) return;
    // Bind quotes first so a hero-photo failure cannot leave both boxes empty.
    try {
        bindQuoteCarousel({
            wrapId: 'homeReadersCarousel',
            data: readers,
            interval: 7000,
            ids: {
                quote: 'homeReaderQuote',
                name: 'homeReaderName',
                title: 'homeReaderTitle',
                avatar: 'homeReaderAvatar',
                dots: 'homeReaderDots'
            }
        });
    } catch (err) {
        if (typeof console !== 'undefined' && console.error) {
            console.error('homeReadersCarousel failed:', err);
        }
    }
    try {
        bindQuoteCarousel({
            wrapId: 'homeReviewersCarousel',
            data: reviewers,
            interval: 8500,
            ids: {
                quote: 'homeReviewerQuote',
                name: 'homeReviewerName',
                title: 'homeReviewerTitle',
                avatar: 'homeReviewerAvatar',
                dots: 'homeReviewerDots'
            }
        });
    } catch (err) {
        if (typeof console !== 'undefined' && console.error) {
            console.error('homeReviewersCarousel failed:', err);
        }
    }
    try {
        fillHeroReviewerPhotos();
    } catch (err) {
        if (typeof console !== 'undefined' && console.error) {
            console.error('fillHeroReviewerPhotos failed:', err);
        }
    }

    function recheckOverflow() {
        markQuoteOverflow(document.getElementById('homeReaderQuote'));
        markQuoteOverflow(document.getElementById('homeReviewerQuote'));
    }
    window.addEventListener('resize', recheckOverflow);
    if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(recheckOverflow).catch(function () {});
    }
}

function runCarouselInit(name, fn) {
    try {
        fn();
    } catch (err) {
        if (typeof console !== 'undefined' && console.error) {
            console.error(name + ' failed:', err);
        }
    }
}

function initPageCarousels() {
    runCarouselInit('initTestimonials', initTestimonials);
    runCarouselInit('initHomeWisdomCarousels', initHomeWisdomCarousels);

    // Legacy: Initialize old reviewers if present (for backwards compatibility)
    runCarouselInit('initLegacyReviewers', function () {
        const headingEl = document.getElementById('reviewersHeading');
        if (headingEl) {
            headingEl.textContent = headingOptions[Math.floor(Math.random() * headingOptions.length)];
        }
        buildReviewerList();
        if (document.getElementById('reviewersList')) {
            showReviewer(0);
        }
    });

    runCarouselInit('renderCoachingQuotes', renderCoachingQuotes);

    const coachingCarousel = document.getElementById('coachingCarousel');
    if (coachingCarousel) {
        coachingCarousel.addEventListener('mouseenter', () => clearInterval(coachingAutoScroll));
        coachingCarousel.addEventListener('mouseleave', startCoachingAutoScroll);
        startCoachingAutoScroll();
    }

    window.addEventListener('qa:localechange', function () {
        quoteCarouselRefreshers.forEach(function (fn) {
            try { fn(); } catch (err) {
                if (typeof console !== 'undefined' && console.error) console.error('quote carousel refresh failed:', err);
            }
        });
        if (document.getElementById('testimonialQuote')) showTestimonial(currentIndex);
        if (document.getElementById('reviewersList')) {
            buildReviewerList();
            showReviewer(currentReviewer);
        }
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPageCarousels);
} else {
    initPageCarousels();
}

// ── Hero chat caption: info button toggles popover ──────────────────────────
(function initHeroChatPopover() {
    const btn = document.querySelector('.hero-chat-info-btn');
    const popover = document.getElementById('hero-chat-info');
    if (!btn || !popover) return;

    function toggle(forceOpen) {
        const nextOpen = forceOpen !== undefined ? forceOpen : !popover.classList.contains('is-open');
        popover.classList.toggle('is-open', nextOpen);
        btn.setAttribute('aria-expanded', nextOpen ? 'true' : 'false');
    }

    btn.addEventListener('click', function(e) {
        e.stopPropagation();
        toggle();
    });

    // Close on outside click
    document.addEventListener('click', function(e) {
        if (!popover.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
            toggle(false);
        }
    });

    // Close on Escape
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') toggle(false);
    });
})();
