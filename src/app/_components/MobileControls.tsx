import React, {useContext, useEffect, useState} from 'react';
import { TiArrowShuffle } from 'react-icons/ti';
import { MdDesktopAccessDisabled, MdOutlineDesktopWindows, MdVolumeUp, MdVolumeOff } from "react-icons/md";
import styles from './MobileControls.module.css';
import {StateContext} from "@/app/_components/StateContext";

type MobileControlsProps = {
  onSwitchVariation: () => void;
}

const MobileControls = ({ onSwitchVariation }: MobileControlsProps) => {
  const {crt, toggleCrt, sound, toggleSound} = useContext(StateContext);
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
        {crt ? <MdDesktopAccessDisabled/> : <MdOutlineDesktopWindows />}
      </button>
      <button onClick={toggleSound}>
        {sound ? <MdVolumeOff/> : <MdVolumeUp />}
      </button>
    </div>
  ) : null;
};

export default MobileControls;
