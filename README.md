# SwiftSift
an AI inbox assistant that sorts your email so you don't have to
# Problem
Checking emails everyday is repetitive and a burden as every message needs to be sorted out based of your judgement on whether you reply now, delete it, or ignore it before you even actually get to responding to important emails so this constant sorting leads to real time lost every day. And because clutter builds up quietly in the background, storage keeps increasing twoards the limit so you're eventuallly left with no choice but to clear out your email in one stretch. 

# What it does
SwiftSift is a chat style assistant that reads your inbox and sorts it into three categories:
Needs a reply — drafts a suggested response you can edit before sending
Likely junk — flags it for cleanup, with a one-click confirm to archive
FYI / newsletter — just shown, no action needed

*Nothing sends or deletes without your confirmation

# How it works
Frontend: HTML/CSS/JS, chat-style interface
Classification + drafting: Claude API
Inbox access: Gmail API (OAuth)

# Status
This demo runs on sample inbox data to show the full interaction flow end-to-end. Live Gmail connection requires Google OAuth setup and a backend to securely hold the Anthropic API key (in progress).
