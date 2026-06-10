import { useEffect, useRef, useState } from 'react';
import { DEFAULT_PARAMS, WorldParams } from './engine/params';
import { Game, HudState } from './game/game';
import { Panel } from './ui/Panel';
import { Minimap } from './ui/Minimap';
import './App.css';

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [params, setParams] = useState<WorldParams>(DEFAULT_PARAMS);
  const [hud, setHud] = useState<HudState>({ x: 0, y: 0, height: 0, biome: 'grass', fps: 0 });
  const [worldVersion, setWorldVersion] = useState(0);
  const regenTimer = useRef<number>(0);

  useEffect(() => {
    const cv = canvasRef.current!;
    const fit = () => {
      cv.width = window.innerWidth;
      cv.height = window.innerHeight;
    };
    fit();
    window.addEventListener('resize', fit);
    const game = new Game(DEFAULT_PARAMS, cv);
    game.onHud = setHud;
    game.start();
    gameRef.current = game;
    setWorldVersion((v) => v + 1);
    return () => {
      game.stop();
      window.removeEventListener('resize', fit);
      gameRef.current = null;
    };
  }, []);

  const applyParams = (p: WorldParams) => {
    setParams(p);
    // debounce world rebuilds while dragging sliders
    window.clearTimeout(regenTimer.current);
    regenTimer.current = window.setTimeout(() => {
      gameRef.current?.setParams(p);
      setWorldVersion((v) => v + 1);
    }, 220);
  };

  const game = gameRef.current;

  return (
    <div className="app">
      <canvas ref={canvasRef} className="world-canvas" />
      <Panel params={params} onChange={applyParams} />
      <div className="hud">
        <div className="hud-row">
          <span className="hud-coords">⌖ {hud.x}, {hud.y}</span>
          <span className="hud-h">▲ {hud.height}</span>
        </div>
        <div className="hud-row">
          <span className="hud-biome">{hud.biome === 'desert' ? '🏜 desert' : '🌿 meadow'}</span>
          <span className="hud-fps">{hud.fps} fps</span>
        </div>
        {game && (
          <Minimap
            world={game.world}
            px={hud.x}
            py={hud.y}
            version={worldVersion}
            onTeleport={(x, y) => game.teleport(x, y)}
          />
        )}
      </div>
      <div className="help">WASD / arrows — walk · wheel — zoom · minimap — travel</div>
    </div>
  );
}
