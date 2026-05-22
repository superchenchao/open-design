// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { EntrySettingsMenu } from '../../src/components/EntrySettingsMenu';
import { I18nProvider } from '../../src/i18n';
import type { AppConfig } from '../../src/types';

const baseConfig: AppConfig = {
  mode: 'daemon',
  apiKey: '',
  baseUrl: '',
  model: '',
  agentId: null,
  skillId: null,
  designSystemId: null,
  theme: 'system',
};

function renderMenu(overrides: Partial<AppConfig> = {}) {
  const onThemeChange = vi.fn();
  const onOpenSettings = vi.fn();
  render(
    <I18nProvider initial="en">
      <EntrySettingsMenu
        config={{ ...baseConfig, ...overrides }}
        onThemeChange={onThemeChange}
        onOpenSettings={onOpenSettings}
      />
    </I18nProvider>,
  );
  return { onThemeChange, onOpenSettings };
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.clearAllMocks();
});

describe('EntrySettingsMenu', () => {
  it('opens a quick settings dropdown instead of immediately opening the modal', () => {
    const { onOpenSettings } = renderMenu();

    fireEvent.click(screen.getByTestId('entry-settings-menu-trigger'));

    expect(screen.getByTestId('entry-settings-menu')).toBeTruthy();
    expect(screen.getByText('Appearance')).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Language' })).toBeTruthy();
    expect(onOpenSettings).not.toHaveBeenCalled();
  });

  it('supports quick appearance and language switching from the dropdown', () => {
    const { onThemeChange } = renderMenu({ theme: 'light' });

    fireEvent.click(screen.getByTestId('entry-settings-menu-trigger'));
    fireEvent.click(screen.getByRole('button', { name: 'Dark' }));

    expect(onThemeChange).toHaveBeenCalledWith('dark');

    const languageSelect = screen.getByRole('combobox', { name: 'Language' }) as HTMLSelectElement;
    fireEvent.change(languageSelect, { target: { value: 'zh-CN' } });

    expect(languageSelect.value).toBe('zh-CN');
    expect(window.localStorage.getItem('open-design:locale')).toBe('zh-CN');
  });

  it('exposes social links and opens the full settings modal from More', () => {
    const { onOpenSettings } = renderMenu();

    fireEvent.click(screen.getByTestId('entry-settings-menu-trigger'));

    expect(screen.getByRole('menuitem', { name: /Join Discord/ }).getAttribute('href')).toBe(
      'https://discord.gg/mHAjSMV6gz',
    );
    expect(screen.getByRole('menuitem', { name: /Follow @nexudotio on X/ }).getAttribute('href')).toBe(
      'https://x.com/nexudotio',
    );

    fireEvent.click(screen.getByRole('menuitem', { name: /Settings/ }));

    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });
});
