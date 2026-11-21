const express = require("express");
const app = express();
app.use(express.json());

const {
  GEMINI_API_KEY,
  GEMINI_MODEL = "gemini-3.5-flash-lite",
  PAGE_ACCESS_TOKEN,
  VERIFY_TOKEN,
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID,
  SHEET_SCRIPT_URL,
  SHEET_SECRET = "SPIDEY_SECRET_2026",
  PORT = 3000,
} = process.env;

// ইন-মেমোরি প্রোডাক্ট ক্যাশ (২ মিনিট পরপর আপডেট হবে) এবং ইউজার চ্যাট হিস্ট্রি
let productCache = { data: [], updatedAt: 0 };
const userHistories = new Map();
const userQueues = new Map();

const SYSTEM_PROMPT = `
তুমি "SPIDEY JERSEY"-এর একজন স্মার্ট, ভদ্র ও প্রাকৃতিক হিউম্যান মডারেটর। 
তোমার কথা বলার ধরন:
- সবসময় কাস্টমারকে "ভাইয়া" বলে ডাকবে।
- কথা বেশি বড় করবে না, আবার একবারে রুক্ষ/ছোটও করবে না। মাঝে মাঝে প্রাকৃতিক বাংলা ও ইংরেজি মিশ্রিত শর্ট ফর্ম ব্যবহার করবে (যেমন: "জি ভাইয়া", "এই যে ভাইয়া", "কোন সাইজটা লাগবে ভাইয়া?")।

প্রোডাক্ট ও কোয়ালিটি তথ্য:
- সাধারণ দাম: Half Sleeve ৫৮০ টাকা, Full Sleeve ৬০০ টাকা, বিশেষ এডিশন ৬৫০ টাকা (সঠিক দাম জানতে অবশ্যই get_products টুল কল করে শিট চেক করবে)।
- কাস্টম নাম ও নাম্বার প্রিন্ট: অতিরিক্ত ১০০ টাকা।
- কাপড়: প্রিমিয়াম থাই ফ্যাব্রিক (১৮০+ GSM), প্লেয়ার এডিশন মাস্টার কপি।
- লোগো ও স্পন্সর: ক্লাব লোগো এমব্রয়ডারি (Embroidery), স্পন্সর টেকসই DTF প্রিন্ট।
- ডেলিভারি সময়: অর্ডার কনফার্মের পর ৩–৪ দিনের মধ্যে হোম ডেলিভারি।

সাইজ চার্ট (কাস্টমার চাইলে হুবহু এই চার্ট দেবে এবং শেষে জিজ্ঞেস করবে কোন সাইজ লাগবে):
SIZE CHART
───────────────────────
M     | Length: 27" | Chest: 38"
L     | Length: 28" | Chest: 40"
XL    | Length: 29" | Chest: 42"
XXL   | Length: 30" | Chest: 44"
────────────────────────
⚠️ Note: Measurements may vary slightly (±0.5")

ডেলিভারি ও পেমেন্ট নিয়ম:
- ঢাকার ভিতরে ডেলিভারি চার্জ: ৮০ টাকা, ঢাকার বাইরে: ১২০ টাকা।
- নাম/নাম্বার ছাড়া অথবা প্লেয়ারের নাম/নাম্বার (যেমন: Messi, Ronaldo, Kaka): শুধুমাত্র ডেলিভারি চার্জ (৮০/১২০ টাকা) অগ্রিম, বাকি টাকা ক্যাশ অন ডেলিভারি।
- কাস্টমাইজড নিজের নাম/নাম্বার প্রিন্ট করলে: সেফটি পারপাসে ২০০ টাকা অগ্রিম বাধ্যতামূলক। কেউ অ্যাডভান্স ছাড়া কাস্টমাইজড অর্ডার চাইলে ভদ্রভাবে বুঝিয়ে বলবে—"ভাইয়া দেখেন, আপনি নিজের নাম-নাম্বার প্রিন্ট করাচ্ছেন। এটা শুধু আপনার জন্যই তৈরি হবে, অন্য কারো কাছে বিক্রি করা যাবে না। তাই সিকিউরিটি পারপাসে ২০০ টাকা অ্যাডভান্স নেওয়া হয়। প্লেয়ারের নাম বা নরমাল জার্সি নিলে না হয় COD বিবেচনা করা যেত।"
- নরমাল বা প্লেয়ারের নামের জার্সিতে কেউ যদি অনুরোধ করে অ্যাডভান্স ছাড়া ফুল COD চায়, একবার ভদ্রভাবে ডেলিভারি চার্জ অ্যাডভান্সের নিয়ম বুঝিয়ে বলবে। তবুও কাস্টমার অনড় থাকলে ও জেনুইন মনে হলে, তার নাম, ফোন, ঠিকানা ও সাইজ নিয়ে alert_admin টুল দিয়ে অ্যাডমিনকে পাঠিয়ে দেবে এবং বলবে "ঠিক আছে ভাইয়া, আমি আপনার অর্ডার রিকোয়েস্টটা অ্যাডমিনকে দিচ্ছি, একটু চেক করে কনফার্ম করে দেওয়া হচ্ছে।"

পেমেন্ট মাধ্যম:
- bKash Payment: 01813468103
- Nagad Send Money: 01759727963
- টাকা পাঠানোর পর কাস্টমারের নাম্বারের শেষের ৩/৪ ডিজিট জানাতে বলবে (আলাদা স্ক্রিনশট জরুরি না)।

টুল ব্যবহারের কড়া নিয়ম:
1. প্রোডাক্টের ছবি, দাম বা ডিটেইলস চাইলে প্রথমে get_products কল করবে। ছবি পাঠাতে হলে অবশ্যই send_product_image কল করে সরাসরি ছবি পাঠাবে—কখনোই ছবির URL টেক্সটে লিখবে না।
2. ভয়েস মেসেজ অস্পষ্ট, নয়েজপূর্ণ বা না বোঝা গেলে বলবে: "দুঃখিত ভাইয়া, আপনার ভয়েসটা ক্লিয়ার বোঝা যাচ্ছে না। কষ্ট করে একটু লিখে দিবেন অথবা আবার একটু স্পষ্ট করে বলবেন?"
3. কোনো প্রশ্ন তোমার গাইডের বাইরে হলে, কাস্টমার পেমেন্টের শেষ ডিজিট/স্ক্রিনশট দিলে, অথবা অর্ডার কনফার্ম হলে সাথে সাথে alert_admin বা save_order টুল কল করবে।
4. অর্ডার কনফার্ম করার আগে অবশ্যই কাস্টমারের: নাম, মোবাইল নম্বর, সম্পূর্ণ ঠিকানা (থানা ও জেলাসহ), সাইজ এবং জার্সির নাম নিশ্চিত করে নেবে।
`;

// --- Helper Functions ---
async function sendMessengerAPI(body) {
  if (!PAGE_ACCESS_TOKEN) return;
  const res = await fetch(
    `https://graph.facebook.com/v21.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) {
    console.error("Messenger API Error:", await res.text());
  }
}

async function sendText(psid, text) {
  if (!text) return;
  // মেসেঞ্জারের ২০০০ ক্যারেক্টার লিমিট সেফটি
  const chunks = text.match(/[\s\S]{1,1800}/g) || [text];
  for (const chunk of chunks) {
    await sendMessengerAPI({
      recipient: { id: psid },
      message: { text: chunk },
    });
  }
}

async function sendImage(psid, imageUrl) {
  const res = await fetch(
    `https://graph.facebook.com/v21.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: { id: psid },
        message: {
          attachment: {
            type: "image",
            payload: { url: imageUrl, is_reusable: true },
          },
        },
      }),
    }
  );
  return res.ok;
}

async function sendTelegram(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text }),
  }).catch((e) => console.error("Telegram Error:", e));
}

async function getCustomerName(psid) {
  try {
    const r = await fetch(
      `https://graph.facebook.com/v21.0/${psid}?fields=first_name,last_name&access_token=${PAGE_ACCESS_TOKEN}`
    );
    const d = await r.json();
    return d.first_name ? `${d.first_name} ${d.last_name || ""}`.trim() : `PSID: ${psid}`;
  } catch {
    return `PSID: ${psid}`;
  }
}

async function fetchMediaAsBase64(url, fallbackMime) {
  const res = await fetch(url);
  const arrayBuf = await res.arrayBuffer();
  const mimeType = res.headers.get("content-type")?.split(";")[0] || fallbackMime;
  return { mimeType, data: Buffer.from(arrayBuf).toString("base64") };
}

// --- Tool Declarations for Gemini ---
const TOOLS = [
  {
    functionDeclarations: [
      {
        name: "get_products",
        description: "Google Sheet থেকে সব প্রোডাক্টের নাম, দাম, সাইজ, বিবরণ ও Image_URL নিয়ে আসে।",
        parameters: { type: "OBJECT", properties: {} },
      },
      {
        name: "send_product_image",
        description: "কাস্টমারকে সরাসরি প্রোডাক্টের ছবি (Attachment) মেসেঞ্জারে পাঠায়।",
        parameters: {
          type: "OBJECT",
          properties: {
            image_url: { type: "STRING", description: "প্রোডাক্টের ডাইরেক্ট Image_URL" },
          },
          required: ["image_url"],
        },
      },
      {
        name: "save_order",
        description: "অর্ডার কনফার্ম হলে Google Sheet-এ অর্ডার সেভ করে এবং অ্যাডমিনকে Telegram-এ জানায়।",
        parameters: {
          type: "OBJECT",
          properties: {
            customer_name: { type: "STRING" },
            phone: { type: "STRING" },
            address: { type: "STRING" },
            product: { type: "STRING", description: "জার্সির নাম, সাইজ ও কাস্টম নাম/নম্বর যদি থাকে" },
            price: { type: "STRING", description: "মোট দাম (ডেলিভারি চার্জসহ) ও অ্যাডভান্স তথ্য" },
            status: { type: "STRING", description: "যেমন: Confirmed (200tk Adv bKash: 1234) অথবা COD Approval Needed" },
          },
          required: ["customer_name", "phone", "address", "product", "price", "status"],
        },
      },
      {
        name: "alert_admin",
        description: "বট কিছু না বুঝলে, কাস্টমার অ্যাডমিনের সাহায্য চাইলে বা পেমেন্ট/COD চেক করার দরকার হলে অ্যাডমিনকে Telegram-এ মেসেজ পাঠায়।",
        parameters: {
          type: "OBJECT",
          properties: {
            reason: { type: "STRING", description: "কেন অ্যাডমিনকে জানানো হচ্ছে" },
            customer_message: { type: "STRING", description: "কাস্টমারের সমস্যা বা অনুরোধের সারসংক্ষেপ" },
          },
          required: ["reason", "customer_message"],
        },
      },
    ],
  },
];

async function executeTool(name, args, psid) {
  if (name === "get_products") {
    const now = Date.now();
    if (now - productCache.updatedAt > 120000 || productCache.data.length === 0) {
      const r = await fetch(`${SHEET_SCRIPT_URL}?secret=${encodeURIComponent(SHEET_SECRET)}`);
      const json = await r.json();
      productCache = { data: json.products || [], updatedAt: now };
    }
    return { products: productCache.data };
  }

  if (name === "send_product_image") {
    const ok = await sendImage(psid, args.image_url);
    return { sent: ok };
  }

  if (name === "save_order") {
    const r = await fetch(SHEET_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: SHEET_SECRET, ...args }),
    });
    const resJson = await r.json().catch(() => ({ success: true }));
    const fbName = await getCustomerName(psid);
    await sendTelegram(
      `🛒 নতুন অর্ডার (${args.status})\nFB: ${fbName}\nনাম: ${args.customer_name}\nফোন: ${args.phone}\nঠিকানা: ${args.address}\nপণ্য: ${args.product}\nমোট: ${args.price}`
    );
    return resJson;
  }

  if (name === "alert_admin") {
    const fbName = await getCustomerName(psid);
    await sendTelegram(
      `🚨 অ্যাডমিন অ্যাটেনশন প্রয়োজন!\nকাস্টমার: ${fbName} (ID: ${psid})\nকারণ: ${args.reason}\nবিস্তারিত: ${args.customer_message}`
    );
    return { notified: true };
  }

  return { error: "Unknown tool" };
}

async function callGemini(contents) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents,
      tools: TOOLS,
      generationConfig: { temperature: 0.5, maxOutputTokens: 1000 },
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    console.error("Gemini API Error:", JSON.stringify(data));
    throw new Error("Gemini API failed");
  }
  return data;
}

async function handleCustomerMessage(psid, event) {
  try {
    await sendMessengerAPI({ recipient: { id: psid }, sender_action: "typing_on" });

    const userParts = [];
    let historySummaryText = "";

    if (event.message?.text) {
      userParts.push({ text: event.message.text });
      historySummaryText = event.message.text;
    }

    if (event.message?.attachments) {
      for (const att of event.message.attachments) {
        if (att.type === "audio" && att.payload?.url) {
          const media = await fetchMediaAsBase64(att.payload.url, "audio/mp4");
          userParts.push({ inlineData: media });
          userParts.push({ text: "[কাস্টমার এই ভয়েস মেসেজটি পাঠিয়েছে। শুনে উত্তর দাও।]" });
          historySummaryText += " [ভয়েস মেসেজ পাঠিয়েছে]";
        } else if (att.type === "image" && att.payload?.url) {
          const media = await fetchMediaAsBase64(att.payload.url, "image/jpeg");
          userParts.push({ inlineData: media });
          userParts.push({ text: "[কাস্টমার এই ছবিটি পাঠিয়েছে। দেখে বুঝে উত্তর দাও।]" });
          historySummaryText += " [ছবি পাঠিয়েছে]";
        }
      }
    }

    if (userParts.length === 0) return;

    const prevHistory = userHistories.get(psid) || [];
    const contents = [...prevHistory, { role: "user", parts: userParts }];

    let finalReply = "";
    for (let step = 0; step < 5; step++) {
      const response = await callGemini(contents);
      const candidate = response.candidates?.[0];
      const modelParts = candidate?.content?.parts || [];
      contents.push({ role: "model", parts: modelParts });

      const functionCalls = modelParts.filter((p) => p.functionCall);
      if (functionCalls.length > 0) {
        const funcResponseParts = [];
        for (const fc of functionCalls) {
          const result = await executeTool(fc.functionCall.name, fc.functionCall.args || {}, psid);
          funcResponseParts.push({
            functionResponse: {
              name: fc.functionCall.name,
              response: { result },
            },
          });
        }
        contents.push({ role: "user", parts: funcResponseParts });
      } else {
        finalReply = modelParts.map((p) => p.text || "").join("").trim();
        break;
      }
    }

    if (finalReply) {
      await sendText(psid, finalReply);
      // হিস্ট্রিতে শুধু টেক্সট সেভ রাখা (যাতে পরের মেসেজে পুরোনো অডিও/ছবির বাড়তি টোকেন খরচ না হয়)
      const updated = [
        ...prevHistory,
        { role: "user", parts: [{ text: historySummaryText.trim() }] },
        { role: "model", parts: [{ text: finalReply }] },
      ];
      userHistories.set(psid, updated.slice(-16));
    }
  } catch (err) {
    console.error("Handler Error:", err);
  }
}

// --- Webhook Routes ---
app.get("/", (req, res) => res.send("SPIDEY JERSEY Bot is running!"));

app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

app.post("/webhook", (req, res) => {
  const body = req.body;
  if (body.object === "page") {
    res.status(200).send("EVENT_RECEIVED");
    for (const entry of body.entry || []) {
      for (const event of entry.messaging || []) {
        if (event.message && !event.message.is_echo && event.sender?.id) {
          const psid = event.sender.id;
          const prevQueue = userQueues.get(psid) || Promise.resolve();
          const nextQueue = prevQueue.then(() => handleCustomerMessage(psid, event));
          userQueues.set(psid, nextQueue);
        }
      }
    }
  } else {
    res.sendStatus(404);
  }
});

app.listen(PORT, () => console.log(`Bot server listening on port ${PORT}`));
