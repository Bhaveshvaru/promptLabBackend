import 'dotenv/config'; // Ensure this is at the very top
import express from 'express';
import ImageKit from 'imagekit';
import cors from 'cors';
import mongoose from 'mongoose';
import Chat from './models/chat.js';
import UserChats from './models/userChats.js';
import { ClerkExpressRequireAuth } from '@clerk/clerk-sdk-node';

const port = process.env.PORT || 3000;
const app = express();

app.use(express.json());

// FIXED: Ensure no trailing slash in your Render environment variable for CLIENT_URL
app.use(
  cors({
    origin: process.env.CLIENT_URL,
    credentials: true,
  })
);

const connect = async () => {
  try {
    await mongoose.connect(process.env.DATABASE_URL);
    console.log('Connected to MongoDB');
  } catch (error) {
    console.error('MongoDB connection error:', error);
  }
};

const imagekit = new ImageKit({
  urlEndpoint: process.env.IMAGE_KIT_ENDPOINT,
  publicKey: process.env.IMAGE_KIT_PUBLIC_KEY,
  privateKey: process.env.IMAGE_KIT_PRIVATE_KEY,
});

app.get('/api/upload', (req, res) => {
  const result = imagekit.getAuthenticationParameters();
  res.send(result);
});

// --- ROUTES ---

app.post('/api/chats', ClerkExpressRequireAuth(), async (req, res) => {
  const userId = req.auth.userId;
  const { text } = req.body;

  try {
    const newChat = new Chat({
      userId: userId,
      history: [{ role: 'user', parts: [{ text }] }],
    });

    const savedChat = await newChat.save();
    const userChats = await UserChats.find({ userId: userId });

    if (!userChats.length) {
      const newUserChats = new UserChats({
        userId: userId,
        chats: [{ _id: savedChat._id, title: text.substring(0, 40) }],
      });
      await newUserChats.save();
    } else {
      await UserChats.updateOne(
        { userId: userId },
        { $push: { chats: { _id: savedChat._id, title: text.substring(0, 40) } } }
      );
    }
    res.status(201).send(savedChat._id);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error creating chat!');
  }
});

app.get('/api/userchats', ClerkExpressRequireAuth(), async (req, res) => {
  const userId = req.auth.userId;

  try {
    // FIXED: Using findOne and adding a check if user exists
    const userChats = await UserChats.findOne({ userId });
    
    if (!userChats) {
      return res.status(200).send([]); 
    }

    res.status(200).send(userChats.chats);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error fetching userchats!');
  }
});

app.get('/api/chats/:id', ClerkExpressRequireAuth(), async (req, res) => {
  const userId = req.auth.userId;
  try {
    const chat = await Chat.findOne({ _id: req.params.id, userId });
    res.status(200).send(chat);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error fetching chat!');
  }
});

app.put('/api/chats/:id', ClerkExpressRequireAuth(), async (req, res) => {
  const userId = req.auth.userId;
  const { question, answer, img } = req.body;

  const newItems = [
    ...(question ? [{ role: 'user', parts: [{ text: question }], ...(img && { img }) }] : []),
    { role: 'model', parts: [{ text: answer }] },
  ];

  try {
    const updatedChat = await Chat.updateOne(
      { _id: req.params.id, userId },
      { $push: { history: { $each: newItems } } }
    );
    res.status(200).send(updatedChat);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error adding conversation!');
  }
});

// --- ERROR HANDLING ---

// IMPROVED: Logs the specific reason Clerk failed in your Render console
app.use((err, req, res, next) => {
  console.error("Clerk Auth Error:", err.stack);
  res.status(401).send('Unauthenticated!');
});

app.listen(port, () => {
  connect();
  console.log(`Server is Running on port ${port}`);
});