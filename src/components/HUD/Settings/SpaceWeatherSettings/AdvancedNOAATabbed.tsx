import React, { useState } from 'react';
import { useEcoNaturalSettings } from '../../../../hooks/useEcoNaturalSettings';
import { useSpaceWeatherContext } from '../../../../context/SpaceWeatherContext';
import styles from './AdvancedNOAATabbed.module.css';
import Modal from '../../../Shared/Modal';

interface AdvancedNOAATabbedProps {
  onClose: () => void;
}

// NOAA dataset definitions organized by category
const NOAA_DATASETS = {
  solar: [
    { id: 'solarWind', label: 'Solar Wind', icon: '☄️' },
    { id: 'solarFlares', label: 'Solar Flares', icon: '🔥' },
    { id: 'coronalMass', label: 'CME', icon: '💫' },
    { id: 'solarRadio', label: 'Radio Flux', icon: '📡' },
    { id: 'magnetopause', label: 'Magnetopause', icon: '🛡️' },
    { id: 'bowShock', label: 'Bow Shock', icon: '⚡' },
    { id: 'plasmoidEvents', label: 'Plasmoids', icon: '🔮' },
    { id: 'energeticParticles', label: 'Particles', icon: '⚛️' },
    { id: 'interplanetaryField', label: 'IMF', icon: '🌐' },
    { id: 'solarProtonEvents', label: 'Protons', icon: '🔴' }
  ],
  geomagnetic: [
    { id: 'electricFields', label: 'E-Fields', icon: '⚡' },
    { id: 'magneticFields', label: 'B-Fields', icon: '🧲' },
    { id: 'geomagneticIndex', label: 'Dst Index', icon: '📊' },
    { id: 'auroralOval', label: 'Aurora', icon: '🌈' },
    { id: 'kpIndex', label: 'Kp Index', icon: '📈' },
    { id: 'magnetospheric', label: 'Magnetosphere', icon: '🛡️' },
    { id: 'substorms', label: 'Substorms', icon: '⚡' },
    { id: 'fieldLineResonance', label: 'FLR', icon: '〰️' },
    { id: 'plasmaBoundary', label: 'Plasma Boundary', icon: '🔵' },
    { id: 'ionosphericCurrent', label: 'Currents', icon: '💫' }
  ],
  radiation: [
    { id: 'cosmicRays', label: 'Cosmic Rays', icon: '☄️' },
    { id: 'solarRadiation', label: 'Solar Radiation', icon: '☀️' },
    { id: 'radiationBelts', label: 'Van Allen', icon: '🔴' },
    { id: 'neutronMonitors', label: 'Neutrons', icon: '⚛️' },
    { id: 'xrayFlux', label: 'X-Ray', icon: '💥' },
    { id: 'uvRadiation', label: 'UV', icon: '🌞' },
    { id: 'electronFlux', label: 'Electrons', icon: '⚡' },
    { id: 'protonFlux', label: 'Protons', icon: '🔴' },
    { id: 'heavyIons', label: 'Heavy Ions', icon: '💎' },
    { id: 'radioBlackouts', label: 'Blackouts', icon: '📵' }
  ]
};

const AdvancedNOAATabbed: React.FC<AdvancedNOAATabbedProps> = ({ onClose }) => {
  const { config, updateSpaceWeather } = useEcoNaturalSettings();
  const { refresh, isLoading } = useSpaceWeatherContext();
  const [activeTab, setActiveTab] = useState<'solar' | 'geomagnetic' | 'radiation'>('solar');
  const [searchTerm, setSearchTerm] = useState('');

  // Filter datasets based on search term
  const filteredDatasets = NOAA_DATASETS[activeTab].filter(dataset =>
    dataset.label.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Get current state for dataset
  const isDatasetEnabled = (datasetId: string): boolean => {
    // Map dataset IDs to actual config properties
    const mapping: Record<string, keyof typeof config.spaceWeather> = {
      electricFields: 'showElectricFields',
      magneticFields: 'showMagneticField',
  geomagneticIndex: 'showGeomagneticIndex',
      auroralOval: 'showAuroralOval',
      kpIndex: 'showKpIndex',
      solarWind: 'showSolarWind',
      magnetopause: 'showMagnetopause',
      // Add more mappings as needed
    };
    
    const configKey = mapping[datasetId];
    return configKey ? Boolean(config.spaceWeather[configKey]) : false;
  };

  // Toggle dataset
  const toggleDataset = (datasetId: string) => {
    const mapping: Record<string, Partial<typeof config.spaceWeather>> = {
      electricFields: { showElectricFields: !config.spaceWeather.showElectricFields },
      magneticFields: { showMagneticField: !config.spaceWeather.showMagneticField },
  geomagneticIndex: { showGeomagneticIndex: !config.spaceWeather.showGeomagneticIndex },
      auroralOval: { showAuroralOval: !config.spaceWeather.showAuroralOval },
      kpIndex: { showKpIndex: !config.spaceWeather.showKpIndex },
      solarWind: { showSolarWind: !config.spaceWeather.showSolarWind },
      magnetopause: { showMagnetopause: !config.spaceWeather.showMagnetopause },
      // Add more mappings as needed
    };
    
    const update = mapping[datasetId];
    if (update) {
      updateSpaceWeather(update);
    }
  };

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      ariaLabel="NOAA datasets"
      className={styles.popup}
      // Not dismissOnBackdrop: this panel keeps its own inner backdrop div,
      // which covers Modal's element entirely, so the click never reaches it.
    >
      <div className={styles.backdrop} onClick={onClose} />
      <div className={styles.container}>
        {/* Header */}
        <div className={styles.header}>
          <h3 className={styles.title}>NOAA Datasets</h3>
          <button className={styles.closeButton} onClick={onClose}>×</button>
        </div>

        {/* Tab Navigation */}
        <div className={styles.tabNav}>
          {(['solar', 'geomagnetic', 'radiation'] as const).map(tab => (
            <button
              key={tab}
              className={`${styles.tab} ${activeTab === tab ? styles.activeTab : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab === 'solar' && '☀️'}
              {tab === 'geomagnetic' && '🧲'}
              {tab === 'radiation' && '☢️'}
              <span className={styles.tabLabel}>
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </span>
            </button>
          ))}
        </div>

        {/* Search */}
        <div className={styles.searchSection}>
          <input
            type="text"
            placeholder="Search datasets..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={styles.searchInput}
          />
        </div>

        {/* Dataset List */}
        <div className={styles.datasetList}>
          {filteredDatasets.map(dataset => (
            <label key={dataset.id} className={styles.datasetItem}>
              <input
                type="checkbox"
                checked={isDatasetEnabled(dataset.id)}
                onChange={() => toggleDataset(dataset.id)}
                className={styles.checkbox}
              />
              <span className={styles.datasetIcon}>{dataset.icon}</span>
              <span className={styles.datasetLabel}>{dataset.label}</span>
            </label>
          ))}
        </div>

        {/* Actions */}
        <div className={styles.actions}>
          <button
            className={styles.refreshButton}
            onClick={refresh}
            disabled={isLoading}
          >
            🔄 Refresh
          </button>
          <button className={styles.applyButton} onClick={onClose}>
            Apply
          </button>
        </div>
      </div>
        </Modal>
  );
};

export default AdvancedNOAATabbed;
