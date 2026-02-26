# Weatherstack React SaaS App

A glassmorphic React app (Vite) that queries Weatherstack endpoints:
- `current`
- `forecast`
- `historical`
- `marine`
- `locations`

## Run

```bash
npm install
npm run dev
```

Open `http://localhost:5173`.

## Notes

- API key is preconfigured in `src/App.jsx` per request.
- Vite dev proxy is configured in `vite.config.js` to forward `/weatherstack/*` to `http://api.weatherstack.com/*`.
- Endpoint access depends on your Weatherstack subscription plan.
