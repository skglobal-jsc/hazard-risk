# Đánh Giá Rủi Ro Trong Vùng Đa Giác (Polygon) Bất Kỳ

## 1. Giới thiệu

Trong các hệ thống cảnh báo thiên tai hoặc hỗ trợ thị giác (ví dụ cho người khiếm thị), việc đánh giá và truyền tải thông tin rủi ro một cách trực quan và chính xác là vô cùng quan trọng.

Trước đây, thuật toán thường tập trung vào việc phân tích rủi ro xung quanh một điểm với bán kính cố định. Tuy nhiên, trong thực tế, nhiều khu vực cần đánh giá lại có hình dạng bất quy tắc như:

- Ranh giới hành chính (xã, phường, quận)
- Khu vực trường học, bệnh viện
- Vùng dự báo ngập lụt, trượt đất

Do đó, cần xây dựng một thuật toán có thể **phân tích rủi ro trong một vùng có hình dạng bất kỳ (polygon)** dựa trên dữ liệu bản đồ dạng ảnh (map tile) và màu sắc pixel đại diện cho các mức độ rủi ro.

Dưới đây là báo cáo mô tả chi tiết thuật toán đã xây dựng, bao gồm:

- Quy trình các bước xử lý
- Các thuật toán tính toán vị trí – ảnh – pixel
- Phân loại rủi ro theo màu
- Tính toán thống kê đầu ra

## 2. Quy trình tổng quát của thuật toán

Thuật toán phân tích rủi ro trong vùng đa giác bất kỳ được chia thành 8 bước chính như sau:

1. **Xác định polygon và tính bounding box**
2. **Tạo lưới điểm (grid)** phủ toàn bộ bounding box
3. **Lọc giữ lại các điểm nằm trong polygon**
4. **Chuyển từng điểm sang tile ảnh và pixel trong tile**
5. **Lấy màu RGB từ pixel và ánh xạ sang cấp độ rủi ro**
6. **Tải tile bản đồ nền và loại bỏ điểm nằm trên mặt nước**
7. **Tính thống kê số lượng điểm theo từng mức độ rủi ro**
8. **Tạo báo cáo đầu ra để hiển thị hoặc đọc lên**

![minh_hoa_quy_trinh](attachment:file_000000009398622fbeae8afe9a9923b6)

## 3. Tạo lưới điểm bên trong polygon

Thuật toán tạo lưới điểm (grid) hoạt động theo nguyên tắc chia đều vùng bao quanh (bounding box) thành các ô vuông nhỏ, sau đó kiểm tra và giữ lại các điểm nằm trong vùng đa giác.

### Cách hoạt động:

- Tính `bounding box` bao quanh polygon
- Chia bounding box thành các ô vuông đều nhau (ví dụ: 10 mét)
- Tạo một điểm ở tâm mỗi ô vuông
- Giữ lại các điểm nằm bên trong polygon

![grid_in_polygon](attachment:file_00000000b5c461fba6b5d64eff8357c5)

## 4. Ánh xạ điểm sang tile ảnh và lấy giá trị pixel RGB

Mỗi điểm trong lưới sau khi được lọc (chỉ còn điểm trong polygon) sẽ được ánh xạ tới vị trí tương ứng trong ảnh bản đồ dạng tile.

![pixel_mapping](attachment:file_000000006b28622f96366152219bcb20)

## 5. Phân loại rủi ro từ màu RGB

Dữ liệu bản đồ hazard (ngập lụt, sạt lở...) sử dụng các mã màu đại diện cho mức độ rủi ro như:

| Màu RGB      | Ý nghĩa         | Mức rủi ro |
|--------------|------------------|------------|
| 255,0,0      | Đỏ – Rất nguy hiểm | Level 3   |
| 255,165,0    | Cam – Cảnh báo     | Level 2   |
| 255,255,0    | Vàng – Chú ý       | Level 1   |
| 0,0,0        | Đen – Không rủi ro | Level 0   |

## 6. Loại bỏ điểm nằm trên vùng nước

Một số điểm thuộc vùng nước (sông, hồ, biển...) nên cần loại bỏ. Dùng tile bản đồ nền để xác định điểm có nằm trên mặt nước hay không.

![loai_bo_nuoc](attachment:file_00000000b5c461fba6b5d64eff8357c5)

## 7. Tính thống kê rủi ro và tạo kết quả đầu ra

| Level  | Số điểm | Tỷ lệ (%) |
|--------|---------|-----------|
| 0      | 413     | 5.33%     |
| 1      | 141     | 1.82%     |
| 2      | 6489    | 83.75%    |
| 3      | 705     | 9.10%     |
| Water  | 92      | –         |
| Total  | 7840    | –         |

## 8. Kết luận và hướng mở rộng

Thuật toán hoạt động chính xác với mọi dạng polygon. Có thể mở rộng cho nhiều loại hazard, tile kết hợp, hoặc API đọc văn bản.
