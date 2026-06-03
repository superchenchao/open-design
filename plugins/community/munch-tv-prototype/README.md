# munch.tv - Silicon Valley vocab prototype

Language: English | [Simplified Chinese](README.zh-CN.md)

Build a high-contrast, card-based Silicon Valley vocabulary learning prototype with bilingual flashcards and keyboard-friendly interactions.

## Use Cases

- Create an interactive vocabulary prototype for startup and product terms.
- Adapt the munch.tv-style card flow for a different bilingual glossary.
- Package a concise learning experience with home, show, episode, and word detail screens.

## Try It

```bash
od plugin validate .
od plugin install .
od plugin apply munch-tv-prototype --input topic="Silicon Valley vocabulary" --input audience="Chinese-speaking founders"
```

## Files

- `SKILL.md` - portable agent instructions.
- `open-design.json` - versioned Open Design marketplace and apply metadata.
- `preview/` - HTML prototype and screen examples copied from the Open Design project.
- `assets/` - source notes and vocabulary content used by the prototype.

## Capabilities

- `prompt:inject` lets the plugin receive the user's topic, audience, and adaptation brief.
- `fs:write` lets the plugin create or update local prototype files.
