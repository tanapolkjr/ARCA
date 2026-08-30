/**
 * ตราประทับบริษัท อาร์-คา เฮาส์ จำกัด
 *
 * วาดเป็น SVG แทนการฝังรูป เพราะ:
 *   • คมทุกขนาด ตั้งแต่ favicon 32px จนถึงหัวเอกสารที่พิมพ์ 300dpi
 *   • ใช้ currentColor จึงกลับสีเองในโหมดมืด ไม่ต้องมีไฟล์สองชุด
 *   • ไฟล์เล็กกว่ารูปหลายสิบเท่า และไม่มีขอบขาวติดมาเวลาวางบนพื้นสี
 *
 * ข้อความโค้งตามวงใช้ textPath — ส่วนโค้งบนวิ่งซ้าย→ขวาแบบตามเข็ม (sweep 1)
 * ส่วนโค้งล่างวิ่งซ้าย→ขวาแบบทวนเข็ม (sweep 0) ตัวอักษรจึงตั้งตรงทั้งสองด้าน
 */
export function ArcaSeal({
  className = '', title = 'ARCA HAUS',
}: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 200 200"
      className={className}
      role="img"
      aria-label={title}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <path id="arca-seal-top" d="M 28,100 A 72,72 0 0 1 172,100" />
        <path id="arca-seal-bottom" d="M 30,100 A 70,70 0 0 0 170,100" />
      </defs>

      {/* วงนอกหนา วงในบาง — สัดส่วนแบบตราประทับราชการ */}
      <circle cx="100" cy="100" r="96" stroke="currentColor" strokeWidth="3.5" />
      <circle cx="100" cy="100" r="84" stroke="currentColor" strokeWidth="2" />

      <text
        fill="currentColor"
        fontSize="15"
        fontWeight="500"
        letterSpacing="0.5"
        style={{ fontFamily: "'Noto Sans Thai', sans-serif" }}
      >
        <textPath href="#arca-seal-top" startOffset="50%" textAnchor="middle">
          บริษัท อาร์-คา เฮาส์ จำกัด
        </textPath>
      </text>

      <text
        fill="currentColor"
        fontSize="12.5"
        fontWeight="500"
        letterSpacing="1.2"
        style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
      >
        <textPath href="#arca-seal-bottom" startOffset="50%" textAnchor="middle">
          AR-CA HAUS COMPANY LIMITED
        </textPath>
      </text>

      {/* จุดคั่นซ้าย-ขวา ระหว่างข้อความไทยกับอังกฤษ */}
      <circle cx="18" cy="100" r="4" fill="currentColor" />
      <circle cx="182" cy="100" r="4" fill="currentColor" />

      <text
        x="100"
        y="100"
        fill="currentColor"
        fontSize="46"
        fontWeight="400"
        letterSpacing="2"
        textAnchor="middle"
        dominantBaseline="central"
        style={{ fontFamily: "Inter, 'Helvetica Neue', sans-serif" }}
      >
        ARCA
      </text>
    </svg>
  );
}
