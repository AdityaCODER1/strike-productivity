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
});
