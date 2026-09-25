import { useEffect, useRef } from 'react';
import Toast from 'react-native-toast-message';

// Put this as the last child of a <Modal> so its toasts show on top of it.
//
// The app mounts one <Toast /> at the root, and a native Modal is its own window above that, so a toast fired while a pop-up was open (the
// error when saving an offer, a banner, a dispute, an order fails) was drawn behind the pop-up: the person saw nothing happen. The toast
// library always uses the most recently mounted <Toast />, so one inside the Modal takes over while it is open. When the pop-up closes,
// that <Toast /> goes with it; a toast it received in the last moment before closing (the usual "Saved" right as the form closes) is then
// shown again on the screen behind, so success messages are not lost either.

type ShowParams = Parameters<typeof Toast.show>[0];

const hosts: number[] = [];          // mounted hosts, innermost last (the one the library shows on)
let nextId = 1;
let last: { params: ShowParams; at: number; host: number | null } | null = null;

const originalShow = Toast.show;
if (!(originalShow as { __tracked?: boolean }).__tracked) {
  const tracked = (params: ShowParams) => {
    last = { params, at: Date.now(), host: hosts.length ? hosts[hosts.length - 1] : null };
    originalShow(params);
  };
  (tracked as { __tracked?: boolean }).__tracked = true;
  Toast.show = tracked;
}

const RESHOW_WINDOW_MS = 1500;

export default function ModalToastHost() {
  const id = useRef(0);
  if (id.current === 0) id.current = nextId++;

  useEffect(() => {
    const mine = id.current;
    hosts.push(mine);
    return () => {
      hosts.splice(hosts.indexOf(mine), 1);
      const recent = last;
      if (recent && recent.host === mine && Date.now() - recent.at < RESHOW_WINDOW_MS) {
        // This pop-up is closing with a toast it had just shown; show it again on whatever is behind
        setTimeout(() => Toast.show(recent.params), 60);
      }
    };
  }, []);

  return <Toast />;
}
