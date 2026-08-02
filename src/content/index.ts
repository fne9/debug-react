import {
  AGENT_SOURCE,
  CONTENT_SOURCE,
  PORT_CONTENT,
  type AgentMessage,
  type BackgroundToContentMessage,
  type ContentControlMessage,
  type ContentDispatchMessage,
  type ContentReadyMessage,
} from "../shared/protocol";

let port: chrome.runtime.Port | null = null;
let lastControl: ContentControlMessage | null = null;

function getPort(): chrome.runtime.Port | null {
  if (port) return port;
  try {
    port = chrome.runtime.connect({ name: PORT_CONTENT });
    port.onMessage.addListener((msg: BackgroundToContentMessage) => {
      if (msg.type === "control") {
        lastControl = {
          source: CONTENT_SOURCE,
          type: "control",
          overlay: msg.overlay,
          heatmap: msg.heatmap,
        };
        window.postMessage(lastControl, "*");
      } else if (msg.type === "dispatch") {
        const dispatch: ContentDispatchMessage = {
          source: CONTENT_SOURCE,
          type: "dispatch",
          actionJson: msg.actionJson,
        };
        window.postMessage(dispatch, "*");
      }
    });
    port.onDisconnect.addListener(() => {
      port = null;
    });
  } catch {
    port = null;
  }
  return port;
}

function announceReady(): void {
  const msg: ContentReadyMessage = { source: CONTENT_SOURCE, type: "content-ready" };
  window.postMessage(msg, "*");

  if (lastControl) window.postMessage(lastControl, "*");
}

window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  const data = event.data as AgentMessage | undefined;
  if (!data || data.source !== AGENT_SOURCE) return;

  if (data.type === "hello") {

    announceReady();
    return;
  }

  if (
    data.type === "events" ||
    data.type === "stats" ||
    data.type === "env" ||
    data.type === "profiler" ||
    data.type === "issues" ||
    data.type === "vitals" ||
    data.type === "redux" ||
    data.type === "memory"
  ) {
    try {
      getPort()?.postMessage(data);
    } catch {

      port = null;
    }
  }
});

getPort();
announceReady();
