/**
 * OwnTracks Frontend Application
 */

(function() {
  'use strict';

  // ============================================================================
  // State Management
  // ============================================================================

  const state = {
    map: null,
    layers: {
      points: null,
      lines: null,
      heatmap: null
    },
    data: {
      raw: [],           // All points from API
      filtered: [],      // Points after accuracy filter
      users: [],
      devices: [],
      maxAccuracy: 0,
      timeRange: { start: null, end: null },
      sourceBreakdown: { cached: 0, fresh: 0 }
    },
    settings: {},
    isLoading: false,
    sidebarOpen: false,
    loadingStartTime: null,
    loadingTimerInterval: null
  };

  // ============================================================================
  // Console Logging Helper
  // ============================================================================

  function shouldLog() {
    // Always allow errors and warnings through
    return true;
  }

  function log(...args) {
    if (getSetting('consoleLoggingEnabled', true)) {
      console.log(...args);
    }
  }

  function logWarn(...args) {
    // Warnings always show
    console.warn(...args);
  }

  function logError(...args) {
    // Errors always show
    console.error(...args);
  }

  // ============================================================================
  // Configuration & Initialization
  // ============================================================================

  function validateAuthConfig() {
    const api = window.CONFIG.api || {};

    // Check basic auth: if username is set, password must also be set (and vice versa)
    const hasUsername = api.username !== undefined;
    const hasPassword = api.password !== undefined;

    if (hasUsername !== hasPassword) {
      showError('Configuration error: Both username and password must be provided for basic authentication, or neither should be set.');
      return false;
    }

    // Check cookie auth: if cookieName is set, cookieValue must also be set (and vice versa)
    const hasCookieName = api.cookieName !== undefined;
    const hasCookieValue = api.cookieValue !== undefined;

    if (hasCookieName !== hasCookieValue) {
      showError('Configuration error: Both cookieName and cookieValue must be provided for cookie authentication, or neither should be set.');
      return false;
    }

    // Authentication is optional - no validation for "at least one method"
    return true;
  }

  async function init() {
    // Check if config is loaded
    if (typeof window.CONFIG === 'undefined') {
      showError('Configuration not loaded. Please copy config.js.example to config.js and add your credentials.');
      return;
    }

    // Validate authentication configuration
    validateAuthConfig();

    // Load settings from localStorage
    loadSettings();

    // Initialize map
    initMap();

    // Initialize UI
    await initUI();

    // Restore sidebar state
    restoreSidebarState();

    // Apply theme
    applyTheme();

    // Listen for system theme changes
    initSystemThemeListener();

    // Set default dates
    setDefaultDates();

    // Fetch users and devices
    fetchUsersAndDevices();
  }

  // ============================================================================
  // Settings Management
  // ============================================================================

  function loadSettings() {
    const saved = localStorage.getItem('owntracks_settings');
    if (saved) {
      try {
        state.settings = JSON.parse(saved);

        // Migration: update old defaults to new defaults
        if (state.settings.pointSize === 6) {
          state.settings.pointSize = 4; // New default
          localStorage.setItem('owntracks_settings', JSON.stringify(state.settings));
        }
      } catch (e) {
        logWarn('Failed to parse saved settings:', e);
        state.settings = {};
      }
    } else {
      state.settings = {};
    }
  }

  function saveSetting(key, value, defaultValue) {
    // Only save if value differs from default
    const currentDefault = defaultValue !== undefined ? defaultValue : getDefaultSetting(key);
    if (value === currentDefault) {
      // Remove from settings if it's the default (clean up storage)
      delete state.settings[key];
    } else {
      state.settings[key] = value;
    }
    localStorage.setItem('owntracks_settings', JSON.stringify(state.settings));
  }

  function getDefaultSetting(key) {
    const defaults = {
      showPoints: true,
      showLines: true,
      pointSize: 2,
      pointColor: '#3388ff',
      pointOpacity: 0.5,
      lineWidth: 3,
      lineColor: '#3388ff',
      lineOpacity: 0.7,
      accuracyMaxMeters: 0,
      altitudeMin: 0,
      altitudeMax: 1000,
      altitudePointsLowColor: '#00ff00',
      altitudePointsHighColor: '#ff0000',
      altitudeLinesLowColor: '#00ff00',
      altitudeLinesHighColor: '#ff0000',
      heatmapRadius: 25,
      heatmapBlur: 15,
      heatmapMinOpacity: 0.05,
      heatmapLowColor: '#0000ff',
      heatmapMidColor: '#00ffff',
      heatmapHighColor: '#ff0000',
      darkMode: false,
      storageEnabled: true,    // Enabled by default
      sidebarOpen: false,
      autoFitToBounds: true,   // Auto-fit map to data by default
      dynamicPointVisibility: true,  // Enabled by default
      consoleLoggingEnabled: true  // Console logging enabled by default
    };
    return defaults[key];
  }

  function getSetting(key, defaultValue) {
    // Check localStorage first, then config file, then default
    if (state.settings[key] !== undefined) {
      return state.settings[key];
    }

    // Check config file for nested settings
    if (window.CONFIG.display) {
      // Map flat keys to nested config paths
      const configPaths = {
        // Points
        'pointColor': 'display.points.color',
        'pointSize': 'display.points.size',
        'pointOpacity': 'display.points.opacity',
        // Lines
        'lineColor': 'display.lines.color',
        'lineWidth': 'display.lines.width',
        'lineOpacity': 'display.lines.opacity',
        'smoothLines': 'display.lines.smooth',
        // Accuracy
        'accuracyMaxMeters': 'display.accuracy.maxMeters',
        // Altitude Points
        'altitudeEnabled': 'display.altitude.points.enabled',
        'altitudeMin': 'display.altitude.min',
        'altitudeMax': 'display.altitude.max',
        'altitudePointsLowColor': 'display.altitude.points.lowColor',
        'altitudePointsHighColor': 'display.altitude.points.highColor',
        // Altitude Lines
        'altitudeLinesEnabled': 'display.altitude.lines.enabled',
        'altitudeLinesLowColor': 'display.altitude.lines.lowColor',
        'altitudeLinesHighColor': 'display.altitude.lines.highColor',
        // Heatmap
        'heatmapEnabled': 'display.heatmap.enabled',
        'heatmapRadius': 'display.heatmap.radius',
        'heatmapBlur': 'display.heatmap.blur',
        'heatmapMinOpacity': 'display.heatmap.minOpacity',
        'heatmapLowColor': 'display.heatmap.gradient.lowColor',
        'heatmapMidColor': 'display.heatmap.gradient.midColor',
        'heatmapHighColor': 'display.heatmap.gradient.highColor',
        // Storage
        'storageEnabled': 'display.storageEnabled'
      };

      const path = configPaths[key];
      if (path) {
        const value = getNestedConfigValue(path);
        if (value !== undefined) {
          return value;
        }
      }
    }

    // Check config file for performance settings
    if (key === 'dynamicPointVisibility' && window.CONFIG.performance?.dynamicPointVisibility !== undefined) {
      return window.CONFIG.performance.dynamicPointVisibility;
    }

    // Check config file for debug settings
    if (key === 'consoleLoggingEnabled' && window.CONFIG.debug?.consoleLogging !== undefined) {
      return window.CONFIG.debug.consoleLogging;
    }

    return defaultValue;
  }

  function getNestedConfigValue(path) {
    const parts = path.split('.');
    let value = window.CONFIG;
    for (const part of parts) {
      if (value && typeof value === 'object' && part in value) {
        value = value[part];
      } else {
        return undefined;
      }
    }
    return value;
  }

  // ============================================================================
  // Map Initialization
  // ============================================================================

  // Default map settings (used if not in config)
  const DEFAULT_MAP_SETTINGS = {
    tileServer: "https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
    defaultCenter: [51.50138, -0.14189], // London (Westminster)
    defaultZoom: 13,
    minZoom: 2,
    maxZoom: 21
  };

  // Default heatmap settings (used if not in config)
  const DEFAULT_HEATMAP_SETTINGS = {
    gradient: {
      0.0: 'blue',
      0.2: 'cyan',
      0.4: 'lime',
      0.6: 'yellow',
      1.0: 'red'
    },
    minOpacity: 0.05,
    maxZoom: 18,
    radius: 25,
    blur: 15
  };

  function getMapSetting(key) {
    return window.CONFIG.map?.[key] ?? DEFAULT_MAP_SETTINGS[key];
  }

  function getHeatmapSetting(key) {
    return window.CONFIG.heatmap?.[key] ?? DEFAULT_HEATMAP_SETTINGS[key];
  }

  function initMap() {
    console.log('Initializing map...');

    // Start with world view
    state.map = L.map('map', {
      zoomControl: false,
      attributionControl: false,
      zoomSnap: 0, // Allow fractional zoom levels for smoother transitions
      wheelPxPerZoomLevel: 60 // Slower scroll zoom
    }).setView([0, 0], 2);

    console.log('Map created:', state.map);

    // Add zoom control to top-right
    L.control.zoom({
      position: 'topright'
    }).addTo(state.map);

    // Add attribution to bottom-right
    L.control.attribution({
      position: 'bottomright',
      prefix: ''
    }).addTo(state.map);

    console.log('Adding tile layer...');
    // Add tile layer
    updateTileLayer();

    // Handle zoom events for dynamic rendering
    // Debounced redraw to avoid performance issues during continuous zooming
    let zoomRedrawTimeout = null;
    const handleZoomChange = () => {
      clearTimeout(zoomRedrawTimeout);
      zoomRedrawTimeout = setTimeout(() => {
        if (state.data.filtered.length > 0) {
          redrawMap();
        }
      }, 200); // 200ms delay after zoom stops
    };
    state.map.on('zoomend', handleZoomChange);

    // Initialize layer groups with proper z-index ordering
    // Order: Heatmap (bottom), Lines (middle), Points (top)
    state.layers.points = L.layerGroup([], { zIndex: 400 }).addTo(state.map);
    state.layers.lines = L.layerGroup([], { zIndex: 300 }).addTo(state.map);
    state.layers.heatmap = null; // Will be created with zIndex: 200 when needed

    // Add proximity click handler for easier point interaction
    state.map.on('click', handleProximityClick);

    console.log('Map initialization complete');
  }

  function updateTileLayer() {
    // Remove existing tile layer if any
    state.map.eachLayer(layer => {
      if (layer instanceof L.TileLayer) {
        state.map.removeLayer(layer);
      }
    });

    // Add new tile layer - simplified for debugging
    const tileUrl = getMapSetting('tileServer');
    console.log('Adding tile layer with URL:', tileUrl);

    const tileLayer = L.tileLayer(tileUrl, {
      minZoom: getMapSetting('minZoom'),
      maxZoom: getMapSetting('maxZoom'),
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, © CARTO | Powered by <a href="https://leafletjs.com/">Leaflet</a>',
      crossOrigin: true
    });

    tileLayer.addTo(state.map);
    console.log('Tile layer added to map');
  }

  // ============================================================================
  // UI Initialization
  // ============================================================================

  async function initUI() {
    // Date input confirmation helper
    const confirmDateInput = (input) => {
      // Remove the class first to allow re-triggering the animation
      input.classList.remove('date-confirmed');
      // Trigger reflow to restart the animation
      void input.offsetWidth;
      input.classList.add('date-confirmed');
      // Remove the class after animation completes
      setTimeout(() => input.classList.remove('date-confirmed'), 600);
    };

    // Sidebar toggle
    document.getElementById('sidebarToggle').addEventListener('click', toggleSidebar);

    // Data source controls
    document.getElementById('userSelect').addEventListener('change', handleUserChange);
    document.getElementById('deviceSelect').addEventListener('change', handleDeviceChange);
    document.getElementById('timePeriod').addEventListener('change', async (e) => {
      const value = e.target.value;
      saveSetting('timePeriod', value, '30days');
      await handleTimePeriodChange();
    });
    // Custom date picker functionality
    const customDatePicker = document.getElementById('customDatePicker');
    let currentPickerInput = null;
    let pickerCurrentDate = new Date();
    let pickerViewMode = 'days'; // 'days', 'months', or 'years'

    // Open date picker when input is clicked
    document.querySelectorAll('.date-input-wrapper input').forEach(input => {
      input.addEventListener('click', (e) => {
        currentPickerInput = e.target;
        const currentValue = e.target.dataset.value || '';

        // Parse current value or use now
        if (currentValue) {
          // Handle both 'T' and ' ' separators
          const separator = currentValue.includes('T') ? 'T' : ' ';
          const [datePart, timePart] = currentValue.split(separator);
          const parts = datePart.split('-').map(Number);
          const year = parts[0];
          const month = parts[1];
          const day = parts[2];
          const timeParts = timePart ? timePart.split(':').map(Number) : [0, 0];
          const hour = timeParts[0];
          const minute = timeParts[1];

          // Validate we have valid numbers
          if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
            pickerCurrentDate = new Date(year, month - 1, day, hour || 0, minute || 0);
          } else {
            pickerCurrentDate = new Date();
            pickerCurrentDate.setMinutes(0, 0, 0);
          }
        } else {
          pickerCurrentDate = new Date();
          pickerCurrentDate.setMinutes(0, 0, 0);
        }

        // Reset to days view when opening
        pickerViewMode = 'days';

        // Position and show picker - position it below the clicked input
        const inputRect = e.target.getBoundingClientRect();
        customDatePicker.style.left = inputRect.left + 'px';
        customDatePicker.style.top = (inputRect.bottom + 5) + 'px';
        customDatePicker.style.display = 'block';

        renderDatePicker(pickerCurrentDate);
      });
    });

    // Close picker when clicking outside
    document.addEventListener('click', (e) => {
      if (customDatePicker.style.display !== 'none' &&
          !customDatePicker.contains(e.target) &&
          !e.target.closest('.date-input-wrapper')) {
        customDatePicker.style.display = 'none';
      }
    });

    // Cancel button
    document.getElementById('pickerCancel').addEventListener('click', () => {
      customDatePicker.style.display = 'none';
    });

    // Apply button
    document.getElementById('pickerApply').addEventListener('click', async () => {
      if (currentPickerInput) {
        const year = pickerCurrentDate.getFullYear();
        const month = String(pickerCurrentDate.getMonth() + 1).padStart(2, '0');
        const day = String(pickerCurrentDate.getDate()).padStart(2, '0');
        const hour = String(pickerCurrentDate.getHours()).padStart(2, '0');
        const minute = String(pickerCurrentDate.getMinutes()).padStart(2, '0');

        const dateStr = `${year}-${month}-${day}T${hour}:${minute}`;
        currentPickerInput.value = dateStr;
        currentPickerInput.dataset.value = dateStr;

        // Save the date
        if (currentPickerInput.id === 'fromDate') {
          saveSetting('fromDate', dateStr, '');
        } else {
          saveSetting('toDate', dateStr, '');
        }

        await updateRefreshButton();
        confirmDateInput(currentPickerInput);
      }
      customDatePicker.style.display = 'none';
    });

    // Month/year navigation
    document.querySelectorAll('.date-picker-nav').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const direction = e.target.dataset.direction;
        if (pickerViewMode === 'days') {
          if (direction === 'prev') {
            pickerCurrentDate.setMonth(pickerCurrentDate.getMonth() - 1);
          } else {
            pickerCurrentDate.setMonth(pickerCurrentDate.getMonth() + 1);
          }
          // Preserve the selected day if possible
          const selectedDay = document.querySelector('.date-picker-day.selected');
          if (selectedDay && !selectedDay.classList.contains('empty')) {
            const day = parseInt(selectedDay.textContent);
            pickerCurrentDate.setDate(day);
          }
        } else if (pickerViewMode === 'months') {
          if (direction === 'prev') {
            pickerCurrentDate.setFullYear(pickerCurrentDate.getFullYear() - 1);
          } else {
            pickerCurrentDate.setFullYear(pickerCurrentDate.getFullYear() + 1);
          }
        } else if (pickerViewMode === 'years') {
          if (direction === 'prev') {
            pickerCurrentDate.setFullYear(pickerCurrentDate.getFullYear() - 12);
          } else {
            pickerCurrentDate.setFullYear(pickerCurrentDate.getFullYear() + 12);
          }
        }
        renderDatePicker(pickerCurrentDate);
      });
    });

    // Time input changes
    const handleTimeChange = () => {
      const hourInput = document.getElementById('pickerHour');
      const minuteInput = document.getElementById('pickerMinute');
      let hour = parseInt(hourInput.value) || 0;
      let minute = parseInt(minuteInput.value) || 0;

      // Clamp values
      hour = Math.max(0, Math.min(23, hour));
      minute = Math.max(0, Math.min(59, minute));

      pickerCurrentDate.setHours(hour);
      pickerCurrentDate.setMinutes(minute);
    };

    document.getElementById('pickerHour').addEventListener('change', handleTimeChange);
    document.getElementById('pickerMinute').addEventListener('change', handleTimeChange);

    function renderDatePicker(date) {
      const year = date.getFullYear();
      const month = date.getMonth();

      // Update header - add click hint in year/month mode
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                          'July', 'August', 'September', 'October', 'November', 'December'];
      const monthYearEl = document.querySelector('.date-picker-month-year');

      if (pickerViewMode === 'days') {
        monthYearEl.textContent = `${monthNames[month]} ${year}`;
      } else if (pickerViewMode === 'months') {
        monthYearEl.textContent = `${year}`;
      } else {
        monthYearEl.textContent = 'Select Year';
      }

      // Add click handler for month/year header to switch views
      monthYearEl.onclick = (e) => {
        e.stopPropagation();
        e.preventDefault();
        if (pickerViewMode === 'days') {
          pickerViewMode = 'months';
        } else if (pickerViewMode === 'months') {
          pickerViewMode = 'years';
        } else {
          pickerViewMode = 'days';
        }
        renderDatePicker(pickerCurrentDate);
      };

      // Update time inputs
      document.getElementById('pickerHour').value = String(date.getHours()).padStart(2, '0');
      document.getElementById('pickerMinute').value = String(date.getMinutes()).padStart(2, '0');

      const daysHeader = document.querySelector('.date-picker-days-header');
      const daysGrid = document.querySelector('.date-picker-days');

      if (pickerViewMode === 'days') {
        // Show days header
        daysHeader.style.display = 'grid';
        // Reset grid to 7 columns for days view
        daysGrid.style.display = 'grid';
        daysGrid.style.gridTemplateColumns = '';

        // Generate calendar days
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const startDay = firstDay.getDay();
        const totalDays = lastDay.getDate();

        const today = new Date();
        const selectedDate = currentPickerInput?.dataset.value;
        const selectedParts = selectedDate ? selectedDate.split('T')[0].split('-').map(Number) : null;
        const currentPickerDay = pickerCurrentDate.getDate();
        const currentPickerMonth = pickerCurrentDate.getMonth();
        const currentPickerYear = pickerCurrentDate.getFullYear();

        let html = '';

        // Empty cells before first day
        for (let i = 0; i < startDay; i++) {
          html += '<div class="date-picker-day empty"></div>';
        }

        // Days of month
        for (let day = 1; day <= totalDays; day++) {
          const isToday = day === today.getDate() &&
                          month === today.getMonth() &&
                          year === today.getFullYear();
          // Check if this day matches either the saved input value or the current picker date
          const matchesInput = selectedParts &&
                             day === selectedParts[2] &&
                             month === selectedParts[1] - 1 &&
                             year === selectedParts[0];
          const matchesPicker = day === currentPickerDay &&
                                month === currentPickerMonth &&
                                year === currentPickerYear;
          const isSelected = matchesInput || matchesPicker;

          let classes = 'date-picker-day';
          if (isToday) classes += ' today';
          if (isSelected) classes += ' selected';

          html += `<div class="${classes}" data-day="${day}">${day}</div>`;
        }

        daysGrid.innerHTML = html;

        // Add click handlers to days
        document.querySelectorAll('.date-picker-day:not(.empty)').forEach(dayEl => {
          dayEl.addEventListener('click', (e) => {
            e.stopPropagation();
            const day = parseInt(dayEl.dataset.day);
            pickerCurrentDate.setDate(day);
            pickerCurrentDate.setHours(
              parseInt(document.getElementById('pickerHour').value) || 0,
              parseInt(document.getElementById('pickerMinute').value) || 0,
              0
            );

            // Update selection display
            document.querySelectorAll('.date-picker-day').forEach(d => d.classList.remove('selected'));
            dayEl.classList.add('selected');
          });
        });
      } else if (pickerViewMode === 'months') {
        // Hide days header
        daysHeader.style.display = 'none';

        const today = new Date();
        const selectedDate = currentPickerInput?.dataset.value;
        const selectedParts = selectedDate ? selectedDate.split('T')[0].split('-').map(Number) : null;

        let html = '';
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                            'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

        for (let m = 0; m < 12; m++) {
          const isSelected = selectedParts &&
                             m === selectedParts[1] - 1 &&
                             year === selectedParts[0];
          const isToday = m === today.getMonth() && year === today.getFullYear();

          let classes = 'date-picker-day';
          if (isSelected) classes += ' selected';
          if (isToday) classes += ' today';

          html += `<div class="${classes}" data-month="${m}">${monthNames[m]}</div>`;
        }

        daysGrid.innerHTML = html;
        daysGrid.style.display = 'grid';
        daysGrid.style.gridTemplateColumns = 'repeat(3, 1fr)';

        // Add click handlers to months
        document.querySelectorAll('.date-picker-day[data-month]').forEach(monthEl => {
          monthEl.addEventListener('click', (e) => {
            e.stopPropagation();
            const month = parseInt(monthEl.dataset.month);
            pickerCurrentDate.setMonth(month);
            pickerViewMode = 'days';
            renderDatePicker(pickerCurrentDate);
          });
        });
      } else if (pickerViewMode === 'years') {
        // Hide days header
        daysHeader.style.display = 'none';

        const today = new Date();
        const selectedDate = currentPickerInput?.dataset.value;
        const selectedParts = selectedDate ? selectedDate.split('T')[0].split('-').map(Number) : null;

        // Show 12 years centered around current year
        const startYear = Math.floor(year / 12) * 12;
        let html = '';

        for (let y = startYear; y < startYear + 12; y++) {
          const isSelected = selectedParts && y === selectedParts[0];
          const isToday = y === today.getFullYear();

          let classes = 'date-picker-day';
          if (isSelected) classes += ' selected';
          if (isToday) classes += ' today';

          html += `<div class="${classes}" data-year="${y}">${y}</div>`;
        }

        daysGrid.innerHTML = html;
        daysGrid.style.display = 'grid';
        daysGrid.style.gridTemplateColumns = 'repeat(3, 1fr)';

        // Add click handlers to years
        document.querySelectorAll('.date-picker-day[data-year]').forEach(yearEl => {
          yearEl.addEventListener('click', (e) => {
            e.stopPropagation();
            const selectedYear = parseInt(yearEl.dataset.year);
            pickerCurrentDate.setFullYear(selectedYear);
            pickerViewMode = 'months';
            renderDatePicker(pickerCurrentDate);
          });
        });
      }
    }

    // Reposition picker when sidebar is toggled
    const observer = new MutationObserver(() => {
      if (customDatePicker.style.display !== 'none' && currentPickerInput) {
        const inputRect = currentPickerInput.getBoundingClientRect();
        customDatePicker.style.left = inputRect.left + 'px';
        customDatePicker.style.top = (inputRect.bottom + 5) + 'px';
      }
    });

    observer.observe(document.getElementById('sidebar'), { attributes: true, attributeFilter: ['class'] });

    document.getElementById('fromDate').addEventListener('change', async (e) => {
      saveSetting('fromDate', e.target.value, '');
      await updateRefreshButton();
    });
    document.getElementById('toDate').addEventListener('change', async (e) => {
      saveSetting('toDate', e.target.value, '');
      await updateRefreshButton();
    });
    document.getElementById('loadDataBtn').addEventListener('click', loadData);
    document.getElementById('refreshBtn').addEventListener('click', loadDataFromAPI);
    document.getElementById('recenterBtn').addEventListener('click', () => {
      if (state.data.filtered.length > 0) {
        fitMapToBounds();
      }
    });

    // Auto-fit to bounds
    document.getElementById('autoFitToBounds').addEventListener('change', (e) => {
      saveSetting('autoFitToBounds', e.target.checked, true);
      // If enabled and data exists, fit immediately
      if (e.target.checked && state.data.filtered.length > 0) {
        fitMapToBounds();
      } else if (!e.target.checked) {
        // When disabling, save current position for restoration
        saveMapPosition();
      }
    });

    // Display options
    document.getElementById('showPoints').addEventListener('change', (e) => {
      saveSetting('showPoints', e.target.checked, true);
      redrawMap();
    });
    document.getElementById('pointColor').addEventListener('change', (e) => {
      document.getElementById('pointColorPicker').value = e.target.value;
      saveSetting('pointColor', e.target.value, '#3388ff');
      redrawMap();
    });
    document.getElementById('pointColorPicker').addEventListener('input', (e) => {
      document.getElementById('pointColor').value = e.target.value;
      saveSetting('pointColor', e.target.value, '#3388ff');
      redrawMap();
    });
    document.getElementById('pointSize').addEventListener('change', (e) => {
      saveSetting('pointSize', parseInt(e.target.value), 2);
      redrawMap();
    });
    document.getElementById('pointOpacity').addEventListener('change', (e) => {
      saveSetting('pointOpacity', parseFloat(e.target.value), 0.5);
      redrawMap();
    });

    document.getElementById('showLines').addEventListener('change', (e) => {
      saveSetting('showLines', e.target.checked, true);
      redrawMap();
    });
    document.getElementById('lineColor').addEventListener('change', (e) => {
      document.getElementById('lineColorPicker').value = e.target.value;
      saveSetting('lineColor', e.target.value, '#3388ff');
      redrawMap();
    });
    document.getElementById('lineColorPicker').addEventListener('input', (e) => {
      document.getElementById('lineColor').value = e.target.value;
      saveSetting('lineColor', e.target.value, '#3388ff');
      redrawMap();
    });
    document.getElementById('lineWidth').addEventListener('change', (e) => {
      saveSetting('lineWidth', parseInt(e.target.value), 3);
      redrawMap();
    });
    document.getElementById('lineOpacity').addEventListener('change', (e) => {
      saveSetting('lineOpacity', parseFloat(e.target.value), 0.7);
      redrawMap();
    });
    document.getElementById('smoothLines').addEventListener('change', (e) => {
      saveSetting('smoothLines', e.target.checked, false);
      redrawMap();
    });

    // Accuracy filter
    document.getElementById('accuracySlider').addEventListener('input', (e) => {
      const value = parseInt(e.target.value);
      document.getElementById('accuracyValue').textContent = value;
      saveSetting('accuracyMaxMeters', value, 0);
      applyAccuracyFilter();
      redrawMap();
    });

    // Altitude gradient
    document.getElementById('altitudeEnabled').addEventListener('change', (e) => {
      saveSetting('altitudeEnabled', e.target.checked, false);
      redrawMap();
    });
    document.getElementById('altitudeMin').addEventListener('change', (e) => {
      saveSetting('altitudeMin', parseInt(e.target.value), 0);
      redrawMap();
    });
    document.getElementById('altitudeMax').addEventListener('change', (e) => {
      saveSetting('altitudeMax', parseInt(e.target.value), 1000);
      redrawMap();
    });

    // Altitude colors for points
    document.getElementById('altitudePointsLowColor').addEventListener('change', (e) => {
      document.getElementById('altitudePointsLowColorPicker').value = e.target.value;
      saveSetting('altitudePointsLowColor', e.target.value, '#00ff00');
      redrawMap();
    });
    document.getElementById('altitudePointsLowColorPicker').addEventListener('input', (e) => {
      document.getElementById('altitudePointsLowColor').value = e.target.value;
      saveSetting('altitudePointsLowColor', e.target.value, '#00ff00');
      redrawMap();
    });
    document.getElementById('altitudePointsHighColor').addEventListener('change', (e) => {
      document.getElementById('altitudePointsHighColorPicker').value = e.target.value;
      saveSetting('altitudePointsHighColor', e.target.value, '#ff0000');
      redrawMap();
    });
    document.getElementById('altitudePointsHighColorPicker').addEventListener('input', (e) => {
      document.getElementById('altitudePointsHighColor').value = e.target.value;
      saveSetting('altitudePointsHighColor', e.target.value, '#ff0000');
      redrawMap();
    });

    // Altitude colors for lines
    document.getElementById('altitudeLinesEnabled').addEventListener('change', (e) => {
      saveSetting('altitudeLinesEnabled', e.target.checked, false);
      redrawMap();
    });
    document.getElementById('altitudeLinesLowColor').addEventListener('change', (e) => {
      document.getElementById('altitudeLinesLowColorPicker').value = e.target.value;
      saveSetting('altitudeLinesLowColor', e.target.value, '#00ff00');
      redrawMap();
    });
    document.getElementById('altitudeLinesLowColorPicker').addEventListener('input', (e) => {
      document.getElementById('altitudeLinesLowColor').value = e.target.value;
      saveSetting('altitudeLinesLowColor', e.target.value, '#00ff00');
      redrawMap();
    });
    document.getElementById('altitudeLinesHighColor').addEventListener('change', (e) => {
      document.getElementById('altitudeLinesHighColorPicker').value = e.target.value;
      saveSetting('altitudeLinesHighColor', e.target.value, '#ff0000');
      redrawMap();
    });
    document.getElementById('altitudeLinesHighColorPicker').addEventListener('input', (e) => {
      document.getElementById('altitudeLinesHighColor').value = e.target.value;
      saveSetting('altitudeLinesHighColor', e.target.value, '#ff0000');
      redrawMap();
    });

    // Heatmap
    document.getElementById('heatmapEnabled').addEventListener('change', (e) => {
      saveSetting('heatmapEnabled', e.target.checked, false);
      redrawMap();
    });
    document.getElementById('heatmapRadius').addEventListener('change', (e) => {
      saveSetting('heatmapRadius', parseInt(e.target.value), 25);
      redrawMap();
    });
    document.getElementById('heatmapBlur').addEventListener('change', (e) => {
      saveSetting('heatmapBlur', parseInt(e.target.value), 15);
      redrawMap();
    });
    document.getElementById('heatmapMinOpacity').addEventListener('change', (e) => {
      saveSetting('heatmapMinOpacity', parseFloat(e.target.value), 0.05);
      redrawMap();
    });

    // Heatmap gradient colors
    document.getElementById('heatmapLowColor').addEventListener('change', (e) => {
      document.getElementById('heatmapLowColorPicker').value = e.target.value;
      saveSetting('heatmapLowColor', e.target.value, '#0000ff');
      redrawMap();
    });
    document.getElementById('heatmapLowColorPicker').addEventListener('input', (e) => {
      document.getElementById('heatmapLowColor').value = e.target.value;
      saveSetting('heatmapLowColor', e.target.value, '#0000ff');
      redrawMap();
    });
    document.getElementById('heatmapMidColor').addEventListener('change', (e) => {
      document.getElementById('heatmapMidColorPicker').value = e.target.value;
      saveSetting('heatmapMidColor', e.target.value, '#00ffff');
      redrawMap();
    });
    document.getElementById('heatmapMidColorPicker').addEventListener('input', (e) => {
      document.getElementById('heatmapMidColor').value = e.target.value;
      saveSetting('heatmapMidColor', e.target.value, '#00ffff');
      redrawMap();
    });
    document.getElementById('heatmapHighColor').addEventListener('change', (e) => {
      document.getElementById('heatmapHighColorPicker').value = e.target.value;
      saveSetting('heatmapHighColor', e.target.value, '#ff0000');
      redrawMap();
    });
    document.getElementById('heatmapHighColorPicker').addEventListener('input', (e) => {
      document.getElementById('heatmapHighColor').value = e.target.value;
      saveSetting('heatmapHighColor', e.target.value, '#ff0000');
      redrawMap();
    });

    // Storage
    document.getElementById('storageEnabled').addEventListener('change', async (e) => {
      saveSetting('storageEnabled', e.target.checked, true);
      await updateRefreshButton();
    });

    // Auto-fit to bounds
    document.getElementById('autoFitToBounds').addEventListener('change', (e) => {
      saveSetting('autoFitToBounds', e.target.checked, true);
      // If enabled and data exists, fit immediately
      if (e.target.checked && state.data.filtered.length > 0) {
        fitMapToBounds();
      } else if (!e.target.checked) {
        // When disabling, save current position for restoration
        saveMapPosition();
      }
    });

    // Dark mode toggle
    document.getElementById('darkModeToggle').addEventListener('click', () => {
      // Get the effective current mode (system preference or explicit setting)
      const currentMode = getEffectiveDarkMode();

      // Explicitly set the opposite preference
      // We always save this to override system preference
      state.settings.darkMode = !currentMode;
      localStorage.setItem('owntracks_settings', JSON.stringify(state.settings));

      applyTheme();
      updateDarkModeToggle();
    });

    // Clear cache button (only removes cached data from IndexedDB, keeps settings in localStorage)
    document.getElementById('clearCacheBtn').addEventListener('click', async () => {
      if (confirm('Are you sure you want to clear all cached location data? Your display settings and theme will be kept.')) {
        try {
          // Clear IndexedDB cache
          await idbHelper.clearAllCache();

          // Also clear any legacy localStorage cache keys
          const keys = [];
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key) {
              keys.push(key);
            }
          }

          keys.forEach((key) => {
            // Keep settings, remove legacy cache keys
            if (key === 'owntracks_settings') {
              return;
            }

            // Remove cache index keys (e.g., "owntracks_cache_user_device_index")
            if (key.endsWith('_index')) {
              localStorage.removeItem(key);
              return;
            }

            // Remove daily cache keys (contain dates in format YYYY-MM-DD)
            if (key.match(/\d{4}-\d{2}-\d{2}/)) {
              localStorage.removeItem(key);
              return;
            }

            // Remove any cache keys that start with the cache base
            const baseKey = window.CONFIG.storage?.key ?? 'owntracks_cache';
            if (key.startsWith(baseKey)) {
              localStorage.removeItem(key);
              return;
            }
          });

          // Clear any map data currently displayed
          clearMapData();

          location.reload();
        } catch (e) {
          logError('Failed to clear cache:', e);
          showError('Failed to clear cache: ' + e.message);
        }
      }
    });

    // Clear all settings button (clears both IndexedDB cache and localStorage settings)
    document.getElementById('clearStorageBtn').addEventListener('click', async () => {
      if (confirm('Are you sure you want to clear ALL settings? This will remove cached data, display settings, and your theme preference.')) {
        const settings = (() => {
          try {
            const saved = JSON.parse(localStorage.getItem('owntracks_settings') || '{}');
            return typeof saved.darkMode === 'boolean' ? { darkMode: saved.darkMode } : {};
          } catch (e) {
            logWarn('Failed to read saved settings while clearing storage:', e);
            return {};
          }
        })();

        try {
          // Clear IndexedDB cache
          await idbHelper.clearAllCache();
        } catch (e) {
          logWarn('Failed to clear IndexedDB while clearing all storage:', e);
        }

        // Clear all localStorage
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key) {
            keys.push(key);
          }
        }

        keys.forEach((key) => {
          localStorage.removeItem(key);
        });

        if (Object.keys(settings).length) {
          localStorage.setItem('owntracks_settings', JSON.stringify(settings));
        }

        location.reload();
      }
    });

    // Dynamic point visibility toggle
    document.getElementById('dynamicPointVisibility').addEventListener('change', (e) => {
      saveSetting('dynamicPointVisibility', e.target.checked, true);
      redrawMap();
    });

    // Console logging toggle
    document.getElementById('consoleLoggingEnabled').addEventListener('change', (e) => {
      saveSetting('consoleLoggingEnabled', e.target.checked, true);
    });

    // Save map position/zoom when user manually changes the map (only when auto-fit is disabled)
    state.map.on('moveend', saveMapPosition);
    state.map.on('zoomend', saveMapPosition);

    // Update visible point count when viewport changes
    state.map.on('moveend', updateViewportStats);
    state.map.on('zoomend', updateViewportStats);

    // Apply saved settings to UI
    applySettingsToUI();
  }

  async function applySettingsToUI() {
    // Display options - visibility toggles
    document.getElementById('showPoints').checked = getSetting('showPoints', true);
    document.getElementById('showLines').checked = getSetting('showLines', true);

    // Display options - colors and sizes
    if (getSetting('pointColor', '#3388ff') !== '#3388ff') {
      document.getElementById('pointColor').value = getSetting('pointColor', '#3388ff');
      document.getElementById('pointColorPicker').value = getSetting('pointColor', '#3388ff');
    }
    if (getSetting('pointSize', 2) !== 2) {
      document.getElementById('pointSize').value = getSetting('pointSize', 2);
    }
    if (getSetting('pointOpacity', 0.5) !== 0.5) {
      document.getElementById('pointOpacity').value = getSetting('pointOpacity', 0.5);
    }
    if (getSetting('lineColor', '#3388ff') !== '#3388ff') {
      document.getElementById('lineColor').value = getSetting('lineColor', '#3388ff');
      document.getElementById('lineColorPicker').value = getSetting('lineColor', '#3388ff');
    }
    if (getSetting('lineWidth', 3) !== 3) {
      document.getElementById('lineWidth').value = getSetting('lineWidth', 3);
    }
    if (getSetting('lineOpacity', 0.7) !== 0.7) {
      document.getElementById('lineOpacity').value = getSetting('lineOpacity', 0.7);
    }
    document.getElementById('smoothLines').checked = getSetting('smoothLines', false);

    // Accuracy filter
    const accuracyMax = getSetting('accuracyMaxMeters', 0);
    document.getElementById('accuracySlider').value = accuracyMax;
    document.getElementById('accuracyValue').textContent = accuracyMax;

    // Altitude
    document.getElementById('altitudeEnabled').checked = getSetting('altitudeEnabled', false);
    if (getSetting('altitudeMin', 0) !== 0) {
      document.getElementById('altitudeMin').value = getSetting('altitudeMin', 0);
    }
    if (getSetting('altitudeMax', 1000) !== 1000) {
      document.getElementById('altitudeMax').value = getSetting('altitudeMax', 1000);
    }

    // Altitude colors for points
    if (getSetting('altitudePointsLowColor', '#00ff00') !== '#00ff00') {
      document.getElementById('altitudePointsLowColor').value = getSetting('altitudePointsLowColor', '#00ff00');
      document.getElementById('altitudePointsLowColorPicker').value = getSetting('altitudePointsLowColor', '#00ff00');
    }
    if (getSetting('altitudePointsHighColor', '#ff0000') !== '#ff0000') {
      document.getElementById('altitudePointsHighColor').value = getSetting('altitudePointsHighColor', '#ff0000');
      document.getElementById('altitudePointsHighColorPicker').value = getSetting('altitudePointsHighColor', '#ff0000');
    }

    // Altitude colors for lines
    document.getElementById('altitudeLinesEnabled').checked = getSetting('altitudeLinesEnabled', false);
    if (getSetting('altitudeLinesLowColor', '#00ff00') !== '#00ff00') {
      document.getElementById('altitudeLinesLowColor').value = getSetting('altitudeLinesLowColor', '#00ff00');
      document.getElementById('altitudeLinesLowColorPicker').value = getSetting('altitudeLinesLowColor', '#00ff00');
    }
    if (getSetting('altitudeLinesHighColor', '#ff0000') !== '#ff0000') {
      document.getElementById('altitudeLinesHighColor').value = getSetting('altitudeLinesHighColor', '#ff0000');
      document.getElementById('altitudeLinesHighColorPicker').value = getSetting('altitudeLinesHighColor', '#ff0000');
    }

    // Heatmap
    document.getElementById('heatmapEnabled').checked = getSetting('heatmapEnabled', false);
    if (getSetting('heatmapRadius', 25) !== 25) {
      document.getElementById('heatmapRadius').value = getSetting('heatmapRadius', 25);
    }
    if (getSetting('heatmapBlur', 15) !== 15) {
      document.getElementById('heatmapBlur').value = getSetting('heatmapBlur', 15);
    }
    if (getSetting('heatmapMinOpacity', 0.05) !== 0.05) {
      document.getElementById('heatmapMinOpacity').value = getSetting('heatmapMinOpacity', 0.05);
    }

    // Heatmap gradient colors
    if (getSetting('heatmapLowColor', '#0000ff') !== '#0000ff') {
      document.getElementById('heatmapLowColor').value = getSetting('heatmapLowColor', '#0000ff');
      document.getElementById('heatmapLowColorPicker').value = getSetting('heatmapLowColor', '#0000ff');
    }
    if (getSetting('heatmapMidColor', '#00ffff') !== '#00ffff') {
      document.getElementById('heatmapMidColor').value = getSetting('heatmapMidColor', '#00ffff');
      document.getElementById('heatmapMidColorPicker').value = getSetting('heatmapMidColor', '#00ffff');
    }
    if (getSetting('heatmapHighColor', '#ff0000') !== '#ff0000') {
      document.getElementById('heatmapHighColor').value = getSetting('heatmapHighColor', '#ff0000');
      document.getElementById('heatmapHighColorPicker').value = getSetting('heatmapHighColor', '#ff0000');
    }

    // Storage
    document.getElementById('storageEnabled').checked = getSetting('storageEnabled', true);
    await updateRefreshButton();

    // Auto-fit to bounds
    document.getElementById('autoFitToBounds').checked = getSetting('autoFitToBounds', true);

    // Dynamic point visibility
    document.getElementById('dynamicPointVisibility').checked = getSetting('dynamicPointVisibility', true);

    // Console logging
    document.getElementById('consoleLoggingEnabled').checked = getSetting('consoleLoggingEnabled', true);

    // Dark mode toggle is updated in applyTheme()
  }

  function toggleSidebar() {
    state.sidebarOpen = !state.sidebarOpen;
    const sidebar = document.getElementById('sidebar');

    // Enable transitions for manual toggles
    sidebar.classList.add('transitions-enabled');
    sidebar.classList.toggle('open', state.sidebarOpen);
    saveSetting('sidebarOpen', state.sidebarOpen, false);

    // If auto-fit is enabled and we have data loaded, re-fit bounds to account for sidebar
    // Delay slightly to allow sidebar transition to start
    if (getSetting('autoFitToBounds', true) && state.data.filtered.length > 0) {
      setTimeout(() => {
        fitMapToBounds();
      }, 50);
    }
  }

  function saveMapPosition() {
    // Only save if auto-fit is disabled (user wants manual control)
    if (getSetting('autoFitToBounds', true)) {
      return;
    }

    const center = state.map.getCenter();
    const zoom = state.map.getZoom();

    saveSetting('mapCenter', { lat: center.lat, lng: center.lng }, null);
    saveSetting('mapZoom', zoom, null);
  }

  function restoreMapPosition() {
    const savedCenter = getSetting('mapCenter', null);
    const savedZoom = getSetting('mapZoom', null);

    if (savedCenter && savedZoom !== null) {
      state.map.setView([savedCenter.lat, savedCenter.lng], savedZoom);
    }
  }

  function restoreSidebarState() {
    const wasOpen = getSetting('sidebarOpen', true);
    const sidebar = document.getElementById('sidebar');

    if (wasOpen) {
      state.sidebarOpen = true;
      sidebar.classList.add('open');
    }

    initCollapsibleSections();

    // Disable initial animations until the page state is fully restored.
    setTimeout(() => {
      document.body.classList.add('ui-ready');
      sidebar.classList.add('transitions-enabled');
    }, 50);
  }

  function recalculateAllSectionHeights() {
    // Recalculate all expanded section heights
    document.querySelectorAll('.section-toggle:not(.collapsed)').forEach(toggle => {
      const content = toggle.nextElementSibling;
      if (content) {
        const sectionName = toggle.getAttribute('data-section');
        const oldHeight = content.style.maxHeight;

        // Temporarily disable transitions for accurate measurement
        content.style.transition = 'none';
        content.style.maxHeight = 'none';

        // Force a complete reflow before measuring
        void content.offsetHeight;

        const height = content.scrollHeight;
        const rectHeight = content.getBoundingClientRect().height;
        console.log(`[Height Debug] ${sectionName} section load:`, {
          scrollHeight: height,
          rectHeight: rectHeight,
          computedStyle: window.getComputedStyle(content).height,
          was: oldHeight
        });

        // Re-enable transitions and set height
        content.style.transition = '';
        if (height > 0) {
          content.style.maxHeight = `${height}px`;
        }
      }
    });

    // Recalculate all expanded sub-section heights
    document.querySelectorAll('.sub-section-header:not(.collapsed)').forEach(header => {
      const content = header.nextElementSibling;
      if (content) {
        const subName = header.getAttribute('data-sub');
        const oldHeight = content.style.maxHeight;

        content.style.transition = 'none';
        content.style.maxHeight = 'none';
        void content.offsetHeight;

        const height = content.scrollHeight;
        console.log(`[Height Debug] ${subName} sub-section height: ${height}px (was ${oldHeight})`);

        content.style.transition = '';
        if (height > 0) {
          content.style.maxHeight = `${height}px`;
        }
      }
    });
  }

  function syncSectionHeights(target) {
    const parentSection = target.closest('.sidebar-section');
    if (parentSection) {
      const parentContent = parentSection.querySelector(':scope > .section-content');
      if (parentContent) {
        parentContent.style.maxHeight = 'none';
        requestAnimationFrame(() => {
          const height = parentContent.scrollHeight;
          if (height > 0) {
            parentContent.style.maxHeight = `${height}px`;
          }
        });
      }
    }
  }

  function initCollapsibleSections() {
    const sections = document.querySelectorAll('.section-toggle');
    sections.forEach(toggle => {
      const sectionName = toggle.getAttribute('data-section');
      const content = toggle.nextElementSibling;

      const defaults = {
        datasource: false,    // Data Source expanded by default
        storage: true,        // Storage collapsed by default
        stats: false,         // Stats expanded by default
        display: false,       // Display Options expanded by default
        accuracy: true,       // Accuracy Filter collapsed by default
        altitude: true,       // Altitude Gradient collapsed by default
        debug: true           // Debug collapsed by default
      };

      const defaultCollapsed = defaults[sectionName] !== undefined ? defaults[sectionName] : false;
      const wasCollapsed = getSetting(`section_${sectionName}_collapsed`, defaultCollapsed);

      if (wasCollapsed) {
        toggle.classList.add('collapsed');
        content.style.maxHeight = '0';
      } else {
        // Don't set maxHeight during initialization - let content flow naturally
        // It will be set later after all async content is loaded
        content.style.maxHeight = 'none';
      }

      toggle.addEventListener('click', () => {
        const willCollapse = !toggle.classList.contains('collapsed');
        saveSetting(`section_${sectionName}_collapsed`, willCollapse, defaultCollapsed);

        if (willCollapse) {
          toggle.classList.add('collapsed');
          content.style.maxHeight = '0';
        } else {
          // Remove collapsed class FIRST to restore padding
          toggle.classList.remove('collapsed');

          // Now measure with full padding
          const oldHeight = content.style.maxHeight;

          content.style.transition = 'none';
          content.style.maxHeight = 'none';
          void content.offsetHeight; // Force reflow

          const targetHeight = content.scrollHeight;
          const rectHeight = content.getBoundingClientRect().height;
          console.log(`[Height Debug] ${sectionName} click expand:`, {
            scrollHeight: targetHeight,
            rectHeight: rectHeight,
            computedStyle: window.getComputedStyle(content).height,
            was: oldHeight,
            padding: window.getComputedStyle(content).padding,
            margin: window.getComputedStyle(content).margin
          });

          content.style.transition = '';

          if (targetHeight > 0) {
            // Animate from 0 to target height
            content.style.maxHeight = '0';
            void content.offsetHeight;
            content.style.maxHeight = `${targetHeight}px`;
          }
        }
      });

      window.addEventListener('resize', () => {
        if (!toggle.classList.contains('collapsed')) {
          content.style.maxHeight = 'none';
          requestAnimationFrame(() => {
            if (!toggle.classList.contains('collapsed')) {
              const height = content.scrollHeight;
              if (height > 0) {
                content.style.maxHeight = `${height}px`;
              }
            }
          });
        }
      });
    });

    const subSections = document.querySelectorAll('.sub-section-header');
    subSections.forEach(header => {
      const subName = header.getAttribute('data-sub');
      const content = header.nextElementSibling;
      const wasCollapsed = getSetting(`sub_${subName}_collapsed`, true);

      if (wasCollapsed) {
        header.classList.add('collapsed');
        content.style.maxHeight = '0';
      } else {
        // Don't set maxHeight during initialization - let content flow naturally
        // It will be set later after all async content is loaded
        content.style.maxHeight = 'none';
      }

      header.addEventListener('click', () => {
        const willCollapse = !header.classList.contains('collapsed');
        saveSetting(`sub_${subName}_collapsed`, willCollapse, true);

        if (willCollapse) {
          header.classList.add('collapsed');
          content.style.maxHeight = '0';

          // Update parent section height after collapse animation
          const parentSection = header.closest('.sidebar-section');
          if (parentSection) {
            const parentContent = parentSection.querySelector(':scope > .section-content');
            const parentToggle = parentSection.querySelector(':scope > .section-toggle');

            if (parentContent && !parentToggle?.classList.contains('collapsed')) {
              setTimeout(() => {
                parentContent.style.transition = 'none';
                parentContent.style.maxHeight = 'none';
                void parentContent.offsetHeight; // Force reflow

                const height = parentContent.scrollHeight;
                parentContent.style.transition = '';

                if (height > 0) {
                  parentContent.style.maxHeight = `${height}px`;
                }
              }, 300);
            }
          }
        } else {
          // Remove collapsed class FIRST to restore padding
          header.classList.remove('collapsed');

          // Now measure with full padding
          content.style.transition = 'none';
          content.style.maxHeight = 'none';
          void content.offsetHeight; // Force reflow

          const targetHeight = content.scrollHeight;
          console.log(`[Height Debug] ${subName} click expand height: ${targetHeight}px`);

          content.style.transition = '';

          if (targetHeight > 0) {
            // Animate from 0 to target height
            content.style.maxHeight = '0';
            void content.offsetHeight;
            content.style.maxHeight = `${targetHeight}px`;

            // Get parent section and set it to accommodate the expansion
            const parentSection = header.closest('.sidebar-section');
            if (parentSection) {
              const parentContent = parentSection.querySelector(':scope > .section-content');
              const parentToggle = parentSection.querySelector(':scope > .section-toggle');

              if (parentContent && !parentToggle?.classList.contains('collapsed')) {
                // Set parent to auto height during child animation to prevent constraining
                parentContent.style.maxHeight = 'none';

                // After animation completes, set the final height
                setTimeout(() => {
                  parentContent.style.transition = 'none';
                  parentContent.style.maxHeight = 'none';
                  void parentContent.offsetHeight; // Force reflow

                  const height = parentContent.scrollHeight;
                  parentContent.style.transition = '';

                  if (height > 0) {
                    parentContent.style.maxHeight = `${height}px`;
                  }
                }, 300);
              }
            }
          }
        }
      });

      window.addEventListener('resize', () => {
        if (!header.classList.contains('collapsed')) {
          content.style.maxHeight = 'none';
          requestAnimationFrame(() => {
            if (!header.classList.contains('collapsed')) {
              const height = content.scrollHeight;
              if (height > 0) {
                content.style.maxHeight = `${height}px`;
              }
            }
          });
        }
      });
    });
  }

  // ============================================================================
  // Theme Management
  // ============================================================================

  function getEffectiveDarkMode() {
    const saved = localStorage.getItem('owntracks_settings');
    try {
      const settings = JSON.parse(saved || '{}');
      // If user has explicitly saved a darkMode preference, use it
      if (typeof settings.darkMode === 'boolean') {
        return settings.darkMode;
      }
    } catch (e) {
      logWarn('Failed to parse saved settings:', e);
    }

    // Otherwise, use system preference
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return true;
    }
    return false;
  }

  function applyTheme() {
    const darkMode = getEffectiveDarkMode();

    // Update both html and body elements
    document.documentElement.classList.toggle('dark-mode', darkMode);
    document.documentElement.classList.toggle('light-mode', !darkMode);
    document.body.classList.toggle('dark-mode', darkMode);
    document.body.classList.toggle('light-mode', !darkMode);

    // Update inline background styles
    document.documentElement.style.backgroundColor = darkMode ? '#1a1a1a' : '#f8f9fa';
    document.documentElement.style.color = darkMode ? '#e0e0e0' : '#212529';

    updateDarkModeToggle();
  }

  function updateDarkModeToggle() {
    const darkMode = getEffectiveDarkMode();
    const toggle = document.getElementById('darkModeToggle');
    const icon = toggle.querySelector('.toggle-icon');
    icon.textContent = darkMode ? '☀️' : '🌙';
  }

  function initSystemThemeListener() {
    if (!window.matchMedia) return;

    const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');
    darkModeQuery.addEventListener('change', () => {
      // Only reapply if user hasn't explicitly set a theme preference
      const saved = localStorage.getItem('owntracks_settings');
      try {
        const settings = JSON.parse(saved || '{}');
        if (typeof settings.darkMode !== 'boolean') {
          // No explicit preference, so update based on new system preference
          applyTheme();
        }
      } catch (e) {
        logWarn('Failed to parse saved settings:', e);
      }
    });
  }

  // ============================================================================
  // Date Management
  // ============================================================================

  async function setDefaultDates() {
    const savedPeriod = getSetting('timePeriod', '30days');
    const savedFrom = getSetting('fromDate', '');
    const savedTo = getSetting('toDate', '');
    const periodSelect = document.getElementById('timePeriod');
    const fromInput = document.getElementById('fromDate');
    const toInput = document.getElementById('toDate');

    if (savedPeriod) {
      periodSelect.value = savedPeriod;
    }

    if (savedFrom && savedTo) {
      fromInput.value = savedFrom.replace('T', ' ');
      fromInput.dataset.value = savedFrom;
      toInput.value = savedTo.replace('T', ' ');
      toInput.dataset.value = savedTo;
    } else {
      const today = new Date();
      const thirtyDaysAgo = new Date(today.getTime() - 29 * 24 * 60 * 60 * 1000);
      thirtyDaysAgo.setHours(0, 0, 0, 0);
      today.setHours(23, 59, 59, 999);
      const fromStr = formatDateTimeForInput(thirtyDaysAgo);
      const toStr = formatDateTimeForInput(today);
      fromInput.value = fromStr.replace('T', ' ');
      fromInput.dataset.value = fromStr;
      toInput.value = toStr.replace('T', ' ');
      toInput.dataset.value = toStr;
    }

    await handleTimePeriodChange();
    initQuickRangeButtons();
  }

  function formatDateForInput(date) {
    // Use local date components to avoid timezone conversion
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function formatDateForAPI(date, timeBoundary) {
    // Format local date to UTC for API
    // The input 'date' is in local time (e.g., local midnight)
    // We need to convert it to UTC and return the UTC date boundary

    // Get the local date components (year, month, day) from the input
    // This represents the user's intent - "this date in my timezone"
    const localYear = date.getFullYear();
    const localMonth = date.getMonth();
    const localDay = date.getDate();

    if (timeBoundary === 'start') {
      // For start times: local midnight -> UTC midnight of that local date
      // Create a date representing local midnight on the intended date
      const localMidnight = new Date(localYear, localMonth, localDay, 0, 0, 0);

      // Convert to UTC - this gives us the correct UTC timestamp
      const result = localMidnight.toISOString().substring(0, 19); // YYYY-MM-DDTHH:mm:ss in UTC
      log(`[Date Debug] Local midnight ${localMidnight} -> UTC: ${result}`);
      return result;
    } else {
      // For end times: local end of day -> UTC 23:59:59 of that local date
      // Create a date representing local end of day on the intended date
      const localEndOfDay = new Date(localYear, localMonth, localDay, 23, 59, 59, 999);

      // Convert to UTC - this gives us the correct UTC timestamp
      const result = localEndOfDay.toISOString().substring(0, 19); // YYYY-MM-DDTHH:mm:ss in UTC
      log(`[Date Debug] Local end-of-day ${localEndOfDay} -> UTC: ${result}`);
      return result;
    }
  }

  function formatCurrentTimeForAPI(date) {
    // Format current local date and time to UTC for API
    // Simply convert the local time to UTC
    return date.toISOString().substring(0, 19); // YYYY-MM-DDTHH:mm:ss in UTC
  }

  // Convert a UTC timestamp (from API) to the user's local date string (YYYY-MM-DD)
  // This is used for cache keys so they're consistent with the user's timezone
  function utcToLocalDateString(utcTimestamp) {
    const date = new Date(utcTimestamp * 1000);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const result = `${year}-${month}-${day}`;
    log(`[Date Debug] UTC timestamp ${utcTimestamp} (${date.toISOString()}) -> Local date: ${result}`);
    return result;
  }

  // Convert a local date string (from UI) to the corresponding UTC date string
  // This is used to understand which UTC day a local date selection represents
  function localDateToUtcDateString(localDateString) {
    // localDateString is YYYY-MM-DD representing local midnight
    const date = new Date(localDateString + 'T00:00:00');
    const utcDate = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
    const year = utcDate.getUTCFullYear();
    const month = String(utcDate.getUTCMonth() + 1).padStart(2, '0');
    const day = String(utcDate.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function formatDateTimeForInput(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }

  function getDateRange() {
    const period = document.getElementById('timePeriod').value;
    const now = new Date();
    let from, to;

    log('Calculating date range for period:', period);
    log('Current local date/time:', now);

    switch (period) {
      case 'today':
        // Get today's local date boundaries (midnight to now)
        from = new Date();
        from.setHours(0, 0, 0, 0);
        to = new Date(); // Current time, not end of day
        break;
      case '7days':
        from = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
        from.setHours(0, 0, 0, 0);
        to = new Date(now);
        to.setHours(23, 59, 59, 999);
        break;
      case '30days':
        from = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000);
        from.setHours(0, 0, 0, 0);
        to = new Date(now);
        to.setHours(23, 59, 59, 999);
        break;
      case '90days':
        from = new Date(now.getTime() - 89 * 24 * 60 * 60 * 1000);
        from.setHours(0, 0, 0, 0);
        to = new Date(now);
        to.setHours(23, 59, 59, 999);
        break;
      case '1year':
        from = new Date(now.getTime() - 364 * 24 * 60 * 60 * 1000);
        from.setHours(0, 0, 0, 0);
        to = new Date(now);
        to.setHours(23, 59, 59, 999);
        break;
      case 'all':
        from = new Date('2010-01-01');
        from.setHours(0, 0, 0, 0);
        to = new Date(now);
        to.setHours(23, 59, 59, 999);
        break;
      case 'custom':
        // Get dates from custom date picker (stored in dataset.value with 'T' separator)
        const fromVal = document.getElementById('fromDate').dataset.value || document.getElementById('fromDate').value;
        const toVal = document.getElementById('toDate').dataset.value || document.getElementById('toDate').value;
        from = new Date(fromVal.replace(' ', 'T'));
        to = new Date(toVal.replace(' ', 'T'));
        break;
      default:
        from = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000);
        from.setHours(0, 0, 0, 0);
        to = new Date(now);
        to.setHours(23, 59, 59, 999);
    }

    return { from, to };
  }

  function formatDisplayDate(dateValue) {
    const date = new Date(dateValue);
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }).format(date);
  }

  async function handleTimePeriodChange() {
    const period = document.getElementById('timePeriod').value;
    const isCustom = period === 'custom';
    const customDateRow = document.getElementById('customDateRow');
    const quickDateRanges = document.getElementById('quickDateRanges');
    const prevDisplay = customDateRow.style.display;
    customDateRow.style.display = isCustom ? 'block' : 'none';
    quickDateRanges.style.display = isCustom ? 'block' : 'none';

    // Update the date inputs to reflect the new period
    if (!isCustom) {
      const { from, to } = getDateRange();
      const fromStr = formatDateTimeForInput(from);
      const toStr = formatDateTimeForInput(to);
      const fromInput = document.getElementById('fromDate');
      const toInput = document.getElementById('toDate');
      fromInput.value = fromStr.replace('T', ' ');
      fromInput.dataset.value = fromStr;
      toInput.value = toStr.replace('T', ' ');
      toInput.dataset.value = toStr;
      // Save the new dates
      saveSetting('fromDate', fromStr, '');
      saveSetting('toDate', toStr, '');
    }

    // Update the refresh button state
    await updateRefreshButton();

    // If the display state changed, update parent section height
    if (prevDisplay !== customDateRow.style.display) {
      setTimeout(() => {
        const parentSection = customDateRow.closest('.sidebar-section');
        if (parentSection) {
          const parentContent = parentSection.querySelector(':scope > .section-content');
          const toggle = parentSection.querySelector(':scope > .section-toggle');
          if (parentContent && !toggle.classList.contains('collapsed')) {
            parentContent.style.maxHeight = 'none';
            requestAnimationFrame(() => {
              const height = parentContent.scrollHeight;
              if (height > 0) {
                parentContent.style.maxHeight = `${height}px`;
              }
            });
          }
        }
      }, 50);
    }
  }

  function initQuickRangeButtons() {
    const quickRangeButtons = document.querySelectorAll('.quick-range');
    quickRangeButtons.forEach(button => {
      button.addEventListener('click', () => {
        const range = button.getAttribute('data-range');
        const now = new Date();
        let fromDate, toDate;

        switch (range) {
          case 'today':
            fromDate = new Date(now);
            fromDate.setHours(0, 0, 0, 0);
            toDate = new Date(now);
            toDate.setHours(23, 59, 59, 999);
            break;
          case 'yesterday':
            fromDate = new Date(now);
            fromDate.setDate(fromDate.getDate() - 1);
            fromDate.setHours(0, 0, 0, 0);
            toDate = new Date(fromDate);
            toDate.setHours(23, 59, 59, 999);
            break;
          case 'thisweek':
            fromDate = new Date(now);
            const dayOfWeek = fromDate.getDay();
            const diff = fromDate.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
            fromDate.setDate(diff);
            fromDate.setHours(0, 0, 0, 0);
            toDate = new Date(now);
            toDate.setHours(23, 59, 59, 999);
            break;
          case 'lastweek':
            fromDate = new Date(now);
            const lastWeekDay = fromDate.getDay();
            const lastWeekDiff = fromDate.getDate() - lastWeekDay + (lastWeekDay === 0 ? -6 : 1) - 7;
            fromDate.setDate(lastWeekDiff);
            fromDate.setHours(0, 0, 0, 0);
            toDate = new Date(fromDate);
            toDate.setDate(toDate.getDate() + 6);
            toDate.setHours(23, 59, 59, 999);
            break;
          case 'thismonth':
            fromDate = new Date(now.getFullYear(), now.getMonth(), 1);
            fromDate.setHours(0, 0, 0, 0);
            toDate = new Date(now);
            toDate.setHours(23, 59, 59, 999);
            break;
          case 'lastmonth':
            fromDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            fromDate.setHours(0, 0, 0, 0);
            toDate = new Date(now.getFullYear(), now.getMonth(), 0);
            toDate.setHours(23, 59, 59, 999);
            break;
          case 'thisyear':
            fromDate = new Date(now.getFullYear(), 0, 1);
            fromDate.setHours(0, 0, 0, 0);
            toDate = new Date(now);
            toDate.setHours(23, 59, 59, 999);
            break;
        }

        const fromInput = document.getElementById('fromDate');
        const toInput = document.getElementById('toDate');
        const fromStr = formatDateTimeForInput(fromDate);
        const toStr = formatDateTimeForInput(toDate);
        fromInput.value = fromStr.replace('T', ' ');
        fromInput.dataset.value = fromStr;
        toInput.value = toStr.replace('T', ' ');
        toInput.dataset.value = toStr;
      });
    });
  }

  // ============================================================================
  // API Functions
  // ============================================================================

  function buildAuthHeaders() {
    const headers = {};
    const api = window.CONFIG.api || {};

    // Add basic auth header if both username and password are configured
    if (api.username !== undefined && api.password !== undefined) {
      const auth = btoa(`${api.username}:${api.password}`);
      headers['Authorization'] = `Basic ${auth}`;
    }

    // Add cookie header if both cookieName and cookieValue are configured
    if (api.cookieName !== undefined && api.cookieValue !== undefined) {
      headers['Cookie'] = `${api.cookieName}=${api.cookieValue}`;
    }

    return headers;
  }

  async function fetchWithTimeout(url, options = {}) {
    // Default to 10 minutes, configurable in config.js
    const timeout = window.CONFIG.api?.timeout || 600000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('Request timed out. Please try again.');
      }
      throw error;
    }
  }

  async function fetchUsersAndDevices() {
    try {
      showLoading('Loading users...');

      // Fetch users
      const usersUrl = `${window.CONFIG.api.url}/api/0/list`;

      const response = await fetchWithTimeout(usersUrl, {
        headers: buildAuthHeaders()
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch users: ${response.status}`);
      }

      const usersData = await response.json();
      state.data.users = usersData.results || usersData.result || [];

      // Populate user dropdown
      const userSelect = document.getElementById('userSelect');
      userSelect.innerHTML = '<option value="">Select user</option>';
      state.data.users.forEach(user => {
        const option = document.createElement('option');
        option.value = user;
        option.textContent = user;
        userSelect.appendChild(option);
      });

      // Restore previously selected user, or use config default
      const savedUser = getSetting('selectedUser', '');
      const defaultUser = window.CONFIG.defaults?.user;
      const userToSelect = savedUser || defaultUser;

      if (userToSelect && state.data.users.includes(userToSelect)) {
        userSelect.value = userToSelect;
        await fetchDevices(userToSelect);
      }

      // Recalculate section heights after dropdowns are populated
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          recalculateAllSectionHeights();
        });
      });

      hideLoading();

    } catch (error) {
      showLoadingError('Failed to load users: ' + error.message);
      setTimeout(() => {
        hideLoading();
        showError('Failed to load users: ' + error.message);
      }, 3000);
    }
  }

  async function fetchDevices(user) {
    if (!user) return;

    try {
      showLoading('Loading devices...');

      const devicesUrl = `${window.CONFIG.api.url}/api/0/list?user=${encodeURIComponent(user)}`;

      const response = await fetchWithTimeout(devicesUrl, {
        headers: buildAuthHeaders()
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch devices: ${response.status}`);
      }

      const devicesData = await response.json();
      state.data.devices = devicesData.results || devicesData.result || [];

      // Populate device dropdown
      const deviceSelect = document.getElementById('deviceSelect');
      deviceSelect.innerHTML = '<option value="">Select device</option>';
      state.data.devices.forEach(device => {
        const option = document.createElement('option');
        option.value = device;
        option.textContent = device;
        deviceSelect.appendChild(option);
      });

      // Restore previously selected device, or use config default
      const savedDevice = getSetting('selectedDevice', '');
      const defaultDevice = window.CONFIG.defaults?.device;
      const deviceToSelect = savedDevice || defaultDevice;

      if (deviceToSelect && state.data.devices.includes(deviceToSelect)) {
        deviceSelect.value = deviceToSelect;
      }

      if (user && deviceSelect.value) {
        // Only auto-load if there's cached data
        const storageEnabled = getSetting('storageEnabled', true);
        if (storageEnabled) {
          const cachedDays = await getCachedDays(user, deviceSelect.value);
          if (cachedDays.size > 0) {
            // Has cached data, load it
            await loadData();
          }
          // Otherwise, remain blank until user explicitly clicks "Load Data"
        }
        // If storage is disabled, don't auto-load - wait for explicit user action
      }

      // Recalculate section heights after device dropdown is populated
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          recalculateAllSectionHeights();
        });
      });

      hideLoading();

    } catch (error) {
      showLoadingError('Failed to load devices: ' + error.message);
      setTimeout(() => {
        hideLoading();
        showError('Failed to load devices: ' + error.message);
      }, 3000);
    }
  }

  async function loadData() {
    const user = document.getElementById('userSelect').value;
    const device = document.getElementById('deviceSelect').value;

    if (!user || !device) {
      showError('Please select both user and device.');
      return;
    }

    const { from, to } = getDateRange();
    const fromDate = formatDateForInput(from);
    const toDate = formatDateForInput(to);
    const requestedDays = getDaysInRange(fromDate, toDate);

    try {
      // Check if storage is enabled
      const storageEnabled = getSetting('storageEnabled', true);

      let allData = [];
      let cachedPointCount = 0;
      let freshPointCount = 0;

      if (storageEnabled) {
        // Load cached days
        const cachedDays = await getCachedDays(user, device);
        log('Requested days:', requestedDays);
        log('Cached days:', Array.from(cachedDays));
        const daysToLoad = requestedDays.filter(day => cachedDays.has(day));
        log('Days to load from cache:', daysToLoad);

        if (daysToLoad.length > 0) {
          showLoading(`Loading ${daysToLoad.length} cached days...`);
          allData = await loadCachedDays(user, device, daysToLoad);
          cachedPointCount = allData.length;
        }
      }

      // Find uncached day ranges
      const uncachedRanges = storageEnabled
        ? await getUncachedDayRanges(user, device, requestedDays)
        : [{ from: fromDate, to: toDate }];

      log('Uncached ranges:', uncachedRanges);

      // Fetch uncached data
      if (uncachedRanges.length > 0) {
        const totalDays = uncachedRanges.reduce((sum, r) => {
          const days = getDaysInRange(r.from, r.to);
          return sum + days.length;
        }, 0);

        for (const range of uncachedRanges) {
          const daysInThisRange = getDaysInRange(range.from, range.to);
          showLoading(
            `Fetching ${daysInThisRange.length} day${daysInThisRange.length > 1 ? 's' : ''} from API...`,
            'This may take several minutes for large date ranges.'
          );

          const rangeFrom = new Date(range.from + 'T00:00:00');
          const rangeTo = new Date(range.to + 'T23:59:59');

          // Check if this range includes today and today is already cached
          // If so, do a smart incremental update from the last cached point to midnight
          const todayKey = formatDateForInput(new Date());
          const todayInThisRange = daysInThisRange.includes(todayKey);
          const cachedDays = await getCachedDays(user, device);
          let effectiveRangeFrom = rangeFrom;
          let effectiveRangeTo = rangeTo;

          if (storageEnabled && todayInThisRange && cachedDays.has(todayKey)) {
            // Smart incremental update for today - from last cached point to midnight
            const latestCachedTs = await getLatestCachedTimestamp(user, device, [todayKey]);
            if (latestCachedTs) {
              const midnightTonight = new Date(range.to + 'T23:59:59');
              effectiveRangeFrom = new Date((latestCachedTs + 1) * 1000);

              // Only do incremental if we haven't reached midnight yet
              if (effectiveRangeFrom >= midnightTonight) {
                log('[Smart Load] Today already cached up to midnight, skipping');
                continue;
              }

              effectiveRangeTo = midnightTonight;
              log('[Smart Load] Incremental update for today from', effectiveRangeFrom, 'to', effectiveRangeTo);
            }
          }

          // Use local time formatting to avoid timezone issues
          const fromStr = formatDateForAPI(effectiveRangeFrom, 'start');
          const toStr = formatDateForAPI(effectiveRangeTo, 'end');

          log(`[Date Debug] API Request: User ${user}, Device ${device}`);
          log(`[Date Debug] Requested local range: ${range.from} to ${range.to}`);
          log(`[Date Debug] Local date objects: ${effectiveRangeFrom.toLocaleString()} to ${effectiveRangeTo.toLocaleString()}`);
          log(`[Date Debug] UTC for API: from=${fromStr}, to=${toStr}`);

          const locationsUrl = `${window.CONFIG.api.url}/api/0/locations?` +
            `from=${encodeURIComponent(fromStr)}&` +
            `to=${encodeURIComponent(toStr)}&` +
            `user=${encodeURIComponent(user)}&` +
            `device=${encodeURIComponent(device)}&` +
            `format=json`;

          const response = await fetchWithTimeout(locationsUrl, {
            headers: buildAuthHeaders()
          });

          if (!response.ok) {
            throw new Error(`Failed to fetch locations: ${response.status}`);
          }

          const result = await response.json();
          const rangeData = result.data || [];

          // Track fresh point count
          freshPointCount += rangeData.length;

          // Cache the data by day if storage is enabled
          if (storageEnabled && rangeData.length > 0) {
            const dailyData = splitDataByDays(rangeData, range.from, range.to);
            await cacheDailyData(user, device, dailyData);
          }

          allData = allData.concat(rangeData);
        }
      }

      // Sort data by timestamp
      allData.sort((a, b) => a.tst - b.tst);
      state.data.raw = allData;

      // Store source breakdown for indicator
      state.data.sourceBreakdown = {
        cached: cachedPointCount,
        fresh: freshPointCount
      };

      // Handle empty results
      if (state.data.raw.length === 0) {
        // Clear data layers but keep current map position
        clearMapLayersOnly();
        hideLoading();
        updateHeaderStatus('No data found for selected date range');
        return;
      }

      // Show recenter button when we have data
      document.getElementById('recenterBtn').style.display = 'block';

      // Update time range
      state.data.timeRange = {
        start: Math.min(...state.data.raw.map(p => p.tst)),
        end: Math.max(...state.data.raw.map(p => p.tst))
      };

      // Calculate max accuracy
      state.data.maxAccuracy = 0;
      state.data.raw.forEach(point => {
        if (point.acc && point.acc > state.data.maxAccuracy) {
          state.data.maxAccuracy = point.acc;
        }
      });

      // Update accuracy slider max
      const sliderMax = Math.max(500, Math.ceil(state.data.maxAccuracy / 10) * 10);
      document.getElementById('accuracySlider').max = sliderMax;

      // Apply accuracy filter
      applyAccuracyFilter();

      // Update stats and cache status
      updateStats();
      await updateRefreshButton();

      // Redraw map
      redrawMap();

      hideLoading();

      // Fit map to data bounds if setting is enabled, otherwise restore saved position
      if (getSetting('autoFitToBounds', true) && state.data.filtered.length > 0) {
        fitMapToBounds();
      } else {
        restoreMapPosition();
      }

      // Update data source indicator
      const hasCached = state.data.sourceBreakdown.cached > 0;
      const hasFresh = state.data.sourceBreakdown.fresh > 0;

      if (hasCached && hasFresh) {
        updateDataSourceIndicator('mixed');
      } else if (hasCached) {
        updateDataSourceIndicator(true);
      } else {
        updateDataSourceIndicator(false);
      }

    } catch (error) {
      showLoadingError('Failed to load locations: ' + error.message);
      setTimeout(() => {
        hideLoading();
        clearMapData();
        showError('Failed to load locations: ' + error.message);
      }, 3000);
    }
  }

  function clearMapData() {
    state.data.raw = [];
    state.data.filtered = [];
    state.data.maxAccuracy = 0;
    state.data.timeRange = { start: null, end: null };
    state.data.sourceBreakdown = { cached: 0, fresh: 0 };
    redrawMap();
    updateStats();
    updateDataSourceIndicator(false);
    document.getElementById('recenterBtn').style.display = 'none';
  }

  function clearMapLayersOnly() {
    state.data.raw = [];
    state.data.filtered = [];
    state.data.maxAccuracy = 0;
    state.data.timeRange = { start: null, end: null };
    state.data.sourceBreakdown = { cached: 0, fresh: 0 };
    redrawMap();
    updateStats();
    updateDataSourceIndicator(false);
    document.getElementById('recenterBtn').style.display = 'none';
    // Note: We don't fit bounds here, so current map position is preserved
  }

  // ============================================================================
  // IndexedDB Cache Management
  // ============================================================================

  const DB_NAME = 'OwnTracksCache';
  const DB_VERSION = 1;
  const STORE_CACHE = 'cacheDays';
  const STORE_INDEX = 'cacheIndex';

  // IndexedDB helper with promise-based API
  const idbHelper = {
    db: null,

    // Open the database and create schema if needed
    async open() {
      if (this.db) return this.db;

      return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          this.db = request.result;
          resolve(this.db);
        };

        request.onupgradeneeded = (event) => {
          const db = event.target.result;

          // Create cacheDays store with compound key [user, device, date]
          if (!db.objectStoreNames.contains(STORE_CACHE)) {
            const cacheStore = db.createObjectStore(STORE_CACHE, {
              keyPath: ['user', 'device', 'date']
            });
            log('Created IndexedDB cache store');
          }

          // Create cacheIndex store for tracking cached days per user/device
          if (!db.objectStoreNames.contains(STORE_INDEX)) {
            const indexStore = db.createObjectStore(STORE_INDEX, {
              keyPath: ['user', 'device']
            });
            log('Created IndexedDB index store');
          }
        };
      });
    },

    // Get cached days for a user/device
    async getCachedDays(user, device) {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_INDEX], 'readonly');
        const store = tx.objectStore(STORE_INDEX);
        const request = store.get([user, device]);

        request.onsuccess = () => {
          const result = request.result;
          if (result && result.days) {
            resolve(new Set(result.days));
          } else {
            resolve(new Set());
          }
        };
        request.onerror = () => reject(request.error);
      });
    },

    // Update cache index with new days
    async updateCacheIndex(user, device, newDays) {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_INDEX], 'readwrite');
        const store = tx.objectStore(STORE_INDEX);

        // Get existing index
        const getRequest = store.get([user, device]);
        getRequest.onsuccess = () => {
          const existing = getRequest.result || { days: [] };
          const existingDays = new Set(existing.days || []);
          newDays.forEach(day => existingDays.add(day));

          // Put updated index
          const putRequest = store.put({
            user,
            device,
            days: Array.from(existingDays),
            lastUpdated: new Date().toISOString()
          });

          putRequest.onerror = () => reject(putRequest.error);
        };
        getRequest.onerror = () => reject(getRequest.error);

        // Wait for transaction to complete
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    },

    // Get cached data for specific days
    async getCachedData(user, device, days) {
      const db = await this.open();
      const results = [];

      for (const day of days) {
        const dayData = await this.getDayData(user, device, day);
        if (dayData) {
          results.push(...dayData);
        }
      }

      return results;
    },

    // Get data for a single day
    async getDayData(user, device, dateStr) {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_CACHE], 'readonly');
        const store = tx.objectStore(STORE_CACHE);
        const request = store.get([user, device, dateStr]);

        request.onsuccess = () => {
          const result = request.result;
          if (result && result.data) {
            try {
              const points = decompressPoints(result.data);
              resolve(points);
            } catch (e) {
              logWarn(`Failed to decompress cached day ${dateStr}:`, e);
              resolve([]);
            }
          } else {
            resolve([]);
          }
        };
        request.onerror = () => reject(request.error);
      });
    },

    // Store data for a specific day
    async setDayData(user, device, dateStr, points) {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        try {
          const compressed = compressPoints(points);

          const tx = db.transaction([STORE_CACHE], 'readwrite');
          const store = tx.objectStore(STORE_CACHE);

          const request = store.put({
            user,
            device,
            date: dateStr,
            data: compressed, // Store as raw Uint8Array or string
            cachedAt: new Date().toISOString()
          });

          request.onsuccess = () => {
            log(`Cached ${points.length} points for ${dateStr}`);
          };
          request.onerror = () => reject(request.error);

          // Wait for transaction to complete
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => reject(tx.error);
        } catch (e) {
          reject(e);
        }
      });
    },

    // Get latest cached timestamp for a set of days
    async getLatestCachedTimestamp(user, device, days) {
      const data = await this.getCachedData(user, device, days);
      if (!data.length) return null;
      return Math.max(...data.map(point => Number(point.tst) || 0));
    },

    // Clear all cache data for all users/devices
    async clearAllCache() {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_CACHE, STORE_INDEX], 'readwrite');

        const cacheStore = tx.objectStore(STORE_CACHE);
        cacheStore.clear();

        const indexStore = tx.objectStore(STORE_INDEX);
        indexStore.clear();

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    },

    // Clear cache for a specific user/device
    async clearUserCache(user, device) {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_CACHE, STORE_INDEX], 'readwrite');

        // Clear index for this user/device
        const indexStore = tx.objectStore(STORE_INDEX);
        indexStore.delete([user, device]);

        // Clear all cache entries for this user/device
        // Note: We need to iterate since we can't do a range delete on compound keys efficiently
        const cacheStore = tx.objectStore(STORE_CACHE);
        const request = cacheStore.openCursor(
          IDBKeyRange.bound([user, device, ''], [user, device, '￿'])
        );

        request.onsuccess = (event) => {
          const cursor = event.target.result;
          if (cursor) {
            cursor.delete();
            cursor.continue();
          }
        };

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    },

    // Calculate storage usage for IndexedDB
    async getStorageUsage() {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        let totalBytes = 0;

        const tx = db.transaction([STORE_CACHE], 'readonly');
        const store = tx.objectStore(STORE_CACHE);
        const request = store.openCursor();

        request.onsuccess = (event) => {
          const cursor = event.target.result;
          if (cursor) {
            const value = cursor.value;
            // Estimate size: data buffer size + metadata
            if (value.data) {
              if (value.data instanceof Uint8Array) {
                totalBytes += value.data.byteLength;
              } else {
                totalBytes += value.data.length * 2; // UTF-16 string
              }
            }
            cursor.continue();
          }
        };

        tx.oncomplete = () => resolve(totalBytes);
        tx.onerror = () => reject(tx.error);
      });
    }
  };

  // ============================================================================
  // Data Management
  // ============================================================================

  // Get all days in a date range as YYYY-MM-DD strings
  function getDaysInRange(fromDate, toDate) {
    const days = [];
    const current = new Date(fromDate);
    const end = new Date(toDate);

    // Normalize both dates to midnight for accurate comparison
    current.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);

    while (current.getTime() <= end.getTime()) {
      days.push(formatDateForInput(current));
      current.setDate(current.getDate() + 1);
    }

    return days;
  }

  // Get cache index key for user/device (kept for compatibility, now uses IndexedDB)
  function getCacheIndexKey(user, device) {
    const baseKey = window.CONFIG.storage?.key ?? 'owntracks_cache';
    return `${baseKey}_${user}_${device}_index`;
  }

  // Get cache key for a specific day (kept for compatibility, now uses IndexedDB)
  function getDayCacheKey(user, device, dateStr) {
    const baseKey = window.CONFIG.storage?.key ?? 'owntracks_cache';
    return `${baseKey}_${user}_${device}_${dateStr}`;
  }

  // Get set of cached days for user/device (now uses IndexedDB)
  async function getCachedDays(user, device) {
    try {
      return await idbHelper.getCachedDays(user, device);
    } catch (e) {
      logWarn('Failed to get cached days from IndexedDB:', e);
      return new Set();
    }
  }

  // Update cache index with new days (now uses IndexedDB)
  async function updateCacheIndex(user, device, newDays) {
    try {
      await idbHelper.updateCacheIndex(user, device, newDays);
    } catch (e) {
      logWarn('Failed to update cache index:', e);
    }
  }

  // Get latest cached timestamp (now uses IndexedDB)
  async function getLatestCachedTimestamp(user, device, days) {
    try {
      return await idbHelper.getLatestCachedTimestamp(user, device, days);
    } catch (e) {
      logWarn('Failed to get latest cached timestamp:', e);
      return null;
    }
  }

  // Load cached data for specific days (now uses IndexedDB)
  async function loadCachedDays(user, device, days) {
    try {
      return await idbHelper.getCachedData(user, device, days);
    } catch (e) {
      logWarn('Failed to load cached days:', e);
      return [];
    }
  }

  // Split API response data into per-day chunks
  // Cache keys use LOCAL dates (user's timezone) for consistency
  function splitDataByDays(data, fromDate, toDate) {
    const dailyData = {};
    const days = getDaysInRange(fromDate, toDate);

    // Initialize empty arrays for each day
    days.forEach(day => {
      dailyData[day] = [];
    });

    // Split points by their LOCAL timestamp date (user's timezone)
    data.forEach(point => {
      // Convert UTC timestamp to local date string for cache key
      const dateStr = utcToLocalDateString(point.tst);

      // Only include points within our requested range
      if (dailyData.hasOwnProperty(dateStr)) {
        dailyData[dateStr].push(point);
      }
    });

    return dailyData;
  }

  // Convert Uint8Array to base64 string (for legacy localStorage compatibility)
  function uint8ArrayToBase64(bytes) {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  // Convert base64 string back to Uint8Array (for legacy localStorage compatibility)
  function base64ToUint8Array(base64) {
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  // Compress data using gzip compression
  // Returns Uint8Array for IndexedDB storage (no base64 overhead)
  function compressPoints(points) {
    if (!points || points.length === 0) return new Uint8Array(0);

    // Round coordinates to 5 decimal places (~1 meter precision) to reduce storage size
    const optimized = points.map(p => ({
      ...p,
      lat: Math.round(p.lat * 100000) / 100000,
      lon: Math.round(p.lon * 100000) / 100000
    }));

    const jsonStr = JSON.stringify(optimized);

    // Check if pako is available for gzip compression
    if (typeof window.pako !== 'undefined') {
      try {
        // Compress with gzip (highest compression level)
        // Return Uint8Array directly for IndexedDB (no base64 conversion!)
        return window.pako.gzip(jsonStr, { level: 9 });
      } catch (e) {
        logWarn('Gzip compression failed, using uncompressed:', e);
        // Return as Uint8Array for consistency
        const encoder = new TextEncoder();
        return encoder.encode(jsonStr);
      }
    }

    // Fallback: encode JSON string to Uint8Array
    const encoder = new TextEncoder();
    return encoder.encode(jsonStr);
  }

  // Decompress data back to point objects
  // Handles both Uint8Array (IndexedDB) and base64 strings (legacy localStorage)
  function decompressPoints(compressed) {
    if (!compressed) return [];

    // Handle empty Uint8Array
    if (compressed instanceof Uint8Array && compressed.byteLength === 0) {
      return [];
    }

    let jsonStr;

    // Check if input is Uint8Array (from IndexedDB)
    if (compressed instanceof Uint8Array) {
      if (typeof window.pako !== 'undefined') {
        try {
          // Try to decompress as gzip
          const decompressed = window.pako.ungzip(compressed, { to: 'string' });
          jsonStr = decompressed;
        } catch (e) {
          // Not compressed, decode as UTF-8
          const decoder = new TextDecoder();
          jsonStr = decoder.decode(compressed);
        }
      } else {
        // No pako, decode as UTF-8
        const decoder = new TextDecoder();
        jsonStr = decoder.decode(compressed);
      }
    } else if (typeof compressed === 'string') {
      // Legacy base64 format from localStorage
      // Check if it's base64-encoded gzip data (no newlines, valid base64 chars)
      if (typeof window.pako !== 'undefined' && !compressed.includes(' ') && compressed.length > 50) {
        try {
          const compressedData = base64ToUint8Array(compressed);
          const decompressed = window.pako.ungzip(compressedData, { to: 'string' });
          jsonStr = decompressed;
        } catch (e) {
          // Not compressed data, use as-is
          jsonStr = compressed;
        }
      } else {
        // Plain JSON
        jsonStr = compressed;
      }
    } else {
      logWarn('Unknown compressed data type:', typeof compressed);
      return [];
    }

    const data = JSON.parse(jsonStr);

    // Handle both new format (direct array) and legacy format (object with points array)
    if (Array.isArray(data)) {
      return data;
    } else if (data.points && Array.isArray(data.points)) {
      return data.points;
    }

    return [];
  }

  // Store daily data chunks to IndexedDB cache with compression
  async function cacheDailyData(user, device, dailyData) {
    const successfullyCached = [];

    for (const [day, points] of Object.entries(dailyData)) {
      try {
        // Compress and store the data directly to IndexedDB
        await idbHelper.setDayData(user, device, day, points);
        successfullyCached.push(day);
      } catch (e) {
        logWarn(`Failed to cache ${day} (${points.length} points):`, e);

        // Show a warning to the user
        const warningEl = document.getElementById('headerStatus');
        if (warningEl) {
          warningEl.textContent = `Warning: Failed to cache data for ${day}`;
          setTimeout(() => {
            if (warningEl.textContent.includes('Failed to cache')) {
              warningEl.textContent = '';
            }
          }, 5000);
        }
      }
    }

    // Update index with successfully cached days
    if (successfullyCached.length > 0) {
      await updateCacheIndex(user, device, successfullyCached);
    }
  }

  // Get date ranges for uncached days (for API calls)
  async function getUncachedDayRanges(user, device, requestedDays) {
    const cachedDays = await getCachedDays(user, device);
    const uncachedDays = requestedDays.filter(day => !cachedDays.has(day));

    if (uncachedDays.length === 0) {
      return [];
    }

    // Group consecutive days into ranges
    const ranges = [];
    let currentRange = { from: uncachedDays[0], to: uncachedDays[0] };

    for (let i = 1; i < uncachedDays.length; i++) {
      const prevDate = new Date(uncachedDays[i - 1]);
      const currDate = new Date(uncachedDays[i]);
      const dayDiff = (currDate - prevDate) / (1000 * 60 * 60 * 24);

      if (dayDiff === 1) {
        // Consecutive day
        currentRange.to = uncachedDays[i];
      } else {
        // Gap - start new range
        ranges.push({ ...currentRange });
        currentRange = { from: uncachedDays[i], to: uncachedDays[i] };
      }
    }

    ranges.push(currentRange);
    return ranges;
  }

  function applyAccuracyFilter() {
    const maxAccuracy = getSetting('accuracyMaxMeters', 0);

    if (maxAccuracy === 0) {
      state.data.filtered = state.data.raw;
    } else {
      state.data.filtered = state.data.raw.filter(point => {
        return !point.acc || point.acc <= maxAccuracy;
      });
    }

    updateStats();
  }

  async function handleUserChange() {
    const user = document.getElementById('userSelect').value;
    saveSetting('selectedUser', user, '');
    await fetchDevices(user);
    await updateRefreshButton();
  }

  async function handleDeviceChange() {
    const device = document.getElementById('deviceSelect').value;
    saveSetting('selectedDevice', device, '');
    await updateRefreshButton();
  }

  // ============================================================================
  // Map Rendering
  // ============================================================================

  function buildHeatmapGradient(lowColor, midColor, highColor) {
    // Build gradient object from the three color stops
    return {
      0.0: lowColor,
      0.5: midColor,
      1.0: highColor
    };
  }

  function redrawMap() {
    if (!state.map || state.data.filtered.length === 0) return;

    // Clear existing layers
    state.layers.points.clearLayers();
    state.layers.lines.clearLayers();
    if (state.layers.heatmap) {
      state.map.removeLayer(state.layers.heatmap);
      state.layers.heatmap = null;
    }

    const showPoints = getSetting('showPoints', true);
    const showLines = getSetting('showLines', true);
    const heatmapEnabled = getSetting('heatmapEnabled', false);
    const altitudeEnabled = getSetting('altitudeEnabled', false);
    const altitudeLinesEnabled = getSetting('altitudeLinesEnabled', false);

    // Get display settings
    const pointColor = getSetting('pointColor', '#3388ff');
    const lineColor = getSetting('lineColor', '#3388ff');

    const pointSize = getSetting('pointSize', 2);
    const pointOpacity = getSetting('pointOpacity', 0.5);
    const lineWidth = getSetting('lineWidth', 3);
    const lineOpacity = getSetting('lineOpacity', 0.7);
    const smoothLines = getSetting('smoothLines', false);

    // Altitude settings with separate colors for points and lines
    const altMin = getSetting('altitudeMin', 0);
    const altMax = getSetting('altitudeMax', 1000);
    const altPointsLowColor = getSetting('altitudePointsLowColor', '#00ff00');
    const altPointsHighColor = getSetting('altitudePointsHighColor', '#ff0000');
    const altLinesLowColor = getSetting('altitudeLinesLowColor', '#00ff00');
    const altLinesHighColor = getSetting('altitudeLinesHighColor', '#ff0000');

    // Calculate smart sample rate considering both zoom level and point count
    const totalPoints = state.data.filtered.length;
    const zoom = state.map.getZoom();
    const dynamicVisibilityEnabled = getSetting('dynamicPointVisibility', true);

    // Target number of points to render for optimal performance
    const targetPoints = 3000; // Aim for ~3000 visible points

    let pointSampleRate = 1;
    let lineSampleRate = 1;

    if (dynamicVisibilityEnabled && totalPoints > 2000) {
      // Calculate sample rate based on both zoom and total points
      // Higher zoom = more detail, Lower zoom = more aggressive sampling
      const zoomFactor = Math.max(0.05, (zoom - 2) / 14); // 0.05 to 1.0 based on zoom
      const densityFactor = Math.max(0.1, targetPoints / totalPoints); // Reduce if many points

      // Combine factors: multiply so zoom level still matters for large datasets
      // This allows showing progressively more points as you zoom in
      const combinedFactor = zoomFactor * densityFactor;

      // Calculate sample rate with logarithmic scaling for smoother transitions
      // Much smaller thresholds now since we're multiplying factors
      if (combinedFactor < 0.01) {
        // Very zoomed out: aggressive sampling (1/20 to 1/50 of points)
        pointSampleRate = Math.max(10, Math.min(50, Math.ceil(100 * combinedFactor / 2)));
      } else if (combinedFactor < 0.05) {
        // Zoomed out: moderate sampling
        pointSampleRate = Math.max(5, Math.min(20, Math.ceil(1 / combinedFactor / 2)));
      } else if (combinedFactor < 0.15) {
        // Mid zoom: light sampling
        pointSampleRate = Math.max(2, Math.min(10, Math.ceil(1 / combinedFactor / 3)));
      } else {
        // Zoomed in: show all points
        pointSampleRate = 1;
      }

      // Lines use less aggressive sampling - they're cheaper to render
      // and we want to maintain route continuity even when points are sampled
      if (totalPoints > 50000) {
        lineSampleRate = Math.max(2, Math.min(pointSampleRate / 2, 5));
      } else if (totalPoints > 20000) {
        lineSampleRate = Math.max(2, Math.min(pointSampleRate / 3, 3));
      } else {
        lineSampleRate = 1;
      }
    }

    const sampledForPoints = state.data.filtered.filter((_, i) => i % pointSampleRate === 0);
    const sampledForLines = state.data.filtered.filter((_, i) => i % lineSampleRate === 0);

    // Draw points
    if (showPoints) {
      sampledForPoints.forEach(point => {
        let color = pointColor;
        let fillColor = pointColor;

        if (altitudeEnabled && point.alt !== undefined && point.alt !== null) {
          color = getAltitudeColor(point.alt, altMin, altMax, altPointsLowColor, altPointsHighColor);
          fillColor = color;
        }

        const marker = createPointMarker(point.lat, point.lon, {
          color,
          fillColor,
          radius: pointSize,
          opacity: pointOpacity
        });

        // Add popup
        const popupContent = createPopupContent(point);
        marker.bindPopup(popupContent);

        // Skip tooltips and hitboxes for performance - popup on click is sufficient
        state.layers.points.addLayer(marker);
      });
    }

    // Draw lines - simplified for better performance
    if (showLines && sampledForLines.length > 1) {
      // If no altitude gradient, draw single polyline (much faster)
      if (!altitudeLinesEnabled) {
        const latlngs = sampledForLines.map(p => [p.lat, p.lon]);
        L.polyline(latlngs, {
          color: lineColor,
          weight: lineWidth,
          opacity: lineOpacity,
          smoothFactor: smoothLines ? 1 : 0
        }).addTo(state.layers.lines);
      } else {
        // Altitude gradient: use segments (slower but necessary for per-segment colors)
        const latlngs = [];
        const colors = [];

        for (let i = 0; i < sampledForLines.length - 1; i++) {
          const p1 = sampledForLines[i];
          const p2 = sampledForLines[i + 1];

          if (!p1 || !p2) continue;

          latlngs.push([[p1.lat, p1.lon], [p2.lat, p2.lon]]);

          const segmentColor = getAltitudeColor(
            p1.alt || 0, altMin, altMax,
            altLinesLowColor, altLinesHighColor
          );
          colors.push(segmentColor);
        }

        // Draw each segment with its color
        latlngs.forEach((segment, i) => {
          L.polyline(segment, {
            color: colors[i],
            weight: lineWidth,
            opacity: lineOpacity,
            smoothFactor: 0 // No smoothing for segments
          }).addTo(state.layers.lines);
        });
      }
    }

    // Draw heatmap
    if (heatmapEnabled && sampledForPoints.length > 0) {
      const heatmapData = sampledForPoints
        .filter(p => p.lat && p.lon)
        .map(p => [p.lat, p.lon, 0.5]);

      // Dynamic radius and blur based on zoom level
      const zoom = state.map.getZoom();
      const baseRadius = getSetting('heatmapRadius', getHeatmapSetting('radius'));
      const baseBlur = getSetting('heatmapBlur', getHeatmapSetting('blur'));

      // Adjust radius and blur based on zoom for better visualization
      // At higher zoom (closer), use smaller radius for more detail
      // At lower zoom (farther), use larger radius for better coverage
      let zoomAdjustedRadius = baseRadius;
      let zoomAdjustedBlur = baseBlur;

      if (zoom < 8) {
        // Far zoom - increase radius and blur for better coverage
        zoomAdjustedRadius = baseRadius * 1.5;
        zoomAdjustedBlur = baseBlur * 1.3;
      } else if (zoom > 14) {
        // Close zoom - decrease radius and blur for more detail
        zoomAdjustedRadius = baseRadius * 0.7;
        zoomAdjustedBlur = baseBlur * 0.8;
      }

      state.layers.heatmap = L.heatLayer(heatmapData, {
        radius: zoomAdjustedRadius,
        blur: zoomAdjustedBlur,
        minOpacity: getSetting('heatmapMinOpacity', getHeatmapSetting('minOpacity')),
        maxZoom: 18, // Limit max zoom for heatmap performance
        gradient: buildHeatmapGradient(
          getSetting('heatmapLowColor', '#0000ff'),
          getSetting('heatmapMidColor', '#00ffff'),
          getSetting('heatmapHighColor', '#ff0000')
        ),
        zIndex: 200 // Bottom layer
      }).addTo(state.map);
    }

    // Update visible count - only points in viewport
    const visibleInViewport = countPointsInViewport(sampledForPoints);
    document.getElementById('statVisible').textContent = visibleInViewport.toLocaleString();
  }

  // Count points that are currently visible in the map viewport
  function countPointsInViewport(points) {
    if (!state.map || points.length === 0) return 0;

    const bounds = state.map.getBounds();
    let count = 0;

    for (const point of points) {
      if (bounds.contains([point.lat, point.lon])) {
        count++;
      }
    }

    return count;
  }

  function createPointMarker(lat, lng, options) {
    const { color = '#3388ff', fillColor = '#3388ff', radius = 2, opacity = 0.5 } = options;

    return L.circleMarker([lat, lng], {
      radius,
      fillColor,
      color,
      weight: 1,
      opacity: opacity + 0.3,  // stroke is slightly more opaque
      fillOpacity: opacity
    });
  }

  function getAltitudeColor(alt, min, max, lowColor, highColor) {
    const normalized = Math.max(0, Math.min(1, (alt - min) / (max - min)));
    return interpolateColor(lowColor, highColor, normalized);
  }

  function interpolateColor(color1, color2, factor) {
    const c1 = hexToRgb(color1);
    const c2 = hexToRgb(color2);

    const r = Math.round(c1.r + factor * (c2.r - c1.r));
    const g = Math.round(c1.g + factor * (c2.g - c1.g));
    const b = Math.round(c1.b + factor * (c2.b - c1.b));

    return rgbToHex(r, g, b);
  }

  function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : { r: 0, g: 0, b: 0 };
  }

  function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(x => {
      const hex = x.toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    }).join('');
  }

  function createPopupContent(point) {
    const date = new Date(point.tst * 1000);
    const dateStr = date.toLocaleString();

    let content = `<div style="min-width: 200px;">`;
    content += `<div><strong>Time:</strong> ${dateStr}</div>`;
    content += `<div><strong>Lat:</strong> ${point.lat.toFixed(6)}</div>`;
    content += `<div><strong>Lon:</strong> ${point.lon.toFixed(6)}</div>`;

    if (point.alt !== undefined && point.alt !== null) {
      content += `<div><strong>Altitude:</strong> ${point.alt} m</div>`;
    }

    if (point.acc !== undefined && point.acc !== null) {
      content += `<div><strong>Accuracy:</strong> ${point.acc} m</div>`;
    }

    if (point.batt !== undefined && point.batt !== null) {
      content += `<div><strong>Battery:</strong> ${point.batt}%</div>`;
    }

    if (point.addr) {
      content += `<div><strong>Address:</strong> ${point.addr}</div>`;
    }

    if (point.ssid) {
      content += `<div><strong>WiFi:</strong> ${point.ssid}</div>`;
    }

    content += `</div>`;

    return content;
  }

  function createTooltipContent(point) {
    const date = new Date(point.tst * 1000);

    // Format time nicely
    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric' });

    let content = `<div style="text-align: center;">`;
    content += `<div style="font-weight: 600;">${timeStr}</div>`;
    content += `<div style="font-size: 11px; opacity: 0.8;">${dateStr}</div>`;

    // Add altitude if available
    if (point.alt !== undefined && point.alt !== null) {
      content += `<div style="font-size: 11px; margin-top: 2px;">${point.alt}m</div>`;
    }

    content += `</div>`;

    return content;
  }

  function fitMapToBounds() {
    if (state.data.filtered.length === 0) return;

    const bounds = L.latLngBounds(
      state.data.filtered.map(p => [p.lat, p.lon])
    );

    // Adjust padding based on sidebar state
    // When sidebar is open, add left padding equal to sidebar width to keep data visible
    const sidebar = document.getElementById('sidebar');
    const sidebarOpen = sidebar && state.sidebarOpen;
    const basePadding = 40;

    let leftPadding = basePadding;
    if (sidebarOpen && sidebar) {
      leftPadding = sidebar.offsetWidth + 20; // Full sidebar width plus small buffer
    }

    state.map.fitBounds(bounds, {
      paddingTopLeft: [leftPadding, basePadding],
      paddingBottomRight: [basePadding, basePadding]
    });
  }

  // Proximity click handler - makes it easier to click on small points
  function handleProximityClick(e) {
    if (state.data.filtered.length === 0) return;

    const clickPoint = e.containerPoint; // Pixel coordinates
    const threshold = 15; // pixels - click radius

    // Find nearest point within threshold
    let nearestPoint = null;
    let minDistance = Infinity;

    // Only check visible points (sampled based on current settings)
    const totalPoints = state.data.filtered.length;
    const zoom = state.map.getZoom();
    const dynamicVisibilityEnabled = getSetting('dynamicPointVisibility', true);

    // Use same sampling logic as redrawMap
    let pointSampleRate = 1;
    if (dynamicVisibilityEnabled && totalPoints > 2000) {
      const targetPoints = 3000;
      const zoomFactor = Math.max(0.05, (zoom - 2) / 14);
      const densityFactor = Math.max(0.1, targetPoints / totalPoints);
      const combinedFactor = zoomFactor * densityFactor;

      if (combinedFactor < 0.01) {
        pointSampleRate = Math.max(10, Math.min(50, Math.ceil(100 * combinedFactor / 2)));
      } else if (combinedFactor < 0.05) {
        pointSampleRate = Math.max(5, Math.min(20, Math.ceil(1 / combinedFactor / 2)));
      } else if (combinedFactor < 0.15) {
        pointSampleRate = Math.max(2, Math.min(10, Math.ceil(1 / combinedFactor / 3)));
      }
    }

    // Check sampled points
    for (let i = 0; i < totalPoints; i += pointSampleRate) {
      const point = state.data.filtered[i];
      const layerPoint = state.map.latLngToContainerPoint([point.lat, point.lon]);
      const distance = Math.sqrt(
        Math.pow(clickPoint.x - layerPoint.x, 2) +
        Math.pow(clickPoint.y - layerPoint.y, 2)
      );

      if (distance < threshold && distance < minDistance) {
        minDistance = distance;
        nearestPoint = point;
      }
    }

    if (nearestPoint) {
      // Open popup at the point's location
      const popup = L.popup()
        .setLatLng([nearestPoint.lat, nearestPoint.lon])
        .setContent(createPopupContent(nearestPoint))
        .openOn(state.map);
    }
  }

  // ============================================================================
  // UI Updates
  // ============================================================================

  function showLoading(text, detail = '') {
    state.isLoading = true;
    document.getElementById('loadingText').textContent = text;
    document.getElementById('loadingDetail').textContent = detail;
    document.getElementById('loadingError').style.display = 'none';
    document.getElementById('loadingTimer').style.display = 'block';
    document.getElementById('loadingTimer').textContent = 'Time: 0:00';
    document.getElementById('loadingOverlay').classList.add('visible');

    // Start the timer
    state.loadingStartTime = Date.now();
    state.loadingTimerInterval = setInterval(updateLoadingTimer, 1000);
  }

  function updateLoadingTimer() {
    if (state.loadingStartTime) {
      const elapsed = Math.floor((Date.now() - state.loadingStartTime) / 1000);
      const minutes = Math.floor(elapsed / 60);
      const seconds = elapsed % 60;
      document.getElementById('loadingTimer').textContent =
        `Time: ${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
  }

  function hideLoading() {
    state.isLoading = false;

    // Stop the timer
    if (state.loadingTimerInterval) {
      clearInterval(state.loadingTimerInterval);
      state.loadingTimerInterval = null;
    }
    state.loadingStartTime = null;

    document.getElementById('loadingOverlay').classList.remove('visible');
    document.getElementById('loadingTimer').style.display = 'none';
    document.getElementById('loadingError').style.display = 'none';
  }

  function showLoadingError(message) {
    document.getElementById('loadingError').textContent = message;
    document.getElementById('loadingError').style.display = 'block';
  }

  function showError(message) {
    alert('Error: ' + message);
    console.error(message);
  }

  function updateHeaderStatus(text) {
    document.getElementById('headerStatus').textContent = text;
  }

  function updateStats() {
    const totalPoints = state.data.raw.length;
    const cached = state.data.sourceBreakdown?.cached || 0;
    const fresh = state.data.sourceBreakdown?.fresh || 0;
    const sourceSuffix = cached || fresh ? ` (${cached.toLocaleString()} cached, ${fresh.toLocaleString()} fresh)` : '';

    document.getElementById('statTotal').textContent = `${totalPoints.toLocaleString()}${sourceSuffix}`;
    // Visible count is updated by redrawMap() and updateViewportStats() which account for viewport
    document.getElementById('statMaxAccuracy').textContent = state.data.maxAccuracy + ' m';

    if (state.data.timeRange.start && state.data.timeRange.end) {
      const start = formatDisplayDate(state.data.timeRange.start * 1000);
      const end = formatDisplayDate(state.data.timeRange.end * 1000);
      document.getElementById('statTimeRange').textContent = `${start} - ${end}`;
    } else {
      document.getElementById('statTimeRange').textContent = '-';
    }
  }

  // Update the visible point count based on current viewport
  // Called on map move/zoom events without redrawing the entire map
  function updateViewportStats() {
    if (state.data.filtered.length === 0) return;

    // Get the current sample rate that would be used (matching redrawMap logic)
    const totalPoints = state.data.filtered.length;
    const zoom = state.map.getZoom();
    const dynamicVisibilityEnabled = getSetting('dynamicPointVisibility', true);

    let pointSampleRate = 1;
    if (dynamicVisibilityEnabled && totalPoints > 2000) {
      const targetPoints = 3000;
      const zoomFactor = Math.max(0.05, (zoom - 2) / 14);
      const densityFactor = Math.max(0.1, targetPoints / totalPoints);
      const combinedFactor = zoomFactor * densityFactor;

      if (combinedFactor < 0.01) {
        pointSampleRate = Math.max(10, Math.min(50, Math.ceil(100 * combinedFactor / 2)));
      } else if (combinedFactor < 0.05) {
        pointSampleRate = Math.max(5, Math.min(20, Math.ceil(1 / combinedFactor / 2)));
      } else if (combinedFactor < 0.15) {
        pointSampleRate = Math.max(2, Math.min(10, Math.ceil(1 / combinedFactor / 3)));
      }
    }

    // Get sampled points and count those in viewport
    const sampledPoints = state.data.filtered.filter((_, i) => i % pointSampleRate === 0);
    const visibleInViewport = countPointsInViewport(sampledPoints);
    document.getElementById('statVisible').textContent = visibleInViewport.toLocaleString();
  }

  // Calculate storage usage for IndexedDB cache
  async function calculateStorageUsage() {
    // Calculate localStorage usage (settings only)
    let localStorageBytes = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        const value = localStorage.getItem(key);
        localStorageBytes += (key.length + value.length) * 2; // UTF-16 chars are 2 bytes
      }
    }

    // Calculate IndexedDB cache usage
    let cacheBytes = 0;
    try {
      cacheBytes = await idbHelper.getStorageUsage();
    } catch (e) {
      logWarn('Failed to calculate IndexedDB usage:', e);
    }

    return { total: localStorageBytes + cacheBytes, cache: cacheBytes };
  }

  // Format bytes as human-readable string
  function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return (bytes / Math.pow(k, i)).toFixed(1).replace('.0', '') + ' ' + sizes[i];
  }

  async function updateRefreshButton() {
    const storageEnabled = getSetting('storageEnabled', true);
    const user = document.getElementById('userSelect').value;
    const device = document.getElementById('deviceSelect').value;

    let hasCachedData = false;
    let cachedCount = 0;
    let requestedCount = 0;

    if (storageEnabled && user && device) {
      const { from, to } = getDateRange();
      const fromDate = formatDateForInput(from);
      const toDate = formatDateForInput(to);
      const requestedDays = getDaysInRange(fromDate, toDate);
      const cachedDays = await getCachedDays(user, device);

      requestedCount = requestedDays.length;

      // Count how many requested days are cached
      cachedCount = requestedDays.filter(day => cachedDays.has(day)).length;

      // Check if any requested days are cached
      hasCachedData = cachedCount > 0;
    }

    const showRefresh = storageEnabled && hasCachedData;

    document.getElementById('refreshBtn').style.display = showRefresh ? 'block' : 'none';

    // Update button text based on cache state
    if (showRefresh) {
      if (cachedCount === requestedCount) {
        document.getElementById('loadDataBtn').textContent = 'Load Data (all cached)';
      } else {
        document.getElementById('loadDataBtn').textContent = `Load Data (${cachedCount}/${requestedCount} days cached)`;
      }
      document.getElementById('refreshBtn').textContent = 'Refresh from API';
    } else {
      document.getElementById('loadDataBtn').textContent = 'Load Data';
    }

    // Update cache status text with storage usage
    const cacheStatusEl = document.getElementById('cacheStatus');
    if (storageEnabled && user && device) {
      cacheStatusEl.style.display = 'block';
      const totalCached = (await getCachedDays(user, device)).size;
      const usage = await calculateStorageUsage();
      document.getElementById('cacheStatusText').textContent =
        `Cache: ${totalCached} day${totalCached === 1 ? '' : 's'} stored for ${user}/${device} (${formatBytes(usage.cache)} used)`;
    } else if (storageEnabled) {
      cacheStatusEl.style.display = 'block';
      const usage = await calculateStorageUsage();
      document.getElementById('cacheStatusText').textContent =
        `Cache: enabled (no data cached yet, ${formatBytes(usage.cache)} used)`;
    } else {
      cacheStatusEl.style.display = 'none';
    }
  }

  async function loadDataFromAPI() {
    const user = document.getElementById('userSelect').value;
    const device = document.getElementById('deviceSelect').value;

    if (!user || !device) {
      showError('Please select user and device first');
      return;
    }

    const { from, to } = getDateRange();
    const fromDate = formatDateForInput(from);
    const toDate = formatDateForInput(to);
    const requestedDays = getDaysInRange(fromDate, toDate);

    try {
      const storageEnabled = getSetting('storageEnabled', true);

      // Always fetch the complete day range from midnight to just before midnight
      const rangeFrom = new Date(fromDate + 'T00:00:00');
      const rangeTo = new Date(toDate + 'T23:59:59');

      showLoading(
        `Refreshing ${requestedDays.length} day${requestedDays.length > 1 ? 's' : ''} from API...`,
        'This may take several minutes for large date ranges.'
      );

      const fromStr = formatDateForAPI(rangeFrom, 'start');
      const toStr = formatDateForAPI(rangeTo, 'end');

      log(`[Refresh Debug] Full refresh: ${fromStr} to ${toStr} (${requestedDays.length} days)`);

      const locationsUrl = `${window.CONFIG.api.url}/api/0/locations?` +
        `from=${encodeURIComponent(fromStr)}&` +
        `to=${encodeURIComponent(toStr)}&` +
        `user=${encodeURIComponent(user)}&` +
        `device=${encodeURIComponent(device)}&` +
        `format=json`;

      const response = await fetchWithTimeout(locationsUrl, {
        headers: buildAuthHeaders()
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch locations: ${response.status}`);
      }

      const result = await response.json();
      const allData = result.data || [];

      // Cache the data by day if storage is enabled
      if (storageEnabled && allData.length > 0) {
        const dailyData = splitDataByDays(allData, fromDate, toDate);
        await cacheDailyData(user, device, dailyData);
        log(`[Refresh Debug] Cached ${allData.length} points across ${requestedDays.length} day(s)`);
      }

      // Now load and display the data
      await loadData();

    } catch (error) {
      showLoadingError('Failed to load locations: ' + error.message);
      setTimeout(() => {
        hideLoading();
        clearMapData();
        showError('Failed to load locations: ' + error.message);
      }, 3000);
    }
  }

  function updateDataSourceIndicator(fromCache = false) {
    const statusEl = document.getElementById('headerStatus');
    statusEl.textContent = '';
  }

  // ============================================================================
  // Initialize on DOM ready
  // ============================================================================

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
