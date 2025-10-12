import { gsap } from 'gsap';
import { Observer } from 'gsap/Observer';
import { SplitText } from 'gsap/SplitText';
gsap.registerPlugin(Observer, SplitText);

window.Webflow ||= [];
window.Webflow.push(() => {
  console.log('hello');

  /* HUBSPOT FORMS */

  if (document.querySelectorAll('[data-element=hubspot-form]').length) {
    // Function to toggle element visibility
    const toggleElements = (selector, display) => {
      document.querySelectorAll(selector).forEach((el) => {
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
          portalId: '5746318', // replace with PortalId value
          formId: form.getAttribute('formId'),
          css: '',
          cssClass: '',
          submitButtonClass: 'button', // replace with button class name
          target: `[data-element="hubspot-form"][hubspot-form-index="${i}"]`,

          onFormReady: (hubspotForm, data) => {
            // ScrollTrigger.refresh(); // uncomment if site uses GSAP ScrollTrigger
          },

          onFormSubmit: (hubspotForm, data) => {
            toggleElements(form, 'none');
            toggleElements('[data-element="hubspot-hide"]', 'none');
            toggleElements('[data-element="hubspot-show"]', 'block');

            // ScrollTrigger.refresh(); // uncomment if site uses GSAP ScrollTrigger
          },
        });
      });
    });
  }

  /* HUBSPOT FORMS */
});
