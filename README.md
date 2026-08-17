# OwnTracks Frontend

> **⚠️ AI-Generated Code Disclaimer**
>
> This code was generated with the assistance of AI tools. While it has been tested and should work as expected, please review and test it thoroughly before using it in production or with sensitive data. The authors accept no responsibility for any data loss or issues arising from its use.

A browser-based visualization tool for OwnTracks location data. Handles large datasets (100,000+ GPS points) efficiently through zoom-based sampling and client-side caching.

## Quick Start

1. Copy the configuration template:
   ```bash
   cp config.js.example config.js
   ```

2. Edit `config.js` and set your API URL:
   ```javascript
   window.CONFIG = {
     api: {
       url: "https://owntracks.example.org"
     }
   }
   ```

3. Open `index.html` in a web browser.

## Features

- **High Performance**: Zoom-based sampling handles 100,000+ points without freezing
- **Smart Caching**: Display changes use cached data; no repeated API calls
- **Multiple Visualizations**: Points, route lines, altitude gradients, heatmap
- **Data Persistence**: Optional localStorage caching across sessions
- **Dark/Light Mode**: Theme toggle with persistence
- **Configurable Filters**: GPS accuracy filter, date ranges, quick presets

## Usage

1. Select user and device from dropdowns
2. Choose time period (presets or custom range)
3. Click "Load Data"
4. Customize visualization in sidebar (all changes use cached data)
5. Toggle dark/light mode at bottom of sidebar

## Configuration

All settings go in `config.js`. Copy from `config.js.example` and customize.

### Required

| Setting | Description |
|---------|-------------|
| `api.url` | OwnTracks recorder API base URL |

### Optional API Settings

| Setting | Description | Default |
|---------|-------------|---------|
| `api.username` | Basic auth username | — |
| `api.password` | Basic auth password (required if username set) | — |
| `api.cookieName` | Cookie auth name | — |
| `api.cookieValue` | Cookie value (required if cookieName set) | — |
| `api.timeout` | Request timeout (ms) | `600000` (10 min) |

**Authentication rules**: Use basic auth, cookie auth, both, or neither. If using basic auth, both username and password are required. If using cookie auth, both cookieName and cookieValue are required.

### Optional Map Settings

```javascript
map: {
  tileServer: "https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
  defaultCenter: [51.50138, -0.14189],  // London
  defaultZoom: 13,
  minZoom: 2,
  maxZoom: 19
}
```

### Optional Defaults

```javascript
defaults: {
  user: "",           // Default username
  device: "",         // Default device name
  timePeriod: "30days" // Default time selection
}
```

### Optional Storage Settings

```javascript
storage: {
  key: "owntracks_cache"  // localStorage key prefix
}
```

### Optional Display Defaults

All display options can be set in config.js and overridden in the UI. Changes persist to localStorage automatically.

```javascript
display: {
  points: {
    show: true,
    color: "#3388ff",
    size: 2,
    opacity: 0.5
  },
  lines: {
    show: true,
    color: "#3388ff",
    width: 3,
    opacity: 0.7,
    smooth: false
  },
  accuracy: {
    maxMeters: 0  // 0 = show all points
  },
  altitude: {
    min: 0,
    max: 1000,
    points: {
      enabled: false,
      lowColor: "#00ff00",
      highColor: "#ff0000"
    },
    lines: {
      enabled: false,
      lowColor: "#00ff00",
      highColor: "#ff0000"
    }
  },
  heatmap: {
    enabled: false,
    radius: 25,
    blur: 15,
    minOpacity: 0.05,
    maxZoom: 18,
    gradient: {
      lowColor: "#0000ff",
      midColor: "#00ffff",
      highColor: "#ff0000"
    }
  },
  storageEnabled: true  // Cache location data in browser
}
```

### Optional Performance Settings

```javascript
performance: {
  dynamicPointVisibility: true  // Auto-adjust point density based on zoom
}
```

### Optional Debug Settings

```javascript
debug: {
  consoleLogging: true  // Enable console.log output
}
```

## Display Options

### Points
- Toggle visibility, customize color/size/opacity
- Hover tooltips show time, date, altitude

### Lines
- Toggle visibility, customize color/width/opacity
- Optional smoothing

### Altitude Gradient
- Color points or lines by altitude
- Independent settings for points vs lines
- Configurable min/max range and colors

### Heatmap
- Point density overlay
- Customizable radius, blur, opacity
- Custom gradient colors (low/medium/high)

### Accuracy Filter
- Filter points by GPS accuracy (meters)
- 0 = show all points

### Debug Options
- **Console Logging**: Toggle console output
- **Dynamic Point Visibility**: Toggle auto-density adjustment
- **Clear Cached Data**: Remove location cache only
- **Clear All Settings**: Wipe cache, display settings, and theme

## Data Caching

1. **Memory Cache** (automatic): API responses stored in memory; display changes trigger instant redraws
2. **Storage Cache** (optional): Enable "Cache data in browser" to persist across sessions; data cached per day per device

## Performance

- Zoom-based sampling targets ~3000 visible points
- Points and lines use separate sampling rates
- Uses `L.circleMarker` for efficient rendering
- Auto-fits map bounds when data loads

## Browser Compatibility

Requires ES6, localStorage, Fetch API, CSS Grid/Flexbox. Tested on Chrome, Firefox, Safari, Edge.

## Credits

- [Leaflet.js](https://leafletjs.com/) - Map rendering
- [CARTO](https://carto.com/) - Map tiles
- [Leaflet.heat](https://github.com/Leaflet/Leaflet.heat) - Heatmap
- [OwnTracks](https://owntracks.org/) - Location tracking platform
