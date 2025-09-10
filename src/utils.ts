import { PNG, PNGWithMetadata } from 'pngjs';
import type { TileCoord, PixelCoord } from './types';

// Constants for elevation calculation
export const POW2_8 = Math.pow(2, 8);
export const POW2_16 = Math.pow(2, 16);
export const POW2_23 = Math.pow(2, 23);
export const POW2_24 = Math.pow(2, 24);

// No data color (128, 0, 0)
export const NO_DATA_R = 128;
export const NO_DATA_G = 0;
export const NO_DATA_B = 0;

// Convert lat/lng to tile coordinates
export function latLngToTile(
  lat: number,
  lng: number,
  z: number
): { tile: TileCoord; pixel: PixelCoord } {
  const lng_rad = (lng * Math.PI) / 180;
  const R = 128 / Math.PI;
  const worldCoordX = R * (lng_rad + Math.PI);
  const pixelCoordX = worldCoordX * Math.pow(2, z);
  const tileCoordX = Math.floor(pixelCoordX / 256);

  const lat_rad = (lat * Math.PI) / 180;
  const worldCoordY =
    (-R / 2) * Math.log((1 + Math.sin(lat_rad)) / (1 - Math.sin(lat_rad))) +
    128;
  const pixelCoordY = worldCoordY * Math.pow(2, z);
  const tileCoordY = Math.floor(pixelCoordY / 256);

  return {
    tile: {
      z,
      x: tileCoordX,
      y: tileCoordY,
    },
    pixel: {
      x: Math.floor(pixelCoordX - tileCoordX * 256),
      y: Math.floor(pixelCoordY - tileCoordY * 256),
    },
  };
}

// Get pixel RGB from PNG buffer (unified function)
export function getPixelFromPNG(
  png: PNGWithMetadata | undefined,
  x: number,
  y: number
): [number, number, number] {
  if (!png) return [0, 0, 0];

  const { width, height, data } = png;

  if (x < 0 || x >= width || y < 0 || y >= height) {
    return [0, 0, 0];
  }

  const idx = (y * width + x) * 4;
  return [data[idx] || 0, data[idx + 1] || 0, data[idx + 2] || 0];
}


// Calculate elevation from RGB values
export function calculateElevationFromRGB(
  r: number,
  g: number,
  b: number
): number | null {
  // Check for no data color
  if (r === NO_DATA_R && g === NO_DATA_G && b === NO_DATA_B) {
    return null;
  }

  // Calculate elevation using the same formula as JavaScript code
  const d = r * POW2_16 + g * POW2_8 + b;
  let h = d < POW2_23 ? d : d - POW2_24;

  if (h === -POW2_23) {
    h = 0;
  } else {
    h *= 0.01;
  }

  return h;
}

// Preload tiles in parallel (generic function)
export async function preloadTiles<T>(
  tileCoords: { z: number; x: number; y: number }[],
  tileProviders: Array<(z: number, x: number, y: number) => Promise<T>>
): Promise<void> {
  const promises: Promise<T>[] = [];

  for (const coord of tileCoords) {
    for (const provider of tileProviders) {
      promises.push(provider(coord.z, coord.x, coord.y));
    }
  }

  await Promise.all(promises);
}

// Create URL list from DEM configs
export function createDEMUrlList(
  demConfigs: any[]
): Array<any & { zoom: number }> {
  const urlList: Array<any & { zoom: number }> = [];

  for (const demConfig of demConfigs) {
    const minzoom = Math.min(demConfig.minzoom, demConfig.maxzoom);
    const maxzoom = Math.max(demConfig.minzoom, demConfig.maxzoom);

    for (let z = maxzoom; z >= minzoom; z--) {
      urlList.push({
        ...demConfig,
        zoom: z,
      });
    }
  }

  return urlList;
}

// Read PNG from buffer with error handling
export function readPNGFromBuffer(buffer: Buffer): PNGWithMetadata | undefined {
  try {
    return PNG.sync.read(buffer);
  } catch (error) {
    console.warn('Failed to read PNG from buffer:', error);
    return undefined;
  }
}
