import { useRef, useState } from 'react';
import { useGame } from '../state/game';
import { input } from '../world/input';

/** Dokunmatik kontroller: sol joystick (yürü), sağ alan (bak), eylem düğmeleri. */
export function MobileControls() {
  const held = useGame((s) => s.held);
  const hovered = useGame((s) => s.hoveredProductId);
  const nearCheckout = useGame((s) => s.nearCheckout);
  const cartAttached = useGame((s) => s.cartAttached);
  const g = useGame.getState;

  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      <LookPad />
      <Joystick />
      <div
        className="pointer-events-auto absolute right-3 flex flex-col items-end gap-2"
        style={{ bottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {!held && hovered && (
          <>
            <ActionButton label="Al" onPress={() => g().pick()} primary testId="m-pick" />
            <ActionButton label="Arabaya" onPress={() => g().putInCart()} />
          </>
        )}
        {held && held.mode === 'hold' && (
          <>
            <ActionButton label="Arabaya koy" onPress={() => g().putInCart()} primary />
            <ActionButton label="İncele" onPress={() => g().toggleInspect()} />
            <ActionButton label="Rafa bırak" onPress={() => g().returnToShelf()} />
          </>
        )}
        {!held && nearCheckout && <ActionButton label="Kasada öde" onPress={() => void g().openCheckout()} primary />}
        <ActionButton label={cartAttached ? 'Arabayı bırak' : 'Arabayı tut'} onPress={() => g().toggleCartAttach()} small />
      </div>
    </div>
  );
}

function ActionButton({ label, onPress, primary, small, testId }: { label: string; onPress: () => void; primary?: boolean; small?: boolean; testId?: string }) {
  return (
    <button
      className={`${primary ? 'btn-primary' : 'btn-ghost'} ${small ? 'px-3 py-2 text-xs' : 'min-w-28 px-5 py-3.5 text-base'} shadow-lg backdrop-blur`}
      onPointerDown={(e) => {
        e.preventDefault();
        onPress();
      }}
      data-testid={testId}
    >
      {label}
    </button>
  );
}

function Joystick() {
  const base = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const pointer = useRef<number | null>(null);
  const R = 52;
  const update = (cx: number, cy: number) => {
    const rect = base.current!.getBoundingClientRect();
    let dx = cx - (rect.left + rect.width / 2);
    let dy = cy - (rect.top + rect.height / 2);
    const len = Math.hypot(dx, dy);
    if (len > R) {
      dx = (dx / len) * R;
      dy = (dy / len) * R;
    }
    setKnob({ x: dx, y: dy });
    input.joy.x = dx / R;
    input.joy.y = -dy / R;
  };
  const end = () => {
    pointer.current = null;
    setKnob({ x: 0, y: 0 });
    input.joy.x = 0;
    input.joy.y = 0;
  };
  return (
    <div
      ref={base}
      className="pointer-events-auto absolute left-5 grid h-36 w-36 touch-none place-items-center rounded-full border border-white/25 bg-white/10 backdrop-blur"
      style={{ bottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
      onPointerDown={(e) => {
        e.stopPropagation();
        pointer.current = e.pointerId;
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        update(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => pointer.current === e.pointerId && update(e.clientX, e.clientY)}
      onPointerUp={end}
      onPointerCancel={end}
      aria-label="Hareket joystick'i"
    >
      <div className="h-16 w-16 rounded-full bg-white/60 shadow-lg" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
    </div>
  );
}

/** Ekranın sağ yarısında sürükleyerek bakış. */
function LookPad() {
  const last = useRef<{ id: number; x: number; y: number } | null>(null);
  return (
    <div
      className="pointer-events-auto absolute top-16 right-0 bottom-0 w-[60%] touch-none"
      onPointerDown={(e) => {
        last.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        const l = last.current;
        if (!l || l.id !== e.pointerId) return;
        input.look.dx += e.clientX - l.x;
        input.look.dy += e.clientY - l.y;
        l.x = e.clientX;
        l.y = e.clientY;
      }}
      onPointerUp={() => (last.current = null)}
      onPointerCancel={() => (last.current = null)}
    />
  );
}
