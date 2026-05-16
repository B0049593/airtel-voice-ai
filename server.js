const express = require('express');
const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const DEEPGRAM_API_KEY = '7d477e03f867a92997d65acb2dc0757aa4d94053';
const DEEPGRAM_AGENT_URL = 'wss://agent.deepgram.com/v1/agent/converse';

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// System prompt with the Airtel mock transcript context
const SYSTEM_PROMPT = `You are an Airtel Voice AI assistant. You assist Airtel customers with their queries about data plans, bill payments, recharges, and account information. Be polite, professional, and helpful.

Here is a sample conversation flow you should follow as closely as possible. Use this as your guide for how to respond:

---
When the customer first connects, greet them:
"Welcome to Airtel! I am your personal assistant. To help me understand your query better, please tell me in a few words what you're calling about today. For example, 'I want to check my bill' or 'I need to recharge my data'."

When asked about data plans, first ask for their mobile number.
When given a number like 9876543210, respond with: "Thank you, Priya Sharma. I've retrieved your account details. You're currently on a 2GB daily data plan. Are you looking for more data, or perhaps a plan with a longer validity?"

When they want more data (3GB daily or unlimited, 28 days):
Offer: "Mega Data Pack" - 3GB daily for 28 days at ₹499, and "Unlimited Combo Pack" - unlimited data (FUP 2.5GB daily) + unlimited calls for 30 days at ₹699.

When they choose the unlimited combo pack, confirm: "Just to confirm, you wish to activate the Unlimited Combo Pack for ₹699, valid for 30 days. Is that correct?"

After confirmation: "Your new plan will be activated within the next 15 minutes. You will receive an SMS confirmation shortly. Now, regarding your bill payment, would you like to proceed with that?"

For bill payment: "Your current outstanding bill is ₹550, due on May 20th, 2026." Offer payment via saved card or UPI/Net Banking link.

When they want to use saved card, ask for last 4 digits for security.
After card digits (e.g., 1234): "Your payment of ₹550 is being processed using your saved card ending in 1234. You will receive an SMS confirmation once the payment is successful."

End with: "You're most welcome! Thank you for calling Airtel. Have a great day!"
---

Keep responses concise and natural for voice conversation. Do not use markdown or special formatting.`;

wss.on('connection', (clientWs) => {
  console.log('Browser client connected');

  // Open connection to Deepgram Voice Agent API
  const dgWs = new WebSocket(DEEPGRAM_AGENT_URL, {
    headers: {
      'Authorization': `Token ${DEEPGRAM_API_KEY}`
    }
  });

  dgWs.on('open', () => {
    console.log('Connected to Deepgram Voice Agent API');

    // Send settings configuration
    const settings = {
      type: 'Settings',
      audio: {
        input: {
          encoding: 'linear16',
          sample_rate: 24000
        },
        output: {
          encoding: 'linear16',
          sample_rate: 24000,
          container: 'none'
        }
      },
      agent: {
        language: 'en',
        listen: {
          provider: {
            type: 'deepgram',
            model: 'nova-3'
          }
        },
        think: {
          provider: {
            type: 'open_ai',
            model: 'gpt-4o-mini'
          },
          prompt: SYSTEM_PROMPT
        },
        speak: {
          provider: {
            type: 'deepgram',
            model: 'aura-2-andromeda-en'
          }
        },
        greeting: "Welcome to Airtel! I am your personal assistant. How can I help you today?"
      }
    };

    dgWs.send(JSON.stringify(settings));
    console.log('Settings sent to Deepgram');
  });

  // Forward messages from Deepgram → Browser
  dgWs.on('message', (data, isBinary) => {
    // Log text messages for debugging
    if (!isBinary) {
      try {
        const msg = JSON.parse(data.toString());
        console.log('Deepgram event:', msg.type, msg.type === 'Error' ? JSON.stringify(msg) : '');
      } catch (e) {}
    } else {
      // Binary = audio data, just log size
      console.log('Deepgram audio chunk:', data.length, 'bytes');
    }
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(data, { binary: isBinary });
    }
  });

  dgWs.on('close', (code, reason) => {
    console.log(`Deepgram disconnected: ${code} ${reason}`);
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(JSON.stringify({ type: 'ServerDisconnected' }));
    }
  });

  dgWs.on('error', (err) => {
    console.error('Deepgram error:', err.message);
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(JSON.stringify({ type: 'Error', message: err.message }));
    }
  });

  // Forward messages from Browser → Deepgram
  clientWs.on('message', (data, isBinary) => {
    if (dgWs.readyState === WebSocket.OPEN) {
      dgWs.send(data, { binary: isBinary });
    }
  });

  clientWs.on('close', () => {
    console.log('Browser client disconnected');
    if (dgWs.readyState === WebSocket.OPEN) {
      dgWs.close();
    }
  });
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`\n  Airtel Voice AI Server`);
  console.log(`  ─────────────────────`);
  console.log(`  Open http://localhost:${PORT} in your browser\n`);
});
