import React, {useEffect, useState} from 'react';
import { TiArrowShuffle, TiDeviceDesktop, TiVolumeUp } from 'react-icons/ti';
import styles from './MobileControls.module.css';

type MobileControlsProps = {
  onSwitchVariation: () => void;
  onToggleCrtEffect: () => void;
  onToggleSound: () => void;
}

const MobileControls = ({ onSwitchVariation, onToggleCrtEffect, onToggleSound }: MobileControlsProps) => {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    setIsMobile('ontouchstart' in document.documentElement)
  }, []);

  return isMobile ? (
    <div className={styles.mobileControls}>
      <button onClick={onSwitchVariation}>
        <TiArrowShuffle />
      </button>
      <button onClick={onToggleCrtEffect}>
        <TiDeviceDesktop />
      </button>
      <button onClick={onToggleSound}>
        <TiVolumeUp />
      </button>
    </div>
  ) : null;
};

export default MobileControls;
