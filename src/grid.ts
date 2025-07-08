import { getBoundingBox, isPointInPolygon } from './polygon';
import type { GeoJSONPolygon, GridPoint } from './types';

// Tạo lưới điểm phủ bounding box
export function createGrid(
  polygon: GeoJSONPolygon,
  gridSize: number, // mét
  zoom: number
): GridPoint[] {
  const bbox = getBoundingBox(polygon);
  const [minLon, minLat, maxLon, maxLat] = bbox;

  // Chuyển gridSize từ mét sang độ (xấp xỉ)
  // 1 độ lat ≈ 111km, 1 độ lon ≈ 111km * cos(lat)
  const avgLat = (minLat + maxLat) / 2;
  const latStep = gridSize / 111000; // mét -> độ
  const lonStep = gridSize / (111000 * Math.cos(avgLat * Math.PI / 180));

  const grid: GridPoint[] = [];

  // Tạo lưới điểm
  for (let lat = minLat; lat <= maxLat; lat += latStep) {
    for (let lon = minLon; lon <= maxLon; lon += lonStep) {
      // Kiểm tra điểm có nằm trong polygon không
      if (isPointInPolygon(lat, lon, polygon)) {
        const tile = latLonToTile(lat, lon, zoom);
        const pixel = latLonToPixel(lat, lon, zoom);

        grid.push({
          lat,
          lon,
          tile,
          pixel
        });
      }
    }
  }

  return grid;
}

// Chuyển lat/lon sang tile XYZ
function latLonToTile(lat: number, lon: number, zoom: number) {
  const n = Math.pow(2, zoom);
  const xtile = Math.floor((lon + 180) / 360 * n);
  const ytile = Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n);

  return { z: zoom, x: xtile, y: ytile };
}

// Chuyển lat/lon sang pixel trong tile
function latLonToPixel(lat: number, lon: number, zoom: number) {
  const n = Math.pow(2, zoom);
  const x = ((lon + 180) / 360 * n) * 256;
  const y = ((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n) * 256;

  return {
    x: Math.floor(x % 256),
    y: Math.floor(y % 256)
  };
}
