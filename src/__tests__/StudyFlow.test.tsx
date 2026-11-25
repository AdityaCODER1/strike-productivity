import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { App } from '../App';

function clickTab(name: 'Plan' | 'Today' | 'Study' | 'History' | 'Settings') {
  const nav = screen.getByRole('navigation', { name: /Primary Navigation/i });
  fireEvent.click(within(nav).getByRole('button', { name: new RegExp(`^${name}`, 'i') }));
}

describe('Study Hub, NCERT Chapters, PYQs & Doubts end-to-end flows', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('displays rationalized NCERT PCB chapters, toggles archived chapters, and checks off Physics & Chemistry PYQ years', () => {
    render(<App />);
    clickTab('Study');

    // Physics rationalized chapters visible by default
    expect(screen.getByText('Electric Charges and Fields')).toBeInTheDocument();
    expect(screen.queryByText('Communication Systems')).not.toBeInTheDocument();

    // Toggle Archived NCERT on -> older chapters appear
    fireEvent.click(screen.getByRole('button', { name: /Archived/i }));
    expect(screen.getByText('Communication Systems')).toBeInTheDocument();

    // Switch to Chemistry subject card -> check Solid State appears when Archived is on
    fireEvent.click(screen.getByRole('tab', { name: /Chemistry/i }));
    expect(screen.getByText('The Solid State')).toBeInTheDocument();
    expect(screen.getByText('Electrochemistry')).toBeInTheDocument();

    // Switch to Biology subject card
    fireEvent.click(screen.getByRole('tab', { name: /Biology/i }));
    expect(screen.getByText('Molecular Basis of Inheritance')).toBeInTheDocument();

    // Switch to PYQs sub-tab (Physics & Chemistry)
    fireEvent.click(screen.getByRole('tab', { name: /^PYQs$/i }));
    const unitsGroup = screen.getByRole('group', { name: /PYQ years for Units and Measurements/i });
    const btn2024 = within(unitsGroup).getByRole('button', { name: '2024' });
    expect(btn2024).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(btn2024);
    expect(btn2024).toHaveAttribute('aria-pressed', 'true');
  });

  it('auto-tags Learning brain dumps to NCERT chapters, updates holistic AI %, and saves brain-dump doubts', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      // 1st call: Brain dump analysis
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      completedActivities: [
                        {
                          title: 'Revised Ray Optics NCERT and solved prism numericals',
                          category: 'Learning',
                          matchedOpenTaskId: null,
                          subjectId: 'physics',
                          chapterId: 'phy-12-ray-optics',
                        },
                      ],
                      unfinishedTasks: [],
                      doubts: [
                        {
                          title: 'Lens maker sign convention confusion',
                          questionText: 'Sign of R2 for equiconvex lens in medium of higher refractive index',
                          subjectId: 'physics',
                          chapterId: 'phy-12-ray-optics',
                          pyqYear: 2021,
                        },
                      ],
                    }),
                  },
                ],
              },
            },
          ],
        }),
      } as unknown as Response)
      // 2nd call: Background holistic AI chapter coverage calculation
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      coveragePercent: 42,
                      aiSummary: 'NCERT concepts & prism numericals done; optical instruments & PYQs left.',
                    }),
                  },
                ],
              },
            },
          ],
        }),
      } as unknown as Response);

    render(<App />);

    // Add Gemini API key in Settings
    clickTab('Settings');
    fireEvent.change(screen.getByLabelText('API Key'), { target: { value: 'AIzaStudyKey' } });
    fireEvent.click(screen.getByRole('button', { name: /Save Gemini Settings/i }));

    // Submit brain dump on Today
    clickTab('Today');
    fireEvent.change(screen.getByPlaceholderText(/Dump what you got done today/i), {
      target: {
        value: 'Revised Ray Optics NCERT and solved prism numericals, still confused about lens maker sign convention 2021 pyq',
      },
    });
    fireEvent.click(screen.getByRole('button', { name: /Log with Gemini/i }));

    await waitFor(() => {
      expect(
        screen.getByText('Revised Ray Optics NCERT and solved prism numericals')
      ).toBeInTheDocument();
    });

    // Wait for background holistic chapter coverage call to resolve
    await waitFor(
      () => {
        expect(fetchSpy).toHaveBeenCalledTimes(2);
      },
      { timeout: 2500 }
    );

    // Open Study -> Chapters and verify Ray Optics shows 42%
    clickTab('Study');
    await waitFor(() => {
      expect(screen.getByText('42%')).toBeInTheDocument();
    });

    // Open Study -> Doubts and verify the captured doubt is organized under Ray Optics
    fireEvent.click(screen.getByRole('tab', { name: /^Doubts/i }));
    expect(screen.getByText('Lens maker sign convention confusion')).toBeInTheDocument();
    expect(screen.getByText('PYQ 2021')).toBeInTheDocument();
  });

  it('creates, reviews, explains with Gemini, and resolves a doubt in Study -> Doubts', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: 'Step 1: Recall Nernst equation E = E° - (0.059/n) log Q.',
                },
              ],
            },
          },
        ],
      }),
    } as unknown as Response);

    render(<App />);

    // Configure Gemini key
    clickTab('Settings');
    fireEvent.change(screen.getByLabelText('API Key'), { target: { value: 'AIzaDoubtKey' } });
    fireEvent.click(screen.getByRole('button', { name: /Save Gemini Settings/i }));

    // Go to Study -> Doubts -> New Doubt
    clickTab('Study');
    fireEvent.click(screen.getByRole('tab', { name: /^Doubts/i }));
    fireEvent.click(screen.getByRole('button', { name: /New Doubt/i }));

    // Select Chemistry subject and enter doubt details
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Chemistry' }));
    fireEvent.change(within(dialog).getByLabelText(/Short Title/i), {
      target: { value: 'Nernst equation sign doubt' },
    });
    fireEvent.change(within(dialog).getByLabelText(/Question \/ Doubt Text/i), {
      target: { value: 'When does E_cell increase with dilution?' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: /Save Doubt/i }));

    expect(screen.getByText('Nernst equation sign doubt')).toBeInTheDocument();

    // Open doubt detail sheet and ask Gemini to explain
    fireEvent.click(screen.getByText('Nernst equation sign doubt'));
    const detailDialog = screen.getByRole('dialog');
    fireEvent.click(within(detailDialog).getByRole('button', { name: /Ask Gemini to Explain/i }));

    await waitFor(() => {
      expect(within(detailDialog).getByText(/Recall Nernst equation/i)).toBeInTheDocument();
    });

    // Add takeaway note & mark resolved
    fireEvent.change(within(detailDialog).getByLabelText(/My Takeaway/i), {
      target: { value: 'Check reaction quotient Q ratio carefully' },
    });
    fireEvent.click(within(detailDialog).getByRole('button', { name: /Mark Resolved/i }));
    fireEvent.click(within(detailDialog).getByRole('button', { name: /Save Notes/i }));

    // Switch filter to Resolved and confirm it is there
    fireEvent.click(screen.getByRole('tab', { name: /^Resolved$/i }));
    expect(screen.getByText('Nernst equation sign doubt')).toBeInTheDocument();
  });

  it('extracts mistakes from Today Mistake Dump, tracks repeats/filters, and generates per-chapter revision summaries for Mistakes & Doubts', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      // 1st call: Today Mistake Dump extraction
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      completedActivities: [],
                      unfinishedTasks: [],
                      doubts: [
                        {
                          title: 'Abnormal molar mass association case',
                          questionText: 'Why does benzoic acid dimerize in benzene?',
                          subjectId: 'chemistry',
                          chapterId: 'chem-12-solutions',
                          pyqYear: 2020,
                        },
                      ],
                      mistakes: [
                        {
                          title: "Forgot Van't Hoff factor for K₂SO₄",
                          mistakeText: 'Used i=1 instead of i=3 in osmotic pressure formula',
                          correctionNote: 'Multiply π = iCRT with i = 3 for K₂SO₄',
                          mistakeType: 'formula',
                          subjectId: 'chemistry',
                          chapterId: 'chem-12-solutions',
                          sourceLabel: 'Mock #4',
                        },
                      ],
                    }),
                  },
                ],
              },
            },
          ],
        }),
      } as unknown as Response)
      // 2nd call: Per-chapter Mistake Revision Summary
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: '1. Top Weak Spot: Electrolyte Van’t Hoff factor i in colligative properties.\n2. Rule: Always check dissociation before computing π or ΔTb.',
                  },
                ],
              },
            },
          ],
        }),
      } as unknown as Response)
      // 3rd call: Per-chapter Doubts Revision Summary
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: '1. Core Theme: Dimerization lowers particle count (i < 1) via H-bonding in non-polar solvents.',
                  },
                ],
              },
            },
          ],
        }),
      } as unknown as Response);

    render(<App />);

    // Add Gemini API key
    clickTab('Settings');
    fireEvent.change(screen.getByLabelText('API Key'), { target: { value: 'AIzaMistakeKey' } });
    fireEvent.click(screen.getByRole('button', { name: /Save Gemini Settings/i }));

    // Today -> Brain Dump -> switch to Mistake Dump preset
    clickTab('Today');
    fireEvent.click(screen.getByRole('radio', { name: /Mistake Dump/i }));
    fireEvent.change(screen.getByPlaceholderText(/Dump mistakes from your test/i), {
      target: {
        value: 'Mock #4: forgot i=3 for K2SO4 in Solutions, also confused why benzoic acid dimerizes in benzene 2020 pyq',
      },
    });
    fireEvent.click(screen.getByRole('button', { name: /Log Mistakes with Gemini/i }));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    // Open Study -> Mistakes and verify the captured mistake is grouped under Solutions
    clickTab('Study');
    fireEvent.click(screen.getByRole('tab', { name: /^Mistakes/i }));
    expect(screen.getByText("Forgot Van't Hoff factor for K₂SO₄")).toBeInTheDocument();
    expect(screen.getByText('Mock #4')).toBeInTheDocument();

    // Tap +1 Repeat chip -> increments to 2×
    fireEvent.click(
      screen.getByRole('button', { name: /Log repeat for "Forgot Van't Hoff factor for K₂SO₄"/i })
    );
    expect(screen.getByText('2×')).toBeInTheDocument();

    // Switch to By Chapter summary view and open Chapter Summary sheet
    fireEvent.click(screen.getByRole('tab', { name: /^By Chapter$/i }));
    expect(screen.getByText('Solutions')).toBeInTheDocument();
    expect(screen.getByText('2× total hits')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Solutions/i }));
    const summaryDialog = screen.getByRole('dialog');
    expect(within(summaryDialog).getByText(/Repeated hotspot/i)).toBeInTheDocument();

    // Generate Gemini Revision Summary for Mistakes
    fireEvent.click(within(summaryDialog).getByRole('button', { name: /Generate Summary/i }));
    await waitFor(() => {
      expect(
        within(summaryDialog).getByText(/Electrolyte Van’t Hoff factor/i)
      ).toBeInTheDocument();
    });

    // Switch scope inside Chapter Summary Sheet to Doubts and generate Doubts summary
    fireEvent.click(within(summaryDialog).getByRole('tab', { name: /^Doubts \(1\)$/i }));
    expect(within(summaryDialog).getByText('Abnormal molar mass association case')).toBeInTheDocument();

    fireEvent.click(within(summaryDialog).getByRole('button', { name: /Generate Summary/i }));
    await waitFor(() => {
      expect(within(summaryDialog).getByText(/Dimerization lowers particle count/i)).toBeInTheDocument();
    });
  });

  it('supports custom manual mistake creation, Quick Fill with Gemini, and converting a Doubt into a Mistake', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    mistakes: [
                      {
                        title: 'Sign error in mirror magnification',
                        mistakeText: 'Used +v/u instead of -v/u for spherical mirror',
                        correctionNote: 'Mirror m = -v/u; Lens m = +v/u',
                        mistakeType: 'silly',
                        subjectId: 'physics',
                        chapterId: 'phy-12-ray-optics',
                        sourceLabel: 'PYQ 2019',
                      },
                    ],
                  }),
                },
              ],
            },
          },
        ],
      }),
    } as unknown as Response);

    render(<App />);

    // Add Gemini API key
    clickTab('Settings');
    fireEvent.change(screen.getByLabelText('API Key'), { target: { value: 'AIzaQuickFillKey' } });
    fireEvent.click(screen.getByRole('button', { name: /Save Gemini Settings/i }));

    // Study -> Mistakes -> Log Mistake -> Quick Fill with Gemini
    clickTab('Study');
    fireEvent.click(screen.getByRole('tab', { name: /^Mistakes/i }));
    fireEvent.click(screen.getByRole('button', { name: /Log Mistake/i }));

    const composer = screen.getByRole('dialog');
    fireEvent.click(within(composer).getByRole('button', { name: /Quick Fill with Gemini/i }));
    fireEvent.change(within(composer).getByPlaceholderText(/Paste messy error notes/i), {
      target: { value: 'Used +v/u for mirror magnification in PYQ 2019 Ray Optics' },
    });
    fireEvent.click(within(composer).getByRole('button', { name: /Extract with Gemini/i }));

    await waitFor(() => {
      expect(within(composer).getByLabelText(/Short Title/i)).toHaveValue(
        'Sign error in mirror magnification'
      );
    });

    fireEvent.click(within(composer).getByRole('button', { name: /Save Mistake/i }));
    expect(screen.getByText('Sign error in mirror magnification')).toBeInTheDocument();

    // Now create a Doubt and convert it into a Mistake via 1-tap Log as Mistake
    fireEvent.click(screen.getByRole('tab', { name: /^Doubts/i }));
    fireEvent.click(screen.getByRole('button', { name: /New Doubt/i }));
    const doubtDialog = screen.getByRole('dialog');
    fireEvent.change(within(doubtDialog).getByLabelText(/Short Title/i), {
      target: { value: 'Bryophyte dominant phase confusion' },
    });
    fireEvent.click(within(doubtDialog).getByRole('button', { name: /Save Doubt/i }));

    // Open doubt detail and click Log as Mistake
    fireEvent.click(screen.getByText('Bryophyte dominant phase confusion'));
    const doubtDetail = screen.getByRole('dialog');
    fireEvent.click(within(doubtDetail).getByRole('button', { name: /Log as Mistake/i }));

    const convertedComposer = screen.getByRole('dialog');
    expect(within(convertedComposer).getByText('Log Doubt as Mistake')).toBeInTheDocument();
    expect(within(convertedComposer).getByLabelText(/Short Title/i)).toHaveValue(
      'Bryophyte dominant phase confusion'
    );
    fireEvent.click(within(convertedComposer).getByRole('radio', { name: /NCERT Trap/i }));
    fireEvent.click(within(convertedComposer).getByRole('button', { name: /Save Mistake/i }));

    // Verify converted mistake appears in Study -> Mistakes
    fireEvent.click(screen.getByRole('tab', { name: /^Mistakes/i }));
    expect(screen.getByText('Bryophyte dominant phase confusion')).toBeInTheDocument();
  });

  it('displays chapter shortcuts with singular/plural counts in ChapterDetailSheet and navigates cleanly', () => {
    render(<App />);
    clickTab('Study');

    // Add 1 active mistake in Chemistry -> Solutions
    fireEvent.click(screen.getByRole('tab', { name: /^Mistakes/i }));
    fireEvent.click(screen.getByRole('button', { name: /Log Mistake/i }));
    const composer = screen.getByRole('dialog');
    fireEvent.click(within(composer).getByRole('radio', { name: 'Chemistry' }));
    fireEvent.change(within(composer).getByLabelText(/NCERT Chapter/i), {
      target: { value: 'chem-12-solutions' },
    });
    fireEvent.change(within(composer).getByLabelText(/Short Title/i), {
      target: { value: 'Forgot Van’t Hoff factor' },
    });
    fireEvent.click(within(composer).getByRole('button', { name: /Save Mistake/i }));

    // Go back to Chapters -> Chemistry -> open Solutions detail sheet
    fireEvent.click(screen.getByRole('tab', { name: /^Chapters$/i }));
    fireEvent.click(screen.getByRole('tab', { name: /Chemistry/i }));
    fireEvent.click(screen.getByText('Solutions'));

    const sheet = screen.getByRole('dialog');
    const shortcuts = within(sheet).getByRole('group', { name: /Chapter shortcuts/i });
    expect(within(shortcuts).getByRole('button', { name: /Chapter Summary/i })).toBeInTheDocument();
    expect(within(shortcuts).getByRole('button', { name: /^1 Mistake$/i })).toBeInTheDocument();
    expect(within(shortcuts).getByRole('button', { name: /^Doubts$/i })).toBeInTheDocument();

    // Clicking "1 Mistake" navigates directly to filtered Mistakes sub-tab
    fireEvent.click(within(shortcuts).getByRole('button', { name: /^1 Mistake$/i }));
    expect(screen.getByRole('tab', { name: /^Mistakes/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Forgot Van’t Hoff factor')).toBeInTheDocument();

    // Re-open Solutions detail sheet and open Chapter Summary shortcut
    fireEvent.click(screen.getByRole('tab', { name: /^Chapters$/i }));
    fireEvent.click(screen.getByText('Solutions'));
    const reopenedSheet = screen.getByRole('dialog');
    fireEvent.click(within(reopenedSheet).getByRole('button', { name: /Chapter Summary/i }));

    const summaryDialog = screen.getByRole('dialog');
    expect(within(summaryDialog).getByRole('heading', { name: 'Solutions' })).toBeInTheDocument();
    expect(within(summaryDialog).getByText('Forgot Van’t Hoff factor')).toBeInTheDocument();
  });
});
