import type { TileCoord, PixelCoord } from './types';
import { TileCache } from './cache';
import axios from 'axios';
import { PNG } from 'pngjs';
import { normalizeColor } from './risk';

// Interface chung cho việc đọc pixel
export interface RasterReader {
  getPixelRGB(tile: TileCoord, pixel: PixelCoord): Promise<{ r: number; g: number; b: number }>;
}

// Fetch tile từ URL với axios
export async function fetchTile(url: string, cache?: TileCache, coords?: { z: number; x: number; y: number }): Promise<Buffer> {
  // Tạo key cho cache
  const cacheKey = coords || { z: 0, x: 0, y: 0 };

  // Kiểm tra cache trước
  if (cache) {
    const cached = cache.get(cacheKey.z, cacheKey.x, cacheKey.y, url);
    if (cached) {
      return cached;
    }
  }

  // Fetch từ network với axios
  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 30000, // Tăng timeout lên 30 giây cho GSI Japan
      headers: {
        'User-Agent': 'HazardRisk/1.0',
        'Accept': 'image/png,image/*,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate'
      }
    });

    const buffer = Buffer.from(response.data);

    // Kiểm tra buffer có hợp lệ không
    if (buffer.length === 0) {
      throw new Error('Empty tile data');
    }

    // Kiểm tra content-type
    const contentType = response.headers['content-type'];
    if (contentType && !contentType.includes('image/')) {
      throw new Error(`Invalid content-type: ${contentType}`);
    }

    // Lưu vào cache chỉ khi thành công
    if (cache) {
      cache.set(cacheKey.z, cacheKey.x, cacheKey.y, url, buffer);
    }

    return buffer;
  } catch (error: any) {
    // Xử lý riêng trường hợp 404 (tile không tồn tại)
    if (error.response?.status === 404) {
      console.warn(`Tile not found (404): ${url} - Treating as no risk`);
      throw new Error(`TILE_NOT_FOUND: ${url}`);
    }

    // Xử lý timeout
    if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
      console.warn(`Timeout fetching tile: ${url}`);
      throw new Error(`TIMEOUT: ${url}`);
    }

    throw new Error(`Failed to fetch tile ${url}: ${error.message}`);
  }
}

// Tạo tile provider từ URL template
export function createTileProvider(urlTemplate: string, cache?: TileCache) {
  return async (z: number, x: number, y: number): Promise<Buffer> => {
    const url = urlTemplate
      .replace('{z}', z.toString())
      .replace('{x}', x.toString())
      .replace('{y}', y.toString());

    return await fetchTile(url, cache, { z, x, y });
  };
}

// Implementation cho Node.js (dùng pngjs)
export class NodeRasterReader implements RasterReader {
  private level0Color: { r: number; g: number; b: number };

  constructor(
    private tileProvider: (z: number, x: number, y: number) => Promise<Buffer>,
    level0Color: string = '0,0,0'
  ) {
    this.level0Color = normalizeColor(level0Color);
  }

  async getPixelRGB(tile: TileCoord, pixel: PixelCoord): Promise<{ r: number; g: number; b: number }> {
    try {
      const tileBuffer = await this.tileProvider(tile.z, tile.x, tile.y);

      // Kiểm tra buffer có hợp lệ không
      if (!tileBuffer || tileBuffer.length === 0) {
        console.warn(`Empty tile buffer for tile ${tile.z}/${tile.x}/${tile.y}`);
        return this.level0Color; // Trả về màu level 0 thay vì đen
      }

      // Dùng pngjs để đọc PNG
      return new Promise((resolve, reject) => {
        try {
          const png = PNG.sync.read(tileBuffer);
          const { width, height, data } = png;

          // Kiểm tra pixel coordinates có hợp lệ không
          if (pixel.x < 0 || pixel.x >= width || pixel.y < 0 || pixel.y >= height) {
            console.warn(`Invalid pixel coordinates: ${pixel.x}, ${pixel.y} for tile ${width}x${height}`);
            resolve(this.level0Color); // Trả về màu level 0
            return;
          }

          // PNG data format: RGBA (4 bytes per pixel)
          const index = (pixel.y * width + pixel.x) * 4;

          resolve({
            r: data[index] || 0,
            g: data[index + 1] || 0,
            b: data[index + 2] || 0
          });
        } catch (error) {
          console.warn(`pngjs error for tile ${tile.z}/${tile.x}/${tile.y}:`, error);
          // Fallback: trả về màu level 0
          resolve(this.level0Color);
        }
      });
    } catch (error: any) {
      // Xử lý riêng trường hợp tile không tồn tại
      if (error.message?.includes('TILE_NOT_FOUND')) {
        console.warn(`Tile not found for ${tile.z}/${tile.x}/${tile.y} - Treating as no risk`);
        return this.level0Color; // Trả về màu level 0 thay vì đen
      }

      console.warn(`Error reading pixel from tile ${tile.z}/${tile.x}/${tile.y}:`, error);
      // Fallback: trả về màu level 0
      return this.level0Color;
    }
  }
}

// Implementation cho Browser (dùng canvas)
export class BrowserRasterReader implements RasterReader {
  private level0Color: { r: number; g: number; b: number };

  constructor(
    private tileProvider: (z: number, x: number, y: number) => Promise<ImageBitmap>,
    level0Color: string = '0,0,0'
  ) {
    this.level0Color = normalizeColor(level0Color);
  }

  async getPixelRGB(tile: TileCoord, pixel: PixelCoord): Promise<{ r: number; g: number; b: number }> {
    try {
      const tileImage = await this.tileProvider(tile.z, tile.x, tile.y);

      // Tạo canvas để đọc pixel
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;
      canvas.width = 256;
      canvas.height = 256;

      ctx.drawImage(tileImage, 0, 0);
      const imageData = ctx.getImageData(pixel.x, pixel.y, 1, 1);
      const data = imageData.data;

      return {
        r: data[0],
        g: data[1],
        b: data[2]
      };
    } catch (error: any) {
      // Xử lý lỗi tương tự Node.js
      if (error.message?.includes('TILE_NOT_FOUND')) {
        console.warn(`Tile not found for ${tile.z}/${tile.x}/${tile.y} - Treating as no risk`);
        return this.level0Color; // Trả về màu level 0 thay vì đen
      }

      console.warn(`Error reading pixel from tile ${tile.z}/${tile.x}/${tile.y}:`, error);
      return this.level0Color; // Trả về màu level 0 thay vì đen
    }
  }
}
