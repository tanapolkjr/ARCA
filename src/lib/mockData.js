// ---------------------------------------------------------------------------
// MOCK DATA LAYER
// ---------------------------------------------------------------------------
// Everything in this file stands in for real backend calls (REST/GraphQL to
// the eventual Node/Laravel/.NET API + database described in the design
// spec). Each export below is written as the *shape* the real API should
// return, so swapping mock arrays for `fetch()`/`axios` calls later is a
// drop-in change rather than a redesign.
// ---------------------------------------------------------------------------

export const CURRENT_USER = { name: "ชลิดา ฮวดพรหม", role: "Sale", color: "bg-slate-800" };

export const MOCK_USERS = [
  { name: "ชลิดา ฮวดพรหม", role: "Sale", color: "bg-slate-800" },
  { name: "ศรัณย์ ไตรวรเดชา", role: "Admin", color: "bg-teal-500" },
  { name: "มานพ คลังสินค้า", role: "Store", color: "bg-orange-500" },
  { name: "สมชาย พีเอ็ม", role: "PM", color: "bg-purple-500" },
  { name: "อรพิน ผู้จัดการ", role: "Manager", color: "bg-rose-500" },
];

export const MOCK_CUSTOMERS = [
  "บริษัท ศุภาลัย จำกัด (มหาชน)",
  "คุณเบล initial Estate",
  "บริษัท ออโตเมชั่น จำกัด",
  "บริษัท เทอร์มินอล โซลูชั่น จำกัด",
];

export const MOCK_SITES = [
  "Supalai Bella Vichit Phuket",
  "PYVE Ramintra - Wongwaen",
  "SC Grand G1119 บางแวก",
  "Mavich สาธุประดิษฐ์-พระราม3",
];

export const SITE_DETAILS = {
  "Supalai Bella Vichit Phuket": {
    contact: "คุณฟาง",
    tel: "0972394392",
    address: "929, 929/1 ซ.พัฒนาการ 30 ถนนพัฒนาการ แขวงสวนหลวง เขตสวนหลวง",
    province: "กรุงเทพมหานคร",
    googleMap: "https://maps.app.goo.gl/7xVcuPg6MK9Fd5UT6",
  },
  "PYVE Ramintra - Wongwaen": {
    contact: "คุณเบล",
    tel: "0822545038",
    address: "454, 68 ถ.กาญจนาภิเษก ท่าแร้ง บางเขน",
    province: "กรุงเทพมหานคร",
    googleMap: "https://maps.app.goo.gl/BY6x1Q6TCUnVXZNq8",
  },
  "SC Grand G1119 บางแวก": {
    contact: "ฝ่ายขาย SC Grand",
    tel: "021029812",
    address: "ซอยบางแวก 46 แขวงบางแวก เขตภาษีเจริญ",
    province: "กรุงเทพมหานคร",
    googleMap: "",
  },
  "Mavich สาธุประดิษฐ์-พระราม3": {
    contact: "ฝ่ายขาย Mavich",
    tel: "021029813",
    address: "600/39 ถนนสาธุประดิษฐ์ แขวงบางโพงพาง เขตยานนาวา",
    province: "กรุงเทพมหานคร",
    googleMap: "",
  },
};

export const PROJECT_STATUS_STEPS = [
  "New Request",
  "Request Submitted",
  "Request Accepted",
  "Pending Scheduling",
  "Appointment Scheduled",
  "Installation in Progress",
  "Installation Completed",
];

export function projectStatusTone(status) {
  const map = {
    "New Request": "slate",
    "Request Submitted": "indigo",
    "Request Accepted": "indigo",
    "Pending Scheduling": "amber",
    "Appointment Scheduled": "amber",
    "Installation in Progress": "blue",
    "Installation Completed": "green",
    "Equipment Shipped": "blue",
    Cancelled: "rose",
  };
  return map[status] || "slate";
}

export const TICKET_STATUS_STEPS = [
  "ส่งเรื่อง",
  "รับเรื่อง",
  "รอนัดหมาย",
  "นัดหมายแล้ว",
  "กำลังดำเนินการ",
  "ปิดงานแล้ว",
];

export function ticketStatusTone(status) {
  const map = {
    ส่งเรื่อง: "slate",
    รับเรื่อง: "indigo",
    รอนัดหมาย: "amber",
    นัดหมายแล้ว: "amber",
    กำลังดำเนินการ: "blue",
    ปิดงานแล้ว: "green",
    ยกเลิกรายการ: "rose",
    "รอการตอบกลับจากลูกค้า": "rose",
  };
  return map[status] || "slate";
}

export const MOCK_PROJECTS = [
  { date: "2026-07-08", code: "23-34027-128", name: "Supalai Bella Vichit Phuket", customer: "บริษัท ศุภาลัย จำกัด (มหาชน)", plan: "ศุภศรณ์ L กลาง Rev.5", phone: "02-7258888", status: "Pending Scheduling" },
  { date: "2026-07-06", code: "25-12090-06", name: "PYVE Ramintra - Wongwaen", customer: "คุณเบล initial Estate", plan: "เข้าติดตั้ง Smart home TYPE M51", phone: "089-486-9859", status: "Request Accepted" },
  { date: "2026-07-02", code: "24-15030", name: "SC Grand G1119 บางแวก", customer: "บริษัท เอส ซี แกรนด์ จำกัด", plan: "ติดตั้ง SC Grand G1119 บางแวก", phone: "094-286-9859", status: "Installation Completed" },
  { date: "2026-06-28", code: "22-37027-37", name: "Terminal Solution", customer: "บริษัท เทอร์มินอล โซลูชั่น จำกัด", plan: "PAIR-T = 3 Ea., PAIR-R = 23 Ea.", phone: "02-102-6801", status: "New Request" },
  { date: "2026-06-20", code: "24-15045", name: "คุณธนวรรณ Smart Home ลาดพร้าว", customer: "ธนวรรณ ภัญโญพี", plan: "ติดตั้งคุณธนวรรณ Smart Home", phone: "086-741-8616", status: "Equipment Shipped" },
];

export const MOCK_TICKETS = [
  { date: "2026-06-17", code: "2506-001", company: "บริษัท พรีเซ้นต์ เทคโนโลยี จำกัด", project: "คุณยิ้ม Smart Home บางนา", contact: "คุณยิ้ม", phone: "082-094-4567", status: "ส่งเรื่อง" },
  { date: "2026-04-26", code: "2504-004", company: "บริษัท พรีเซ้นต์ เทคโนโลยี จำกัด", project: "A.S.S แอดวานซ์ สมาร์ท ซีสเต็ม", contact: "คุณบอย", phone: "089-486-9859", status: "รับเรื่อง" },
  { date: "2026-04-22", code: "2504-001", company: "บริษัท พรีเซ้นต์ เทคโนโลยี จำกัด", project: "คุณยิ้ม Smart Home บางนา", contact: "คุณยิ้ม", phone: "082-094-4567", status: "นัดหมายแล้ว" },
  { date: "2026-02-08", code: "2502-001", company: "บริษัท พรีเซ้นต์ เทคโนโลยี จำกัด", project: "คุณโจ Smart Home", contact: "คุณไตรพงศ์", phone: "085-151-7999", status: "ปิดงานแล้ว" },
];

export const DEVICE_INSTALL_ROWS = [
  { model: "LS082WH-HKZB", desc: "Smart Station Zigbee", planned: 1, withdrawn: 1 },
  { model: "LS001-1", desc: "Smart Siren", planned: 1, withdrawn: 1 },
  { model: "LS176", desc: "CUBE Switch Module 1 way", planned: 1, withdrawn: 1 },
  { model: "LS058WH", desc: "Cube Door/Window Sensor (White)", planned: 2, withdrawn: 2 },
  { model: "LS288", desc: "New Indoor Camera (5MP)", planned: 1, withdrawn: 1 },
];

export const DEVICE_DETAIL_ROWS = [
  { serial: "294B4BKPSF4B070", model: "LS288", desc: "New Indoor Camera (5MP)", start: "2026-07-08", warranty: 24 },
  { serial: "BC340029B519", model: "LS082WH-HKZB", desc: "Smart Station Zigbee", start: "2026-07-08", warranty: 24 },
  { serial: "6900051", model: "LS001-1", desc: "Smart Siren", start: "2026-07-08", warranty: 24 },
  { serial: "Ax8MEP71qgEAAAM8Mgz_w", model: "LS058WH", desc: "Cube Door/Window Sensor", start: "2026-07-08", warranty: 24 },
];

export const MOCK_COMMENTS = [
  { id: 1, user: MOCK_USERS[0], time: "07 ก.ค. 2026 14:55", text: "ส่งแบบให้ลูกค้าตรวจแล้ว รอคอนเฟิร์มแบบก่อนเข้าคิวติดตั้ง", tag: "Request Accepted" },
  { id: 2, user: MOCK_USERS[1], time: "08 ก.ค. 2026 09:12", text: "เช็ค BOQ ตรงกับ Device Install แล้ว จัดคิวช่างวันที่ 15/07 ครับ", tag: "Pending Scheduling" },
];

export const MOCK_STOCK_SUMMARY = [
  { model: "LS058WH", desc: "Cube Door/Window Sensor (White color)", onHand: 7, reserved: 3, receiveDue: "15/07/2026 (800)", receiveQty: 800, total: 807 },
  { model: "LS058WH-MN", desc: "Magnetic part of door sensor", onHand: 0, reserved: 0, receiveDue: "-", receiveQty: 0, total: 0 },
  { model: "LS082WH-HKZB", desc: "Smart Station Zigbee", onHand: 42, reserved: 12, receiveDue: "-", receiveQty: 0, total: 42 },
  { model: "LS288", desc: "New Indoor Camera (5MP)", onHand: 15, reserved: 15, receiveDue: "20/07/2026 (50)", receiveQty: 0, total: 15 },
];

export const MOCK_CONTACTS = [
  { name: "บริษัท ศุภาลัย จำกัด (มหาชน)", type: "นิติบุคคล", phone: "02-725-8888", contacts: 3, projects: 4 },
  { name: "คุณเบล initial Estate", type: "บุคคลธรรมดา", phone: "082-254-5038", contacts: 1, projects: 2 },
  { name: "บริษัท ออโตเมชั่น จำกัด", type: "นิติบุคคล", phone: "02-102-9812", contacts: 2, projects: 1 },
  { name: "บริษัท เทอร์มินอล โซลูชั่น จำกัด", type: "นิติบุคคล", phone: "02-102-6801", contacts: 2, projects: 1 },
];

export const MOCK_PM_REQUESTS = [
  { code: "PM-2607-001", type: "ขอสำรวจหน้างาน", requester: "ชลิดา ฮวดพรหม", customer: "บริษัท ศุภาลัย จำกัด", date: "2026-07-10", status: "กำลังดำเนินการ" },
  { code: "PM-2607-002", type: "ขอทดสอบสินค้า", requester: "สมชาย พีเอ็ม", customer: "-", date: "2026-07-09", status: "คำขอใหม่" },
  { code: "PM-2606-014", type: "ขอออกแบบระบบ", requester: "ชลิดา ฮวดพรหม", customer: "คุณเบล initial Estate", date: "2026-06-28", status: "เสร็จสิ้น" },
];

export const OVERDUE_ITEMS = [
  { type: "Ticket", code: "2504-002", label: "เกิน SLA มา 3 วัน", severity: "rose" },
  { type: "Project", code: "22-37027-37", label: "เลยกำหนดส่งมอบ 1 วัน", severity: "amber" },
  { type: "ใบขอซื้อ", code: "PR-2607-003", label: "ค้างอนุมัติ 5 วัน", severity: "rose" },
];
