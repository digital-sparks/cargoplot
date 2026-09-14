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

  /* The count-up rewrites the number's text, so for the two seconds it runs
     the DOM carries a value from partway through. Three things keep that
     away from anything that indexes the page. The value is left exactly as
     rendered until the moment a counter starts — a crawler with a normal
     viewport never brings a below-the-fold counter into view. Crawlers,
     headless renderers and automated browsers, which announce themselves,
     get no animation at all, only the values; so does anyone who asked for
     reduced motion. And only the number's own text node is written, so a
     unit that lives inside the same element ("56.73<span>%</span>") keeps its
     markup and style. */
  const isCrawler =
    navigator.webdriver === true ||
    /bot|crawl|spider|slurp|inspectiontool|lighthouse|headless|prerender/i.test(
      navigator.userAgent
    );
  const reduceMotion =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* A counter starts when it comes into view. An IntersectionObserver rather
     than ScrollTrigger: ScrollTrigger measures its trigger positions once (at
     creation and on refresh) and anything that changes the page height after
     that — charts building lazily, the carrier chart sizing itself, images
     arriving — leaves those positions stale. That is how the counters near
     the foot of a route page came to start only at the very bottom on desktop
     and never on a phone, where the shifts are larger. The observer reads the
     real geometry at the moment of scrolling and fires straight away for
     anything already in view (so the hero needs no special case). Starts when
     the element's bottom edge enters the viewport ('bottom 100%' in
     ScrollTrigger terms): threshold 1 asks for the whole element to be inside
     the root, whose bottom edge is the viewport's own. The root is extended
     far above the viewport so an element the reader has already scrolled
     past — a reload restored further down, an anchor jump straight over it —
     is fully inside too and plays at once rather than sitting at 0; a plain
     observer never fires for a jump from below the viewport to above it,
     since neither state intersects. */
  const COUNTER_REVEAL_MARGIN = '100000px 0px 0px 0px';

  /* ?counter-debug — markers in the spirit of ScrollTrigger's: a dashed line
     along the bottom edge of the viewport, which is where counters start (an
     element starts once its bottom edge has entered), and a bar on each
     counter's bottom edge — the edge that has to cross the line — that turns
     green the moment it fires, with a console line per start. */
  const counterDebug = /[?&]counter-debug\b/.test(window.location.search);
  if (counterDebug) {
    const line = document.createElement('div');
    line.style.cssText =
      'position:fixed;left:0;right:0;bottom:0;border-bottom:2px dashed #d6336c;z-index:2147483647;' +
      'pointer-events:none;font:12px/1.4 monospace;color:#d6336c;padding:2px 8px';
    line.textContent = 'counters start when their bottom edge enters the viewport (bottom 100%)';
    document.body.appendChild(line);
  }
  const markCounter = (el) => {
    if (!counterDebug) return null;
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    const bar = document.createElement('span');
    bar.setAttribute('aria-hidden', 'true');
    bar.style.cssText =
      'position:absolute;left:0;right:0;bottom:0;border-bottom:3px solid #f59f00;pointer-events:none';
    el.appendChild(bar);
    return bar;
  };
  const whenCounterVisible = (el, play) => {
    if (typeof window.IntersectionObserver !== 'function') {
      play();
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.999) {
            io.disconnect();
            play();
            return;
          }
        }
      },
      { threshold: 1, rootMargin: COUNTER_REVEAL_MARGIN }
    );
    io.observe(el);
  };

  /* The first text node under the element that holds a digit — the number
     itself, whether the element is just "10525" or "56.73<span>%</span>". */
  const findNumberText = (el) => {
    for (const node of el.childNodes) {
      if (node.nodeType === 3 && /\d/.test(node.nodeValue)) return node;
      if (node.nodeType === 1) {
        const inner = findNumberText(node);
        if (inner) return inner;
      }
    }
    return null;
  };

  const targets = document.querySelectorAll('[data-element=counter]');

  targets.forEach((target) => {
    /* A timestamp element ([date-age] and friends) is not a number to count
       up — route-insights.js writes "4d" into it. Skip it here so the result
       no longer depends on which of the two async bundles Webflow's queue
       happens to run first. */
    if (
      target.hasAttribute('date-age') ||
      target.hasAttribute('data-date-age') ||
      target.hasAttribute('data-age')
    ) {
      return;
    }

    const numberNode = findNumberText(target);
    if (!numberNode) return; // no figure in the element — leave it as rendered
    const originalText = numberNode.nodeValue.trim();
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
    if (!parsed || isCrawler || reduceMotion) return; // the value is already on the page

    const marker = markCounter(target);
    const show = (value) => {
      numberNode.nodeValue = formatValue(value, parsed);
    };

    const tween = {
      value: parsed.value,
      duration: 2,
      ease: 'power2.out',
      snap: { value: Math.pow(10, -parsed.decimals) }, // step of the last printed digit
      onUpdate: function () {
        show(counter.value);
      },
    };

    whenCounterVisible(target, () => {
      if (marker) {
        marker.style.borderBottomColor = '#2f9e44';
        console.log('[counters] start:', originalText);
      }
      show(0); // from here on the text is the count; until now it was the value
      gsap.to(counter, tween);
    });
  });
});
