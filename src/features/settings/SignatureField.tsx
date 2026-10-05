/**
 * ลายเซ็นของผู้ใช้ — อัปโหลดรูป + ครอป หรือวาดบนจอ
 *
 * ผลลัพธ์ถูกแปลงเป็น PNG พื้นโปร่งใส ขนาดพอดีกล่องลายเซ็นบนเอกสาร (45×16 มม.)
 * ก่อนบันทึกจะเห็นตัวอย่างในขนาดเทียบเท่าตอนพิมพ์จริง
 */
import { useEffect, useRef, useState } from 'react';
import { Upload, PenLine, Trash2, RotateCcw } from 'lucide-react';
import {
  canvasToPng, clearSignature, loadImage, processSignature, signatureDataUrl, uploadSignature,
  type CropRect,
} from '@/lib/signature';

type Mode = 'view' | 'upload' | 'draw';
const MAX_FILE_MB = 15;

export function SignatureField({
  userId, currentPath, onChanged,
}: { userId: string; currentPath: string | null; onChanged: () => void }) {
  const [mode, setMode] = useState<Mode>('view');
  const [current, setCurrent] = useState<string | null>(null);
  const [result, setResult] = useState<HTMLCanvasElement | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultKb, setResultKb] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void signatureDataUrl(currentPath).then((u) => alive && setCurrent(u));
    return () => { alive = false; };
  }, [currentPath]);

  useEffect(() => {
    if (!result) { setResultUrl(null); setResultKb(null); return; }
    setResultUrl(result.toDataURL('image/png'));
    void canvasToPng(result).then((b) => setResultKb(Math.max(1, Math.round(b.size / 1024))));
  }, [result]);

  const reset = () => { setMode('view'); setResult(null); setErr(null); };

  async function save() {
    if (!result) return;
    setBusy(true); setErr(null);
    try {
      await uploadSignature(userId, await canvasToPng(result));
      reset();
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'บันทึกลายเซ็นไม่สำเร็จ');
    } finally { setBusy(false); }
  }

  async function remove() {
    if (!window.confirm('เลิกใช้ลายเซ็นนี้? เอกสารที่ออกไปแล้วยังมีลายเซ็นเดิมอยู่')) return;
    setBusy(true);
    try { await clearSignature(userId); onChanged(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'ลบไม่สำเร็จ'); }
    finally { setBusy(false); }
  }

  const tab = (m: Mode, icon: JSX.Element, label: string) => (
    <button type="button" onClick={() => { setResult(null); setErr(null); setMode(m); }}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border ${
        mode === m
          ? 'bg-stone-900 text-white border-stone-900 dark:bg-stone-100 dark:text-stone-900'
          : 'border-stone-200 dark:border-stone-600 text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-700'}`}>
      {icon}{label}
    </button>
  );

  return (
    <div className="space-y-3">
      {mode === 'view' && (
        <div className="flex items-center gap-3">
          <PrintPreview url={current} />
          <div className="flex flex-col gap-1.5">
            {tab('upload', <Upload className="w-3.5 h-3.5" />, current ? 'เปลี่ยนจากรูป' : 'อัปโหลดรูป')}
            {tab('draw', <PenLine className="w-3.5 h-3.5" />, 'วาดบนจอ')}
            {current && (
              <button type="button" onClick={() => void remove()} disabled={busy}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20">
                <Trash2 className="w-3.5 h-3.5" /> เลิกใช้
              </button>
            )}
          </div>
        </div>
      )}

      {mode === 'upload' && <UploadCrop onResult={setResult} onError={setErr} />}
      {mode === 'draw' && <DrawPad onResult={setResult} />}

      {mode !== 'view' && (
        <>
          <div className="flex items-end gap-3">
            <PrintPreview url={resultUrl} />
            <p className="text-[11px] text-stone-400 leading-relaxed">
              ตัวอย่างขนาดเท่าบนเอกสาร
              {resultKb != null && <><br />ไฟล์ {resultKb} KB · {result?.width}×{result?.height}px</>}
            </p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={reset}
              className="px-3 py-1.5 rounded-lg text-xs text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-700">
              ยกเลิก
            </button>
            <button type="button" onClick={() => void save()} disabled={!result || busy}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-stone-900 hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 disabled:opacity-50">
              {busy ? 'กำลังบันทึก...' : 'ใช้ลายเซ็นนี้'}
            </button>
          </div>
        </>
      )}

      {err && <p className="text-xs text-rose-600">{err}</p>}
      <p className="text-[11px] text-stone-400">
        ขึ้นในช่องผู้อนุมัติ/ผู้รับเงิน ของเอกสารที่ระบุคุณเป็นผู้ขาย เมื่อเอกสารอนุมัติหรือออกแล้วเท่านั้น
        · เปลี่ยนลายเซ็นทีหลังไม่กระทบเอกสารที่ออกไปแล้ว
      </p>
    </div>
  );
}

/** กล่องขนาดเทียบกล่องลายเซ็นบนกระดาษ 45×16 มม. พร้อมเส้นลงนาม */
function PrintPreview({ url }: { url: string | null }) {
  return (
    <div className="w-[180px] shrink-0 rounded-lg border border-stone-200 dark:border-stone-600 bg-white px-3 pt-2 pb-1">
      <div className="h-[64px] flex items-end justify-center">
        {url
          ? <img src={url} alt="ลายเซ็น" className="max-h-full max-w-full object-contain" />
          : <span className="text-[11px] text-stone-300 mb-4">ยังไม่มีลายเซ็น</span>}
      </div>
      <div className="border-t border-stone-400 mt-0.5" />
      <div className="text-[9px] text-center text-stone-500 mt-0.5">ผู้อนุมัติ</div>
    </div>
  );
}

// ------------------------------------------------------------- อัปโหลด + ครอป

function UploadCrop({
  onResult, onError,
}: { onResult: (c: HTMLCanvasElement | null) => void; onError: (m: string | null) => void }) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [crop, setCrop] = useState<CropRect | null>(null);   // พิกัดบนรูปจริง
  const boxRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x0: number; y0: number } | null>(null);
  const [draft, setDraft] = useState<CropRect | null>(null); // ระหว่างลาก

  async function pick(file: File | undefined) {
    if (!file) return;
    onError(null);
    if (file.size > MAX_FILE_MB * 1024 * 1024) { onError(`ไฟล์ใหญ่เกิน ${MAX_FILE_MB} MB`); return; }
    const url = URL.createObjectURL(file);
    try {
      const im = await loadImage(url);
      setImg(im);
      setCrop(null);
      onResult(processSignature(im, null));
    } catch (e) {
      onError(e instanceof Error ? e.message : 'เปิดรูปไม่ได้');
    }
  }

  // แปลงตำแหน่งเมาส์/นิ้ว → พิกัดบนรูปจริง
  const toImg = (e: React.PointerEvent) => {
    const r = boxRef.current!.getBoundingClientRect();
    const sx = img!.width / r.width, sy = img!.height / r.height;
    return {
      x: Math.min(img!.width, Math.max(0, (e.clientX - r.left) * sx)),
      y: Math.min(img!.height, Math.max(0, (e.clientY - r.top) * sy)),
    };
  };
  const rectOf = (a: { x: number; y: number }, b: { x: number; y: number }): CropRect => ({
    x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y),
  });

  function finish(r: CropRect | null) {
    drag.current = null; setDraft(null);
    if (!img) return;
    // ลากสั้นเกินไป = คลิกเฉย ๆ → ใช้ทั้งรูป
    const useRect = r && r.w > img.width * 0.03 && r.h > img.height * 0.03 ? r : null;
    setCrop(useRect);
    const out = processSignature(img, useRect);
    onResult(out);
    onError(out ? null : 'ไม่เจอลายเซ็นในกรอบที่เลือก ลองเลือกใหม่ หรือถ่ายรูปบนกระดาษขาวให้สว่างขึ้น');
  }

  const shown = draft ?? crop;
  const pct = (r: CropRect) => ({
    left: `${(r.x / img!.width) * 100}%`, top: `${(r.y / img!.height) * 100}%`,
    width: `${(r.w / img!.width) * 100}%`, height: `${(r.h / img!.height) * 100}%`,
  });

  return (
    <div className="space-y-2">
      <label className="block">
        <input type="file" accept="image/png,image/jpeg,image/webp,image/heic"
               className="block w-full text-xs text-stone-500 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg
                 file:border-0 file:bg-stone-100 file:text-stone-700 dark:file:bg-stone-700 dark:file:text-stone-200"
               onChange={(e) => void pick(e.target.files?.[0])} />
      </label>
      <p className="text-[11px] text-stone-400">
        เซ็นบนกระดาษขาว ถ่ายรูปให้สว่าง ไม่มีเงา · <b>ลากกรอบ</b>บนรูปเพื่อเลือกเฉพาะลายเซ็น
        ระบบจะลบพื้นกระดาษและย่อขนาดให้เอง
      </p>
      {img && (
        <div className="relative">
          <div ref={boxRef}
               className="relative inline-block align-top max-w-full select-none touch-none cursor-crosshair rounded-lg overflow-hidden border border-stone-200 dark:border-stone-600"
               onPointerDown={(e) => {
                 (e.target as HTMLElement).setPointerCapture(e.pointerId);
                 const p = toImg(e); drag.current = { x0: p.x, y0: p.y };
                 setDraft({ x: p.x, y: p.y, w: 0, h: 0 });
               }}
               onPointerMove={(e) => {
                 if (!drag.current) return;
                 setDraft(rectOf({ x: drag.current.x0, y: drag.current.y0 }, toImg(e)));
               }}
               onPointerUp={() => finish(draft)}
               onPointerCancel={() => finish(null)}>
            <img src={img.src} alt="" draggable={false} className="block max-w-full max-h-[300px] w-auto h-auto" />
            {shown && shown.w > 0 && (
              <div className="absolute border-2 border-sky-500 bg-sky-400/10 pointer-events-none"
                   style={{ ...pct(shown), boxShadow: '0 0 0 9999px rgba(15,23,42,.35)' }} />
            )}
          </div>
          {crop && (
            <button type="button" onClick={() => finish(null)}
              className="absolute top-2 right-2 inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] bg-white/90 text-stone-700 shadow">
              <RotateCcw className="w-3 h-3" /> ใช้ทั้งรูป
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ วาดบนจอ

function DrawPad({ onResult }: { onResult: (c: HTMLCanvasElement | null) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [dirty, setDirty] = useState(false);

  const pos = (e: React.PointerEvent) => {
    const cv = ref.current!, r = cv.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (cv.width / r.width), y: (e.clientY - r.top) * (cv.height / r.height) };
  };
  const clear = () => {
    const cv = ref.current!; cv.getContext('2d')!.clearRect(0, 0, cv.width, cv.height);
    setDirty(false); onResult(null);
  };

  return (
    <div className="space-y-2">
      <div className="relative rounded-lg border border-dashed border-stone-300 dark:border-stone-600 bg-white">
        <canvas ref={ref} width={1200} height={400}
          className="block w-full aspect-[3/1] touch-none cursor-crosshair"
          onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); last.current = pos(e); }}
          onPointerMove={(e) => {
            if (!last.current) return;
            const ctx = ref.current!.getContext('2d')!;
            const p = pos(e);
            ctx.strokeStyle = '#1e2a6e'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
            ctx.lineWidth = e.pressure && e.pointerType === 'pen' ? 3 + e.pressure * 6 : 6;
            ctx.beginPath(); ctx.moveTo(last.current.x, last.current.y); ctx.lineTo(p.x, p.y); ctx.stroke();
            last.current = p; setDirty(true);
          }}
          onPointerUp={() => {
            last.current = null;
            if (ref.current) onResult(processSignature(ref.current, null, false));
          }} />
        <div className="absolute left-6 right-6 bottom-[22%] border-t border-stone-200 pointer-events-none" />
        {!dirty && (
          <span className="absolute inset-0 flex items-center justify-center text-xs text-stone-300 pointer-events-none">
            เซ็นชื่อตรงนี้ด้วยนิ้วหรือเมาส์
          </span>
        )}
      </div>
      {dirty && (
        <button type="button" onClick={clear} className="text-xs text-stone-500 hover:text-stone-800 inline-flex items-center gap-1">
          <RotateCcw className="w-3 h-3" /> ล้างแล้ววาดใหม่
        </button>
      )}
    </div>
  );
}
