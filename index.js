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
  maxPostsPerDay: 5,
  groqTimeout: 20000,
  groqModels: ['llama-3.1-8b-instant', 'mixtral-8x7b-32768'],
  // INCREASED DELAYS TO AVOID DETECTION
  postDelayMin: 60000,     // 10 minutes
  postDelayMax: 70000,     // 15 minutes
  accountDelayMin: 300000,  // 5 minutes
  accountDelayMax: 600000,  // 10 minutes
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

function log(message, type = 'info', data = null) {
  const styles = {
    info: { color: COLORS.cyan, icon: 'ℹ️' },
    success: { color: COLORS.brightGreen, icon: '✅' },
    warning: { color: COLORS.brightYellow, icon: '⚠️' },
    error: { color: COLORS.brightRed, icon: '❌' },
    highlight: { color: COLORS.brightMagenta, icon: '✨' },
    debug: { color: COLORS.gray, icon: '🔍' },
    x: { color: COLORS.brightCyan, icon: '🐦' },
    claim: { color: COLORS.brightGreen, icon: '🎯' },
    sleep: { color: COLORS.brightYellow, icon: '💤' },
    nextday: { color: COLORS.brightYellow, icon: '🌅' },
  };
  const style = styles[type] || styles.info;
  const prefix = `${style.color}${style.icon}${COLORS.reset}`;
  const msg = `${style.color}${message}${COLORS.reset}`;
  if (data) console.log(`${prefix} ${msg}\n${COLORS.gray}${JSON.stringify(data, null, 2)}${COLORS.reset}`);
  else console.log(`${prefix} ${msg}`);
}

function logBanner(message) {
  console.log(`\n${COLORS.brightCyan}${'='.repeat(60)}${COLORS.reset}`);
  console.log(`${COLORS.brightYellow}  ${message}  ${COLORS.reset}`);
  console.log(`${COLORS.brightCyan}${'='.repeat(60)}${COLORS.reset}\n`);
}

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
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36 Edg/121.0.0.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/120.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.230 Mobile Safari/537.36',
  ];
  return agents[Math.floor(Math.random() * agents.length)];
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

function loadGroqKeys() {
  try {
    const raw = fs.readFileSync(GROQ_KEY_FILE, 'utf-8');
    return raw.split('\n').map(l => l.trim()).filter(l => l && l.startsWith('gsk_'));
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

let proxyIndex = 0;
let groqKeyIndex = 0;
let groqModelIndex = 0;
let xTokenIndex = 0;

function getNextProxy(proxies) {
  if (proxies.length === 0) return null;
  const proxy = proxies[proxyIndex % proxies.length];
  proxyIndex++;
  return proxy;
}

function getNextGroqKey(keys) {
  if (keys.length === 0) return null;
  const key = keys[groqKeyIndex % keys.length];
  groqKeyIndex++;
  return key;
}

function getNextGroqModel() {
  const models = CONFIG.groqModels || ['llama-3.1-8b-instant'];
  const model = models[groqModelIndex % models.length];
  groqModelIndex++;
  return model;
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
      return new SocksProxyAgent(proxyString);
    } else {
      return new HttpsProxyAgent(proxyString);
    }
  } catch (e) {
    return null;
  }
}

async function fetchWithProxy(url, options = {}, proxyString = null) {
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

async function generateTweetWithGroq(topic = 'saviorofhealth health wellness', proxies = []) {
  const keys = loadGroqKeys();
  if (keys.length === 0) return null;

  const key = getNextGroqKey(keys);
  const model = getNextGroqModel();
  // ROTATE PROXY FOR GROQ CALL
  const proxyString = proxies.length > 0 ? getNextProxy(proxies) : null;
  if (!key) return null;

  const prompts = [
    `Generate a unique, engaging tweet about improving health with ${topic}. Make it sound natural, not spammy, and under 280 characters. Include #SOH and #saviorofhealth. Only output the tweet text, nothing else.`,
    `Write a short, authentic tweet about earning rewards for tracking health with ${topic}. Be personal and conversational. Under 280 chars. Include #SOH. Only output the tweet text.`,
    `Create a tweet about health tracking and crypto rewards with ${topic}. Make it sound like a real person sharing their experience. Under 280 chars. Include #saviorofhealth. Only output the tweet text.`,
    `Share a quick health tip or motivation about ${topic}. Make it tweet-sized (under 280 chars) and include #SOH. Only output the tweet text.`,
  ];

  const prompt = prompts[Math.floor(Math.random() * prompts.length)];

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONFIG.groqTimeout || 20000);

    const response = await fetchWithProxy('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: 'system', content: 'You are a helpful assistant that generates engaging social media tweets.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 150,
      }),
      signal: controller.signal,
    }, proxyString);

    clearTimeout(timeoutId);

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      return null;
    }
    
    const tweet = data.choices[0].message.content.trim();
    return tweet.replace(/^["']|["']$/g, '').replace(/\s+/g, ' ').substring(0, 280);
  } catch (error) {
    return null;
  }
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
  return {
    'Authorization': `Bearer ${CONFIG.xBearer}`,
    'Cookie': `auth_token=${xtoken.auth_token}; ct0=${xtoken.ct0}`,
    'X-Csrf-Token': xtoken.ct0,
    'X-Twitter-Active-User': 'yes',
    'X-Twitter-Auth-Type': 'OAuth2Session',
    'X-Twitter-Client-Language': 'en',
    'X-Twitter-Client': 'web',
    'X-Client-Transaction-ID': 'web-' + Math.random().toString(36).substring(2, 10),
    'Content-Type': 'application/json',
    'User-Agent': getRandomUserAgent(),
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Referer': 'https://x.com/compose/tweet',
    'Origin': 'https://x.com',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-site',
  };
}

async function postTweet(xtoken, text, proxies = [], retries = 0) {
  const MAX_RETRIES = 1;
  
  // ROTATE PROXY FOR EVERY TWEET
  const proxyString = proxies.length > 0 ? getNextProxy(proxies) : null;
  if (proxyString) log(`Using proxy for tweet`, 'info');
  
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

    if (result?.errors && Array.isArray(result.errors) && result.errors.length > 0) {
      const errors = result.errors;
      
      for (const err of errors) {
        const errorMsg = err.message || '';
        
        if (errorMsg.includes('daily limit') || errorMsg.includes('Too many requests')) {
          throw new Error('XLimit::TooManyRequests');
        }
        
        if (errorMsg.includes('suspended') || errorMsg.includes('locked')) {
          throw new Error('XAccount::Suspended');
        }
        
        if (errorMsg.includes('Not Authorized')) {
          throw new Error('XAccount::Unauthorized');
        }
      }
      
      throw new Error('XError::' + (errors[0]?.message || 'Unknown'));
    }

    if (result?.data?.create_tweet?.tweet_results?.result?.rest_id) {
      const tweetId = result.data.create_tweet.tweet_results.result.rest_id;
      const username = result.data.create_tweet.tweet_results.result.core?.user_results?.result?.legacy?.screen_name;
      return `https://twitter.com/${username}/status/${tweetId}`;
    }

    throw new Error('No tweet ID in response');

  } catch (error) {
    if (retries < MAX_RETRIES) {
      log(`Retry ${retries + 1}/${MAX_RETRIES}...`, 'warning');
      await sleep(30000);
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

const defaultMessages = [
  "I'm getting healthier and earning Heal Points with @saviorofhealth_ 💚 #SOH #saviorofhealth",
  "Tracking my health journey with @saviorofhealth_ 🏥 Every day counts! #SOH #health",
  "Health is wealth! @saviorofhealth_ is helping me stay on track 💪 #SOH #wellness",
  "Just earned Heal Points on @saviorofhealth_! Join the movement 🚀 #SOH #healthtech",
  "Taking control of my health with @saviorofhealth_ 🫀 Every step matters #SOH #healthyliving",
];

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

    const maxPosts = Math.min(remaining, CONFIG.maxPostsPerDay || 2);
    let posted = 0;
    let totalReward = 0;

    for (let i = 0; i < maxPosts; i++) {
      const xtoken = getNextXToken(xtokens);
      if (!xtoken) {
        log('No X tokens available', 'error');
        break;
      }
      
      log(`\n📝 Post ${i + 1}/${maxPosts}...`, 'highlight');

      let tweetText = null;
      tweetText = await generateTweetWithGroq('saviorofhealth health wellness', proxies);
      
      if (!tweetText || tweetText.length < 5 || tweetText.length > 280) {
        tweetText = defaultMessages[i % defaultMessages.length];
        log('Using default message', 'info');
      }

      log(`📝 ${tweetText}`, 'debug');

      try {
        const tweetUrl = await postTweet(xtoken, tweetText, proxies);
        log(`✅ Posted: ${tweetUrl}`, 'x');

        await sleep(5000);

        const submitProxy = proxies.length > 0 ? getNextProxy(proxies) : null;
        const result = await submitToSavior(token, tweetUrl, submitProxy);
        if (result && result.ok) {
          const reward = result.reward || rewardPerPost;
          totalReward += reward;
          posted++;
          log(`🎯 +${reward} HP`, 'claim');
        }

        if (i < maxPosts - 1) {
          const delay = randomDelay(CONFIG.postDelayMin, CONFIG.postDelayMax);
          const mins = Math.floor(delay / 60000);
          log(`💤 Waiting ${mins}m before next post...`, 'sleep');
          await sleep(delay);
        }

      } catch (error) {
        const errorMsg = error.message || '';
        log(`Post failed: ${errorMsg}`, 'error');
        
        if (errorMsg.includes('XAccount::')) {
          log('Account issue - switching to next X account', 'warning');
          continue;
        }
        
        if (errorMsg.includes('XLimit::')) {
          log('Rate limited - waiting 2 minutes', 'warning');
          await sleep(120000);
          i--;
          continue;
        }
        
        log('Waiting before retry...', 'warning');
        await sleep(60000);
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
  const groqKeys = loadGroqKeys();

  if (accounts.length === 0) {
    log('No accounts in accounts.txt', 'error');
    return;
  }

  if (xtokens.length === 0) {
    log('No X tokens in xtoken.txt', 'error');
    return;
  }

  log(`Loaded ${groqKeys.length} Groq keys`, 'success');
  log(`Loaded ${proxies.length} proxies`, 'success');
  log(`Loaded ${accounts.length} wallet accounts`, 'success');
  log(`Loaded ${xtokens.length} X accounts`, 'success');
  console.log('');

  const totalAccounts = Math.min(accounts.length, xtokens.length);

  for (let i = 0; i < totalAccounts; i++) {
    await processAccount(accounts[i], xtokens, proxies, i);
    
    if (i < totalAccounts - 1) {
      const delay = randomDelay(CONFIG.accountDelayMin, CONFIG.accountDelayMax);
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
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   🐦  X (Twitter) Auto Post Bot - FULLY FIXED           ║
║   🤖  AI Tweets + Default Fallback                      ║
║   📦  Multi-Account X Token Rotation                     ║
║   🎯  Auto-Submit to SaviorOfHealth                     ║
║   ⏰  Human-like Delays (10-15min)                       ║
║   🛡️  Smart Error Handling                              ║
║   🌅  Auto-Sleep Until Next Day                        ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
`;

async function main() {
  console.log(BANNER);
  
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

module.exports = { postTweet, submitToSavior, getPostsStatus, loginSavior };
