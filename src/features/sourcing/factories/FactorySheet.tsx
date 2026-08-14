import { useEffect, useRef, useState } from 'react';
import { FileText, Trash2, Upload } from 'lucide-react';
import { Sheet } from '@/components/sourcing-ui/Sheet';
import { Input, NumberInput, Textarea } from '@/components/sourcing-ui/Input';
import { Button } from '@/components/sourcing-ui/Button';
import { useToast } from '@/hooks/useToast.jsx';
import { useUserId } from '@/hooks/useAuth.jsx';
import { useQuery } from '@/hooks/useSourcingQuery';
import {
  createFactory, updateFactory, listFactoryFiles, uploadFactoryFile, removeFactoryFile,
  type FactoryInput,
} from '@/sourcing-api/factories';
import { imageUrl } from '@/sourcing-lib/supabase';
import { errMsg, fmtDate } from '@/sourcing-lib/format';
import { PLATFORMS } from '@/sourcing-lib/constants';
import type { Factory } from '@/sourcing-lib/types';

const blank: FactoryInput = {
  name: '', platform: null, contact_person: null, contact_phone: null,
  contact_email: null, wechat_or_whatsapp: null, country: 'China', city: null,
  moq: null, lead_time: null, notes: null,
};

/** Add/Edit factory in a right-side sheet — the list stays visible behind (spec §8). */
export function FactorySheet({
  open, factory, existingNames, onClose, onSaved,
}: {
  open: boolean;
  factory: Factory | null;           // null = create
  existingNames: string[];
  onClose: () => void;
  onSaved: (f: Factory) => void;
}) {
  const { toast } = useToast();
  const userId = useUserId();
  const [form, setForm] = useState<FactoryInput>(blank);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const filesQ = useQuery(
    () => (factory ? listFactoryFiles(factory.id) : Promise.resolve([])),
    [factory?.id, open],
  );

  useEffect(() => {
    if (open) {
      setForm(factory ? { ...factory } : blank);
      setNameError(null);
    }
  }, [open, factory]);

  const set = <K extends keyof FactoryInput>(k: K, v: FactoryInput[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    const name = form.name.trim();
    if (!name) { setNameError('Factory name is required.'); return; }
    const duplicate = existingNames.some(
      (n) => n.toLowerCase() === name.toLowerCase() && n !== factory?.name,
    );
    if (duplicate) { setNameError('A factory with this name already exists.'); return; }
    setBusy(true);
    try {
      const saved = factory
        ? await updateFactory(factory.id, { ...form, name })
        : await createFactory({ ...form, name }, userId);
      toast(factory ? 'Factory updated.' : `Factory “${name}” added.`);
      onSaved(saved);
    } catch (e) {
      toast(errMsg(e, 'Save failed.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const uploadFiles = async (files: FileList) => {
    if (!factory) return;
    setUploading(true);
    try {
      for (const file of [...files]) await uploadFactoryFile(factory.id, file, userId);
      toast(files.length === 1 ? 'File attached.' : `${files.length} files attached.`);
      void filesQ.refetch();
    } catch (e) {
      toast(errMsg(e, 'Upload failed.'), 'error');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={factory ? 'Edit factory' : 'New factory'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => void save()} disabled={busy}>
            {busy ? 'Saving…' : factory ? 'Save changes' : 'Add factory'}
          </Button>
        </>
      }
    >
      <Input label="Name" required autoFocus value={form.name} error={nameError}
        onChange={(e) => { set('name', e.target.value); setNameError(null); }} />
      <div>
        <Input label="Platform" list="platform-suggestions" value={form.platform ?? ''}
          placeholder="1688, Alibaba, trade show, referral…"
          onChange={(e) => set('platform', e.target.value || null)} />
        <datalist id="platform-suggestions">
          {PLATFORMS.map((p) => <option key={p} value={p} />)}
        </datalist>
      </div>
      <Input label="Contact person" value={form.contact_person ?? ''}
        onChange={(e) => set('contact_person', e.target.value || null)} />
      <div className="grid grid-cols-2 gap-3">
        <Input label="Phone" value={form.contact_phone ?? ''}
          onChange={(e) => set('contact_phone', e.target.value || null)} />
        <Input label="WeChat / WhatsApp" value={form.wechat_or_whatsapp ?? ''}
          onChange={(e) => set('wechat_or_whatsapp', e.target.value || null)} />
      </div>
      <Input label="Email" type="email" value={form.contact_email ?? ''}
        onChange={(e) => set('contact_email', e.target.value || null)} />
      <div className="grid grid-cols-2 gap-3">
        <Input label="Country" value={form.country ?? ''}
          onChange={(e) => set('country', e.target.value || null)} />
        <Input label="City" value={form.city ?? ''} placeholder="Zhongshan, Shenzhen…"
          onChange={(e) => set('city', e.target.value || null)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <NumberInput label="MOQ" value={form.moq ?? ''} suffix="pcs"
          onValue={(v) => set('moq', v === '' ? null : Math.round(v))}
          hint="Minimum order quantity" />
        <Input label="Lead time" value={form.lead_time ?? ''} placeholder="15–20 days"
          onChange={(e) => set('lead_time', e.target.value || null)} />
      </div>
      <Textarea label="Notes" value={form.notes ?? ''} placeholder="Payment terms, sample policy, impressions…"
        onChange={(e) => set('notes', e.target.value || null)} />

      {/* ——— Files (catalogs, price lists) ——— */}
      <div>
        <span className="label">Files</span>
        {factory ? (
          <div className="flex flex-col gap-1.5">
            {(filesQ.data ?? []).map((f) => (
              <div key={f.id} className="flex items-center gap-2 rounded border border-line px-2.5 h-9">
                <FileText size={14} className="text-ink-3 shrink-0" />
                <a
                  href={imageUrl(f.file_url) ?? '#'} target="_blank" rel="noreferrer"
                  className="text-[13px] truncate flex-1 hover:underline"
                >
                  {f.file_name}
                </a>
                <span className="text-[11px] text-ink-3 shrink-0">{fmtDate(f.uploaded_at)}</span>
                <button
                  aria-label={`Remove ${f.file_name}`}
                  onClick={() => void removeFactoryFile(f).then(() => { toast('File removed.'); void filesQ.refetch(); })}
                  className="p-1 rounded text-ink-3 hover:text-[color:var(--c-red)] hover:bg-subtle shrink-0"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
            <input ref={fileRef} type="file" multiple hidden
              onChange={(e) => e.target.files?.length && void uploadFiles(e.target.files)} />
            <Button variant="secondary" size="sm" disabled={uploading}
              onClick={() => fileRef.current?.click()}>
              <Upload size={13} /> {uploading ? 'Uploading…' : 'Attach files'}
            </Button>
            <p className="text-[11px] text-ink-3">Catalogs, price lists, certificates — any type, multiple at once.</p>
          </div>
        ) : (
          <p className="text-[12px] text-ink-3">Save the factory first, then attach catalogs and documents here.</p>
        )}
      </div>
    </Sheet>
  );
}
