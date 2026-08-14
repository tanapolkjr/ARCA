import { useEffect, useState } from 'react';
import { Sheet } from '@/components/sourcing-ui/Sheet';
import { Input } from '@/components/sourcing-ui/Input';
import { Select } from '@/components/sourcing-ui/Select';
import { Button } from '@/components/sourcing-ui/Button';
import { useToast } from '@/hooks/useToast.jsx';
import { useUserId } from '@/hooks/useAuth.jsx';
import { createProduct } from '@/sourcing-api/products';
import { CATEGORIES } from '@/sourcing-lib/constants';
import type { Category, Factory } from '@/sourcing-lib/types';

/**
 * Minimal create step: factory, name, category. Everything else lives in the
 * product workspace — fewer clicks to get a product into the pipeline (rule 5).
 */
export function NewProductSheet({
  open, factory, factories, onClose, onCreated,
}: {
  open: boolean;
  factory: Factory | null;           // preset when launched from a factory row
  factories: Factory[];
  onClose: () => void;
  onCreated: (productId: string) => void;
}) {
  const { toast } = useToast();
  const userId = useUserId();
  const [factoryId, setFactoryId] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState<Category | ''>('');
  const [customName, setCustomName] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setFactoryId(factory?.id ?? '');
      setName('');
      setCategory('');
      setCustomName('');
    }
  }, [open, factory]);

  const valid = factoryId && name.trim() && category && (category !== 'Others' || customName.trim());

  const create = async () => {
    if (!valid) return;
    setBusy(true);
    try {
      const product = await createProduct({
        factory_id: factoryId,
        name: name.trim(),
        category: category as Category,
        custom_category_name: category === 'Others' ? customName.trim() : null,
        model_number: null, source_url: null, product_notes: null,
        functions: [], material: null, color: [], certification: [],
        warranty: null, ip_rating: null, lead_time_days: null,
        smart_home_compatibility: [], target_channels: [],
      }, userId);
      toast(`Product “${product.name}” created.`);
      onCreated(product.id);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Create failed.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="New product"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!valid || busy} onClick={() => void create()}>
            {busy ? 'Creating…' : 'Create & open'}
          </Button>
        </>
      }
    >
      {factory ? (
        <div>
          <span className="label">Factory</span>
          <p className="text-[14px] font-medium">{factory.name}</p>
        </div>
      ) : (
        <Select
          label="Factory" required value={factoryId} placeholder="Choose a factory…"
          options={factories.map((f) => ({ value: f.id, label: f.name }))}
          onChange={(e) => setFactoryId(e.target.value)}
        />
      )}
      <Input label="Product name" required autoFocus value={name} onChange={(e) => setName(e.target.value)} />
      <Select
        label="Category" required value={category} placeholder="Choose a category…"
        options={CATEGORIES.map((c) => ({ value: c, label: c }))}
        onChange={(e) => setCategory(e.target.value as Category)}
      />
      {category === 'Others' && (
        <Input label="Custom category name" required value={customName}
          onChange={(e) => setCustomName(e.target.value)} />
      )}
      <p className="text-[12px] text-ink-3">
        Photos, specs, costs, and scoring are added in the product workspace next.
      </p>
    </Sheet>
  );
}
