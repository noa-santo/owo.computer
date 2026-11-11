import React, {useContext, useEffect, useState} from 'react';
import { TiArrowShuffle, TiDeviceDesktop, TiVolumeUp } from 'react-icons/ti';
import styles from './MobileControls.module.css';
import {StateContext} from "@/app/_components/StateContext";

type MobileControlsProps = {
  onSwitchVariation: () => void;
}

const MobileControls = ({ onSwitchVariation }: MobileControlsProps) => {
  const {toggleCrt, toggleSound} = useContext(StateContext);
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    setIsMobile('ontouchstart' in document.documentElement)
  }, []);

  return isMobile ? (
    <div className={styles.mobileControls}>
      <button onClick={onSwitchVariation}>
        <TiArrowShuffle />
      </button>
      <button onClick={toggleCrt}>
        <TiDeviceDesktop />
      </button>
      <button onClick={toggleSound}>
        <TiVolumeUp />
      </button>
    </div>
  ) : null;
};

export default MobileControls;
