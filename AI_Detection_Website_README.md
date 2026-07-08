# AI Deepfake Detection Web App

A full-stack web app for detecting AI-generated media — images, video, and audio — built on top of the [Reality Defender](https://realitydefender.com) SDK. Supports three different detection workflows depending on how much control you want over the process.

## Features

- **Drag-and-drop upload** with a responsive single-page interface
- **Three configurable detection pipelines:**
  - **Auto-detect** — one-shot upload and detect in a single request
  - **Two-step (upload → result)** — upload a file, then poll for the result using the returned request ID, giving you control over polling behavior
  - **Streaming** — upload and receive live updates via Server-Sent Events (SSE) as the detection progresses
- **Live console log** in the UI showing real-time status and confidence scores as detection runs
- **Per-model verdicts** and confidence scores returned directly from the Reality Defender API
- Verbose server-side logging for debugging requests, uploads, and API responses

## Tech Stack

- **Backend:** Node.js, Express
- **File uploads:** Multer
- **Detection engine:** [@realitydefender/realitydefender](https://www.npmjs.com/package/@realitydefender/realitydefender) SDK
- **Real-time updates:** Server-Sent Events (SSE)
- **Frontend:** Static single-page app (`public/index.html`)

## API Endpoints

| Method | Route | Description |
|---|---|---|
| `POST` | `/api/detect` | Upload a file and detect in one request (polls internally, returns final result) |
| `POST` | `/api/upload` | Upload a file and get back a `requestId` / `mediaId` |
| `GET` | `/api/result/:requestId` | Poll for the result of a previously uploaded file |
| `POST` | `/api/stream` | Upload a file and receive live SSE updates as detection progresses |

All endpoints require a Reality Defender `apiKey`, passed in the request body (or query string for `/api/result`).

## Getting Started

### Prerequisites

- Node.js
- A [Reality Defender](https://realitydefender.com) API key

### Installation

```bash
git clone https://github.com/Wuilmerp2004/Ai-detection-website.git
cd Ai-detection-website
npm install
```

### Run locally

```bash
npm start
```

Or with auto-reload during development:

```bash
npm run dev
```

The app runs at `http://localhost:3000` by default (or `PORT` if set).

## Deployment

Includes a `vercel.json` for deployment to Vercel. A couple of things worth knowing if you deploy there:

- Uploaded files are written to `/tmp` in production (Vercel's serverless filesystem is read-only elsewhere).
- The `/api/stream` SSE route polls for up to 120 seconds by default, which exceeds Vercel's default function timeout on the Hobby plan (10s). If you're on Hobby, prefer the two-step `/api/upload` + `/api/result/:requestId` flow, or extend the function timeout on a paid plan.

## Project Structure

```
.
├── server.js          # Express server and detection routes
├── public/
│   └── index.html     # Frontend UI
├── uploads/           # Local temp storage for uploads (dev only)
└── vercel.json         # Vercel deployment config
```
