"use strict";

require("dotenv").config();
const { Telegraf, Markup } = require("telegraf");
const { MongoClient } = require("mongodb");
const express = require("express");

// =====================
// ENV
// =====================
const BOT_TOKEN = process.env.BOT_TOKEN;
const MONGODB_URI = process.env.MONGODB_URI;
const WEBHOOK_DOMAIN = (process.env.WEBHOOK_DOMAIN || "").replace(/\/+$/, "");

if (!BOT_TOKEN) throw new Error("Missing BOT_TOKEN");
if (!MONGODB_URI) throw new Error("Missing MONGODB_URI");
if (!WEBHOOK_DOMAIN) throw new Error("Missing WEBHOOK_DOMAIN");

const OWNER_ID = parseInt(process.env.OWNER_ID || "0");

// =====================
// SAFONE API
// =====================
const SAFONE_API = "https://api.safone.vip/chatbot";

// =====================
// BOT
// =====================
const bot = new Telegraf(BOT_TOKEN);
const mongoClient = new MongoClient(MONGODB_URI);

let sessions;
let chats;

// =====================
// INIT DB
// =====================
async function initDB() {
  await mongoClient.connect();
  const db = mongoClient.db("nora_bot");

  sessions = db.collection("sessions");
  chats = db.collection("chats");

  console.log("MongoDB connected ✅");
}

// =====================
// HELPERS
// =====================
function getName(ctx) {
  return ctx.from?.first_name || "friend";
}

async function sendLong(ctx, text) {
  if (!text) return;
  const limit = 3900;

  for (let i = 0; i < text.length; i += limit) {
    await ctx.reply(text.substring(i, i + limit));
  }
}

// =====================
// SAFONE AI CALL
// =====================
async function getAIReply(prompt) {
  try {
    const res = await fetch(
      `${SAFONE_API}?message=${encodeURIComponent(prompt)}`
    );

    const data = await res.json();

    return data?.response || data?.message || "No response 😅";
  } catch (err) {
    console.log("Safone error:", err.message);
    return "AI error 🥲";
  }
}

// =====================
// COMMANDS
// =====================
bot.start(async (ctx) => {
  await ctx.reply(
    `ဟယ်လို ${getName(ctx)} 👋\nNora AI ready 💜`
  );
});

bot.command("clear", async (ctx) => {
  await sessions.deleteOne({ _id: ctx.from.id });
  await ctx.reply("Memory cleared ✅");
});

// =====================
// MESSAGE
// =====================
bot.on("text", async (ctx) => {
  const text = ctx.message.text;

  // save chat
  await chats.updateOne(
    { _id: ctx.chat.id },
    { $set: { lastSeen: new Date() } },
    { upsert: true }
  );

  await ctx.sendChatAction("typing");

  const reply = await getAIReply(text);

  await sendLong(ctx, reply);
});

// =====================
// WEBHOOK (Render)
// =====================
const app = express();
const SECRET_PATH = `/bot${BOT_TOKEN}`;

app.get("/", (req, res) => {
  res.send("Nora bot running ✅");
});

app.post(SECRET_PATH, express.json(), bot.webhookCallback());

const PORT = process.env.PORT || 10000;

(async () => {
  await initDB();

  app.listen(PORT, async () => {
    console.log("Server running on port", PORT);

    await bot.telegram.setWebhook(WEBHOOK_DOMAIN + SECRET_PATH);

    console.log("Webhook set ✅");
  });
})();
