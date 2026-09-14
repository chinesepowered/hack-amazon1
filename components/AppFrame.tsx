"use client";
// MCP Apps host: renders a tool's ui:// resource in a sandboxed iframe and bridges it to the MCP server via AppBridge.
import { useEffect, useRef, useState } from "react";
import { AppBridge, PostMessageTransport } from "@modelcontextprotocol/ext-apps/app-bridge";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export interface Card {
  id: string;
  tool: string;
  uri: string;
  input: Record<string, unknown>;
  summary: string;
  structured: Record<string, unknown>;
}

const clients = new Map<string, Promise<Client>>();
const htmlCache = new Map<string, string>();

function getClient(slug: string, token: string | null): Promise<Client> {
  const key = `${slug}|${token ?? ""}`;
  if (!clients.has(key)) {
    const p = (async () => {
      const client = new Client({ name: "Storefront Display (MCP Apps host)", version: "1.0.0" });
      const transport = new StreamableHTTPClientTransport(new URL(`/api/mcp/${slug}`, window.location.origin), {
        requestInit: { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      });
      await client.connect(transport);
      return client;
    })();
    p.catch(() => clients.delete(key));
    clients.set(key, p);
  }
  return clients.get(key)!;
}

export default function AppFrame({ slug, token, card, onMessage }: { slug: string; token: string | null; card: Card; onMessage: (text: string) => void }) {
  const holder = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    let disposed = false;
    let bridge: AppBridge | null = null;
    const iframe = document.createElement("iframe");
    iframe.setAttribute("sandbox", "allow-scripts allow-forms");
    iframe.setAttribute("title", card.tool);
    iframe.setAttribute("data-testid", "mcp-app");
    iframe.style.cssText = "width:100%;border:0;height:260px;display:block;background:transparent;transition:height .25s ease";
    holder.current?.replaceChildren(iframe);

    (async () => {
      try {
        const client = await getClient(slug, token);
        let html = htmlCache.get(card.uri);
        if (!html) {
          const res = await client.readResource({ uri: card.uri });
          const content = res.contents[0] as { text?: string; blob?: string };
          html = content.text ?? atob(content.blob ?? "");
          htmlCache.set(card.uri, html);
        }
        if (disposed) return;
        bridge = new AppBridge(
          client,
          { name: "Storefront Display", version: "1.0.0" },
          { serverTools: {}, serverResources: {}, openLinks: {}, logging: {}, message: { text: {} } },
          { hostContext: { theme: "light", displayMode: "inline", platform: "desktop", containerDimensions: { maxHeight: 640 } } },
        );
        bridge.onsizechange = ({ height }) => {
          if (height) iframe.style.height = `${Math.min(640, Math.ceil(height) + 2)}px`;
        };
        bridge.onmessage = async (params) => {
          const text = params.content.map((c) => ("text" in c ? c.text : "")).join(" ").trim();
          if (text) onMessageRef.current(text);
          return {};
        };
        bridge.oninitialized = () => {
          bridge!.sendToolInput({ arguments: card.input });
          bridge!.sendToolResult({ content: [{ type: "text", text: card.summary }], structuredContent: card.structured });
        };
        await bridge.connect(new PostMessageTransport(iframe.contentWindow!, iframe.contentWindow!));
        iframe.srcdoc = html;
      } catch (e) {
        if (!disposed) setError((e as Error).message);
      }
    })();

    return () => {
      disposed = true;
      bridge?.close().catch(() => {});
      iframe.remove();
    };
  }, [slug, token, card]);

  return (
    <div className="rise">
      <div ref={holder} />
      {error && <p className="text-sm text-red-700 mt-2">Card failed to load: {error}</p>}
    </div>
  );
}
