import "./CRTEffect.css";

const CRTEffect = () => {
	return (
		<>
			<style>
				{`
body > main > span {
  animation: vibrate 0.1s infinite, chromatic-text 24s infinite;
  filter: drop-shadow(0 0 4px rgba(255, 255, 255, 0.5));
}

body > main > div > button {
  animation: chromatic-svg 24s infinite;
  filter: drop-shadow(0 0 4px rgba(255, 255, 255, 0.8));
  transform-style: preserve-3d;
  background: none !important;
  margin: 0 2.4rem !important;
  color: inherit;
}

body > main > div {
  height: 100%;
  width: 100%;
  display: flex;
  bottom: 0;
  transform: none;
  background: none !important;
  justify-content: center;
  align-items: flex-end;
  perspective: 75px;
  perspective-origin: 50% 100%;
  padding-bottom: 1.4rem !important;
  font-size: 1.3rem;
  button:nth-child(1) {
    transform: rotateX(-20deg) rotateY(8deg) translateZ(-10px) scale(1.15);
  }
  button:nth-child(2) {
    transform: rotateX(-24deg) translateZ(-4px) scale(1.2);
  }
  button:nth-child(3) {
    transform: rotateX(-20deg) rotateY(-8deg) translateZ(-10px) scale(1.15);
  }
}
        `}
			</style>
			<div className="crt-overlay">
				<div className="crt-scanlines"></div>
				<div className="crt-static-lines"></div>
				<div className="crt-curvature"></div>
				<div className="crt-flicker"></div>
				<div className="crt-noise"></div>
				<div className="crt-curvature-cover"></div>
			</div>
		</>
	);
};

export default CRTEffect;
