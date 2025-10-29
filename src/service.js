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

  // // Configuration
  // const CONFIG = {
  //   API_URL: 'https://app.cargoplot.com/api/bookings/sea?limit=5',
  //   TIMEOUT: 10000, // 10 seconds
  //   MAX_RETRIES: 3,
  //   RETRY_DELAY: 1000, // 1 second
  //   DEBUG: false, // Set to true for development
  // };

  // // Utility functions
  // const log = (...args) => {
  //   if (CONFIG.DEBUG) console.log('[BookingsTable]', ...args);
  // };

  // const logError = (...args) => {
  //   if (CONFIG.DEBUG) console.error('[BookingsTable]', ...args);
  // };

  // const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // // Create loading indicator
  // function showLoading(tableBody) {
  //   tableBody.innerHTML = `
  //     <tr class="fs-table_row">
  //       <td class="fs-table_cell" colspan="4" style="text-align: center; padding: 2rem;">
  //         <div style="display: flex; align-items: center; justify-content: center; gap: 0.5rem;">
  //           <div style="width: 16px; height: 16px; border: 2px solid #f3f3f3; border-top: 2px solid #3498db; border-radius: 50%; animation: spin 1s linear infinite;"></div>
  //           Loading bookings...
  //         </div>
  //       </td>
  //     </tr>
  //   `;
  // }

  // // Show error message
  // function showError(tableBody, message) {
  //   tableBody.innerHTML = `
  //     <tr class="fs-table_row">
  //       <td class="fs-table_cell" colspan="4" style="text-align: center; padding: 2rem; color: #e74c3c;">
  //         <div>
  //           <strong>Unable to load bookings</strong><br>
  //           <small>${message}</small><br>
  //           <button onclick="location.reload()" style="margin-top: 1rem; padding: 0.5rem 1rem; background: #3498db; color: white; border: none; border-radius: 4px; cursor: pointer;">
  //             Try Again
  //           </button>
  //         </div>
  //       </td>
  //     </tr>
  //   `;
  // }

  // // Fetch with timeout
  // async function fetchWithTimeout(url, options = {}) {
  //   const controller = new AbortController();
  //   const timeoutId = setTimeout(() => controller.abort(), CONFIG.TIMEOUT);

  //   try {
  //     const response = await fetch(url, {
  //       ...options,
  //       signal: controller.signal,
  //     });
  //     clearTimeout(timeoutId);
  //     return response;
  //   } catch (error) {
  //     clearTimeout(timeoutId);
  //     throw error;
  //   }
  // }

  // // Fetch bookings with retry logic
  // async function fetchBookings(retryCount = 0) {
  //   try {
  //     const apiUrl = CONFIG.API_URL;

  //     log(`Fetching bookings (attempt ${retryCount + 1}):`, apiUrl);

  //     const response = await fetchWithTimeout(apiUrl, {
  //       headers: {
  //         Accept: 'application/json',
  //         'Content-Type': 'application/json',
  //       },
  //     });

  //     if (!response.ok) {
  //       throw new Error(`API returned ${response.status}: ${response.statusText}`);
  //     }

  //     const data = await response.json();

  //     // Validate response data
  //     if (!Array.isArray(data)) {
  //       throw new Error('Invalid response format: expected array');
  //     }

  //     return data;
  //   } catch (error) {
  //     logError('Fetch attempt failed:', error.message);

  //     if (retryCount < CONFIG.MAX_RETRIES) {
  //       log(`Retrying in ${CONFIG.RETRY_DELAY}ms... (${retryCount + 1}/${CONFIG.MAX_RETRIES})`);
  //       await delay(CONFIG.RETRY_DELAY * (retryCount + 1)); // Exponential backoff
  //       return fetchBookings(retryCount + 1);
  //     }

  //     throw error;
  //   }
  // }

  // // Sanitize text content
  // function sanitizeText(text) {
  //   if (typeof text !== 'string') return String(text || '');
  //   return text.trim().substring(0, 100); // Limit length for safety
  // }

  // // Populate table with booking data
  // function populateTable(tableBody, bookings) {
  //   const fragment = document.createDocumentFragment();

  //   bookings.forEach((booking, index) => {
  //     // Validate booking object
  //     if (!booking || typeof booking !== 'object') {
  //       logError(`Invalid booking at index ${index}:`, booking);
  //       return;
  //     }

  //     const row = document.createElement('tr');
  //     row.className = 'fs-table_row';
  //     row.setAttribute('data-booking-index', index);

  //     const fields = ['from', 'to', 'size', 'booked'];

  //     fields.forEach((field) => {
  //       const cell = document.createElement('td');
  //       cell.className = 'fs-table_cell';
  //       cell.textContent = sanitizeText(booking[field]);
  //       cell.setAttribute('data-field', field);
  //       row.appendChild(cell);
  //     });

  //     fragment.appendChild(row);
  //   });

  //   tableBody.innerHTML = '';
  //   tableBody.appendChild(fragment);

  //   log(`Successfully populated table with ${bookings.length} bookings`);
  // }

  // // Main function
  // async function populateBookingsTable() {
  //   const tableBody = document.querySelector('.fs-table_body');

  //   if (!tableBody) {
  //     logError('Table body element not found (.fs-table_body)');
  //     return;
  //   }

  //   try {
  //     showLoading(tableBody);

  //     const bookings = await fetchBookings();

  //     if (bookings.length === 0) {
  //       tableBody.innerHTML = `
  //         <tr class="fs-table_row">
  //           <td class="fs-table_cell" colspan="4" style="text-align: center; padding: 2rem;">
  //             No bookings available at this time
  //           </td>
  //         </tr>
  //       `;
  //       return;
  //     }

  //     populateTable(tableBody, bookings);
  //   } catch (error) {
  //     logError('Failed to populate bookings table:', error);

  //     let errorMessage = 'Please try again later';

  //     if (error.name === 'AbortError') {
  //       errorMessage = 'Request timed out';
  //     } else if (error.message.includes('Failed to fetch')) {
  //       errorMessage = 'Network connection issue';
  //     } else if (error.message.includes('API returned')) {
  //       errorMessage = 'Service temporarily unavailable';
  //     }

  //     showError(tableBody, errorMessage);
  //   }
  // }

  // // Add CSS for loading spinner if not already present
  // if (!document.querySelector('#bookings-table-styles')) {
  //   const style = document.createElement('style');
  //   style.id = 'bookings-table-styles';
  //   style.textContent = `
  //     @keyframes spin {
  //       0% { transform: rotate(0deg); }
  //       100% { transform: rotate(360deg); }
  //     }
  //   `;
  //   document.head.appendChild(style);
  // }

  // // Initialize
  // populateBookingsTable();
});
