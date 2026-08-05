# 🐦 SaviorOfHealth Auto Tweet & Claim Bot

> **Automated X (Twitter) posting bot for SaviorOfHealth with AI-generated tweets, multi-wallet support, and auto-reward claiming.**

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![Telegram](https://img.shields.io/badge/Telegram-AirDropXDevs-26A5E4)](https://t.me/AirDropXDevs)

---

## ⚠️ IMPORTANT WARNINGS

> **🔴 USE AT YOUR OWN RISK — Your X (Twitter) account CAN BE BANNED.**

> **🔴 RECOMMENDED: Use only ONE account. Multi-account mode is NOT tested and may trigger X's anti-bot detection.**

> **🔴 This tool automates actions on X (Twitter), which violates their Terms of Service. Account suspension or permanent ban is possible.**

---

## 📋 Table of Contents

- [Features](#-features)
- [Prerequisites](#-prerequisites)
- [Installation](#-installation)
- [Configuration](#-configuration)
- [Usage](#-usage)
- [File Structure](#-file-structure)
- [Configuration Options](#-configuration-options)
- [Troubleshooting](#-troubleshooting)
- [Disclaimer](#-disclaimer)
- [Support](#-support)

---

## ✨ Features

- **🤖 AI-Generated Tweets** — Uses Groq API (Llama, Gemma, Mixtral) to create unique, engaging tweets
- **📝 Auto Post to X** — Posts tweets automatically using session-based authentication
- **🎯 Auto Claim Rewards** — Submits tweet URLs to SaviorOfHealth to earn Heal Points (HP)
- **👛 Multi-Wallet Support** — Run multiple Ethereum wallets simultaneously *(NOT TESTED — USE AT YOUR OWN RISK)*
- **🔐 SIWE Login** — Secure Sign-In With Ethereum (gas-less signature)
- **🌐 Proxy Support** — HTTP/SOCKS5 proxy rotation for each request
- **⏰ Smart Scheduling** — Randomized delays between posts and accounts to avoid detection
- **🌅 Daily Loop** — Automatically sleeps until next day when daily limits are reached
- **🛡️ Error Handling** — Retry logic for rate limits, failed requests, and invalid responses

---

## 📦 Prerequisites

- **Node.js** v18 or higher
- **npm** or **yarn**
- **Groq API Key(s)** — Get from [console.groq.com](https://console.groq.com)
- **X (Twitter) Account(s)** — Active session tokens (`auth_token` & `ct0`)
- **Ethereum Wallet(s)** — Private keys for SaviorOfHealth login
- *(Optional)* **Proxies** — HTTP or SOCKS5 proxy list

---

## 🚀 Installation

### 1. Clone the repository

```bash
git clone https://github.com/mejri02/SaviorOfHealth_autoTweet.git
cd SaviorOfHealth_autoTweet
```

### 2. Install dependencies

```bash
npm install
```

**Required packages:**
```bash
npm install ethers socks-proxy-agent https-proxy-agent
```

---

## ⚙️ Configuration

Create the following files in the project root directory:

### 1. `accounts.txt` — Ethereum Wallets

Add one private key per line. Optionally add a name after a colon.

```text
0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef:Account1
0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890:Account2
```

> ⚠️ **Security Warning:** Never share your private keys. This file should be kept secure and never committed to Git.

---

### 2. `xtoken.txt` — X (Twitter) Session Tokens

Add credentials in blocks of 3 lines per account (blank line between accounts):

```text
username1
auth_token_value_here
ct0_value_here

username2
auth_token_value_here
ct0_value_here
```

**How to get tokens:**
1. Log in to [x.com](https://x.com) in your browser
2. Open DevTools → Application → Cookies
3. Copy `auth_token` and `ct0` values

---

### 3. `groq.txt` — Groq API Keys

Add one API key per line:

```text
gsk_your_groq_api_key_here
gsk_your_second_key_here
```

> Get your API keys at: [https://console.groq.com/keys](https://console.groq.com/keys)

---

### 4. `proxy.txt` — Proxies *(Optional)*

Add one proxy per line:

```text
http://user:pass@host:port
socks5://host:port
http://host:port
```

> Leave empty or don't create this file to run without proxies.

---

## ▶️ Usage

### Start the bot

```bash
node index.js
```

### What happens when you run it:

1. **Loads** all accounts, tokens, keys, and proxies
2. **Logs in** each wallet to SaviorOfHealth via SIWE signature
3. **Checks** daily posting limits and remaining quota
4. **Generates** an AI tweet using Groq (or falls back to default messages)
5. **Posts** the tweet to X (Twitter)
6. **Submits** the tweet URL back to SaviorOfHealth for HP rewards
7. **Repeats** for all accounts, then sleeps until the next day

---

## 📁 File Structure

```
SaviorOfHealth_autoTweet/
├── index.js              # Main bot script
├── accounts.txt          # Ethereum private keys
├── xtoken.txt            # X (Twitter) session tokens
├── groq.txt              # Groq API keys
├── proxy.txt             # Proxy list (optional)
├── xresults.json         # Auto-generated results log
├── package.json
└── README.md
```

---

## 🔧 Configuration Options

Edit `CONFIG` object in `index.js` to customize behavior:

| Option | Default | Description |
|--------|---------|-------------|
| `apiUrl` | `https://saviorofhealth.app` | SaviorOfHealth API base URL |
| `maxPostsPerDay` | `3` | Maximum tweets per account per day |
| `groqTimeout` | `15000` | Groq API request timeout (ms) |
| `groqModels` | `['llama-3.1-8b-instant', ...]` | AI models to rotate through |
| `postDelayMin` | `120000` | Minimum delay between posts (2 min) |
| `postDelayMax` | `180000` | Maximum delay between posts (3 min) |
| `accountDelayMin` | `60000` | Minimum delay between accounts (1 min) |
| `accountDelayMax` | `120000` | Maximum delay between accounts (2 min) |

---

## 🐛 Troubleshooting

### "No accounts found in accounts.txt"
- Ensure `accounts.txt` exists and contains valid 64-character hex private keys
- Keys can optionally start with `0x`

### "No X tokens found in xtoken.txt"
- Ensure the file follows the 3-line format: `username`, `auth_token`, `ct0`
- Separate multiple accounts with a blank line

### "Groq rate limited" / "Groq auth failed"
- Check that your Groq keys are valid and start with `gsk_`
- The bot automatically rotates keys and handles rate limits
- Add more keys to `groq.txt` for better reliability

### Rate limited by X (Twitter)
- The bot will automatically retry after 60-90 seconds
- Consider using proxies to distribute requests
- Reduce posting frequency in the CONFIG if needed

### "Account suspended/locked" errors
- The bot will stop posting for that specific account
- Check the X account status manually

---

## ⚠️ Disclaimer

> **This tool is for educational and research purposes only.**

- **🔴 USE AT YOUR OWN RISK — Your X (Twitter) account CAN BE BANNED.**
- **🔴 RECOMMENDED: Use only ONE account. Multi-account mode is NOT tested and may trigger X's anti-bot detection.**
- Using automation tools on X (Twitter) violates their [Terms of Service](https://twitter.com/tos)
- Always ensure you have permission to automate actions on any platform
- The authors are not responsible for any account suspensions, bans, or losses
- **Never commit private keys or session tokens to public repositories**
- Use at your own risk. Consider the ethical and legal implications in your jurisdiction.

---

## 💬 Support

- **Developer:** Fithub mejri02
- **Telegram Community:** [@AirDropXDevs](https://t.me/AirDropXDevs)
- **Repository:** [https://github.com/mejri02/SaviorOfHealth_autoTweet](https://github.com/mejri02/SaviorOfHealth_autoTweet)

---

<p align="center">
  <sub>Built with ❤️ by the AirDropXDevs community</sub>
</p>
