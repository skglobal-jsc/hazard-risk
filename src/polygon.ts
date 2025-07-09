import bbox from '@turf/bbox';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import type { GeoJSONPolygon } from './types';

// Calculate bounding box [minX, minY, maxX, maxY]
export function getBoundingBox(polygon: GeoJSONPolygon): [number, number, number, number] {
  return bbox(polygon) as [number, number, number, number];
}

// Check if point (lat, lon) is inside polygon
export function isPointInPolygon(lat: number, lon: number, polygon: GeoJSONPolygon): boolean {
  // turf expects [lon, lat]
  return booleanPointInPolygon([lon, lat], polygon);
}
