import { describe, expect, it } from 'vitest';

import {
  describeDSA5Filters,
  isValidDSA5Species,
  isValidExperienceLevel,
  matchesDSA5Filters,
} from './filters.js';
import type { DSA5Filters } from './filters.js';

const testCreature = {
  id: 'test-goblin-1',
  name: 'Goblin Krieger',
  type: 'character',
  systemData: {
    level: 2,
    species: 'goblin',
    culture: 'Bergstamm',
    size: 'small',
    hasSpells: false,
    experiencePoints: 1200,
  },
};

const testSpellcaster = {
  id: 'test-magier-1',
  name: 'Elf Magier',
  type: 'character',
  systemData: {
    level: 5,
    species: 'elf',
    culture: 'Auelfen',
    size: 'medium',
    hasSpells: true,
    experiencePoints: 4000,
  },
};

describe('DSA5 filters', () => {
  it('matches exact level filter', () => {
    const filter: DSA5Filters = { level: 2 };

    expect(matchesDSA5Filters(testCreature, filter)).toBe(true);
    expect(matchesDSA5Filters(testSpellcaster, filter)).toBe(false);
  });

  it('matches level range filter', () => {
    const filter: DSA5Filters = { level: { min: 2, max: 5 } };

    expect(matchesDSA5Filters(testCreature, filter)).toBe(true);
    expect(matchesDSA5Filters(testSpellcaster, filter)).toBe(true);
  });

  it('matches species filter', () => {
    const filter: DSA5Filters = { species: 'goblin' };

    expect(matchesDSA5Filters(testCreature, filter)).toBe(true);
    expect(matchesDSA5Filters(testSpellcaster, filter)).toBe(false);
  });

  it('matches hasSpells filter', () => {
    const filter: DSA5Filters = { hasSpells: true };

    expect(matchesDSA5Filters(testCreature, filter)).toBe(false);
    expect(matchesDSA5Filters(testSpellcaster, filter)).toBe(true);
  });

  it('matches combined filters', () => {
    const filter: DSA5Filters = {
      level: { min: 1, max: 3 },
      size: 'small',
      hasSpells: false,
    };

    expect(matchesDSA5Filters(testCreature, filter)).toBe(true);
    expect(matchesDSA5Filters(testSpellcaster, filter)).toBe(false);
  });

  it('matches experience points range filter', () => {
    const filter: DSA5Filters = { experiencePoints: { min: 1000, max: 2000 } };

    expect(matchesDSA5Filters(testCreature, filter)).toBe(true);
    expect(matchesDSA5Filters(testSpellcaster, filter)).toBe(false);
  });
});

describe('DSA5 filter helpers', () => {
  it('validates species values', () => {
    expect(isValidDSA5Species('goblin')).toBe(true);
    expect(isValidDSA5Species('GOBLIN')).toBe(true);
    expect(isValidDSA5Species('unicorn')).toBe(false);
  });

  it('validates experience levels', () => {
    expect(isValidExperienceLevel(3)).toBe(true);
    expect(isValidExperienceLevel(0)).toBe(false);
    expect(isValidExperienceLevel(8)).toBe(false);
  });

  it('describes filters for human-readable output', () => {
    const description = describeDSA5Filters({
      level: { min: 2, max: 5 },
      species: 'elf',
      hasSpells: true,
      experiencePoints: { min: 1000, max: 3000 },
    });

    expect(description).toContain('Stufe 2-5');
    expect(description).toContain('elf');
    expect(description).toContain('Zauberer');
    expect(description).toContain('1000-3000 AP');
  });
});
