/**
 * ลายเซ็นเซลล์ — แปลงรูป + เก็บไฟล์
 *
 * รูปที่ผู้ใช้อัปโหลดมักเป็นรูปถ่ายจากมือถือ (กระดาษสีเทา ๆ เงามือ ขนาดหลาย MB)
 * จึงต้องแปลงก่อนเก็บ:
 *   1. ตัดเฉพาะกรอบที่ผู้ใช้เลือก
 *   2. ทำพื้นกระดาษให้โปร่งใส — ความทึบคิดจากความเข้มของหมึกเทียบกับสีกระดาษ
 *   3. ตัดขอบว่างรอบลายเซ็นออก
 *   4. ย่อให้พอดี 600×200 px แล้วเก็บเป็น PNG (ราว 20–50 KB)
 *
 * พิมพ์จริงที่กล่อง 45×16 มม. → 600px ≈ 340dpi คมพอสำหรับงานพิมพ์
 */
import { supabase } from './supabaseClient.js';

export const SIGN_MAX_W = 600;
export const SIGN_MAX_H = 200;
const BUCKET = 'signatures';

export interface CropRect { x: number; y: number; w: number; h: number }

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('เปิดรูปไม่ได้ — ลองใช้ไฟล์ JPG หรือ PNG'));
    img.src = src;
  });
}

/**
 * แปลงพื้นที่ที่เลือกเป็นลายเซ็นพื้นโปร่งใส
 * @param source รูปหรือ canvas ต้นฉบับ
 * @param crop   กรอบในพิกัดของต้นฉบับ (null = ทั้งรูป)
 * @param removeBackground false สำหรับลายเซ็นที่วาดบนจอ (พื้นโปร่งใสอยู่แล้ว)
 */
export function processSignature(
  source: CanvasImageSource & { width: number; height: number },
  crop: CropRect | null,
  removeBackground = true,
): HTMLCanvasElement | null {
  const c = crop ?? { x: 0, y: 0, w: source.width, h: source.height };
  // ทำงานที่ความละเอียดไม่เกิน 1600px พอ — รูปมือถือ 12MP ทำทั้งรูปจะช้า
  const work = Math.min(1, 1600 / Math.max(c.w, c.h));
  const W = Math.max(1, Math.round(c.w * work));
  const H = Math.max(1, Math.round(c.h * work));
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(source, c.x, c.y, c.w, c.h, 0, 0, W, H);
  const img = ctx.getImageData(0, 0, W, H);
  const d = img.data;

  if (removeBackground) {
    // สีกระดาษ = ค่าความสว่างที่เปอร์เซ็นไทล์ 90 (ลายเซ็นกินพื้นที่น้อยกว่ากระดาษเสมอ)
    const hist = new Uint32Array(256);
    for (let i = 0; i < d.length; i += 4) {
      hist[Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2])]++;
    }
    let acc = 0, paper = 255;
    const target = (d.length / 4) * 0.9;
    for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= target) { paper = v; break; } }
    paper = Math.max(paper, 60);
    const floor = paper * 0.82; // สว่างกว่านี้ = กระดาษ/เงา → โปร่งใส

    for (let i = 0; i < d.length; i += 4) {
      const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      let a = lum >= floor ? 0 : (floor - lum) / floor;
      a = Math.min(1, a * 2.2); // ดันหมึกบาง ๆ ให้ทึบขึ้น
      // ทำหมึกให้เข้มขึ้นเล็กน้อยแต่คงโทนสี (หมึกน้ำเงินยังน้ำเงิน)
      const k = 0.8;
      d[i] = d[i] * k; d[i + 1] = d[i + 1] * k; d[i + 2] = d[i + 2] * k;
      d[i + 3] = a < 0.08 ? 0 : Math.round(a * 255);
    }
    ctx.putImageData(img, 0, 0);
  }

  // ตัดขอบว่าง
  let minX = W, minY = H, maxX = -1, maxY = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (d[(y * W + x) * 4 + 3] > 24) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null; // ไม่เจอหมึกเลย
  const pad = Math.round(Math.max(maxX - minX, maxY - minY) * 0.03);
  minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
  maxX = Math.min(W - 1, maxX + pad); maxY = Math.min(H - 1, maxY + pad);
  const tw = maxX - minX + 1, th = maxY - minY + 1;

  const scale = Math.min(1, SIGN_MAX_W / tw, SIGN_MAX_H / th);
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(tw * scale));
  out.height = Math.max(1, Math.round(th * scale));
  const octx = out.getContext('2d')!;
  octx.imageSmoothingQuality = 'high';
  octx.drawImage(cv, minX, minY, tw, th, 0, 0, out.width, out.height);
  return out;
}

export function canvasToPng(cv: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    cv.toBlob((b) => (b ? resolve(b) : reject(new Error('แปลงรูปไม่สำเร็จ'))), 'image/png'));
}

/**
 * อัปโหลดลายเซ็นใหม่ แล้วชี้ผู้ใช้ไปที่ไฟล์นั้น
 * ใช้ชื่อไฟล์ใหม่ทุกครั้ง ไม่เขียนทับ — ใบที่ออกไปแล้วยังอ้างไฟล์เดิมอยู่
 */
export async function uploadSignature(userId: string, png: Blob): Promise<string> {
  const path = `${userId}/${Date.now()}.png`;
  const { error } = await supabase.storage.from(BUCKET)
    .upload(path, png, { contentType: 'image/png', upsert: false });
  if (error) throw error;
  const { error: uErr } = await supabase.from('users')
    .update({ signature_path: path, signature_updated_at: new Date().toISOString() })
    .eq('id', userId);
  if (uErr) throw uErr;
  return path;
}

/** เลิกใช้ลายเซ็น — ใบที่ออกไปแล้วยังมีลายเซ็นเดิม */
export async function clearSignature(userId: string) {
  const { error } = await supabase.from('users')
    .update({ signature_path: null, signature_updated_at: new Date().toISOString() })
    .eq('id', userId);
  if (error) throw error;
}

/**
 * ลิงก์ชั่วคราวสำหรับแสดง/พิมพ์ (หมดอายุใน 1 ชม.)
 * แปลงเป็น data URL เลย จะได้พิมพ์ PDF ได้แน่นอนแม้ลิงก์หมดอายุระหว่างเปิดหน้าค้างไว้
 */
export async function signatureDataUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error || !data) return null;
  return await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(data);
  });
}
