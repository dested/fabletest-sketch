import { useMemo, useState } from 'react';
import { WorldParams, PARAM_SPECS, PRESETS, DEFAULT_PARAMS } from '../engine/params';

interface Props {
  params: WorldParams;
  onChange: (p: WorldParams) => void;
}

export function Panel({ params, onChange }: Props) {
  const [open, setOpen] = useState(true);
  const groups = useMemo(() => {
    const g = new Map<string, typeof PARAM_SPECS>();
    for (const s of PARAM_SPECS) {
      if (!g.has(s.group)) g.set(s.group, []);
      g.get(s.group)!.push(s);
    }
    return g;
  }, []);

  const set = (k: keyof WorldParams, v: number) => onChange({ ...params, [k]: v });

  return (
    <div className={`panel ${open ? '' : 'panel-closed'}`}>
      <div className="panel-header" onClick={() => setOpen(!open)}>
        <span className="panel-title">⚒ World Builder</span>
        <span className="panel-toggle">{open ? '▾' : '▸'}</span>
      </div>
      {open && (
        <div className="panel-body">
          <div className="presets">
            {PRESETS.map((pr) => (
              <button
                key={pr.name}
                className="preset"
                title={pr.name}
                onClick={() => onChange({ ...DEFAULT_PARAMS, seed: params.seed, ...pr.params })}
              >
                <span className="preset-emoji">{pr.emoji}</span>
                <span className="preset-name">{pr.name}</span>
              </button>
            ))}
          </div>
          <div className="seed-row">
            <label>Seed</label>
            <input
              type="number"
              value={params.seed}
              onChange={(e) => set('seed', Number(e.target.value) | 0)}
            />
            <button
              className="dice"
              title="Random seed"
              onClick={() => set('seed', (Math.random() * 0x7fffffff) | 0)}
            >
              🎲
            </button>
          </div>
          {[...groups.entries()].map(([group, specs]) => (
            <div key={group} className="group">
              <div className="group-title">{group}</div>
              {specs.map((s) => (
                <div key={s.key} className="slider-row" title={s.hint}>
                  <label>{s.label}</label>
                  <input
                    type="range"
                    min={s.min}
                    max={s.max}
                    step={s.step}
                    value={params[s.key] as number}
                    onChange={(e) => set(s.key, Number(e.target.value))}
                  />
                  <span className="value">
                    {s.step >= 1 ? params[s.key] : (params[s.key] as number).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
