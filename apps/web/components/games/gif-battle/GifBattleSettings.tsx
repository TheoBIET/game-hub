'use client';

import { useState } from 'react';
import type { LobbySnapshot } from '@tabswitch/types';
import {
  GIF_BATTLE_EVENTS,
  PICK_SECONDS_OPTIONS,
  ROUNDS_OPTIONS,
  VOTE_SECONDS_OPTIONS,
  type GifBattleClientView,
} from '@tabswitch/gif-battle';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { gameAction, getSocket } from '@/lib/socket';
import { SentenceProposeModal } from './SentenceProposeModal';

export function GifBattleSettings({ snapshot }: { snapshot: LobbySnapshot }) {
  const view = snapshot.gameState as GifBattleClientView | null;
  const [proposing, setProposing] = useState(false);
  if (!view) return null;
  const editable = snapshot.you.isHost && snapshot.room.status === 'LOBBY';
  const s = view.settings;

  async function update(patch: Record<string, unknown>) {
    const ack = await gameAction(getSocket(), GIF_BATTLE_EVENTS.SettingsUpdate, patch);
    if (!ack.ok) alert(ack.message);
  }

  return (
    <Card>
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-bold">Réglages</h2>
        <Button variant="ghost" size="sm" onClick={() => setProposing(true)}>
          ➕ proposer une phrase
        </Button>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <OptionRow
          label="Manches"
          value={s.rounds}
          options={ROUNDS_OPTIONS}
          editable={editable}
          onChange={(v) => update({ rounds: v })}
        />
        <OptionRow
          label="Temps de pick (s)"
          value={s.pickSeconds}
          options={PICK_SECONDS_OPTIONS}
          editable={editable}
          onChange={(v) => update({ pickSeconds: v })}
        />
        <OptionRow
          label="Temps de vote (s)"
          value={s.voteSeconds}
          options={VOTE_SECONDS_OPTIONS}
          editable={editable}
          onChange={(v) => update({ voteSeconds: v })}
        />
        <div>
          <span className="text-xs uppercase tracking-wider text-[color:var(--color-fg-muted)]">Langue</span>
          <div className="mt-1 flex gap-2">
            {(['fr', 'en'] as const).map((loc) => (
              <button
                key={loc}
                type="button"
                disabled={!editable}
                onClick={() => update({ locale: loc })}
                className={`rounded-lg border px-3 py-1.5 text-sm ${
                  s.locale === loc ? 'border-white/40 bg-white/10' : 'border-white/10'
                } disabled:opacity-60`}
              >
                {loc === 'fr' ? '🇫🇷 FR' : '🇬🇧 EN'}
              </button>
            ))}
          </div>
        </div>
      </div>
      {proposing && <SentenceProposeModal onClose={() => setProposing(false)} />}
    </Card>
  );
}

function OptionRow({
  label,
  value,
  options,
  editable,
  onChange,
}: {
  label: string;
  value: number;
  options: readonly number[];
  editable: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <span className="text-xs uppercase tracking-wider text-[color:var(--color-fg-muted)]">{label}</span>
      <div className="mt-1 flex flex-wrap gap-2">
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            disabled={!editable}
            onClick={() => onChange(opt)}
            className={`rounded-lg border px-3 py-1.5 text-sm tabular-nums ${
              value === opt ? 'border-white/40 bg-white/10' : 'border-white/10'
            } disabled:opacity-60`}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}
