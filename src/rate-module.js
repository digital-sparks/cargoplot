import AirDatepicker from 'air-datepicker';
import en from 'air-datepicker/locale/en';
import nl from 'air-datepicker/locale/nl';
import de from 'air-datepicker/locale/de';
import 'air-datepicker/air-datepicker.css';

// ============================================================================
// CONFIGURATION VARIABLES
// ============================================================================

// Test Mode - Set to true to enable detailed console logging
const TEST_MODE = false;

// Google Maps API Configuration
const GOOGLE_MAPS_API_KEY = 'AIzaSyA3LzIwr4sbLguFgF02W7QguXG1Y2wv7fQ';
const GOOGLE_MAPS_LIBRARIES = 'places';
const GOOGLE_MAPS_VERSION = 'beta';

// Search Configuration
const MIN_SEARCH_CHARACTERS = 2;
const SEARCH_DEBOUNCE_MS = 300;

// Date Configuration
const DATE_DISPLAY_FORMAT = 'dd-MM-yyyy'; // User-friendly format
const DATE_URL_FORMAT = 'yyyy-MM-dd'; // ISO format for URL
const DATE_MIN_OFFSET_DAYS = 0;
const DATE_MAX_OFFSET_DAYS = 3650;

// Data Attributes (replacing IDs)
const DATA_ATTRS = {
  // Module container
  module: 'cargo-module',

  // Input fields
  originInput: 'cargo-origin',
  destinationInput: 'cargo-destination',
  cargoTypeSelect: 'cargo-type',
  cargoTypeDisplay: 'cargo-type-display',
  dateInput: 'cargo-date',

  // Checkboxes
  seaCheckbox: 'cargo-option-sea',
  airCheckbox: 'cargo-option-air',
  trainCheckbox: 'cargo-option-train',

  // Submit button
  submitButton: 'cargo_submit',

  // Dropdown elements
  dropdown: 'dropdown',
  dropdownLink: 'dropdown-link',
  dropdownCity: 'city',
  dropdownCountry: 'country',

  // Error handling
  errorElement: 'cargo-field-error',
  inputField: 'cargo-input-field',
  cargoField: 'cargo-field',
  dateContainer: 'cargo-date-container',
};

// Transport Mode Options
const TRANSPORT_MODES = [
  { attr: DATA_ATTRS.seaCheckbox, value: 'sea' },
  { attr: DATA_ATTRS.airCheckbox, value: 'air' },
  { attr: DATA_ATTRS.trainCheckbox, value: 'rail' },
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
const DROPDOWN_JUST_OPENED_DELAY_MS = 50;
const DROPDOWN_STYLES = {
  focusedBackground: '#f5f5f5',
  defaultBackground: 'white',
};

// ARIA Labels
const ARIA_LABELS = {
  locationSuggestions: 'Location suggestions',
  cargoTypeOptions: 'Cargo type options',
};

// CSS Classes
const CSS_CLASSES = {
  error: 'is-error',
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
 * Gets document language and returns appropriate locale
 */
function getLocale() {
  const docLang = document.documentElement.lang || 'en';
  const locales = { nl, de, en };
  const langCode = docLang.toLowerCase().split('-')[0];
  return (locales[langCode] || en).default;
}

/**
 * Generates a unique ID for elements within a module
 */
function generateUniqueId(moduleIndex, prefix) {
  return `${prefix}_${moduleIndex}_${Date.now()}`;
}

// ============================================================================
// SHARED GOOGLE MAPS API STATE
// ============================================================================

let mapsAPILoaded = false;
let mapsAPILoading = false;

// ============================================================================
// MODULE CLASS
// ============================================================================

class CargoFormModule {
  constructor(moduleElement, moduleIndex) {
    this.module = moduleElement;
    this.moduleIndex = moduleIndex;
    this.selectedDateISO = '';
    this.originResults = [];
    this.destinationResults = [];
    this.eventHandlers = []; // Track handlers for cleanup

    // Find all elements within this module
    this.elements = this.findElements();

    // Initialize if all required elements are found
    if (this.validateElements()) {
      this.init();
    } else {
      console.error(`Module ${moduleIndex}: Missing required elements`);
    }
  }

  /**
   * Find all elements within this module using data attributes
   */
  findElements() {
    const find = (attr) => this.module.querySelector(`[data-${attr}]`);
    const findAll = (attr) => this.module.querySelectorAll(`[data-${attr}]`);
    const findSubmit = (attr) => this.module.querySelector(`[data-button-click="${attr}"]`);

    return {
      originInput: find(DATA_ATTRS.originInput),
      destinationInput: find(DATA_ATTRS.destinationInput),
      cargoTypeSelect: find(DATA_ATTRS.cargoTypeSelect),
      cargoTypeDisplay: find(DATA_ATTRS.cargoTypeDisplay),
      dateInput: find(DATA_ATTRS.dateInput),
      seaCheckbox: find(DATA_ATTRS.seaCheckbox),
      airCheckbox: find(DATA_ATTRS.airCheckbox),
      trainCheckbox: find(DATA_ATTRS.trainCheckbox),
      submitButton: findSubmit(DATA_ATTRS.submitButton),
      inputFields: findAll(DATA_ATTRS.inputField),
      errorElements: findAll(DATA_ATTRS.errorElement),
    };
  }

  /**
   * Validate that all required elements exist
   */
  validateElements() {
    const required = [
      'originInput',
      'destinationInput',
      'cargoTypeSelect',
      'cargoTypeDisplay',
      'dateInput',
      'submitButton',
    ];

    return required.every((key) => this.elements[key]);
  }

  /**
   * Initialize the module
   */
  init() {
    log(`Module ${this.moduleIndex}: Initializing`);

    this.clearAllErrors();
    this.initDatePicker();
    this.initAutocomplete();
    this.initCargoTypeDropdown();
    this.initTransportModeListeners();
    this.initSubmitHandler();

    log(`Module ${this.moduleIndex}: Initialized successfully`);
  }

  /**
   * Add event handler and track it for cleanup
   */
  addEventHandler(element, event, handler, options) {
    element.addEventListener(event, handler, options);
    this.eventHandlers.push({ element, event, handler, options });
  }

  /**
   * Clean up all event handlers (for potential future use)
   */
  cleanup() {
    this.eventHandlers.forEach(({ element, event, handler, options }) => {
      element.removeEventListener(event, handler, options);
    });
    this.eventHandlers = [];
    log(`Module ${this.moduleIndex}: Cleaned up`);
  }

  /**
   * Clear all error states
   */
  clearAllErrors() {
    this.elements.inputFields.forEach((field) => {
      field.classList.remove(CSS_CLASSES.error);
    });
    this.elements.errorElements.forEach((error) => {
      error.style.display = 'none';
    });
    log(`Module ${this.moduleIndex}: Error states cleared`);
  }

  /**
   * Show error state for an input element
   */
  showError(element) {
    if (!element) return;
    element.classList.add(CSS_CLASSES.error);
    const cargoField = element.closest('.cargo_field');
    const errorElement = cargoField?.querySelector(`[data-${DATA_ATTRS.errorElement}]`);
    if (errorElement) errorElement.style.display = 'block';
  }

  /**
   * Clear error state for an input element
   */
  clearError(element) {
    if (!element) return;
    element.classList.remove(CSS_CLASSES.error);
    const cargoField = element.closest('.cargo_field');
    const errorElement = cargoField?.querySelector(`[data-${DATA_ATTRS.errorElement}]`);
    if (errorElement) errorElement.style.display = 'none';
  }

  /**
   * Initialize date picker
   */
  initDatePicker() {
    const dateInput = this.elements.dateInput;
    dateInput.readOnly = true;
    dateInput.style.cursor = 'pointer';

    // Try to find date container, fallback to parent field
    const dateContainer =
      dateInput.closest(`[data-${DATA_ATTRS.dateContainer}]`) || dateInput.closest('.cargo_field');

    const locale = getLocale();

    new AirDatepicker(dateInput, {
      locale,
      firstDay: 1,
      dateFormat: DATE_DISPLAY_FORMAT,
      minDate: new Date(Date.now() + DATE_MIN_OFFSET_DAYS * 24 * 60 * 60 * 1000),
      maxDate: new Date(Date.now() + DATE_MAX_OFFSET_DAYS * 24 * 60 * 60 * 1000),
      toggleSelected: false,
      container: dateContainer,
      autoClose: true,
      minView: 'days',
      position: 'bottom right',
      onSelect: ({ date, formattedDate }) => {
        if (date) {
          this.selectedDateISO = dateToISO(date);
          log(
            `Module ${this.moduleIndex}: Date selected:`,
            formattedDate,
            '(ISO:',
            this.selectedDateISO + ')'
          );
        }
        this.clearError(dateInput);
      },
    });

    log(`Module ${this.moduleIndex}: Date picker initialized`);
  }

  /**
   * Initialize location autocomplete
   */
  initAutocomplete() {
    const originFieldWrap = this.elements.originInput.closest('.cargo_input-field-wrap');
    const destinationFieldWrap = this.elements.destinationInput.closest('.cargo_input-field-wrap');

    const originDropdown = originFieldWrap?.parentElement.querySelector(
      `[data-${DATA_ATTRS.dropdown}]`
    );
    const destinationDropdown = destinationFieldWrap?.parentElement.querySelector(
      `[data-${DATA_ATTRS.dropdown}]`
    );

    this.validateOrigin = this.createAutocomplete(
      this.elements.originInput,
      this.originResults,
      originDropdown,
      'origin'
    );

    this.validateDestination = this.createAutocomplete(
      this.elements.destinationInput,
      this.destinationResults,
      destinationDropdown,
      'destination'
    );

    log(`Module ${this.moduleIndex}: Autocomplete initialized`);
  }

  /**
   * Create autocomplete for a location input
   */
  createAutocomplete(input, resultsArray, dropdownElement, fieldName) {
    if (!input || !dropdownElement) {
      console.error(`Module ${this.moduleIndex}: Input or dropdown not found for ${fieldName}`);
      return null;
    }

    let sessionToken = null;
    let debounceTimer = null;
    let isLoading = false;
    let selectedFromDropdown = false;
    let focusedOptionIndex = -1;

    const template = dropdownElement.querySelector(`[data-${DATA_ATTRS.dropdownLink}]`);
    if (!template) {
      console.error(`Module ${this.moduleIndex}: Template not found for ${fieldName}`);
      return null;
    }

    // Setup ARIA attributes with unique IDs
    const dropdownId = generateUniqueId(this.moduleIndex, `${fieldName}_dropdown`);
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
      log(`Module ${this.moduleIndex}: ${fieldName} dropdown opened`);
    };

    const closeDropdown = () => {
      dropdownElement.style.display = 'none';
      input.setAttribute('aria-expanded', 'false');
      focusedOptionIndex = -1;
      log(`Module ${this.moduleIndex}: ${fieldName} dropdown closed`);
    };

    // Validation function
    const validateInput = () => {
      const value = input.value.trim();
      const isValid = selectedFromDropdown || resultsArray.some((r) => r.combination === value);

      if (!isValid && value.length > 0) {
        this.showError(input);
        log(`Module ${this.moduleIndex}: ${fieldName} validation failed`);
      } else {
        this.clearError(input);
        log(`Module ${this.moduleIndex}: ${fieldName} validation passed`);
      }

      return isValid;
    };

    // Focus option by index
    const focusOption = (index) => {
      const options = dropdownElement.querySelectorAll(
        `[data-${DATA_ATTRS.dropdownLink}]:not([style*="display: none"])`
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
      log(`Module ${this.moduleIndex}: ${fieldName} searching for:`, value);

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
          log(`Module ${this.moduleIndex}: ${fieldName} no suggestions found`);
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
        const links = dropdownElement.querySelectorAll(`[data-${DATA_ATTRS.dropdownLink}]`);
        links.forEach((link, index) => {
          if (index > 0) link.remove();
        });

        this.displayResults(
          dropdownElement,
          template,
          resultsArray,
          input,
          openDropdown,
          closeDropdown,
          dropdownId
        );

        log(`Module ${this.moduleIndex}: ${fieldName} found`, resultsArray.length, 'results');

        sessionToken = new google.maps.places.AutocompleteSessionToken();
        isLoading = false;
      } catch (error) {
        console.error(`Module ${this.moduleIndex}: Error fetching place details:`, error);
        isLoading = false;
        closeDropdown();
      }
    };

    // Event: Focus
    const handleFocus = async function () {
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
    };
    this.addEventHandler(input, 'focus', handleFocus);

    // Event: Blur
    const handleBlur = () => {
      setTimeout(() => {
        if (!dropdownElement.contains(document.activeElement)) {
          closeDropdown();
        }
      }, DROPDOWN_CLOSE_DELAY_MS);
    };
    this.addEventHandler(input, 'blur', handleBlur);

    // Event: Keydown
    const handleKeydown = (e) => {
      const isOpen = dropdownElement.style.display === 'block';
      const options = dropdownElement.querySelectorAll(
        `[data-${DATA_ATTRS.dropdownLink}]:not([style*="display: none"])`
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
          const cityText = selectedOption.querySelector(
            `[data-${DATA_ATTRS.dropdownCity}]`
          )?.textContent;
          const countryText = selectedOption.querySelector(
            `[data-${DATA_ATTRS.dropdownCountry}]`
          )?.textContent;
          if (cityText && countryText) {
            input.value = `${cityText}, ${countryText}`;
            selectedFromDropdown = true;
            closeDropdown();
            validateInput();
            log(`Module ${this.moduleIndex}: ${fieldName} selected via keyboard:`, input.value);
          }
        }
      }
    };
    this.addEventHandler(input, 'keydown', handleKeydown);

    // Event: Input
    const handleInput = () => {
      const value = input.value;
      selectedFromDropdown = false;
      this.clearError(input);

      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }

      if (value.length < MIN_SEARCH_CHARACTERS) {
        debounceTimer = setTimeout(() => {
          resultsArray.length = 0;
          const links = dropdownElement.querySelectorAll(`[data-${DATA_ATTRS.dropdownLink}]`);
          links.forEach((link, index) => {
            if (index > 0) link.remove();
          });
          closeDropdown();
        }, SEARCH_DEBOUNCE_MS);
        return;
      }

      if (!mapsAPILoaded) {
        log(`Module ${this.moduleIndex}: ${fieldName} waiting for Google Maps API to load...`);
        return;
      }

      debounceTimer = setTimeout(() => {
        performSearch(value);
      }, SEARCH_DEBOUNCE_MS);
    };
    this.addEventHandler(input, 'input', handleInput);

    // Event: Click outside
    const handleClickOutside = (e) => {
      if (!input.contains(e.target) && !dropdownElement.contains(e.target)) {
        closeDropdown();
      }
    };
    this.addEventHandler(document, 'click', handleClickOutside);

    return validateInput;
  }

  /**
   * Display results in dropdown
   */
  displayResults(
    dropdownElement,
    template,
    resultsArray,
    input,
    openDropdown,
    closeDropdown,
    dropdownId
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
      item.setAttribute('id', `${dropdownId}_option_${index}`);
      item.setAttribute('aria-selected', 'false');
      item.setAttribute('tabindex', '-1');

      const cityElement = item.querySelector(`[data-${DATA_ATTRS.dropdownCity}]`);
      const countryElement = item.querySelector(`[data-${DATA_ATTRS.dropdownCountry}]`);

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
        this.clearError(input);
        log(`Module ${this.moduleIndex}: User selected from dropdown:`, result.combination);
      });

      dropdownElement.appendChild(item);
    });

    openDropdown();
  }

  /**
   * Initialize cargo type dropdown
   */
  initCargoTypeDropdown() {
    const cargoSelect = this.elements.cargoTypeSelect;
    const cargoInput = this.elements.cargoTypeDisplay;
    const cargoField = cargoInput?.closest('.cargo_field');
    const cargoDropdown = cargoField?.querySelector(`[data-${DATA_ATTRS.dropdown}]`);

    if (!cargoSelect || !cargoInput || !cargoDropdown) {
      console.error(`Module ${this.moduleIndex}: Cargo type elements not found`);
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

    const template = cargoDropdown.querySelector(`[data-${DATA_ATTRS.dropdownLink}]`);
    if (!template) {
      console.error(`Module ${this.moduleIndex}: Template not found for cargo type`);
      return null;
    }

    const dropdownId = generateUniqueId(this.moduleIndex, 'cargo_type_dropdown');
    cargoDropdown.id = dropdownId;
    cargoDropdown.setAttribute('role', 'listbox');
    cargoDropdown.setAttribute('aria-label', ARIA_LABELS.cargoTypeOptions);
    cargoInput.setAttribute('aria-controls', dropdownId);
    cargoDropdown.style.display = 'none';

    const openDropdown = () => {
      cargoDropdown.style.display = 'block';
      cargoInput.setAttribute('aria-expanded', 'true');
      focusedOptionIndex = -1;
      log(`Module ${this.moduleIndex}: Cargo type dropdown opened`);

      // Prevent immediate closing by click-outside handler
      setTimeout(() => {
        cargoDropdown.setAttribute('data-just-opened', 'true');
      }, DROPDOWN_JUST_OPENED_DELAY_MS);
    };

    const closeDropdown = () => {
      cargoDropdown.style.display = 'none';
      cargoInput.setAttribute('aria-expanded', 'false');
      focusedOptionIndex = -1;
      log(`Module ${this.moduleIndex}: Cargo type dropdown closed`);
    };

    const focusOption = (index) => {
      const options = cargoDropdown.querySelectorAll(
        `[data-${DATA_ATTRS.dropdownLink}]:not([style*="display: none"])`
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
        this.showError(cargoInput);
        log(`Module ${this.moduleIndex}: Cargo type validation failed`);
      } else {
        this.clearError(cargoInput);
        log(`Module ${this.moduleIndex}: Cargo type validation passed`);
      }

      return isValid;
    };

    const populateDropdown = () => {
      const links = cargoDropdown.querySelectorAll(`[data-${DATA_ATTRS.dropdownLink}]`);
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

        const cityElement = item.querySelector(`[data-${DATA_ATTRS.dropdownCity}]`);
        const countryElement = item.querySelector(`[data-${DATA_ATTRS.dropdownCountry}]`);

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
          log(
            `Module ${this.moduleIndex}: User selected cargo type:`,
            option.value,
            '-',
            option.textContent
          );
        });

        cargoDropdown.appendChild(item);
      });
    };

    populateDropdown();
    log(`Module ${this.moduleIndex}: Cargo type dropdown initialized`);

    // Event: Click
    const handleClick = (e) => {
      e.stopPropagation();
      if (cargoDropdown.style.display === 'none') {
        openDropdown();
      } else {
        closeDropdown();
      }
    };
    this.addEventHandler(cargoInput, 'click', handleClick);

    // Event: Keydown
    const handleKeydown = (e) => {
      const isOpen = cargoDropdown.style.display === 'block';
      const options = cargoDropdown.querySelectorAll(
        `[data-${DATA_ATTRS.dropdownLink}]:not([style*="display: none"])`
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
          const text = selectedOption.querySelector(
            `[data-${DATA_ATTRS.dropdownCity}]`
          )?.textContent;
          if (value && text) {
            cargoInput.value = text;
            cargoSelect.value = value;
            closeDropdown();
            validateCargoType();
            log(
              `Module ${this.moduleIndex}: User selected cargo type via keyboard:`,
              value,
              '-',
              text
            );
          }
        }
      }
    };
    this.addEventHandler(cargoInput, 'keydown', handleKeydown);

    // Event: Blur
    const handleBlur = () => {
      setTimeout(closeDropdown, DROPDOWN_CLOSE_DELAY_MS);
    };
    this.addEventHandler(cargoInput, 'blur', handleBlur);

    // Event: Click outside
    const handleClickOutside = (e) => {
      // Don't close if dropdown was just opened
      if (cargoDropdown.getAttribute('data-just-opened') === 'true') {
        cargoDropdown.removeAttribute('data-just-opened');
        return;
      }

      if (!cargoInput.contains(e.target) && !cargoDropdown.contains(e.target)) {
        closeDropdown();
      }
    };
    this.addEventHandler(document, 'click', handleClickOutside);

    this.validateCargoType = validateCargoType;
  }

  /**
   * Get all selected transport modes
   */
  getTransportModes() {
    return TRANSPORT_MODES.filter((option) => {
      const checkbox = this.module.querySelector(`[data-${option.attr}]`);
      return checkbox?.checked;
    }).map((option) => option.value);
  }

  /**
   * Validate transport modes selection
   */
  validateTransportModes() {
    const transportModes = this.getTransportModes();
    const isValid = transportModes.length > 0;

    // Find the transport mode container and show/hide error
    const firstCheckbox = this.module.querySelector(`[data-${TRANSPORT_MODES[0].attr}]`);
    if (firstCheckbox) {
      const container =
        firstCheckbox.closest('.rate_bottom-row') || firstCheckbox.closest('.cargo_field');
      if (container) {
        const errorElement = container.querySelector(`[data-${DATA_ATTRS.errorElement}]`);
        if (errorElement) {
          errorElement.style.display = isValid ? 'none' : 'block';
        }
      }
    }

    log(
      `Module ${this.moduleIndex}:`,
      isValid ? 'Transport mode validation passed' : 'Transport mode validation failed'
    );
    return isValid;
  }

  /**
   * Initialize transport mode listeners
   */
  initTransportModeListeners() {
    TRANSPORT_MODES.forEach((option) => {
      const checkbox = this.module.querySelector(`[data-${option.attr}]`);
      if (checkbox) {
        const handleChange = () => {
          log(`Module ${this.moduleIndex}: Transport modes changed:`, this.getTransportModes());
        };
        this.addEventHandler(checkbox, 'change', handleChange);
      }
    });
  }

  /**
   * Initialize submit handler
   */
  initSubmitHandler() {
    const submitButton = this.elements.submitButton;

    if (!submitButton) {
      console.error(`Module ${this.moduleIndex}: Submit button not found`);
      return;
    }

    const handleSubmit = (event) => this.handleSubmit(event);
    this.addEventHandler(submitButton, 'click', handleSubmit);
    log(`Module ${this.moduleIndex}: Submit button listener attached`);
  }

  /**
   * Handle form submission
   */
  handleSubmit(event) {
    event.preventDefault();
    log(`Module ${this.moduleIndex}: User clicked submit button`);

    const origin = this.elements.originInput?.value || '';
    const destination = this.elements.destinationInput?.value || '';
    const containerType = this.elements.cargoTypeSelect?.value || '';
    const transportDate = this.selectedDateISO || '';
    const transportModes = this.getTransportModes();

    let isValid = true;

    // Validate origin
    if (this.validateOrigin && !this.validateOrigin()) {
      this.showError(this.elements.originInput);
      isValid = false;
    } else if (!origin) {
      this.showError(this.elements.originInput);
      isValid = false;
    }

    // Validate destination
    if (this.validateDestination && !this.validateDestination()) {
      this.showError(this.elements.destinationInput);
      isValid = false;
    } else if (!destination) {
      this.showError(this.elements.destinationInput);
      isValid = false;
    }

    // Validate cargo type
    if (this.validateCargoType && !this.validateCargoType()) {
      isValid = false;
    } else if (!containerType) {
      this.showError(this.elements.cargoTypeDisplay);
      isValid = false;
    }

    // Validate date
    if (!transportDate) {
      this.showError(this.elements.dateInput);
      isValid = false;
    }

    // Validate transport modes
    if (!this.validateTransportModes()) {
      isValid = false;
    }

    if (!isValid) {
      log(`Module ${this.moduleIndex}: Form validation failed:`, {
        origin: origin || 'MISSING',
        destination: destination || 'MISSING',
        containerType: containerType || 'MISSING',
        transportDate: transportDate || 'MISSING',
        transportModes: transportModes.length > 0 ? transportModes : 'MISSING',
      });
      return;
    }

    log(`Module ${this.moduleIndex}: Form validation passed`);

    // Get redirect URL from button
    const baseUrl = this.elements.submitButton.getAttribute('href') || DEFAULT_REDIRECT_URL;

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

    log(`Module ${this.moduleIndex}: Final URL constructed:`, finalUrl);
    log(`Module ${this.moduleIndex}: Form data:`, {
      origin,
      destination,
      containerType,
      transportDate,
      transportModes,
    });
    log(`Module ${this.moduleIndex}: Redirecting user...`);

    // Redirect to the new page
    window.location.href = finalUrl;
  }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

// Prevent multiple initializations
if (!window.cargoModulesInitialized) {
  window.cargoModulesInitialized = true;

  window.Webflow ||= [];
  window.Webflow.push(() => {
    // Find all cargo modules on the page
    const modules = document.querySelectorAll(`[data-${DATA_ATTRS.module}]`);

    if (modules.length === 0) {
      console.warn('No cargo form modules found on page');
      return;
    }

    log(`Found ${modules.length} cargo form module(s) on page`);

    // Initialize each module
    modules.forEach((module, index) => {
      new CargoFormModule(module, index);
    });

    log('All cargo form modules initialized');
  });
}
