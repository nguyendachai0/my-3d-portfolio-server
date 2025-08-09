import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import fetch from "node-fetch"; // If you're on Node <18, install: npm install node-fetch
import { createServer } from "http";
import { Server } from "socket.io";


dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static("public")); // Serves index.html + Three.js assets

app.post("/api/chat", async (req, res) => {
  const { message } = req.body;

  try {
    const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: message }] }]
      })
    });

    const data = await geminiRes.json();
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || "No reply";

    res.json({ reply });
  } catch (err) {
    console.error("Gemini API error:", err);
    res.status(500).json({ error: "Failed to reach Gemini API" });
  }
});

app.post("/api/robot-decision", async (req, res) => {
  const { viewData } = req.body;

  if (!Array.isArray(viewData)) {
    return res.status(400).json({ error: "Invalid viewData" });
  }

  // Create a prompt for the AI
  const formattedView = viewData.map((obj, i) => `${i + 1}. ${obj.label} at [${obj.position.map(n => n.toFixed(2)).join(', ')}]`).join('\n');

  const prompt = `
You are a robot navigating a 3D world. You can interact, explore, speak, or move.

Objects in view:
${formattedView}

Choose the best action from:
- moveForward()
- turnLeft()
- turnRight()
- interactWithLabel("label")
- pickUpNearestObject()
- speak("message")
- idle()

Only return one plain command. No explanations.
`;



  try {
    const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    });

    const data = await geminiRes.json();
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || "No action";

    res.json({ action: reply });
  } catch (err) {
    console.error("Gemini API error:", err);
    res.status(500).json({ error: "Failed to process robot decision" });
  }
});

// === Multiplayer Support ===
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const players = {};
const availableModels = ['Goku', 'Naruto', 'Musashi', 'Hanaminchi', 'marie_skullgirls'];
const playerModels = {};

io.on('connection', (socket) => {
  console.log('🧍 Player connected:', socket.id);

  // Handle player registration
 socket.on('playerUpdate', ({ position, rotation }) => {
  const isNew = !players[socket.id];

  if (isNew) {
    // Assign a random model on first update
    const modelName = availableModels[Math.floor(Math.random() * availableModels.length)];
    playerModels[socket.id] = modelName;
  }

  players[socket.id] = { position, rotation };

  if (isNew) {
    // Tell everyone else a new player joined
    socket.broadcast.emit('playerJoined', {
      id: socket.id,
      position,
      rotation,
      modelName: playerModels[socket.id]  // 🔥 Send model name
    });

    // Send all existing players TO the new player
    Object.entries(players).forEach(([id, data]) => {
      if (id !== socket.id) {
        socket.emit('playerJoined', {
          id,
          position: data.position,
          rotation: data.rotation,
          modelName: playerModels[id]       // 🔥 Include their model
        });
      }
    });
  } else {
    // Broadcast movement updates to others
    socket.broadcast.emit('playerMoved', {
      id: socket.id,
      position,
      rotation
    });
  }
});

  socket.on('disconnect', () => {
    console.log('❌ Player disconnected:', socket.id);
    delete players[socket.id];
    socket.broadcast.emit('playerLeft', socket.id);
  });
});


httpServer.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
// app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
