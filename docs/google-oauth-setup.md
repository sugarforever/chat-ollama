# Google OAuth Configuration Guide for ChatOllama

This guide walks you through setting up Google OAuth authentication for ChatOllama, allowing users to sign in with their Google accounts.

## Table of Contents
- [Prerequisites](#prerequisites)
- [Google Cloud Console Setup](#google-cloud-console-setup)
- [Environment Configuration](#environment-configuration)
- [Testing the Setup](#testing-the-setup)
- [Troubleshooting](#troubleshooting)
- [Production Deployment](#production-deployment)

## Prerequisites

- ChatOllama application running locally or deployed
- Google account with access to Google Cloud Console
- Basic understanding of OAuth 2.0 flow

## Google Cloud Console Setup

### Step 1: Create or Select a Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Sign in with your Google account
3. Either:
   - **Create new project**: Click "Select a project" → "New Project" → Enter project name → "Create"
   - **Use existing project**: Click "Select a project" → Choose your project

### Step 2: Enable Google+ API (if not already enabled)

1. In the left sidebar, go to **APIs & Services** → **Library**
2. Search for "Google+ API" or "Google Identity"
3. Click on "Google+ API" → Click **"Enable"**

> **Note**: Google+ API is deprecated but still required for basic profile access. For new implementations, consider using "Google Identity Services" API.

### Step 3: Configure OAuth Consent Screen

1. Go to **APIs & Services** → **OAuth consent screen**
2. Choose **"External"** user type (unless you have a Google Workspace account)
3. Fill in the required information:

   **App Information:**
   ```
   App name: ChatOllama
   User support email: your-email@example.com
   Developer contact email: your-email@example.com
   ```

   **App Domain (Optional but recommended):**
   ```
   Application home page: https://yourdomain.com
   Application privacy policy: https://yourdomain.com/privacy
   Application terms of service: https://yourdomain.com/terms
   ```

   **Authorized Domains:**
   ```
   localhost (for development)
   yourdomain.com (for production)
   ```

4. **Scopes**: Add the following scopes:
   - `../auth/userinfo.email`
   - `../auth/userinfo.profile`
   - `openid`

5. **Test Users** (for development):
   - Add your email and any other test accounts
   - These users can access your app during development

6. Click **"Save and Continue"** through all steps

### Step 4: Create OAuth 2.0 Credentials

1. Go to **APIs & Services** → **Credentials**
2. Click **"Create Credentials"** → **"OAuth 2.0 Client IDs"**
3. Choose **"Web application"** as application type
4. Configure the client:

   **Name:** `ChatOllama OAuth Client`

   **Authorized JavaScript origins:**
   ```
   http://localhost:3000              (for development)
   https://yourdomain.com            (for production)
   ```

   **Authorized redirect URIs:**
   ```
   http://localhost:3000/api/auth/google/callback    (for development)
   https://yourdomain.com/api/auth/google/callback   (for production)
   ```

5. Click **"Create"**
6. **Important**: Copy the Client ID and Client Secret - you'll need these for environment variables

## Environment Configuration

### Step 1: Update Environment Variables

Add the following variables to your `.env` file:

```env
# Google OAuth Configuration
AUTH_SECRET=your-long-random-secret-key-here-change-this-in-production
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Optional: Custom base URL (defaults to http://localhost:3000)
APP_BASE_URL=http://localhost:3000
```

### Step 2: Generate AUTH_SECRET

Generate a secure random string for `AUTH_SECRET`:

**Using Node.js:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Using OpenSSL:**
```bash
openssl rand -hex 32
```

**Using online generator:**
- Visit https://generate-secret.vercel.app/32
- Copy the generated string

### Step 3: Environment File Example

Your complete `.env` file should look like:

```env
# Database
DATABASE_URL=file:../../chatollama.sqlite

# Authentication
SECRET=changeit
AUTH_SECRET=a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456

# Google OAuth
GOOGLE_CLIENT_ID=123456789012-abcdefghijklmnopqrstuvwxyz123456.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-1234567890123456789012345678901234

# Server Configuration
PORT=3000
HOST=

# Other existing configurations...
KNOWLEDGE_BASE_ENABLED=true
REALTIME_CHAT_ENABLED=true
MODELS_MANAGEMENT_ENABLED=true
INSTRUCTIONS_ENABLED=true
MCP_ENABLED=true
```

## Testing the Setup

### Step 1: Start the Application

```bash
npm run dev
```

### Step 2: Test Google OAuth Flow

1. **Navigate to signup page**: `http://localhost:3000/signup`
2. **Click "Sign up with Google"** button
3. **Expected behavior**:
   - Redirects to Google OAuth consent screen
   - Shows your app name and requested permissions
   - After clicking "Continue", redirects back to your app
   - User is automatically logged in and redirected to dashboard

### Step 3: Verify Database

Check that the user was created in your database:

```sql
SELECT id, name, email, provider, provider_id, avatar, created_at 
FROM User 
WHERE provider = 'google';
```

You should see:
- `provider`: `'google'`
- `provider_id`: Google user ID
- `email`: User's Google email
- `avatar`: Google profile picture URL
- `password`: Should be NULL

### Step 4: Test Mixed Authentication

1. **Create a local account** with same email as Google account
2. **Try to sign up with Google** → Should link to existing account
3. **Try password login** with Google account → Should show helpful error message

## Troubleshooting

### Common Issues and Solutions

#### ❌ "Google OAuth is not configured" Error

**Problem**: Missing or invalid environment variables

**Solution**:
```bash
# Check your .env file has these variables set:
echo $GOOGLE_CLIENT_ID
echo $GOOGLE_CLIENT_SECRET
echo $AUTH_SECRET

# Restart your development server after adding variables
```

#### ❌ "redirect_uri_mismatch" Error

**Problem**: Redirect URI in Google Console doesn't match your app

**Solution**:
1. Check Google Console → Credentials → Your OAuth Client
2. Ensure redirect URI exactly matches: `http://localhost:3000/api/auth/google/callback`
3. No trailing slashes, correct protocol (http for dev, https for prod)

#### ❌ "Access blocked" Error

**Problem**: Your app is not verified by Google

**Solutions**:
1. **For development**: Add your email to "Test users" in OAuth consent screen
2. **For production**: Submit your app for verification (required for 100+ users)

#### ❌ "Invalid client ID" Error

**Problem**: Wrong client ID or client secret

**Solution**:
1. Double-check your Client ID in Google Console
2. Ensure no extra spaces in `.env` file
3. Client ID should end with `.apps.googleusercontent.com`

#### ❌ Users can't sign up/login

**Problem**: OAuth consent screen not properly configured

**Solution**:
1. Ensure OAuth consent screen is published (not in draft)
2. Add required scopes: `userinfo.email`, `userinfo.profile`
3. For external apps, add test users during development

### Debug Mode

Enable debug logging by adding to your `.env`:

```env
DEBUG=true
NODE_ENV=development
```

This will show detailed OAuth flow information in your server console.

## Production Deployment

### Step 1: Update Google Console for Production

1. **Add production domains** to OAuth consent screen:
   ```
   Authorized domains: yourdomain.com
   ```

2. **Update OAuth client redirect URIs**:
   ```
   https://yourdomain.com/api/auth/google/callback
   ```

3. **Add production JavaScript origins**:
   ```
   https://yourdomain.com
   ```

### Step 2: Production Environment Variables

```env
# Production .env
AUTH_SECRET=your-production-secret-64-chars-minimum
GOOGLE_CLIENT_ID=your-production-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-production-client-secret
APP_BASE_URL=https://yourdomain.com
NODE_ENV=production
```

### Step 3: Security Considerations

1. **Domain Verification**: Google may require domain verification for production
2. **App Verification**: Apps with 100+ users need Google verification
3. **HTTPS Required**: OAuth only works with HTTPS in production
4. **Environment Security**: Never commit `.env` files to version control
5. **Secret Rotation**: Rotate OAuth secrets periodically

### Step 4: Monitoring

Monitor OAuth authentication in production:

```javascript
// Add to your logging system
console.log('OAuth login attempt:', {
  provider: 'google',
  email: user.email,
  timestamp: new Date(),
  success: true/false
})
```

## Advanced Configuration

### Custom Scopes

To request additional permissions, modify the scope in `server/api/auth/google/login.post.ts`:

```typescript
const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: [
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/calendar.readonly', // Additional scope
  ],
  prompt: 'consent'
})
```

### Custom Callback URL

To use a different callback URL pattern, update:

1. **Google Console**: Add new redirect URI
2. **OAuth client configuration** in `login.post.ts`:
   ```typescript
   const oauth2Client = new google.auth.OAuth2(
     clientId,
     clientSecret,
     'https://yourdomain.com/auth/google/callback' // Custom callback
   )
   ```

### Refresh Token Handling

For long-lived access to Google APIs, implement refresh token storage:

```typescript
// In callback handler
if (tokens.refresh_token) {
  await prisma.account.update({
    where: { provider_providerAccountId: { provider: 'google', providerAccountId: googleUser.id } },
    data: { refresh_token: tokens.refresh_token }
  })
}
```

## Support

For additional help:

1. **Google OAuth Documentation**: https://developers.google.com/identity/protocols/oauth2
2. **Google Cloud Console Support**: https://cloud.google.com/support
3. **ChatOllama Issues**: https://github.com/your-repo/chat-ollama/issues

---

**Security Note**: Always use HTTPS in production and keep your OAuth credentials secure. Never expose client secrets in client-side code.
