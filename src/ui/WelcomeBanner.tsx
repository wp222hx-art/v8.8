import { motion } from 'framer-motion';

export function WelcomeBanner() {
  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4, duration: 0.8 }}
      className="fixed top-[76px] left-1/2 -translate-x-1/2 z-20 pointer-events-none"
    >
      <div className="parchment-bg px-5 py-2 rounded-full border border-parchment-600/40 shadow-parchment">
        <div className="relative z-10 flex items-center gap-2">
          <span className="text-base">🕊️</span>
          <div className="font-story text-parchment-700 text-sm">
            Welcome to <span className="font-bold">Rivershire</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
