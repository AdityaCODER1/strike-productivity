import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { App } from '../App';

function clickTab(name: 'Plan' | 'Today' | 'History' | 'Settings') {
  const nav = screen.getByRole('navigation', { name: /Primary Navigation/i });
  fireEvent.click(within(nav).getByRole('button', { name: new RegExp(`^${name}`, 'i') }));
}

describe('Strike App end-to-end flows', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('captures tasks in Plan, checks off to Today log, and displays Gemini model options in Settings', async () => {
    render(<App />);

    // Navigate to Plan tab
    clickTab('Plan');
    const taskInput = screen.getByPlaceholderText(/Capture a task for today/i);
    fireEvent.change(taskInput, { target: { value: 'Finish iOS dark mode polish' } });
    fireEvent.click(screen.getByLabelText('Add task'));

    expect(screen.getByText('Finish iOS dark mode polish')).toBeInTheDocument();

    // Check off task
    fireEvent.click(screen.getByLabelText('Complete "Finish iOS dark mode polish"'));

    // Switch to Today tab and confirm auto-logged activity
    clickTab('Today');
    expect(screen.getByText('Finish iOS dark mode polish')).toBeInTheDocument();
    expect(screen.getByText('From Plan')).toBeInTheDocument();

    // Switch to Settings tab and verify Gemini model options
    clickTab('Settings');
    const modelSelect = screen.getByLabelText('Model') as HTMLSelectElement;
    expect(modelSelect.value).toBe('gemini-4-hydrogen');

    const optionValues = Array.from(modelSelect.options).map((o) => o.value);
    expect(optionValues).toEqual([
      'gemini-4-hydrogen',
      'gemini-3.5-flash-lite',
      'gemini-3.8-flash',
      'custom',
    ]);

    // Selecting custom reveals custom model input
    fireEvent.change(modelSelect, { target: { value: 'custom' } });
    expect(screen.getByLabelText('Custom Model ID')).toBeInTheDocument();
  });

  it('processes a Gemini brain dump and opens SuggestionsSheet for unfinished tasks', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
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
                        title: 'Completed 5k morning run',
                        category: 'Health',
                        matchedOpenTaskId: null,
                      },
                    ],
                    unfinishedTasks: [
                      {
                        title: 'Pay electric bill',
                        suggestedBucket: 'today',
                        category: 'Home',
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

    // Save a Gemini key in Settings
    clickTab('Settings');
    fireEvent.change(screen.getByLabelText('API Key'), { target: { value: 'AIzaTestKey' } });
    fireEvent.click(screen.getByRole('button', { name: /Save Gemini Settings/i }));

    // Go back to Today and submit brain dump
    clickTab('Today');
    fireEvent.change(screen.getByPlaceholderText(/Dump what you got done today/i), {
      target: { value: 'Did a 5k morning run, still need to pay electric bill tomorrow' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Log with Gemini/i }));

    await waitFor(() => {
      expect(screen.getByText('Completed 5k morning run')).toBeInTheDocument();
    });

    // SuggestionsSheet opens with unfinished task
    expect(screen.getByText('Detected Follow-Ups')).toBeInTheDocument();
    expect(screen.getByText('Pay electric bill')).toBeInTheDocument();

    // 1-tap Accept All adds it to Plan
    fireEvent.click(screen.getByRole('button', { name: /Accept All/i }));

    clickTab('Plan');
    expect(screen.getByText('Pay electric bill')).toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('supports preparing Tomorrow tasks, 1-tap row moves, bulk Today/Tomorrow actions, and badge counts', () => {
    render(<App />);
    clickTab('Plan');

    // Add one task to Today
    fireEvent.change(screen.getByPlaceholderText(/Capture a task for today/i), {
      target: { value: 'Finish lab report' },
    });
    fireEvent.click(screen.getByLabelText('Add task'));

    // Switch quick capture to Tomorrow and add a task
    const bucketTabs = screen.getByRole('tablist', { name: /Target bucket/i });
    fireEvent.click(within(bucketTabs).getByRole('tab', { name: 'Tomorrow' }));
    fireEvent.change(screen.getByPlaceholderText(/Capture a task for tomorrow/i), {
      target: { value: 'Solve Electrostatics PYQs' },
    });
    fireEvent.click(screen.getByLabelText('Add task'));

    // Plan header pill shows both Today and Tmrw counts
    expect(screen.getByText('1 Today · 1 Tmrw')).toBeInTheDocument();

    // Bottom nav badge counts Today only (1, not 2) when switching away from Plan
    clickTab('Today');
    const nav = screen.getByRole('navigation', { name: /Primary Navigation/i });
    const planNavBtn = within(nav).getByRole('button', { name: /^Plan/i });
    expect(within(planNavBtn).getByText('1')).toBeInTheDocument();

    clickTab('Plan');

    // Verify Tomorrow section contains the tomorrow task
    const tomorrowSection = screen.getByRole('heading', { name: /Tomorrow/i }).closest('section')!;
    expect(within(tomorrowSection).getByText('Solve Electrostatics PYQs')).toBeInTheDocument();

    // 1-tap row chip moves Today task to Tomorrow
    fireEvent.click(screen.getByLabelText('Move "Finish lab report" to Tomorrow'));
    expect(within(tomorrowSection).getByText('Finish lab report')).toBeInTheDocument();
    expect(screen.getByText('0 Today · 2 Tmrw')).toBeInTheDocument();

    // Bulk "Move all to Today" moves both Tomorrow tasks into Today
    fireEvent.click(screen.getByRole('button', { name: /Move all to Today/i }));
    const todaySection = screen.getByRole('heading', { name: /^Today$/i }).closest('section')!;
    expect(within(todaySection).getByText('Finish lab report')).toBeInTheDocument();
    expect(within(todaySection).getByText('Solve Electrostatics PYQs')).toBeInTheDocument();
    expect(screen.getByText('2 Today')).toBeInTheDocument();

    // Bulk "Defer all to Tomorrow" sweeps them back to Tomorrow
    fireEvent.click(screen.getByRole('button', { name: /Defer all to Tomorrow/i }));
    expect(within(tomorrowSection).getByText('Finish lab report')).toBeInTheDocument();
    expect(within(tomorrowSection).getByText('Solve Electrostatics PYQs')).toBeInTheDocument();
    expect(screen.getByText('0 Today · 2 Tmrw')).toBeInTheDocument();
  });

  it('routes a Gemini brain dump follow-up suggested for Tomorrow into Plan Tomorrow section', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    completedActivities: [],
                    unfinishedTasks: [
                      {
                        title: 'Revise Organic Chemistry named reactions',
                        suggestedBucket: 'tomorrow',
                        category: 'Learning',
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

    clickTab('Settings');
    fireEvent.change(screen.getByLabelText('API Key'), { target: { value: 'AIzaTestKey' } });
    fireEvent.click(screen.getByRole('button', { name: /Save Gemini Settings/i }));

    clickTab('Today');
    fireEvent.change(screen.getByPlaceholderText(/Dump what you got done today/i), {
      target: { value: 'Need to revise Organic Chemistry named reactions tomorrow' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Log with Gemini/i }));

    await waitFor(() => {
      expect(screen.getByText('Revise Organic Chemistry named reactions')).toBeInTheDocument();
    });

    // SuggestionsSheet renders Today, Tomorrow, and Later choices
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Today' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Tomorrow' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Later' })).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Tomorrow' }));

    clickTab('Plan');
    const tomorrowSection = screen.getByRole('heading', { name: /Tomorrow/i }).closest('section')!;
    expect(
      within(tomorrowSection).getByText('Revise Organic Chemistry named reactions')
    ).toBeInTheDocument();
  });
});
