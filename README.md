# Hazard Risk Analysis Library

Thư viện TypeScript để phân tích rủi ro thiên tai trong vùng đa giác (polygon) bất kỳ dựa trên dữ liệu bản đồ dạng tile.

## Tính năng

- ✅ Phân tích rủi ro trong polygon bất kỳ (GeoJSON)
- ✅ Tạo lưới điểm tự động với độ phân giải tùy chỉnh
- ✅ Đọc pixel từ tile ảnh (hazard map + base map)
- ✅ Phân loại rủi ro theo màu RGB
- ✅ Loại bỏ điểm nằm trên vùng nước
- ✅ Tính thống kê chi tiết
- ✅ Hỗ trợ cả Node.js và Browser
- ✅ TypeScript với type safety

## Cài đặt

```bash
npm install @sk-global/hazard-risk
```

## Sử dụng

### Cơ bản

```typescript
import { analyzeRiskInPolygon } from '@sk-global/hazard-risk';

const polygon = {
  type: 'Polygon',
  coordinates: [[
    [105.8, 21.0], // bottom-left
    [105.9, 21.0], // bottom-right
    [105.9, 21.1], // top-right
    [105.8, 21.1], // top-left
    [105.8, 21.0]  // close polygon
  ]]
};

const result = await analyzeRiskInPolygon({
  polygon,
  hazardTileProvider: async (z, x, y) => {
    // Load hazard tile từ URL hoặc file
    const response = await fetch(`https://api.example.com/hazard/${z}/${x}/${y}.png`);
    return await response.arrayBuffer();
  },
  baseTileProvider: async (z, x, y) => {
    // Load base tile để kiểm tra nước
    const response = await fetch(`https://api.example.com/base/${z}/${x}/${y}.png`);
    return await response.arrayBuffer();
  },
  gridSize: 100, // 100 mét
  zoom: 16
});

console.log('Thống kê rủi ro:', result.stats);
console.log('Tổng số điểm:', result.total);
```

### Kết quả

```typescript
{
  stats: [
    { level: 0, count: 413, ratio: 5.33 },   // Không rủi ro
    { level: 1, count: 141, ratio: 1.82 },   // Chú ý
    { level: 2, count: 6489, ratio: 83.75 }, // Cảnh báo
    { level: 3, count: 705, ratio: 9.10 },   // Rất nguy hiểm
    { level: 'water', count: 92, ratio: 0 }  // Vùng nước
  ],
  total: 7840,
  grid: [...] // Chi tiết từng điểm
}
```

## API Reference

### `analyzeRiskInPolygon(options)`

Phân tích rủi ro trong polygon.

**Parameters:**
- `options.polygon`: GeoJSON Polygon
- `options.hazardTileProvider`: Function load hazard tile
- `options.baseTileProvider`: Function load base tile
- `options.gridSize`: Khoảng cách giữa các điểm (mét)
- `options.zoom`: Zoom level của tile

**Returns:**
- `stats`: Thống kê theo level rủi ro
- `total`: Tổng số điểm
- `grid`: Chi tiết từng điểm

### Phân loại rủi ro

| Màu RGB      | Ý nghĩa         | Level |
|--------------|------------------|-------|
| 255,0,0      | Đỏ – Rất nguy hiểm | 3     |
| 255,165,0    | Cam – Cảnh báo     | 2     |
| 255,255,0    | Vàng – Chú ý       | 1     |
| 0,0,0        | Đen – Không rủi ro | 0     |

## Hỗ trợ môi trường

- ✅ Node.js (AWS Lambda)
- ✅ Browser (ES modules)
- ✅ TypeScript

## Dependencies

- `@turf/turf`: Xử lý polygon, bounding box
- `jimp`: Đọc pixel từ ảnh (Node.js)

## License

MIT
