'use client';

import { useEffect, useState } from 'react';

/** Segundos que faltan para `target` (epoch ms), actualizado cada medio segundo. 0 cuando ya pasó o no hay objetivo. */
export function useCountdown(target: number | null): number {
  const calc = () => (target ? Math.max(0, Math.ceil((target - Date.now()) / 1000)) : 0);
  const [seconds, setSeconds] = useState(calc);
  useEffect(() => {
    setSeconds(calc());
    if (!target) return;
    const id = setInterval(() => {
      const left = calc();
      setSeconds(left);
      if (left === 0) clearInterval(id);
    }, 500);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);
  return seconds;
}
