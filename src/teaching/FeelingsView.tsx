import { useState } from 'react';
import { useApp } from '../app/AppProvider';
import { LedMatrix } from '../poco/LedMatrix';
import { PlusIcon, type Go } from './TeachingScreen';
import { SECTIONS, useTiles, type Section, type Tile } from './tiles';

type Filter = 'all' | Section | 'hidden';

export function FeelingsView({ go }: { go: Go }) {
  const { play } = useApp();
  const { visible, hidden } = useTiles();
  const [filter, setFilter] = useState<Filter>('all');

  // Tapping a tile is the main teaching action: Poco acts it out right away,
  // and the tile's page opens with more to say.
  const open = (t: Tile) => {
    play(t.move, t.color, t.pattern, t.lines[0]?.text);
    go({ name: 'tile', id: t.id });
  };

  const newTile = () => go({ name: 'editTile' });
  const shown = filter === 'all' ? SECTIONS : SECTIONS.filter((s) => s.id === filter);
  const filters: { id: Filter; label: string }[] = [
    { id: 'all', label: 'All' },
    ...SECTIONS,
    ...(hidden.length ? [{ id: 'hidden' as const, label: `Hidden (${hidden.length})` }] : []),
  ];

  return (
    <>
      <h1 className="sr-only" tabIndex={-1}>
        Feelings
      </h1>
      <div className="chips" role="group" aria-label="Show">
        {filters.map((f) => (
          <button
            key={f.id}
            type="button"
            className={`chip${filter === f.id ? ' is-on' : ''}`}
            aria-pressed={filter === f.id}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filter === 'hidden' ? (
        <section className="tile-section">
          <p className="section-hint">Hidden tiles don't show in the grid. Open one to show it again.</p>
          <TileGrid tiles={hidden} onOpen={(t) => go({ name: 'tile', id: t.id })} />
        </section>
      ) : (
        shown.map((s) => {
          const tiles = visible.filter((t) => t.section === s.id);
          if (!tiles.length && s.id !== 'mine') return null;
          return (
            <section key={s.id} className="tile-section" aria-labelledby={`sec-${s.id}`}>
              {filter === 'all' && (
                <h2 id={`sec-${s.id}`} className="section-title">
                  {s.label}
                </h2>
              )}
              <TileGrid tiles={tiles} onOpen={open} onNew={s.id === 'mine' ? newTile : undefined} />
            </section>
          );
        })
      )}
    </>
  );
}

function TileGrid({ tiles, onOpen, onNew }: { tiles: Tile[]; onOpen: (t: Tile) => void; onNew?: () => void }) {
  return (
    <div className="tile-grid">
      {tiles.map((t) => (
        <button key={t.id} type="button" className="tile teach-tile" onClick={() => onOpen(t)}>
          <LedMatrix pattern={t.pattern} color={t.color} size={7} gap={3} />
          <span className="teach-tile-label">{t.label}</span>
          {t.custom?.replaces && <span className="teach-tile-tag">Edited</span>}
        </button>
      ))}
      {onNew && (
        <button type="button" className="teach-tile is-new" onClick={onNew}>
          <PlusIcon />
          <span className="teach-tile-label">New tile</span>
        </button>
      )}
    </div>
  );
}
