import { bbox, booleanPointInPolygon } from '@turf/turf';
import type { GeoJSONPolygon } from './types';

// Tính bounding box [minX, minY, maxX, maxY]
export function getBoundingBox(polygon: GeoJSONPolygon): [number, number, number, number] {
  return bbox(polygon) as [number, number, number, number];
}

// Kiểm tra điểm (lat, lon) có nằm trong polygon không
export function isPointInPolygon(lat: number, lon: number, polygon: GeoJSONPolygon): boolean {
  // turf expects [lon, lat]
  return booleanPointInPolygon([lon, lat], polygon);
}
