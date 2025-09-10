import type { TileCoord, PixelCoord, HazardConfig } from './types';
import { TileCache } from './cache';
import axios from 'axios';
import { PNG, PNGWithMetadata } from 'pngjs';
import { normalizeColor, classifyRiskFromRGB, isWaterColor } from './risk';
import type { RasterReader } from './raster-reader';

// Fetch tile from URL with axios
export async function fetchTile(
  url: string,
  cache?: TileCache,
  coords?: { z: number; x: number; y: number }
): Promise<Buffer> {
  // Create key for cache
  const cacheKey = coords || { z: 0, x: 0, y: 0 };

  // Check cache first
  if (cache) {
    const cached = cache.get(cacheKey.z, cacheKey.x, cacheKey.y, url);
    if (cached) {
      return cached;
    }
  }

  // Fetch from network with axios
  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 30000, // Increase timeout to 30 seconds for GSI Japan
      headers: {
        'User-Agent': 'HazardRisk/1.0',
        Accept: 'image/png,image/*,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate',
      },
    });

    const buffer = Buffer.from(response.data);

    // Check if buffer is valid
    if (buffer.length === 0) {
      throw new Error('Empty tile data');
    }

    // Check content-type
    const contentType = response.headers['content-type'];
    if (contentType && !contentType.includes('image/')) {
      throw new Error(`Invalid content-type: ${contentType}`);
    }

    // Save to cache only when successful
    if (cache) {
      cache.set(cacheKey.z, cacheKey.x, cacheKey.y, url, buffer);
    }

    return buffer;
  } catch (error: any) {
    // Handle 404 case specifically (tile doesn't exist)
    if (error.response?.status === 404) {
      console.warn(`Tile not found (404): ${url} - Treating as no risk`);
      // Return empty buffer instead of throwing error
      return Buffer.alloc(0);
    }

    // Handle timeout
    if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
      console.warn(`Timeout fetching tile: ${url}`);
      // throw new Error(`TIMEOUT: ${url}`);
      return Buffer.alloc(0);
    }

    // throw new Error(`Failed to fetch tile ${url}: ${error.message}`);
    return Buffer.alloc(0);
  }
}

// Create tile provider from URL template
export function createTileProvider(urlTemplate: string, cache?: TileCache) {
  return async (z: number, x: number, y: number): Promise<Buffer> => {
    const url = urlTemplate
      .replace('{z}', z.toString())
      .replace('{x}', x.toString())
      .replace('{y}', y.toString());

    return await fetchTile(url, cache, { z, x, y });
  };
}

// Implementation for Node.js (using pngjs)
export class NodeRasterReader implements RasterReader {
  constructor(
    private tileProvider: (z: number, x: number, y: number) => Promise<Buffer>
  ) {}

  async getPixelRGB(
    tile: TileCoord,
    pixel: PixelCoord
  ): Promise<{ r: number; g: number; b: number }> {
    try {
      const tileBuffer = await this.tileProvider(tile.z, tile.x, tile.y);

      // Check if buffer is valid or empty (tile not found)
      if (!tileBuffer || tileBuffer.length === 0) {
        console.warn(
          `Empty tile buffer for tile ${tile.z}/${tile.x}/${tile.y} - Treating as no risk`
        );
        return { r: 0, g: 0, b: 0 }; // Return level 0 color (no risk)
      }

      // Use pngjs to read PNG
      return new Promise((resolve, reject) => {
        try {
          const png = PNG.sync.read(tileBuffer);
          const { width, height, data } = png;

          // Check if pixel coordinates are valid
          if (
            pixel.x < 0 ||
            pixel.x >= width ||
            pixel.y < 0 ||
            pixel.y >= height
          ) {
            console.warn(
              `Invalid pixel coordinates: ${pixel.x}, ${pixel.y} for tile ${width}x${height}`
            );
            resolve({ r: 0, g: 0, b: 0 }); // Return level 0 color
            return;
          }

          // PNG data format: RGBA (4 bytes per pixel)
          const index = (pixel.y * width + pixel.x) * 4;

          resolve({
            r: data[index] || 0,
            g: data[index + 1] || 0,
            b: data[index + 2] || 0,
          });
        } catch (error) {
          console.warn(
            `pngjs error for tile ${tile.z}/${tile.x}/${tile.y}:`,
            error
          );
          // Fallback: return level 0 color
          resolve({ r: 0, g: 0, b: 0 });
        }
      });
    } catch (error: any) {
      console.warn(
        `Error reading pixel from tile ${tile.z}/${tile.x}/${tile.y}:`,
        error
      );
      // Fallback: return level 0 color (no risk)
      return { r: 0, g: 0, b: 0 };
    }
  }

  async getPixelRiskInfo(
    tile: TileCoord,
    pixel: PixelCoord,
    hazardConfig: HazardConfig
  ): Promise<{ riskLevel: number; isWater: boolean }> {
    const rgb = await this.getPixelRGB(tile, pixel);
    const riskLevel = classifyRiskFromRGB(rgb.r, rgb.g, rgb.b, hazardConfig);
    // isWater: always false in this NodeRasterReader demo
    return { riskLevel, isWater: false };
  }
}

