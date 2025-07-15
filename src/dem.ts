import type { TileCoord, PixelCoord } from './types';
import { createTileProvider, createBrowserTileProvider } from './raster';
import type { TileCache } from './cache';
import {
  latLngToTile,
  calculateElevationFromRGB,
  getPixelFromPNG,
  getPixelFromImageBitmap,
  preloadTiles,
  createDEMUrlList,
  readPNGFromBuffer,
} from './utils';

// DEM configuration for different zoom levels
export interface DEMConfig {
  title: string;
  url: string;
  minzoom: number;
  maxzoom: number;
  fixed: number; // decimal places for elevation
}

// Default DEM configurations for GSI Japan
export const DEFAULT_DEM_CONFIGS: DEMConfig[] = [
  {
    title: 'DEM1A',
    url: 'https://cyberjapandata.gsi.go.jp/xyz/dem1a_png/{z}/{x}/{y}.png',
    minzoom: 17,
    maxzoom: 17,
    fixed: 1,
  },
  {
    title: 'DEM5A',
    url: 'https://cyberjapandata.gsi.go.jp/xyz/dem5a_png/{z}/{x}/{y}.png',
    minzoom: 15,
    maxzoom: 15,
    fixed: 1,
  },
  {
    title: 'DEM5B',
    url: 'https://cyberjapandata.gsi.go.jp/xyz/dem5b_png/{z}/{x}/{y}.png',
    minzoom: 15,
    maxzoom: 15,
    fixed: 1,
  },
  {
    title: 'DEM5C',
    url: 'https://cyberjapandata.gsi.go.jp/xyz/dem5c_png/{z}/{x}/{y}.png',
    minzoom: 15,
    maxzoom: 15,
    fixed: 1,
  },
  {
    title: 'DEM10B',
    url: 'https://cyberjapandata.gsi.go.jp/xyz/dem_png/{z}/{x}/{y}.png',
    minzoom: 14,
    maxzoom: 14,
    fixed: 0,
  },
];

// Options for getElevationFromDEM
export interface GetElevationOptions {
  lat: number;
  lng: number;
  zoom?: number;
  demConfigs?: DEMConfig[];
  cache?: TileCache;
}

// Result from getElevationFromDEM
export interface ElevationResult {
  elevation: number | null;
  source: string;
  fixed: number;
  position: { lat: number; lng: number; zoom: number };
}

// Main function to get elevation from DEM (Node.js)
export async function getElevationFromDEM(
  options: GetElevationOptions
): Promise<ElevationResult> {
  const {
    lat,
    lng,
    zoom = 17,
    demConfigs = DEFAULT_DEM_CONFIGS,
    cache,
  } = options;

  // Create URL list for different DEM sources
  const urlList = createDEMUrlList(demConfigs);

  // Create tile providers for all DEM sources
  const tileProviders = urlList.map(demConfig =>
    createTileProvider(demConfig.url, cache)
  );

  // Get tile coordinates for all DEM sources
  const tileCoords = urlList.map(demConfig => {
    const { tile } = latLngToTile(lat, lng, demConfig.zoom);
    return tile;
  });

  // Preload all tiles in parallel for better performance
  try {
    await preloadTiles(tileCoords, tileProviders);
  } catch (error) {
    // Continue even if preload fails, will try individual tiles
    console.warn(
      'Preload failed, falling back to individual tile loading:',
      error
    );
  }

  // Try each DEM source until we get elevation data
  for (let i = 0; i < urlList.length; i++) {
    const demConfig = urlList[i];
    const tileProvider = tileProviders[i];

    try {
      const { tile, pixel } = latLngToTile(lat, lng, demConfig.zoom);

      // Fetch tile (should be cached from preload)
      const tileBuffer = await tileProvider(tile.z, tile.x, tile.y);

      if (!tileBuffer || tileBuffer.length === 0) {
        continue; // Try next source
      }

      // Read PNG
      const png = readPNGFromBuffer(tileBuffer);
      const [r, g, b] = getPixelFromPNG(png, pixel.x, pixel.y);

      // Calculate elevation
      let elevation = calculateElevationFromRGB(r, g, b);

      if (elevation !== null) {
        // round elevation to 1 decimal place
        // example: 123.456789 -> 123.5
        // 21.490000000000002 -> 21.5
        elevation = Math.round(elevation * 10) / 10;
        return {
          elevation,
          source: demConfig.title,
          fixed: demConfig.fixed,
          position: { lat, lng, zoom: demConfig.zoom },
        };
      }
    } catch (error) {
      // Continue to next source if this one fails
      console.warn(`Failed to get elevation from ${demConfig.title}:`, error);
      continue;
    }
  }

  // No elevation data found
  return {
    elevation: null,
    source: '',
    fixed: 0,
    position: { lat, lng, zoom },
  };
}

// Browser-specific implementation
export async function getElevationFromDEMBrowser(
  options: GetElevationOptions
): Promise<ElevationResult> {
  const { lat, lng, zoom = 17, demConfigs = DEFAULT_DEM_CONFIGS } = options;

  // Create URL list for different DEM sources
  const urlList = createDEMUrlList(demConfigs);

  // Create tile providers for all DEM sources
  const tileProviders = urlList.map(demConfig =>
    createBrowserTileProvider(demConfig.url)
  );

  // Get tile coordinates for all DEM sources
  const tileCoords = urlList.map(demConfig => {
    const { tile } = latLngToTile(lat, lng, demConfig.zoom);
    return tile;
  });

  // Preload all tiles in parallel for better performance
  try {
    await preloadTiles(tileCoords, tileProviders);
  } catch (error) {
    // Continue even if preload fails, will try individual tiles
    console.warn(
      'Preload failed, falling back to individual tile loading:',
      error
    );
  }

  // Try each DEM source until we get elevation data
  for (let i = 0; i < urlList.length; i++) {
    const demConfig = urlList[i];
    const tileProvider = tileProviders[i];

    try {
      const { tile, pixel } = latLngToTile(lat, lng, demConfig.zoom);

      // Fetch tile as ImageBitmap (should be cached from preload)
      const tileImage = await tileProvider(tile.z, tile.x, tile.y);

      // Get pixel RGB from ImageBitmap
      const [r, g, b] = getPixelFromImageBitmap(tileImage, pixel.x, pixel.y);

      // Calculate elevation
      const elevation = calculateElevationFromRGB(r, g, b);

      if (elevation !== null) {
        return {
          elevation,
          source: demConfig.title,
          fixed: demConfig.fixed,
          position: { lat, lng, zoom: demConfig.zoom },
        };
      }
    } catch (error) {
      // Continue to next source if this one fails
      console.warn(`Failed to get elevation from ${demConfig.title}:`, error);
      continue;
    }
  }

  // No elevation data found
  return {
    elevation: null,
    source: '',
    fixed: 0,
    position: { lat, lng, zoom },
  };
}
