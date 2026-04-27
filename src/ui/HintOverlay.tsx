/**
 * 💡 HintOverlay — 第一次进入游戏时的引导手势
 */
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useWorldStore } from '@stores/worldStore';

export function HintOverlay() {
  const revealedCount = useWorldStore((s) => s.revealedCount);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (revealedCount > 0) setVisible(false);
  }, [revealedCount]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ delay: 1.2, duration: 0.6 }}
          className="fixed inset-0 z-20 pointer-events-none flex items-center justify-center"
        >
          <motion.div
            animate={{ scale: [1, 1.2, 1], opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
            className="font-hand text-parchment-100 text-lg drop-shadow-lg bg-black/30 px-4 py-2 rounded-full backdrop-blur-sm"
          >
            ✦ 轻触朝雾，撕开你的世界
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
