import { useContext } from 'react';
import { EnhancedApplicationRouterContext } from '../context/EnhancedApplicationRouterContext';
import { 
  type EnhancedApplicationRouterContextType 
} from '../components/Router/EnhancedApplicationRouter';

// Hook to use the enhanced router
export const useEnhancedApplicationRouter = (): EnhancedApplicationRouterContextType => {
  const context = useContext(EnhancedApplicationRouterContext);
  if (!context) {
    throw new Error('useEnhancedApplicationRouter must be used within an EnhancedApplicationRouterProvider');
  }
  return context;
};
