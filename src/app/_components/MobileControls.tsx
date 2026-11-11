import { useContext, useEffect, useState } from "react";
import {
	MdDesktopAccessDisabled,
	MdOutlineDesktopWindows,
	MdVolumeOff,
	MdVolumeUp,
} from "react-icons/md";
import { TiArrowShuffle } from "react-icons/ti";
import { StateContext } from "@/app/_components/StateContext";
import styles from "./MobileControls.module.css";

type MobileControlsProps = {
	onSwitchVariation: () => void;
};

const MobileControls = ({ onSwitchVariation }: MobileControlsProps) => {
	const { crt, toggleCrt, sound, toggleSound } = useContext(StateContext);
	const [isMobile, setIsMobile] = useState(false);
	useEffect(() => {
		setIsMobile("ontouchstart" in document.documentElement);
	}, []);

	return isMobile ? (
		<div className={styles.mobileControls}>
			<button onClick={onSwitchVariation}>
				<TiArrowShuffle />
			</button>
			<button onClick={toggleCrt}>
				{crt ? <MdDesktopAccessDisabled /> : <MdOutlineDesktopWindows />}
			</button>
			<button onClick={toggleSound}>
				{sound ? <MdVolumeOff /> : <MdVolumeUp />}
			</button>
		</div>
	) : null;
};

export default MobileControls;
