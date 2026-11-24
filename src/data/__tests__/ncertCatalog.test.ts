import { describe, expect, it } from 'vitest';
import {
  NCERT_CHAPTERS,
  STUDY_SUBJECTS,
  getActiveChapters,
  getChapterById,
  getChaptersForSubject,
  getPyqYearsRange,
  getSubjectMeta,
} from '../ncertCatalog';

describe('NCERT Class 11 & 12 PCB catalog', () => {
  it('defines Physics, Chemistry, and Biology with PYQ tracker enabled only for Physics and Chemistry', () => {
    expect(STUDY_SUBJECTS.map((s) => s.id)).toEqual(['physics', 'chemistry', 'biology']);
    expect(getSubjectMeta('physics').hasPyqTracker).toBe(true);
    expect(getSubjectMeta('chemistry').hasPyqTracker).toBe(true);
    expect(getSubjectMeta('biology').hasPyqTracker).toBe(false);
  });

  it('has unique chapter IDs across all rationalized and archived NCERT chapters', () => {
    const ids = NCERT_CHAPTERS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);

    // Distinct IDs for chapters sharing titles across subjects
    expect(getChapterById('phy-11-thermodynamics')?.subjectId).toBe('physics');
    expect(getChapterById('chem-11-thermodynamics')?.subjectId).toBe('chemistry');
    expect(getChapterById('chem-12-biomolecules')?.subjectId).toBe('chemistry');
    expect(getChapterById('bio-11-biomolecules')?.subjectId).toBe('biology');
  });

  it('filters rationalized NCERT (2024–26) by default and exposes archived chapters when enabled', () => {
    const rationalized = getActiveChapters(false);
    const allChapters = getActiveChapters(true);

    expect(rationalized.length).toBe(79);
    expect(allChapters.length).toBe(98);

    expect(getChaptersForSubject('physics', { includeArchived: false })).toHaveLength(28);
    expect(getChaptersForSubject('chemistry', { includeArchived: false })).toHaveLength(19);
    expect(getChaptersForSubject('biology', { includeArchived: false })).toHaveLength(32);

    // Archived chapters hidden by default, shown when toggled on
    const chemRationalized = getChaptersForSubject('chemistry', { includeArchived: false });
    const chemWithArchived = getChaptersForSubject('chemistry', { includeArchived: true });
    expect(chemRationalized.some((c) => c.id === 'chem-12-solid-state')).toBe(false);
    expect(chemWithArchived.some((c) => c.id === 'chem-12-solid-state')).toBe(true);
  });

  it('generates descending PYQ year ranges safely', () => {
    const years = getPyqYearsRange(2013, 2026);
    expect(years).toHaveLength(14);
    expect(years[0]).toBe(2026);
    expect(years[years.length - 1]).toBe(2013);

    // Handles inverted input gracefully
    expect(getPyqYearsRange(2024, 2020)).toEqual([2024, 2023, 2022, 2021, 2020]);
  });
});
