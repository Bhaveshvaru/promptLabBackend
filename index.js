import 'dotenv/config'
import express from 'express'
import ImageKit from 'imagekit'
import cors from 'cors'
import mongoose from 'mongoose'
import Chat from './models/chat.js'
import UserChats from './models/userChats.js'
import { ClerkExpressRequireAuth } from '@clerk/clerk-sdk-node'

const port = process.env.PORT || 3000
const app = express()

app.use(express.json())

// 1. CORS Configuration
// Ensure process.env.CLIENT_URL has NO trailing slash in Render settings
app.use(
  cors({
    origin: process.env.CLIENT_URL,
    credentials: true,
  })
)

const connect = async () => {
  try {
    await mongoose.connect(process.env.DATABASE_URL)
    console.log('Connected to MongoDB')
  } catch (error) {
    console.error('MongoDB connection error:', error)
  }
}

const imagekit = new ImageKit({
  urlEndpoint: process.env.IMAGE_KIT_ENDPOINT,
  publicKey: process.env.IMAGE_KIT_PUBLIC_KEY,
  privateKey: process.env.IMAGE_KIT_PRIVATE_KEY,
})

// --- ROUTES ---

app.get('/api/upload', (req, res) => {
  const result = imagekit.getAuthenticationParameters()
  res.send(result)
})

// GET USER CHATS - Protected
app.get('/api/userchats', ClerkExpressRequireAuth(), async (req, res) => {
  const userId = req.auth.userId // Provided by the Bearer token

  try {
    const userChats = await UserChats.findOne({ userId })

    // If no chats found, return an empty array instead of 404/500
    if (!userChats) {
      return res.status(200).send([])
    }

    res.status(200).send(userChats.chats)
  } catch (err) {
    console.error('Error in /api/userchats:', err)
    res.status(500).send('Error fetching userchats!')
  }
})

// GET SINGLE CHAT - Protected
app.get('/api/chats/:id', ClerkExpressRequireAuth(), async (req, res) => {
  const userId = req.auth.userId

  try {
    const chat = await Chat.findOne({ _id: req.params.id, userId })
    if (!chat) return res.status(404).send('Chat not found')

    res.status(200).send(chat)
  } catch (err) {
    console.error('Error in /api/chats/:id:', err)
    res.status(500).send('Error fetching chat!')
  }
})

// CREATE CHAT - Protected
app.post('/api/chats', ClerkExpressRequireAuth(), async (req, res) => {
  const userId = req.auth.userId
  const { text } = req.body

  try {
    const newChat = new Chat({
      userId: userId,
      history: [{ role: 'user', parts: [{ text }] }],
    })

    const savedChat = await newChat.save()
    const userChats = await UserChats.findOne({ userId })

    if (!userChats) {
      const newUserChats = new UserChats({
        userId: userId,
        chats: [{ _id: savedChat._id, title: text.substring(0, 40) }],
      })
      await newUserChats.save()
    } else {
      await UserChats.updateOne(
        { userId: userId },
        {
          $push: {
            chats: { _id: savedChat._id, title: text.substring(0, 40) },
          },
        }
      )
    }
    res.status(201).send(savedChat._id)
  } catch (err) {
    console.error('Error in POST /api/chats:', err)
    res.status(500).send('Error creating chat!')
  }
})

// --- ERROR HANDLING ---

// The global error handler catches the 401 thrown by ClerkExpressRequireAuth
app.use((err, req, res, next) => {
  // CRITICAL: Check your Render console for this log!
  console.error('AUTH ERROR:', err.message)

  res.status(401).send({
    message: 'Unauthenticated!',
    details: err.message, // Helps debugging on the frontend
  })
})

app.listen(port, () => {
  connect()
  console.log(`Server is Running on port ${port}`)
})
