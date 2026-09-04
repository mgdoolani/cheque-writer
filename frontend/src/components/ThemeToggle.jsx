import { useTheme } from '../theme/ThemeProvider.jsx';
import Icon from './Icon.jsx';

const LABELS = {
  light:  { icon: 'light_mode',    text: 'Light mode' },
  dark:   { icon: 'dark_mode',     text: 'Dark mode' },
  system: { icon: 'brightness_auto', text: 'Match system' },
};

export default function ThemeToggle() {
  const { preference, cycleTheme } = useTheme();
  const { icon, text } = LABELS[preference];

  return (
    <button
      type="button"
      className="btn btn--ghost btn--icon"
      onClick={cycleTheme}
      title={`${text} — click to change`}
      aria-label={`Theme: ${text}. Click to change.`}
    >
      <Icon name={icon} size={20} />
    </button>
  );
}
