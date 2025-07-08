import type { TileCoord } from './types';
import { fetchTile } from './raster';

interface CacheEntry {
  data: Buffer;
  timestamp: number;
  size: number;
}

interface TileKey {
  z: number;
  x: number;
  y: number;
  url: string;
}

// LRU Cache cho tile images
export class TileCache {
  private cache = new Map<string, Buffer>();
  private maxSize: number;
  private ttl: number;
  private timestamps = new Map<string, number>();

  constructor(maxSize: number = 100 * 1024 * 1024, ttl: number = 5 * 60 * 1000) {
    this.maxSize = maxSize;
    this.ttl = ttl;
  }

  // Tạo key cho cache
  private createKey(z: number, x: number, y: number, url: string): string {
    return `${z}/${x}/${y}|${url}`;
  }

  // Lấy tile từ cache
  get(z: number, x: number, y: number, url: string): Buffer | null {
    const key = this.createKey(z, x, y, url);
    const data = this.cache.get(key);
    const timestamp = this.timestamps.get(key);

    if (!data || !timestamp) {
      return null;
    }

    // Kiểm tra TTL
    if (Date.now() - timestamp > this.ttl) {
      this.cache.delete(key);
      this.timestamps.delete(key);
      return null;
    }

    return data;
  }

  // Lưu tile vào cache
  set(z: number, x: number, y: number, url: string, data: Buffer): void {
    const key = this.createKey(z, x, y, url);

    // Kiểm tra kích thước cache
    if (this.cache.size > 0 && this.getCacheSize() + data.length > this.maxSize) {
      this.evictOldest();
    }

    this.cache.set(key, data);
    this.timestamps.set(key, Date.now());
  }

  // Preload tiles vào cache với deduplication
  async preloadTiles(
    tileUrls: string[],
    zoom: number,
    tileCoords: TileCoord[]
  ): Promise<void> {
    console.log(`🔄 Preloading tiles into cache...`);

    // Tạo unique set của tất cả tile coordinates
    const uniqueTiles = new Set<string>();
    for (const coord of tileCoords) {
      for (const urlTemplate of tileUrls) {
        const url = urlTemplate
          .replace('{z}', coord.z.toString())
          .replace('{x}', coord.x.toString())
          .replace('{y}', coord.y.toString());
        uniqueTiles.add(`${coord.z}/${coord.x}/${coord.y}|${url}`);
      }
    }

    console.log(`📊 Found ${uniqueTiles.size} unique tiles to preload`);

    // Preload với concurrency limit để tránh overwhelm server
    const concurrencyLimit = 5;
    const tiles = Array.from(uniqueTiles);
    const results: PromiseSettledResult<{ success: boolean; tile: string; error?: string }>[] = [];

    for (let i = 0; i < tiles.length; i += concurrencyLimit) {
      const batch = tiles.slice(i, i + concurrencyLimit);
      const batchPromises = batch.map(async (tileKey) => {
        const [coordPart, url] = tileKey.split('|');
        const [z, x, y] = coordPart.split('/').map(Number);

        try {
          const buffer = await fetchTile(url, this, { z, x, y });
          console.log(`✅ Preloaded: ${z}/${x}/${y}`);
          return { success: true, tile: tileKey };
        } catch (error: any) {
          if (error.message?.includes('TILE_NOT_FOUND')) {
            console.log(`⚠️  Not found: ${z}/${x}/${y}`);
          } else {
            console.warn(`❌ Failed: ${z}/${x}/${y} - ${error.message}`);
          }
          return { success: false, tile: tileKey, error: error.message };
        }
      });

      const batchResults = await Promise.allSettled(batchPromises);
      results.push(...batchResults);

      // Delay giữa các batch để tránh rate limit
      if (i + concurrencyLimit < tiles.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    const successCount = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
    const failCount = results.length - successCount;

    console.log(`✅ Preload completed: ${successCount} success, ${failCount} failed`);
    console.log(`💾 Cache size: ${this.getCacheSize()} bytes`);
  }

  // Lấy thống kê cache
  getStats(): { size: number; count: number; maxSize: number } {
    return {
      size: this.getCacheSize(),
      count: this.cache.size,
      maxSize: this.maxSize
    };
  }

  // Xóa cache cũ nhất
  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Date.now();

    for (const [key, timestamp] of this.timestamps) {
      if (timestamp < oldestTime) {
        oldestTime = timestamp;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.timestamps.delete(oldestKey);
    }
  }

  // Tính kích thước cache hiện tại
  private getCacheSize(): number {
    let totalSize = 0;
    for (const buffer of this.cache.values()) {
      totalSize += buffer.length;
    }
    return totalSize;
  }

  // Xóa toàn bộ cache
  clear(): void {
    this.cache.clear();
    this.timestamps.clear();
  }
}
