# GitHub Setup Guide

## ✅ Your API Keys Are Protected

Your `.env` file is already in `.gitignore`, so your API keys will **NOT** be committed to GitHub.

## Steps to Push to GitHub

### 1. Initialize Git Repository (if not already done)

```bash
git init
```

### 2. Verify .env is Ignored

Check that `.env` is in `.gitignore` (it already is!):
```bash
git status
```

You should **NOT** see `.env` in the list of files to be committed.

### 3. Add Files to Git

```bash
git add .
```

This will add all files EXCEPT those in `.gitignore` (including your `.env` file with API keys).

### 4. Make Your First Commit

```bash
git commit -m "Initial commit: Media streaming server with user auth, favorites, and Cinetaro integration"
```

### 5. Create a Repository on GitHub

1. Go to https://github.com/new
2. Create a new repository (don't initialize with README, .gitignore, or license)
3. Copy the repository URL

### 6. Connect and Push

```bash
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
git branch -M main
git push -u origin main
```

## ⚠️ Important Security Notes

1. **Never commit `.env`** - It's already in `.gitignore`, so you're safe
2. **Use `.env.example`** - This file (without real keys) is safe to commit
3. **If you accidentally committed `.env`**:
   ```bash
   git rm --cached .env
   git commit -m "Remove .env from tracking"
   git push
   ```
   Then change your API keys immediately on TMDB website!

4. **For collaborators**: They should:
   - Copy `.env.example` to `.env`
   - Add their own API keys to `.env`
   - Never commit their `.env` file

## What Gets Committed

✅ **Safe to commit:**
- All source code
- `.env.example` (template without real keys)
- `package.json`
- Documentation
- `.gitignore`

❌ **Never committed (protected by .gitignore):**
- `.env` (your real API keys)
- `node_modules/`
- Media files (videos, audio)
- Cache files
- Log files

## Verify Before Pushing

Double-check your API keys are safe:

```bash
# This should show NO .env file
git ls-files | Select-String "\.env$"

# Check what will be committed
git status
```

If `.env` appears, **DO NOT PUSH**. Remove it from tracking first (see commands above).
