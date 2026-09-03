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
  /* An empty collection list renders the wrapper with no slides (or nothing at
     all), and Swiper does not cope with that. Build only when both exist, and
     only if nothing else has already initialised this wrapper. */
  const wrapper = document.querySelector('.swiper-card-link_wrapper');
  if (!wrapper || wrapper.swiper || !wrapper.querySelector('.swiper-card-link_slide')) return;

  const featuredCarousel = new Swiper(wrapper, {
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
