window.Webflow ||= [];
window.Webflow.push(() => {
  // Get elements
  const exitIntent = document.getElementById('fs-modal-exit');
  if (!exitIntent) return; // Exit if popup element not found

  const pageUrl = window.location.pathname;
  const closeButtons = document.querySelectorAll('[aria-controls=fs-modal-exit]');

  // Read settings from data attributes
  const showOnce = exitIntent.getAttribute('element-setting-once') === 'true';
  const exitDelay = parseInt(exitIntent.getAttribute('element-setting-delay')) || 3000;
  const autoDisplay = exitIntent.getAttribute('element-setting-auto-display');
  const autoDisplayDelay = autoDisplay ? parseInt(autoDisplay) : null;

  // Set storage key only if showOnce is true
  const storageKey = showOnce ? `exitPopupShown_${pageUrl}` : null;

  let entryTime = Date.now();
  let hasShownPopup = false;

  // Initial setup
  exitIntent.style.display = 'none';
  exitIntent.style.opacity = '0';

  // Functions
  function getFormId() {
    const formIdElement = exitIntent.querySelector('[modal-form-id]');
    return formIdElement ? formIdElement.getAttribute('modal-form-id') : null;
  }

  function getModalName() {
    const modalName = exitIntent.querySelector('[fs-modal-name]');
    return modalName ? modalName.getAttribute('fs-modal-name') : null;
  }

  function showPopup() {
    // Check if we should prevent showing based on storage (only if showOnce is true)
    if (hasShownPopup || (showOnce && sessionStorage.getItem(storageKey))) return;

    exitIntent.style.display = 'flex';
    setTimeout(() => {
      exitIntent.style.opacity = '1';
    }, 10);

    const formId = getFormId();
    const modalName = getModalName();
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({
      event: 'exit_intent_shown',
      label: modalName,
      form_id: formId,
    });

    hasShownPopup = true;

    // Only store in sessionStorage if showOnce is true
    if (showOnce && storageKey) {
      sessionStorage.setItem(storageKey, 'true');
    }
  }

  function closePopup() {
    exitIntent.style.opacity = '0';
    setTimeout(() => {
      exitIntent.style.display = 'none';
    }, 300);

    const formId = getFormId();
    const modalName = getModalName();
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({
      event: 'exit_intent_closed',
      label: modalName,
      form_id: formId,
    });
  }

  // Event listeners

  // Auto-display popup after specified delay (if setting exists)
  if (autoDisplayDelay && autoDisplayDelay > 0) {
    setTimeout(showPopup, autoDisplayDelay);
  }

  // Exit intent detection
  document.addEventListener('mouseout', (e) => {
    if (e.clientY < 0 && Date.now() - entryTime > exitDelay) {
      showPopup();
    }
  });

  // Close button listeners
  closeButtons.forEach((elem) => {
    elem.addEventListener('click', closePopup);
  });
});
