import { Sun, Moon } from 'lucide-react';
import { type Theme } from '../hooks/useTheme';

interface Props {
  theme:    Theme;
  onClick:  () => void;
  iconSize?: number;
}

export default function ThemeToggleButton({ theme, onClick, iconSize = 16 }: Props) {
  return (
    <button
      className="theme-toggle-btn"
      onClick={onClick}
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
    >
      {theme === 'dark' ? <Sun size={iconSize} /> : <Moon size={iconSize} />}
    </button>
  );
}
