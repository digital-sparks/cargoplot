// import { gsap } from 'gsap';
// import { ScrollTrigger } from 'gsap/ScrollTrigger';
// import { SplitText } from 'gsap/SplitText';

window.Webflow ||= [];
window.Webflow.push(() => {
  //   gsap.registerPlugin(SplitText);

  // Platform component animation - only on desktop
  gsap.matchMedia().add('(min-width: 911px)', () => {
    const platformComponent = document.querySelector('.platform_component');

    if (platformComponent) {
      // ========== CONFIGURATION VARIABLES ==========
      const CONFIG = {
        // Timing
        ITEM_DURATION: 8000, // How long each item stays active (ms)
        DROPDOWN_DURATION: 0.3, // Dropdown open/close animation duration (s)
        IMAGE_FADE_DURATION: 0.4, // Image cross-fade duration (s)
        PROGRESS_EASE: 'none', // Progress line easing
        ANIMATION_EASE: 'power2.inOut', // General animation easing

        // User interaction
        CLICK_RESUME_DELAY: 1000, // Delay before resuming after click (ms)
        HOVER_RESUME_DELAY: 100, // Delay before resuming after hover (ms)

        // ScrollTrigger
        SCROLL_START: 'top 80%', // When animation starts on scroll
      };

      // ========== ELEMENT REFERENCES ==========
      const items = Array.from(
        platformComponent.querySelectorAll('[data-element="platform-item"]')
      );
      const progressLines = Array.from(
        platformComponent.querySelectorAll('[data-element="platform-progress-line"]')
      );
      const dropdowns = Array.from(
        platformComponent.querySelectorAll('[data-element="platform-dropdown"]')
      );
      const images = Array.from(
        platformComponent
          .querySelector('.platform_col-images')
          .querySelectorAll('[data-element="platform-image"]')
      );

      // ========== STATE MANAGEMENT ==========
      let state = {
        currentIndex: 0,
        isAutoPlaying: false,
        isUserInteracting: false,
        isAnimating: false,
        pausedTime: 0,
        startTime: null,
      };

      let timers = {
        autoPlay: null,
        progress: null,
        resume: null,
      };

      // ========== UTILITY FUNCTIONS ==========
      const clearAllTimers = () => {
        Object.values(timers).forEach((timer) => {
          if (timer) clearTimeout(timer);
        });
        if (timers.progress) timers.progress.kill();
      };

      const resetProgressLines = () => gsap.set(progressLines, { scaleY: 0 });

      const updatePausedTime = () => {
        if (state.startTime && state.isAutoPlaying) {
          state.pausedTime += Date.now() - state.startTime;
          state.pausedTime = Math.min(state.pausedTime, CONFIG.ITEM_DURATION);
        }
      };

      // ========== CORE FUNCTIONS ==========

      // Initial setup
      const initializeElements = () => {
        gsap.set(progressLines, { scaleY: 0, transformOrigin: 'top center', height: '100%' });
        gsap.set(dropdowns.slice(1), { height: 0, opacity: 0, overflow: 'hidden' });
        gsap.set(images.slice(1), { opacity: 0 });
        gsap.set([images[0], dropdowns[0]], { opacity: 1 });
        gsap.set(dropdowns[0], { height: 'auto' });
      };

      // Switch to specific item
      const switchToItem = (index, resetTimer = true) => {
        if (index === state.currentIndex || state.isAnimating) return;

        state.isAnimating = true;
        const previousIndex = state.currentIndex;
        state.currentIndex = index;

        resetProgressLines();
        if (resetTimer) state.pausedTime = 0;

        const tl = gsap.timeline({
          onComplete: () => {
            state.isAnimating = false;
          },
        });

        tl.to(dropdowns, {
          height: 0,
          opacity: 0,
          duration: CONFIG.DROPDOWN_DURATION,
          ease: CONFIG.ANIMATION_EASE,
        })
          .to(
            images[previousIndex],
            {
              opacity: 0,
              duration: CONFIG.IMAGE_FADE_DURATION,
              ease: CONFIG.ANIMATION_EASE,
            },
            '-=0.2'
          )
          .to(
            images[index],
            {
              opacity: 1,
              duration: CONFIG.IMAGE_FADE_DURATION,
              ease: CONFIG.ANIMATION_EASE,
            },
            '-=0.4'
          )
          .to(
            dropdowns[index],
            {
              height: 'auto',
              opacity: 1,
              duration: CONFIG.DROPDOWN_DURATION + 0.2,
              ease: 'power2.out',
            },
            '-=0.2'
          );
      };

      // Auto-play management
      const startAutoPlay = () => {
        if (!state.isAutoPlaying || state.isUserInteracting) return;

        clearAllTimers();

        const remainingTime = CONFIG.ITEM_DURATION - state.pausedTime;

        if (remainingTime <= 0) {
          const nextIndex = (state.currentIndex + 1) % items.length;
          state.pausedTime = 0;
          switchToItem(nextIndex, true);
          startAutoPlay();
          return;
        }

        state.startTime = Date.now();

        timers.progress = gsap.to(progressLines[state.currentIndex], {
          scaleY: 1,
          duration: remainingTime / 1000,
          ease: CONFIG.PROGRESS_EASE,
        });

        timers.autoPlay = setTimeout(() => {
          if (state.isAutoPlaying && !state.isUserInteracting) {
            const nextIndex = (state.currentIndex + 1) % items.length;
            state.pausedTime = 0;
            switchToItem(nextIndex, true);
            startAutoPlay();
          }
        }, remainingTime);
      };

      const pauseAutoPlay = () => {
        clearAllTimers();
        updatePausedTime();
        if (timers.progress) timers.progress.pause();
      };

      const scheduleResume = (delay = CONFIG.HOVER_RESUME_DELAY) => {
        if (timers.resume) clearTimeout(timers.resume);

        timers.resume = setTimeout(() => {
          if (!state.isUserInteracting) {
            state.isAutoPlaying = true;
            startAutoPlay();
          }
        }, delay);
      };

      // ========== EVENT HANDLERS ==========
      const handleClick = (index) => (e) => {
        e.preventDefault();
        if (state.isAnimating || index === state.currentIndex) return;

        state.isUserInteracting = true;
        state.isAutoPlaying = false;
        pauseAutoPlay();

        switchToItem(index, true);

        setTimeout(() => {
          if (!document.querySelector('[data-element="platform-item"]:hover')) {
            state.isUserInteracting = false;
            state.isAutoPlaying = true;
            startAutoPlay();
          }
        }, CONFIG.CLICK_RESUME_DELAY);
      };

      const handleMouseEnter = () => {
        if (timers.resume) clearTimeout(timers.resume);
        state.isUserInteracting = true;
        pauseAutoPlay();
      };

      const handleMouseLeave = () => {
        state.isUserInteracting = false;
        if (!state.isAutoPlaying) scheduleResume();
      };

      // ========== INITIALIZATION ==========
      initializeElements();

      // Add event listeners
      items.forEach((item, index) => {
        item.addEventListener('click', handleClick(index));
        item.addEventListener('mouseenter', handleMouseEnter);
        item.addEventListener('mouseleave', handleMouseLeave);
        item.style.cursor = 'pointer';
      });

      // ScrollTrigger
      ScrollTrigger.create({
        trigger: platformComponent,
        start: CONFIG.SCROLL_START,
        onEnter: () => {
          state.isAutoPlaying = true;
          state.isUserInteracting = false;
          state.pausedTime = 0;
          startAutoPlay();
        },
        onLeave: () => {
          state.isAutoPlaying = false;
          pauseAutoPlay();
        },
        onEnterBack: () => {
          if (!state.isUserInteracting) {
            state.isAutoPlaying = true;
            startAutoPlay();
          }
        },
        onLeaveBack: () => {
          state.isAutoPlaying = false;
          pauseAutoPlay();
        },
      });
    }
  });

  // ... rest of code ...

  const targets = document.querySelectorAll('[data-element=counter]');

  targets.forEach((target) => {
    /* A timestamp element ([date-age] and friends) is not a number to count
       up — route-insights.js writes "4 days" into it. Skip it here so the
       result no longer depends on which of the two async bundles Webflow's
       queue happens to run first. */
    if (
      target.hasAttribute('date-age') ||
      target.hasAttribute('data-date-age') ||
      target.hasAttribute('data-age')
    ) {
      return;
    }

    const originalText = target.textContent.trim();
    const counter = { value: 0 };

    /* Mirror whatever Webflow printed. The CMS number field decides the
       decimals — "91.4" one, "44.75" two, "3185" none — and the count-up has
       to land on exactly that text, so the printed precision drives both the
       display and the tween's step. Webflow prints a dot decimal and no
       thousands grouping; the comma/period handling is for a Designer-typed
       figure or a localised page, where the two swap roles. */
    const COMMA_DECIMAL = /^(nl|de|fr|es|it|pt)/i.test(document.documentElement.lang || '');

    const parseValue = (text) => {
      // The figure is the first digit run, separators allowed between digits
      const match = text.match(/(-?)(\d[\d.,]*\d|\d)/);
      if (!match) return null;

      const prefix = text.slice(0, match.index);
      const suffix = text.slice(match.index + match[0].length);
      const digits = match[2];

      const seps = digits.match(/[.,]/g) || [];
      const lastIdx = Math.max(digits.lastIndexOf('.'), digits.lastIndexOf(','));
      const lastSep = lastIdx < 0 ? '' : digits[lastIdx];
      const after = digits.length - lastIdx - 1; // digits after the last separator

      let decimalSep = '';
      let groupSep = '';
      if (seps.some((s) => s !== lastSep)) {
        decimalSep = lastSep; // 1,234.56 — the last kind is the decimal
        groupSep = lastSep === '.' ? ',' : '.';
      } else if (seps.length > 1) {
        groupSep = lastSep; // 1,234,567
      } else if (seps.length === 1) {
        // A lone separator before exactly three digits is grouping only when
        // it is this locale's grouping character: "1,234" here, "1.234" on NL.
        if (after === 3 && lastSep === (COMMA_DECIMAL ? '.' : ',')) groupSep = lastSep;
        else decimalSep = lastSep; // 91.4 / 91,4
      }

      let numeric = groupSep ? digits.split(groupSep).join('') : digits;
      if (decimalSep === ',') numeric = numeric.replace(',', '.');

      return {
        value: parseFloat(numeric) * (match[1] ? -1 : 1),
        decimals: decimalSep ? after : 0,
        decimalSep,
        groupSep,
        prefix,
        suffix,
      };
    };

    const formatValue = (value, format) => {
      const fixed = Math.abs(value).toFixed(format.decimals);
      const [whole, fraction] = fixed.split('.');
      const grouped = format.groupSep ? whole.replace(/\B(?=(\d{3})+$)/g, format.groupSep) : whole;
      const sign = value < 0 && Number(fixed) !== 0 ? '-' : ''; // never "-0"
      const decimalsPart = fraction ? format.decimalSep + fraction : '';
      return format.prefix + sign + grouped + decimalsPart + format.suffix;
    };

    const parsed = parseValue(originalText);
    if (!parsed) return; // no figure in the text — leave it as rendered

    // Set initial state to 0, at the same precision ("0.0" for "91.4")
    target.textContent = formatValue(0, parsed);

    const tween = {
      value: parsed.value,
      duration: 2,
      ease: 'power2.out',
      snap: { value: Math.pow(10, -parsed.decimals) }, // step of the last printed digit
      onUpdate: function () {
        target.textContent = formatValue(counter.value, parsed);
      },
    };

    /* Anything already on screen when this runs counts up straight away.
       ScrollTrigger is only asked to watch elements still below the fold —
       leaning on it for the hero left the KPI cards sitting at 0 until the
       reader's first scroll, because its initial measurement happens before
       the page's intro animations have settled the layout. */
    const rect = target.getBoundingClientRect();
    const alreadyInView = rect.top < window.innerHeight && rect.bottom > 0;
    if (!alreadyInView) {
      tween.scrollTrigger = {
        trigger: target,
        start: 'top 80%', // Animation starts when element is 80% into viewport
        end: 'bottom 20%',
        toggleActions: 'play none none none', // Play on enter, reverse on leave
        once: true, // Only animate once
        // markers: true, // Remove in production
      };
    }

    gsap.to(counter, tween);
  });
});
