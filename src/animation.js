// import { gsap } from 'gsap';
// import { ScrollTrigger } from 'gsap/ScrollTrigger';
// import { SplitText } from 'gsap/SplitText';

window.Webflow ||= [];
window.Webflow.push(() => {
  //   gsap.registerPlugin(SplitText);
  //   gsap.registerPlugin(ScrollTrigger);

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
    const originalText = target.textContent.trim();
    const counter = { value: 0 };

    // Parse the target value and format info
    const parseValue = (text) => {
      // Extract prefix (any non-digit, non-decimal characters at start)
      const prefixMatch = text.match(/^[^\d.-]*/);
      const prefix = prefixMatch ? prefixMatch[0] : '';

      // Remove prefix to work with the rest
      let remaining = text.slice(prefix.length);

      // Handle K, M multipliers (check before extracting suffix)
      let multiplier = 1;
      let unit = '';
      if (remaining.endsWith('K') || remaining.endsWith('k')) {
        multiplier = 1000;
        unit = remaining.slice(-1);
        remaining = remaining.slice(0, -1);
      } else if (remaining.endsWith('M') || remaining.endsWith('m')) {
        multiplier = 1000000;
        unit = remaining.slice(-1);
        remaining = remaining.slice(0, -1);
      }

      // Extract suffix (any non-digit, non-decimal characters at end)
      const suffixMatch = remaining.match(/[^\d.-]*$/);
      const suffix = suffixMatch ? suffixMatch[0] : '';

      // Get the numeric part
      const numericPart = remaining.slice(0, remaining.length - suffix.length);
      const numValue = parseFloat(numericPart) * multiplier;

      return {
        value: numValue,
        prefix,
        suffix,
        unit,
        multiplier,
        hasDecimal: numericPart.includes('.'),
      };
    };

    const formatValue = (value, format) => {
      let displayValue = value;

      // Convert back to unit format
      if (format.unit) {
        displayValue = value / format.multiplier;
        // Keep decimal if original had one
        if (format.hasDecimal) {
          displayValue = displayValue.toFixed(1);
        } else {
          displayValue = Math.round(displayValue);
        }
        displayValue += format.unit;
      } else {
        displayValue = Math.round(value);
      }

      return format.prefix + displayValue + format.suffix;
    };

    const parsed = parseValue(originalText);

    // Set initial state to 0
    target.textContent = formatValue(0, parsed);

    gsap.to(counter, {
      value: parsed.value,
      duration: 2,
      ease: 'power2.out',
      snap: { value: 1 },
      onUpdate: function () {
        target.textContent = formatValue(counter.value, parsed);
      },
      scrollTrigger: {
        trigger: target,
        start: 'top 80%', // Animation starts when element is 80% into viewport
        end: 'bottom 20%',
        toggleActions: 'play none none reverse', // Play on enter, reverse on leave
        once: true, // Only animate once
        // markers: true, // Remove in production
      },
    });
  });
});
