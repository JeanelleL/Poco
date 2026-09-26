import { useRef } from 'react';
import { ORANGE } from '../../poco/emotions';
import { calmingPhrase, firstFavorite, objectPronoun } from '../childProfile';
import { useApp, usePocoLine } from '../../app/AppProvider';
import { StepHeader } from '../StepHeader';
import { friendOrName } from '../stepMeta';

export function Step3Support() {
  const { state, patchChild, play } = useApp();
  const { child } = state;
  const hasName = child.name.trim() !== '';
  // Poco reacts once per edit, when the field loses focus.
  const before = useRef('');

  usePocoLine(
    hasName
      ? `What does ${friendOrName(child.name)} love? I want to know all about ${objectPronoun(child.pronouns)}!`
      : 'What does your friend love? I want to know all about them!',
  );

  return (
    <>
      <StepHeader
        step={3}
        title={`What works for ${hasName ? child.name.trim() : 'your child'}`}
        helper="Poco uses this in his stories, and to help when things get hard. Skip anything that doesn't apply."
      />
      <div className="field rise d3">
        <label htmlFor="child-favorites" className="field-label">
          Favorite things
        </label>
        <input
          id="child-favorites"
          className="input"
          type="text"
          placeholder="e.g. tractors, penguins, Bluey"
          autoComplete="off"
          autoCapitalize="sentences"
          enterKeyHint="next"
          maxLength={80}
          value={child.favorites}
          onChange={(e) => patchChild({ favorites: e.target.value })}
          onFocus={() => (before.current = child.favorites)}
          onBlur={() => {
            const fav = firstFavorite(child.favorites);
            if (fav && child.favorites !== before.current) play('happy', ORANGE, 'heart', `Ooh, I like ${fav} too!`);
          }}
        />
      </div>
      <div className="field rise d4">
        <label htmlFor="child-calming" className="field-label">
          What helps them calm down
        </label>
        <input
          id="child-calming"
          className="input"
          type="text"
          placeholder="e.g. Deep breaths, a quiet corner, squeezing a ball"
          autoComplete="off"
          autoCapitalize="sentences"
          enterKeyHint="next"
          maxLength={80}
          value={child.calming}
          onChange={(e) => patchChild({ calming: e.target.value })}
          onFocus={() => (before.current = child.calming)}
          onBlur={() => {
            const phrase = calmingPhrase(child.calming);
            if (phrase && child.calming !== before.current) {
              play('calm', '#3FA36B', 'calm', `When I feel upset, I ${phrase}.`);
            }
          }}
        />
      </div>
      <div className="field rise d5">
        <label htmlFor="child-notes" className="field-label">
          Anything else Poco should know? <span className="field-optional">(optional)</span>
        </label>
        <textarea
          id="child-notes"
          className="input"
          rows={2}
          placeholder="e.g. Gets overwhelmed at the end of the day."
          value={child.notes}
          onChange={(e) => patchChild({ notes: e.target.value })}
        />
      </div>
    </>
  );
}
