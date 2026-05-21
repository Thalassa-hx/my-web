# CABO Online

React + Socket.IO CABO game prototype with local AI mode and an online room mode.

## One-click Render deploy

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/Thalassa-hx/my-web)

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
