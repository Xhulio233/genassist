import { GenAgentChat } from "genassist-chat-react";
import { useEffect, useState } from "react";
import { getApiUrl, getWsUrl } from "@/config/api";
import { isWsEnabled, isPollEnabled } from "@/config/api";

// Theme passed to the third-party chat widget. `primaryColor` mirrors the brand
// primary token (--primary / --brand-600 = hsl(229 86% 51%)) defined in index.css.
const GLOBAL_CHAT_THEME = {
  primaryColor: "#173DED",
  backgroundColor: "#ffffff",
  textColor: "#000000",
  fontFamily: "Roboto, Arial, sans-serif",
  fontSize: "14px",
} as const;

export const GlobalChat = () => {
  const [baseUrl, setBaseUrl] = useState<string | null>(null);
  const [websocketUrl, setWebsocketUrl] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const genassistApiKey = import.meta.env.VITE_GENASSIST_CHAT_APIKEY;
  // const tenantId = localStorage.getItem('tenant_id') as string | undefined;

  useEffect(() => {
    (async () => {
      try {
        const apiUrl = await getApiUrl();
        const baseUrl = new URL("..", apiUrl).toString();
        setBaseUrl(baseUrl);

        const websocketUrl = await getWsUrl();
        setWebsocketUrl(websocketUrl);
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Failed to initialize chat";
        setError(message);
      }
    })();
  }, []);

  if (error || !baseUrl) {
    return null;
  }

  return (
    <GenAgentChat
      baseUrl={baseUrl}
      websocketUrl={websocketUrl}
      apiKey={genassistApiKey}
      // tenant={tenantId}
      headerTitle="Genassist Chat"
      theme={GLOBAL_CHAT_THEME}
      useWs={isWsEnabled}
      mode="floating"
      floatingConfig={{
        position: "bottom-right",
      }}
      useFile={true}
      usePoll={isPollEnabled}
    />
  );
};