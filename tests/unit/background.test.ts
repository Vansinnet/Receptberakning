// Rensning när sidan lämnas: direkt när fliken stängs, men först efter 5 minuter i
// bakgrunden (t.ex. appbyte på mobilen). Godkänt 2026-09-28.
import { describe, it, expect, vi } from 'vitest';
import { createBackgroundGuard } from '../../src/lib/background';
import { BACKGROUND_CLEAR_MS } from '../../src/lib/constants';

function setup() {
  let t = 1_000_000;
  const onClear = vi.fn();
  const guard = createBackgroundGuard(onClear, () => t);
  return { guard, onClear, advance: (ms: number) => { t += ms; } };
}

describe('createBackgroundGuard', () => {
  it('gränsen är 5 minuter', () => expect(BACKGROUND_CLEAR_MS).toBe(300_000));

  it('fliken stängs (persisted = false) → rensas direkt', () => {
    const { guard, onClear } = setup();
    guard.onPageHide({ persisted: false });
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('i bakgrunden kortare än 5 minuter → ingenting rensas', () => {
    const { guard, onClear, advance } = setup();
    guard.onPageHide({ persisted: true });
    advance(BACKGROUND_CLEAR_MS - 1);
    guard.onReturn();
    expect(onClear).not.toHaveBeenCalled();
  });

  it('i bakgrunden 5 minuter eller mer → rensas när sidan visas igen', () => {
    const { guard, onClear, advance } = setup();
    guard.onPageHide({ persisted: true });
    advance(BACKGROUND_CLEAR_MS);
    guard.onReturn();
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('vanligt flikbyte på datorn (utan pagehide) påverkas inte', () => {
    const { guard, onClear, advance } = setup();
    advance(60 * 60 * 1000);
    guard.onReturn();
    expect(onClear).not.toHaveBeenCalled();
  });

  it('tiden räknas om vid varje ny bakgrundsperiod', () => {
    const { guard, onClear, advance } = setup();
    guard.onPageHide({ persisted: true });
    advance(4 * 60 * 1000);
    guard.onReturn();
    guard.onPageHide({ persisted: true });
    advance(4 * 60 * 1000);
    guard.onReturn();
    expect(onClear).not.toHaveBeenCalled();
  });

  it('appbyte på pekskärm (sidan göms utan pagehide) räknas som bakgrund', () => {
    const { guard, onClear, advance } = setup();
    guard.onHidden();
    advance(BACKGROUND_CLEAR_MS);
    guard.onReturn();
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
