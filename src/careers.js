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

window.Webflow ||= [];
window.Webflow.push(() => {
  const testimonialCarousel = new Swiper('.swiper-testimonial_wrapper', {
    modules: [Autoplay, Navigation, Pagination, Scrollbar, Keyboard, Mousewheel, A11y, EffectFade],
    wrapperClass: 'swiper-testimonial_list',
    slideClass: 'swiper-testimonial_slide',
    effect: 'fade',
    fadeEffect: {
      crossFade: true,
    },
    slidesPerView: 1,
    speed: 400,
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
    pagination: {
      el: '.swiper_pagination',
      bulletClass: 'swiper_pagination-bullet',
      bulletActiveClass: 'is-active',
      clickable: true,
      type: 'bullets',
    },
    breakpoints: {},
  });
});
