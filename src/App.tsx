import React, { useMemo, useState } from 'react';
import { ActiveTab } from './types/models';
import { StrikeProvider, useStrike } from './state/StrikeContext';
import { PlanView } from './views/PlanView';
import { TodayView } from './views/TodayView';
import { HistoryView } from './views/HistoryView';
import { SettingsView } from './views/SettingsView';
import { BottomNav } from './components/BottomNav';
import { SuggestionsSheet } from './components/SuggestionsSheet';

const StrikeShell: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('today');
  const { tasks, pendingSuggestions, toast } = useStrike();

  const openTodayCount = useMemo(
    () => tasks.filter((t) => !t.completed && t.bucket === 'today').length,
    [tasks]
  );

  const suggestionsCount =
    (pendingSuggestions?.unfinishedTasks.length ?? 0) +
    (pendingSuggestions?.matchedTasks.length ?? 0);

  return (
    <div className="app-shell">
      {toast && (
        <div className="toast-wrap" role="status" aria-live="polite">
          <div className={`toast-pill toast-pill--${toast.tone}`}>{toast.text}</div>
        </div>
      )}

      <main className="app-main">
        {activeTab === 'plan' && <PlanView />}
        {activeTab === 'today' && <TodayView onOpenSettings={() => setActiveTab('settings')} />}
        {activeTab === 'history' && <HistoryView />}
        {activeTab === 'settings' && <SettingsView />}
      </main>

      <BottomNav
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        openTodayCount={openTodayCount}
        suggestionsCount={suggestionsCount}
      />

      <SuggestionsSheet />
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <StrikeProvider>
      <StrikeShell />
    </StrikeProvider>
  );
};

export default App;
