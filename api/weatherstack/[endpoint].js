import { URLSearchParams } from "node:url";

export default async function handler(req, res) {
  const endpointParam = req.query?.endpoint;
  const endpoint = Array.isArray(endpointParam) ? endpointParam[0] : endpointParam;

  if (!endpoint) {
    return res.status(400).json({ error: { info: "Missing weatherstack endpoint." } });
  }

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(req.query || {})) {
    if (key === "endpoint") continue;
    if (Array.isArray(value)) {
      for (const v of value) params.append(key, String(v));
    } else if (value !== undefined) {
      params.set(key, String(value));
    }
  }

  const upstream = `http://api.weatherstack.com/${endpoint}?${params.toString()}`;

  try {
    const response = await fetch(upstream);
    const text = await response.text();

    res.setHeader("content-type", "application/json; charset=utf-8");
    return res.status(response.status).send(text);
  } catch (error) {
    return res.status(502).json({
      error: {
        info: "Failed to reach Weatherstack upstream.",
        detail: error instanceof Error ? error.message : "Unknown error"
      }
    });
  }
}