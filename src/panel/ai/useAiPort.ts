import { useEffect, useRef } from "react";
import {
  PORT_AI,
  type AiBackgroundMessage,
  type AiPanelMessage,
} from "../../shared/protocol";

export function useAiPort(
  onMessage: (msg: AiBackgroundMessage) => void,
): (msg: AiPanelMessage) => void {
  const portRef = useRef<chrome.runtime.Port | null>(null);
  const handlerRef = useRef(onMessage);
  handlerRef.current = onMessage;

  useEffect(() => {
    return () => {
      portRef.current?.disconnect();
      portRef.current = null;
    };
  }, []);

  return (msg: AiPanelMessage) => {
    if (!portRef.current) {
      const port = chrome.runtime.connect({ name: PORT_AI });
      port.onMessage.addListener((m: AiBackgroundMessage) => handlerRef.current(m));
      port.onDisconnect.addListener(() => {
        if (portRef.current === port) portRef.current = null;
      });
      portRef.current = port;
    }
    portRef.current.postMessage(msg);
  };
}
