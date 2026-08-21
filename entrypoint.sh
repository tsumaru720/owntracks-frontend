#!/bin/sh

# Path where environment.json will be written
CONFIG_DIR="/home/web/public"

# Set defaults for SWS
export SERVER_LOG_LEVEL="${SERVER_LOG_LEVEL:-info}"
export SERVER_LOG_FORMAT="${SERVER_LOG_FORMAT:-pretty}"
export SERVER_LOG_WITH_ANSI="${SERVER_LOG_WITH_ANSI:-true}"

# Collect APP_* environment variables and write them to environment.json
# This allows Docker deployments to configure via environment variables
# The JSON format matches config.json, so config.json will override these values

jq -n '
  # Store original input string to return if JSON parsing fails
  def parse_val: . as $orig | try fromjson catch $orig;

  # Map ENV_VAR -> Exact JSON Path Array
  {
    "APP_API_URL": ["api", "url"],
    "APP_API_USERNAME": ["api", "username"],
    "APP_API_PASSWORD": ["api", "password"],
    "APP_API_COOKIENAME": ["api", "cookieName"],
    "APP_API_COOKIEVALUE": ["api", "cookieValue"],
    "APP_API_TIMEOUT": ["api", "timeout"],

    "APP_MAP_TILESERVER": ["map", "tileServer"],
    "APP_MAP_MINZOOM": ["map", "minZoom"],
    "APP_MAP_MAXZOOM": ["map", "maxZoom"],

    "APP_MAP_SATELLITEENABLED": ["map", "satelliteEnabled"],
    "APP_MAP_SATELLITETILESERVER": ["map", "satelliteTileServer"],
    "APP_MAP_SATELLITELABELSERVER": ["map", "satelliteLabelServer"],
    "APP_MAP_SATELLITEMAXZOOM": ["map", "satelliteMaxZoom"],

    "APP_DEFAULTS_USER": ["defaults", "user"],
    "APP_DEFAULTS_DEVICE": ["defaults", "device"],

    "APP_DISPLAY_POINTS_SHOW": ["display", "points", "show"],
    "APP_DISPLAY_POINTS_COLOR": ["display", "points", "color"],
    "APP_DISPLAY_POINTS_SIZE": ["display", "points", "size"],
    "APP_DISPLAY_POINTS_OPACITY": ["display", "points", "opacity"],
    "APP_DISPLAY_POINTS_COLLAPSED": ["display", "points", "collapsed"],

    "APP_DISPLAY_LINES_SHOW": ["display", "lines", "show"],
    "APP_DISPLAY_LINES_COLOR": ["display", "lines", "color"],
    "APP_DISPLAY_LINES_WIDTH": ["display", "lines", "width"],
    "APP_DISPLAY_LINES_OPACITY": ["display", "lines", "opacity"],
    "APP_DISPLAY_LINES_COLLAPSED": ["display", "lines", "collapsed"],

    "APP_DISPLAY_ACCURACY_MAXMETERS": ["display", "accuracy", "maxMeters"],

    "APP_DISPLAY_PRECISION_LINKED": ["display", "precision", "linked"],
    "APP_DISPLAY_PRECISION_LATITUDERANGE": ["display", "precision", "latitudeRange"],
    "APP_DISPLAY_PRECISION_LONGITUDERANGE": ["display", "precision", "longitudeRange"],

    "APP_DISPLAY_ALTITUDE_MIN": ["display", "altitude", "min"],
    "APP_DISPLAY_ALTITUDE_MAX": ["display", "altitude", "max"],
    "APP_DISPLAY_ALTITUDE_MINMETERS": ["display", "altitude", "minMeters"],

    "APP_DISPLAY_ALTITUDE_POINTS_ENABLED": ["display", "altitude", "points", "enabled"],
    "APP_DISPLAY_ALTITUDE_POINTS_LOWCOLOR": ["display", "altitude", "points", "lowColor"],
    "APP_DISPLAY_ALTITUDE_POINTS_HIGHCOLOR": ["display", "altitude", "points", "highColor"],

    "APP_DISPLAY_ALTITUDE_LINES_ENABLED": ["display", "altitude", "lines", "enabled"],
    "APP_DISPLAY_ALTITUDE_LINES_LOWCOLOR": ["display", "altitude", "lines", "lowColor"],
    "APP_DISPLAY_ALTITUDE_LINES_HIGHCOLOR": ["display", "altitude", "lines", "highColor"],

    "APP_DISPLAY_HEATMAP_ENABLED": ["display", "heatmap", "enabled"],
    "APP_DISPLAY_HEATMAP_RADIUS": ["display", "heatmap", "radius"],
    "APP_DISPLAY_HEATMAP_BLUR": ["display", "heatmap", "blur"],
    "APP_DISPLAY_HEATMAP_MINOPACITY": ["display", "heatmap", "minOpacity"],
    "APP_DISPLAY_HEATMAP_MAX": ["display", "heatmap", "max"],
    "APP_DISPLAY_HEATMAP_MAXZOOM": ["display", "heatmap", "maxZoom"],
    "APP_DISPLAY_HEATMAP_ZOOMSCALING": ["display", "heatmap", "zoomScaling"],
    "APP_DISPLAY_HEATMAP_COLLAPSED": ["display", "heatmap", "collapsed"],

    "APP_DISPLAY_HEATMAP_GRADIENT_MIDSTOP": ["display", "heatmap", "gradient", "midStop"],
    "APP_DISPLAY_HEATMAP_GRADIENT_LOWCOLOR": ["display", "heatmap", "gradient", "lowColor"],
    "APP_DISPLAY_HEATMAP_GRADIENT_MIDCOLOR": ["display", "heatmap", "gradient", "midColor"],
    "APP_DISPLAY_HEATMAP_GRADIENT_MIDHIGHCOLOR1": ["display", "heatmap", "gradient", "midHighColor1"],
    "APP_DISPLAY_HEATMAP_GRADIENT_MIDHIGHCOLOR2": ["display", "heatmap", "gradient", "midHighColor2"],
    "APP_DISPLAY_HEATMAP_GRADIENT_HIGHCOLOR": ["display", "heatmap", "gradient", "highColor"],

    "APP_DISPLAY_STORAGEENABLED": ["display", "storageEnabled"],

    "APP_DEBUG_CONSOLELOGGING": ["debug", "consoleLogging"]
  } as $map |

  reduce (env | to_entries[] | select(.key | startswith("APP_"))) as $var (
    {};
    if $map[$var.key] then
      setpath($map[$var.key]; ($var.value | parse_val))
    else
      .
    end
  )
' > "$CONFIG_DIR/environment.json"

if [ -s "$CONFIG_DIR/environment.json" ]; then
    echo "Configuration written to environment.json from APP_* variables"
else
    echo "{}" > "$CONFIG_DIR/environment.json"
    echo "No APP_* environment variables found, created empty environment.json" >&2
fi

# Unset all APP_* variables from the environment
for key in $(env | grep -o '^APP_[^=]*'); do
    unset "$key"
done

# Execute the command passed as arguments
exec "$@"
