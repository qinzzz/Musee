import { useEffect, useRef, useState } from 'react';

export function useEmailCooldown() {
  const until = useRef(0);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  function start(seconds: number) {
    until.current = Date.now() + seconds * 1000;
    setRemainingSeconds(Math.ceil(seconds));
  }
  const active = remainingSeconds > 0;
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => {
      setRemainingSeconds(Math.max(0, Math.ceil((until.current - Date.now()) / 1000)));
    }, 1000);
    return () => clearInterval(timer);
  }, [active]);
  return { start, remainingSeconds, isActive: () => Date.now() < until.current };
}
