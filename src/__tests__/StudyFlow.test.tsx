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
});
