import React from 'react';
import { CalendarDays, CheckCircle2, Settings, Sparkles } from 'lucide-react';
import { ActiveTab } from '../types/models';

interface BottomNavProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  openTodayCount: number;
  suggestionsCount: number;
}

const NAV_ITEMS: Array<{
  id: ActiveTab;
  label: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
}> = [
  { id: 'plan', label: 'Plan', icon: CheckCircle2 },
  { id: 'today', label: 'Today', icon: Sparkles },
  { id: 'history', label: 'History', icon: CalendarDays },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export const BottomNav: React.FC<BottomNavProps> = ({
  activeTab,
  onSelectTab,
  openTodayCount,
  suggestionsCount,
}) => {
  return (
    <div className="bottom-nav-wrap">
      <nav className="bottom-nav" aria-label="Primary Navigation">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          const badge =
            item.id === 'today' && suggestionsCount > 0
              ? suggestionsCount
              : item.id === 'plan' && openTodayCount > 0 && !isActive
              ? openTodayCount
              : 0;

          return (
            <button
              key={item.id}
              id={`nav-tab-${item.id}`}
              type="button"
              className={`bottom-nav-item ${isActive ? 'bottom-nav-item--active' : ''}`}
              aria-current={isActive ? 'page' : undefined}
              onClick={() => onSelectTab(item.id)}
            >
              <Icon size={22} strokeWidth={isActive ? 2.25 : 1.85} />
              <span>{item.label}</span>
              {badge > 0 && (
                <span className="nav-badge" aria-label={`${badge} pending`}>
                  {badge > 9 ? '9+' : badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
};
