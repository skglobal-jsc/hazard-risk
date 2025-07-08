import { analyzeRiskInPolygon, TileCache } from './src/index';
import { circle } from '@turf/turf';

// Vị trí trung tâm
const centerLat = 35.191539000170;
const centerLon = 139.659200906754;
const radiusInMeters = 100; // 100 mét

// Tạo polygon hình tròn với bán kính 100m
const center = [centerLon, centerLat]; // turf expects [lon, lat]
const circlePolygon = circle(center, radiusInMeters / 1000, { units: 'kilometers' });

// Tạo cache cho tile images (100MB, 5 phút TTL)
const tileCache = new TileCache(100 * 1024 * 1024, 5 * 60 * 1000);

// Test thư viện
async function testHazardRisk() {
  try {
    console.log('Bắt đầu phân tích rủi ro...');
    console.log(`Vị trí trung tâm: lat=${centerLat}, lon=${centerLon}`);
    console.log(`Bán kính: ${radiusInMeters}m`);
    console.log('Polygon (hình tròn):', circlePolygon.geometry.coordinates[0]);
    console.log('Cache stats trước:', tileCache.getStats());

    // Test một tile trước để debug
    console.log('\n=== Debug: Test tile fetch ===');
    const testUrl = 'https://tile.openstreetmap.org/16/58191/25918.png';
    console.log('Testing URL:', testUrl);

    try {
      const axios = require('axios');
      const response = await axios.get(testUrl, { responseType: 'arraybuffer' });
      console.log('Tile size:', response.data.byteLength, 'bytes');
      console.log('Content-Type:', response.headers['content-type']);
    } catch (error: any) {
      console.error('Tile fetch error:', error?.message || error);
    }

    const result = await analyzeRiskInPolygon({
      polygon: circlePolygon.geometry,
      hazardTileUrl: 'https://disaportaldata.gsi.go.jp/raster/04_tsunami_newlegend_data/{z}/{x}/{y}.png', // Dùng OSM làm hazard tile test
      baseTileUrl: 'https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png',
      gridSize: 10, // 10 mét (nhỏ hơn để có nhiều điểm hơn trong vùng tròn)
      zoom: 16
    }, tileCache);

    console.log('\nKết quả phân tích:');
    console.log(`Tổng số điểm: ${result.total}`);
    console.log('Thống kê rủi ro:');

    for (const stat of result.stats) {
      console.log(`  Level ${stat.level}: ${stat.count} điểm (${stat.ratio.toFixed(2)}%)`);
    }

    // Hiển thị chi tiết một số điểm đầu tiên
    console.log('\nChi tiết 5 điểm đầu tiên:');
    result.grid.slice(0, 5).forEach((point, index) => {
      console.log(`  Điểm ${index + 1}: lat=${point.lat.toFixed(6)}, lon=${point.lon.toFixed(6)}, risk=${point.riskLevel}, water=${point.isWater}`);
    });

    // Hiển thị thống kê cache
    console.log('\nCache stats sau:', tileCache.getStats());

  } catch (error) {
    console.error('Lỗi:', error);
  }
}

// Chạy test
testHazardRisk();
