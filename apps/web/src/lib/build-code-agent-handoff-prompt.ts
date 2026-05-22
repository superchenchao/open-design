import type { Project } from '@open-design/contracts';

export type CodeAgentHandoffTarget = 'react' | 'vue' | 'svelte' | 'solid';

interface TargetSpec {
  label: string;
  stack: string;
  entry: string;
}

const TARGETS: Record<CodeAgentHandoffTarget, TargetSpec> = {
  react: {
    label: 'React',
    stack: 'React + Vite + TypeScript',
    entry: 'src/App.tsx',
  },
  vue: {
    label: 'Vue.js',
    stack: 'Vue 3 + Vite + TypeScript',
    entry: 'src/App.vue',
  },
  svelte: {
    label: 'Svelte',
    stack: 'Svelte + Vite + TypeScript',
    entry: 'src/App.svelte',
  },
  solid: {
    label: 'SolidJS',
    stack: 'SolidJS + Vite + TypeScript',
    entry: 'src/App.tsx',
  },
};

export interface BuildCodeAgentHandoffPromptInput {
  project: Pick<Project, 'id' | 'name'>;
  projectDir: string;
  target: CodeAgentHandoffTarget;
}

export function codeAgentHandoffTargetLabel(target: CodeAgentHandoffTarget): string {
  return TARGETS[target].label;
}

export function buildCodeAgentHandoffPrompt({
  project,
  projectDir,
  target,
}: BuildCodeAgentHandoffPromptInput): string {
  const spec = TARGETS[target];

  return `# Code agent handoff - ${project.name}

You are taking over an Open Design project folder and converting the current design output into a ${spec.label} application.

## Working directory

\`\`\`
${projectDir}
\`\`\`

Open this folder first, inspect the existing files, and keep all generated work inside this directory unless the user explicitly asks for a different destination.

## Target

- Framework: ${spec.label}
- Default app stack: ${spec.stack}
- Main app entry when scaffolding from scratch: \`${spec.entry}\`
- Project ID: ${project.id}

## What to do

- Reuse the existing HTML, CSS, JavaScript, images, fonts, and copy as the visual contract.
- Convert the design into idiomatic ${spec.label} components with responsive layout and real interactions for any visible controls.
- Preserve the current look and behavior first; refactor internals only after the artifact matches the source design.
- If the folder is not already a runnable app, create a minimal ${spec.stack} project in place.
- Keep asset paths local and move assets into the framework's conventional public or src asset folders only when needed.
- Add clear package scripts for install, dev, build, and preview if a package manifest is created or changed.
- Run the cheapest relevant validation before finishing, usually install/build or the existing project checks.

## Finish

Summarize the files you changed, how to run the app, and anything that still needs product or visual review.
`;
}
