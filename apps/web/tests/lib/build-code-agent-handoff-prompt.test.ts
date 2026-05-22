import { describe, expect, it } from 'vitest';

import { buildCodeAgentHandoffPrompt } from '../../src/lib/build-code-agent-handoff-prompt';

const PROJECT = { id: 'proj-abc', name: 'Acme Dashboard' };

describe('buildCodeAgentHandoffPrompt', () => {
  it('includes the project folder and framework-specific conversion target', () => {
    const prompt = buildCodeAgentHandoffPrompt({
      project: PROJECT,
      projectDir: '/Users/bryan/projects/acme',
      target: 'react',
    });

    expect(prompt).toContain('Acme Dashboard');
    expect(prompt).toContain('/Users/bryan/projects/acme');
    expect(prompt).toContain('Framework: React');
    expect(prompt).toContain('Default app stack: React + Vite + TypeScript');
    expect(prompt).toContain('Main app entry when scaffolding from scratch: `src/App.tsx`');
    expect(prompt).toContain('Project ID: proj-abc');
  });

  it('uses the Vue entry file for Vue.js handoff prompts', () => {
    const prompt = buildCodeAgentHandoffPrompt({
      project: PROJECT,
      projectDir: '/Users/bryan/projects/acme',
      target: 'vue',
    });

    expect(prompt).toContain('Framework: Vue.js');
    expect(prompt).toContain('Default app stack: Vue 3 + Vite + TypeScript');
    expect(prompt).toContain('Main app entry when scaffolding from scratch: `src/App.vue`');
  });

});
