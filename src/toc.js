const scrollButtons = document.querySelectorAll('[data-button-click="scroll"]');

scrollButtons.forEach((button) => {
  button.addEventListener('click', (e) => {
    e.preventDefault();

    const targetSelector = button.getAttribute('href');

    if (targetSelector) {
      const targetElement = document.querySelector(targetSelector);

      if (targetElement) {
        // Get the target position relative to the document
        const targetPosition = targetElement.getBoundingClientRect().top + window.pageYOffset;
        const startPosition = window.pageYOffset;
        const distance = targetPosition - startPosition;
        const duration = 1000; // Duration in milliseconds
        let start = null;

        // Animation function
        function animation(currentTime) {
          if (start === null) start = currentTime;
          const timeElapsed = currentTime - start;
          const run = ease(timeElapsed, startPosition, distance, duration);
          window.scrollTo(0, run);
          if (timeElapsed < duration) requestAnimationFrame(animation);
        }

        // Easing function (ease-in-out)
        function ease(t, b, c, d) {
          t /= d / 2;
          if (t < 1) return (c / 2) * t * t + b;
          t--;
          return (-c / 2) * (t * (t - 2) - 1) + b;
        }

        requestAnimationFrame(animation);
      } else {
        console.warn('Target element not found:', targetSelector);
      }
    } else {
      console.warn('No href attribute found on button');
    }
  });
});
// ============================================================
// UTILITIES
// ============================================================

const setProperty = Object.defineProperty;
const define = (obj, key, value) =>
  key in obj
    ? setProperty(obj, key, { enumerable: true, configurable: true, writable: true, value })
    : (obj[key] = value);

// Optimized slugify function with better special character handling
const slugify = (text) => {
  return text
    .trim()
    .toLowerCase()
    .normalize('NFD') // Normalize unicode characters
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .replace(/[\s\u00A0]+/g, '-') // Replace spaces with hyphens
    .replace(/[^\w\-]+/g, '') // Remove non-word chars
    .replace(/--+/g, '-') // Replace multiple hyphens
    .replace(/^-+|-+$/g, ''); // Trim hyphens from start/end
};

// Easing function for smooth scroll (cached)
const easeInOutQuad = (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t);

// ============================================================
// CONFIGURATION
// ============================================================

const DEFAULTS = {
  selector: '[ss-toc-comp]',
  headingSelector: 'h1, h2, h3, h4, h5, h6',
  listType: 'none',
  smoothScroll: false,
  scrollSpeed: 300,
  itemActiveClass: 'is-active',
  offset: 0,
};

const SELECTORS = {
  tocComp: 'ss-toc-comp',
  tocContentComp: 'ss-toc-content-comp',
  headingSelector: 'ss-option-heading-selector',
  listType: 'ss-option-list-type',
  smoothScroll: 'ss-option-smooth-scroll',
  scrollSpeed: 'ss-option-scroll-speed',
  itemActiveClass: 'ss-option-item-active-class',
  offset: 'ss-option-offset',
  item: {
    element: '[ss-toc-comp-ele="item"]',
    text: '[ss-toc-comp-ele="item-text"]',
  },
};

// ============================================================
// INTERSECTION OBSERVER (Optimized)
// ============================================================

function observeHeadings(headings, tocItems, onActiveChange) {
  if (headings.length !== tocItems.length) {
    console.error('TOC: Headings and TOC items count mismatch');
    return null;
  }

  if (headings.length === 0) return null;

  const activeClass = tocItems[0]?.getAttribute(SELECTORS.itemActiveClass) || 'active';
  let currentActiveIndex = -1;

  const callback = (entries) => {
    // Process only intersecting entries for better performance
    const intersectingEntries = entries.filter((entry) => entry.isIntersecting);

    if (intersectingEntries.length === 0) return;

    // Find the topmost intersecting heading
    const topmostEntry = intersectingEntries.reduce((top, entry) =>
      entry.boundingClientRect.top < top.boundingClientRect.top ? entry : top
    );

    const newActiveIndex = headings.indexOf(topmostEntry.target);

    if (newActiveIndex !== -1 && newActiveIndex !== currentActiveIndex) {
      currentActiveIndex = newActiveIndex;

      // Batch DOM updates
      requestAnimationFrame(() => {
        tocItems.forEach((item, idx) => {
          item.classList.toggle(activeClass, idx === newActiveIndex);
        });
        onActiveChange(topmostEntry.target.id);
      });
    }
  };

  const options = {
    rootMargin: '-30px 0% -77%',
    threshold: 0.1, // Reduced threshold for better performance
  };

  const observer = new IntersectionObserver(callback, options);
  headings.forEach((heading) => observer.observe(heading));

  return () => observer.disconnect();
}

// ============================================================
// TABLE OF CONTENTS CLASS
// ============================================================

class TableOfContents {
  constructor(container, contentElements, options = {}) {
    this.options = { ...DEFAULTS, ...options };
    this.container = container;

    // Support both single element and NodeList/array
    if (contentElements instanceof NodeList || Array.isArray(contentElements)) {
      this.contentElements = Array.from(contentElements);
    } else {
      this.contentElements = [contentElements];
    }

    this.tocItems = [];
    this.usedIds = new Map(); // Use Map for better performance
    this.disconnectObserver = null;

    // Cache frequently accessed elements
    this.itemTemplate = null;

    if (!this.container) {
      throw new Error(`TOC: Container not found`);
    }

    if (this.contentElements.length === 0 || !this.contentElements[0]) {
      throw new Error(`TOC: Content element(s) not found`);
    }

    this.init();
  }

  init() {
    this.buildToC();

    if (this.options.smoothScroll) {
      this.enableSmoothScroll();
    }

    this.disconnectObserver = this.observeHeadings();
  }

  buildToC() {
    // Collect headings from ALL content elements
    const allHeadings = [];

    this.contentElements.forEach((contentElement) => {
      const headings = contentElement.querySelectorAll(this.options.headingSelector);
      allHeadings.push(...headings);
    });

    if (allHeadings.length === 0) {
      console.warn('TOC: No headings found in any content element');
      return;
    }

    // Get and cache template
    this.itemTemplate = this.container.querySelector(SELECTORS.item.element);

    if (!this.itemTemplate) {
      console.error('TOC: Item template not found');
      return;
    }

    // Clone template once
    const template = this.itemTemplate.cloneNode(true);

    // Clear container
    this.container.innerHTML = '';

    // Fragment for batch DOM insertion
    const fragment = document.createDocumentFragment();

    const isOrderedList = this.options.listType === 'ol';
    const isUnorderedList = this.options.listType === 'ul';

    allHeadings.forEach((heading, index) => {
      const item = this.createToCItem(template, heading, index, isOrderedList, isUnorderedList);
      fragment.appendChild(item);
    });

    // Single DOM insertion
    this.container.appendChild(fragment);
  }

  createToCItem(template, heading, index, isOrderedList, isUnorderedList) {
    const item = template.cloneNode(true);
    const textElement = item.querySelector(SELECTORS.item.text);
    const headingText = heading.textContent || '';

    // Set text content
    if (textElement) {
      let displayText = headingText;

      if (isOrderedList) {
        displayText = `${index + 1}. ${headingText}`;
      } else if (isUnorderedList) {
        displayText = `• ${headingText}`;
      }

      textElement.textContent = displayText;
    } else {
      item.textContent = headingText;
    }

    // Generate or use existing ID
    const id = heading.id || this.generateReadableId(headingText);
    heading.id = id;

    // Set href and remove active class
    item.setAttribute('href', `#${id}`);
    item.classList.remove(this.options.itemActiveClass);

    this.tocItems.push(item);
    return item;
  }

  generateReadableId(text) {
    if (!text) return this.generateFallbackId();

    const baseSlug = slugify(text);
    if (!baseSlug) return this.generateFallbackId();

    // Use Map for O(1) lookup
    const count = this.usedIds.get(baseSlug) || 0;
    this.usedIds.set(baseSlug, count + 1);

    return count > 0 ? `${baseSlug}-${count}` : baseSlug;
  }

  generateFallbackId() {
    return `toc-${Math.random().toString(36).substr(2, 9)}`;
  }

  enableSmoothScroll() {
    // Use event delegation for better performance
    this.container.addEventListener('click', (event) => {
      const item = event.target.closest('[href^="#"]');
      if (!item) return;

      event.preventDefault();
      const targetId = item.getAttribute('href')?.slice(1);

      if (!targetId) return;

      const targetElement = document.getElementById(targetId);
      if (!targetElement) return;

      this.smoothScrollTo(targetElement);
    });
  }

  smoothScrollTo(element) {
    const bodyRect = document.body.getBoundingClientRect().top;
    const elementRect = element.getBoundingClientRect().top;
    const targetPosition = elementRect - bodyRect - this.options.offset;
    const startPosition = window.pageYOffset;
    const distance = targetPosition - startPosition;
    const duration = this.options.scrollSpeed;
    const startTime = performance.now();

    const animateScroll = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easing = easeInOutQuad(progress);

      window.scrollTo(0, startPosition + distance * easing);

      if (progress < 1) {
        requestAnimationFrame(animateScroll);
      }
    };

    requestAnimationFrame(animateScroll);
  }

  observeHeadings() {
    // Collect headings from ALL content elements
    const allHeadings = [];

    this.contentElements.forEach((contentElement) => {
      const headings = Array.from(contentElement.querySelectorAll(this.options.headingSelector));
      allHeadings.push(...headings);
    });

    const onActiveChange = (activeId) => {
      // Optional: Add custom logic when active item changes
      // console.log('Active heading:', activeId);
    };

    return observeHeadings(allHeadings, this.tocItems, onActiveChange);
  }

  destroy() {
    // Cleanup method for proper memory management
    if (this.disconnectObserver) {
      this.disconnectObserver();
    }
    this.tocItems = [];
    this.usedIds.clear();
    this.container.innerHTML = '';
  }
}

// ============================================================
// INITIALIZATION
// ============================================================

function initializeTableOfContents() {
  // Setup global namespace
  window.shaiksaifPowerUps = window.shaiksaifPowerUps || {};
  window.shaiksaifPowerUps.TOCInstances = window.shaiksaifPowerUps.TOCInstances || [];

  // Disable Webflow native smooth scroll
  disableWebflowSmoothScroll();

  const tocContainers = document.querySelectorAll(`[${SELECTORS.tocComp}]`);

  tocContainers.forEach((container) => {
    const tocId = container.getAttribute(SELECTORS.tocComp);

    // Get ALL content elements with matching ID (supports multiple)
    const contentElements = document.querySelectorAll(`[${SELECTORS.tocContentComp}="${tocId}"]`);

    if (contentElements.length === 0) {
      console.warn(`TOC: No content elements found for id "${tocId}"`);
      return;
    }

    // Parse options from attributes
    const options = {
      headingSelector:
        container.getAttribute(SELECTORS.headingSelector) || DEFAULTS.headingSelector,
      listType: container.getAttribute(SELECTORS.listType) || DEFAULTS.listType,
      smoothScroll: container.getAttribute(SELECTORS.smoothScroll) === 'true',
      scrollSpeed: parseInt(
        container.getAttribute(SELECTORS.scrollSpeed) || String(DEFAULTS.scrollSpeed),
        10
      ),
      itemActiveClass:
        container.getAttribute(SELECTORS.itemActiveClass) || DEFAULTS.itemActiveClass,
      offset: parseInt(container.getAttribute(SELECTORS.offset) || String(DEFAULTS.offset), 10),
    };

    try {
      // Create single instance with multiple content elements
      const instance = new TableOfContents(container, contentElements, options);
      window.shaiksaifPowerUps.TOCInstances.push(instance);
    } catch (error) {
      console.error('TOC: Failed to initialize', error);
    }
  });
}

// ============================================================
// DISABLE WEBFLOW SMOOTH SCROLL
// ============================================================

function disableWebflowSmoothScroll() {
  // Check if jQuery is available (Webflow loads it)
  if (typeof window.jQuery !== 'undefined') {
    const $ = window.jQuery;
    $(document).off('click.wf-scroll');
    console.log('TOC: Webflow smooth scroll disabled (jQuery)');
  } else {
    // Fallback: Vanilla JS method to disable Webflow scroll
    // Remove event listeners with 'wf-scroll' namespace
    const links = document.querySelectorAll('a[href^="#"]');
    links.forEach((link) => {
      // Clone and replace to remove all event listeners
      const newLink = link.cloneNode(true);
      link.parentNode?.replaceChild(newLink, link);
    });
    console.log('TOC: Webflow smooth scroll disabled (Vanilla JS)');
  }
}

// Alternative: Wrap in Webflow.push if available
function initWithWebflowSupport() {
  if (typeof window.Webflow !== 'undefined' && Array.isArray(window.Webflow)) {
    window.Webflow.push(function () {
      // Disable Webflow smooth scroll using jQuery (Webflow's method)
      if (typeof window.jQuery !== 'undefined') {
        const $ = window.jQuery;
        $(document).off('click.wf-scroll');
      }
      initializeTableOfContents();
    });
  } else {
    // Fallback if Webflow is not available
    initializeTableOfContents();
  }
}

// Auto-initialize with Webflow support
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initWithWebflowSupport);
} else {
  initWithWebflowSupport();
}

// Expose API for manual control
window.shaiksaifPowerUps = window.shaiksaifPowerUps || {};
window.shaiksaifPowerUps.TableOfContents = TableOfContents;
