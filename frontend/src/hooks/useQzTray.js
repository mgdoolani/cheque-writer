/**
 * React state around the QZ Tray agent.
 *
 * Probing is opt-in per screen and never blocks rendering. QZ Tray is the only
 * print mechanism, so a machine without it reports unavailable and the UI
 * blocks printing with an explanation rather than silently doing something
 * else.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { probe, listPrinters, isConnected, networkInfo } from '../lib/qzTray.js';

export default function useQzTray({ auto = true } = {}) {
  const [status, setStatus] = useState('idle'); // idle | checking | ready | unavailable
  const [printers, setPrinters] = useState([]);
  const [reason, setReason] = useState(null);
  const [network, setNetwork] = useState(null);
  const alive = useRef(true);

  useEffect(() => () => { alive.current = false; }, []);

  const check = useCallback(async () => {
    setStatus('checking');
    const result = await probe();
    if (!alive.current) return false;

    if (!result.available) {
      setStatus('unavailable');
      setReason(result.reason);
      setPrinters([]);
      return false;
    }

    setStatus('ready');
    setReason(null);
    try {
      const found = await listPrinters();
      if (alive.current) setPrinters(found);
    } catch {
      if (alive.current) setPrinters([]);
    }
    networkInfo().then((info) => { if (alive.current) setNetwork(info); }).catch(() => {});
    return true;
  }, []);

  useEffect(() => { if (auto) check(); }, [auto, check]);

  return {
    status,
    available: status === 'ready',
    checking: status === 'checking',
    connected: isConnected(),
    printers,
    network,
    reason,
    refresh: check,
  };
}
