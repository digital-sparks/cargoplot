import AirDatepicker from 'air-datepicker';
import en from 'air-datepicker/locale/en';
import nl from 'air-datepicker/locale/nl';
import de from 'air-datepicker/locale/de';
import 'air-datepicker/air-datepicker.css';

// ============================================================================
// CONFIGURATION VARIABLES
// ============================================================================

// Test Mode - Set to true to enable detailed console logging
const TEST_MODE = true;

// Google Maps API Configuration
const GOOGLE_MAPS_API_KEY = 'AIzaSyA3LzIwr4sbLguFgF02W7QguXG1Y2wv7fQ';
const GOOGLE_MAPS_LIBRARIES = 'places';
const GOOGLE_MAPS_VERSION = 'beta';

// Search Configuration
const MIN_SEARCH_CHARACTERS = 1;
const SEARCH_DEBOUNCE_MS = 100;

// Date Configuration
const DATE_DISPLAY_FORMAT = 'dd-MM-yyyy'; // User-friendly format
const DATE_URL_FORMAT = 'yyyy-MM-dd'; // ISO format for URL
const DATE_MIN_OFFSET_DAYS = 0;
const DATE_MAX_OFFSET_DAYS = 90;

// Element IDs and Selectors
const SELECTORS = {
  // Input fields
  originInput: 'cargo_origin',
  destinationInput: 'cargo_destination',
  cargoTypeSelect: 'cargo_type',
  cargoTypeDisplay: 'cargo_type_display',
  dateInput: 'cargo_date',

  // Checkboxes
  seaCheckbox: 'cargo_option_sea',
  airCheckbox: 'cargo_option_air',
  trainCheckbox: 'cargo_option_train',

  // Submit button
  submitButton: '[data-button-click="cargo_submit"]',

  // Dropdown elements
  dropdown: '[data-element="dropdown"]',
  dropdownLink: '[data-element="dropdown-link"]',
  dropdownCity: '[data-element="city"]',
  dropdownCountry: '[data-element="country"]',

  // Error handling
  errorClass: 'is-error',
  errorElement: '.cargo_field-error',
  inputField: '.cargo_input-field',
  cargoField: '.cargo_field',
  dateContainer: '.cargo_field:has(#cargo_date)',
};

// Transport Mode Options
const TRANSPORT_MODES = [
  { id: SELECTORS.seaCheckbox, value: 'sea' },
  { id: SELECTORS.airCheckbox, value: 'air' },
  { id: SELECTORS.trainCheckbox, value: 'rail' },
];

// Container Type Values (for URL parameter logic)
const CONTAINER_TYPES = {
  excludeFromUrl: ['other lcl', 'lcl'],
  emptyValue: ['other fcl', 'fcl'],
};

// Default Redirect URL
const DEFAULT_REDIRECT_URL = '/inquiry';

// Dropdown Behavior
const DROPDOWN_CLOSE_DELAY_MS = 200;
const DROPDOWN_STYLES = {
  focusedBackground: '#f5f5f5',
  defaultBackground: 'white',
};

// ARIA Labels
const ARIA_LABELS = {
  locationSuggestions: 'Location suggestions',
  cargoTypeOptions: 'Cargo type options',
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Logs messages when TEST_MODE is enabled
 */
function log(...args) {
  if (TEST_MODE) {
    console.log('[TEST MODE]', ...args);
  }
}

/**
 * Loads Google Maps API script dynamically
 */
function loadGoogleMapsAPI() {
  return new Promise((resolve, reject) => {
    // Check if already loaded
    if (window.google && window.google.maps && window.google.maps.places) {
      log('Google Maps API already loaded');
      resolve();
      return;
    }

    // Check if script is already being loaded
    if (document.querySelector('script[src*="maps.googleapis.com"]')) {
      log('Google Maps API script already present, waiting for load...');
      const checkLoaded = setInterval(() => {
        if (window.google && window.google.maps && window.google.maps.places) {
          clearInterval(checkLoaded);
          log('Google Maps API loaded');
          resolve();
        }
      }, 100);
      return;
    }

    // Create and load script
    log('Loading Google Maps API script...');
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=${GOOGLE_MAPS_LIBRARIES}&v=${GOOGLE_MAPS_VERSION}`;
    script.async = true;
    script.defer = true;

    script.onload = () => {
      log('Google Maps API script loaded successfully');
      resolve();
    };

    script.onerror = () => {
      console.error('Failed to load Google Maps API');
      reject(new Error('Failed to load Google Maps API'));
    };

    document.head.appendChild(script);
  });
}

/**
 * Converts date to ISO format (YYYY-MM-DD)
 */
function dateToISO(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Shows error state for an input element
 */
function showError(element) {
  if (!element) return;
  element.classList.add(SELECTORS.errorClass);
  const errorElement = element.parentElement?.querySelector(SELECTORS.errorElement);
  if (errorElement) errorElement.style.display = 'block';
}

/**
 * Clears error state for an input element
 */
function clearError(element) {
  if (!element) return;
  element.classList.remove(SELECTORS.errorClass);
  const errorElement = element.parentElement?.querySelector(SELECTORS.errorElement);
  if (errorElement) errorElement.style.display = 'none';
}

/**
 * Clears all error states on page load
 */
function clearAllErrors() {
  document.querySelectorAll(SELECTORS.inputField).forEach((field) => {
    field.classList.remove(SELECTORS.errorClass);
  });
  document.querySelectorAll(SELECTORS.errorElement).forEach((error) => {
    error.style.display = 'none';
  });
  log('Page loaded, error states cleared');
}

/**
 * Gets document language and returns appropriate locale
 */
function getLocale() {
  const docLang = document.documentElement.lang || 'en';
  const locales = { nl, de, en };
  return (locales[docLang.toLowerCase()] || en).default;
}

// ============================================================================
// MAIN APPLICATION
// ============================================================================

window.Webflow ||= [];
window.Webflow.push(() => {
  // Clear error states on page load
  clearAllErrors();

  // Get locale for date picker
  const locale = getLocale();

  // Set cargo_date to readonly
  const cargoDateInput = document.getElementById(SELECTORS.dateInput);
  if (cargoDateInput) {
    cargoDateInput.readOnly = true;
    cargoDateInput.style.cursor = 'pointer';
  }

  // Store the ISO date format for URL submission
  let selectedDateISO = '';

  // Initialize date picker
  new AirDatepicker(`#${SELECTORS.dateInput}`, {
    locale,
    firstDay: 1,
    dateFormat: DATE_DISPLAY_FORMAT,
    minDate: new Date(Date.now() + DATE_MIN_OFFSET_DAYS * 24 * 60 * 60 * 1000),
    maxDate: new Date(Date.now() + DATE_MAX_OFFSET_DAYS * 24 * 60 * 60 * 1000),
    toggleSelected: false,
    container: SELECTORS.dateContainer,
    autoClose: true,
    minView: 'days',
    position: 'bottom right',
    onSelect: function ({ date, formattedDate }) {
      if (date) {
        selectedDateISO = dateToISO(date);
        log('Date selected:', formattedDate, '(ISO:', selectedDateISO + ')');
      }
      clearError(cargoDateInput);
    },
  });

  // ============================================================================
  // LOCATION AUTOCOMPLETE
  // ============================================================================

  const originResults = [];
  const destinationResults = [];
  let mapsAPILoaded = false;
  let mapsAPILoading = false;

  /**
   * Initializes autocomplete for origin/destination inputs
   */
  function initAutocomplete(inputId, resultsArray, dropdownElement) {
    const input = document.getElementById(inputId);
    if (!input || !dropdownElement) {
      console.error('Input or dropdown not found for', inputId);
      return null;
    }

    let sessionToken = null;
    let debounceTimer = null;
    let isLoading = false;
    let selectedFromDropdown = false;
    let focusedOptionIndex = -1;

    const template = dropdownElement.querySelector(SELECTORS.dropdownLink);
    if (!template) {
      console.error('Template not found for', inputId);
      return null;
    }

    // Setup ARIA attributes
    const dropdownId = `${inputId}_dropdown_list`;
    dropdownElement.id = dropdownId;
    dropdownElement.setAttribute('role', 'listbox');
    dropdownElement.setAttribute('aria-label', ARIA_LABELS.locationSuggestions);
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-controls', dropdownId);
    input.setAttribute('aria-expanded', 'false');
    dropdownElement.style.display = 'none';

    // Dropdown control functions
    const openDropdown = () => {
      dropdownElement.style.display = 'block';
      input.setAttribute('aria-expanded', 'true');
      focusedOptionIndex = -1;
      log(inputId, 'dropdown opened');
    };

    const closeDropdown = () => {
      dropdownElement.style.display = 'none';
      input.setAttribute('aria-expanded', 'false');
      focusedOptionIndex = -1;
      log(inputId, 'dropdown closed');
    };

    // Validation function
    const validateInput = () => {
      const value = input.value.trim();
      const isValid = selectedFromDropdown || resultsArray.some((r) => r.combination === value);

      if (!isValid && value.length > 0) {
        showError(input);
        log(inputId, 'validation failed');
      } else {
        clearError(input);
        log(inputId, 'validation passed');
      }

      return isValid;
    };

    // Focus option by index
    const focusOption = (index) => {
      const options = dropdownElement.querySelectorAll(
        `${SELECTORS.dropdownLink}:not([style*="display: none"])`
      );

      options.forEach((opt) => {
        opt.style.backgroundColor = DROPDOWN_STYLES.defaultBackground;
        opt.setAttribute('aria-selected', 'false');
      });

      if (index >= 0 && index < options.length) {
        focusedOptionIndex = index;
        options[index].style.backgroundColor = DROPDOWN_STYLES.focusedBackground;
        options[index].setAttribute('aria-selected', 'true');
        options[index].scrollIntoView({ block: 'nearest' });
        input.setAttribute('aria-activedescendant', options[index].id);
      } else {
        focusedOptionIndex = -1;
        input.removeAttribute('aria-activedescendant');
      }
    };

    // Perform search
    const performSearch = async (value) => {
      if (isLoading) return;

      isLoading = true;
      log(inputId, 'searching for:', value);

      if (!sessionToken) {
        sessionToken = new google.maps.places.AutocompleteSessionToken();
      }

      try {
        const result = await google.maps.places.AutocompleteSuggestion.fetchAutocompleteSuggestions(
          {
            input: value,
            sessionToken,
          }
        );

        const suggestions = result.suggestions;
        if (!suggestions || suggestions.length === 0) {
          isLoading = false;
          closeDropdown();
          log(inputId, 'no suggestions found');
          return;
        }

        const promises = suggestions.map((suggestion) => {
          const place = suggestion.placePrediction.toPlace();
          return place.fetchFields({ fields: ['addressComponents'] });
        });

        const results = await Promise.all(promises);
        resultsArray.length = 0;

        const uniqueCombinations = new Set();

        results.forEach((result) => {
          const place = result.place;
          let city = null;
          let country = null;

          if (place.addressComponents) {
            place.addressComponents.forEach((component) => {
              const types = component.types;

              if (types.includes('locality')) {
                city = component.longText;
              } else if (!city && types.includes('postal_town')) {
                city = component.longText;
              } else if (!city && types.includes('administrative_area_level_2')) {
                city = component.longText;
              }

              if (types.includes('country')) {
                country = component.longText;
              }
            });
          }

          if (city && country) {
            const combination = `${city}, ${country}`;
            if (!uniqueCombinations.has(combination)) {
              uniqueCombinations.add(combination);
              resultsArray.push({ city, country, combination });
            }
          }
        });

        // Clear and display results
        const links = dropdownElement.querySelectorAll(SELECTORS.dropdownLink);
        links.forEach((link, index) => {
          if (index > 0) link.remove();
        });

        displayResults(
          dropdownElement,
          template,
          resultsArray,
          input,
          openDropdown,
          closeDropdown,
          selectedFromDropdown
        );

        log(inputId, 'found', resultsArray.length, 'results');

        sessionToken = new google.maps.places.AutocompleteSessionToken();
        isLoading = false;
      } catch (error) {
        console.error('Error fetching place details:', error);
        isLoading = false;
        closeDropdown();
      }
    };

    // Event: Focus
    input.addEventListener('focus', async function () {
      this.select();

      if (!mapsAPILoaded && !mapsAPILoading) {
        mapsAPILoading = true;
        try {
          await loadGoogleMapsAPI();
          mapsAPILoaded = true;
          mapsAPILoading = false;
        } catch (error) {
          console.error('Failed to load Google Maps API:', error);
          mapsAPILoading = false;
          return;
        }
      }

      if (resultsArray.length > 0) {
        openDropdown();
      }
      log(inputId, 'input focused');
    });

    // Event: Blur
    input.addEventListener('blur', () => {
      setTimeout(() => {
        if (!dropdownElement.contains(document.activeElement)) {
          closeDropdown();
        }
      }, DROPDOWN_CLOSE_DELAY_MS);
    });

    // Event: Keydown
    input.addEventListener('keydown', (e) => {
      const isOpen = dropdownElement.style.display === 'block';
      const options = dropdownElement.querySelectorAll(
        `${SELECTORS.dropdownLink}:not([style*="display: none"])`
      );

      if (e.key === ' ' || e.keyCode === 32) {
        e.stopPropagation();
      }

      if (e.key === 'Escape' || e.key === 'Tab') {
        closeDropdown();
        return;
      }

      if (isOpen && options.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          focusOption((focusedOptionIndex + 1) % options.length);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          focusOption(focusedOptionIndex <= 0 ? options.length - 1 : focusedOptionIndex - 1);
        } else if (e.key === 'Enter' && focusedOptionIndex >= 0) {
          e.preventDefault();
          const selectedOption = options[focusedOptionIndex];
          const cityText = selectedOption.querySelector(SELECTORS.dropdownCity)?.textContent;
          const countryText = selectedOption.querySelector(SELECTORS.dropdownCountry)?.textContent;
          if (cityText && countryText) {
            input.value = `${cityText}, ${countryText}`;
            selectedFromDropdown = true;
            closeDropdown();
            validateInput();
            log(inputId, 'selected via keyboard:', input.value);
          }
        }
      }
    });

    // Event: Input
    input.addEventListener('input', function () {
      const value = input.value;
      selectedFromDropdown = false;
      clearError(input);

      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }

      if (value.length < MIN_SEARCH_CHARACTERS) {
        debounceTimer = setTimeout(() => {
          resultsArray.length = 0;
          const links = dropdownElement.querySelectorAll(SELECTORS.dropdownLink);
          links.forEach((link, index) => {
            if (index > 0) link.remove();
          });
          closeDropdown();
        }, SEARCH_DEBOUNCE_MS);
        return;
      }

      if (!mapsAPILoaded) {
        log(inputId, 'waiting for Google Maps API to load...');
        return;
      }

      debounceTimer = setTimeout(() => {
        performSearch(value);
      }, SEARCH_DEBOUNCE_MS);
    });

    // Event: Click outside
    document.addEventListener('click', (e) => {
      if (!input.contains(e.target) && !dropdownElement.contains(e.target)) {
        closeDropdown();
      }
    });

    return validateInput;
  }

  /**
   * Displays results in dropdown
   */
  function displayResults(
    dropdownElement,
    template,
    resultsArray,
    input,
    openDropdown,
    closeDropdown
  ) {
    if (resultsArray.length === 0) {
      closeDropdown();
      return;
    }

    template.style.display = 'none';

    resultsArray.forEach((result, index) => {
      const item = template.cloneNode(true);
      item.style.display = 'block';
      item.setAttribute('role', 'option');
      item.setAttribute('id', `${dropdownElement.id}_option_${index}`);
      item.setAttribute('aria-selected', 'false');
      item.setAttribute('tabindex', '-1');

      const cityElement = item.querySelector(SELECTORS.dropdownCity);
      const countryElement = item.querySelector(SELECTORS.dropdownCountry);

      if (cityElement) cityElement.textContent = result.city;
      if (countryElement) countryElement.textContent = result.country;

      item.addEventListener('mouseenter', () => {
        item.style.backgroundColor = DROPDOWN_STYLES.focusedBackground;
      });

      item.addEventListener('mouseleave', () => {
        item.style.backgroundColor = DROPDOWN_STYLES.defaultBackground;
      });

      item.addEventListener('click', () => {
        input.value = result.combination;
        input.dispatchEvent(new Event('selected-from-dropdown'));
        closeDropdown();
        clearError(input);
        log('User selected from dropdown:', result.combination);
      });

      dropdownElement.appendChild(item);
    });

    openDropdown();
  }

  // ============================================================================
  // CARGO TYPE DROPDOWN
  // ============================================================================

  /**
   * Initializes cargo type dropdown
   */
  function initCargoTypeDropdown() {
    const cargoSelect = document.getElementById(SELECTORS.cargoTypeSelect);
    const cargoInput = document.getElementById(SELECTORS.cargoTypeDisplay);
    const cargoFieldContainer = cargoInput?.parentElement;
    const cargoDropdown = cargoFieldContainer?.querySelector(SELECTORS.dropdown);

    if (!cargoSelect || !cargoInput || !cargoDropdown) {
      console.error('Cargo type elements not found');
      return null;
    }

    let focusedOptionIndex = -1;

    cargoInput.readOnly = true;
    cargoInput.style.cursor = 'pointer';
    cargoInput.setAttribute('role', 'combobox');
    cargoInput.setAttribute('aria-autocomplete', 'list');
    cargoInput.setAttribute('aria-expanded', 'false');
    cargoInput.placeholder = 'Select cargo type';

    cargoSelect.style.display = 'none';

    const template = cargoDropdown.querySelector(SELECTORS.dropdownLink);
    if (!template) {
      console.error('Template not found for cargo type');
      return null;
    }

    const dropdownId = 'cargo_type_dropdown_list';
    cargoDropdown.id = dropdownId;
    cargoDropdown.setAttribute('role', 'listbox');
    cargoDropdown.setAttribute('aria-label', ARIA_LABELS.cargoTypeOptions);
    cargoInput.setAttribute('aria-controls', dropdownId);
    cargoDropdown.style.display = 'none';

    const openDropdown = () => {
      cargoDropdown.style.display = 'block';
      cargoInput.setAttribute('aria-expanded', 'true');
      focusedOptionIndex = -1;
      log('Cargo type dropdown opened');
    };

    const closeDropdown = () => {
      cargoDropdown.style.display = 'none';
      cargoInput.setAttribute('aria-expanded', 'false');
      focusedOptionIndex = -1;
      log('Cargo type dropdown closed');
    };

    const focusOption = (index) => {
      const options = cargoDropdown.querySelectorAll(
        `${SELECTORS.dropdownLink}:not([style*="display: none"])`
      );

      options.forEach((opt) => {
        opt.style.backgroundColor = DROPDOWN_STYLES.defaultBackground;
        opt.setAttribute('aria-selected', 'false');
      });

      if (index >= 0 && index < options.length) {
        focusedOptionIndex = index;
        options[index].style.backgroundColor = DROPDOWN_STYLES.focusedBackground;
        options[index].setAttribute('aria-selected', 'true');
        options[index].scrollIntoView({ block: 'nearest' });
        cargoInput.setAttribute('aria-activedescendant', options[index].id);
      } else {
        focusedOptionIndex = -1;
        cargoInput.removeAttribute('aria-activedescendant');
      }
    };

    const validateCargoType = () => {
      const isValid = cargoInput.value.trim().length > 0;

      if (!isValid) {
        showError(cargoInput);
        log('Cargo type validation failed');
      } else {
        clearError(cargoInput);
        log('Cargo type validation passed');
      }

      return isValid;
    };

    const populateDropdown = () => {
      const links = cargoDropdown.querySelectorAll(SELECTORS.dropdownLink);
      links.forEach((link, index) => {
        if (index > 0) link.remove();
      });

      template.style.display = 'none';

      const options = cargoSelect.querySelectorAll('option');

      options.forEach((option, index) => {
        const item = template.cloneNode(true);
        item.style.display = 'block';
        item.setAttribute('role', 'option');
        item.setAttribute('id', `${dropdownId}_option_${index}`);
        item.setAttribute('aria-selected', 'false');
        item.setAttribute('data-value', option.value);
        item.setAttribute('tabindex', '-1');

        const cityElement = item.querySelector(SELECTORS.dropdownCity);
        const countryElement = item.querySelector(SELECTORS.dropdownCountry);

        if (cityElement) {
          cityElement.textContent = option.textContent;
          cityElement.style.marginBottom = '0';
        }
        if (countryElement) {
          countryElement.style.display = 'none';
        }

        item.addEventListener('mouseenter', () => {
          item.style.backgroundColor = DROPDOWN_STYLES.focusedBackground;
        });

        item.addEventListener('mouseleave', () => {
          item.style.backgroundColor = DROPDOWN_STYLES.defaultBackground;
        });

        item.addEventListener('click', () => {
          cargoInput.value = option.textContent;
          cargoSelect.value = option.value;
          closeDropdown();
          validateCargoType();
          log('User selected cargo type:', option.value, '-', option.textContent);
        });

        cargoDropdown.appendChild(item);
      });
    };

    populateDropdown();
    log('Cargo type dropdown initialized without default selection');

    // Event: Click
    cargoInput.addEventListener('click', () => {
      if (cargoDropdown.style.display === 'none') {
        openDropdown();
      } else {
        closeDropdown();
      }
    });

    // Event: Keydown
    cargoInput.addEventListener('keydown', (e) => {
      const isOpen = cargoDropdown.style.display === 'block';
      const options = cargoDropdown.querySelectorAll(
        `${SELECTORS.dropdownLink}:not([style*="display: none"])`
      );

      if (e.key === ' ' || e.keyCode === 32) {
        e.preventDefault();
        e.stopPropagation();
        isOpen ? closeDropdown() : openDropdown();
        return;
      }

      if (e.key === 'Escape' || e.key === 'Tab') {
        closeDropdown();
        return;
      }

      if (isOpen && options.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          focusOption((focusedOptionIndex + 1) % options.length);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          focusOption(focusedOptionIndex <= 0 ? options.length - 1 : focusedOptionIndex - 1);
        } else if (e.key === 'Enter' && focusedOptionIndex >= 0) {
          e.preventDefault();
          const selectedOption = options[focusedOptionIndex];
          const value = selectedOption.getAttribute('data-value');
          const text = selectedOption.querySelector(SELECTORS.dropdownCity)?.textContent;
          if (value && text) {
            cargoInput.value = text;
            cargoSelect.value = value;
            closeDropdown();
            validateCargoType();
            log('User selected cargo type via keyboard:', value, '-', text);
          }
        }
      }
    });

    // Event: Blur
    cargoInput.addEventListener('blur', () => {
      setTimeout(closeDropdown, DROPDOWN_CLOSE_DELAY_MS);
    });

    // Event: Click outside
    document.addEventListener('click', (e) => {
      if (!cargoInput.contains(e.target) && !cargoDropdown.contains(e.target)) {
        closeDropdown();
      }
    });

    return validateCargoType;
  }

  // ============================================================================
  // TRANSPORT MODES
  // ============================================================================

  /**
   * Gets all selected transport modes
   */
  function getTransportModes() {
    return TRANSPORT_MODES.filter((option) => document.getElementById(option.id)?.checked).map(
      (option) => option.value
    );
  }

  /**
   * Validates transport modes selection
   */
  function validateTransportModes() {
    const transportModes = getTransportModes();
    const isValid = transportModes.length > 0;

    TRANSPORT_MODES.forEach((option) => {
      const checkbox = document.getElementById(option.id);
      if (checkbox) {
        const container = checkbox.closest(SELECTORS.cargoField);
        if (container) {
          const errorElement = container.querySelector(SELECTORS.errorElement);
          if (errorElement) {
            errorElement.style.display = isValid ? 'none' : 'block';
          }
        }
      }
    });

    log(isValid ? 'Transport mode validation passed' : 'Transport mode validation failed');
    return isValid;
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  const originInput = document.getElementById(SELECTORS.originInput);
  const destinationInput = document.getElementById(SELECTORS.destinationInput);
  const originDropdown = originInput?.parentElement?.querySelector(SELECTORS.dropdown);
  const destinationDropdown = destinationInput?.parentElement?.querySelector(SELECTORS.dropdown);

  const validateOrigin =
    originInput && originDropdown
      ? initAutocomplete(SELECTORS.originInput, originResults, originDropdown)
      : null;

  const validateDestination =
    destinationInput && destinationDropdown
      ? initAutocomplete(SELECTORS.destinationInput, destinationResults, destinationDropdown)
      : null;

  const validateCargoType = initCargoTypeDropdown();

  // Add change listeners for transport modes
  TRANSPORT_MODES.forEach((option) => {
    const checkbox = document.getElementById(option.id);
    if (checkbox) {
      checkbox.addEventListener('change', () => {
        log('Transport modes changed:', getTransportModes());
      });
    }
  });

  // ============================================================================
  // FORM SUBMISSION
  // ============================================================================

  /**
   * Handles form submission
   */
  function handleSubmit(event) {
    event.preventDefault();
    log('User clicked submit button');

    const origin = originInput?.value || '';
    const destination = destinationInput?.value || '';
    const containerType = document.getElementById(SELECTORS.cargoTypeSelect)?.value || '';
    const transportDate = selectedDateISO || '';
    const transportModes = getTransportModes();

    let isValid = true;

    // Validate origin
    if (validateOrigin && !validateOrigin()) {
      showError(originInput);
      isValid = false;
    } else if (!origin) {
      showError(originInput);
      isValid = false;
    }

    // Validate destination
    if (validateDestination && !validateDestination()) {
      showError(destinationInput);
      isValid = false;
    } else if (!destination) {
      showError(destinationInput);
      isValid = false;
    }

    // Validate cargo type
    if (validateCargoType && !validateCargoType()) {
      isValid = false;
    } else if (!containerType) {
      showError(document.getElementById(SELECTORS.cargoTypeDisplay));
      isValid = false;
    }

    // Validate date
    if (!transportDate) {
      showError(cargoDateInput);
      isValid = false;
    }

    // Validate transport modes
    if (!validateTransportModes()) {
      isValid = false;
    }

    if (!isValid) {
      log('Form validation failed:', {
        origin: origin || 'MISSING',
        destination: destination || 'MISSING',
        containerType: containerType || 'MISSING',
        transportDate: transportDate || 'MISSING',
        transportModes: transportModes.length > 0 ? transportModes : 'MISSING',
      });
      return;
    }

    log('Form validation passed');

    // Get redirect URL from button
    const submitButton = document.querySelector(SELECTORS.submitButton);
    const baseUrl = submitButton?.getAttribute('href') || DEFAULT_REDIRECT_URL;

    // Build URL parameters
    const params = new URLSearchParams();
    params.append('origin', origin);
    params.append('destination', destination);
    params.append('transportDate', transportDate);
    params.append('transportMode', transportModes.join(','));

    // Handle containerType based on configuration
    const containerTypeLower = containerType.toLowerCase();
    if (!CONTAINER_TYPES.excludeFromUrl.includes(containerTypeLower)) {
      if (CONTAINER_TYPES.emptyValue.includes(containerTypeLower)) {
        params.append('containerType', '');
      } else {
        params.append('containerType', containerType);
      }
    }

    // Construct final URL
    const finalUrl = `${baseUrl}?${params.toString()}`;

    log('Final URL constructed:', finalUrl);
    log('Form data:', {
      origin,
      destination,
      containerType,
      transportDate,
      transportModes,
    });
    log('Redirecting user...');

    // Redirect to the new page
    window.location.href = finalUrl;
  }

  // Attach submit handler
  const submitButton = document.querySelector(SELECTORS.submitButton);
  if (submitButton) {
    submitButton.addEventListener('click', handleSubmit);
    log('Submit button listener attached');
  } else {
    console.error('Submit button not found');
  }
});
