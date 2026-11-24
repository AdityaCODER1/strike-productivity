export type StudySubjectId = 'physics' | 'chemistry' | 'biology';

export type NcertClassLevel = 11 | 12;

export interface StudySubjectMeta {
  id: StudySubjectId;
  name: string;
  shortName: string;
  colorToken: 'blue' | 'amber' | 'green';
  hasPyqTracker: boolean;
}

export interface NcertChapter {
  id: string;
  subjectId: StudySubjectId;
  classLevel: NcertClassLevel;
  chapterNumber: number;
  title: string;
  archived?: boolean;
}

export const STUDY_SUBJECTS: StudySubjectMeta[] = [
  {
    id: 'physics',
    name: 'Physics',
    shortName: 'Phy',
    colorToken: 'blue',
    hasPyqTracker: true,
  },
  {
    id: 'chemistry',
    name: 'Chemistry',
    shortName: 'Chem',
    colorToken: 'amber',
    hasPyqTracker: true,
  },
  {
    id: 'biology',
    name: 'Biology',
    shortName: 'Bio',
    colorToken: 'green',
    hasPyqTracker: false,
  },
];

export const NCERT_CHAPTERS: NcertChapter[] = [
  // ===================== PHYSICS — CLASS 11 =====================
  { id: 'phy-11-units-and-measurements', subjectId: 'physics', classLevel: 11, chapterNumber: 1, title: 'Units and Measurements' },
  { id: 'phy-11-motion-in-a-straight-line', subjectId: 'physics', classLevel: 11, chapterNumber: 2, title: 'Motion in a Straight Line' },
  { id: 'phy-11-motion-in-a-plane', subjectId: 'physics', classLevel: 11, chapterNumber: 3, title: 'Motion in a Plane' },
  { id: 'phy-11-laws-of-motion', subjectId: 'physics', classLevel: 11, chapterNumber: 4, title: 'Laws of Motion' },
  { id: 'phy-11-work-energy-and-power', subjectId: 'physics', classLevel: 11, chapterNumber: 5, title: 'Work, Energy and Power' },
  { id: 'phy-11-rotational-motion', subjectId: 'physics', classLevel: 11, chapterNumber: 6, title: 'System of Particles and Rotational Motion' },
  { id: 'phy-11-gravitation', subjectId: 'physics', classLevel: 11, chapterNumber: 7, title: 'Gravitation' },
  { id: 'phy-11-mechanical-properties-of-solids', subjectId: 'physics', classLevel: 11, chapterNumber: 8, title: 'Mechanical Properties of Solids' },
  { id: 'phy-11-mechanical-properties-of-fluids', subjectId: 'physics', classLevel: 11, chapterNumber: 9, title: 'Mechanical Properties of Fluids' },
  { id: 'phy-11-thermal-properties-of-matter', subjectId: 'physics', classLevel: 11, chapterNumber: 10, title: 'Thermal Properties of Matter' },
  { id: 'phy-11-thermodynamics', subjectId: 'physics', classLevel: 11, chapterNumber: 11, title: 'Thermodynamics' },
  { id: 'phy-11-kinetic-theory', subjectId: 'physics', classLevel: 11, chapterNumber: 12, title: 'Kinetic Theory' },
  { id: 'phy-11-oscillations', subjectId: 'physics', classLevel: 11, chapterNumber: 13, title: 'Oscillations' },
  { id: 'phy-11-waves', subjectId: 'physics', classLevel: 11, chapterNumber: 14, title: 'Waves' },
  { id: 'phy-11-physical-world', subjectId: 'physics', classLevel: 11, chapterNumber: 15, title: 'Physical World', archived: true },

  // ===================== PHYSICS — CLASS 12 =====================
  { id: 'phy-12-electric-charges-and-fields', subjectId: 'physics', classLevel: 12, chapterNumber: 1, title: 'Electric Charges and Fields' },
  { id: 'phy-12-electrostatic-potential-and-capacitance', subjectId: 'physics', classLevel: 12, chapterNumber: 2, title: 'Electrostatic Potential and Capacitance' },
  { id: 'phy-12-current-electricity', subjectId: 'physics', classLevel: 12, chapterNumber: 3, title: 'Current Electricity' },
  { id: 'phy-12-moving-charges-and-magnetism', subjectId: 'physics', classLevel: 12, chapterNumber: 4, title: 'Moving Charges and Magnetism' },
  { id: 'phy-12-magnetism-and-matter', subjectId: 'physics', classLevel: 12, chapterNumber: 5, title: 'Magnetism and Matter' },
  { id: 'phy-12-electromagnetic-induction', subjectId: 'physics', classLevel: 12, chapterNumber: 6, title: 'Electromagnetic Induction' },
  { id: 'phy-12-alternating-current', subjectId: 'physics', classLevel: 12, chapterNumber: 7, title: 'Alternating Current' },
  { id: 'phy-12-electromagnetic-waves', subjectId: 'physics', classLevel: 12, chapterNumber: 8, title: 'Electromagnetic Waves' },
  { id: 'phy-12-ray-optics', subjectId: 'physics', classLevel: 12, chapterNumber: 9, title: 'Ray Optics and Optical Instruments' },
  { id: 'phy-12-wave-optics', subjectId: 'physics', classLevel: 12, chapterNumber: 10, title: 'Wave Optics' },
  { id: 'phy-12-dual-nature', subjectId: 'physics', classLevel: 12, chapterNumber: 11, title: 'Dual Nature of Radiation and Matter' },
  { id: 'phy-12-atoms', subjectId: 'physics', classLevel: 12, chapterNumber: 12, title: 'Atoms' },
  { id: 'phy-12-nuclei', subjectId: 'physics', classLevel: 12, chapterNumber: 13, title: 'Nuclei' },
  { id: 'phy-12-semiconductor-electronics', subjectId: 'physics', classLevel: 12, chapterNumber: 14, title: 'Semiconductor Electronics: Materials, Devices and Simple Circuits' },
  { id: 'phy-12-communication-systems', subjectId: 'physics', classLevel: 12, chapterNumber: 15, title: 'Communication Systems', archived: true },

  // ===================== CHEMISTRY — CLASS 11 =====================
  { id: 'chem-11-some-basic-concepts', subjectId: 'chemistry', classLevel: 11, chapterNumber: 1, title: 'Some Basic Concepts of Chemistry' },
  { id: 'chem-11-structure-of-atom', subjectId: 'chemistry', classLevel: 11, chapterNumber: 2, title: 'Structure of Atom' },
  { id: 'chem-11-classification-of-elements', subjectId: 'chemistry', classLevel: 11, chapterNumber: 3, title: 'Classification of Elements and Periodicity in Properties' },
  { id: 'chem-11-chemical-bonding', subjectId: 'chemistry', classLevel: 11, chapterNumber: 4, title: 'Chemical Bonding and Molecular Structure' },
  { id: 'chem-11-thermodynamics', subjectId: 'chemistry', classLevel: 11, chapterNumber: 5, title: 'Thermodynamics' },
  { id: 'chem-11-equilibrium', subjectId: 'chemistry', classLevel: 11, chapterNumber: 6, title: 'Equilibrium' },
  { id: 'chem-11-redox-reactions', subjectId: 'chemistry', classLevel: 11, chapterNumber: 7, title: 'Redox Reactions' },
  { id: 'chem-11-organic-basic-principles', subjectId: 'chemistry', classLevel: 11, chapterNumber: 8, title: 'Organic Chemistry – Some Basic Principles and Techniques' },
  { id: 'chem-11-hydrocarbons', subjectId: 'chemistry', classLevel: 11, chapterNumber: 9, title: 'Hydrocarbons' },
  { id: 'chem-11-states-of-matter', subjectId: 'chemistry', classLevel: 11, chapterNumber: 10, title: 'States of Matter', archived: true },
  { id: 'chem-11-hydrogen', subjectId: 'chemistry', classLevel: 11, chapterNumber: 11, title: 'Hydrogen', archived: true },
  { id: 'chem-11-s-block-elements', subjectId: 'chemistry', classLevel: 11, chapterNumber: 12, title: 'The s-Block Elements', archived: true },
  { id: 'chem-11-p-block-elements', subjectId: 'chemistry', classLevel: 11, chapterNumber: 13, title: 'The p-Block Elements (Class 11)', archived: true },
  { id: 'chem-11-environmental-chemistry', subjectId: 'chemistry', classLevel: 11, chapterNumber: 14, title: 'Environmental Chemistry', archived: true },

  // ===================== CHEMISTRY — CLASS 12 =====================
  { id: 'chem-12-solutions', subjectId: 'chemistry', classLevel: 12, chapterNumber: 1, title: 'Solutions' },
  { id: 'chem-12-electrochemistry', subjectId: 'chemistry', classLevel: 12, chapterNumber: 2, title: 'Electrochemistry' },
  { id: 'chem-12-chemical-kinetics', subjectId: 'chemistry', classLevel: 12, chapterNumber: 3, title: 'Chemical Kinetics' },
  { id: 'chem-12-d-and-f-block-elements', subjectId: 'chemistry', classLevel: 12, chapterNumber: 4, title: 'The d- and f-Block Elements' },
  { id: 'chem-12-coordination-compounds', subjectId: 'chemistry', classLevel: 12, chapterNumber: 5, title: 'Coordination Compounds' },
  { id: 'chem-12-haloalkanes-and-haloarenes', subjectId: 'chemistry', classLevel: 12, chapterNumber: 6, title: 'Haloalkanes and Haloarenes' },
  { id: 'chem-12-alcohols-phenols-and-ethers', subjectId: 'chemistry', classLevel: 12, chapterNumber: 7, title: 'Alcohols, Phenols and Ethers' },
  { id: 'chem-12-aldehydes-ketones-carboxylic-acids', subjectId: 'chemistry', classLevel: 12, chapterNumber: 8, title: 'Aldehydes, Ketones and Carboxylic Acids' },
  { id: 'chem-12-amines', subjectId: 'chemistry', classLevel: 12, chapterNumber: 9, title: 'Amines' },
  { id: 'chem-12-biomolecules', subjectId: 'chemistry', classLevel: 12, chapterNumber: 10, title: 'Biomolecules' },
  { id: 'chem-12-solid-state', subjectId: 'chemistry', classLevel: 12, chapterNumber: 11, title: 'The Solid State', archived: true },
  { id: 'chem-12-surface-chemistry', subjectId: 'chemistry', classLevel: 12, chapterNumber: 12, title: 'Surface Chemistry', archived: true },
  { id: 'chem-12-metallurgy', subjectId: 'chemistry', classLevel: 12, chapterNumber: 13, title: 'General Principles and Processes of Isolation of Elements', archived: true },
  { id: 'chem-12-p-block-elements', subjectId: 'chemistry', classLevel: 12, chapterNumber: 14, title: 'The p-Block Elements (Class 12)', archived: true },
  { id: 'chem-12-polymers', subjectId: 'chemistry', classLevel: 12, chapterNumber: 15, title: 'Polymers', archived: true },
  { id: 'chem-12-chemistry-in-everyday-life', subjectId: 'chemistry', classLevel: 12, chapterNumber: 16, title: 'Chemistry in Everyday Life', archived: true },

  // ===================== BIOLOGY — CLASS 11 =====================
  { id: 'bio-11-the-living-world', subjectId: 'biology', classLevel: 11, chapterNumber: 1, title: 'The Living World' },
  { id: 'bio-11-biological-classification', subjectId: 'biology', classLevel: 11, chapterNumber: 2, title: 'Biological Classification' },
  { id: 'bio-11-plant-kingdom', subjectId: 'biology', classLevel: 11, chapterNumber: 3, title: 'Plant Kingdom' },
  { id: 'bio-11-animal-kingdom', subjectId: 'biology', classLevel: 11, chapterNumber: 4, title: 'Animal Kingdom' },
  { id: 'bio-11-morphology-of-flowering-plants', subjectId: 'biology', classLevel: 11, chapterNumber: 5, title: 'Morphology of Flowering Plants' },
  { id: 'bio-11-anatomy-of-flowering-plants', subjectId: 'biology', classLevel: 11, chapterNumber: 6, title: 'Anatomy of Flowering Plants' },
  { id: 'bio-11-structural-organisation-in-animals', subjectId: 'biology', classLevel: 11, chapterNumber: 7, title: 'Structural Organisation in Animals' },
  { id: 'bio-11-cell-the-unit-of-life', subjectId: 'biology', classLevel: 11, chapterNumber: 8, title: 'Cell: The Unit of Life' },
  { id: 'bio-11-biomolecules', subjectId: 'biology', classLevel: 11, chapterNumber: 9, title: 'Biomolecules' },
  { id: 'bio-11-cell-cycle-and-cell-division', subjectId: 'biology', classLevel: 11, chapterNumber: 10, title: 'Cell Cycle and Cell Division' },
  { id: 'bio-11-photosynthesis', subjectId: 'biology', classLevel: 11, chapterNumber: 11, title: 'Photosynthesis in Higher Plants' },
  { id: 'bio-11-respiration-in-plants', subjectId: 'biology', classLevel: 11, chapterNumber: 12, title: 'Respiration in Plants' },
  { id: 'bio-11-plant-growth-and-development', subjectId: 'biology', classLevel: 11, chapterNumber: 13, title: 'Plant Growth and Development' },
  { id: 'bio-11-breathing-and-exchange-of-gases', subjectId: 'biology', classLevel: 11, chapterNumber: 14, title: 'Breathing and Exchange of Gases' },
  { id: 'bio-11-body-fluids-and-circulation', subjectId: 'biology', classLevel: 11, chapterNumber: 15, title: 'Body Fluids and Circulation' },
  { id: 'bio-11-excretory-products', subjectId: 'biology', classLevel: 11, chapterNumber: 16, title: 'Excretory Products and their Elimination' },
  { id: 'bio-11-locomotion-and-movement', subjectId: 'biology', classLevel: 11, chapterNumber: 17, title: 'Locomotion and Movement' },
  { id: 'bio-11-neural-control-and-coordination', subjectId: 'biology', classLevel: 11, chapterNumber: 18, title: 'Neural Control and Coordination' },
  { id: 'bio-11-chemical-coordination-and-integration', subjectId: 'biology', classLevel: 11, chapterNumber: 19, title: 'Chemical Coordination and Integration' },
  { id: 'bio-11-transport-in-plants', subjectId: 'biology', classLevel: 11, chapterNumber: 20, title: 'Transport in Plants', archived: true },
  { id: 'bio-11-mineral-nutrition', subjectId: 'biology', classLevel: 11, chapterNumber: 21, title: 'Mineral Nutrition', archived: true },
  { id: 'bio-11-digestion-and-absorption', subjectId: 'biology', classLevel: 11, chapterNumber: 22, title: 'Digestion and Absorption', archived: true },

  // ===================== BIOLOGY — CLASS 12 =====================
  { id: 'bio-12-sexual-reproduction-in-flowering-plants', subjectId: 'biology', classLevel: 12, chapterNumber: 1, title: 'Sexual Reproduction in Flowering Plants' },
  { id: 'bio-12-human-reproduction', subjectId: 'biology', classLevel: 12, chapterNumber: 2, title: 'Human Reproduction' },
  { id: 'bio-12-reproductive-health', subjectId: 'biology', classLevel: 12, chapterNumber: 3, title: 'Reproductive Health' },
  { id: 'bio-12-principles-of-inheritance', subjectId: 'biology', classLevel: 12, chapterNumber: 4, title: 'Principles of Inheritance and Variation' },
  { id: 'bio-12-molecular-basis-of-inheritance', subjectId: 'biology', classLevel: 12, chapterNumber: 5, title: 'Molecular Basis of Inheritance' },
  { id: 'bio-12-evolution', subjectId: 'biology', classLevel: 12, chapterNumber: 6, title: 'Evolution' },
  { id: 'bio-12-human-health-and-disease', subjectId: 'biology', classLevel: 12, chapterNumber: 7, title: 'Human Health and Disease' },
  { id: 'bio-12-microbes-in-human-welfare', subjectId: 'biology', classLevel: 12, chapterNumber: 8, title: 'Microbes in Human Welfare' },
  { id: 'bio-12-biotechnology-principles', subjectId: 'biology', classLevel: 12, chapterNumber: 9, title: 'Biotechnology: Principles and Processes' },
  { id: 'bio-12-biotechnology-applications', subjectId: 'biology', classLevel: 12, chapterNumber: 10, title: 'Biotechnology and its Applications' },
  { id: 'bio-12-organisms-and-populations', subjectId: 'biology', classLevel: 12, chapterNumber: 11, title: 'Organisms and Populations' },
  { id: 'bio-12-ecosystem', subjectId: 'biology', classLevel: 12, chapterNumber: 12, title: 'Ecosystem' },
  { id: 'bio-12-biodiversity-and-conservation', subjectId: 'biology', classLevel: 12, chapterNumber: 13, title: 'Biodiversity and Conservation' },
  { id: 'bio-12-reproduction-in-organisms', subjectId: 'biology', classLevel: 12, chapterNumber: 14, title: 'Reproduction in Organisms', archived: true },
  { id: 'bio-12-food-production-strategies', subjectId: 'biology', classLevel: 12, chapterNumber: 15, title: 'Strategies for Enhancement in Food Production', archived: true },
  { id: 'bio-12-environmental-issues', subjectId: 'biology', classLevel: 12, chapterNumber: 16, title: 'Environmental Issues', archived: true },
];

const CHAPTER_MAP = new Map<string, NcertChapter>(NCERT_CHAPTERS.map((ch) => [ch.id, ch]));
const SUBJECT_MAP = new Map<StudySubjectId, StudySubjectMeta>(
  STUDY_SUBJECTS.map((s) => [s.id, s])
);

export function isValidSubjectId(value: unknown): value is StudySubjectId {
  return value === 'physics' || value === 'chemistry' || value === 'biology';
}

export function getSubjectMeta(subjectId: StudySubjectId): StudySubjectMeta {
  return SUBJECT_MAP.get(subjectId) ?? STUDY_SUBJECTS[0];
}

export function getChapterById(chapterId?: string | null): NcertChapter | undefined {
  if (!chapterId) return undefined;
  return CHAPTER_MAP.get(chapterId);
}

export function getActiveChapters(includeArchived: boolean): NcertChapter[] {
  return includeArchived ? NCERT_CHAPTERS : NCERT_CHAPTERS.filter((ch) => !ch.archived);
}

export function getChaptersForSubject(
  subjectId: StudySubjectId,
  options?: { includeArchived?: boolean; classLevel?: NcertClassLevel | 'all' }
): NcertChapter[] {
  const includeArchived = options?.includeArchived ?? false;
  const classLevel = options?.classLevel ?? 'all';
  return NCERT_CHAPTERS.filter((ch) => {
    if (ch.subjectId !== subjectId) return false;
    if (!includeArchived && ch.archived) return false;
    if (classLevel !== 'all' && ch.classLevel !== classLevel) return false;
    return true;
  });
}

export function getPyqYearsRange(startYear: number, endYear: number): number[] {
  const safeStart = Math.max(1988, Math.min(2035, Math.floor(Math.min(startYear, endYear))));
  const safeEnd = Math.max(1988, Math.min(2035, Math.floor(Math.max(startYear, endYear))));
  const years: number[] = [];
  for (let y = safeEnd; y >= safeStart; y -= 1) {
    years.push(y);
  }
  return years;
}

export function buildCompactCatalogPrompt(includeArchived: boolean): string {
  const chapters = getActiveChapters(includeArchived);
  return chapters
    .map(
      (ch) =>
        `${ch.id} | ${ch.subjectId} | Class ${ch.classLevel} | ${ch.title}${
          ch.archived ? ' (Archived NCERT)' : ''
        }`
    )
    .join('\n');
}

export function isLearningCategoryName(category?: string | null): boolean {
  return (category ?? '').trim().toLowerCase() === 'learning';
}

export function isDoubtsCategoryName(category?: string | null): boolean {
  const normalized = (category ?? '').trim().toLowerCase();
  return normalized === 'doubts' || normalized === 'doubt';
}

export function isStudyTaggedCategory(category?: string | null): boolean {
  return isLearningCategoryName(category) || isDoubtsCategoryName(category);
}
