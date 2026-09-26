import { useState, type CSSProperties } from 'react';
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
        shown.map((s, k) => {
          const tiles = visible.filter((t) => t.section === s.id);
          if (!tiles.length && s.id !== 'mine') return null;
          // The wave carries on from the sections above.
          const start = shown.slice(0, k).reduce((n, x) => n + visible.filter((t) => t.section === x.id).length, 0);
          return (
            <section key={s.id} className="tile-section" aria-labelledby={`sec-${s.id}`}>
              {filter === 'all' && (
                <h2 id={`sec-${s.id}`} className="section-title">
                  {s.label}
                </h2>
              )}
              <TileGrid tiles={tiles} onOpen={open} onNew={s.id === 'mine' ? newTile : undefined} start={start} />
            </section>
          );
        })
      )}
    </>
  );
}

/**
 * Ready-made feelings come as a pair, like led_matrix/emotions.py's show_face /
 * show_color: the face on top (opens the tile), and below it the same 8x8 fully
 * lit in the feeling's color (fills Poco's belly with it). Calm-down tools and the
 * adult's own tiles are a single tile.
 *
 * Tiles 'power on' in a quick wave when the grid appears (grid-in, --i = order).
 */
function TileGrid({
  tiles,
  onOpen,
  onNew,
  start = 0,
}: {
  tiles: Tile[];
  onOpen: (t: Tile) => void;
  onNew?: () => void;
  /** Where this grid's tiles fall in the page-wide power-on wave. */
  start?: number;
}) {
  const { showBelly } = useApp();
  return (
    <div className="tile-grid">
      {tiles.map((t, i) => (
        <div key={t.id} className="tile-stack grid-in" style={{ '--i': start + i } as CSSProperties}>
          <button type="button" className="tile teach-tile" onClick={() => onOpen(t)}>
            <LedMatrix pattern={t.pattern} color={t.color} size={7} gap={3} scan />
            <span className="teach-tile-label">{t.label}</span>
            {t.custom?.replaces && <span className="teach-tile-tag">Edited</span>}
          </button>
          {t.kind === 'feeling' && t.section !== 'mine' && (
            <button
              type="button"
              className="tile teach-tile is-color"
              aria-label={`Show the ${t.label.toLowerCase()} color`}
              onClick={() => showBelly('solid', t.color)}
            >
              <LedMatrix pattern="solid" color={t.color} size={7} gap={3} scan />
            </button>
          )}
        </div>
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
