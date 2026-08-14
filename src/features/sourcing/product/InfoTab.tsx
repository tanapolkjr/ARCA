import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/useToast.jsx';
import { useQuery } from '@/hooks/useSourcingQuery';
import { deleteProduct, listProductSummaries, updateProduct, type ProductInput } from '@/sourcing-api/products';
import { Input, NumberInput, Textarea } from '@/components/sourcing-ui/Input';
import { Select } from '@/components/sourcing-ui/Select';
import { TagInput } from '@/components/sourcing-ui/TagInput';
import { ChipGroup } from '@/components/sourcing-ui/ChipGroup';
import { Button } from '@/components/sourcing-ui/Button';
import { ConfirmDialog } from '@/components/sourcing-ui/ConfirmDialog';
import { CATEGORIES, CHANNELS } from '@/sourcing-lib/constants';
import { listChannels } from '@/sourcing-api/channels';
import type { Category, Channel, ProductSummary } from '@/sourcing-lib/types';
import { ImageManager } from './ImageManager';

/** Cross-product suggestions so tag vocabulary stays consistent (spec §9). */
function useTagSuggestions() {
  const { data } = useQuery(listProductSummaries, []);
  return useMemo(() => {
    const collect = (pick: (p: ProductSummary) => string[]) =>
      [...new Set((data ?? []).flatMap(pick))].sort();
    return {
      functions: collect((p) => p.functions),
      colors: collect((p) => p.color),
      certifications: collect((p) => p.certification),
      compat: collect((p) => p.smart_home_compatibility),
      materials: collect((p) => (p.material ? [p.material] : [])),
    };
  }, [data]);
}

export function InfoTab({ product, onChanged }: { product: ProductSummary; onChanged: () => void }) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [, setParams] = useSearchParams();
  const suggestions = useTagSuggestions();
  // Live channel list from Settings; unknown tags on this product stay selectable.
  const { data: channelOptions } = useQuery(listChannels, []);

  const toForm = (p: ProductSummary): ProductInput => ({
    factory_id: p.factory_id,
    name: p.name,
    model_number: p.model_number,
    source_url: p.source_url,
    product_notes: p.product_notes,
    category: p.category,
    custom_category_name: p.custom_category_name,
    functions: p.functions,
    material: p.material,
    color: p.color,
    certification: p.certification,
    warranty: p.warranty,
    ip_rating: p.ip_rating,
    lead_time_days: p.lead_time_days,
    smart_home_compatibility: p.smart_home_compatibility,
    target_channels: p.target_channels,
  });

  const [form, setForm] = useState<ProductInput>(() => toForm(product));
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => { setForm(toForm(product)); setDirty(false); }, [product.id, product.updated_at]);

  const set = <K extends keyof ProductInput>(k: K, v: ProductInput[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setDirty(true);
  };

  const valid =
    form.name.trim().length > 0 &&
    (form.category !== 'Others' || (form.custom_category_name ?? '').trim().length > 0);

  const save = async (goTo?: 'Cost' | 'Evaluation') => {
    if (!valid) { toast('Name — and a custom category name when “Others” — are required.', 'error'); return; }
    setBusy(true);
    try {
      await updateProduct(product.id, {
        ...form,
        name: form.name.trim(),
        custom_category_name: form.category === 'Others' ? form.custom_category_name?.trim() ?? null : null,
      });
      toast('Product saved.');
      setDirty(false);
      onChanged();
      if (goTo) setParams({ tab: goTo }, { replace: true });
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Save failed.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async () => {
    setConfirmDelete(false);
    try {
      await deleteProduct(product.id);
      toast(`Product “${product.name}” deleted.`);
      navigate('/sourcing/factories');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Delete failed.', 'error');
    }
  };

  const heroMissing = !product.hero_url;

  return (
    <div className="max-w-form flex flex-col gap-6 pb-24">
      {heroMissing && (
        <p className="text-[13px] rounded-card border px-3 py-2"
          style={{ borderColor: 'var(--c-amber)', color: 'var(--c-amber)', background: 'color-mix(in srgb, var(--c-amber) 8%, transparent)' }}>
          Add a hero photo to move this product out of Draft — decisions start with seeing the product.
        </p>
      )}

      <ImageManager productId={product.id} onChanged={onChanged} />

      {/* General */}
      <section className="flex flex-col gap-4">
        <h2 className="text-[15px] font-semibold">General</h2>
        <Input label="Product name" required value={form.name} onChange={(e) => set('name', e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Model number" value={form.model_number ?? ''}
            onChange={(e) => set('model_number', e.target.value || null)} />
          <Input label="Source URL" type="url" placeholder="https://…" value={form.source_url ?? ''}
            onChange={(e) => set('source_url', e.target.value || null)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Category" required value={form.category}
            options={CATEGORIES.map((c) => ({ value: c, label: c }))}
            onChange={(e) => set('category', e.target.value as Category)}
          />
          {form.category === 'Others' && (
            <Input label="Custom category name" required value={form.custom_category_name ?? ''}
              onChange={(e) => set('custom_category_name', e.target.value || null)} />
          )}
        </div>
        <Textarea label="Notes" value={form.product_notes ?? ''}
          placeholder="Anything the team should know when evaluating…"
          onChange={(e) => set('product_notes', e.target.value || null)} />
      </section>

      {/* Functions / Specifications */}
      <section className="flex flex-col gap-4">
        <h2 className="text-[15px] font-semibold">Functions &amp; specifications</h2>
        <TagInput label="Functions" value={form.functions} suggestions={suggestions.functions}
          placeholder="Fingerprint, PIN code, App control…" onChange={(v) => set('functions', v)} />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Input label="Material" list="material-suggestions" value={form.material ?? ''}
              placeholder="Zinc alloy, Aluminium…" onChange={(e) => set('material', e.target.value || null)} />
            <datalist id="material-suggestions">
              {suggestions.materials.map((m) => <option key={m} value={m} />)}
            </datalist>
          </div>
          <Input label="Warranty" value={form.warranty ?? ''} placeholder="1 year, 2 years…"
            onChange={(e) => set('warranty', e.target.value || null)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="IP rating" value={form.ip_rating ?? ''} placeholder="IP65, IP54…"
            onChange={(e) => set('ip_rating', e.target.value || null)} />
          <NumberInput label="Lead time" suffix="days" value={form.lead_time_days ?? ''}
            onValue={(v) => set('lead_time_days', v === '' ? null : Math.round(v))}
            hint="Production / delivery time for this product" />
        </div>
        <TagInput label="Colors" value={form.color} suggestions={suggestions.colors}
          placeholder="Black, Silver…" onChange={(v) => set('color', v)} />
        <TagInput label="Certifications" value={form.certification} suggestions={suggestions.certifications}
          placeholder="CE, FCC, TIS…" onChange={(v) => set('certification', v)} />
        <TagInput label="Smart home compatibility" value={form.smart_home_compatibility} suggestions={suggestions.compat}
          placeholder="Tuya, Google Home, Alexa…" onChange={(v) => set('smart_home_compatibility', v)} />
      </section>

      {/* Target market */}
      <section className="flex flex-col gap-4">
        <h2 className="text-[15px] font-semibold">Target market</h2>
        <ChipGroup
          label="Target channels"
          options={[...new Set([...(channelOptions?.map((c) => c.name) ?? CHANNELS), ...form.target_channels])]}
          value={form.target_channels}
          onChange={(v) => set('target_channels', v as Channel[])}
        />
      </section>

      {/* Sticky action bar */}
      <div className="fixed bottom-0 left-0 right-0 z-30 no-print">
        <div className="max-w-page mx-auto px-6">
          <div className="max-w-form card rounded-b-none border-b-0 px-4 py-3 flex items-center gap-2
            shadow-overlay bg-surface">
            <Button variant="primary" disabled={busy || !dirty} onClick={() => void save()}>
              {busy ? 'Saving…' : 'Save'}
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => void save('Cost')}>
              Save &amp; go to Cost
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => void save('Evaluation')}>
              Save &amp; go to Evaluation
            </Button>
            <div className="flex-1" />
            {product.status === 'Draft' ? (
              <Button variant="danger" onClick={() => setConfirmDelete(true)}>
                <Trash2 size={14} /> Delete
              </Button>
            ) : (
              <span className="text-[12px] text-ink-3">
                Deletion is only available while a product is in Draft.
              </span>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title={`Delete “${product.name}”?`}
        body="This removes the product and its images. Once costing or scoring has started, products can no longer be deleted."
        confirmLabel="Delete product"
        danger
        onConfirm={() => void onDelete()}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
