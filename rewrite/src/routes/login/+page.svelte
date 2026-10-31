<script lang="ts">
 let password=''; let error='';
 async function submit(event:SubmitEvent) {event.preventDefault(); const response=await fetch('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password})}); if(response.ok) location.href='/'; else error='Login failed. Check your password or try again later.';}
</script>
<h1>Administrator login</h1>
<form onsubmit={submit}><label>Password <input type="password" bind:value={password} autocomplete="current-password" required /></label><button>Log in</button></form>
{#if error}<p role="alert">{error}</p>{/if}
