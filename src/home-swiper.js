import { gsap } from 'gsap';
import { Observer } from 'gsap/Observer';
import { SplitText } from 'gsap/SplitText';
gsap.registerPlugin(Observer, SplitText);

import Swiper from 'swiper';
import {
  Autoplay,
  Navigation,
  Pagination,
  Scrollbar,
  Keyboard,
  Mousewheel,
  A11y,
  EffectFade,
} from 'swiper/modules';

// ... existing imports ...

window.Webflow ||= [];
window.Webflow.push(() => {
  let solutionSwiper = null;

  const initSwiper = () => {
    if (solutionSwiper) return; // Already initialized

    solutionSwiper = new Swiper('.card-link_wrapper', {
      modules: [
        Autoplay,
        Navigation,
        Pagination,
        Scrollbar,
        Keyboard,
        Mousewheel,
        A11y,
        EffectFade,
      ],
      wrapperClass: 'card-link_list',
      slideClass: 'card-link_item',
      slidesPerView: 'auto',
      speed: 400,
      a11y: true,
      spaceBetween: 16,
      grabCursor: true,
      autoplay: false,
      keyboard: {
        onlyInViewport: true,
      },
      mousewheel: { forceToAxis: true },
      navigation: {
        prevEl: '.swiper_button.is-prev',
        nextEl: '.swiper_button.is-next',
      },
      pagination: {
        el: '.swiper_pagination',
        bulletClass: 'swiper_pagination-bullet',
        bulletActiveClass: 'is-active',
        clickable: true,
        type: 'bullets',
      },
      on: {},
    });
  };

  const destroySwiper = () => {
    if (solutionSwiper) {
      solutionSwiper.destroy(true, true);
      solutionSwiper = null;
    }
  };

  // Media query for screens 990px and smaller
  const mediaQuery = window.matchMedia('(max-width: 990px)');

  const handleMediaQuery = (e) => {
    if (e.matches) {
      initSwiper();
    } else {
      destroySwiper();
    }
  };

  // Initial check
  handleMediaQuery(mediaQuery);

  // Listen for changes
  mediaQuery.addEventListener('change', handleMediaQuery);
});
