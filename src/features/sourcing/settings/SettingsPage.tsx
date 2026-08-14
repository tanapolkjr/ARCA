import { useState } from 'react';
import { useQuery } from '@/hooks/useSourcingQuery';
import { useToast } from '@/hooks/useToast.jsx';
import { addChannel, listChannels, removeChannel } from '@/sourcing-api/channels';
import { Button } from '@/components/sourcing-ui/Button';
import { errMsg } from '@/sourcing-lib/format';
import { X } from 'lucide-react';

/**
 * Sourcing settings.
 *
 * The standalone app also managed users here; in ARCA that lives on the
 * platform Settings page (Super Admin only), so this screen keeps only the
 * settings the Sourcing module actually owns.
 */
export function SettingsPage() {
  const { toast } = useToast();
  const { data: channels, refetch } = useQuery(listChannels, []);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (!draft.trim()) return;
    setBusy(true);
    try {
      await addChannel(draft);
      toast(`Channel “${draft.trim()}” added.`);
      setDraft('');
      void refetch();
    } catch (e) {
      toast(errMsg(e, 'Add failed.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string, name: string) => {
    try {
      await removeChannel(id);
      toast(`Channel “${name}” removed.`);
      void refetch();
    } catch (e) {
      toast(errMsg(e, 'Remove failed.'), 'error');
    }
  };

  return (
    <div className="flex flex-col gap-4 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Sourcing settings</h1>
        <p className="text-[13px] text-ink-2 mt-1">
          Users and roles are managed on the platform Settings page.
        </p>
      </div>

      <section className="card">
      <header className="px-4 h-11 flex items-center border-b border-line">
        <h2 className="text-[15px] font-semibold">Target channels</h2>
      </header>
      <div className="p-4 flex flex-col gap-3">
        <div className="flex flex-wrap gap-1.5">
          {(channels ?? []).map((c) => (
            <span key={c.id}
              className="inline-flex items-center gap-1 h-8 pl-3 pr-1.5 rounded-full border border-line text-[13px]">
              {c.name}
              <button aria-label={`Remove ${c.name}`} onClick={() => void remove(c.id, c.name)}
                className="p-1 rounded-full text-ink-3 hover:text-[color:var(--c-red)] hover:bg-subtle">
                <X size={12} />
              </button>
            </span>
          ))}
          {(channels ?? []).length === 0 && (
            <span className="text-[13px] text-ink-3">No channels yet — add the first one below.</span>
          )}
        </div>
        <div className="flex gap-2 max-w-md">
          <input
            className="input"
            placeholder="New channel name… (e.g. TikTok Shop)"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void add()}
          />
          <Button variant="primary" disabled={busy || !draft.trim()} onClick={() => void add()}>Add</Button>
        </div>
        <p className="text-[12px] text-ink-3">
          These appear as the Target-channel choices on every product. Removing one doesn’t change
          products that already use it.
        </p>
        </div>
      </section>
    </div>
  );
}
