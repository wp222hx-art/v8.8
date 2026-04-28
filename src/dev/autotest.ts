/**
 * 🧪 Dev-mode auto-test.
 * When URL contains ?autotest=1, trigger a few reveals and log state.
 */
import { useWorldStore } from '@stores/worldStore';

export function installAutotest() {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  if (params.get('autotest') !== '1') return;
  console.log('[autotest] enabled');

  window.setTimeout(() => {
    const st = useWorldStore.getState();
    console.log('[autotest] world initialized:', {
      cells: st.cells.size,
      energy: st.energy,
      gold: st.gold,
    });

    const ids = Array.from(st.cells.keys()).slice(0, 5);
    for (const id of ids) {
      const r = useWorldStore.getState().revealCell(id);
      console.log(`[autotest] revealed ${id}:`, r);
    }

    window.setTimeout(() => {
      const s2 = useWorldStore.getState();
      console.log('[autotest] after 5 reveals:', {
        revealedCount: s2.revealedCount,
        gold: s2.gold,
        energy: s2.energy,
        lastRarity: s2.lastRarity,
        lastTerrain: s2.lastTerrain,
      });

      // DOM probe
      const canvas = document.querySelector('canvas.pixi-stage') as HTMLCanvasElement | null;
      console.log('[autotest] canvas:', canvas ? `${canvas.width}x${canvas.height}` : 'MISSING');
      const plates = document.querySelectorAll('.parchment-bg');
      console.log('[autotest] parchment HUD nodes:', plates.length);
      const anyError = (window as any).__lastError;
      if (anyError) console.error('[autotest] error state:', anyError);

      console.log('[autotest] DONE');
    }, 1800);
  }, 1800);
}
