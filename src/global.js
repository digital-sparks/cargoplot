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
  /* HUBSPOT FORMS */

  if (document.querySelectorAll('[data-element=hubspot-form]').length) {
    // Function to toggle element visibility within a specific scope
    const toggleElements = (selector, display, scope = document) => {
      scope.querySelectorAll(selector).forEach((el) => {
        el.style.display = display;
      });
    };

    // Create a new script element
    let script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = '//js.hsforms.net/forms/embed/v2.js';

    // Append the script to the body (or head, depending on your needs)
    document.body.appendChild(script);

    (window.hsFormsOnReady = window.hsFormsOnReady || []).push(() => {
      document.querySelectorAll('[data-element=hubspot-form]').forEach((form, i) => {
        form.setAttribute('hubspot-form-index', i);

        hbspt.forms.create({
          region: 'na1',
          portalId: '7799779', // replace with PortalId value
          formId: form.getAttribute('formId'),
          css: '',
          cssClass: '',
          submitButtonClass: 'button', // replace with button class name
          target: `[data-element="hubspot-form"][hubspot-form-index="${i}"]`,

          onFormReady: (hubspotForm, data) => {
            // ScrollTrigger.refresh(); // uncomment if site uses GSAP ScrollTrigger
            const wfIx = Webflow.require('ix3');
            wfIx.emit('hubspot_form_loaded');
          },

          onFormSubmit: (hubspotForm, data) => {
            form.style.display = 'none';

            const parentContainer = form.parentElement;
            toggleElements('[data-element="hubspot-hide"]', 'none', parentContainer);
            toggleElements('[data-element="hubspot-show"]', 'block', parentContainer);

            // ScrollTrigger.refresh(); // uncomment if site uses GSAP ScrollTrigger
          },
        });
      });
    });
  }

  /* HUBSPOT FORMS */

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
