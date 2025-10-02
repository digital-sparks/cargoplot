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
} from 'swiper/modules';

window.Webflow ||= [];
window.Webflow.push(() => {
  const carousel = new Swiper('.', {
    modules: [Autoplay, Navigation, Pagination, Scrollbar, Keyboard, Mousewheel, A11y],
    wrapperClass: '',
    slideClass: '',
    slidesPerView: 'auto',
    speed: 400,
    spaceBetween: 24,
    a11y: true,
    grabCursor: true,
    autoplay: {
      delay: 3000,
    },
    keyboard: {
      onlyInViewport: true,
    },
    mousewheel: { forceToAxis: true },
    navigation: {
      prevEl: '',
      nextEl: '',
      navigationDisabledClass: '',
      disabledClass: '',
      hiddenClass: '',
    },
    pagination: {
      type: 'bullets',
      el: '.',
      bulletClass: '',
      bulletActiveClass: '',
      clickable: true,
    },
    scrollbar: {
      el: '.',
      dragClass: '',
      draggable: true,
    },
    breakpoints: {},
    on: {
      beforeInit: (swiper) => {
        swiper.wrapperEl.style.ColumnGap = 'unset';
      },
    },
  });
});
