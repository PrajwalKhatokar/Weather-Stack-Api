import { useMemo, useState } from "react";

const API_KEY = "5ee823bbf9127e84fa4466ff7cfe4e47";
const FREE_PLAN_MODE = true;
const ENDPOINTS = [
  { value: "current", label: "Current", freePlan: true },
  { value: "forecast", label: "Forecast (Upgrade)", freePlan: false },
  { value: "historical", label: "Historical (Upgrade)", freePlan: false },
  { value: "marine", label: "Marine (Upgrade)", freePlan: false },
  { value: "locations", label: "Location Lookup (Upgrade)", freePlan: false }
];

const defaultFilters = {
  endpoint: "current",
  query: "New York",
  units: "m",
  language: "",
  forecastDays: 5,
  historicalDate: new Date().toISOString().slice(0, 10),
  latitude: "40.7128",
  longitude: "-74.0060",
  marineHourly: "1",
  tide: "yes"
};

function prettyDate(value) {
  if (!value) return "";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString();
}

function getEndpointPath(endpoint) {
  return `/api/weatherstack/${endpoint}`;
}

async function parseApiResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }

  await response.text();
  throw new Error(
    `Unexpected upstream response (${response.status}). This deployment must proxy /api/weatherstack/* to api.weatherstack.com.`
  );
}

function isEndpointAllowed(endpoint) {
  if (!FREE_PLAN_MODE) return true;
  const match = ENDPOINTS.find((item) => item.value === endpoint);
  return Boolean(match?.freePlan);
}

function buildParams(filters, options = {}) {
  const { omitLanguage = false } = options;
  const normalizedLanguage = (filters.language ?? "").trim().toLowerCase();

  const params = new URLSearchParams({
    access_key: API_KEY,
    units: filters.units
  });
  if (!omitLanguage && /^[a-z]{2}$/.test(normalizedLanguage)) {
    params.set("language", normalizedLanguage);
  }

  if (filters.endpoint === "marine") {
    params.set("latitude", filters.latitude);
    params.set("longitude", filters.longitude);
    params.set("hourly", filters.marineHourly);
    params.set("tide", filters.tide);
    return params;
  }

  params.set("query", filters.query.trim());

  if (filters.endpoint === "forecast") {
    params.set("forecast_days", String(filters.forecastDays));
  }

  if (filters.endpoint === "historical") {
    params.set("historical_date", filters.historicalDate);
    params.set("hourly", "1");
  }

  return params;
}

function buildSummary(endpoint, data) {
  if (!data) return [];

  if (endpoint === "current" && data.current) {
    return [
      { label: "Location", value: `${data.location?.name ?? "-"}, ${data.location?.country ?? "-"}` },
      { label: "Condition", value: data.current.weather_descriptions?.[0] ?? "-" },
      { label: "Temperature", value: `${data.current.temperature ?? "-"}°` },
      { label: "Humidity", value: `${data.current.humidity ?? "-"}%` },
      { label: "Wind", value: `${data.current.wind_speed ?? "-"} km/h ${data.current.wind_dir ?? ""}` }
    ];
  }

  if (endpoint === "forecast" && data.forecast) {
    const firstDayKey = Object.keys(data.forecast)[0];
    const firstDay = data.forecast[firstDayKey];
    return [
      { label: "Location", value: `${data.location?.name ?? "-"}, ${data.location?.country ?? "-"}` },
      { label: "Forecast Date", value: prettyDate(firstDayKey) },
      { label: "Condition", value: firstDay?.weather_descriptions?.[0] ?? "-" },
      { label: "High / Low", value: `${firstDay?.maxtemp ?? "-"}° / ${firstDay?.mintemp ?? "-"}°` },
      { label: "UV", value: String(firstDay?.uv_index ?? "-") }
    ];
  }

  if (endpoint === "historical" && data.historical) {
    const firstDayKey = Object.keys(data.historical)[0];
    const firstDay = data.historical[firstDayKey];
    return [
      { label: "Location", value: `${data.location?.name ?? "-"}, ${data.location?.country ?? "-"}` },
      { label: "Historical Date", value: prettyDate(firstDayKey) },
      { label: "Average Temp", value: `${firstDay?.avgtemp ?? "-"}°` },
      { label: "Sunrise", value: firstDay?.astro?.sunrise ?? "-" },
      { label: "Sunset", value: firstDay?.astro?.sunset ?? "-" }
    ];
  }

  if (endpoint === "marine" && data.forecast) {
    const firstDayKey = Object.keys(data.forecast)[0];
    const firstDay = data.forecast[firstDayKey];
    const firstSlot = firstDay?.hourly?.[0];
    return [
      { label: "Coordinates", value: `${data.request?.latitude ?? "-"}, ${data.request?.longitude ?? "-"}` },
      { label: "Date", value: prettyDate(firstDayKey) },
      { label: "Water Temp", value: `${firstSlot?.waterTemp_C ?? "-"}°C` },
      { label: "Wave Height", value: `${firstSlot?.swellHeight_m ?? "-"} m` },
      { label: "Visibility", value: `${firstSlot?.visibility ?? "-"} km` }
    ];
  }

  if (endpoint === "locations") {
    const firstResult = data.location?.[0];
    return [
      { label: "Matches", value: String(data.location?.length ?? 0) },
      { label: "Top Match", value: firstResult ? `${firstResult.name}, ${firstResult.country}` : "-" },
      { label: "Region", value: firstResult?.region ?? "-" },
      { label: "Latitude", value: firstResult?.lat ?? "-" },
      { label: "Longitude", value: firstResult?.lon ?? "-" }
    ];
  }

  return [];
}

export default function App() {
  const [filters, setFilters] = useState(defaultFilters);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showRawData, setShowRawData] = useState(false);

  const summary = useMemo(() => buildSummary(filters.endpoint, data), [filters.endpoint, data]);

  const setField = (field, value) => {
    setFilters((prev) => ({ ...prev, [field]: value }));
  };

  const runLookup = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");

    if (!isEndpointAllowed(filters.endpoint)) {
      setLoading(false);
      setData(null);
      setError(
        "Your current Weatherstack subscription supports only current weather data. Select 'Current' to continue."
      );
      return;
    }

    const normalizedLanguage = (filters.language ?? "").trim().toLowerCase();
    if (normalizedLanguage && !/^[a-z]{2}$/.test(normalizedLanguage)) {
      setLoading(false);
      setError("Language must be a valid 2-letter ISO code (example: en, fr, de) or left blank.");
      return;
    }

    try {
      const params = buildParams(filters);
      const endpointPath = getEndpointPath(filters.endpoint);
      const response = await fetch(`${endpointPath}?${params.toString()}`);
      const payload = await parseApiResponse(response);

      if (!response.ok || payload.error) {
        if (payload?.error?.code === 605 && normalizedLanguage) {
          const retryParams = buildParams(filters, { omitLanguage: true });
          const retryResponse = await fetch(`${endpointPath}?${retryParams.toString()}`);
          const retryPayload = await parseApiResponse(retryResponse);

          if (!retryResponse.ok || retryPayload.error) {
            const retryMessage =
              retryPayload?.error?.info || `Request failed with status ${retryResponse.status}`;
            throw new Error(retryMessage);
          }

          setData(retryPayload);
          setError("");
          return;
        }

        const message = payload?.error?.info || `Request failed with status ${response.status}`;
        throw new Error(message);
      }

      setData(payload);
    } catch (requestError) {
      setData(null);
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-shell">
      <div className="ambient ambient-left" />
      <div className="ambient ambient-right" />

      <header className="topbar panel">
        <div>
          <p className="eyebrow">NimbusOps</p>
          <h1>Weather Intelligence Console</h1>
        </div>
        <p className="meta">
          {FREE_PLAN_MODE
            ? "Free plan mode: Current weather endpoint only"
            : "Realtime, Forecast, Historical, Marine, and Location Search"}
        </p>
      </header>

      <main className="layout">
        <section className="panel controls">
          <h2>Search & Filters</h2>
          <form onSubmit={runLookup}>
            <div className="field-group">
              <label htmlFor="endpoint">Data Type</label>
              <select
                id="endpoint"
                value={filters.endpoint}
                onChange={(e) => setField("endpoint", e.target.value)}
              >
                {ENDPOINTS.map((endpoint) => (
                  <option
                    key={endpoint.value}
                    value={endpoint.value}
                    disabled={FREE_PLAN_MODE && !endpoint.freePlan}
                  >
                    {endpoint.label}
                  </option>
                ))}
              </select>
            </div>

            {filters.endpoint === "marine" ? (
              <>
                <div className="field-row">
                  <div className="field-group">
                    <label htmlFor="lat">Latitude</label>
                    <input
                      id="lat"
                      type="text"
                      value={filters.latitude}
                      onChange={(e) => setField("latitude", e.target.value)}
                    />
                  </div>

                  <div className="field-group">
                    <label htmlFor="lon">Longitude</label>
                    <input
                      id="lon"
                      type="text"
                      value={filters.longitude}
                      onChange={(e) => setField("longitude", e.target.value)}
                    />
                  </div>
                </div>

                <div className="field-row">
                  <div className="field-group">
                    <label htmlFor="marineHourly">Hourly</label>
                    <select
                      id="marineHourly"
                      value={filters.marineHourly}
                      onChange={(e) => setField("marineHourly", e.target.value)}
                    >
                      <option value="1">On</option>
                      <option value="0">Off</option>
                    </select>
                  </div>

                  <div className="field-group">
                    <label htmlFor="tide">Tide Data</label>
                    <select
                      id="tide"
                      value={filters.tide}
                      onChange={(e) => setField("tide", e.target.value)}
                    >
                      <option value="yes">Yes</option>
                      <option value="no">No</option>
                    </select>
                  </div>
                </div>
              </>
            ) : (
              <div className="field-group">
                <label htmlFor="query">Location Search</label>
                <input
                  id="query"
                  type="text"
                  value={filters.query}
                  placeholder="City, ZIP, IP, Lat,Lng"
                  onChange={(e) => setField("query", e.target.value)}
                />
              </div>
            )}

            {filters.endpoint === "forecast" && (
              <div className="field-group">
                <label htmlFor="forecastDays">Forecast Days (1-14)</label>
                <input
                  id="forecastDays"
                  type="number"
                  min="1"
                  max="14"
                  value={filters.forecastDays}
                  onChange={(e) => setField("forecastDays", e.target.value)}
                />
              </div>
            )}

            {filters.endpoint === "historical" && (
              <div className="field-group">
                <label htmlFor="historicalDate">Historical Date</label>
                <input
                  id="historicalDate"
                  type="date"
                  value={filters.historicalDate}
                  onChange={(e) => setField("historicalDate", e.target.value)}
                />
              </div>
            )}

            <div className="field-row">
              <div className="field-group">
                <label htmlFor="units">Units</label>
                <select id="units" value={filters.units} onChange={(e) => setField("units", e.target.value)}>
                  <option value="m">Metric</option>
                  <option value="s">Scientific</option>
                  <option value="f">Fahrenheit</option>
                </select>
              </div>

              <div className="field-group">
                <label htmlFor="language">Language</label>
                <input
                  id="language"
                  type="text"
                  value={filters.language}
                  maxLength={2}
                  placeholder="optional (en)"
                  onChange={(e) => setField("language", e.target.value.toLowerCase())}
                />
              </div>
            </div>

            <button type="submit" disabled={loading}>
              {loading ? "Fetching..." : "Get Weather Data"}
            </button>
          </form>
          <p className="hint">
            {FREE_PLAN_MODE
              ? "Free Weatherstack plan: use 'Current' data type. Forecast, Historical, Marine, and Location require an upgrade."
              : "Note: endpoint availability depends on your Weatherstack plan."}
          </p>
        </section>

        <section className="panel results">
          <div className="results-head">
            <h2>Live Output</h2>
            {data && (
              <button
                type="button"
                className="details-toggle"
                onClick={() => setShowRawData((prev) => !prev)}
              >
                {showRawData ? "Hide Technical Data" : "Show Technical Data"}
              </button>
            )}
          </div>

          {error && <div className="error">{error}</div>}

          {!error && summary.length > 0 && (
            <div className="summary-grid">
              {summary.map((item) => (
                <article className="metric" key={item.label}>
                  <p>{item.label}</p>
                  <strong>{item.value}</strong>
                </article>
              ))}
            </div>
          )}

          {!error && !data && !loading && (
            <p className="placeholder">Run a search to view weather intelligence.</p>
          )}

          {data && showRawData && (
            <pre className="json-view">
              <code>{JSON.stringify(data, null, 2)}</code>
            </pre>
          )}
        </section>
      </main>
    </div>
  );
}
