import { useState, type CSSProperties } from 'react';
import { useApp } from '../app/AppProvider';
import { LedMatrix } from '../poco/LedMatrix';
import { ChunkyButton } from '../ui/ChunkyButton';
import { BackRow, PlayIcon, type Go } from './TeachingScreen';
import { useTiles } from './tiles';

/** One tile's page: what it is, and everything Poco can say about it. */
export function TileDetail({ id, go }: { id: string; go: Go }) {
  const { state, poco, play, say, setHidden } = useApp();
  const { byId } = useTiles();
  const tile = byId(id);
  // Opening a tile from the grid already said its first line.
  const [said, setSaid] = useState<number | null>(() =>
    tile && poco.line === tile.lines[0]?.text ? 0 : null,
  );
  // Bumped each time something is sent to Poco, to replay the face's light-up and glow.
  const [pulse, setPulse] = useState(() => (said === null ? 0 : 1));

  if (!tile) {
    return (
      <>
        <BackRow label="All tiles" onBack={() => go({ name: 'feelings' })} />
        <h1 className="headline" tabIndex={-1}>
          This tile was deleted
        </h1>
      </>
    );
  }

  const isHidden = state.hiddenTiles.includes(tile.id);
  const kindLabel = tile.kind === 'calm' ? 'Calm-down tool' : 'Feeling';
  const origin = tile.custom ? (tile.custom.replaces ? ' · edited' : ' · yours') : '';
  const belly = { pattern: tile.pattern, color: tile.color };

  const actOut = () => {
    play(tile.move, tile.color, tile.pattern, tile.lines[0]?.text);
    setSaid(0);
    setPulse((n) => n + 1);
  };

  return (
    <>
      <BackRow label="All tiles" onBack={() => go({ name: 'feelings' })}>
        <button type="button" className="btn btn-secondary small-btn" onClick={() => setHidden(tile.id, !isHidden)}>
          {isHidden ? 'Show in grid' : 'Hide'}
        </button>
        <button type="button" className="btn btn-secondary small-btn" onClick={() => go({ name: 'editTile', id: tile.id })}>
          Edit
        </button>
      </BackRow>

      {isHidden && <p className="notice">This tile is hidden from the grid.</p>}

      <div className="tile-hero" style={{ '--c': tile.color } as CSSProperties}>
        <div key={pulse} className={`tile-hero-led${pulse ? ' flash' : ''}`}>
          <LedMatrix pattern={tile.pattern} color={tile.color} size={13} gap={5} glow scan={pulse > 0} />
        </div>
        <div className="tile-hero-text">
          <p className="eyebrow">
            {kindLabel}
            {origin}
          </p>
          <h1 className="tile-hero-title" tabIndex={-1}>
            {tile.label}
          </h1>
          {tile.about && <p className="tile-hero-about">{tile.about}</p>}
          {tile.clues && (
            <ul className="clues" aria-label="Body clues">
              {tile.clues.map((c) => (
                <li key={c} className="clue">
                  {c}
                </li>
              ))}
            </ul>
          )}
          <ChunkyButton className="act-btn" onClick={actOut}>
            <PlayIcon />
            Act it out
          </ChunkyButton>
        </div>
      </div>

      <h2 className="section-title">Poco can say</h2>
      <ul className="say-list" style={{ '--c': tile.color } as CSSProperties}>
        {tile.lines.map((line, i) => (
          <li key={i}>
            <button
              type="button"
              className={`say-row${said === i ? ' is-said' : ''}`}
              onClick={() => {
                say(line.text, belly);
                setSaid(i);
                setPulse((n) => n + 1);
              }}
            >
              {/* Remounted on each tap so the glow replays without moving focus. */}
              {said === i && pulse > 0 && <span key={pulse} className="say-glow flash" aria-hidden="true" />}
              <span className="say-icon" aria-hidden="true">
                <PlayIcon />
              </span>
              <span className="say-text">{line.text}</span>
              {line.group && <span className="say-group">{line.group}</span>}
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
