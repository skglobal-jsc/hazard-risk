import {
  getElevationFromDEM,
  getElevationFromDEMBrowser,
  DEFAULT_DEM_CONFIGS,
  type GetElevationOptions,
  type ElevationResult
} from '../src/dem';
import {
  calculateElevationFromRGB,
  latLngToTile
} from '../src/utils';

describe('DEM Functions', () => {
  describe('calculateElevationFromRGB', () => {
    it('should calculate elevation correctly', () => {
      // Test with known RGB values
      const result = calculateElevationFromRGB(128, 0, 0);
      expect(result).toBe(null); // No data color

      const result2 = calculateElevationFromRGB(0, 0, 0);
      expect(result2).toBe(0); // Zero elevation

      const result3 = calculateElevationFromRGB(1, 0, 0);
      expect(result3).toBe(655.36); // Small elevation (1 * 65536 * 0.01)
    });
  });

  describe('latLngToTile', () => {
    it('should convert lat/lng to tile coordinates correctly', () => {
      const result = latLngToTile(35.6762, 139.6503, 17);

      expect(result.tile).toHaveProperty('z', 17);
      expect(result.tile).toHaveProperty('x');
      expect(result.tile).toHaveProperty('y');
      expect(result.pixel).toHaveProperty('x');
      expect(result.pixel).toHaveProperty('y');

      // Pixel coordinates should be within tile bounds
      expect(result.pixel.x).toBeGreaterThanOrEqual(0);
      expect(result.pixel.x).toBeLessThan(256);
      expect(result.pixel.y).toBeGreaterThanOrEqual(0);
      expect(result.pixel.y).toBeLessThan(256);
    });
  });

  describe('DEFAULT_DEM_CONFIGS', () => {
    it('should have correct DEM configurations', () => {
      expect(DEFAULT_DEM_CONFIGS).toHaveLength(5);

      const dem1a = DEFAULT_DEM_CONFIGS.find(config => config.title === 'DEM1A');
      expect(dem1a).toBeDefined();
      expect(dem1a?.minzoom).toBe(17);
      expect(dem1a?.maxzoom).toBe(17);
      expect(dem1a?.fixed).toBe(1);
    });
  });

  describe('getElevationFromDEM (Node.js)', () => {
    it('should return proper structure', async () => {
      const options: GetElevationOptions = {
        lat: 35.6762,
        lng: 139.6503,
        zoom: 17
      };

      const result = await getElevationFromDEM(options);

      expect(result).toHaveProperty('elevation');
      expect(result).toHaveProperty('source');
      expect(result).toHaveProperty('fixed');
      expect(result).toHaveProperty('position');
      expect(result.position).toHaveProperty('lat');
      expect(result.position).toHaveProperty('lng');
      expect(result.position).toHaveProperty('zoom');
    });

    it('should handle invalid coordinates gracefully', async () => {
      const options: GetElevationOptions = {
        lat: 999, // Invalid latitude
        lng: 999, // Invalid longitude
        zoom: 17
      };

      const result = await getElevationFromDEM(options);

      // Should return null elevation for invalid coordinates
      expect(result.elevation).toBeNull();
      expect(result.source).toBe('');
    });
  });

  describe('getElevationFromDEMBrowser', () => {
    it('should return proper structure', async () => {
      const options: GetElevationOptions = {
        lat: 35.6762,
        lng: 139.6503,
        zoom: 17
      };

      const result = await getElevationFromDEMBrowser(options);

      expect(result).toHaveProperty('elevation');
      expect(result).toHaveProperty('source');
      expect(result).toHaveProperty('fixed');
      expect(result).toHaveProperty('position');
      expect(result.position).toHaveProperty('lat');
      expect(result.position).toHaveProperty('lng');
      expect(result.position).toHaveProperty('zoom');
    });

    it('should handle invalid coordinates gracefully', async () => {
      const options: GetElevationOptions = {
        lat: 999, // Invalid latitude
        lng: 999, // Invalid longitude
        zoom: 17
      };

      const result = await getElevationFromDEMBrowser(options);

      // Should return null elevation for invalid coordinates
      expect(result.elevation).toBeNull();
      expect(result.source).toBe('');
    });
  });

  describe('Custom DEM configurations', () => {
    it('should work with custom DEM configs', async () => {
      const customConfigs = [
        {
          title: "Test DEM",
          url: "https://test-dem.com/{z}/{x}/{y}.png",
          minzoom: 15,
          maxzoom: 15,
          fixed: 1
        }
      ];

      const options: GetElevationOptions = {
        lat: 35.6762,
        lng: 139.6503,
        zoom: 15,
        demConfigs: customConfigs
      };

      const result = await getElevationFromDEM(options);

      expect(result).toHaveProperty('elevation');
      expect(result).toHaveProperty('source');
      expect(result).toHaveProperty('fixed');
      expect(result).toHaveProperty('position');
    });
  });
});
