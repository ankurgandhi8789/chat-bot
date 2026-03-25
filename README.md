# Maa Savitri Chatbot - Unified Application

This project combines both the frontend (React + Vite) and backend (Express + Gemini AI) in a single repository for easy deployment.

## Project Structure

```
client/
├── server/           # Backend Express server
│   ├── server.js     # Main server file
│   └── .env          # Environment variables (not in git)
├── src/              # React frontend
├── package.json      # Combined dependencies
└── vite.config.js    # Vite config with proxy
```

## Setup Instructions

1. **Install dependencies:**
   ```bash
   cd client
   npm install
   ```

2. **Configure environment variables:**
   - Edit `server/.env` and add your Gemini API key:
     ```
     PORT=5000
     GEMINI_API_KEY=your_api_key_here
     ```

3. **Run development server:**
   ```bash
   npm run dev
   ```
   This will start both:
   - Frontend on http://localhost:5173
   - Backend on http://localhost:5000

## Available Scripts

- `npm run dev` - Run both frontend and backend concurrently
- `npm run client` - Run only frontend
- `npm run server` - Run only backend
- `npm run build` - Build frontend for production
- `npm run preview` - Preview production build

## Deployment

### Single Platform Deployment (Recommended)

Deploy to platforms that support both static files and Node.js:

**Vercel:**
1. Push code to GitHub
2. Import project in Vercel
3. Add environment variable: `GEMINI_API_KEY`
4. Deploy

**Render:**
1. Create new Web Service
2. Build command: `npm install && npm run build`
3. Start command: `node server/server.js`
4. Add environment variable: `GEMINI_API_KEY`

**Railway:**
1. Connect GitHub repository
2. Add environment variable: `GEMINI_API_KEY`
3. Deploy automatically

## Notes

- The frontend proxies `/api` requests to the backend (configured in vite.config.js)
- In production, you may need to serve the built frontend from the Express server
- Make sure to never commit the `.env` file (already in .gitignore)
