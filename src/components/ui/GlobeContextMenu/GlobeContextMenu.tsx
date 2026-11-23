/**
 * GlobeContextMenu - Right-click context menu for globe interactions
 * 
 * Provides a comprehensive set of actions that can be performed at any location
 * on the globe, replacing the interfering left-click interaction system.
 */

import React, { useEffect, useRef } from 'react';
import './GlobeContextMenu.css';

export interface GlobeContextActionData {
  geoLocation: { lat: number; lng: number } | null;
  [key: string]: unknown;
}

export interface GlobeContextMenuProps {
  visible: boolean;
  position: { x: number; y: number };
  geoLocation: { lat: number; lng: number } | null;
  onClose: () => void;
  onAction: (action: GlobeContextAction, data?: GlobeContextActionData) => void;
}

export interface GlobeContextAction {
  id: string;
  label: string;
  icon: string;
  category: 'primary' | 'info' | 'tools' | 'collaboration';
  description?: string;
}

const CONTEXT_MENU_ACTIONS: GlobeContextAction[] = [
  // Primary Actions
  {
    id: 'create-intel-report',
    label: 'Create Intel Report',
    icon: '📝',
    category: 'primary',
    description: 'Create a new intelligence report at this location'
  },
  {
    id: 'bookmark-location',
    label: 'Bookmark Location',
    icon: '📌',
    category: 'primary',
    description: 'Save this location for quick access later'
  },
  {
    id: 'view-offline-reports',
    label: 'Offline Reports',
    icon: '📥',
    category: 'primary',
    description: 'View and sync intel reports created without a connected wallet'
  },

  // Information & Analysis
  {
    id: 'location-details',
    label: 'Location Details',
    icon: '🌍',
    category: 'info',
    description: 'View coordinates, hemisphere, and estimated UTC offset'
  },
  {
    id: 'area-statistics',
    label: 'Area Statistics',
    icon: '📊',
    category: 'info',
    description: 'Intel report count and priority breakdown near this location'
  },
  {
    id: 'satellite-view',
    label: 'Satellite View',
    icon: '🛰️',
    category: 'info',
    description: 'Switch to satellite or terrain overlay'
  },
  {
    id: 'historical-data',
    label: 'Historical Data',
    icon: '🗺️',
    category: 'info',
    description: 'Past events and reports in this area'
  },
  
  // Operational Tools
  {
    id: 'measure-distance',
    label: 'Measure Distance',
    icon: '📏',
    category: 'tools',
    description: 'Click another point on the globe to measure the great-circle distance'
  },
  {
    id: 'scan-area',
    label: 'Scan Area',
    icon: '🔍',
    category: 'tools',
    description: 'Perform intelligence scan of surrounding region'
  },
  {
    id: 'signal-analysis',
    label: 'Signal Analysis',
    icon: '📡',
    category: 'tools',
    description: 'Check communication and signal strength'
  },
  {
    id: 'threat-assessment',
    label: 'Threat Assessment',
    icon: '⚠️',
    category: 'tools',
    description: 'Analyze potential threats in area'
  },
  
  // Collaboration
  {
    id: 'share-location',
    label: 'Share Location',
    icon: '👥',
    category: 'collaboration',
    description: 'Share coordinates with team members'
  },
  {
    id: 'report-incident',
    label: 'Report Incident',
    icon: '🚨',
    category: 'collaboration',
    description: 'Quick incident reporting system'
  }
];

export const GlobeContextMenu: React.FC<GlobeContextMenuProps> = ({
  visible,
  position,
  geoLocation,
  onClose,
  onAction
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    if (!visible) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [visible, onClose]);

  // Format coordinates for display
  const formatCoordinates = (lat: number, lng: number): string => {
    const latDir = lat >= 0 ? 'N' : 'S';
    const lngDir = lng >= 0 ? 'E' : 'W';
    return `${Math.abs(lat).toFixed(4)}°${latDir}, ${Math.abs(lng).toFixed(4)}°${lngDir}`;
  };

  // Handle action click
  const handleActionClick = (action: GlobeContextAction) => {
    onAction(action, { geoLocation });
    onClose();
  };

  // Group actions by category
  const actionsByCategory = CONTEXT_MENU_ACTIONS.reduce((acc, action) => {
    if (!acc[action.category]) {
      acc[action.category] = [];
    }
    acc[action.category].push(action);
    return acc;
  }, {} as Record<string, GlobeContextAction[]>);

  const categoryLabels = {
    primary: 'Primary Actions',
    info: 'Information & Analysis',
    tools: 'Operational Tools',
    collaboration: 'Collaboration'
  };

  // Calculate optimal menu position to avoid viewport edges
  const calculateMenuPosition = (mouseX: number, mouseY: number) => {
    const menuWidth = 220; // Compact menu width
    const menuHeight = 280; // Estimated menu height
    const padding = 10; // Distance from viewport edge
    
    let x = mouseX;
    let y = mouseY;
    const edgeClasses: string[] = [];
    
    // Adjust if menu would go off right edge
    if (mouseX + menuWidth + padding > window.innerWidth) {
      x = mouseX - menuWidth;
      edgeClasses.push('globe-context-menu--edge-right');
    }
    
    // Adjust if menu would go off bottom edge
    if (mouseY + menuHeight + padding > window.innerHeight) {
      y = mouseY - menuHeight;
      edgeClasses.push('globe-context-menu--edge-bottom');
    }
    
    // Ensure menu doesn't go off left or top edge
    x = Math.max(padding, x);
    y = Math.max(padding, y);
    
    return { x, y, edgeClasses: edgeClasses.join(' ') };
  };

  const menuPosition = calculateMenuPosition(position.x, position.y);

  if (!visible) return null;

  return (
    <div
      ref={menuRef}
      className={`globe-context-menu ${menuPosition.edgeClasses}`}
      style={{
        left: menuPosition.x,
        top: menuPosition.y
      }}
    >
      {/* Header with coordinates */}
      <div className="globe-context-menu__header">
        <div className="globe-context-menu__title">Location Actions</div>
        {geoLocation && (
          <div className="globe-context-menu__coordinates">
            {formatCoordinates(geoLocation.lat, geoLocation.lng)}
          </div>
        )}
      </div>

      {/* Action categories */}
      <div className="globe-context-menu__content">
        {Object.entries(actionsByCategory).map(([category, actions]) => (
          <div key={category} className="globe-context-menu__category">
            <div className="globe-context-menu__category-label">
              {categoryLabels[category as keyof typeof categoryLabels]}
            </div>
            <div className="globe-context-menu__actions">
              {actions.map((action) => (
                <button
                  key={action.id}
                  className="globe-context-menu__action"
                  onClick={() => handleActionClick(action)}
                  title={action.description}
                >
                  <span className="globe-context-menu__action-icon">
                    {action.icon}
                  </span>
                  <span className="globe-context-menu__action-label">
                    {action.label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Quick actions footer */}
      <div className="globe-context-menu__footer">
        <button
          className="globe-context-menu__quick-action globe-context-menu__quick-action--primary"
          onClick={() => handleActionClick(CONTEXT_MENU_ACTIONS[0])} // Create Intel Report
        >
          {CONTEXT_MENU_ACTIONS[0].icon} Quick Report
        </button>
        <button
          className="globe-context-menu__quick-action"
          onClick={onClose}
        >
          Cancel
        </button>
      </div>
    </div>
  );
};

export default GlobeContextMenu;
