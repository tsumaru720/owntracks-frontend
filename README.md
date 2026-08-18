# OwnTracks Frontend

> **⚠️ AI-Generated Code Disclaimer**
>
> This code was generated with the assistance of AI tools. While it has been tested and should work as expected, please review and test it thoroughly before using it in production or with sensitive data. The authors accept no responsibility for any data loss or issues arising from its use.

A browser-based visualization tool for OwnTracks location data. Handles large datasets (100,000+ GPS points) efficiently through zoom-based sampling and client-side caching.

## Quick Start

### Option A: Docker (Recommended) ✅

```bash
docker run -d \
  -e APP_API_URL="https://owntracks.example.org" \
  -p 8080:80 \
  owntracks-frontend
```

**Note**: This method generates an `environment.json` file that will be placed in the document root. You can also provide a `config.json` file to override environment variables via bind mounts.

### Option B: Standalone (config.json)

1. Copy the configuration template:
   ```bash
   cp config.json.example config.json
   ```

2. Edit `config.json` and set your API URL:
   ```json
   {
     "api": {
       "url": "https://owntracks.example.org"
     }
   }
   ```

3. Serve the files with a suitable web server (e.g., nginx, Apache, Caddy, Python's `http.server`), then open `index.html` in a web browser.

**Note**: This option requires a web server because the application loads configuration files and makes API calls that may be restricted by browser security policies when opening `index.html` directly from the filesystem.

## Features

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

Configuration can be provided via:
1. **Docker** (recommended): environment variables (entrypoint.sh generates `environment.json`) or `config.json`
2. **Standalone**: Create `config.json` file
3. **Both**: `config.json` overrides environment variables

### Configuration Reference

**Note**: A lot of the settings here can be configured in the app's settings popout

| Environment Variable | JSON Path | Description | Required | Default |
|---------------------|-----------|-------------|----------|---------|
| `APP_API_URL` | `api.url` | OwnTracks recorder API base URL | ✅ Yes | — |
| `APP_API_USERNAME` | `api.username` | Basic auth username | No | — |
| `APP_API_PASSWORD` | `api.password` | Basic auth password | No | — |
| `APP_API_COOKIENAME` | `api.cookieName` | Cookie name | No | — |
| `APP_API_COOKIEVALUE` | `api.cookieValue` | Cookie value | No | — |
| `APP_API_TIMEOUT` | `api.timeout` | Request timeout (milliseconds) | No | `600000` |
| `APP_STORAGE_KEY` | `storage.key` | localStorage key prefix for caching | No | `owntracks_cache` |
| `APP_MAP_TILESERVER` | `map.tileServer` | Map tile server URL template | No | `https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png` |
| `APP_MAP_DEFAULTCENTER` | `map.defaultCenter` | Default map center as `[lat, lng]` | No | `[51.50138, -0.14189]` |
| `APP_MAP_DEFAULTZOOM` | `map.defaultZoom` | Default map zoom level | No | `13` |
| `APP_MAP_MINZOOM` | `map.minZoom` | Minimum zoom level | No | `2` |
| `APP_MAP_MAXZOOM` | `map.maxZoom` | Maximum zoom level | No | `21` |
| `APP_DEFAULTS_USER` | `defaults.user` | Default username to select | No | — |
| `APP_DEFAULTS_DEVICE` | `defaults.device` | Default device to select | No | — |
| `APP_DEFAULTS_TIMEPERIOD` | `defaults.timePeriod` | Default time period | No | `30days` |
| `APP_DISPLAY_POINTS_SHOW` | `display.points.show` | Show points by default | No | `true` |
| `APP_DISPLAY_POINTS_COLOR` | `display.points.color` | Default point color | No | `#3388ff` |
| `APP_DISPLAY_POINTS_SIZE` | `display.points.size` | Default point size | No | `2` |
| `APP_DISPLAY_POINTS_OPACITY` | `display.points.opacity` | Default point opacity | No | `0.5` |
| `APP_DISPLAY_LINES_SHOW` | `display.lines.show` | Show lines by default | No | `true` |
| `APP_DISPLAY_LINES_COLOR` | `display.lines.color` | Default line color | No | `#3388ff` |
| `APP_DISPLAY_LINES_WIDTH` | `display.lines.width` | Default line width | No | `3` |
| `APP_DISPLAY_LINES_OPACITY` | `display.lines.opacity` | Default line opacity | No | `0.7` |
| `APP_DISPLAY_LINES_SMOOTH` | `display.lines.smooth` | Smooth lines by default | No | `false` |
| `APP_DISPLAY_ACCURACY_MAXMETERS` | `display.accuracy.maxMeters` | Max GPS accuracy filter (0 = all) | No | `0` |
| `APP_DISPLAY_ALTITUDE_MIN` | `display.altitude.min` | Min altitude for gradient | No | `0` |
| `APP_DISPLAY_ALTITUDE_MAX` | `display.altitude.max` | Max altitude for gradient | No | `1000` |
| `APP_DISPLAY_ALTITUDE_POINTS_ENABLED` | `display.altitude.points.enabled` | Enable altitude gradient on points | No | `false` |
| `APP_DISPLAY_ALTITUDE_POINTS_LOWCOLOR` | `display.altitude.points.lowColor` | Low altitude color (points) | No | `#00ff00` |
| `APP_DISPLAY_ALTITUDE_POINTS_HIGHCOLOR` | `display.altitude.points.highColor` | High altitude color (points) | No | `#ff0000` |
| `APP_DISPLAY_ALTITUDE_LINES_ENABLED` | `display.altitude.lines.enabled` | Enable altitude gradient on lines | No | `false` |
| `APP_DISPLAY_ALTITUDE_LINES_LOWCOLOR` | `display.altitude.lines.lowColor` | Low altitude color (lines) | No | `#00ff00` |
| `APP_DISPLAY_ALTITUDE_LINES_HIGHCOLOR` | `display.altitude.lines.highColor` | High altitude color (lines) | No | `#ff0000` |
| `APP_DISPLAY_HEATMAP_ENABLED` | `display.heatmap.enabled` | Enable heatmap by default | No | `false` |
| `APP_DISPLAY_HEATMAP_RADIUS` | `display.heatmap.radius` | Heatmap radius | No | `25` |
| `APP_DISPLAY_HEATMAP_BLUR` | `display.heatmap.blur` | Heatmap blur | No | `15` |
| `APP_DISPLAY_HEATMAP_MINOPACITY` | `display.heatmap.minOpacity` | Heatmap min opacity | No | `0.05` |
| `APP_DISPLAY_HEATMAP_MAXZOOM` | `display.heatmap.maxZoom` | Max zoom for heatmap | No | `18` |
| `APP_DISPLAY_HEATMAP_GRADIENT_LOWCOLOR` | `display.heatmap.gradient.lowColor` | Heatmap low color | No | `#0000ff` |
| `APP_DISPLAY_HEATMAP_GRADIENT_MIDCOLOR` | `display.heatmap.gradient.midColor` | Heatmap mid color | No | `#00ffff` |
| `APP_DISPLAY_HEATMAP_GRADIENT_HIGHCOLOR` | `display.heatmap.gradient.highColor` | Heatmap high color | No | `#ff0000` |
| `APP_DISPLAY_STORAGEENABLED` | `display.storageEnabled` | Cache data in browser | No | `true` |
| `APP_PERFORMANCE_DYNAMICPOINTVISIBILITY` | `performance.dynamicPointVisibility` | Auto-adjust point density | No | `true` |
| `APP_DEBUG_CONSOLELOGGING` | `debug.consoleLogging` | Enable console logging | No | `false` |

### Authentication Rules

- **No auth**: Omit all auth settings
- **Basic auth**: Set both `username` and `password`
- **Cookie auth**: Set both `cookieName` and `cookieValue`
- **Both**: You can use basic auth AND cookie auth together

### Example config.json structure

```json
{
  "api": {
    "url": "https://recorder.example.org",
    "username": "user",
    "password": "pass"
  },
  "map": {
    "defaultCenter": [51.50138, -0.14189],
    "defaultZoom": 13
  },
  "defaults": {
    "user": "john",
    "timePeriod": "7days"
  },
  "debug": {
    "consoleLogging": false
  }
}
```

### Example Docker Compose

```yaml
services:
  owntracks-frontend:
    image: owntracks-frontend
    environment:
      - APP_API_URL=https://recorder.example.org
      - APP_API_USERNAME=user
      - APP_API_PASSWORD=pass
      - APP_MAP_DEFAULTCENTER=[51.50138,-0.14189]
      - APP_MAP_DEFAULTZOOM=13
      - APP_DEFAULTS_USER=john
      - APP_DEFAULTS_TIMEPERIOD=7days
      - APP_DEBUG_CONSOLELOGGING=false
    ports:
      - "8080:80"
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
