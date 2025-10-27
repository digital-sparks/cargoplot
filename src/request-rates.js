import { gsap } from 'gsap';

const CONFIG = {
  SELECTORS: {
    preloader: '.preloader_component',
    preloaderText: '.heading-style-h6',
    preloaderImage: 'img',
  },
  PARAMS_TO_CHECK: ['origin', 'destination', 'transportDate', 'transportMode'],
};

window.Webflow ||= [];
window.Webflow.push(() => {
  const preloader = document.querySelector(CONFIG.SELECTORS.preloader);
  if (!preloader) return;

  const preloaderText = preloader.querySelector(CONFIG.SELECTORS.preloaderText);
  const preloaderImage = preloader.querySelector(CONFIG.SELECTORS.preloaderImage);

  if (!preloaderText || !preloaderImage) return;

  const url = new URL(window.location.href);
  const foundParams = {};
  let hasAnyParam = false;

  CONFIG.PARAMS_TO_CHECK.forEach((param) => {
    if (url.searchParams.has(param)) {
      foundParams[param] = url.searchParams.get(param);
      hasAnyParam = true;
    }
  });

  if (hasAnyParam) {
    gsap.set(preloader, { display: 'block' });
    gsap.to(preloaderImage, {
      rotate: 180,
      repeat: -1,
      duration: 1,
      ease: 'power2.inOut',
    });

    preloaderText.textContent = preloaderText.textContent.replace(/\./g, '') + '.';

    let dotCount = 0;
    const interval = setInterval(() => {
      if (dotCount < 4) {
        preloaderText.textContent = preloaderText.textContent + '.';
        dotCount++;
      } else {
        clearInterval(interval);
      }
    }, 600);

    gsap.to(preloader, {
      opacity: 0,
      delay: 2.8,
      duration: 0.8,
      ease: 'power3.out',
      onStart: () => {
        window.scrollTo({ top: 0, behavior: 'instant' });
      },
      onComplete: () => {
        gsap.set(preloader, { display: 'none' });
      },
    });
  }
});
