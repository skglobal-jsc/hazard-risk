# Hazard Risk Analysis Library

A TypeScript library for analyzing disaster risk in any polygon area based on tile map data.

## Features

- ✅ Risk analysis in any polygon (GeoJSON)
- ✅ Automatic grid generation with customizable resolution
- ✅ Pixel reading from tile images (hazard map + base map)
- ✅ Risk classification by RGB color
- ✅ Water area exclusion
- ✅ Detailed statistics calculation
- ✅ Node.js environment support
- ✅ TypeScript with full type safety
- ✅ Tile caching with LRU algorithm
- ✅ Concurrent tile preloading
- ✅ Nearest point detection
- ✅ Current location risk assessment
- ✅ DEM elevation data extraction

## Installation

```bash
npm install @sk-global/hazard-risk
```

## Usage

### Node.js Environment

```typescript
import { analyzeRiskInPolygon, TileCache } from '@sk-global/hazard-risk';

// Create cache for better performance
const cache = new TileCache(200 * 1024 * 1024, 10 * 60 * 1000); // 200MB, 10 minutes

const polygon = {
  type: 'Polygon',
  coordinates: [[
    [141.3, 43.0], // bottom-left
    [141.4, 43.0], // bottom-right
    [141.4, 43.1], // top-right
    [141.3, 43.1], // top-left
    [141.3, 43.0]  // close polygon
  ]]
};

const result = await analyzeRiskInPolygon({
  polygon,
  hazardTileUrl: 'https://disaportaldata.gsi.go.jp/raster/01_flood_l1_shinsuishin_newlegend_data/{z}/{x}/{y}.png',
  baseTileUrl: 'https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png',
  gridSize: 100, // 100 meters
  zoom: 12,
  currentLocation: { lat: 43.0619, lon: 141.3543 }
}, cache);

console.log('Risk statistics:', result.stats);
console.log('Total points:', result.total);
console.log('Water points:', result.waterCount);
```


### Advanced Usage with Custom Hazard Configuration

```typescript
import { createHazardConfig, analyzeRiskInPolygon } from '@sk-global/hazard-risk';

// Create custom hazard configuration
const tsunamiConfig = createHazardConfig('Tsunami Depth', {
  0: { name: 'level0', color: '#FFFFFF', description: '0m' },
  1: { name: 'level1', color: '#FFFFB3', description: '<0.3m' },
  2: { name: 'level2', color: '#F7F5A9', description: '<0.5m' },
  3: { name: 'level3', color: '#F8E1A6', description: '0.5~1m' },
  4: { name: 'level4', color: '#FFD8C0', description: '0.5~3m' },
  5: { name: 'level5', color: '#FFB7B7', description: '3~5m' },
  6: { name: 'level6', color: '#FF9191', description: '5~10m' },
  7: { name: 'level7', color: '#F285C9', description: '10~20m' },
  8: { name: 'level8', color: '#DC7ADC', description: '>20m' }
}, ['#bed2ff', '#f7f5a9', '#8bb8ff', '#6aa8ff']);

const result = await analyzeRiskInPolygon({
  polygon,
  hazardTileUrl: 'https://.../{z}/{x}/{y}.png',
  baseTileUrl: 'https://.../{z}/{x}/{y}.png',
  gridSize: 100,
  zoom: 12,
  hazardConfig: tsunamiConfig,
  currentLocation: { lat: 43.0619, lon: 141.3543 }
});
```

## Results

### Node.js Result Structure

```typescript
{
  stats: {
    '0': 2174,    // Level 0 - No risk
    '2': 1294,    // Level 2 - Warning
    '4': 917,     // Level 4 - Moderate risk
    '5': 11,      // Level 5 - High risk
    '6': 2,       // Level 6 - Very high risk
    total: 4398   // Total points analyzed
  },
  nearestPoints: {
    '0': { latitude: 43.0616, longitude: 141.3538, distance: 56.56 },
    '2': { latitude: 43.0623, longitude: 141.3538, distance: 56.56 },
    // ... nearest points for each risk level
  },
  waterCount: 0,
  currentLocationRisk: { riskLevel: 2, isWater: false },
  hazardConfig: { /* hazard configuration */ }
}
```


## API Reference

### `analyzeRiskInPolygon(options, cache?)`

Analyze risk in polygon for Node.js environment.

**Parameters:**
- `options.polygon`: GeoJSON Polygon
- `options.hazardTileUrl`: URL template for hazard tiles
- `options.baseTileUrl`: URL template for base tiles
- `options.gridSize`: Distance between grid points (meters)
- `options.zoom`: Tile zoom level
- `options.hazardConfig?`: Custom hazard configuration
- `options.currentLocation?`: Current location for nearest point detection
- `cache?`: Optional TileCache instance


### `TileCache(maxSize, ttl)`

LRU cache for tile images.

**Parameters:**
- `maxSize`: Maximum cache size in bytes
- `ttl`: Time to live in milliseconds

### `createHazardConfig(name, levels, waterColors?)`

Create custom hazard configuration.

**Parameters:**
- `name`: Hazard name
- `levels`: Risk level configuration object
- `waterColors?`: Array of water color hex codes

### `getElevationFromDEM(options)`

Get elevation data from DEM tiles for Node.js environment.

**Parameters:**
- `options.lat`: Latitude
- `options.lng`: Longitude
- `options.zoom?`: Zoom level (default: 17)
- `options.demConfigs?`: Custom DEM configurations
- `options.cache?`: Optional TileCache instance

**Returns:**
```typescript
{
  elevation: number | null,
  source: string,
  fixed: number,
  position: { lat: number, lng: number, zoom: number }
}
```


## DEM Elevation Data

The library supports extracting elevation data from DEM (Digital Elevation Model) tiles. Default configurations support GSI Japan DEM services:

| DEM Type | Zoom Level | Precision | Description |
|----------|------------|-----------|-------------|
| DEM1A | 17 | 0.1m | Highest precision |
| DEM5A | 15 | 0.1m | High precision |
| DEM5B | 15 | 0.1m | High precision |
| DEM5C | 15 | 0.1m | High precision |
| DEM10B | 14 | 1m | Standard precision |

### Example Usage

```typescript
import { getElevationFromDEM } from '@sk-global/hazard-risk';

// Get elevation for Tokyo
const result = await getElevationFromDEM({
  lat: 35.6762,
  lng: 139.6503,
  zoom: 17
});

if (result.elevation !== null) {
  console.log(`Elevation: ${result.elevation.toFixed(result.fixed)}m`);
  console.log(`Source: ${result.source}`);
} else {
  console.log('No elevation data found');
}
```

## Risk Classification

The library supports dynamic risk classification based on RGB colors. Default tsunami configuration:

| Color (RGB) | Level | Description |
|-------------|-------|-------------|
| 255,255,255 | 0 | No risk |
| 255,255,179 | 1 | Attention |
| 247,245,169 | 2 | Warning |
| 248,225,166 | 3 | Moderate risk |
| 255,216,192 | 4 | High risk |
| 255,183,183 | 5 | Very high risk |
| 255,145,145 | 6 | Extreme risk |
| 242,133,201 | 7 | Critical risk |
| 220,122,220 | 8 | Maximum risk |

## Environment Support

- ✅ **Node.js**: Full support with PNG processing via pngjs
- ✅ **TypeScript**: Complete type definitions
- ✅ **AWS Lambda**: Optimized for serverless environments

## Dependencies

- `@turf/turf`: Polygon processing, bounding box calculations
- `pngjs`: PNG image processing (Node.js)
- `axios`: HTTP requests for tile fetching

## Performance Features

- **Tile Caching**: LRU cache with configurable size and TTL
- **Concurrent Loading**: Parallel tile fetching with rate limiting
- **Grid Optimization**: Efficient point grid generation with polygon masking
- **Memory Management**: Automatic cache eviction and memory cleanup

## Examples

See the `example.ts` file for a complete working example using GSI Japan tsunami data.

## License

MIT
