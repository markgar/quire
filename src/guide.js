// @ts-check

import { readFileSync } from 'node:fs';

const skill = readFileSync(new URL('../skills/quire/SKILL.md', import.meta.url), 'utf8');
const body = skill.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n([\s\S]*)$/);

if (!body) {
  throw new Error('skills/quire/SKILL.md must contain YAML frontmatter and an instruction body');
}

// The installable skill is canonical; the CLI exposes the same instructions.
export const AUTHORING_GUIDE = body[1].trim();
