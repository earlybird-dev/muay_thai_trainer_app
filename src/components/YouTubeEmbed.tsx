import { useEffect, useRef } from 'react';
import { holdMusic } from '../lib/music';

/** YouTube player states (IFrame API): 1 playing, 3 buffering; 0 ended, 2 paused, 5 cued, -1 unstarted. */
const ACTIVE = new Set([1, 3]);

/**
 * Embedded YouTube video that silences the app's background music while it plays.
 * It talks to the player with YouTube's postMessage protocol (enablejsapi=1), no extra script needed.
 */
export default function YouTubeEmbed({ id, title }: { id: string; title: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const reason = `video:${id}`;

  useEffect(() => {
    const frame = ref.current;
    let heard = false;
    // Ask the player to report its state; repeat until it answers (it may still be loading).
    const listen = () => frame?.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: reason, channel: 'widget' }), '*');
    const timers = [0, 400, 1000, 2000, 4000].map((ms) => window.setTimeout(() => !heard && listen(), ms));

    const onMessage = (e: MessageEvent) => {
      if (!frame || e.source !== frame.contentWindow || typeof e.data !== 'string') return;
      let msg: { event?: string; info?: unknown };
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      heard = true;
      const state =
        msg.event === 'onStateChange' && typeof msg.info === 'number'
          ? msg.info
          : msg.event === 'infoDelivery' && typeof (msg.info as { playerState?: unknown })?.playerState === 'number'
            ? (msg.info as { playerState: number }).playerState
            : undefined;
      if (state !== undefined) holdMusic(reason, ACTIVE.has(state));
    };
    window.addEventListener('message', onMessage);
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      window.removeEventListener('message', onMessage);
      holdMusic(reason, false); // leaving the page (or switching video) brings the music back
    };
  }, [id, reason]);

  return (
    <div className="video">
      <iframe
        ref={ref}
        src={`https://www.youtube-nocookie.com/embed/${id}?enablejsapi=1&playsinline=1&rel=0&origin=${encodeURIComponent(window.location.origin)}`}
        title={title}
        allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        onLoad={() =>
          ref.current?.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: reason, channel: 'widget' }), '*')
        }
      />
    </div>
  );
}
