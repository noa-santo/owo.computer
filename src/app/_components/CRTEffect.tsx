import React from 'react';
import './CRTEffect.css';

const CRTEffect = () => {
  return (
    <>
      <style>
        {`
        body > main > * {
          animation: vibrate 0.1s infinite, chromatic 24s infinite;
          filter: drop-shadow(0 0 4px rgba(255, 255, 255, 0.5));
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
