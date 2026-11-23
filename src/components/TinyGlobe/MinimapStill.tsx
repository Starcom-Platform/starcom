import React from 'react';
import styles from './TinyGlobe.module.css';

/**
 * The mini-globe while it waits to draw (decision D-MG, MG6): its outline breathing, a slow fade in and
 * out, and its meridian turning, so it reads as a planet about to spin rather than a dead one, which is
 * how the owner read the static grid it was. Still with reduced motion.
 */
export const MinimapStill: React.FC<{ color: string; why: string; reducedMotion: boolean; className?: string }> = ({ color, why, reducedMotion, className }) => (
    <svg
        data-testid="tiny-globe-still"
        className={[reducedMotion ? '' : styles.breathing, className ?? ''].filter(Boolean).join(' ')}
        width={110}
        height={110}
        viewBox="0 0 110 110"
        role="img"
        aria-label={why || 'Loading the minimap'}
    >
        <title>{why || 'Loading the minimap'}</title>
        <circle cx="55" cy="55" r="40" fill="none" stroke={color} strokeOpacity="0.6" />
        <ellipse cx="55" cy="55" rx="16" ry="40" fill="none" stroke={color} strokeOpacity="0.35">
            {!reducedMotion && <animate attributeName="rx" values="40;2;40" dur="3s" repeatCount="indefinite" />}
        </ellipse>
        <line x1="15" y1="55" x2="95" y2="55" stroke={color} strokeOpacity="0.35" />
    </svg>
);
