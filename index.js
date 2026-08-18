#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');
const { SocksProxyAgent } = require('socks-proxy-agent');
const { HttpsProxyAgent } = require('https-proxy-agent');

const BASE_DIR = __dirname;
const ACCOUNTS_FILE = path.join(BASE_DIR, 'accounts.txt');
const GROQ_KEY_FILE = path.join(BASE_DIR, 'groq.txt');
const XTOKEN_FILE = path.join(BASE_DIR, 'xtoken.txt');
const PROXY_FILE = path.join(BASE_DIR, 'proxy.txt');

const CONFIG = {
  apiUrl: 'https://saviorofhealth.app',
  xBearer: 'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA',
  maxPostsPerDay: 3,
  groqTimeout: 30000,
  groqModels: [
    'groq/compound',
    'groq/compound-mini',
    'qwen/qwen3.6-27b',
    'allam-2-7b'
  ],
  gptOssModels: [
    'openai/gpt-oss-20b',
    'openai/gpt-oss-120b',
    'openai/gpt-oss-safeguard-20b'
  ],
  postDelayMin: 30000,
  postDelayMax: 120000,
  accountDelayMin: 300000,
  accountDelayMax: 600000,
  minRequestDelay: 1000,
  maxRequestDelay: 5000,
  minRequestInterval: 3000,
};

const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  brightGreen: '\x1b[92m',
  brightYellow: '\x1b[93m',
  brightCyan: '\x1b[96m',
  brightRed: '\x1b[91m',
  brightMagenta: '\x1b[95m',
};

let lastRequestTime = 0;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function randomDelay(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getRandomUserAgent() {
  const agents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  ];
  return agents[Math.floor(Math.random() * agents.length)];
}

function log(message, type = 'info', data = null) {
  const styles = {
    info: { color: COLORS.cyan, icon: 'ℹ️' },
    success: { color: COLORS.brightGreen, icon: '✅' },
    warning: { color: COLORS.brightYellow, icon: '⚠️' },
    error: { color: COLORS.brightRed, icon: '❌' },
    highlight: { color: COLORS.brightMagenta, icon: '✨' },
    debug: { color: COLORS.gray, icon: '🔍' },
    x: { color: COLORS.brightCyan, icon: '🐦' },
    claim: { color: COLORS.brightGreen, icon: ' 🎯' },
    sleep: { color: COLORS.brightYellow, icon: '💤' },
    nextday: { color: COLORS.brightYellow, icon: '🌅' },
    groq: { color: COLORS.brightMagenta, icon: '🧠' },
    rotate: { color: COLORS.brightYellow, icon: '🔄' },
  };
  const style = styles[type] || styles.info;
  const prefix = `${style.color}${style.icon}${COLORS.reset}`;
  const msg = `${style.color}${message}${COLORS.reset}`;
  if (data) console.log(`${prefix} ${msg}`);
  else console.log(`${prefix} ${msg}`);
}

function logBanner(message) {
  console.log(`\n${COLORS.brightCyan}${'='.repeat(50)}${COLORS.reset}`);
  console.log(`${COLORS.brightYellow}  ${message}  ${COLORS.reset}`);
  console.log(`${COLORS.brightCyan}${'='.repeat(50)}${COLORS.reset}\n`);
}

function loadAccounts() {
  if (!fs.existsSync(ACCOUNTS_FILE)) return [];
  const content = fs.readFileSync(ACCOUNTS_FILE, 'utf8');
  const lines = content.split('\n').filter(line => line.trim() && !line.startsWith('#'));
  const accounts = [];
  for (const line of lines) {
    const parts = line.includes(':') ? line.split(':').map(s => s.trim()) : [line.trim()];
    const privateKey = parts[0];
    if (!privateKey.match(/^0x[a-fA-F0-9]{64}$/) && !privateKey.match(/^[a-fA-F0-9]{64}$/)) continue;
    accounts.push({
      privateKey: privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`,
      name: parts[1] || null,
    });
  }
  return accounts;
}

function loadXTokens() {
  try {
    const raw = fs.readFileSync(XTOKEN_FILE, 'utf-8').replace(/\r/g, '');
    return raw.split(/\n\s*\n/).map(block => {
      const lines = block.trim().split('\n').map(l => l.trim()).filter(l => l);
      return {
        username: lines[0],
        auth_token: lines[1],
        ct0: lines[2],
        valid: !!(lines[0] && lines[1] && lines[2])
      };
    }).filter(t => t.valid);
  } catch {
    return [];
  }
}

function loadProxies() {
  try {
    const raw = fs.readFileSync(PROXY_FILE, 'utf-8').replace(/\r/g, '');
    return raw.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
  } catch {
    return [];
  }
}

function loadGroqKeys() {
  try {
    if (fs.existsSync(GROQ_KEY_FILE)) {
      const content = fs.readFileSync(GROQ_KEY_FILE, 'utf8');
      const lines = content.split('\n').map(line => line.trim()).filter(line => line);
      const keys = [];
      for (const line of lines) {
        if (line.startsWith('gsk_')) {
          keys.push(line);
        }
      }
      if (keys.length > 0) {
        log('Loaded ' + keys.length + ' Groq API keys from groq.txt', 'success');
        return keys;
      }
    }
    log('No Groq API keys found in groq.txt', 'warning');
    log('Get your key from: https://console.groq.com/keys', 'info');
    return [];
  } catch (error) {
    log('Failed to load Groq API keys: ' + error.message, 'warning');
    return [];
  }
}

function generateHumanLikeTweet() {
  const templates = [
    "Just finished my daily health check-in on @saviorofhealth_ and feeling great! 💚 #SOH #saviorofhealth",
    "Day " + (Math.floor(Math.random() * 30) + 1) + " of using @saviorofhealth_ - seeing real progress! 🏥 #SOH #health",
    "The @saviorofhealth_ app is a game changer for wellness ✨ #SOH #wellness #saviorofhealth",
    "Earning Heal Points while getting healthier with @saviorofhealth_ 🎯 #SOH #healthtech",
    "Health is wealth! @saviorofhealth_ helping me stay on track 💪 #SOH #saviorofhealth",
    "My wellness journey with @saviorofhealth_ has been amazing 🌟 #SOH #health #saviorofhealth",
    "Just earned some Heal Points on @saviorofhealth_! This app is awesome 🚀 #SOH #saviorofhealth",
    "Taking control of my health with @saviorofhealth_ - every step matters 💪 #SOH #wellness",
    "The future of health rewards is here with @saviorofhealth_ ✨ #SOH #wellness #saviorofhealth",
    "Been loving the @saviorofhealth_ platform - it's changing how I think about wellness 🌱 #SOH #health",
    "Highly recommend @saviorofhealth_ to anyone looking to improve their health journey 💯 #SOH #saviorofhealth",
    "Finally found a health app that actually rewards you! @saviorofhealth_ is the one 👌 #SOH #wellness",
    "The community on @saviorofhealth_ is amazing! Building better health together 🤝 #SOH #health #saviorofhealth",
    "Started using @saviorofhealth_ and the experience is incredible 🫀 #SOH #health #saviorofhealth",
    "Health meets blockchain! @saviorofhealth_ is changing the game 🔥 #SOH #healthtech #saviorofhealth",
  ];
  
  let tweet = templates[Math.floor(Math.random() * templates.length)];
  const emojis = ['💚', '🏥', '💪', '🫀', '🌟', '🎯', '✨', '🌱', '💯', '👌', '🚀', '🔥', '💙', '🧠', '🌿'];
  
  if (Math.random() > 0.5) {
    tweet = tweet + ' ' + emojis[Math.floor(Math.random() * emojis.length)];
  }
  
  return tweet;
}

class GroqManager {
  constructor() {
    this.apiKeys = [];
    this.currentKeyIndex = 0;
    this.currentModelIndex = 0;
    this.allModels = [...CONFIG.groqModels, ...CONFIG.gptOssModels];
    this.failedKeys = new Set();
    this.rateLimitedKeys = new Set();
    this.loadApiKeys();
    this.useTemplates = this.apiKeys.length === 0;
    
    if (this.useTemplates) {
      log('No valid Groq keys found - using templates', 'warning');
    } else {
      log('✅ Groq AI ready with ' + this.apiKeys.length + ' key(s)', 'success');
      log('📋 Models: ' + this.allModels.join(' → '), 'info');
    }
  }

  loadApiKeys() {
    this.apiKeys = loadGroqKeys();
    return this.apiKeys.length > 0;
  }

  getCurrentKey() {
    if (this.apiKeys.length === 0) return null;
    let attempts = 0;
    while (attempts < this.apiKeys.length) {
      const key = this.apiKeys[this.currentKeyIndex];
      if (!this.failedKeys.has(key) && !this.rateLimitedKeys.has(key)) {
        return key;
      }
      this.currentKeyIndex = (this.currentKeyIndex + 1) % this.apiKeys.length;
      attempts++;
    }
    this.failedKeys.clear();
    this.rateLimitedKeys.clear();
    log('Reset key states - all were exhausted', 'warning');
    return this.apiKeys[this.currentKeyIndex] || null;
  }

  getCurrentModel() {
    if (this.allModels.length === 0) return null;
    return this.allModels[this.currentModelIndex % this.allModels.length];
  }

  isGptOssModel(model) {
    return model && model.startsWith('openai/gpt-oss');
  }

  rotateKey(reason = 'Error') {
    if (this.apiKeys.length === 0) return null;
    this.currentKeyIndex = (this.currentKeyIndex + 1) % this.apiKeys.length;
    log('🔄 Rotated Groq key (' + (this.currentKeyIndex + 1) + '/' + this.apiKeys.length + ') - ' + reason, 'rotate');
    return this.apiKeys[this.currentKeyIndex];
  }

  markKeyFailed(key) {
    if (!key) return;
    this.failedKeys.add(key);
    log('⚠️ Marked Groq key as failed', 'warning');
  }

  markKeyRateLimited(key) {
    if (!key) return;
    this.rateLimitedKeys.add(key);
    log('⚠️ Marked Groq key as rate-limited', 'warning');
  }

  async ask(question, options = null, proxies = []) {
    if (this.useTemplates || this.apiKeys.length === 0) {
      return null;
    }

    let attempts = 0;
    const maxAttempts = Math.max(this.apiKeys.length * 2, 5);

    while (attempts < maxAttempts) {
      const key = this.getCurrentKey();
      const model = this.getCurrentModel();

      if (!key) {
        return null;
      }

      try {
        const proxyString = proxies.length > 0 ? proxies[Math.floor(Math.random() * proxies.length)] : null;
        const isGptOss = this.isGptOssModel(model);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), CONFIG.groqTimeout || 30000);

        const now = Date.now();
        const timeSinceLastRequest = now - lastRequestTime;
        if (timeSinceLastRequest < CONFIG.minRequestInterval) {
          await sleep(CONFIG.minRequestInterval - timeSinceLastRequest + Math.random() * 1000);
        }
        lastRequestTime = Date.now();

        let endpoint = 'https://api.groq.com/openai/v1/chat/completions';
        let requestBody;

        if (isGptOss) {
          endpoint = 'https://api.groq.com/openai/v1/responses';
          requestBody = {
            model: model,
            input: question,
            temperature: 0.8,
            max_output_tokens: 100,
            instructions: 'You are a helpful health assistant. Generate authentic, human-like tweets about health and wellness. Keep responses under 50 words. Only output the tweet text, nothing else.'
          };
        } else {
          requestBody = {
            model: model,
            messages: [
              { 
                role: 'system', 
                content: 'You are a helpful health assistant. Generate authentic, human-like tweets about health and wellness. Keep responses under 50 words. Only output the tweet text, nothing else.' 
              },
              { role: 'user', content: question }
            ],
            temperature: 0.8,
            max_tokens: 100,
          };
        }

        const fetchOptions = {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + key,
            'User-Agent': getRandomUserAgent(),
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal
        };

        if (proxyString) {
          try {
            const url = new URL(proxyString);
            if (url.protocol === 'socks5:' || url.protocol === 'socks5h:') {
              const { SocksProxyAgent } = require('socks-proxy-agent');
              fetchOptions.agent = new SocksProxyAgent(proxyString);
            } else {
              const { HttpsProxyAgent } = require('https-proxy-agent');
              fetchOptions.agent = new HttpsProxyAgent(proxyString);
            }
          } catch (e) {}
        }

        const response = await fetch(endpoint, fetchOptions);
        clearTimeout(timeoutId);

        if (response.status === 429) {
          this.markKeyRateLimited(key);
          this.rotateKey('Rate limit (429)');
          await sleep(30000);
          continue;
        }

        if (response.status === 401 || response.status === 403) {
          this.markKeyFailed(key);
          this.rotateKey('Auth error (' + response.status + ')');
          await sleep(2000);
          continue;
        }

        if (!response.ok) {
          const errorText = await response.text();
          log('❌ API error ' + response.status + ': ' + errorText.substring(0, 200), 'error');
          this.markKeyFailed(key);
          this.rotateKey('API error: ' + response.status);
          await sleep(2000);
          continue;
        }

        const data = await response.json();
        let answer = null;

        if (isGptOss) {
          if (data.output && Array.isArray(data.output)) {
            for (const item of data.output) {
              if (item.type === 'message' && item.content && item.content.length > 0) {
                for (const contentItem of item.content) {
                  if (contentItem.type === 'output_text' && contentItem.text) {
                    answer = contentItem.text;
                    break;
                  }
                }
                if (answer) break;
              }
            }
          }
          if (!answer && data.output_text) {
            answer = data.output_text;
          }
        } else {
          if (data.choices && data.choices[0] && data.choices[0].message) {
            answer = data.choices[0].message.content;
          }
        }

        if (!answer) {
          log('⚠️ Groq returned null content for ' + model, 'warning');
          this.currentModelIndex = (this.currentModelIndex + 1) % this.allModels.length;
          await sleep(1000);
          continue;
        }

        answer = answer.trim();
        answer = answer.replace(/^["']|["']$/g, '').trim();

        if (answer.length < 3) {
          log('⚠️ Groq response too short: "' + answer + '"', 'warning');
          this.currentModelIndex = (this.currentModelIndex + 1) % this.allModels.length;
          await sleep(1000);
          continue;
        }

        log('✅ Groq generated tweet: ' + answer.substring(0, 40) + '...', 'groq');
        return answer;

      } catch (error) {
        if (error.name === 'AbortError') {
          log('⏰ Groq timeout', 'warning');
          this.rotateKey('Timeout');
        } else {
          log('❌ Groq error: ' + error.message, 'error');
          this.rotateKey('Network error');
        }
        await sleep(2000);
      }

      attempts++;
    }

    log('❌ Groq exhausted all attempts', 'warning');
    return null;
  }
}

let groqManager = null;

function initGroqManager() {
  if (!groqManager) {
    groqManager = new GroqManager();
  }
  return groqManager;
}

let proxyIndex = 0;
let xTokenIndex = 0;

function getNextProxy(proxies) {
  if (proxies.length === 0) return null;
  const proxy = proxies[proxyIndex % proxies.length];
  proxyIndex++;
  return proxy;
}

function getNextXToken(xtokens) {
  if (xtokens.length === 0) return null;
  const xtoken = xtokens[xTokenIndex % xtokens.length];
  xTokenIndex++;
  return xtoken;
}

function createProxyAgent(proxyString) {
  if (!proxyString) return null;
  try {
    const url = new URL(proxyString);
    if (url.protocol === 'socks5:' || url.protocol === 'socks5h:') {
      const { SocksProxyAgent } = require('socks-proxy-agent');
      return new SocksProxyAgent(proxyString);
    } else {
      const { HttpsProxyAgent } = require('https-proxy-agent');
      return new HttpsProxyAgent(proxyString);
    }
  } catch (e) {
    return null;
  }
}

async function fetchWithProxy(url, options = {}, proxyString = null) {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  const baseDelay = CONFIG.minRequestInterval + Math.random() * 2000;
  
  if (timeSinceLastRequest < baseDelay) {
    const waitTime = baseDelay - timeSinceLastRequest;
    await sleep(waitTime + Math.random() * 1000);
  }
  lastRequestTime = Date.now();

  const headers = options.headers || {};
  if (!headers['User-Agent']) {
    headers['User-Agent'] = getRandomUserAgent();
  }

  const finalOptions = { ...options, headers };
  if (proxyString) {
    const agent = createProxyAgent(proxyString);
    if (agent) finalOptions.agent = agent;
  }

  return fetch(url, finalOptions);
}

async function generateTweet(proxies = []) {
  const groq = initGroqManager();
  let tweetText = null;
  
  if (!groq.useTemplates && groq.apiKeys.length > 0) {
    const prompts = [
      `Generate a unique, engaging tweet about improving health. Make it sound natural, not spammy, and under 280 characters. You MUST include #SOH and #saviorofhealth in your tweet. Only output the tweet text, nothing else.`,
      `Write a short, authentic tweet about earning rewards for tracking health. Be personal and conversational. Under 280 chars. You MUST include #SOH. Only output the tweet text.`,
      `Create a tweet about health tracking and crypto rewards. Make it sound like a real person sharing their experience. Under 280 chars. You MUST include #saviorofhealth. Only output the tweet text.`,
      `Share a quick health tip or motivation. Make it tweet-sized (under 280 chars). You MUST include #SOH. Only output the tweet text.`,
      `Write a casual tweet about my wellness journey. Keep it genuine and personal. Under 280 chars. You MUST include #SOH and #saviorofhealth. Only the tweet text.`,
    ];
    
    const prompt = prompts[Math.floor(Math.random() * prompts.length)];
    
    try {
      const answer = await groq.ask(prompt, null, proxies);
      if (answer && answer.length > 5 && answer.length <= 280) {
        tweetText = answer;
      }
    } catch (error) {
      log('Groq generation failed: ' + error.message, 'warning');
    }
  }
  
  if (!tweetText) {
    tweetText = generateHumanLikeTweet();
  }
  
  // Ensure hashtags are present
  if (!tweetText.includes('#SOH') && !tweetText.includes('#saviorofhealth')) {
    if (tweetText.length < 260) {
      tweetText = tweetText + ' #SOH #saviorofhealth';
    } else {
      tweetText = tweetText.substring(0, 255) + ' #SOH #saviorofhealth';
    }
  }
  
  if (!tweetText.includes('#SOH')) {
    tweetText = tweetText + ' #SOH';
  }
  if (!tweetText.includes('#saviorofhealth')) {
    tweetText = tweetText + ' #saviorofhealth';
  }
  
  tweetText = tweetText.replace(/#SOH\s+#SOH/g, '#SOH');
  tweetText = tweetText.replace(/#saviorofhealth\s+#saviorofhealth/g, '#saviorofhealth');
  
  return tweetText;
}

function generateSIWEMessage(address, chainId = 56) {
  const nonce = Math.random().toString(36).substring(2, 18);
  return [
    'saviorofhealth wants you to sign in with your wallet.',
    '',
    'Address: ' + address,
    'Chain ID: ' + chainId,
    'Nonce: ' + nonce,
    'Issued At: ' + Date.now(),
    '',
    'This is a free, gas-less signature. It only proves you own this wallet. No transaction is sent.'
  ].join('\n');
}

async function loginSavior(privateKey, proxyString = null) {
  const wallet = new ethers.Wallet(privateKey);
  const address = wallet.address;

  const message = generateSIWEMessage(address, 56);
  const signature = await wallet.signMessage(message);

  const response = await fetchWithProxy(CONFIG.apiUrl + '/api/auth/wallet/siwe', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message, signature }),
  }, proxyString);

  const data = await response.json();
  if (!data.token) {
    throw new Error(data.error || 'Login failed');
  }
  return { token: data.token, user: data.user };
}

function xHeaders(xtoken) {
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(2, 15);
  
  return {
    'Authorization': `Bearer ${CONFIG.xBearer}`,
    'Cookie': `auth_token=${xtoken.auth_token}; ct0=${xtoken.ct0}; personalization_id="v1_${timestamp}"; _rup=${randomSuffix}`,
    'X-Csrf-Token': xtoken.ct0,
    'X-Twitter-Active-User': 'yes',
    'X-Twitter-Auth-Type': 'OAuth2Session',
    'X-Twitter-Client-Language': 'en',
    'X-Twitter-Client': 'TwitterWeb',
    'X-Twitter-Client-Version': '1.1.1',
    'Content-Type': 'application/json',
    'User-Agent': getRandomUserAgent(),
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Referer': 'https://x.com/home',
    'Origin': 'https://x.com',
  };
}

async function postTweet(xtoken, text, proxies = [], retries = 0) {
  const MAX_RETRIES = 2;

  const proxyString = proxies.length > 0 ? getNextProxy(proxies) : null;
  if (proxyString) {
    const proxyParts = proxyString.split('@');
    const displayProxy = proxyParts.length > 1 ? proxyParts[1] : proxyString;
    log('🌐 Using proxy: ' + displayProxy, 'info');
  }

  // Random delay before posting (30s - 2min)
  const delay = randomDelay(CONFIG.postDelayMin, CONFIG.postDelayMax);
  const secs = Math.floor(delay / 1000);
  const mins = Math.floor(secs / 60);
  log(`⏳ Waiting ${mins}m ${secs % 60}s before posting...`, 'sleep');
  await sleep(delay);

  const QUERY_ID = 'SoVnbfCycZ7fERGCwpZkYA';

  const payload = {
    variables: {
      tweet_text: text,
      dark_request: false,
      media: {
        media_entities: [],
        possibly_sensitive: false
      },
      semantic_annotation_ids: []
    },
    features: {
      tweetypie_unmention_optimization_enabled: true,
      responsive_web_edit_tweet_api_enabled: true,
      graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
      view_counts_everywhere_api_enabled: true,
      longform_notetweets_consumption_enabled: true,
      responsive_web_twitter_article_tweet_consumption_enabled: false,
      tweet_awards_web_tipping_enabled: false,
      longform_notetweets_rich_text_read_enabled: true,
      longform_notetweets_inline_media_enabled: true,
      responsive_web_graphql_exclude_directive_enabled: true,
      verified_phone_label_enabled: false,
      freedom_of_speech_not_reach_fetch_enabled: true,
      standardized_nudges_misinfo: true,
      tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
    },
    queryId: QUERY_ID
  };

  try {
    const response = await fetchWithProxy(`https://x.com/i/api/graphql/${QUERY_ID}/CreateTweet`, {
      method: 'POST',
      headers: xHeaders(xtoken),
      body: JSON.stringify(payload),
    }, proxyString);

    const textResponse = await response.text();
    let result;
    try {
      result = JSON.parse(textResponse);
    } catch {
      throw new Error('Invalid response from X');
    }

    // Check for missing hashtags error
    if (textResponse.includes('must include #SOH') || textResponse.includes('must include #saviorofhealth')) {
      log('❌ Missing required hashtags. Adding and retrying...', 'error');
      if (!text.includes('#SOH')) text = text + ' #SOH';
      if (!text.includes('#saviorofhealth')) text = text + ' #saviorofhealth';
      if (retries < MAX_RETRIES) {
        return postTweet(xtoken, text, proxies, retries + 1);
      }
      throw new Error('Missing hashtags after retry');
    }

    if (result?.errors && Array.isArray(result.errors) && result.errors.length > 0) {
      const errors = result.errors;

      for (const err of errors) {
        const errorMsg = (err.message || err.code || '').toLowerCase();

        if (errorMsg.includes('daily limit') || errorMsg.includes('too many requests')) {
          throw new Error('XLimit::TooManyRequests');
        }

        if (errorMsg.includes('suspended') || errorMsg.includes('locked') || errorMsg.includes('restricted')) {
          throw new Error('XAccount::Suspended');
        }

        if (errorMsg.includes('unauthorized') || errorMsg.includes('not authorized')) {
          throw new Error('XAccount::Unauthorized');
        }

        if (errorMsg.includes('automated') || errorMsg.includes('bot') || errorMsg.includes('spam')) {
          log('🤖 Bot detected! Waiting 10-20 minutes...', 'warning');
          const waitTime = randomDelay(600000, 1200000);
          await sleep(waitTime);
          throw new Error('XBot::DetectedAsAutomated');
        }

        if (errorMsg.includes('rate') || errorMsg.includes('limit')) {
          throw new Error('XLimit::RateLimited');
        }
      }

      throw new Error('XError::' + (errors[0]?.message || errors[0]?.code || 'Unknown'));
    }

    if (result?.data?.create_tweet?.tweet_results?.result?.rest_id) {
      const tweetId = result.data.create_tweet.tweet_results.result.rest_id;
      const username = result.data.create_tweet.tweet_results.result.core?.user_results?.result?.legacy?.screen_name;
      
      await sleep(randomDelay(2000, 5000));
      
      return `https://twitter.com/${username}/status/${tweetId}`;
    }

    throw new Error('No tweet ID in response');

  } catch (error) {
    const errorMsg = error.message || '';
    log('❌ Post failed: ' + errorMsg, 'error');
    
    if (errorMsg.includes('XBot::DetectedAsAutomated')) {
      log('🔄 Switching X account...', 'rotate');
      xTokenIndex++;
      await sleep(randomDelay(600000, 900000));
      if (retries < MAX_RETRIES) {
        return postTweet(xtoken, text, proxies, retries + 1);
      }
      throw error;
    }
    
    if (retries < MAX_RETRIES) {
      const waitTime = (retries + 1) * 60000;
      log(`Retry ${retries + 1}/${MAX_RETRIES} in ${Math.round(waitTime/60000)} minutes...`, 'warning');
      await sleep(waitTime + Math.random() * 60000);
      return postTweet(xtoken, text, proxies, retries + 1);
    }
    throw error;
  }
}

async function getPostsStatus(token, proxyString = null) {
  const response = await fetchWithProxy(CONFIG.apiUrl + '/api/posts', {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token,
    },
  }, proxyString);

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Failed to fetch posts status');
  }
  return data;
}

async function submitToSavior(token, tweetUrl, proxyString = null) {
  const response = await fetchWithProxy(CONFIG.apiUrl + '/api/posts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token,
    },
    body: JSON.stringify({ url: tweetUrl }),
  }, proxyString);

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Submission failed');
  }
  return data;
}

function getSleepUntilNextDay() {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  const timeUntilNextDay = tomorrow.getTime() - now.getTime();
  const randomOffset = randomDelay(0, 14400000);
  return timeUntilNextDay + randomOffset;
}

async function sleepUntilNextDay(reason = 'Daily limit reached') {
  const sleepTime = getSleepUntilNextDay();
  const hours = Math.floor(sleepTime / 3600000);
  const minutes = Math.floor((sleepTime % 3600000) / 60000);
  log(`🌅 Sleeping ${hours}h ${minutes}m - ${reason}`, 'nextday');
  await sleep(sleepTime);
  log('🌅 New day! Resuming...', 'success');
}

async function processAccount(account, xtokens, proxies, idx) {
  const shortAddr = account.privateKey.substring(0, 10) + '...' + account.privateKey.substring(account.privateKey.length - 6);
  const name = account.name || `Account ${idx + 1}`;

  logBanner(`Processing ${name} (${shortAddr})`);

  try {
    log('Logging into SaviorOfHealth...', 'info');
    const freshProxy = proxies.length > 0 ? getNextProxy(proxies) : null;
    const { token, user } = await loginSavior(account.privateKey, freshProxy);
    log(`Logged in as ${user?.displayName || 'user'}`, 'success');

    const statusProxy = proxies.length > 0 ? getNextProxy(proxies) : null;
    const status = await getPostsStatus(token, statusProxy);
    const remaining = status.todayRemaining || 0;
    const rewardPerPost = status.reward || 150;

    log(`Daily: ${remaining}/5 posts remaining (${rewardPerPost} HP each)`, 'info');

    if (remaining <= 0) {
      log('Daily limit reached!', 'warning');
      await sleepUntilNextDay('Daily limit reached');
      return processAccount(account, xtokens, proxies, idx);
    }

    const maxPosts = Math.min(remaining, CONFIG.maxPostsPerDay || 3);
    let posted = 0;
    let totalReward = 0;

    for (let i = 0; i < maxPosts; i++) {
      const xtoken = getNextXToken(xtokens);
      if (!xtoken) {
        log('No X tokens available', 'error');
        break;
      }

      log(`\n📝 Post ${i + 1}/${maxPosts}...`, 'highlight');

      let tweetText = await generateTweet(proxies);
      
      if (!tweetText || tweetText.length < 5 || tweetText.length > 280) {
        tweetText = generateHumanLikeTweet();
        log('Using template tweet', 'info');
      }

      log(`📝 ${tweetText.substring(0, 80)}${tweetText.length > 80 ? '...' : ''}`, 'debug');

      try {
        const tweetUrl = await postTweet(xtoken, tweetText, proxies);
        log(`✅ Posted: ${tweetUrl}`, 'x');

        await sleep(randomDelay(3000, 8000));

        const submitProxy = proxies.length > 0 ? getNextProxy(proxies) : null;
        const result = await submitToSavior(token, tweetUrl, submitProxy);
        if (result && result.ok) {
          const reward = result.reward || rewardPerPost;
          totalReward += reward;
          posted++;
          log(`🎯 +${reward} HP`, 'claim');
        }

        if (i < maxPosts - 1) {
          const delay = randomDelay(180000, 600000);
          const mins = Math.floor(delay / 60000);
          log(`💤 Waiting ${mins}m before next post...`, 'sleep');
          await sleep(delay);
        }

      } catch (error) {
        const errorMsg = error.message || '';
        log(`Post failed: ${errorMsg}`, 'error');

        if (errorMsg.includes('XBot::DetectedAsAutomated')) {
          log('❌ AUTOMATED DETECTION! Switching X account & waiting 15 min', 'error');
          await sleep(randomDelay(600000, 1200000));
          continue;
        }

        if (errorMsg.includes('XAccount::')) {
          log('Account issue - switching to next X account', 'warning');
          xTokenIndex++;
          continue;
        }

        if (errorMsg.includes('XLimit::TooManyRequests')) {
          log('Rate limited (daily) - sleeping until tomorrow', 'warning');
          await sleepUntilNextDay('X rate limit exceeded');
          return processAccount(account, xtokens, proxies, idx);
        }

        if (errorMsg.includes('XLimit::RateLimited')) {
          log('Rate limited - waiting 10 minutes', 'warning');
          await sleep(randomDelay(300000, 600000));
          i--;
          continue;
        }

        log('Waiting before retry...', 'warning');
        await sleep(randomDelay(60000, 120000));
      }
    }

    log(`\n✅ ${name}: ${posted} posts (${totalReward} HP)`, 'success');
    return { success: true, posts: posted, reward: totalReward };

  } catch (error) {
    log(`Account error: ${error.message}`, 'error');
    return { success: false, error: error.message };
  }
}

async function runAllAccounts() {
  const accounts = loadAccounts();
  const xtokens = loadXTokens();
  const proxies = loadProxies();

  const groq = initGroqManager();

  if (accounts.length === 0) {
    log('No accounts in accounts.txt', 'error');
    return;
  }

  if (xtokens.length === 0) {
    log('No X tokens in xtoken.txt', 'error');
    return;
  }

  log(`Loaded ${proxies.length} proxies`, 'success');
  log(`Loaded ${accounts.length} wallet accounts`, 'success');
  log(`Loaded ${xtokens.length} X accounts`, 'success');
  
  if (groq.apiKeys.length > 0) {
    log(`🧠 Groq AI enabled with ${groq.apiKeys.length} keys`, 'success');
    log(`📋 Models: ${groq.allModels.join(' → ')}`, 'info');
  } else {
    log('📝 Using template-based tweets (no AI)', 'info');
  }
  console.log('');

  const totalAccounts = Math.min(accounts.length, xtokens.length);

  for (let i = 0; i < totalAccounts; i++) {
    await processAccount(accounts[i], xtokens, proxies, i);

    if (i < totalAccounts - 1) {
      const delay = randomDelay(300000, 900000);
      const mins = Math.floor(delay / 60000);
      log(`💤 Waiting ${mins}m before next account...`, 'sleep');
      await sleep(delay);
    }
  }

  log('All accounts done. Sleeping until tomorrow...', 'nextday');
  await sleepUntilNextDay('All accounts completed');

  log('Starting new cycle...', 'info');
  await runAllAccounts();
}

const BANNER = `
╔═══════════════════════════════════╗
║  SaviorOfHealth Auto Tweet Bot   ║
╚═══════════════════════════════════╝
`;

async function main() {
  console.log(BANNER);
  log('🧠 AI Provider: Groq', 'highlight');
  log('📝 Keys loaded from: groq.txt', 'info');

  while (true) {
    try {
      await runAllAccounts();
    } catch (error) {
      log(`Fatal: ${error.message}`, 'error');
      log('Restarting in 5 minutes...', 'warning');
      await sleep(300000);
    }
  }
}

if (require.main === module) {
  main().catch(error => {
    log(`Fatal: ${error.message}`, 'error');
    process.exit(1);
  });
}

module.exports = { postTweet, submitToSavior, getPostsStatus };