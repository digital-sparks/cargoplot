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
  const featuredCarousel = new Swiper('.swiper-card-link_wrapper', {
    modules: [Autoplay, Navigation, Pagination, Scrollbar, Keyboard, Mousewheel, A11y],
    wrapperClass: 'swiper-card-link_list',
    slideClass: 'swiper-card-link_slide',
    slidesPerView: 'auto',
    speed: 400,
    spaceBetween: 24,
    a11y: true,
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
    scrollbar: {
      el: '.swiper_scrollbar',
      dragClass: 'swiper_scrollbar-drag',
      draggable: true,
    },
    breakpoints: {},
    on: {
      beforeInit: function () {
        this.wrapperEl.style.columnGap = 'unset';
      },
    },
  });
});
