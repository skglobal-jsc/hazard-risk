import type { TileCoord, PixelCoord } from './types';
import { TileCache } from './cache';
import axios from 'axios';
import { PNG } from 'pngjs';

// Interface chung cho việc đọc pixel
export interface RasterReader {
  getPixelRGB(tile: TileCoord, pixel: PixelCoord): Promise<{ r: number; g: number; b: number }>;
}

// Fetch tile từ URL với axios
export async function fetchTile(url: string, cache?: TileCache): Promise<Buffer> {
  // Tạo key cho cache (đơn giản dùng URL)
  const cacheKey = { z: 0, x: 0, y: 0, url }; // Sẽ được override bởi caller

  // Kiểm tra cache trước
  if (cache) {
    const cached = cache.get(cacheKey.z, cacheKey.x, cacheKey.y, cacheKey.url);
    if (cached) {
      return cached;
    }
  }

  // Fetch từ network với axios
  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 10000, // 10 giây timeout
      headers: {
        'User-Agent': 'HazardRisk/1.0'
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
      cache.set(cacheKey.z, cacheKey.x, cacheKey.y, cacheKey.url, buffer);
    }

    return buffer;
  } catch (error: any) {
    // Xử lý riêng trường hợp 404 (tile không tồn tại)
    if (error.response?.status === 404) {
      console.warn(`Tile not found (404): ${url} - Treating as no risk`);
      throw new Error(`TILE_NOT_FOUND: ${url}`);
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

    return await fetchTile(url, cache);
  };
}

// Implementation cho Node.js (dùng pngjs)
export class NodeRasterReader implements RasterReader {
  private cache?: TileCache;

  constructor(
    private tileProvider: (z: number, x: number, y: number) => Promise<Buffer>,
    cache?: TileCache
  ) {
    this.cache = cache;
  }

  async getPixelRGB(tile: TileCoord, pixel: PixelCoord): Promise<{ r: number; g: number; b: number }> {
    try {
      const tileBuffer = await this.tileProvider(tile.z, tile.x, tile.y);

      // Kiểm tra buffer có hợp lệ không
      if (!tileBuffer || tileBuffer.length === 0) {
        console.warn(`Empty tile buffer for tile ${tile.z}/${tile.x}/${tile.y}`);
        return { r: 0, g: 0, b: 0 }; // Mặc định đen (không rủi ro)
      }

      // Dùng pngjs để đọc PNG
      return new Promise((resolve, reject) => {
        try {
          const png = PNG.sync.read(tileBuffer);
          const { width, height, data } = png;

          // Kiểm tra pixel coordinates có hợp lệ không
          if (pixel.x < 0 || pixel.x >= width || pixel.y < 0 || pixel.y >= height) {
            console.warn(`Invalid pixel coordinates: ${pixel.x}, ${pixel.y} for tile ${width}x${height}`);
            resolve({ r: 0, g: 0, b: 0 });
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
          // Fallback: trả về màu đen (không rủi ro)
          resolve({ r: 0, g: 0, b: 0 });
        }
      });
    } catch (error: any) {
      // Xử lý riêng trường hợp tile không tồn tại
      if (error.message?.includes('TILE_NOT_FOUND')) {
        console.warn(`Tile not found for ${tile.z}/${tile.x}/${tile.y} - Treating as no risk`);
        return { r: 0, g: 0, b: 0 }; // Màu đen = không rủi ro
      }

      console.warn(`Error reading pixel from tile ${tile.z}/${tile.x}/${tile.y}:`, error);
      // Fallback: trả về màu đen (không rủi ro)
      return { r: 0, g: 0, b: 0 };
    }
  }
}

// Implementation cho Browser (dùng canvas)
export class BrowserRasterReader implements RasterReader {
  constructor(private tileProvider: (z: number, x: number, y: number) => Promise<ImageBitmap>) {}

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
        return { r: 0, g: 0, b: 0 };
      }

      console.warn(`Error reading pixel from tile ${tile.z}/${tile.x}/${tile.y}:`, error);
      return { r: 0, g: 0, b: 0 };
    }
  }
}
