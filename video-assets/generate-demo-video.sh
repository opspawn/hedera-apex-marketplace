#!/bin/bash
# Demo Video Generator for Hedera Apex Hackathon
# Produces a 4:30 (270s) MP4 at 1920x1080 30fps
# Uses ffmpeg with text overlays, pan/zoom on screenshots, and crossfade transitions

set -e

WORK="/home/agent/projects/hedera-apex-marketplace/video-assets"
SHOTS="$WORK/screenshots"
SCENES="$WORK/scenes"
OUTPUT="/home/agent/projects/hedera-apex-marketplace/demo-video-apex.mp4"

mkdir -p "$SCENES"

# Color palette (matching the dark UI theme)
BG="0x080c14"
ACCENT="0x00d4aa"
TEXT_COLOR="white"
SUBTITLE_BG="black@0.7"

# Font settings
FONT="/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_REGULAR="/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"

echo "=== Scene 1: HOOK - Title Card + Marketplace Hero (0:00 - 0:30) ==="

# Scene 1a: Title card with animated text (10s)
ffmpeg -y -f lavfi -i "color=c=$BG:s=1920x1080:d=10:r=30" \
  -vf "\
    drawtext=fontfile=$FONT:text='Hedera Agent Marketplace':fontcolor=white:fontsize=72:x=(w-text_w)/2:y=(h-text_h)/2-80:enable='gte(t,0.5)',\
    drawtext=fontfile=$FONT_REGULAR:text='Decentralized AI Agent Discovery, Hiring & Trust':fontcolor=$ACCENT:fontsize=36:x=(w-text_w)/2:y=(h-text_h)/2+20:enable='gte(t,1.5)',\
    drawtext=fontfile=$FONT_REGULAR:text='Built on 10 Hedera Consensus Service Standards':fontcolor=0xaaaaaa:fontsize=28:x=(w-text_w)/2:y=(h-text_h)/2+80:enable='gte(t,2.5)',\
    drawtext=fontfile=$FONT_REGULAR:text='hedera.opspawn.com':fontcolor=0x00d4aa:fontsize=32:x=(w-text_w)/2:y=(h-text_h)/2+140:enable='gte(t,3.5)',\
    drawtext=fontfile=$FONT_REGULAR:text='OpSpawn':fontcolor=0x666666:fontsize=20:x=w-text_w-30:y=h-40\
  " \
  -c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p "$SCENES/scene1a-title.mp4"

# Scene 1b: Marketplace hero with slow zoom-in (14s)
ffmpeg -y -loop 1 -i "$SHOTS/scene1-marketplace-hero.png" -t 14 \
  -vf "\
    scale=2200:-1,\
    zoompan=z='1+0.0008*in':x='(iw-iw/zoom)/2':y='(ih-ih/zoom)/2':d=420:s=1920x1080:fps=30,\
    drawtext=fontfile=$FONT_REGULAR:text='The Problem: AI agents are siloed. No standard way to discover, verify, or hire them.':fontcolor=white:fontsize=26:x=(w-text_w)/2:y=h-60:box=1:boxcolor=$SUBTITLE_BG:boxborderw=10:enable='between(t,1,5)',\
    drawtext=fontfile=$FONT_REGULAR:text='Our Solution: A decentralized marketplace powered by Hedera consensus standards.':fontcolor=white:fontsize=26:x=(w-text_w)/2:y=h-60:box=1:boxcolor=$SUBTITLE_BG:boxborderw=10:enable='between(t,6,11)',\
    drawtext=fontfile=$FONT_REGULAR:text='OpSpawn':fontcolor=0x666666:fontsize=20:x=w-text_w-30:y=h-40:enable='gte(t,0)'\
  " \
  -c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p "$SCENES/scene1b-hero.mp4"

# Scene 1c: Marketplace scrolled down showing more agents (12s)
ffmpeg -y -loop 1 -i "$SHOTS/scene1-marketplace-bottom.png" -t 12 \
  -vf "\
    scale=2200:-1,\
    zoompan=z='1.05-0.0005*in':x='(iw-iw/zoom)/2':y='(ih-ih/zoom)/2':d=360:s=1920x1080:fps=30,\
    drawtext=fontfile=$FONT_REGULAR:text='8 specialized AI agents registered with verified HCS identities':fontcolor=white:fontsize=26:x=(w-text_w)/2:y=h-60:box=1:boxcolor=$SUBTITLE_BG:boxborderw=10:enable='between(t,0,4)',\
    drawtext=fontfile=$FONT_REGULAR:text='Each agent has DID identity, published skills, reputation scores, and protocol tags':fontcolor=white:fontsize=26:x=(w-text_w)/2:y=h-60:box=1:boxcolor=$SUBTITLE_BG:boxborderw=10:enable='between(t,5,9)',\
    drawtext=fontfile=$FONT_REGULAR:text='OpSpawn':fontcolor=0x666666:fontsize=20:x=w-text_w-30:y=h-40\
  " \
  -c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p "$SCENES/scene1c-agents.mp4"

echo "=== Scene 2: LIVE DEMO - Agent Registration, Skills, Discovery, Chat (0:30 - 2:30) ==="

# Scene 2a: Agent Registration form (18s)
ffmpeg -y -loop 1 -i "$SHOTS/scene2-register-agent.png" -t 18 \
  -vf "\
    scale=2200:-1,\
    zoompan=z='1+0.0006*in':x='(iw-iw/zoom)/2':y='50+in*0.3':d=540:s=1920x1080:fps=30,\
    drawtext=fontfile=$FONT:text='Step 1: Agent Registration':fontcolor=$ACCENT:fontsize=36:x=60:y=40:box=1:boxcolor=$SUBTITLE_BG:boxborderw=8:enable='gte(t,0)',\
    drawtext=fontfile=$FONT_REGULAR:text='Agents register with HCS-10 identity, HCS-11 profile, and HCS-26 skill manifests':fontcolor=white:fontsize=26:x=(w-text_w)/2:y=h-60:box=1:boxcolor=$SUBTITLE_BG:boxborderw=10:enable='between(t,1,6)',\
    drawtext=fontfile=$FONT_REGULAR:text='Full DID creation: did:hedera:testnet — verified on-chain with Hedera Consensus':fontcolor=white:fontsize=26:x=(w-text_w)/2:y=h-60:box=1:boxcolor=$SUBTITLE_BG:boxborderw=10:enable='between(t,7,13)',\
    drawtext=fontfile=$FONT_REGULAR:text='OpSpawn':fontcolor=0x666666:fontsize=20:x=w-text_w-30:y=h-40\
  " \
  -c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p "$SCENES/scene2a-register.mp4"

# Scene 2b: Agent Details with HCS standards (18s)
ffmpeg -y -loop 1 -i "$SHOTS/scene2-agent-details.png" -t 18 \
  -vf "\
    scale=2200:-1,\
    zoompan=z='1.02+0.0004*in':x='(iw-iw/zoom)/2':y='20+in*0.2':d=540:s=1920x1080:fps=30,\
    drawtext=fontfile=$FONT:text='Step 2: Agent Profile & Skills':fontcolor=$ACCENT:fontsize=36:x=60:y=40:box=1:boxcolor=$SUBTITLE_BG:boxborderw=8:enable='gte(t,0)',\
    drawtext=fontfile=$FONT_REGULAR:text='HCS-19 Identity — verified DID with privacy consent management':fontcolor=white:fontsize=26:x=(w-text_w)/2:y=h-60:box=1:boxcolor=$SUBTITLE_BG:boxborderw=10:enable='between(t,1,5)',\
    drawtext=fontfile=$FONT_REGULAR:text='HCS-26 Skills — published on-chain skill manifests with pricing (5 HBAR/call)':fontcolor=white:fontsize=26:x=(w-text_w)/2:y=h-60:box=1:boxcolor=$SUBTITLE_BG:boxborderw=10:enable='between(t,6,10)',\
    drawtext=fontfile=$FONT_REGULAR:text='HCS-20 Reputation Points — 1020 points from registration, consent, and skill publishing':fontcolor=white:fontsize=26:x=(w-text_w)/2:y=h-60:box=1:boxcolor=$SUBTITLE_BG:boxborderw=10:enable='between(t,11,14)',\
    drawtext=fontfile=$FONT_REGULAR:text='OpSpawn':fontcolor=0x666666:fontsize=20:x=w-text_w-30:y=h-40\
  " \
  -c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p "$SCENES/scene2b-details.mp4"

# Scene 2c: Agent Registry view (18s)
ffmpeg -y -loop 1 -i "$SHOTS/scene2-agent-registry.png" -t 18 \
  -vf "\
    scale=2200:-1,\
    zoompan=z='1.03-0.0003*in':x='(iw-iw/zoom)/2':y='30+in*0.15':d=540:s=1920x1080:fps=30,\
    drawtext=fontfile=$FONT:text='Step 3: Discovery & Verification':fontcolor=$ACCENT:fontsize=36:x=60:y=40:box=1:boxcolor=$SUBTITLE_BG:boxborderw=8:enable='gte(t,0)',\
    drawtext=fontfile=$FONT_REGULAR:text='Full agent registry with DID identifiers, identity topics, and profile topics':fontcolor=white:fontsize=26:x=(w-text_w)/2:y=h-60:box=1:boxcolor=$SUBTITLE_BG:boxborderw=10:enable='between(t,1,5)',\
    drawtext=fontfile=$FONT_REGULAR:text='HCS-26 skill manifests published on-chain — verifiable capabilities':fontcolor=white:fontsize=26:x=(w-text_w)/2:y=h-60:box=1:boxcolor=$SUBTITLE_BG:boxborderw=10:enable='between(t,6,10)',\
    drawtext=fontfile=$FONT_REGULAR:text='Multi-protocol support: A2A v0.3, HCS-10, MCP, x402-v2':fontcolor=white:fontsize=26:x=(w-text_w)/2:y=h-60:box=1:boxcolor=$SUBTITLE_BG:boxborderw=10:enable='between(t,11,14)',\
    drawtext=fontfile=$FONT_REGULAR:text='OpSpawn':fontcolor=0x666666:fontsize=20:x=w-text_w-30:y=h-40\
  " \
  -c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p "$SCENES/scene2c-registry.mp4"

# Scene 2d: HOL Registry integration (18s)
ffmpeg -y -loop 1 -i "$SHOTS/scene2-hol-registry.png" -t 18 \
  -vf "\
    scale=2200:-1,\
    zoompan=z='1+0.0005*in':x='(iw-iw/zoom)/2':y='(ih-ih/zoom)/2':d=540:s=1920x1080:fps=30,\
    drawtext=fontfile=$FONT:text='Step 4: HOL Registry Broker':fontcolor=$ACCENT:fontsize=36:x=60:y=40:box=1:boxcolor=$SUBTITLE_BG:boxborderw=8:enable='gte(t,0)',\
    drawtext=fontfile=$FONT_REGULAR:text='Connected to the Hedera Open-Source Library (HOL) at hol.org/registry':fontcolor=white:fontsize=26:x=(w-text_w)/2:y=h-60:box=1:boxcolor=$SUBTITLE_BG:boxborderw=10:enable='between(t,1,5)',\
    drawtext=fontfile=$FONT_REGULAR:text='HCS-10 protocol for agent-to-agent connections with inbound topic 0.0.7854276':fontcolor=white:fontsize=26:x=(w-text_w)/2:y=h-60:box=1:boxcolor=$SUBTITLE_BG:boxborderw=10:enable='between(t,6,10)',\
    drawtext=fontfile=$FONT_REGULAR:text='Real ecosystem interoperability — 72K+ agents discoverable through HOL':fontcolor=white:fontsize=26:x=(w-text_w)/2:y=h-60:box=1:boxcolor=$SUBTITLE_BG:boxborderw=10:enable='between(t,11,14)',\
    drawtext=fontfile=$FONT_REGULAR:text='OpSpawn':fontcolor=0x666666:fontsize=20:x=w-text_w-30:y=h-40\
  " \
  -c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p "$SCENES/scene2d-hol.mp4"

# Scene 2e: Chat interface (12s)
ffmpeg -y -loop 1 -i "$SHOTS/scene2-chat-empty.png" -t 12 \
  -vf "\
    scale=2200:-1,\
    zoompan=z='1+0.0006*in':x='(iw-iw/zoom)/2':y='(ih-ih/zoom)/2':d=360:s=1920x1080:fps=30,\
    drawtext=fontfile=$FONT:text='Step 5: Natural Language Chat':fontcolor=$ACCENT:fontsize=36:x=60:y=40:box=1:boxcolor=$SUBTITLE_BG:boxborderw=8:enable='gte(t,0)',\
    drawtext=fontfile=$FONT_REGULAR:text='Chat with the marketplace using natural language — discover, register, hire agents':fontcolor=white:fontsize=26:x=(w-text_w)/2:y=h-60:box=1:boxcolor=$SUBTITLE_BG:boxborderw=10:enable='between(t,1,5)',\
    drawtext=fontfile=$FONT_REGULAR:text='6 quick-action suggestions: Discover, Register, Trust, Search, Skills, Connect':fontcolor=white:fontsize=26:x=(w-text_w)/2:y=h-60:box=1:boxcolor=$SUBTITLE_BG:boxborderw=10:enable='between(t,6,11)',\
    drawtext=fontfile=$FONT_REGULAR:text='OpSpawn':fontcolor=0x666666:fontsize=20:x=w-text_w-30:y=h-40\
  " \
  -c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p "$SCENES/scene2e-chat1.mp4"

# Scene 2f: Chat with conversation (12s)
ffmpeg -y -loop 1 -i "$SHOTS/scene2-chat-conversation.png" -t 12 \
  -vf "\
    scale=2200:-1,\
    zoompan=z='1.02-0.0003*in':x='(iw-iw/zoom)/2':y='(ih-ih/zoom)/2':d=360:s=1920x1080:fps=30,\
    drawtext=fontfile=$FONT_REGULAR:text='12 chat tools: vector_search, find_registrations, get_trust_scores, hire_agent...':fontcolor=white:fontsize=26:x=(w-text_w)/2:y=h-60:box=1:boxcolor=$SUBTITLE_BG:boxborderw=10:enable='between(t,0,5)',\
    drawtext=fontfile=$FONT_REGULAR:text='LLM-powered responses with real-time Hedera data and tool execution':fontcolor=white:fontsize=26:x=(w-text_w)/2:y=h-60:box=1:boxcolor=$SUBTITLE_BG:boxborderw=10:enable='between(t,6,11)',\
    drawtext=fontfile=$FONT_REGULAR:text='OpSpawn':fontcolor=0x666666:fontsize=20:x=w-text_w-30:y=h-40\
  " \
  -c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p "$SCENES/scene2f-chat2.mp4"

echo "=== Scene 3: Architecture Depth (2:30 - 3:15) ==="

# Scene 3a: Analytics dashboard showing protocols (18s)
ffmpeg -y -loop 1 -i "$SHOTS/scene3-analytics.png" -t 18 \
  -vf "\
    scale=2200:-1,\
    zoompan=z='1+0.0005*in':x='(iw-iw/zoom)/2':y='50+in*0.25':d=540:s=1920x1080:fps=30,\
    drawtext=fontfile=$FONT:text='Architecture: 10 Hedera Standards':fontcolor=$ACCENT:fontsize=36:x=60:y=40:box=1:boxcolor=$SUBTITLE_BG:boxborderw=8:enable='gte(t,0)',\
    drawtext=fontfile=$FONT_REGULAR:text='HCS-10 (Messaging) · HCS-11 (Profiles) · HCS-14 (Tasks) · HCS-19 (Privacy)':fontcolor=white:fontsize=26:x=(w-text_w)/2:y=h-60:box=1:boxcolor=$SUBTITLE_BG:boxborderw=10:enable='between(t,1,5)',\
    drawtext=fontfile=$FONT_REGULAR:text='HCS-20 (Reputation) · HCS-26 (Skills) · HIP-991 · ERC-8004 · HTS · AWS KMS':fontcolor=white:fontsize=26:x=(w-text_w)/2:y=h-60:box=1:boxcolor=$SUBTITLE_BG:boxborderw=10:enable='between(t,6,10)',\
    drawtext=fontfile=$FONT_REGULAR:text='Multi-protocol interop: HCS-10 + A2A + MCP bridged for cross-protocol agent communication':fontcolor=white:fontsize=26:x=(w-text_w)/2:y=h-60:box=1:boxcolor=$SUBTITLE_BG:boxborderw=10:enable='between(t,11,14)',\
    drawtext=fontfile=$FONT_REGULAR:text='OpSpawn':fontcolor=0x666666:fontsize=20:x=w-text_w-30:y=h-40\
  " \
  -c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p "$SCENES/scene3a-analytics.mp4"

# Scene 3b: Reachability - MCP, A2A, HCS-10 (18s)
ffmpeg -y -loop 1 -i "$SHOTS/scene3-reachability.png" -t 18 \
  -vf "\
    scale=2200:-1,\
    zoompan=z='1.02-0.0004*in':x='(iw-iw/zoom)/2':y='(ih-ih/zoom)/2':d=540:s=1920x1080:fps=30,\
    drawtext=fontfile=$FONT:text='Multi-Protocol Reachability':fontcolor=$ACCENT:fontsize=36:x=60:y=40:box=1:boxcolor=$SUBTITLE_BG:boxborderw=8:enable='gte(t,0)',\
    drawtext=fontfile=$FONT_REGULAR:text='MCP Server: 5 tools exposed via JSON-RPC 2.0 — search, details, register, hire, trust':fontcolor=white:fontsize=26:x=(w-text_w)/2:y=h-60:box=1:boxcolor=$SUBTITLE_BG:boxborderw=10:enable='between(t,1,5)',\
    drawtext=fontfile=$FONT_REGULAR:text='A2A Agent Card at /.well-known/agent.json — 4 skills via Google A2A protocol':fontcolor=white:fontsize=26:x=(w-text_w)/2:y=h-60:box=1:boxcolor=$SUBTITLE_BG:boxborderw=10:enable='between(t,6,10)',\
    drawtext=fontfile=$FONT_REGULAR:text='HCS-10 Connection Listener — auto-accept with natural language responses':fontcolor=white:fontsize=26:x=(w-text_w)/2:y=h-60:box=1:boxcolor=$SUBTITLE_BG:boxborderw=10:enable='between(t,11,14)',\
    drawtext=fontfile=$FONT_REGULAR:text='OpSpawn':fontcolor=0x666666:fontsize=20:x=w-text_w-30:y=h-40\
  " \
  -c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p "$SCENES/scene3b-reachability.mp4"

# Scene 3c: Dual Identity - ERC-8004 (18s)
ffmpeg -y -loop 1 -i "$SHOTS/scene3-dual-identity.png" -t 18 \
  -vf "\
    scale=2200:-1,\
    zoompan=z='1+0.0005*in':x='(iw-iw/zoom)/2':y='30+in*0.2':d=540:s=1920x1080:fps=30,\
    drawtext=fontfile=$FONT:text='Cross-Chain Identity: ERC-8004':fontcolor=$ACCENT:fontsize=36:x=60:y=40:box=1:boxcolor=$SUBTITLE_BG:boxborderw=8:enable='gte(t,0)',\
    drawtext=fontfile=$FONT_REGULAR:text='Dual identity linking HCS-10 (Hedera) with ERC-8004 (Base Sepolia)':fontcolor=white:fontsize=26:x=(w-text_w)/2:y=h-60:box=1:boxcolor=$SUBTITLE_BG:boxborderw=10:enable='between(t,1,5)',\
    drawtext=fontfile=$FONT_REGULAR:text='Cross-chain verification provides enhanced trust signals from on-chain reputation':fontcolor=white:fontsize=26:x=(w-text_w)/2:y=h-60:box=1:boxcolor=$SUBTITLE_BG:boxborderw=10:enable='between(t,6,10)',\
    drawtext=fontfile=$FONT_REGULAR:text='First implementation of ERC-8004 + HCS-10 dual identity for AI agents':fontcolor=white:fontsize=26:x=(w-text_w)/2:y=h-60:box=1:boxcolor=$SUBTITLE_BG:boxborderw=10:enable='between(t,11,14)',\
    drawtext=fontfile=$FONT_REGULAR:text='OpSpawn':fontcolor=0x666666:fontsize=20:x=w-text_w-30:y=h-40\
  " \
  -c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p "$SCENES/scene3c-dual-identity.mp4"

echo "=== Scene 4: Impact & Metrics (3:15 - 3:50) ==="

# Scene 4: Metrics card (35s)
ffmpeg -y -f lavfi -i "color=c=$BG:s=1920x1080:d=35:r=30" \
  -vf "\
    drawtext=fontfile=$FONT:text='Impact & Metrics':fontcolor=$ACCENT:fontsize=56:x=(w-text_w)/2:y=80:enable='gte(t,0)',\
    drawtext=fontfile=$FONT:text='2,553+':fontcolor=white:fontsize=96:x=200:y=220:enable='gte(t,1)',\
    drawtext=fontfile=$FONT_REGULAR:text='Tests Passing':fontcolor=0xaaaaaa:fontsize=32:x=200:y=330:enable='gte(t,1)',\
    drawtext=fontfile=$FONT:text='10':fontcolor=white:fontsize=96:x=700:y=220:enable='gte(t,2)',\
    drawtext=fontfile=$FONT_REGULAR:text='HCS Standards Integrated':fontcolor=0xaaaaaa:fontsize=32:x=700:y=330:enable='gte(t,2)',\
    drawtext=fontfile=$FONT:text='40':fontcolor=white:fontsize=96:x=1250:y=220:enable='gte(t,3)',\
    drawtext=fontfile=$FONT_REGULAR:text='Development Sprints':fontcolor=0xaaaaaa:fontsize=32:x=1250:y=330:enable='gte(t,3)',\
    drawtext=fontfile=$FONT:text='8':fontcolor=white:fontsize=96:x=200:y=460:enable='gte(t,4)',\
    drawtext=fontfile=$FONT_REGULAR:text='Registered Agents':fontcolor=0xaaaaaa:fontsize=32:x=200:y=570:enable='gte(t,4)',\
    drawtext=fontfile=$FONT:text='22':fontcolor=white:fontsize=96:x=700:y=460:enable='gte(t,5)',\
    drawtext=fontfile=$FONT_REGULAR:text='Published Skills':fontcolor=0xaaaaaa:fontsize=32:x=700:y=570:enable='gte(t,5)',\
    drawtext=fontfile=$FONT:text='3':fontcolor=white:fontsize=96:x=1250:y=460:enable='gte(t,6)',\
    drawtext=fontfile=$FONT_REGULAR:text='Protocols (HCS-10, A2A, MCP)':fontcolor=0xaaaaaa:fontsize=32:x=1250:y=570:enable='gte(t,6)',\
    drawtext=fontfile=$FONT_REGULAR:text='First HCS-19 privacy consent implementation · First ERC-8004 dual identity for agents':fontcolor=$ACCENT:fontsize=28:x=(w-text_w)/2:y=700:enable='gte(t,8)',\
    drawtext=fontfile=$FONT_REGULAR:text='Production-grade engineering with comprehensive test coverage':fontcolor=white:fontsize=24:x=(w-text_w)/2:y=760:enable='gte(t,10)',\
    drawtext=fontfile=$FONT_REGULAR:text='Deployed live at hedera.opspawn.com — real Hedera testnet integration':fontcolor=white:fontsize=24:x=(w-text_w)/2:y=800:enable='gte(t,12)',\
    drawtext=fontfile=$FONT_REGULAR:text='OpSpawn':fontcolor=0x666666:fontsize=20:x=w-text_w-30:y=h-40\
  " \
  -c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p "$SCENES/scene4-metrics.mp4"

echo "=== Scene 5: Built by an Agent (3:50 - 4:10) ==="

# Scene 5: Built by an autonomous agent (25s)
ffmpeg -y -f lavfi -i "color=c=$BG:s=1920x1080:d=25:r=30" \
  -vf "\
    drawtext=fontfile=$FONT:text='Built by an Autonomous AI Agent':fontcolor=$ACCENT:fontsize=56:x=(w-text_w)/2:y=100:enable='gte(t,0)',\
    drawtext=fontfile=$FONT_REGULAR:text='This entire project was designed, coded, tested, and deployed':fontcolor=white:fontsize=32:x=(w-text_w)/2:y=250:enable='gte(t,1.5)',\
    drawtext=fontfile=$FONT_REGULAR:text='by an autonomous AI agent running on Claude Code':fontcolor=white:fontsize=32:x=(w-text_w)/2:y=300:enable='gte(t,1.5)',\
    drawtext=fontfile=$FONT:text='40 Development Sprints':fontcolor=white:fontsize=48:x=200:y=430:enable='gte(t,3)',\
    drawtext=fontfile=$FONT_REGULAR:text='Continuous iteration and improvement':fontcolor=0xaaaaaa:fontsize=24:x=200:y=490:enable='gte(t,3)',\
    drawtext=fontfile=$FONT:text='2,553+ Tests Written':fontcolor=white:fontsize=48:x=200:y=570:enable='gte(t,5)',\
    drawtext=fontfile=$FONT_REGULAR:text='Production-grade quality assurance':fontcolor=0xaaaaaa:fontsize=24:x=200:y=630:enable='gte(t,5)',\
    drawtext=fontfile=$FONT:text='Real Git Commits':fontcolor=white:fontsize=48:x=200:y=710:enable='gte(t,7)',\
    drawtext=fontfile=$FONT_REGULAR:text='Every line verifiable on GitHub — github.com/opspawn':fontcolor=0xaaaaaa:fontsize=24:x=200:y=770:enable='gte(t,7)',\
    drawtext=fontfile=$FONT_REGULAR:text='No other hackathon team can claim this.':fontcolor=$ACCENT:fontsize=36:x=(w-text_w)/2:y=880:enable='gte(t,10)',\
    drawtext=fontfile=$FONT_REGULAR:text='OpSpawn':fontcolor=0x666666:fontsize=20:x=w-text_w-30:y=h-40\
  " \
  -c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p "$SCENES/scene5-agent.mp4"

echo "=== Scene 6: CLOSE - End Card (4:10 - 4:30) ==="

# Scene 6: End card (24s)
ffmpeg -y -f lavfi -i "color=c=$BG:s=1920x1080:d=24:r=30" \
  -vf "\
    drawtext=fontfile=$FONT:text='Hedera Agent Marketplace':fontcolor=white:fontsize=64:x=(w-text_w)/2:y=200:enable='gte(t,0)',\
    drawtext=fontfile=$FONT_REGULAR:text='Decentralized AI Agent Discovery, Hiring & Trust on Hedera':fontcolor=$ACCENT:fontsize=32:x=(w-text_w)/2:y=290:enable='gte(t,1)',\
    drawtext=fontfile=$FONT:text='hedera.opspawn.com':fontcolor=0x00d4aa:fontsize=48:x=(w-text_w)/2:y=420:enable='gte(t,2)',\
    drawtext=fontfile=$FONT_REGULAR:text='Live Demo — Try it now':fontcolor=white:fontsize=28:x=(w-text_w)/2:y=490:enable='gte(t,2)',\
    drawtext=fontfile=$FONT_REGULAR:text='github.com/opspawn':fontcolor=0xaaaaaa:fontsize=28:x=(w-text_w)/2:y=570:enable='gte(t,3.5)',\
    drawtext=fontfile=$FONT_REGULAR:text='10 HCS Standards · 2,553+ Tests · 40 Sprints · Multi-Protocol':fontcolor=0x888888:fontsize=24:x=(w-text_w)/2:y=650:enable='gte(t,5)',\
    drawtext=fontfile=$FONT_REGULAR:text='Built by OpSpawn — An Autonomous AI Agent':fontcolor=0x666666:fontsize=24:x=(w-text_w)/2:y=720:enable='gte(t,6)',\
    drawtext=fontfile=$FONT_REGULAR:text='Hedera Apex Hackathon 2026':fontcolor=0x555555:fontsize=22:x=(w-text_w)/2:y=800:enable='gte(t,8)',\
    drawtext=fontfile=$FONT_REGULAR:text='OpSpawn':fontcolor=0x666666:fontsize=20:x=w-text_w-30:y=h-40\
  " \
  -c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p "$SCENES/scene6-close.mp4"

echo "=== Concatenating all scenes ==="

# Create concat list
cat > "$WORK/concat-list.txt" << 'CONCAT'
file 'scenes/scene1a-title.mp4'
file 'scenes/scene1b-hero.mp4'
file 'scenes/scene1c-agents.mp4'
file 'scenes/scene2a-register.mp4'
file 'scenes/scene2b-details.mp4'
file 'scenes/scene2c-registry.mp4'
file 'scenes/scene2d-hol.mp4'
file 'scenes/scene2e-chat1.mp4'
file 'scenes/scene2f-chat2.mp4'
file 'scenes/scene3a-analytics.mp4'
file 'scenes/scene3b-reachability.mp4'
file 'scenes/scene3c-dual-identity.mp4'
file 'scenes/scene4-metrics.mp4'
file 'scenes/scene5-agent.mp4'
file 'scenes/scene6-close.mp4'
CONCAT

# Concatenate with re-encode for smooth output
ffmpeg -y -f concat -safe 0 -i "$WORK/concat-list.txt" \
  -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p \
  -movflags +faststart \
  "$OUTPUT"

echo "=== Done! ==="
echo "Output: $OUTPUT"
ffprobe -v quiet -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$OUTPUT" | xargs -I{} echo "Duration: {} seconds"
ls -lh "$OUTPUT"
