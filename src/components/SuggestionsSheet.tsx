import React from 'react';
import { Check, CheckCheck, Clock, Sun, Sunrise, X } from 'lucide-react';
import { useStrike } from '../state/StrikeContext';
import { CategoryBadge } from './CategoryBadge';

export const SuggestionsSheet: React.FC = () => {
  const {
    pendingSuggestions,
    preferences,
    dismissSuggestions,
    acceptSuggestedTask,
    dismissSuggestedTask,
    acceptMatchedTask,
    dismissMatchedTask,
    acceptAllSuggestions,
  } = useStrike();

  if (!pendingSuggestions) return null;

  const { unfinishedTasks, matchedTasks } = pendingSuggestions;
  const totalCount = unfinishedTasks.length + matchedTasks.length;

  return (
    <div
      className="sheet-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="suggestions-sheet-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) dismissSuggestions();
      }}
    >
      <div className="sheet-panel">
        <div className="sheet-handle" aria-hidden="true" />
        <div className="sheet-header">
          <div>
            <h2 id="suggestions-sheet-title" className="sheet-title">
              Detected Follow-Ups
            </h2>
            <p className="field-hint" style={{ margin: '2px 0 0' }}>
              Your completed activities are already saved. Review {totalCount}{' '}
              {totalCount === 1 ? 'suggestion' : 'suggestions'} for Plan.
            </p>
          </div>
          <button
            type="button"
            className="icon-btn"
            aria-label="Close suggestions"
            onClick={dismissSuggestions}
          >
            <X size={20} />
          </button>
        </div>

        {matchedTasks.length > 0 && (
          <div className="stack-sm">
            <span className="ios-group-title" style={{ paddingLeft: 2 }}>
              Open Tasks You Mentioned Finishing
            </span>
            {matchedTasks.map((match) => (
              <div key={match.id} className="suggestion-item">
                <div className="stack-sm" style={{ gap: 4 }}>
                  <div className="log-entry-title">{match.taskTitle}</div>
                  <div className="log-meta-note">Matched log: “{match.activityTitle}”</div>
                </div>
                <div className="suggestion-actions">
                  <button
                    type="button"
                    className="btn btn--primary btn--sm btn--pill"
                    onClick={() => acceptMatchedTask(match.id)}
                  >
                    <Check size={14} />
                    Mark Done
                  </button>
                  <button
                    type="button"
                    className="btn btn--secondary btn--sm btn--pill"
                    onClick={() => dismissMatchedTask(match.id)}
                  >
                    Keep Open
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {unfinishedTasks.length > 0 && (
          <div className="stack-sm">
            <span className="ios-group-title" style={{ paddingLeft: 2 }}>
              Unfinished / Next Up
            </span>
            {unfinishedTasks.map((item) => (
              <div key={item.id} className="suggestion-item">
                <div className="row-between" style={{ alignItems: 'flex-start' }}>
                  <span className="log-entry-title">{item.title}</span>
                  <CategoryBadge name={item.category} categories={preferences.categories} />
                </div>
                <div className="suggestion-actions">
                  <button
                    type="button"
                    className={`btn btn--sm btn--pill ${
                      item.suggestedBucket === 'today' ? 'btn--primary' : 'btn--secondary'
                    }`}
                    onClick={() => acceptSuggestedTask(item.id, 'today')}
                  >
                    <Sun size={14} />
                    Today
                  </button>
                  <button
                    type="button"
                    className={`btn btn--sm btn--pill ${
                      item.suggestedBucket === 'tomorrow' ? 'btn--primary' : 'btn--secondary'
                    }`}
                    onClick={() => acceptSuggestedTask(item.id, 'tomorrow')}
                  >
                    <Sunrise size={14} />
                    Tomorrow
                  </button>
                  <button
                    type="button"
                    className={`btn btn--sm btn--pill ${
                      item.suggestedBucket === 'later' ? 'btn--primary' : 'btn--secondary'
                    }`}
                    onClick={() => acceptSuggestedTask(item.id, 'later')}
                  >
                    <Clock size={14} />
                    Later
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label="Dismiss suggestion"
                    onClick={() => dismissSuggestedTask(item.id)}
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="row-gap" style={{ paddingTop: 4 }}>
          <button
            type="button"
            id="suggestions-accept-all"
            className="btn btn--primary btn--full"
            onClick={acceptAllSuggestions}
          >
            <CheckCheck size={18} />
            Accept All
          </button>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={dismissSuggestions}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
