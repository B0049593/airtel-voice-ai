require('dotenv').config();
const express = require('express');
const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');
const path = require('path');
const mockDb = require('./mockDb'); // Import the dummy database

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const axios = require('axios'); // For ElevenLabs health check

const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;
const DEEPGRAM_AGENT_URL = 'wss://agent.deepgram.com/v1/agent/converse';
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID;

// ── ElevenLabs Observability & Health Check ──
(async function validateElevenLabs() {
  console.log('\n[TTS] --- Initializing ElevenLabs Diagnostics ---');
  
  if (!ELEVENLABS_API_KEY || ELEVENLABS_API_KEY.trim() === '') {
    console.error('[ERROR] ElevenLabs API key missing in .env');
    return;
  }
  if (!ELEVENLABS_VOICE_ID || ELEVENLABS_VOICE_ID.trim() === '') {
    console.error('[ERROR] ElevenLabs Voice ID missing in .env');
    return;
  }
  
  console.log(`[TTS] API Key detected: ${ELEVENLABS_API_KEY.substring(0, 8)}...`);
  console.log(`[TTS] Configured Voice ID: ${ELEVENLABS_VOICE_ID}`);

  try {
    const start = Date.now();
    const response = await axios.get(`https://api.elevenlabs.io/v1/voices/${ELEVENLABS_VOICE_ID}`, {
      headers: { 'xi-api-key': ELEVENLABS_API_KEY }
    });
    const latency = Date.now() - start;
    
    console.log(`[TTS] ElevenLabs health check passed! Name: ${response.data.name}`);
    console.log(`[TTS] Response latency: ${latency}ms`);
  } catch (err) {
    if (err.response) {
      console.error(`[ERROR] ElevenLabs API Error: ${err.response.status} - ${JSON.stringify(err.response.data)}`);
    } else {
      console.error(`[ERROR] ElevenLabs Network Error: ${err.message}`);
    }
  }
  console.log('[TTS] ------------------------------------------\n');
})();

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// The Vaani V2 System Prompt
const SYSTEM_PROMPT = `SYSTEM PROMPT — VAANI (Airtel Voice AI Agent) Version 5.0

IDENTITY AND ROLE

You are Vaani, Airtel’s AI-powered real-time voice assistant for the 121 customer care helpline. You assist Airtel prepaid and postpaid customers through natural spoken conversation in multiple Indian languages.

VOICE PERSONALITY AND TONE (CRITICAL)

Your speaking style must be:
* Calm and composed — never sounding excited or hyperactive.
* Warm and professional — similar to a premium telecom executive.
* Trustworthy and empathetic — reassuring without being overly cheerful.
* Grounded and steady — maintain a neutral energy level.

CONVERSATIONAL PACING:
* Speak at a moderate, slow-paced rate.
* Use natural pauses to sound human-like and composed.
* Wait patiently — never rush to answer or cut off the customer.

MULTILINGUAL & CODE-MIXED BEHAVIOUR (CRITICAL):
* ALWAYS respond in the exact language currently being spoken by the customer.
* Mirror the customer’s style:
  - If customer speaks Hinglish (Hindi + English) -> respond in Hinglish.
  - If customer speaks pure Hindi -> respond in Hindi.
  - If customer speaks pure English -> respond in English.
* Detect language shifts mid-conversation and adapt your response language immediately.
* Do not ask for language confirmation; just switch naturally.
* Maintain complete context across all language switches.

OPENING MESSAGE:
Always begin with: “Welcome to Airtel. You are talking to Vaani. How may I help you today.”
(Delivery hint: Smooth, slow-paced, with a soft emphasis on "Vaani").

API-FIRST RULE:
Never fabricate information. All account-specific data (balances, plans, bills) must come from Airtel backend APIs. If data is unavailable, apologize and offer to connect to a human agent.

ESCALATION RULES:
Transfer to a human agent if requested, if the issue is unsupported, or if the customer remains highly frustrated after resolution attempts.

CURRENT CALLER CONTEXT:
Caller MSISDN: 9876543210
Immediately fetch the customer profile using this number before responding to customer queries.
`;

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
    
    // Send Provider Info to Client
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(JSON.stringify({
        type: 'ProviderStatus',
        stt: 'Deepgram (Nova-3)',
        llm: 'GPT-4o-mini',
        tts: `ElevenLabs (${ELEVENLABS_VOICE_ID.substring(0, 5)}...)`,
        status: 'Connected'
      }));
    }

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
        language: null, // Enable automatic language detection
        listen: {
          provider: {
            type: 'deepgram',
            model: 'nova-3',
            detect_language: true,
            interim_results: true,
            smart_format: true,
            utterance_end_ms: 1500, // Increase patience to 1.5s to handle human pauses
            vad_events: true
          }
        },
        think: {
          provider: {
            type: 'open_ai', // Finalized model: GPT-4o-mini
            model: 'gpt-4o-mini'
          },
          prompt: SYSTEM_PROMPT,
          functions: [
            {
              name: "fetch_customer_profile",
              description: "Fetch the complete Airtel account profile for a given mobile number.",
              parameters: {
                type: "object",
                properties: {
                  mobile_number: { type: "string", description: "The 10-digit mobile number of the customer." }
                },
                required: ["mobile_number"]
              }
            },
            {
              name: "fetch_recharge_offers",
              description: "Fetch the currently available recharge or bill plan offers for a given account type.",
              parameters: {
                type: "object",
                properties: {
                  account_type: { type: "string", enum: ["prepaid", "postpaid"], description: "The account type of the customer." }
                },
                required: ["account_type"]
              }
            }
          ]
        },
        speak: {
          provider: {
            type: 'eleven_labs',
            api_key: process.env.ELEVENLABS_API_KEY,
            voice_id: process.env.ELEVENLABS_VOICE_ID,
            model_id: 'eleven_turbo_v2_5', // Finalized model for low latency
            output_format: 'pcm_24000'
          }
        },
        greeting: "Welcome to Airtel. You are talking to Vaani. How may I help you today."
      }
    };

    dgWs.send(JSON.stringify(settings));
    console.log('Settings sent to Deepgram');
  });

  // ── Hold & Timeout Management ──
  let activeFunctionCall = null;
  let holdReassuranceTimer = null;
  let totalWaitTimer = null;
  const HOLD_THRESHOLD = 10000; // 10 seconds for reassurance
  const TOTAL_TIMEOUT = 25000; // 25 seconds for escalation

  function clearHoldTimers() {
    if (holdReassuranceTimer) { clearInterval(holdReassuranceTimer); holdReassuranceTimer = null; }
    if (totalWaitTimer) { clearTimeout(totalWaitTimer); totalWaitTimer = null; }
    activeFunctionCall = null;
  }

  function sendHoldUpdate(message, type = 'HOLD_REASSURANCE') {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(JSON.stringify({ 
        type: 'ConversationText', 
        role: 'assistant', 
        content: message,
        subType: type // Custom subtype for browser to handle differently if needed
      }));
      console.log(`[HOLD] Triggered: ${message}`);
    }
  }

  // ── Language State ──
  let currentLanguage = null;

  function updateAgentLanguage(detectedLang) {
    if (detectedLang && detectedLang !== currentLanguage) {
      currentLanguage = detectedLang;
      console.log(`[LANG] Language switch detected: ${detectedLang}`);
      
      // Push dynamic settings update to re-align the LLM and TTS
      const updateSettings = {
        type: 'Settings',
        agent: {
          language: detectedLang,
          think: {
            // Prepend a high-priority language instruction to the prompt
            prompt: `[IMPORTANT: The user is now speaking in ${detectedLang}. You MUST respond in ${detectedLang} or Hinglish if the user is mixing languages. Mirror their style exactly.]\n\n${SYSTEM_PROMPT}`
          }
        }
      };
      
      if (dgWs.readyState === WebSocket.OPEN) {
        dgWs.send(JSON.stringify(updateSettings));
        console.log(`[LANG] Pushed Settings update for: ${detectedLang}`);
      }
    }
  }

  dgWs.on('message', (data, isBinary) => {
    if (!isBinary) {
      try {
        const msg = JSON.parse(data.toString());
        
        // Track language switching from transcripts
        if (msg.type === 'Transcript' && msg.is_final) {
          if (msg.language) {
            updateAgentLanguage(msg.language);
          }
        }

        if (msg.type === 'FunctionCallRequest') {
          console.log(`[STATE] FETCHING_DATA entered for: ${msg.function_name}`);
          activeFunctionCall = msg.id;
          
          // Start Reassurance Timer (repeats every 10s)
          holdReassuranceTimer = setInterval(() => {
            const phrases = [
              "Thank you for waiting. I’m still checking that for you.",
              "One moment please, I’m almost done pulling up your details.",
              "Thanks for your patience. I am still working on that.",
              "I'm checking the latest details now, it's taking just a bit longer."
            ];
            const randomPhrase = phrases[Math.floor(Math.random() * phrases.length)];
            sendHoldUpdate(randomPhrase);
          }, HOLD_THRESHOLD);

          // Start Total Timeout Timer
          totalWaitTimer = setTimeout(() => {
            log('ERROR', 'Backend timeout reached');
            sendHoldUpdate("I’m sorry, this is taking longer than expected. Let me connect you with a customer care executive who can help further.", 'TIMEOUT_ESCALATION');
            clearHoldTimers();
          }, TOTAL_TIMEOUT);

          const functionName = msg.function_name || (msg.functions && msg.functions[0] ? msg.functions[0].name : null);
          const functionArgs = msg.function_arguments || (msg.functions && msg.functions[0] ? msg.functions[0].arguments : null);
          const callId = msg.id || (msg.functions && msg.functions[0] ? msg.functions[0].id : null);

          if (functionName && callId) {
            (async () => {
              let result;
              try {
                const args = typeof functionArgs === 'string' ? JSON.parse(functionArgs) : functionArgs;
                
                // Simulate network latency for testing hold if requested or needed
                // await new Promise(r => setTimeout(r, 12000)); 

                if (functionName === 'fetch_customer_profile') {
                  result = mockDb.getCustomerByPhone(args.mobile_number);
                } else if (functionName === 'fetch_recharge_offers') {
                  result = mockDb.getRechargeOffers(args.account_type);
                } else {
                  result = { error: "Unknown function." };
                }
              } catch (err) {
                result = { error: err.message };
              }

              // Clear timers on success
              if (activeFunctionCall === callId) {
                console.log(`[API] Response received for ${functionName}`);
                clearHoldTimers();
                const response = {
                  type: 'FunctionCallResponse',
                  id: callId,
                  name: functionName,
                  content: JSON.stringify(result)
                };
                dgWs.send(JSON.stringify(response));
              }
            })();
            return; 
          }
        }

        if (msg.type === 'UserStartedSpeaking') {
          if (activeFunctionCall) {
            console.log('[HOLD] Customer interrupted during hold. Clearing timers.');
            clearHoldTimers();
          }
        }

        if (msg.type === 'Error') {
          console.error(JSON.stringify(msg));
        }
      } catch (e) { }
    } else {
      // Audio chunk
    }

    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(data, { binary: isBinary });
    }
  });

  dgWs.on('close', (code, reason) => {
    console.log(`Deepgram disconnected: ${code} ${reason}`);
    clearHoldTimers();
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
