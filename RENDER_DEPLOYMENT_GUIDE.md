# 🚀 Render Deployment Guide — Autonomous PM Platform

This guide walks you through deploying the **Autonomous Project Management & Daily Log Tracking Platform** on [Render](https://render.com) in 5 minutes.

---

## 🏗️ Architecture on Render

The repository is configured as a **Full-Stack Unified Service**:
- **Backend**: Express 5 REST API on Node.js.
- **Frontend**: Vite + React SPA with TanStack Router.
- In production, the Express server serves both the API (`/api/*`) and the built React frontend (`dist/`), eliminating CORS issues and hosting everything on a single Free Render Web Service!

---

## 📋 Prerequisites

1. **GitHub Repository**: Pushed to `https://github.com/RupajiBalaji/autonomous-project-pilot` (Done ✅).
2. **Free MongoDB Atlas Database**:
   - Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) and create a free M0 cluster.
   - Click **Connect** ➜ **Drivers** ➜ Copy the connection string:
     `mongodb+srv://<username>:<password>@cluster0.abcde.mongodb.net/acube-pm?retryWrites=true&w=majority`
   - In Network Access, allow access from anywhere (`0.0.0.0/0`).
3. **Gemini API Key**: Your Google Gemini AI API key.

---

## 🛠️ Step-by-Step Deployment on Render

### Option A: Using Render Web Service (Recommended)

1. Log into your [Render Dashboard](https://dashboard.render.com).
2. Click **New +** ➜ **Web Service**.
3. Select **Build and deploy from a Git repository** ➜ Connect your repository: `RupajiBalaji/autonomous-project-pilot`.
4. Configure the service settings:
   - **Name**: `autonomous-pm` (or your preferred name)
   - **Region**: Select closest to your users (e.g. *Oregon (US West)* or *Frankfurt*)
   - **Branch**: `main`
   - **Root Directory**: *(Leave blank)*
   - **Runtime**: `Node`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
   - **Instance Type**: `Free`

5. Under **Environment Variables**, add the following:

| Key | Value | Description |
| :--- | :--- | :--- |
| `NODE_ENV` | `production` | Enables production mode & static file serving |
| `PORT` | `5000` | Port for Express server |
| `MONGODB_URI` | `mongodb+srv://<user>:<pass>@.../acube-pm` | Your MongoDB Atlas connection string |
| `GEMINI_API_KEY` | `your_gemini_api_key_here` | Your Google Gemini API Key |
| `JWT_SECRET` | `a_strong_random_jwt_secret_key` | Secret key for signed session cookies |
| `VITE_FIREBASE_API_KEY` | `your_firebase_api_key_here` | Firebase Auth API Key |
| `VITE_FIREBASE_AUTH_DOMAIN` | `your_project_id.firebaseapp.com` | Firebase Auth Domain |
| `VITE_FIREBASE_PROJECT_ID` | `your_project_id` | Firebase Project ID |
| `VITE_FIREBASE_STORAGE_BUCKET` | `your_project_id.firebasestorage.app` | Firebase Storage Bucket |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | `your_messaging_sender_id` | Firebase Messaging Sender ID |
| `VITE_FIREBASE_APP_ID` | `your_firebase_app_id` | Firebase App ID |

6. Click **Create Web Service**.
7. Render will build the Vite frontend into `dist/`, launch the Express server, and provide your live URL (e.g. `https://autonomous-pm.onrender.com`).

---

### Option B: Using Render Blueprint (`render.yaml`)

1. In Render, click **New +** ➜ **Blueprint**.
2. Connect your GitHub repository `RupajiBalaji/autonomous-project-pilot`.
3. Render will read `render.yaml` automatically.
4. Fill in `MONGODB_URI` and `GEMINI_API_KEY` when prompted.
5. Click **Apply**.

---

## 🛡️ Post-Deployment Seeding (Optional)

To seed your production database with realistic projects and team members:
1. Open your live app URL on Render (e.g. `https://autonomous-pm.onrender.com/login`).
2. Log in with your PM account.
3. Call the seed endpoint or use the **"✨ Fast Login Demo Profiles"** on the login page to populate initial data.
