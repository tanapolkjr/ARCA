/**
 * โลโก้ ARCA แบบตัวอักษร (wordmark)
 *
 * ใช้ไฟล์ภาพจริงของบริษัท ไม่ได้วาด path เอง — เคยลองวาดแล้วรูปตัว R กับ C เพี้ยน
 * โลโก้บนเอกสารที่ส่งลูกค้าเพี้ยนไม่ได้ ต้องตรงต้นฉบับ 100%
 *
 * ไฟล์เป็น PNG พื้นโปร่งใส 1200px กว้าง — พิมพ์ที่ 34mm ได้ราว 900dpi
 * คมเกินพอสำหรับงานพิมพ์ และเล็กแค่ 14KB
 */
export function ArcaWordmark({
  className = '', title = 'ARCA',
}: { className?: string; title?: string }) {
  return (
    <img
      src="/logo-arca.png"
      alt={title}
      className={className}
      // กันภาพยืดผิดสัดส่วนเมื่อ container กำหนดความสูงมาด้วย
      style={{ objectFit: 'contain', objectPosition: 'left top' }}
    />
  );
}
