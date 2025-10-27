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
  let swipers = [];

  const initSwipers = () => {
    if (swipers.length > 0) return;

    document.querySelectorAll('.card-link_wrapper').forEach((container) => {
      const parent = container.closest('.solutions_component, .services_component').parentNode;

      swipers.push(
        new Swiper(container, {
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
          spaceBetween: 16,
          grabCursor: true,
          a11y: true,
          keyboard: { onlyInViewport: true },
          mousewheel: { forceToAxis: true },
          navigation: {
            prevEl: parent?.querySelector('.swiper_button.is-prev'),
            nextEl: parent?.querySelector('.swiper_button.is-next'),
          },
          pagination: {
            el: parent?.querySelector('.swiper_pagination'),
            bulletClass: 'swiper_pagination-bullet',
            bulletActiveClass: 'is-active',
            clickable: true,
            type: 'bullets',
          },
        })
      );
    });
  };

  const destroySwipers = () => {
    swipers.forEach((swiper) => swiper?.destroy(true, true));
    swipers = [];
  };

  const mediaQuery = window.matchMedia('(max-width: 990px)');

  const handleMediaQuery = (e) => {
    e.matches ? initSwipers() : destroySwipers();
  };

  handleMediaQuery(mediaQuery);
  mediaQuery.addEventListener('change', handleMediaQuery);
});
