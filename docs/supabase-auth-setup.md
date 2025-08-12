# Supabase Authentication Setup Guide for ChatOllama

This guide walks you through configuring Supabase Auth for ChatOllama, enabling multiple OAuth providers (Google, GitHub, Facebook, etc.) with a unified authentication system.

## Table of Contents
- [Why Supabase Auth?](#why-supabase-auth)
- [Prerequisites](#prerequisites)
- [Supabase Project Setup](#supabase-project-setup)
- [OAuth Provider Configuration](#oauth-provider-configuration)
- [Environment Configuration](#environment-configuration)
- [Database Integration](#database-integration)
- [Testing the Setup](#testing-the-setup)
- [Adding More Providers](#adding-more-providers)
- [Production Deployment](#production-deployment)
- [Troubleshooting](#troubleshooting)

## Why Supabase Auth?

**Supabase Auth Benefits:**
- ✅ **Multi-provider OAuth** - Google, GitHub, Facebook, Discord, Twitter with minimal config
- ✅ **Built-in security** - JWT tokens, session management, email verification
- ✅ **User management** - Automatic user profiles, metadata, linking accounts
- ✅ **Email/password auth** - With verification, password reset, magic links
- ✅ **Real-time updates** - Auth state changes reflected instantly
- ✅ **Row Level Security** - Database-level access control
- ✅ **Webhooks** - React to auth events (user.created, user.updated)

**vs Custom Implementation:**
- **Less code** - Replace 500+ lines of custom OAuth with 20 lines
- **More providers** - Add new providers in minutes, not hours
- **Better security** - Enterprise-grade security out of the box
- **Easier maintenance** - No need to manage OAuth flows manually

## Prerequisites

- ChatOllama application
- Supabase account (free tier available)
- OAuth provider accounts (Google, GitHub, etc.)

## Supabase Project Setup

### Step 1: Create Supabase Project

1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Click **"New project"**
3. Choose your organization
4. Fill in project details:
   ```
   Name: ChatOllama
   Database Password: [secure password]
   Region: [closest to your users]
   ```
5. Click **"Create new project"**
6. Wait for project initialization (2-3 minutes)

### Step 2: Get Project Credentials

1. In your Supabase dashboard, go to **Settings** → **API**
2. Copy the following values:
   ```
   Project URL: https://owaojmzdhdbnsgawbars.supabase.co
   anon public key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im93YW9qbXpkaGRibnNnYXdiYXJzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ4NDE5ODgsImV4cCI6MjA3MDQxNzk4OH0.8TYFbSpVtGb7TUThuWSleQwVcs8cyAyvgOJKOFUVpV8
   ```

### Step 3: Configure Authentication Settings

1. Go to **Authentication** → **Settings**
2. Configure **Site URL**:
   ```
   Site URL: http://localhost:3000 (development)
   Site URL: https://yourdomain.com (production)
   ```
3. Add **Redirect URLs**:
   ```
   http://localhost:3000/auth/callback
   https://yourdomain.com/auth/callback
   ```
4. Configure **Email Settings** (optional):
   - Enable email confirmations
   - Customize email templates
   - Configure SMTP (or use Supabase's built-in service)

## OAuth Provider Configuration

### Google OAuth Setup

#### Step 1: Google Cloud Console
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create or select a project
3. Enable **Google+ API**
4. Go to **APIs & Services** → **Credentials**
5. Create **OAuth 2.0 Client ID**:
   ```
   Application type: Web application
   Name: ChatOllama
   
   Authorized JavaScript origins:
   - http://localhost:3000
   - https://yourdomain.com
   
   Authorized redirect URIs:
   - https://owaojmzdhdbnsgawbars.supabase.co/auth/v1/callback
   ```
6. Copy **Client ID** and **Client Secret**

#### Step 2: Configure in Supabase
1. In Supabase dashboard, go to **Authentication** → **Providers**
2. Find **Google** and click **Configure**
3. Enable Google provider
4. Enter your credentials:
   ```
   Client ID: your-google-client-id.apps.googleusercontent.com
   Client Secret: your-google-client-secret
   ```
5. Click **Save**

### GitHub OAuth Setup

#### Step 1: GitHub Settings
1. Go to GitHub **Settings** → **Developer settings** → **OAuth Apps**
2. Click **"New OAuth App"**
3. Fill in application details:
   ```
   Application name: ChatOllama
   Homepage URL: http://localhost:3000
   Authorization callback URL: https://your-project-ref.supabase.co/auth/v1/callback
   ```
4. Click **"Register application"**
5. Copy **Client ID** and generate **Client Secret**

#### Step 2: Configure in Supabase
1. In Supabase dashboard, go to **Authentication** → **Providers**
2. Find **GitHub** and click **Configure**
3. Enable GitHub provider
4. Enter your credentials:
   ```
   Client ID: your-github-client-id
   Client Secret: your-github-client-secret
   ```
5. Click **Save**

### Facebook OAuth Setup (Optional)

#### Step 1: Facebook Developers
1. Go to [Facebook Developers](https://developers.facebook.com/)
2. Create a new app
3. Add **Facebook Login** product
4. Configure **OAuth Redirect URIs**:
   ```
   https://your-project-ref.supabase.co/auth/v1/callback
   ```

#### Step 2: Configure in Supabase
1. Enable Facebook provider in Supabase
2. Enter App ID and App Secret
3. Configure scopes: `email`, `public_profile`

## Environment Configuration

### Step 1: Update .env File

```env
# Supabase Configuration
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Database (keep existing)
DATABASE_URL=file:../../chatollama.sqlite

# Server Configuration (keep existing)
PORT=3000
HOST=

# Feature Flags (keep existing)
KNOWLEDGE_BASE_ENABLED=true
REALTIME_CHAT_ENABLED=true
MODELS_MANAGEMENT_ENABLED=true
INSTRUCTIONS_ENABLED=true
MCP_ENABLED=true
```

### Step 2: Restart Application

```bash
npm run dev
```

## Database Integration

### Option 1: Keep Existing Prisma Database (Recommended)

The current implementation keeps your existing Prisma database and syncs users between Supabase Auth and your local database.

**Benefits:**
- Keep existing user data and relationships
- Maintain compatibility with current codebase
- Use Supabase only for authentication, not data storage

### Option 2: Migrate to Supabase Database (Advanced)

For new projects or if you want full Supabase integration:

```sql
-- Create profiles table in Supabase
create table profiles (
  id uuid references auth.users on delete cascade not null primary key,
  name text,
  avatar_url text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Set up Row Level Security
alter table profiles enable row level security;

create policy "Public profiles are viewable by everyone." on profiles
  for select using (true);

create policy "Users can insert their own profile." on profiles
  for insert with check (auth.uid() = id);

create policy "Users can update own profile." on profiles
  for update using (auth.uid() = id);
```

## Testing the Setup

### Step 1: Start Application

```bash
npm run dev
```

### Step 2: Test Authentication Flow

1. **Navigate to signup**: `http://localhost:3000/auth/signup`
2. **Test email/password signup**:
   - Enter email and password
   - Check email for verification link (if enabled)
   - Verify account and sign in

3. **Test OAuth providers**:
   - Click "Sign up with Google"
   - Should redirect to Google OAuth
   - After authorization, redirect back to app
   - User should be signed in automatically

4. **Test GitHub OAuth**:
   - Click "Sign up with GitHub"
   - Authorize with GitHub
   - Should create account and sign in

### Step 3: Verify User Data

Check Supabase dashboard:
1. Go to **Authentication** → **Users**
2. Should see created users with provider information
3. Check user metadata and linked identities

### Step 4: Test Session Management

1. **Refresh page** - Should stay logged in
2. **Open new tab** - Should be authenticated
3. **Sign out** - Should clear session everywhere

## Adding More Providers

Supabase supports many OAuth providers. Here's how to add more:

### Discord

1. **Discord Developer Portal**:
   ```
   Redirect URI: https://your-project-ref.supabase.co/auth/v1/callback
   ```

2. **Supabase Configuration**:
   - Enable Discord provider
   - Add Client ID and Client Secret

3. **Frontend Integration**:
   ```typescript
   await supabase.auth.signInWithOAuth({
     provider: 'discord'
   })
   ```

### Twitter/X

1. **Twitter Developer Portal**:
   - Create Twitter app
   - Configure callback URL

2. **Supabase Configuration**:
   - Enable Twitter provider
   - Add API Key and Secret

### Apple

1. **Apple Developer Account**:
   - Create Sign in with Apple service
   - Configure domains and redirect URLs

2. **Supabase Configuration**:
   - Enable Apple provider
   - Add Service ID and private key

### Adding Custom Provider Button

Update the auth pages to include new providers:

```vue
<UButton
  @click="signInWithProvider('discord')"
  size="lg"
  variant="outline"
  class="w-full justify-center"
>
  <template #leading>
    <!-- Discord icon -->
    <svg class="w-5 h-5" viewBox="0 0 24 24">
      <!-- Discord SVG path -->
    </svg>
  </template>
  Continue with Discord
</UButton>
```

## Production Deployment

### Step 1: Update Supabase Settings

1. **Site URL**: Update to production domain
2. **Redirect URLs**: Add production callback URLs
3. **CORS Origins**: Configure allowed origins

### Step 2: Update OAuth Providers

Update all OAuth provider configurations:

**Google:**
```
Authorized JavaScript origins: https://yourdomain.com
Authorized redirect URIs: https://your-project-ref.supabase.co/auth/v1/callback
```

**GitHub:**
```
Homepage URL: https://yourdomain.com
Authorization callback URL: https://your-project-ref.supabase.co/auth/v1/callback
```

### Step 3: Environment Variables

```env
# Production environment
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_ANON_KEY=your-production-anon-key
NODE_ENV=production
```

### Step 4: Security Considerations

1. **Rate Limiting**: Configure in Supabase dashboard
2. **Email Templates**: Customize for production
3. **CORS**: Restrict to your domains only
4. **RLS Policies**: Review Row Level Security rules

## Troubleshooting

### Common Issues

#### ❌ "Invalid login credentials" Error

**Causes:**
- Wrong email/password combination
- Email not verified (if verification enabled)
- Account doesn't exist

**Solutions:**
```javascript
// Check if email verification is required
const { data, error } = await supabase.auth.signUp({
  email: 'user@example.com',
  password: 'password'
})

if (data.user && !data.session) {
  // Email verification required
  console.log('Check email for verification link')
}
```

#### ❌ OAuth Redirect Mismatch

**Problem**: Redirect URL doesn't match configured URLs

**Solution:**
1. Check OAuth provider settings
2. Ensure redirect URL is exactly: `https://your-project-ref.supabase.co/auth/v1/callback`
3. No trailing slashes or extra parameters

#### ❌ "User already registered" Error

**Problem**: Trying to sign up with existing email

**Solutions:**
```javascript
// Handle existing user
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'existing@example.com',
  password: 'password'
})

if (error?.message.includes('Invalid login credentials')) {
  // User exists but wrong password
  // Redirect to password reset
}
```

#### ❌ CORS Errors

**Problem**: Frontend making requests from unauthorized origin

**Solution:**
1. Add your domain to Supabase **Settings** → **API** → **CORS Origins**
2. For development: `http://localhost:3000`
3. For production: `https://yourdomain.com`

### Debug Mode

Enable debug logging:

```javascript
// In nuxt.config.ts
export default defineNuxtConfig({
  runtimeConfig: {
    public: {
      supabase: {
        url: process.env.SUPABASE_URL,
        key: process.env.SUPABASE_ANON_KEY,
      }
    }
  },
  
  // Enable debug logging
  supabase: {
    debug: process.env.NODE_ENV === 'development'
  }
})
```

### User Data Sync Issues

If using dual database approach (Supabase + Prisma):

```javascript
// Sync user data between systems
supabase.auth.onAuthStateChange(async (event, session) => {
  if (event === 'SIGNED_IN' && session?.user) {
    // Sync user to local database
    await $fetch('/api/auth/sync-user', {
      method: 'POST',
      body: {
        supabaseUser: session.user
      }
    })
  }
})
```

## Advanced Features

### Row Level Security

Protect data at the database level:

```sql
-- Only users can see their own data
create policy "Users can view own records" on your_table
  for select using (auth.uid() = user_id);

-- Users can only modify their own records
create policy "Users can modify own records" on your_table
  for all using (auth.uid() = user_id);
```

### Custom Claims

Add custom user roles and permissions:

```javascript
// In Supabase Edge Functions
const adminUsers = ['admin@example.com']
const claims = {
  role: adminUsers.includes(user.email) ? 'admin' : 'user',
  subscription: 'premium'
}

const { data, error } = await supabase.auth.admin.updateUserById(
  user.id,
  { user_metadata: claims }
)
```

### Webhooks

React to auth events:

```javascript
// Listen for user creation
export async function handleUserCreated(user) {
  // Send welcome email
  // Create user profile
  // Initialize user data
}
```

### Magic Links

Password-less authentication:

```javascript
const { data, error } = await supabase.auth.signInWithOtp({
  email: 'user@example.com',
  options: {
    emailRedirectTo: 'https://yourdomain.com/auth/callback'
  }
})
```

## Migration Guide

### From Custom OAuth to Supabase

1. **Backup existing users**:
   ```sql
   SELECT * FROM users;
   ```

2. **Export user data**:
   ```javascript
   // Export script to migrate users
   const users = await prisma.user.findMany()
   for (const user of users) {
     await supabase.auth.admin.createUser({
       email: user.email,
       password: generateTempPassword(),
       email_confirm: true,
       user_metadata: {
         name: user.name,
         migrated: true
       }
     })
   }
   ```

3. **Update application code**:
   - Replace custom auth with Supabase SDK
   - Update middleware and route protection
   - Migrate user sessions

4. **Test thoroughly**:
   - All auth flows work
   - User data preserved
   - Existing sessions handled

## Support Resources

- **Supabase Documentation**: https://supabase.com/docs/guides/auth
- **Supabase Discord**: https://discord.supabase.com
- **OAuth Provider Docs**:
  - [Google OAuth 2.0](https://developers.google.com/identity/protocols/oauth2)
  - [GitHub OAuth Apps](https://docs.github.com/en/developers/apps/building-oauth-apps)
  - [Facebook Login](https://developers.facebook.com/docs/facebook-login/)

---

**Security Note**: Always use HTTPS in production and regularly rotate API keys. Never expose service role keys in client-side code.