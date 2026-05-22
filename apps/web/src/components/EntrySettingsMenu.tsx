import { useEffect, useRef, useState } from 'react';
import { LOCALES, LOCALE_LABEL, useI18n } from '../i18n';
import type { AppConfig, AppTheme } from '../types';
import type { SettingsSection } from './SettingsDialog';
import { Icon, type IconName } from './Icon';
import { isMacPlatform } from '../utils/platform';

const DISCORD_URL = 'https://discord.gg/mHAjSMV6gz';
const X_URL = 'https://x.com/nexudotio';
const ext = { target: '_blank', rel: 'noreferrer noopener' } as const;

const THEME_OPTIONS: Array<{
  value: AppTheme;
  labelKey: 'settings.themeSystem' | 'settings.themeLight' | 'settings.themeDark';
  icon: IconName;
}> = [
  { value: 'system', labelKey: 'settings.themeSystem', icon: 'sun-moon' },
  { value: 'light', labelKey: 'settings.themeLight', icon: 'sun' },
  { value: 'dark', labelKey: 'settings.themeDark', icon: 'moon' },
];

interface Props {
  config: AppConfig;
  onThemeChange: (theme: AppTheme) => void;
  onOpenSettings: (section?: SettingsSection) => void;
}

export function EntrySettingsMenu({
  config,
  onThemeChange,
  onOpenSettings,
}: Props) {
  const { locale, setLocale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const currentTheme = config.theme ?? 'system';

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      if (wrapRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="avatar-menu entry-settings-menu" ref={wrapRef}>
      <button
        type="button"
        className="settings-icon-btn"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={t('entry.openSettingsTitle')}
        aria-label={t('entry.openSettingsAria')}
        data-testid="entry-settings-menu-trigger"
      >
        <Icon name="settings" size={17} />
      </button>
      {open ? (
        <div
          className="avatar-popover entry-settings-popover"
          role="menu"
          aria-label={t('entry.openSettingsTitle')}
          data-testid="entry-settings-menu"
        >
          <div className="avatar-popover-head">
            <span className="who">{t('entry.openSettingsTitle')}</span>
          </div>

          <div className="avatar-section-label">{t('settings.appearance')}</div>
          <div
            className="entry-settings-theme-row"
            role="group"
            aria-label={t('settings.appearance')}
          >
            {THEME_OPTIONS.map(({ value, labelKey, icon }) => {
              const active = currentTheme === value;
              return (
                <button
                  key={value}
                  type="button"
                  className={`entry-settings-theme-btn${active ? ' active' : ''}`}
                  aria-pressed={active}
                  onClick={() => onThemeChange(value)}
                >
                  <Icon name={icon} size={14} />
                  <span>{t(labelKey)}</span>
                </button>
              );
            })}
          </div>

          <label className="entry-settings-select-row">
            <span className="entry-settings-select-label">
              <Icon name="languages" size={14} />
              {t('settings.language')}
            </span>
            <select
              className="entry-settings-select"
              value={locale}
              aria-label={t('settings.language')}
              onChange={(event) => setLocale(event.target.value as typeof locale)}
            >
              {LOCALES.map((code) => (
                <option key={code} value={code}>
                  {LOCALE_LABEL[code]}
                </option>
              ))}
            </select>
          </label>

          <div className="avatar-popover__divider" aria-hidden />

          <a
            className="avatar-item"
            href={DISCORD_URL}
            {...ext}
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            <span className="avatar-item-icon" aria-hidden>
              <Icon name="discord" size={14} />
            </span>
            <span>Join Discord</span>
            <span className="avatar-item-meta">Community</span>
          </a>
          <a
            className="avatar-item"
            href={X_URL}
            {...ext}
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            <span className="avatar-item-icon" aria-hidden>
              <Icon name="external-link" size={14} />
            </span>
            <span>Follow @nexudotio on X</span>
            <span className="avatar-item-meta">Social</span>
          </a>

          <div className="avatar-popover__divider" aria-hidden />

          <button
            type="button"
            className="avatar-item"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onOpenSettings();
            }}
          >
            <span className="avatar-item-icon" aria-hidden>
              <Icon name="more-horizontal" size={14} />
            </span>
            <span>{t('avatar.settings')}</span>
            <span className="avatar-item-meta">
              {isMacPlatform() ? '⌘,' : 'Ctrl+,'}
            </span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
