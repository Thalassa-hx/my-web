# CABO Online

React + Socket.IO CABO game prototype with local AI mode and an online room mode.

## Local development

```bash
npm install
npm run dev:all
```

Open the Vite URL printed in the terminal.

## Production

```bash
npm install
npm run build
npm start
```

The Node server serves both the built frontend and the Socket.IO room server.

## Render

This repository includes `render.yaml` for Render Blueprint deployment.

Build command:

```bash
npm install && npm run build
```

Start command:

```bash
npm start
```
