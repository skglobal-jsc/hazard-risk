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
  private cache = new Map<string, CacheEntry>();
  private maxSize: number; // bytes
  private maxAge: number; // milliseconds
  private currentSize = 0;

  constructor(maxSize = 100 * 1024 * 1024, maxAge = 5 * 60 * 1000) { // 100MB, 5 phút
    this.maxSize = maxSize;
    this.maxAge = maxAge;
  }

  // Tạo key cho tile
  private createKey(z: number, x: number, y: number, url: string): string {
    return `${z}/${x}/${y}:${url}`;
  }

  // Lấy tile từ cache
  get(z: number, x: number, y: number, url: string): Buffer | null {
    const key = this.createKey(z, x, y, url);
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // Kiểm tra TTL
    if (Date.now() - entry.timestamp > this.maxAge) {
      this.cache.delete(key);
      this.currentSize -= entry.size;
      return null;
    }

    // Move to end (LRU)
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.data;
  }

  // Lưu tile vào cache
  set(z: number, x: number, y: number, url: string, data: Buffer): void {
    const key = this.createKey(z, x, y, url);
    const size = data.length;
    const entry: CacheEntry = {
      data,
      timestamp: Date.now(),
      size
    };

    // Nếu đã có, xóa entry cũ
    const existing = this.cache.get(key);
    if (existing) {
      this.currentSize -= existing.size;
    }

    // Kiểm tra và xóa entries cũ nếu cần
    while (this.currentSize + size > this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (!firstKey) break;

      const firstEntry = this.cache.get(firstKey)!;
      this.cache.delete(firstKey);
      this.currentSize -= firstEntry.size;
    }

    // Thêm entry mới
    this.cache.set(key, entry);
    this.currentSize += size;
  }

  // Xóa cache
  clear(): void {
    this.cache.clear();
    this.currentSize = 0;
  }

  // Lấy thống kê cache
  getStats(): { size: number; count: number; maxSize: number } {
    return {
      size: this.currentSize,
      count: this.cache.size,
      maxSize: this.maxSize
    };
  }
}
