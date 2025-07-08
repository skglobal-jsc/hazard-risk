import { analyzeRiskInPolygon, TileCache } from './src';
import * as turf from '@turf/turf';

async function main() {
  console.log('🚀 Bắt đầu phân tích rủi ro...\n');

  // Tạo polygon hình tròn bán kính 1000m quanh vị trí
  const center = turf.point([141.3543113869357, 43.06194898993809]);
  const radius = 0.1; // 100m
  const polygon = turf.circle(center, radius, { units: 'kilometers' });

  // Tạo cache với preload
  const tileCache = new TileCache(100 * 1024 * 1024, 5 * 60 * 1000); // 100MB, 5 phút

  // Hazard config với hỗ trợ cả RGB và hex color
  const hazardConfig = {
    name: 'Tsunami Risk',
    levels: {
      0: {
        name: 'level0',
        color: '#000000', // Hex format
        description: 'Không rủi ro'
      },
      1: {
        name: 'level1',
        color: '255,255,0', // RGB format
        description: 'Chú ý'
      },
      2: {
        name: 'level2',
        color: '#ffa500', // Hex format
        description: 'Cảnh báo'
      },
      3: {
        name: 'level3',
        color: '255,0,0', // RGB format
        description: 'Rất nguy hiểm'
      }
    },
    // Array các màu nước đã xác định sẵn (hex format)
    waterColors: ['#bed2ff', '#a8c8ff', '#8bb8ff', '#6aa8ff']
  };

  console.log('📍 Vị trí phân tích:');
  console.log(`   Lat: ${center.geometry.coordinates[1]}`);
  console.log(`   Lon: ${center.geometry.coordinates[0]}`);
  console.log(`   Bán kính: ${radius * 1000}m\n`);

  console.log('🗺️  Hazard Config:');
  console.log(`   Tên: ${hazardConfig.name}`);
  console.log('   Risk Levels:');
  for (const [level, config] of Object.entries(hazardConfig.levels)) {
    const colorType = config.color.startsWith('#') ? 'HEX' : 'RGB';
    console.log(`     Level ${level}: ${config.name} - ${config.description} (${config.color} - ${colorType})`);
  }
  console.log(`   Màu nước: ${hazardConfig.waterColors?.join(', ')}\n`);

  console.log('💾 Cache Config:');
  console.log(`   Max size: ${tileCache.getStats().maxSize / (1024 * 1024)}MB`);
  console.log(`   TTL: 5 phút\n`);

  try {
    // Phân tích rủi ro với cache
    const result = await analyzeRiskInPolygon({
      polygon: polygon.geometry,
      hazardTileUrl: 'https://disaportaldata.gsi.go.jp/raster/01_flood_l1_shinsuishin_newlegend_data/{z}/{x}/{y}.png', // Hazard tile (GSI Japan)
      baseTileUrl: 'https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png', // Base tile (GSI Japan)
      gridSize: 5, // 10 mét
      zoom: 15,
      hazardConfig: hazardConfig
    }, tileCache);

    console.log('📊 Kết quả phân tích:');
    console.log(`   Tổng điểm: ${result.total}`);
    console.log(`   Điểm rủi ro: ${result.stats.filter(s => s.level !== 'water').reduce((sum, s) => sum + s.count, 0)}\n`);

    console.log('📈 Thống kê chi tiết:');
    for (const stat of result.stats) {
      if (stat.level === 'water') {
        console.log(`   💧 Nước: ${stat.count} điểm (${stat.ratio.toFixed(1)}%)`);
      } else {
        const levelConfig = hazardConfig.levels[stat.level as number];
        const colorType = levelConfig.color.startsWith('#') ? 'HEX' : 'RGB';
        console.log(`   Level ${stat.level} (${levelConfig.name}): ${stat.count} điểm (${stat.ratio.toFixed(1)}%)`);
        console.log(`     Mô tả: ${levelConfig.description}`);
        console.log(`     Màu: ${levelConfig.color} (${colorType})`);
      }
    }

    console.log('\n✅ Phân tích hoàn thành!');

  } catch (error) {
    console.error('❌ Lỗi:', error);
  }
}

main();
