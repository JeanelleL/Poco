import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useApp } from '../app/AppProvider';
import { LedMatrix } from '../poco/LedMatrix';
import { COUNT_STEP_MS } from '../poco/pocoClient';
import { ChunkyButton } from '../ui/ChunkyButton';
import { BackRow, PlayIcon, type Go } from './TeachingScreen';
import { useTiles, type TileLine } from './tiles';

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

  // Act it out runs the whole tile, not just its first line. The lines are a
  // sequence - name it, notice it, why, what helps, ask - and stopping after
  // the first one leaves the teaching half done.
  const [running, setRunning] = useState(false);
  const timer = useRef<number>();
  const clear = () => window.clearTimeout(timer.current);
  useEffect(() => clear, []);

  // Stop Poco (anywhere) ends the run.
  const seenStop = useRef(poco.stopId);
  useEffect(() => {
    if (poco.stopId === seenStop.current) return;
    seenStop.current = poco.stopId;
    clear();
    setRunning(false);
  }, [poco.stopId]);

  /**
   * How long to leave a line before the next one.
   *
   * Has to cover the half second before Poco's voice starts as well as the
   * speech itself, and then a beat on top - a child being taught a feeling
   * needs a moment to take each line in, and lines running together is worse
   * than a pause. Measured against the real voice: this leaves about 0.7s of
   * quiet after each line.
   *
   * A count is timed exactly instead: the robot says one number every
   * COUNT_STEP_MS, starting straight away because the numbers are recorded in
   * advance.
   */
  const lineMs = (line: TileLine) =>
    line.count ? line.count * COUNT_STEP_MS : 1500 + line.text.length * 65;

  /** Say lines from `i` onward, one after another. */
  const runFrom = (i: number) => {
    const lines = tile.lines;
    if (i >= lines.length) {
      setRunning(false);
      return;
    }
    // The movement happens once, at the start; the rest are lines.
    say(lines[i].text, belly, lines[i].count);
    setSaid(i);
    setPulse((n) => n + 1);
    timer.current = window.setTimeout(() => runFrom(i + 1), lineMs(lines[i]));
  };

  const actOut = () => {
    clear();
    if (running) {
      setRunning(false);
      return;
    }
    const lines = tile.lines;
    if (lines.length === 0) {
      play(tile.move, tile.color, tile.pattern);
      return;
    }
    setRunning(true);
    play(tile.move, tile.color, tile.pattern, lines[0].text);
    setSaid(0);
    setPulse((n) => n + 1);
    timer.current = window.setTimeout(() => runFrom(1), lineMs(lines[0]));
  };

  // Tapping a tile in the grid acts it out and says its first line, then opens
  // this page. Carry on through the rest rather than stopping after one - the
  // lines are a sequence, and the tap is a request for the whole thing.
  const started = useRef(false);
  useEffect(() => {
    if (started.current || said !== 0 || tile.lines.length < 2) return;
    started.current = true;
    setRunning(true);
    timer.current = window.setTimeout(() => runFrom(1), lineMs(tile.lines[0]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          <ChunkyButton className="act-btn" variant={running ? 'secondary' : 'primary'} onClick={actOut}>
            <PlayIcon />
            {running ? 'Stop' : 'Act it out'}
          </ChunkyButton>
        </div>
      </div>

      <h2 className="section-title">Poco can say</h2>
      {tile.lines.length === 0 && (
        <p className="section-hint">No lines yet. Tap Edit to add some, or Poco just shows the feeling.</p>
      )}
      <ul className="say-list" style={{ '--c': tile.color } as CSSProperties}>
        {tile.lines.map((line, i) => (
          <li key={i}>
            <button
              type="button"
              className={`say-row${said === i ? ' is-said' : ''}`}
              onClick={() => {
                say(line.text, belly, line.count);
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
