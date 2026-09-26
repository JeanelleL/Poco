// 8x8 LED pictures, matching Poco's belly (an 8x8 NeoPixel matrix). '#' = lit,
// '.' = off. Kept as data because the same frames are sent to the real LEDs.

export const GRID = 8;

/**
 * Older 7x7 pictures fit into the top-left of the 8x8 with the right column and
 * bottom row left dark: the same convention led_matrix/emotions.py uses for its
 * 7x7 designs, so nothing drawn is lost.
 */
function pad7(rows: readonly string[]): string[] {
  return [...rows.map((r) => r + '.'), '.'.repeat(GRID)];
}

export const PATTERNS = {
  // Feelings: copied dot for dot from led_matrix/emotions.py (their X = our #).
  // No head outline, and a dark pixel between features so they stay separate behind fabric.
  happy:     ['.##..##.','.##..##.','........','#......#','########','.######.','..####..','........'],
  sad:       ['........','.##..##.','.##..##.','........','..####..','.#....#.','#......#','........'],
  angry:     ['........','##....##','.##..##.','.##..##.','........','..####..','.#....#.','........'],
  surprised: ['........','.##..##.','.##..##.','........','...##...','..#..#..','..#..#..','...##...'],
  neutral:   ['........','.##..##.','.##..##.','........','#......#','.######.','........','........'],
  excited:   ['.#...#..','#.#.#.#.','........','#######.','#.....#.','.#...#..','..###...','........'],
  tired:     ['........','........','###.###.','.#...#..','........','..###...','........','........'],
  worried:   ['.#...#..','#.....#.','........','.#...#..','........','.#####..','#.....#.','........'],
  silly:     ['........','.#......','.#...###','........','........','########','....##..','....##..'],
  // Not in emotions.py: the app's own faces, drawn in its style (8x8, centered,
  // a dark gap between features). Calm is what the calming lessons end on;
  // Shy and Frustrated have robot movements.
  calm:      ['........','........','.##..##.','........','........','.#....#.','..####..','........'],
  shy:       ['........','........','.##..##.','........','#......#','..####..','........','........'],
  frustrated:['#......#','.##..##.','........','.##..##.','........','.#.##.#.','#.#..#.#','........'],
  // Every dot lit: a feeling shown as its color (like emotions.py show_color).
  solid:     Array.from({ length: GRID }, () => '#'.repeat(GRID)),

  // Onboarding step pictures and mode icons, centered on the 8x8.
  hi:        ['........','#..#.###','#..#..#.','####..#.','#..#..#.','#..#..#.','#..#.###','........'],
  heart:     ['........','.##..##.','########','########','########','.######.','..####..','...##...'],
  // led_matrix/modes.py "quiet": the do-not-disturb moon.
  moon:      ['..##....','.##.....','###.....','###.....','###.....','####...#','.######.','..####..'],
  bolt:      ['....##..','...##...','..##....','.######.','....##..','...##...','..##....','........'],
  star:      ['...##...','...##...','########','.######.','..####..','.##..##.','##....##','........'],
  sparkle:   ['...##...','.#.##.#.','..####..','########','########','..####..','.#.##.#.','...##...'],
  apple:     ['....##..','...#....','.##..##.','########','########','########','.######.','..####..'],
  // led_matrix/modes.py "music": two beamed notes.
  note:      ['..######','..#....#','..#....#','..#....#','.##...##','###..###','##...##.','........'],
  // Multi-color: letters are fixed colors (DOT_COLORS) instead of the picture's one color.
  rainbow:   ['........','..rrrr..','.ryyyyr.','ryggggyr','rygbbgyr','ryg..gyr','ryg..gyr','........'],

  // Calm-down tools, matching led_matrix/modes.py where it has them.
  // "breathe": the still orb (its _orb at 75% full, lit where the orb covers half a dot or more).
  orb:       ['........','..####..','.######.','.######.','.######.','.######.','..####..','........'],
  // "count": the 5 from COUNT_DIGITS.
  five:      ['.######.','.##.....','.##.....','.#####..','.....##.','.....##.','.##..##.','..####..'],
  // Ask for help: a bold question mark.
  question:  ['..####..','.##..##.','.....##.','....##..','...##...','...##...','........','...##...'],
  // A raised open hand, cartoon style: three fingers (middle tallest) and a thumb
  // standing apart on the left. Four fingers plus a gap for the thumb don't fit in 8.
  hand:      ['....#...','..#.#.#.','..#.#.#.','#.#.#.#.','#.#####.','.######.','.######.','..####..'],} satisfies Record<string, readonly string[]>;

export type PatternKey = keyof typeof PATTERNS;

/** Dots drawn with these letters keep their own color (e.g. the rainbow); '#' uses the picture's color. */
export const DOT_COLORS: Record<string, string> = { r: '#FF3B30', y: '#FFC800', g: '#34C759', b: '#2F80FF' };

/** A named pattern, or 8 rows drawn by hand (e.g. a custom tile's belly lights). */
export type Pattern = PatternKey | readonly string[];

/** Always 8 rows of 8. Custom tiles saved before the switch to 8x8 are 7x7 and get padded. */
export function patternRows(p: Pattern): string[] {
  const rows = typeof p === 'string' ? PATTERNS[p] : p;
  return rows.length === GRID - 1 ? pad7(rows) : [...rows];
}

export const BLANK_ROWS: readonly string[] = Array.from({ length: GRID }, () => '.'.repeat(GRID));

/** Flip one dot (row r, column c) on or off. */
export function setDot(rows: readonly string[], r: number, c: number, on: boolean): string[] {
  return rows.map((row, i) => (i === r ? row.slice(0, c) + (on ? '#' : '.') + row.slice(c + 1) : row));
}
