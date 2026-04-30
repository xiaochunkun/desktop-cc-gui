import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { REASONING_LEVELS, type ProviderId, type ReasoningEffort } from '../types';

interface ReasoningSelectProps {
  value: ReasoningEffort;
  onChange: (effort: ReasoningEffort) => void;
  disabled?: boolean;
  /** Filter levels by provider availability. Falls back to all levels when omitted. */
  providerId?: ProviderId;
}

/**
 * ReasoningSelect - Reasoning Effort Selector (Codex + Claude)
 * Levels are filtered by provider availability (see REASONING_LEVELS.availableFor).
 */
export const ReasoningSelect = ({ value, onChange, disabled, providerId }: ReasoningSelectProps) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const visibleLevels = useMemo(
    () =>
      providerId
        ? REASONING_LEVELS.filter(level => level.availableFor.includes(providerId))
        : REASONING_LEVELS,
    [providerId],
  );

  const fallbackLevel = visibleLevels[1] ?? visibleLevels[0] ?? REASONING_LEVELS[1] ?? REASONING_LEVELS[0] ?? {
    id: 'medium' as ReasoningEffort,
    label: 'Medium',
    icon: 'codicon-circle-filled',
    description: 'Balanced thinking (default)',
    availableFor: ['claude', 'codex'] as ProviderId[],
  };

  const currentLevel =
    visibleLevels.find(l => l.id === value) ??
    visibleLevels[2] ??
    fallbackLevel;

  /**
   * Get translated text for reasoning level
   */
  const getReasoningText = (levelId: ReasoningEffort, field: 'label' | 'description') => {
    const key = `reasoning.${levelId}.${field}`;
    const fallback = REASONING_LEVELS.find(l => l.id === levelId)?.[field] || levelId;
    return t(key, { defaultValue: fallback });
  };

  /**
   * Toggle dropdown
   */
  const handleToggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled) return;
    setIsOpen(!isOpen);
  }, [isOpen, disabled]);

  /**
   * Select reasoning level
   */
  const handleSelect = useCallback((effort: ReasoningEffort) => {
    onChange(effort);
    setIsOpen(false);
  }, [onChange]);

  /**
   * Close on outside click
   */
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        ref={buttonRef}
        className="selector-button"
        onClick={handleToggle}
        disabled={disabled}
        title={t('reasoning.title', { defaultValue: 'Select reasoning depth' })}
      >
        <span className="codicon codicon-lightbulb" />
        <span className="selector-button-text">{getReasoningText(currentLevel.id, 'label')}</span>
        <span className={`codicon codicon-chevron-${isOpen ? 'up' : 'down'}`} style={{ fontSize: '10px', marginLeft: '2px' }} />
      </button>

      {isOpen && (
        <div
          ref={dropdownRef}
          className="selector-dropdown"
          style={{
            position: 'absolute',
            bottom: '100%',
            left: 0,
            marginBottom: '4px',
            zIndex: 10000,
          }}
        >
          {visibleLevels.map((level) => (
            <div
              key={level.id}
              className={`selector-option ${level.id === value ? 'selected' : ''}`}
              onClick={() => handleSelect(level.id)}
              title={getReasoningText(level.id, 'description')}
            >
              <span className={`codicon ${level.icon}`} />
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                <span>{getReasoningText(level.id, 'label')}</span>
                <span className="mode-description">{getReasoningText(level.id, 'description')}</span>
              </div>
              {level.id === value && (
                <span className="codicon codicon-check check-mark" />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ReasoningSelect;
