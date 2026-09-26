import { ORANGE } from '../../poco/emotions';
import type { PocoSettings } from '../../poco/pocoClient';
import { PillGroup } from '../../ui/PillGroup';
import { Slider } from '../../ui/Slider';
import { Toggle } from '../../ui/Toggle';
import { tagQuestion } from '../childProfile';
import { useApp, usePocoLine } from '../../app/AppProvider';
import { StepHeader } from '../StepHeader';
import { childOrDefault } from '../stepMeta';

const SPEEDS: readonly PocoSettings['speed'][] = ['Gentle', 'Normal', 'Lively'];

export function Step4Comfort() {
  const { state, patchComfort, play } = useApp();
  const { comfort } = state;
  const child = childOrDefault(state.child.name);
  const friend = state.child.name.trim() || 'your friend';
  usePocoLine(`How loud and bright should I be for ${friend}?`);

  const exampleName = state.child.name.trim() || 'Your friend';

  return (
    <>
      <StepHeader
        step={4}
        title="Comfort settings"
        helper={`Sound, bright light and quick movement can be a lot for some kids. Start low and turn things up if ${child} enjoys it.`}
      />
      <div className="comfort-cards rise d3">
        <div className="card">
          <div className="card-head">
            <label htmlFor="comfort-volume" className="field-label">
              Volume
            </label>
            <span className="readout" aria-hidden="true">
              {comfort.volume}%
            </span>
          </div>
          <Slider
            id="comfort-volume"
            value={comfort.volume}
            valueText={`${comfort.volume}%`}
            onChange={(volume) => patchComfort({ volume })}
          />
        </div>
        <div className="card">
          <div className="card-head">
            <label htmlFor="comfort-brightness" className="field-label">
              Belly brightness
            </label>
            <span className="readout" aria-hidden="true">
              {comfort.brightness}%
            </span>
          </div>
          <Slider
            id="comfort-brightness"
            value={comfort.brightness}
            valueText={`${comfort.brightness}%`}
            onChange={(brightness) => patchComfort({ brightness })}
          />
        </div>
      </div>
      <PillGroup
        className="rise d4"
        id="comfort-speed"
        label="Movement speed"
        options={SPEEDS}
        value={comfort.speed}
        onChange={(speed) => {
          patchComfort({ speed });
          // Show the new speed right away; --spd updates in the same render.
          play('happy', ORANGE, 'moon');
        }}
      />
      <div className="toggles rise d5">
        <Toggle
          id="comfort-sfx"
          label="Sound effects"
          description="Soft chimes that go with each gesture"
          checked={comfort.soundEffects}
          onChange={(soundEffects) => patchComfort({ soundEffects })}
        />
        <Toggle
          id="comfort-speak"
          label="Poco talks out loud"
          description={`Says things like “${exampleName} looks happy, ${tagQuestion(state.child.pronouns)}?”`}
          checked={comfort.speakAloud}
          onChange={(speakAloud) => patchComfort({ speakAloud })}
        />
      </div>
    </>
  );
}
