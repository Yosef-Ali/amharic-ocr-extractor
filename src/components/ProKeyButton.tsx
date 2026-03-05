import { Key } from 'lucide-react';
import { reinitializeClient } from '../services/geminiService';

export default function ProKeyButton() {
  const connect = async () => {
    const w = window as unknown as { aistudio?: { openSelectKey?: () => Promise<void> } };
    if (typeof w.aistudio?.openSelectKey === 'function') {
      await w.aistudio.openSelectKey();
      reinitializeClient();
    } else {
      alert(
        'Pro Key integration is only available inside Google AI Studio.\n\n' +
        'You can still add your API key to the VITE_GEMINI_API_KEY env variable.'
      );
    }
  };

  return (
    <button
      onClick={connect}
      title="Connect your own Google Cloud billing project to remove rate limits"
      className="
        print:hidden relative overflow-hidden flex items-center gap-2
        px-3.5 py-2 rounded-xl text-[13px] font-bold tracking-wide uppercase
        bg-amber-400 text-amber-950
        hover:bg-amber-500 hover:shadow-lg hover:shadow-amber-400/20 transition-all duration-300
        animate-shimmer focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-1
      "
    >
      <Key size={16} className="relative z-10" />
      <span className="relative z-10">Connect Pro Key</span>
    </button>
  );
}
