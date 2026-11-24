// EnhancedSettingsPopup.tsx
// Phase 3: Multi-tab interface with rich controls and drag-and-drop functionality
import React, { useRef, useEffect, useState, useCallback, useImperativeHandle, forwardRef } from 'react';
import FocusTrap from 'focus-trap-react';
import { TopBarCategory, CATEGORY_GROUPS } from './topbarCategories';
import { MarqueeDataPoint } from './interfaces';
import CategoriesTab from './SettingsTabs/CategoriesTab';
import DisplayTab from './SettingsTabs/DisplayTab';
import DataTab from './SettingsTabs/DataTab';
import AdvancedTab from './SettingsTabs/AdvancedTab';
import KeysTab from './SettingsTabs/KeysTab';
import styles from './EnhancedSettingsPopup.module.css';
import { createLogger } from '@utils/logger';
import { useScrollLock } from '../../../Popup/modalBehavior';
const log = createLogger({ prefix: 'EnhancedSettingsPopup' });

export interface EnhancedSettingsPopupRef {
  navigateToDataPoint: (dataPointId: string) => void;
}

export interface EnhancedSettingsPopupProps {
  open: boolean;
  enabledCategories: Record<string, boolean>;
  onCategoryToggle: (id: string, enabled: boolean) => void;
  onClose: () => void;
  categories: TopBarCategory[];
  currentDataPoints: MarqueeDataPoint[];
  onReorderCategories?: (newOrder: string[]) => void;
  onPreviewSettings?: (settings: EnhancedSettings) => void;
  /**
   * The card to open highlighted — the one the person clicked.
   *
   * The highlight was already plumbed from here through CategoriesTab to
   * DataPointList, and nothing ever set it: the only writer was an imperative
   * `navigateToDataPoint` on a ref no caller passes. Meanwhile the top bar
   * spread `activeTab: 'data'` onto this component, which is not a prop of it
   * and was silently dropped — and would have opened the wrong tab anyway,
   * since the cards live on the default one.
   */
  initialHighlightedDataPoint?: string | null;
}

// Tab definitions for the enhanced popup
type TabId = 'categories' | 'display' | 'data' | 'advanced' | 'keys';

/*
 * The no-data and EIA helpers are in SettingsTabs/DataPointList.tsx, which
 * renders the cards. A second copy lived here, called by nothing — the same
 * shape as the dead renderCategoriesTab that a fix was once applied to while
 * the live card went unchanged. Removed rather than kept in step.
 */

interface Tab {
  id: TabId;
  label: string;
  icon: string;
  description: string;
}

const TABS: Tab[] = [
  {
    id: 'categories',
    label: 'Categories',
    icon: '📊',
    description: 'Select and organize data categories'
  },
  {
    id: 'display', 
    label: 'Display',
    icon: '🎨',
    description: 'Appearance and animation settings'
  },
  {
    id: 'data',
    label: 'Data',
    icon: '🔄',
    description: 'Update frequency and sources'
  },
  {
    id: 'advanced',
    label: 'Advanced',
    icon: '⚙️',
    description: 'Performance and accessibility'
  },
  {
    id: 'keys',
    label: 'Keys',
    icon: '🔑',
    description: 'API keys of your own'
  }
];

// Enhanced settings state interface
export interface EnhancedSettings {
  // Display settings
  animationSpeed: number;
  showIcons: boolean;
  colorScheme: 'default' | 'high-contrast';
  compactMode: boolean;
  
  // Data settings
  updateFrequency: number;
  maxDataPoints: number;
  enableRealTime: boolean;
  prioritizeCritical: boolean;
  
  // Advanced settings
  enableDrag: boolean;
  momentumPhysics: boolean;
  accessibilityMode: boolean;
  performanceMode: boolean;
}

const DEFAULT_ENHANCED_SETTINGS: EnhancedSettings = {
  animationSpeed: 1.0,
  showIcons: true,
  colorScheme: 'default',
  compactMode: false,
  updateFrequency: 5000,
  maxDataPoints: 10,
  enableRealTime: true,
  prioritizeCritical: true,
  enableDrag: true,
  momentumPhysics: true,
  accessibilityMode: false,
  performanceMode: false,
};

const EnhancedSettingsPopup = forwardRef<EnhancedSettingsPopupRef, EnhancedSettingsPopupProps>(({
  open,
  enabledCategories,
  onCategoryToggle,
  onClose,
  categories,
  currentDataPoints,
  onReorderCategories,
  initialHighlightedDataPoint = null,
  onPreviewSettings,
}, ref) => {
  const modalRef = useRef<HTMLDivElement>(null);

  // This dialog already announces itself and traps focus with focus-trap-react,
  // which is a real library and the right answer. What it lacked was the page
  // behind it holding still.
  useScrollLock(true);
  
  // Tab and settings state
  const [activeTab, setActiveTab] = useState<TabId>('categories');
  const [enhancedSettings, setEnhancedSettings] = useState<EnhancedSettings>(DEFAULT_ENHANCED_SETTINGS);
  const [previewMode, setPreviewMode] = useState(false);
  const [draggedCategory, setDraggedCategory] = useState<string | null>(null);
  const [highlightedDataPoint, setHighlightedDataPoint] = useState<string | null>(initialHighlightedDataPoint);

  // Expose navigation method to parent
  useImperativeHandle(ref, () => ({
    navigateToDataPoint: (dataPointId: string) => {
      // Navigate to the categories tab where data points are managed
      setActiveTab('categories');
      // Highlight the specific data point
      setHighlightedDataPoint(dataPointId);
      // Auto-scroll to the data point if needed
      setTimeout(() => {
        const element = document.getElementById(`datapoint-${dataPointId}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
    }
  }), []);

  // Handle settings changes with live preview
  const handleSettingChange = useCallback(<K extends keyof EnhancedSettings>(
    key: K,
    value: EnhancedSettings[K]
  ) => {
    const newSettings = { ...enhancedSettings, [key]: value };
    setEnhancedSettings(newSettings);
    
    if (previewMode && onPreviewSettings) {
      onPreviewSettings(newSettings);
    }
  }, [enhancedSettings, previewMode, onPreviewSettings]);

  // Toggle preview mode
  const togglePreview = useCallback(() => {
    setPreviewMode(prev => !prev);
    if (!previewMode && onPreviewSettings) {
      onPreviewSettings(enhancedSettings);
    }
  }, [previewMode, enhancedSettings, onPreviewSettings]);

  /*
   * Three drag handlers stood here — handleDragStart, handleDragOver and
   * handleDrop — complete, and attached to nothing. The working drag-to-reorder
   * lives two levels down in SettingsTabs/CategoryList.tsx, which is
   * `draggable`, carries all four handlers, and calls onReorderCategories
   * itself; the UI above it says "Drag to reorder" and it does.
   *
   * These were the version from before that move. They were nearly wired back
   * in by mistake on 2026-09-21: a triage that read only this file called the
   * feature unfinished, when attaching them would have added a second drag
   * implementation competing with the one that works. The lifted
   * `draggedCategory` state stays — CategoryList receives and uses it.
   */

  /**
   * Two large render functions used to sit here — renderCategoriesTab and
   * renderDisplayTab, about 180 lines — and neither was ever called. They
   * survived because of the line that followed them:
   *
   *     // Debug: Reference unused render functions to suppress lint warnings
   *     log.debug('Render functions available:', { renderCategoriesTab, ... })
   *
   * a statement whose only purpose was to stop tooling reporting them as
   * unused. The tabs are really rendered by ./SettingsTabs/*, and I found this
   * by patching the dead copy and watching the test read the live one.
   *
   * Deleted rather than wired up: the live components are the ones with the
   * behaviour, and a second, silently divergent copy of a UI is a trap for
   * whoever edits the wrong one next — which is exactly what happened here.
   */

  // Close on ESC or outside click
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab') {
        // Cycle through tabs with Ctrl+Tab
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          const currentIndex = TABS.findIndex(tab => tab.id === activeTab);
          const nextIndex = (currentIndex + 1) % TABS.length;
          setActiveTab(TABS[nextIndex].id);
        }
      }
    }
    function handleClick(e: MouseEvent) {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('keydown', handleKey);
    document.addEventListener('mousedown', handleClick);
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.removeEventListener('mousedown', handleClick);
    };
  }, [open, onClose, activeTab]);

  if (!open) return null;

  return (
    <FocusTrap>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="enhanced-settings-title"
        className={styles.enhancedSettingsOverlay}
        onClick={(e) => {
          // Close on overlay click (background)
          if (e.target === e.currentTarget) {
            onClose();
          }
        }}
      >
        <div
          ref={modalRef}
          className={styles.enhancedSettingsModal}
          onClick={(e) => {
            // Prevent modal content clicks from bubbling to overlay
            e.stopPropagation();
          }}
        >
          {/* Header with title and preview toggle */}
          <div className={styles.modalHeader}>
            <h2 id="enhanced-settings-title" className={styles.modalTitle}>
              🎛️ Marquee Settings
            </h2>
            <div className={styles.headerControls}>
              <button
                onClick={togglePreview}
                className={`${styles.previewButton} ${previewMode ? styles.active : ''}`}
                aria-pressed={previewMode}
                title="Toggle live preview"
              >
                👁️ {previewMode ? 'Previewing' : 'Preview'}
              </button>
              <button
                onClick={onClose}
                className={styles.closeButton}
                aria-label="Close settings"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Tab Navigation */}
          <div className={styles.tabNavigation} role="tablist">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                role="tab"
                aria-selected={activeTab === tab.id}
                aria-controls={`panel-${tab.id}`}
                id={`tab-${tab.id}`}
                className={`${styles.tab} ${activeTab === tab.id ? styles.activeTab : ''}`}
                onClick={() => setActiveTab(tab.id)}
                title={tab.description}
              >
                <span className={styles.tabIcon}>{tab.icon}</span>
                <span className={styles.tabLabel}>{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className={styles.tabContent}>
            {activeTab === 'categories' && (
              <div
                role="tabpanel"
                id="panel-categories"
                aria-labelledby="tab-categories"
                className={styles.tabPanel}
              >
                <CategoriesTab
                  categories={categories}
                  enabledCategories={enabledCategories}
                  currentDataPoints={currentDataPoints}
                  onCategoryToggle={onCategoryToggle}
                  onReorderCategories={onReorderCategories}
                  highlightedDataPoint={highlightedDataPoint}
                  draggedCategory={draggedCategory}
                  setDraggedCategory={setDraggedCategory}
                />
              </div>
            )}

            {activeTab === 'display' && (
              <div
                role="tabpanel"
                id="panel-display"
                aria-labelledby="tab-display"
                className={styles.tabPanel}
              >
                <DisplayTab
                  settings={enhancedSettings}
                  onSettingChange={handleSettingChange}
                  previewMode={previewMode}
                />
              </div>
            )}

            {activeTab === 'data' && (
              <div
                role="tabpanel"
                id="panel-data"
                aria-labelledby="tab-data"
                className={styles.tabPanel}
              >
                <DataTab
                  settings={enhancedSettings}
                  onSettingChange={handleSettingChange}
                  previewMode={previewMode}
                />
              </div>
            )}

            {activeTab === 'advanced' && (
              <div
                role="tabpanel"
                id="panel-advanced"
                aria-labelledby="tab-advanced"
                className={styles.tabPanel}
              >
                <AdvancedTab
                  settings={enhancedSettings}
                  onSettingChange={handleSettingChange}
                  previewMode={previewMode}
                />
              </div>
            )}

            {activeTab === 'keys' && (
              <div
                role="tabpanel"
                id="panel-keys"
                aria-labelledby="tab-keys"
                className={styles.tabPanel}
              >
                <KeysTab />
              </div>
            )}
          </div>

          {/* Footer with action buttons */}
          <div className={styles.modalFooter}>
            <div className={styles.footerInfo}>
              {previewMode && (
                <span className={styles.previewIndicator}>
                  🔄 Live preview active
                </span>
              )}
            </div>
            <div className={styles.footerActions}>
              <button
                onClick={() => setEnhancedSettings(DEFAULT_ENHANCED_SETTINGS)}
                className={styles.resetButton}
              >
                🔄 Reset to Defaults
              </button>
              <button
                onClick={onClose}
                className={styles.applyButton}
              >
                ✅ Apply Settings
              </button>
            </div>
          </div>
        </div>
      </div>
    </FocusTrap>
  );
});

EnhancedSettingsPopup.displayName = 'EnhancedSettingsPopup';

export default EnhancedSettingsPopup;
